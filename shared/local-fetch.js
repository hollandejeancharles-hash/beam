// Bound local reads, including a response body stalled by WebKit's connection pool.
export async function fetchLocalJson(url, options = {}, fetcher = fetch, timeout = 10000) {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, {once:true});
  if(options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(url, {...options, signal:controller.signal});
    const data = await response.json();
    return {response, data};
  } catch(error) {
    if(controller.signal.aborted && !options.signal?.aborted) throw Error('Le chargement local a pris trop de temps. Réessayez.');
    throw error;
  } finally {clearTimeout(timer); options.signal?.removeEventListener('abort', abort);}
}
