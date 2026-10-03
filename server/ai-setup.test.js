import test from "node:test";
import assert from "node:assert/strict";
import { createAISetup } from "./ai-setup.js";
async function finished(setup) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setImmediate(r));
    const s = await setup.status();
    if (s.state !== "downloading") return s;
  }
  throw Error("Download did not finish");
}
test("Model setup reports real layer bytes and verifies installed model before success", async () => {
  let installed = false;
  const setup = createAISetup(async (url) => {
    if (url.endsWith("/tags"))
      return Response.json({
        models: installed ? [{ name: "ministral-3:8b" }] : [],
      });
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              '{"digest":"a","total":100,"completed":50}\n{"digest":"a","total":100,"completed":100}\n',
            ),
          );
          installed = true;
          c.close();
        },
      }),
    );
  });
  await setup.install();
  const s = await finished(setup);
  assert.equal(s.state, "ready");
  assert.equal(s.completed, 100);
  assert.equal(s.total, 100);
  assert.equal(s.installed, true);
});
test("An interrupted model download never reports a ready assistant", async () => {
  const setup = createAISetup(async (url) =>
    url.endsWith("/tags")
      ? Response.json({ models: [] })
      : new Response('{"error":"Network interrupted"}\n'),
  );
  await setup.install();
  const s = await finished(setup);
  assert.equal(s.state, "error");
  assert.equal(s.installed, false);
  assert.match(s.message, /Network/);
});
