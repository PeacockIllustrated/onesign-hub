
import { $, $$, onRoute, toast, fmtGBP } from './common.js';
import { api } from './api.js';

let presets = [];
let currentProduct = null;
let currentInputs = {};
let latestCalc = null;

function renderProducts(){
  const grid = $('#product-grid');
  grid.innerHTML = '';
  presets.forEach(p=>{
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `
      <div class="card-body stack">
        <img class="media" src="data:image/svg+xml;utf8,${encodeURIComponent(genMedia())}" alt="product"/>
        <div class="hstack" style="justify-content:space-between;">
          <div>
            <div style="font-weight:800">${p.label}</div>
            <div class="small">${p.type.replaceAll('_',' ').toLowerCase()}</div>
          </div>
          <a class="btn" href="#estimate:${p.type}">configure →</a>
        </div>
      </div>`;
    grid.appendChild(el);
  });
}

function genMedia(){
  return `<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg' width='720' height='420'>
  <defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%23dfe6ea'/><stop offset='1' stop-color='%23f6f7f8'/></linearGradient></defs>
  <rect width='100%' height='100%' fill='url(%23g)'/>
  <rect x='120' y='80' rx='28' ry='28' width='480' height='260' fill='%23ffffff' stroke='%23d9e1e7' stroke-width='4'/>
  <circle cx='170' cy='130' r='10' fill='%236f8f9a'/>
  <circle cx='545' cy='130' r='10' fill='%236f8f9a'/>
  <text x='200' y='265' font-size='36' font-family='Inter, Arial' fill='%23121417'>rounded product card</text>
</svg>`;
}

function renderStepper(preset){
  const el = $('#stepper');
  el.innerHTML = '';
  (preset.ui?.steps || ['Basics']).forEach((label, idx)=>{
    const s = document.createElement('div');
    s.className = 'step' + (idx===0?' active':'');
    s.innerHTML = `<div class="dot"></div><div>${label}</div>`;
    el.appendChild(s);
  });
}

function renderForm(productType){
  const form = $('#est-form');
  form.innerHTML='';
  const preset = presets.find(p=>p.type===productType);
  currentInputs = Object.assign({}, preset.defaults||{});
  renderStepper(preset);

  const addField = (id, label, html) => {
    const wrap = document.createElement('div');
    wrap.className='field';
    wrap.innerHTML = `<label class="label" for="${id}">${label}</label>${html}`;
    form.appendChild(wrap);
  };

  // SHARED FIELDS
  if(productType==='ACM_TRAY_SIGN' || productType==='PRINTED_PANEL' || productType==='BANNER_POSTER'){
    addField('widthMm','Width (mm)', `<input id="widthMm" type="number" class="input" value="${currentInputs.widthMm||1000}" min="50">`);
    addField('heightMm','Height (mm)', `<input id="heightMm" type="number" class="input" value="${currentInputs.heightMm||500}" min="50">`);
    addField('qty','Quantity', `<input id="qty" type="number" class="input" value="${currentInputs.qty||1}" min="1">`);
  }

  // PER PRODUCT
  if(productType==='ACM_TRAY_SIGN'){
    addField('lit','Illumination', `<select id="lit" class="select">
      <option value="none">none</option>
      <option value="backlit">backlit</option>
      <option value="edgelit">edgelit</option>
    </select>`);
    addField('install','Install on site?', `<select id="install" class="select">
      <option value="false">no</option>
      <option value="true">yes</option>
    </select>`);
    addField('installHeightM','Install height (m)', `<input id="installHeightM" type="number" class="input" value="${currentInputs.installHeightM||2.4}" step="0.1" min="0">`);
  }

  if(productType==='PRINTED_PANEL'){
    addField('substrate','Substrate', `<select id="substrate" class="select">
      <option>Foamex 5mm</option>
      <option>ACM 3mm</option>
      <option>Acrylic 3mm</option>
    </select>`);
    addField('laminate','Laminate', `<select id="laminate" class="select">
      <option>none</option><option>matt</option><option>gloss</option><option>antigraffiti</option>
    </select>`);
    addField('contourCut','Contour cut?', `<select id="contourCut" class="select">
      <option value="false">no</option><option value="true">yes</option>
    </select>`);
  }

  if(productType==='WINDOW_WALL_VINYL'){
    addField('areaM2','Area (m²)', `<input id="areaM2" type="number" class="input" value="${currentInputs.areaM2||5}" min="0.2" step="0.1">`);
    addField('laminate','Laminate', `<select id="laminate" class="select">
      <option>matt</option><option>gloss</option><option>antiSlipR10</option><option>none</option>
    </select>`);
    addField('contourCut','Contour cut?', `<select id="contourCut" class="select">
      <option value="false">no</option><option value="true">yes</option>
    </select>`);
    addField('install','Install on site?', `<select id="install" class="select">
      <option value="false">no</option><option value="true">yes</option>
    </select>`);
    addField('installHeightM','Install height (m)', `<input id="installHeightM" type="number" class="input" value="${currentInputs.installHeightM||2.4}" step="0.1" min="0">`);
  }

  if(productType==='BANNER_POSTER'){
    addField('material','Material', `<select id="material" class="select">
      <option>PVC Banner 440gsm</option>
      <option>Mesh Banner 340gsm</option>
      <option>Poster 200gsm</option>
    </select>`);
    addField('finish','Finishing', `<select id="finish" class="select">
      <option value="none">none</option>
      <option value="hem_eyelet_sides">hem & eyelets (sides)</option>
      <option value="hem_eyelet_all">hem & eyelets (all edges)</option>
    </select>`);
    addField('turnaround','Turnaround', `<select id="turnaround" class="select">
      <option value="standard">standard</option>
      <option value="priority">priority</option>
    </select>`);
  }

  if(productType==='WAYFINDING_PACK'){
    addField('doorSigns','Door signs (qty)', `<input id="doorSigns" type="number" class="input" value="${currentInputs.doorSigns||10}" min="0">`);
    addField('directional','Directional signs (qty)', `<input id="directional" type="number" class="input" value="${currentInputs.directional||6}" min="0">`);
    addField('directoryBoards','Directory boards (qty)', `<input id="directoryBoards" type="number" class="input" value="${currentInputs.directoryBoards||1}" min="0">`);
    addField('substrate','Substrate', `<select id="substrate" class="select">
      <option>Acrylic 3mm</option><option>Foamex 5mm</option><option>ACM 3mm</option>
    </select>`);
    addField('fixings','Fixings', `<select id="fixings" class="select">
      <option value="stand_off">stand-off</option><option value="rail">rail</option><option value="tape">tape</option>
    </select>`);
    addField('design','Design complexity', `<select id="design" class="select">
      <option value="simple">simple</option><option value="standard">standard</option><option value="complex">complex</option>
    </select>`);
    addField('install','Install on site?', `<select id="install" class="select">
      <option value="true">yes</option><option value="false">no</option>
    </select>`);
  }

  if(productType==='VEHICLE_DECAL'){
    addField('vehicleClass','Vehicle class', `<select id="vehicleClass" class="select">
      <option value="car">car</option><option value="van_swb">van_swb</option><option value="van_lwb">van_lwb</option><option value="luton">luton</option><option value="hgv">hgv</option>
    </select>`);
    addField('coverage','Coverage', `<select id="coverage" class="select">
      <option value="decals">decals</option><option value="partial_wrap">partial wrap</option><option value="full_wrap">full wrap</option>
    </select>`);
    addField('laminate','Laminate', `<select id="laminate" class="select">
      <option value="cast">cast</option><option value="none">none</option>
    </select>`);
  }

  if(productType==='HOARDING'){
    addField('linearM','Linear metres', `<input id="linearM" type="number" class="input" value="${currentInputs.linearM||25}" min="1">`);
    addField('heightM','Height (m)', `<input id="heightM" type="number" class="input" value="${currentInputs.heightM||2.4}" step="0.1" min="1.2">`);
    addField('panelMaterial','Panel material', `<select id="panelMaterial" class="select">
      <option>ACM 3mm</option><option>Foamex 5mm</option>
    </select>`);
    addField('laminate','Laminate', `<select id="laminate" class="select">
      <option>matt</option><option>gloss</option>
    </select>`);
    addField('freeStanding','Free-standing structure?', `<select id="freeStanding" class="select">
      <option value="true">yes</option><option value="false">no</option>
    </select>`);
    addField('site','Site conditions', `<select id="site" class="select">
      <option value="easy">easy</option><option value="standard">standard</option><option value="complex">complex</option>
    </select>`);
    addField('install','Install on site?', `<select id="install" class="select">
      <option value="true">yes</option><option value="false">no</option>
    </select>`);
  }

  // events
  form.addEventListener('input', debounce(recalc, 120));
  form.addEventListener('change', debounce(recalc, 50));
  recalc();
}

function gatherInputs(){
  const form = $('#est-form');
  const inputs = {};
  $$('input,select,textarea', form).forEach(el=>{
    const id = el.id; let val = el.value;
    if(el.type==='number') val = Number(val);
    if(el.tagName==='SELECT' && (val==='true' || val==='false')) val = (val==='true');
    inputs[id] = val;
  });
  return inputs;
}

async function recalc(){
  const inputs = gatherInputs();
  currentInputs = inputs;
  const res = await api.calculateQuote({ productType: currentProduct, inputs });
  latestCalc = res;
  $('#price').textContent = fmtGBP(res.totals.grandTotal);
  renderBreakdown(res);
}

function renderBreakdown(res){
  const b = $('#breakdown'); b.innerHTML = '';
  const add = (title, rows) => {
    if(!rows || rows.length===0) return;
    const box = document.createElement('div');
    box.innerHTML = `<div style="font-weight:700;margin-bottom:6px">${title}</div>`;
    rows.forEach(r=>{
      const line = document.createElement('div');
      line.className='hstack'; line.style.justifyContent='space-between';
      const l = ('name' in r ? r.name : r.label) || r.role;
      const right = ('mins' in r) ? `${Math.round(r.mins)} min • ${fmtGBP(r.cost)}` : fmtGBP(r.cost);
      line.innerHTML = `<span>${l}</span><span>${right}</span>`;
      box.appendChild(line);
    });
    b.appendChild(box);
    b.appendChild(Object.assign(document.createElement('div'),{className:'hr'}));
  };
  add('Materials', res.breakdown.materials);
  add('Machines', res.breakdown.machines);
  add('Labour', res.breakdown.labour);
  add('Logistics', res.breakdown.logistics);
  add('Extras', res.breakdown.extras);
  const total = document.createElement('div');
  total.innerHTML = `<div class="hstack" style="justify-content:space-between;font-weight:800">
    <span>Sub-total (rounded)</span><span>${fmtGBP(res.totals.roundedSubTotal)}</span>
  </div>
  <div class="hstack" style="justify-content:space-between;">
    <span>VAT (20%)</span><span>${fmtGBP(res.totals.vat)}</span>
  </div>
  <div class="hstack" style="justify-content:space-between;font-size:18px;font-weight:900">
    <span>Total</span><span>${fmtGBP(res.totals.grandTotal)}</span>
  </div>`;
  b.appendChild(total);
}

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} }

// Save quote
$('#save-quote').addEventListener('click', async ()=>{
  if(!latestCalc){ toast('Configure first'); return; }
  const { quoteId, shareUrl } = await api.createCustomerQuote({ productType: currentProduct, inputs: currentInputs });
  navigator.clipboard?.writeText(shareUrl).catch(()=>{});
  toast('Share link copied');
  location.hash = 'share='+encodeURIComponent(quoteId);
});

async function ensurePresetsLoaded(){ 
  if(!presets || presets.length===0){ 
    try{ const meta = await api.latestPublishedPriceBookMeta(); presets = meta.productPresets||[]; } catch(e){ presets=[]; }
  }
  return presets;
}

// Router
onRoute({
  'home':{},
  'products':{ enter: async ()=>{
    const meta = await api.latestPublishedPriceBookMeta();
    presets = meta.productPresets;
    renderProducts();
  }},
  'estimate':{ match:(h)=>h.startsWith('estimate:'), enter: async (hash)=>{
    await ensurePresetsLoaded();
    const type = hash.split(':')[1]; currentProduct = type;
    const preset = presets.find(p=>p.type===type);
    if(!preset){
      toast('Unknown product — choose from the list');
      location.hash = 'products';
      return;
    }
    $('#est-title').textContent = preset ? preset.label : 'Estimate';
    renderForm(type);
  }},
  'share':{ match:(h)=>h.startsWith('share='), enter: async (hash)=>{
    const id = decodeURIComponent(hash.split('=')[1]);
    const q = await api.fetchSharedQuote(id);
    const wrap = $('#share-content');
    if(!q){ wrap.innerHTML = '<div class="card"><div class="card-body">Not found.</div></div>'; return; }
    wrap.innerHTML = `
      <div class="card">
        <div class="card-header">${q.productType.replaceAll('_',' ')}</div>
        <div class="card-body stack">
          <div class="hstack" style="justify-content:space-between;"><div>Quote number</div><div class="mono">${q.number}</div></div>
          <div class="hstack" style="justify-content:space-between;"><div>Total (incl. VAT)</div><div class="kpi">${fmtGBP(q.totals.grandTotal)}</div></div>
          <div class="hr"></div>
          <div class="small">This share link is a demo stub. In production this page should be served by a secured Function rendering the quote by token.</div>
        </div>
      </div>`;
  }}
});

// Default route
if(!location.hash) location.hash = 'products';
