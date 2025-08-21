
import { store, nowIso } from './common.js';
const DEFAULT = {
  version: 1, status: 'published', defaultMarginPct: 35,
  labourRates: { design: 3500, production: 3000, install: 4200 },
  logistics: { travelPerMile: 80, parkingPerDay: 1200, cherryPickerPerDay: 22000, trafficMgmtPerDay: 35000 },
  rules: { wastageDefaultPct: 5, rushMultipliers: {standard:1, priority:1.25}, marginGuardrailPct:{min:20,max:70} },
  materials: [
    { id:'acm3', kind:'sheet', name:'ACM 3mm', sheet:{ widthMm:3050, heightMm:1500, thicknessMm:3, costPerSheet: 3900 } },
    { id:'foam5', kind:'sheet', name:'Foamex 5mm', sheet:{ widthMm:2440, heightMm:1220, thicknessMm:5, costPerSheet: 2600 } },
    { id:'acry3', kind:'sheet', name:'Acrylic 3mm', sheet:{ widthMm:2440, heightMm:1220, thicknessMm:3, costPerSheet: 4200 } },
    { id:'vinyl', kind:'roll', name:'Print Vinyl 1370mm', roll:{ widthMm:1370, costPerLinearM: 900 } },
    { id:'lam', kind:'roll', name:'Laminate 1370mm', roll:{ widthMm:1370, costPerLinearM: 700 } },
    { id:'led', kind:'led', name:'LED Module', unit:{ uom:'each', costPerUnit: 120 } },
    { id:'psu', kind:'psu', name:'LED PSU 100W', unit:{ uom:'each', costPerUnit: 2800 } },
  ],
  machines: [
    { id:'hp-latex', type:'printer', name:'HP Latex / Anapurna', ratePerHour: 4500, setupMins: 8, throughputM2PerHour: 12 },
    { id:'cnc', type:'cnc', name:'Piranha CNC', ratePerHour: 4200, setupMins: 5, throughputM2PerHour: 20 },
    { id:'laser', type:'laser', name:'Boxford Laser', ratePerHour: 4000, setupMins: 5, throughputM2PerHour: 8 },
    { id:'plotter', type:'plotter', name:'Mimaki Plotter', ratePerHour: 3600, setupMins: 5, throughputM2PerHour: 15 },
    { id:'app', type:'applicator', name:'Rollsroller Applicator', ratePerHour: 3000, setupMins: 0, throughputM2PerHour: 40 },
  ],
  productPresets: [
    { id:'preset-tray', type:'ACM_TRAY_SIGN', label:'ACM Tray Sign (lit/non-lit)', ui:{ steps:['Basics','Finishing','Install'] }, defaults:{ widthMm:2000, heightMm:700, qty:1, lit:'none', install:false, installHeightM:2.4 }, inputSchema:{} },
    { id:'preset-panel', type:'PRINTED_PANEL', label:'Printed Panel', ui:{ steps:['Basics','Finishing'] }, defaults:{ widthMm:1000, heightMm:700, qty:1, substrate:'Foamex 5mm', contourCut:false, laminate:'none' }, inputSchema:{} },
    { id:'preset-vinyl', type:'WINDOW_WALL_VINYL', label:'Window/Wall Vinyl', ui:{ steps:['Basics','Finishing','Install'] }, defaults:{ areaM2:5, laminate:'matt', contourCut:false, install:false, installHeightM:2.4 }, inputSchema:{} }
  ],
  publishedAt: nowIso()
};
function getPB(){ return store.get('PB:PUBLISHED', DEFAULT); }
function getDraft(){ return store.get('PB:DRAFT', null); }
export const priceBook = {
  current(){ return getPB(); },
  version(){ return getPB().version; },
  meta(){ const pb = getPB(); const { version, productPresets } = pb; return { version, productPresets }; },
  draft(){ return getDraft() || Object.assign({}, getPB(), {status:'draft'}); },
  saveDraft(patch){ const draft = Object.assign({}, this.draft(), patch, {status:'draft'}); store.set('PB:DRAFT', draft); return draft; },
  publish(){ const draft = this.draft(); const published = Object.assign({}, draft, { status:'published', version: (getPB().version||1)+1, publishedAt: nowIso() }); store.set('PB:PUBLISHED', published); store.del('PB:DRAFT'); return published.version; }
};
