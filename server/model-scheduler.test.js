import test from "node:test";
import assert from "node:assert/strict";
import { createModelFetch, createAnalysisPacing } from "./model-scheduler.js";
const url = "http://127.0.0.1:11434/api/chat";
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("inference remains exclusive until its stream finishes and foreground jobs pass queued background jobs", async () => {
  const started = [],
    controllers = [];
  const fetcher = createModelFetch(async (_url, options) => {
    started.push(options.body);
    return new Response(
      new ReadableStream({
        start(c) {
          controllers.push(c);
        },
      }),
    );
  });
  const first = await fetcher(url, { body: "first" });
  const background = fetcher(url, { body: "background", modelPriority: 0 });
  const foreground = fetcher(url, { body: "foreground" });
  await tick();
  assert.deepEqual(started, ["first"]);
  controllers[0].close();
  await first.text();
  const second = await foreground;
  assert.deepEqual(started, ["first", "foreground"]);
  controllers[1].close();
  await second.text();
  const last = await background;
  controllers[2].close();
  await last.text();
  assert.deepEqual(started, ["first", "foreground", "background"]);
});
test("cancelling queued work removes it and cancelling an active stream frees the slot", async () => {
  const started = [];
  const fetcher = createModelFetch(async (_url, options) => {
    started.push(options.body);
    return new Response(new ReadableStream());
  });
  const first = await fetcher(url, { body: "first" });
  const controller = new AbortController();
  const queued = fetcher(url, { body: "cancelled", signal: controller.signal });
  const rejected = assert.rejects(queued, { name: "AbortError" });
  controller.abort();
  await rejected;
  const next = fetcher(url, { body: "next" });
  await first.body.cancel();
  const second = await next;
  assert.deepEqual(started, ["first", "next"]);
  await second.body.cancel();
});
test("failed inference and non-model status requests do not block subsequent analyses", async () => {
  let attempts = 0;
  const fetcher = createModelFetch(async (target) => {
    if (target.endsWith("/api/tags")) return new Response("{}");
    if (++attempts === 1) throw Error("offline");
    return new Response("ok");
  });
  await assert.rejects(fetcher(url), /offline/);
  assert.equal(await (await fetcher(url)).text(), "ok");
  assert.equal(
    await (await fetcher("http://127.0.0.1:11434/api/tags")).text(),
    "{}",
  );
});
test("background failures back off, changed inputs can run immediately and success clears the penalty", () => {
  let now = 0;
  const pacing = createAnalysisPacing(() => now);
  assert.equal(pacing.ready("a"), true);
  pacing.failure();
  assert.equal(pacing.ready("a"), false);
  now = 120000;
  assert.equal(pacing.ready("a"), true);
  pacing.failure();
  now += 239999;
  assert.equal(pacing.ready("a"), false);
  assert.equal(pacing.ready("b"), true);
  pacing.failure();
  pacing.success();
  assert.equal(pacing.ready("b"), true);
});
test("the inference timeout starts when a queued job gets its slot, not while it is waiting", async () => {
  let held;
  const fetcher = createModelFetch(async (_url, options) => {
    if (options.body === "held")
      return new Response(
        new ReadableStream({
          start(c) {
            held = c;
          },
        }),
      );
    assert.equal(options.signal.aborted, false);
    return new Response("done");
  });
  const first = await fetcher(url, { body: "held" });
  const second = fetcher(url, { body: "queued", modelTimeoutMs: 20 });
  await new Promise((resolve) => setTimeout(resolve, 35));
  held.close();
  await first.text();
  assert.equal(await (await second).text(), "done");
});
