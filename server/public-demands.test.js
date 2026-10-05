import test from "node:test";
import assert from "node:assert/strict";
import { receivePublic } from "../supabase/functions/beam-public-demands/handler.js";
import { publicIntake } from "../shared/public-intake.js";
const body = {
  portal: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  request: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  title: "Besoin client",
  description: "Contexte",
};
const send = (value = body) =>
  new Request("https://example.com", {
    method: "POST",
    headers: { origin: "https://hollandejeancharles-hash.github.io" },
    body: JSON.stringify(value),
  });
test("Public intake publishes only its scoped address, never extra credentials", () => {
  assert.deepEqual(
    publicIntake({
      ...body,
      endpoint: "https://project.supabase.co/functions/v1/beam-public-demands",
      serviceKey: "secret",
    }),
    {
      portal: body.portal,
      endpoint: "https://project.supabase.co/functions/v1/beam-public-demands",
    },
  );
  assert.throws(() =>
    publicIntake({ ...body, endpoint: "https://evil.example/upload" }),
  );
});
test("Public submission stores the exact request and acknowledges only after persistence", async () => {
  let saved;
  const r = await receivePublic(send(), async (b) => (saved = b));
  assert.equal(r.status, 200);
  assert.equal(saved.request, body.request);
  assert.equal(saved.origin, "https://hollandejeancharles-hash.github.io");
  assert.deepEqual(await r.json(), { received: true });
});
test("Invalid and oversized requests cannot reach storage", async () => {
  let calls = 0;
  for (const data of [
    { ...body, title: "" },
    { ...body, portal: "other" },
    { ...body, description: "x".repeat(21000) },
  ])
    assert.ok(
      (await receivePublic(send(data), async () => calls++)).status >= 400,
    );
  assert.equal(calls, 0);
});
test("Storage failures and rate limits never pretend to have saved a request", async () => {
  for (const [message, code] of [
    ["RATE_LIMIT", 429],
    ["secret failure", 503],
  ]) {
    const r = await receivePublic(send(), async () => {
      throw Error(message);
    });
    assert.equal(r.status, code);
    assert.equal((await r.json()).received, undefined);
  }
});
test("Preflight and honeypot never create requests", async () => {
  let calls = 0;
  assert.equal(
    (
      await receivePublic(
        new Request("https://example.com", { method: "OPTIONS" }),
        async () => calls++,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await receivePublic(
        send({ ...body, website: "spam" }),
        async () => calls++,
      )
    ).status,
    200,
  );
  assert.equal(calls, 0);
});
