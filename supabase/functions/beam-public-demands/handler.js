const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function receivePublic(req, persist) {
  const origin = req.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const reply = (status, value) =>
    new Response(JSON.stringify(value), { status, headers });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST")
    return reply(405, { error: "Méthode non autorisée." });
  if (!origin.startsWith("https://"))
    return reply(403, { error: "Portail indisponible." });
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "Demande vide." });
    let bytes = 0,
      chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 20000) {
        await reader.cancel();
        return reply(413, { error: "Demande trop longue." });
      }
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    const b = JSON.parse(new TextDecoder().decode(all));
    if (
      !uuid.test(b.portal) ||
      !uuid.test(b.request) ||
      typeof b.title !== "string" ||
      b.title.trim().length < 1 ||
      b.title.length > 140 ||
      typeof b.description !== "string" ||
      b.description.length > 5000
    )
      return reply(400, {
        error: "Vérifiez le titre et le contexte de votre demande.",
      });
    if (b.website) return reply(200, { received: true });
    await persist({ ...b, origin }, req);
    return reply(200, { received: true });
  } catch (e) {
    return reply(e?.message?.includes("RATE_LIMIT") ? 429 : 503, {
      error: e?.message?.includes("RATE_LIMIT")
        ? "Trop de demandes. Réessayez dans quelques minutes."
        : "L’envoi est indisponible. Votre texte est conservé ; réessayez plus tard.",
    });
  }
}
