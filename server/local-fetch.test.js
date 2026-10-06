import test from "node:test";
import assert from "node:assert/strict";
import {fetchLocalJson} from "../shared/local-fetch.js";
test("local reads complete and retain HTTP errors for callers", async () => {
  const {response,data}=await fetchLocalJson("fixture",{},async()=>new Response('{"error":"fixture"}',{status:401}));
  assert.equal(response.status,401); assert.equal(data.error,"fixture");
});
test("stalled local reads are cancelled instead of keeping a connection forever", async () => {
  let signal;
  const stalled=(_url,options)=>{signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason)));};
  await assert.rejects(fetchLocalJson("fixture",{},stalled,20),/pris trop de temps/);
  assert.equal(signal.aborted,true);
});
test("timeouts also cover a response body that never finishes", async () => {
  const stalled=async(_url,options)=>({json:()=>new Promise((resolve,reject)=>options.signal.addEventListener("abort",()=>reject(options.signal.reason)))});
  await assert.rejects(fetchLocalJson("fixture",{},stalled,20),/pris trop de temps/);
});
