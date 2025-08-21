
export const $ = (sel, el=document) => el.querySelector(sel);
export const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
export const fmtGBP = (pence) => `£${(pence/100).toFixed(2)}`;
export const uid = (p='') => p + Math.random().toString(36).slice(2,9);
export const nowIso = () => new Date().toISOString();
export const store = {
  get(k, def=null){ try{ return JSON.parse(localStorage.getItem(k)) ?? def }catch{ return def } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  del(k){ localStorage.removeItem(k); }
};
export function toast(msg){
  let t = document.querySelector('.toast'); 
  if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}
export function onRoute(map){
  function go(){
    const hash = location.hash.replace(/^#\/?/, '');
    const route = map[hash] ? hash : Object.keys(map).find(k => map[k].match && map[k].match(hash)) || 'home';
    for(const [k,v] of Object.entries(map)){
      const el = document.getElementById(`route-${k}`);
      if(!el) continue;
      el.classList.toggle('hide', !(k===route || (v.match && v.match(hash))));
      if(v.enter && (k===route || (v.match && v.match(hash)))) v.enter(hash);
    }
  }
  window.addEventListener('hashchange', go); go();
}
