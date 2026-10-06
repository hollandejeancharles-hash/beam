import { useLayoutEffect, useRef } from 'react';
const positions = new Map();
export default function useViewPosition(key) {
  const root = useRef(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    let saved = positions.get(key);
    if(!saved){try{saved=JSON.parse(sessionStorage.getItem('beam:view-position:'+key)) || {};}catch{saved={};}}
    const restore = () => Object.entries(saved).forEach(([selector, top]) => {
      const el = node.querySelector(selector); if (el) el.scrollTop = top;
    });
    const frame = requestAnimationFrame(restore);
    const save = () => {
      const next = {};
      ['.notebook-index','.notebook-note-list','.notebook-detail','.demand-queue','.demand-detail'].forEach(selector => {
        const el=node.querySelector(selector); if(el) next[selector]=el.scrollTop;
      });
      positions.set(key,next);
      try{sessionStorage.setItem('beam:view-position:'+key,JSON.stringify(next));}catch{}
    };
    node.addEventListener('scroll',save,true);
    return () => { cancelAnimationFrame(frame); save(); node.removeEventListener('scroll',save,true); };
  }, [key]);
  return root;
}
