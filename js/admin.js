import { $, $$, onRoute, toast, fmtGBP } from './common.js';
import { api } from './api.js';
import { priceBook } from './pricebook.js';

function setVersion(){
  $('#pb-version').textContent = priceBook.version();
}
setVersion();

// Route handling
onRoute({
  'home':{},
  'pricebook':{ enter: renderPriceBook },
  'simulator':{ enter: renderSimulator },
  'quotes':{ enter: renderQuotes }
});

// Draft / publish
$('#btn-new-draft').addEventListener('click', ()=>{
  priceBook.saveDraft({});
  toast('Draft loaded — you can edit now');
  $('#btn-publish').disabled = false;
  location.hash = 'pricebook';
});
$('#btn-publish').addEventListener('click', async ()=>{
  const { version } = await api.publishPriceBook();
  toast('Published v' + version);
  $('#btn-publish').disabled = true;
  setVersion();
});

function inputRow(label, id, value, step=1){
  const row = document.createElement('div');
  row.className = 'field';
  row.innerHTML = `<label class="label">${label}</label>
    <input class="input" id="${id}" type="number" value="${value}" step="${step}">`;
  return row;
}

function renderPriceBook(){
  const d = priceBook.draft();

  // Labour & logistics
  const lf = $('#labour-form'); lf.innerHTML='';
  lf.appendChild(inputRow('Design £/hr (pence)', 'lab-design', d.labourRates.design, 100));
  lf.appendChild(inputRow('Production £/hr (pence)', 'lab-production', d.labourRates.production, 100));
  lf.appendChild(inputRow('Install £/hr (pence)', 'lab-install', d.labourRates.install, 100));
  lf.appendChild(inputRow('Travel per mile (pence)', 'log-travel', d.logistics.travelPerMile, 10));
  lf.appendChild(inputRow('Parking per day (pence)', 'log-parking', d.logistics.parkingPerDay, 100));
  lf.appendChild(inputRow('Cherry picker per day (pence)', 'log-cherry', d.logistics.cherryPickerPerDay, 100));
  lf.appendChild(inputRow('Traffic management per day (pence)', 'log-tm', d.logistics.trafficMgmtPerDay, 100));
  lf.addEventListener('input', ()=>{
    const patch = {
      labourRates:{
        design: Number($('#lab-design').value),
        production: Number($('#lab-production').value),
        install: Number($('#lab-install').value)
      },
      logistics:{
        travelPerMile: Number($('#log-travel').value),
        parkingPerDay: Number($('#log-parking').value),
        cherryPickerPerDay: Number($('#log-cherry').value),
        trafficMgmtPerDay: Number($('#log-tm').value)
      }
    };
    priceBook.saveDraft(patch);
  });

  // Rules
  const rf = $('#rules-form'); rf.innerHTML='';
  rf.appendChild(inputRow('Default margin %', 'rule-margin', d.defaultMarginPct, 1));
  rf.appendChild(inputRow('Wastage default %', 'rule-wastage', d.rules.wastageDefaultPct, 1));
  rf.addEventListener('input', ()=>{
    const patch = { defaultMarginPct:Number($('#rule-margin').value), rules:Object.assign({}, d.rules, {wastageDefaultPct:Number($('#rule-wastage').value)}) };
    priceBook.saveDraft(patch);
  });

  // Materials table
  const mt = $('#materials-table');
  mt.innerHTML = `<tr><th>Name</th><th>Kind</th><th>Spec / Width</th><th>Cost</th><th></th></tr>`;
  d.materials.forEach((m, idx)=>{
    const tr = document.createElement('tr');
    const spec = m.kind==='sheet' ? `${m.sheet.widthMm}×${m.sheet.heightMm}mm` : m.kind==='roll' ? `${m.roll.widthMm}mm` : (m.unit?.uom||'each');
    const cost = m.kind==='sheet' ? m.sheet.costPerSheet : m.kind==='roll' ? m.roll.costPerLinearM : m.unit.costPerUnit;
    tr.innerHTML = `<td><input class="input" value="${m.name}" data-field="name"></td>
      <td><select class="select" data-field="kind">
            <option ${m.kind==='sheet'?'selected':''}>sheet</option>
            <option ${m.kind==='roll'?'selected':''}>roll</option>
            <option ${m.kind==='led'?'selected':''}>led</option>
            <option ${m.kind==='psu'?'selected':''}>psu</option>
          </select></td>
      <td><input class="input" value="${spec}" data-field="spec"></td>
      <td><input class="input" type="number" value="${cost}" data-field="cost"></td>
      <td><button class="btn icon" data-action="del">🗑️</button></td>`;
    tr.addEventListener('input', ()=>{
      const name = tr.querySelector('[data-field="name"]').value;
      const kind = tr.querySelector('[data-field="kind"]').value;
      const specStr = tr.querySelector('[data-field="spec"]').value;
      const costVal = Number(tr.querySelector('[data-field="cost"]').value);
      const nm = { id:m.id, kind, name };
      if(kind==='sheet'){
        const parts = specStr.split(/×|x/i).map(s=>parseInt(s));
        nm.sheet = { widthMm:parts[0]||2440, heightMm:parts[1]||1220, costPerSheet:costVal };
      }else if(kind==='roll'){
        nm.roll = { widthMm:parseInt(specStr)||1370, costPerLinearM:costVal };
      }else{
        nm.unit = { uom:'each', costPerUnit:costVal };
      }
      const materials = d.materials.slice(); materials[idx]=nm;
      priceBook.saveDraft({ materials });
    });
    tr.querySelector('[data-action="del"]').addEventListener('click', ()=>{
      const materials = d.materials.slice(); materials.splice(idx,1); priceBook.saveDraft({ materials }); renderPriceBook();
    });
    mt.appendChild(tr);
  });
  $('#add-material').onclick = ()=>{
    const materials = d.materials.slice();
    materials.push({ id: 'm'+Math.random().toString(36).slice(2,7), kind:'sheet', name:'New Sheet', sheet:{ widthMm:2440, heightMm:1220, costPerSheet:1000 } });
    priceBook.saveDraft({ materials }); renderPriceBook();
  };

  // Machines table
  const mach = $('#machines-table');
  mach.innerHTML = `<tr><th>Name</th><th>Type</th><th>£/hr (pence)</th><th>Setup (min)</th><th>Throughput (m²/hr)</th><th></th></tr>`;
  d.machines.forEach((m, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="input" value="${m.name}" data-f="name"></td>
      <td><select class="select" data-f="type">
        <option ${m.type==='printer'?'selected':''}>printer</option>
        <option ${m.type==='cnc'?'selected':''}>cnc</option>
        <option ${m.type==='laser'?'selected':''}>laser</option>
        <option ${m.type==='plotter'?'selected':''}>plotter</option>
        <option ${m.type==='applicator'?'selected':''}>applicator</option>
      </select></td>
      <td><input class="input" type="number" value="${m.ratePerHour}" data-f="rate"></td>
      <td><input class="input" type="number" value="${m.setupMins}" data-f="setup"></td>
      <td><input class="input" type="number" value="${m.throughputM2PerHour||0}" data-f="through"></td>
      <td><button class="btn icon" data-action="del">🗑️</button></td>`;
    tr.addEventListener('input', ()=>{
      const nm = {
        id:m.id,
        name: tr.querySelector('[data-f="name"]').value,
        type: tr.querySelector('[data-f="type"]').value,
        ratePerHour: Number(tr.querySelector('[data-f="rate"]').value),
        setupMins: Number(tr.querySelector('[data-f="setup"]').value),
        throughputM2PerHour: Number(tr.querySelector('[data-f="through"]').value)||undefined
      };
      const machines = d.machines.slice(); machines[idx]=nm; priceBook.saveDraft({ machines });
    });
    tr.querySelector('[data-action="del"]').addEventListener('click', ()=>{
      const machines = d.machines.slice(); machines.splice(idx,1); priceBook.saveDraft({ machines }); renderPriceBook();
    });
    mach.appendChild(tr);
  });
  $('#add-machine').onclick = ()=>{
    const machines = d.machines.slice();
    machines.push({ id:'mach'+Math.random().toString(36).slice(2,6), type:'printer', name:'New Machine', ratePerHour:3000, setupMins:5, throughputM2PerHour:10 });
    priceBook.saveDraft({ machines }); renderPriceBook();
  };

  // Services table (NEW)
  const svcWrap = document.createElement('div');
  svcWrap.className = 'card';
  svcWrap.innerHTML = `<div class="card-header">Services (finishing, fixings, delivery, ops)</div>
    <div class="card-body">
      <table class="table" id="services-table"></table>
      <div class="card-footer"><button id="add-service" class="btn">add service</button></div>
    </div>`;
  document.getElementById('route-pricebook').appendChild(svcWrap);

  const st = $('#services-table');
  st.innerHTML = `<tr><th>Name</th><th>Category</th><th>UoM</th><th>Price per unit (pence)</th><th></th></tr>`;
  (d.services||[]).forEach((s, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="input" value="${s.name}" data-f="name"></td>
      <td><select class="select" data-f="category">
        <option ${s.category==='finishing'?'selected':''}>finishing</option>
        <option ${s.category==='fixings'?'selected':''}>fixings</option>
        <option ${s.category==='delivery'?'selected':''}>delivery</option>
        <option ${s.category==='ops'?'selected':''}>ops</option>
      </select></td>
      <td><input class="input" value="${s.uom}" data-f="uom"></td>
      <td><input class="input" type="number" value="${s.pricePerUnit}" data-f="price"></td>
      <td><button class="btn icon" data-action="del">🗑️</button></td>`;
    tr.addEventListener('input', ()=>{
      const ns = {
        id: s.id,
        name: tr.querySelector('[data-f="name"]').value,
        category: tr.querySelector('[data-f="category"]').value,
        uom: tr.querySelector('[data-f="uom"]').value,
        pricePerUnit: Number(tr.querySelector('[data-f="price"]').value)
      };
      const services = (d.services||[]).slice(); services[idx]=ns; priceBook.saveDraft({ services });
    });
    tr.querySelector('[data-action="del"]').addEventListener('click', ()=>{
      const services = (d.services||[]).slice(); services.splice(idx,1); priceBook.saveDraft({ services }); renderPriceBook();
    });
    st.appendChild(tr);
  });
  $('#add-service').onclick = ()=>{
    const services = (d.services||[]).slice();
    services.push({ id:'svc'+Math.random().toString(36).slice(2,6), category:'finishing', name:'New Service', uom:'each', pricePerUnit:100 });
    priceBook.saveDraft({ services }); renderPriceBook();
  };
}

function renderSimulator(){
  const meta = priceBook.meta();
  const wrap = $('#sim-form'); wrap.innerHTML='';

  const select = document.createElement('select');
  select.className='select';
  meta.productPresets.forEach(p=>{
    const o = document.createElement('option'); o.value=p.type; o.textContent=p.label; select.appendChild(o);
  });
  wrap.appendChild(Object.assign(document.createElement('div'),{className:'field', innerHTML:`<label class="label">Product</label>`}));
  wrap.lastChild.appendChild(select);

  const cfg = document.createElement('div'); cfg.className='stack'; wrap.appendChild(cfg);

  function selectField(id,label,options, val){
    const d = document.createElement('div'); d.className='field';
    d.innerHTML = `<label class="label">${label}</label>`;
    const s = document.createElement('select'); s.className='select'; s.id=id;
    options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o; opt.textContent=o; if(String(o)===String(val)) opt.selected=true; s.appendChild(opt); });
    d.appendChild(s); return d;
  }
  const addNum = (id,label,val, step=1)=>{
    const dv = document.createElement('div'); dv.className='field';
    dv.innerHTML=`<label class="label">${label}</label><input id="${id}" class="input" type="number" step="${step}" value="${val}">`;
    cfg.appendChild(dv);
  };

  function renderFields(type){
    cfg.innerHTML='';
    const def = meta.productPresets.find(p=>p.type===type)?.defaults || {};
    if(type==='ACM_TRAY_SIGN' || type==='PRINTED_PANEL' || type==='BANNER_POSTER'){
      addNum('widthMm','Width (mm)', def.widthMm||1000);
      addNum('heightMm','Height (mm)', def.heightMm||500);
      addNum('qty','Quantity', def.qty||1);
    }
    if(type==='ACM_TRAY_SIGN'){
      cfg.appendChild(selectField('lit','Illumination',['none','backlit','edgelit'], def.lit||'none'));
      cfg.appendChild(selectField('install','Install',['false','true'], String(def.install||false)));
      addNum('installHeightM','Install height (m)', def.installHeightM||2.4, 0.1);
    }
    if(type==='PRINTED_PANEL'){
      cfg.appendChild(selectField('substrate','Substrate',['Foamex 5mm','ACM 3mm','Acrylic 3mm'], def.substrate||'Foamex 5mm'));
      cfg.appendChild(selectField('laminate','Laminate',['none','matt','gloss','antigraffiti'], def.laminate||'none'));
      cfg.appendChild(selectField('contourCut','Contour cut?',['false','true'], String(def.contourCut||false)));
    }
    if(type==='WINDOW_WALL_VINYL'){
      addNum('areaM2','Area (m²)', def.areaM2||5, 0.1);
      cfg.appendChild(selectField('laminate','Laminate',['matt','gloss','antiSlipR10','none'], def.laminate||'matt'));
      cfg.appendChild(selectField('contourCut','Contour cut?',['false','true'], String(def.contourCut||false)));
      cfg.appendChild(selectField('install','Install?',['false','true'], String(def.install||false)));
      addNum('installHeightM','Install height (m)', def.installHeightM||2.4, 0.1);
    }
    if(type==='BANNER_POSTER'){
      cfg.appendChild(selectField('material','Material',['PVC Banner 440gsm','Mesh Banner 340gsm','Poster 200gsm'], def.material||'PVC Banner 440gsm'));
      cfg.appendChild(selectField('finish','Finishing',['none','hem_eyelet_sides','hem_eyelet_all'], def.finish||'hem_eyelet_all'));
      cfg.appendChild(selectField('turnaround','Turnaround',['standard','priority'], def.turnaround||'standard'));
    }
    if(type==='WAYFINDING_PACK'){
      addNum('doorSigns','Door signs (qty)', def.doorSigns||10);
      addNum('directional','Directional signs (qty)', def.directional||6);
      addNum('directoryBoards','Directory boards (qty)', def.directoryBoards||1);
      cfg.appendChild(selectField('substrate','Substrate',['Acrylic 3mm','Foamex 5mm','ACM 3mm'], def.substrate||'Acrylic 3mm'));
      cfg.appendChild(selectField('fixings','Fixings',['stand_off','rail','tape'], def.fixings||'stand_off'));
      cfg.appendChild(selectField('design','Design',['simple','standard','complex'], def.design||'standard'));
      cfg.appendChild(selectField('install','Install?',['true','false'], String(def.install||true)));
    }
    if(type==='VEHICLE_DECAL'){
      cfg.appendChild(selectField('vehicleClass','Vehicle class',['car','van_swb','van_lwb','luton','hgv'], def.vehicleClass||'van_lwb'));
      cfg.appendChild(selectField('coverage','Coverage',['decals','partial_wrap','full_wrap'], def.coverage||'decals'));
      cfg.appendChild(selectField('laminate','Laminate',['cast','none'], def.laminate||'cast'));
    }
    if(type==='HOARDING'){
      addNum('linearM','Linear metres', def.linearM||25);
      addNum('heightM','Height (m)', def.heightM||2.4, 0.1);
      cfg.appendChild(selectField('panelMaterial','Panel material',['ACM 3mm','Foamex 5mm'], def.panelMaterial||'ACM 3mm'));
      cfg.appendChild(selectField('laminate','Laminate',['matt','gloss'], def.laminate||'matt'));
      cfg.appendChild(selectField('freeStanding','Free-standing?',['true','false'], String(def.freeStanding||true)));
      cfg.appendChild(selectField('site','Site',['easy','standard','complex'], def.site||'standard'));
      cfg.appendChild(selectField('install','Install?',['true','false'], String(def.install||true)));
    }
  }

  select.addEventListener('change', ()=>renderFields(select.value));
  renderFields(select.value);

  const run = async ()=>{
    const inputs = {};
    $$('input,select', cfg).forEach(el=>{
      let v = el.value;
      if(el.type==='number') v = Number(v);
      if(el.tagName==='SELECT' && (v==='true'||v==='false')) v = (v==='true');
      inputs[el.id]=v;
    });
    const res = await api.calculateQuote({ productType: select.value, inputs });
    $('#sim-total').textContent = fmtGBP(res.totals.grandTotal);
    const bd = $('#sim-breakdown'); bd.innerHTML='';
    ['materials','machines','labour','logistics','extras'].forEach(bucket=>{
      const rows = res.breakdown[bucket]; if(!rows||rows.length===0) return;
      const head = document.createElement('div'); head.style.fontWeight='700'; head.textContent = bucket.toUpperCase();
      bd.appendChild(head);
      rows.forEach(r=>{
        const line = document.createElement('div');
        const name = r.name||r.label||r.role;
        const right = r.mins ? `${Math.round(r.mins)} min • ${fmtGBP(r.cost)}` : fmtGBP(r.cost);
        line.className='hstack'; line.style.justifyContent='space-between';
        line.innerHTML = `<span>${name}</span><span>${right}</span>`;
        bd.appendChild(line);
      });
      bd.appendChild(Object.assign(document.createElement('div'),{className:'hr'}));
    });
  };

  cfg.addEventListener('input', debounce(run, 100));
  cfg.addEventListener('change', debounce(run, 50));
  run();
}

function renderQuotes(){
  const wrap = $('#quotes-list'); wrap.innerHTML='';
  api.listQuotes().then(list=>{
    if(list.length===0){ wrap.innerHTML = '<div class="card"><div class="card-body">No quotes yet.</div></div>'; return; }
    list.forEach(q=>{
      const c = document.createElement('div'); c.className='card';
      c.innerHTML = `<div class="card-body hstack" style="justify-content:space-between">
        <div class="stack">
          <div><b>${q.productType.replaceAll('_',' ')}</b></div>
          <div class="small mono">${q.number}</div>
        </div>
        <div class="kpi">${fmtGBP(q.totals.grandTotal)}</div>
        <a class="btn" href="../customer.html#share=${encodeURIComponent(q.shareToken || q.id)}">open →</a>

      </div>`;
      wrap.appendChild(c);
    });
  });
}

function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms);} }
