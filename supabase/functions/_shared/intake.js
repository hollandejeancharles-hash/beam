// Shared by the deployed receivers and the Node tests. No credentials in payloads.
export async function verifySlack(raw, headers, secret, now = Date.now()) {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (
    !secret ||
    !/^\d+$/.test(timestamp || "") ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !/^v0=[a-f0-9]{64}$/.test(signature || "")
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(3).match(/../g), (x) =>
    parseInt(x, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(`v0:${timestamp}:${raw}`),
  );
}
export function slackEvent(body) {
  const e = body.event;
  if (
    body.type !== "event_callback" ||
    e?.type !== "app_mention" ||
    e.bot_id ||
    e.subtype ||
    !body.team_id ||
    !body.event_id ||
    !e.channel ||
    !e.ts
  )
    return null;
  const quote = String(e.text || "").trim();
  if (!quote || quote.length > 5000) throw Error("Message trop long ou vide");
  return {
    external: body.team_id,
    channel: e.channel,
    event: body.event_id,
    quote,
    title:
      quote
        .replace(/<@[^>]+>/g, "")
        .trim()
        .slice(0, 140) || "Demande Slack",
    author: String(e.user || ""),
    url: `https://slack.com/app_redirect?team=${encodeURIComponent(body.team_id)}&channel=${encodeURIComponent(e.channel)}`,
    url_kind: "channel",
    message_ts: e.ts,
    thread: String(e.thread_ts || e.ts),
  };
}
export function teamsEvent(body) {
  if (
    body.channelId !== "msteams" ||
    body.type !== "message" ||
    !body.id ||
    !body.channelData?.tenant?.id
  )
    return null;
  const mention = (body.entities || []).find(
    (e) => e.type === "mention" && e.mentioned?.id === body.recipient?.id,
  );
  // Channel/group messages require an explicit bot mention. Personal chats are excluded.
  if (!mention || body.conversation?.conversationType === "personal")
    return null;
  const quote = String(body.text || "")
    .replace(/<at>[^<]*<\/at>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  if (!quote || quote.length > 5000) throw Error("Message trop long ou vide");
  const channel = body.channelData?.channel?.id || body.conversation?.id;
  if (!channel) return null;
  const root = body.replyToId || body.id;
  return {
    external: body.channelData.tenant.id,
    channel,
    event: `${channel}:${body.id}`,
    quote,
    title: quote.slice(0, 140),
    author: String(body.from?.name || body.from?.id || ""),
    thread: root,
    url: `https://teams.microsoft.com/l/message/${encodeURIComponent(channel)}/${encodeURIComponent(root)}?tenantId=${encodeURIComponent(body.channelData.tenant.id)}`,
  };
}
export async function receive(req, { provider, authenticate, persist }) {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    // Bound actual body bytes, including requests without Content-Length.
    const reader = req.body?.getReader();
    let size = 0;
    const chunks = [];
    if (!reader) return new Response("Missing body", { status: 400 });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        return new Response("Too large", { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const raw = new TextDecoder().decode(bytes);
    // Slack authenticates the original bytes before parsing any event.
    if (provider === "slack" && !(await authenticate(raw, req.headers)))
      return new Response("Unauthorized", { status: 401 });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (provider === "teams" && !(await authenticate(body, req.headers)))
      return new Response("Unauthorized", { status: 401 });
    if (provider === "slack" && body.type === "url_verification")
      return Response.json({ challenge: body.challenge });
    const event = provider === "slack" ? slackEvent(body) : teamsEvent(body);
    if (event) await persist(provider, event);
    // No external replies. Acknowledge only after durable, idempotent storage.
    return Response.json({ ok: true });
  } catch {
    return new Response("Delivery failed; retry", { status: 503 });
  }
}
