// One inference at a time across every workspace and analysis type.
// Keep the slot until the streamed response is consumed, not just its headers.
export function createModelFetch(fetcher = fetch) {
  let active = false;
  const queue = [];
  function next() {
    if (active) return;
    queue.sort((a, b) => b.priority - a.priority);
    const job = queue.shift();
    if (!job) return;
    active = true;
    job.start(() => {
      active = false;
      next();
    });
  }
  return async function modelFetch(url, options = {}) {
    if (!String(url).endsWith("/api/chat")) return fetcher(url, options);
    const {
      modelPriority = 1,
      modelTimeoutMs = 120000,
      onModelQueued,
      onModelStart,
      ...request
    } = options;
    return new Promise((resolve, reject) => {
      let release,
        finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        request.signal?.removeEventListener("abort", abort);
        release?.();
      };
      const abort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        reject(request.signal.reason);
        finish();
      };
      const job = {
        priority: modelPriority,
        async start(unlock) {
          release = unlock;
          try {
            request.signal?.throwIfAborted();
            onModelStart?.();
            const timeout = AbortSignal.timeout(modelTimeoutMs);
            const signal = request.signal
              ? AbortSignal.any([request.signal, timeout])
              : timeout;
            signal.addEventListener("abort", finish, { once: true });
            const response = await fetcher(url, { ...request, signal });
            if (!response.ok || !response.body?.getReader) {
              finish();
              resolve(response);
              return;
            }
            const reader = response.body.getReader();
            const body = new ReadableStream({
              async pull(controller) {
                try {
                  const chunk = await reader.read();
                  if (chunk.done) {
                    finish();
                    controller.close();
                  } else controller.enqueue(chunk.value);
                } catch (error) {
                  finish();
                  controller.error(error);
                }
              },
              async cancel(reason) {
                try {
                  await reader.cancel(reason);
                } finally {
                  finish();
                }
              },
            });
            resolve(
              new Response(body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              }),
            );
          } catch (error) {
            finish();
            reject(error);
          }
        },
      };
      if (request.signal?.aborted) {
        reject(request.signal.reason);
        return;
      }
      request.signal?.addEventListener("abort", abort, { once: true });
      onModelQueued?.();
      queue.push(job);
      next();
    });
  };
}
export const modelFetch = createModelFetch();
export const backgroundModelFetch = (url, options) =>
  modelFetch(url, { ...options, modelPriority: 0 });

// Failed background work waits longer between retries, while explicit retries
// remain possible. The scheduler leaves a minute between background cycles.
export function createAnalysisPacing(now = Date.now) {
  let failures = 0,
    nextAt = 0,
    signature = null;
  return {
    ready(key) {
      if (key !== signature) {
        signature = key;
        failures = 0;
        nextAt = 0;
      }
      return now() >= nextAt;
    },
    success() {
      failures = 0;
      nextAt = 0;
    },
    failure() {
      nextAt =
        now() + Math.min(30 * 60000, 60000 * 2 ** Math.min(++failures, 5));
    },
  };
}
