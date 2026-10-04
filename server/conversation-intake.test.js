import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifySlack,
  slackEvent,
  teamsEvent,
  receive,
} from "../supabase/functions/_shared/intake.js";
const sample = {
  type: "event_callback",
  team_id: "T1",
  event_id: "Ev1",
  event: {
    type: "app_mention",
    user: "U1",
    channel: "C1",
    ts: "123.456",
    text: "<@B1> Exporter les PDF",
  },
};
const signed = (raw, ts = "1700000000") =>
  new Headers({
    "x-slack-request-timestamp": ts,
    "x-slack-signature":
      "v0=" +
      createHmac("sha256", "secret").update(`v0:${ts}:${raw}`).digest("hex"),
  });
test("Slack verifies original bytes, freshness and secret", async () => {
  const raw = JSON.stringify(sample),
    headers = signed(raw);
  assert.equal(await verifySlack(raw, headers, "secret", 1700000000000), true);
  assert.equal(
    await verifySlack(raw + " ", headers, "secret", 1700000000000),
    false,
  );
  assert.equal(await verifySlack(raw, headers, "wrong", 1700000000000), false);
  assert.equal(await verifySlack(raw, headers, "secret", 1700000400000), false);
  assert.equal(
    await verifySlack(raw, headers, undefined, 1700000000000),
    false,
  );
});
test("Slack captures only explicit mentions, with stable event identity and source", () => {
  assert.equal(slackEvent(sample).event, "Ev1");
  assert.match(slackEvent(sample).url, /team=T1&channel=C1$/);
  assert.equal(
    slackEvent({ ...sample, event: { ...sample.event, type: "message" } }),
    null,
  );
  assert.equal(
    slackEvent({ ...sample, event: { ...sample.event, bot_id: "B2" } }),
    null,
  );
});
const teams = {
  type: "message",
  channelId: "msteams",
  id: "M1",
  recipient: { id: "B1" },
  conversation: { conversationType: "channel" },
  channelData: { tenant: { id: "T1" }, channel: { id: "C1" } },
  entities: [{ type: "mention", mentioned: { id: "B1" } }],
  text: "<at>Beam</at> Ajouter un export",
  from: { name: "JC" },
};
test("Teams excludes unrelated messages and private chats", () => {
  assert.equal(teamsEvent(teams).quote, "Ajouter un export");
  assert.equal(teamsEvent({ ...teams, entities: [] }), null);
  assert.equal(
    teamsEvent({ ...teams, conversation: { conversationType: "personal" } }),
    null,
  );
  assert.equal(teamsEvent({ ...teams, channelId: "emulator" }), null);
  assert.equal(
    teamsEvent({
      ...teams,
      channelData: { tenant: { id: "T2" }, channel: { id: "C1" } },
    }).external,
    "T2",
  );
});
test("Receiver refuses invalid authentication before storage", async () => {
  let writes = 0;
  for (const provider of ["slack", "teams"]) {
    const r = await receive(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify(provider === "slack" ? sample : teams),
      }),
      {
        provider,
        authenticate: async () => false,
        persist: async () => writes++,
      },
    );
    assert.equal(r.status, 401);
  }
  assert.equal(writes, 0);
});
test("Slack challenge requires authentication and does not create a demand", async () => {
  let writes = 0;
  const r = await receive(
    new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify({ type: "url_verification", challenge: "abc" }),
    }),
    {
      provider: "slack",
      authenticate: async () => true,
      persist: async () => writes++,
    },
  );
  assert.deepEqual(await r.json(), { challenge: "abc" });
  assert.equal(writes, 0);
});
test("A failed durable write is retryable and never acknowledged as received", async () => {
  const r = await receive(
    new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify(sample),
    }),
    {
      provider: "slack",
      authenticate: async () => true,
      persist: async () => {
        throw Error("offline");
      },
    },
  );
  assert.equal(r.status, 503);
});
test("Actual body length is bounded without trusting Content-Length", async () => {
  const r = await receive(
    new Request("https://example.com", {
      method: "POST",
      body: "x".repeat(65537),
    }),
    {
      provider: "slack",
      authenticate: async () => true,
      persist: async () => {
        assert.fail();
      },
    },
  );
  assert.equal(r.status, 413);
});
test("Authenticated mentions persist provider and workspace routing identifiers", async () => {
  let captured;
  const r = await receive(
    new Request("https://example.com", {
      method: "POST",
      body: JSON.stringify(teams),
    }),
    {
      provider: "teams",
      authenticate: async () => true,
      persist: async (p, e) => (captured = [p, e]),
    },
  );
  assert.equal(r.status, 200);
  assert.equal(captured[0], "teams");
  assert.equal(captured[1].external, "T1");
  assert.equal(captured[1].channel, "C1");
});

import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  jwtVerify,
  createLocalJWKSet,
} from "jose";
import { teamsAuthentication } from "../supabase/functions/_shared/teams-auth.js";
test("Teams validates real RSA signatures, Microsoft issuer, app audience, lifetime, service URL and channel endorsement", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "microsoft-key",
    endorsements: ["msteams"],
  };
  const body = {
    channelId: "msteams",
    serviceUrl: "https://smba.trafficmanager.net/teams/",
  };
  const verify = (keys = [jwk]) =>
    teamsAuthentication({
      jwtVerify,
      createLocalJWKSet,
      appId: "beam-app",
      fetcher: async () => Response.json({ keys }),
    });
  async function token({
    issuer = "https://api.botframework.com",
    audience = "beam-app",
    expiry = "5m",
    serviceUrl = body.serviceUrl,
  } = {}) {
    return new SignJWT({ serviceUrl })
      .setProtectedHeader({ alg: "RS256", kid: "microsoft-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setNotBefore("0s")
      .setExpirationTime(expiry)
      .sign(privateKey);
  }
  const headers = (t) => new Headers({ authorization: `Bearer ${t}` });
  assert.equal(await verify()(body, headers(await token())), true);
  for (const params of [
    { issuer: "https://attacker.example" },
    { audience: "other-app" },
    { expiry: "-10m" },
    { serviceUrl: "https://other.example" },
  ])
    assert.equal(await verify()(body, headers(await token(params))), false);
  assert.equal(
    await verify([{ ...jwk, endorsements: ["other-channel"] }])(
      body,
      headers(await token()),
    ),
    false,
  );
  const other = await generateKeyPair("RS256");
  const forged = await new SignJWT({ serviceUrl: body.serviceUrl })
    .setProtectedHeader({ alg: "RS256", kid: "microsoft-key" })
    .setIssuer("https://api.botframework.com")
    .setAudience("beam-app")
    .setNotBefore("0s")
    .setExpirationTime("5m")
    .sign(other.privateKey);
  assert.equal(await verify()(body, headers(forged)), false);
});
