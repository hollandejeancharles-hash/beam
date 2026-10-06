import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewCache,writeViewCache} from '../shared/view-cache.js';
const storage = () => { const values=new Map(); return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; };
test('corrupt or expired snapshots do not prevent loading authoritative data',()=>{
 const s=storage(); s.setItem('beam:view-cache:v1:broken','bad json');
 assert.equal(readViewCache('broken',s),null);
 s.setItem('beam:view-cache:v1:expired',JSON.stringify({at:0,value:['old']}));
 assert.equal(readViewCache('expired',s,86400001),null);
});
test('workspace snapshots remain isolated and storage failure never blocks editing',()=>{
 const s=storage(); writeViewCache('workspace-a',['a'],s); writeViewCache('workspace-b',['b'],s);
 assert.deepEqual(readViewCache('workspace-a',s),['a']); assert.deepEqual(readViewCache('workspace-b',s),['b']);
 assert.doesNotThrow(()=>writeViewCache('full',['new'],{setItem(){throw Error('quota');}}));
 assert.deepEqual(readViewCache('full'),['new']);
});
