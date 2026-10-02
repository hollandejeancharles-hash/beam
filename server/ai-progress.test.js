import test from "node:test";
import assert from "node:assert/strict";
import {
  beginProgress,
  progressFor,
  readModelResponse,
} from "./ai-progress.js";
function response(parts) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
  );
}
test("streamed analysis reports only completed stages and received content", async () => {
  const progress = beginProgress("stream-test", "note", { notes: ["note-1"] });
  progress.update("Analyse locale", 1, true);
  const result = await readModelResponse(
    response([
      '{"message":{"content":"{\\"a\\""}}\n{"message":{"content":',
      '" :1}"}}\n{"done":true,"eval_count":12}\n',
    ]),
    progress,
  );
  assert.equal(result.message.content, '{"a" :1}');
  assert.equal(progressFor("stream-test").completed, 1);
  assert.equal(progressFor("stream-test").received, 8);
  progress.update("Vérification", 2);
  progress.update("Enregistrement", 3);
  progress.finish();
  assert.equal(progressFor("stream-test").completed, 4);
  assert.equal(progressFor("stream-test").state, "complete");
});
test("interrupted or invalid streams never report a successful completion", async () => {
  for (const parts of [
    ['{"message":{"content":"partial"}}\n'],
    ["invalid\n"],
    ['{"error":"failure"}\n'],
  ]) {
    const progress = beginProgress("error-test", "feature");
    progress.update("Analyse locale", 1, true);
    await assert.rejects(readModelResponse(response(parts), progress));
    progress.finish("Interrompu");
    assert.equal(progressFor("error-test").state, "error");
    assert.equal(progressFor("error-test").completed, 1);
  }
});
