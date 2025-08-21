import { store, nowIso } from './common.js';

/**
 * PriceBook model (draft/published) — now includes:
 * - materials, machines, labour, logistics, rules (as before)
 * - services: generic priced service items (finishing, fixings, delivery, etc.)
 * - productPresets: now includes BANNER_POSTER, WAYFINDING_PACK, VEHICLE_DECAL, HOARDING
 */
const DEFAULT = {
  version: 1,
  status: 'published',
  defaultMarginPct: 35,
  labourRates: { design: 3500, production: 3000, install: 4200 }, // pence per hour
  logistics: {
    travelPerMile: 80,
    parkingPerDay: 1200,
    cherryPickerPerDay: 22000,
    trafficMgmtPerDay: 35000
  },
  rules: {
    wastageDefaultPct: 5,
    rushMultipliers: { standard: 1, priority: 1.25 },
    marginGuardrailPct: { min: 20, max: 70 }
  },
  // MATERIALS
  materials: [
    // Sheets
    { id:'acm3',   kind:'sheet', name:'ACM 3mm',        sheet:{ widthMm:3050, heightMm:1500, thicknessMm:3, costPerSheet: 3900 } },
    { id:'foam5',  kind:'sheet', name:'Foamex 5mm',     sheet:{ widthMm:2440, heightMm:1220, thicknessMm:5, costPerSheet: 2600 } },
    { id:'acry3',  kind:'sheet', name:'Acrylic 3mm',    sheet:{ widthMm:2440, heightMm:1220, thicknessMm:3, costPerSheet: 4200 } },
    // Rolls (printable + laminates)
    { id:'vinyl137', kind:'roll', name:'Print Vinyl 1370mm',     roll:{ widthMm:1370, costPerLinearM: 900 } },
    { id:'lam137',   kind:'roll', name:'Laminate 1370mm',        roll:{ widthMm:1370, costPerLinearM: 700 } },
    { id:'banner440',kind:'roll', name:'PVC Banner 440gsm 1600mm',roll:{ widthMm:1600, costPerLinearM: 1100 } },
    { id:'mesh340',  kind:'roll', name:'Mesh Banner 340gsm 1370mm',roll:{ widthMm:1370, costPerLinearM: 980 } },
    { id:'poster200',kind:'roll', name:'Poster Paper 200gsm 914mm', roll:{ widthMm:914,  costPerLinearM: 600 } },
    { id:'castWrap', kind:'roll', name:'Cast Wrap Vinyl 1520mm',   roll:{ widthMm:1520, costPerLinearM: 2100 } },
    { id:'castLam',  kind:'roll', name:'Cast Laminate 1520mm',     roll:{ widthMm:1520, costPerLinearM: 1700 } },
    { id:'r10lam',   kind:'roll', name:'Anti-slip R10 Lam 1370mm', roll:{ widthMm:1370, costPerLinearM: 1300 } },
    { id:'apptape',  kind:'roll', name:'Application Tape 1220mm',  roll:{ widthMm:1220, costPerLinearM: 350 } },
    // LEDs/PSU
    { id:'led', kind:'led', name:'LED Module', unit:{ uom:'each', costPerUnit: 120 } },
    { id:'psu', kind:'psu', name:'LED PSU 100W', unit:{ uom:'each', costPerUnit: 2800 } },
  ],
  // MACHINES
  machines: [
    { id:'hp-latex', type:'printer',    name:'HP Latex / Anapurna', ratePerHour: 4500, setupMins: 8, throughputM2PerHour: 12 },
    { id:'cnc',      type:'cnc',        name:'Piranha CNC',         ratePerHour: 4200, setupMins: 5, throughputM2PerHour: 20 },
    { id:'laser',    type:'laser',      name:'Boxford Laser',       ratePerHour: 4000, setupMins: 5, throughputM2PerHour: 8 },
    { id:'plotter',  type:'plotter',    name:'Mimaki Plotter',      ratePerHour: 3600, setupMins: 5, throughputM2PerHour: 15 },
    { id:'app',      type:'applicator', name:'Rollsroller Applicator', ratePerHour: 3000, setupMins: 0, throughputM2PerHour: 40 },
  ],
  // SERVICES (generic priced actions/fixings/logistics not covered by materials)
  services: [
    { id:'hemEyeletPerM',   category:'finishing', name:'Hem & Eyelets (per metre)', uom:'m',   pricePerUnit: 250 },
    { id:'eyeletEach',      category:'finishing', name:'Extra Eyelet (each)',       uom:'each',pricePerUnit: 40 },
    { id:'standOffEach',    category:'fixings',   name:'Stand-off Fixing (each)',   uom:'each',pricePerUnit: 350 },
    { id:'railPerM',        category:'fixings',   name:'Sign Rail (per metre)',     uom:'m',   pricePerUnit: 800 },
    { id:'postPerM',        category:'fixings',   name:'Post (per metre)',          uom:'m',   pricePerUnit: 900 },
    { id:'surveyFixed',     category:'ops',       name:'Site Survey (fixed)',       uom:'each',pricePerUnit: 7500 },
    { id:'permitAdmin',     category:'ops',       name:'Permit/Admin (fixed)',      uom:'each',pricePerUnit: 4500 },
    { id:'courierParcel',   category:'delivery',  name:'Courier (per parcel)',      uom:'each',pricePerUnit: 1200 },
    { id:'vehicleBayHour',  category:'ops',       name:'Vehicle Bay (per hour)',    uom:'hour',pricePerUnit: 2000 }
  ],
  // PRODUCT PRESETS
  productPresets: [
    {
      id:'preset-tray', type:'ACM_TRAY_SIGN', label:'ACM Tray Sign (lit/non-lit)',
      ui:{ steps:['Basics','Finishing','Install'] },
      defaults:{ widthMm:2000, heightMm:700, qty:1, lit:'none', install:false, installHeightM:2.4 },
      inputSchema:{}
    },
    {
      id:'preset-panel', type:'PRINTED_PANEL', label:'Printed Panel',
      ui:{ steps:['Basics','Finishing'] },
      defaults:{ widthMm:1000, heightMm:700, qty:1, substrate:'Foamex 5mm', contourCut:false, laminate:'none' },
      inputSchema:{}
    },
    {
      id:'preset-vinyl', type:'WINDOW_WALL_VINYL', label:'Window/Wall Vinyl',
      ui:{ steps:['Basics','Finishing','Install'] },
      defaults:{ areaM2:5, laminate:'matt', contourCut:false, install:false, installHeightM:2.4 },
      inputSchema:{}
    },
    {
      id:'preset-banner', type:'BANNER_POSTER', label:'Banners & Posters',
      ui:{ steps:['Basics','Finishing','Speed'] },
      defaults:{ widthMm:2000, heightMm:1000, qty:1, material:'PVC Banner 440gsm', finish:'hem_eyelet_all', turnaround:'standard' },
      inputSchema:{}
    },
    {
      id:'preset-wayfinding', type:'WAYFINDING_PACK', label:'Wayfinding Pack',
      ui:{ steps:['Counts','Spec','Install'] },
      defaults:{ doorSigns:10, directional:6, directoryBoards:1, substrate:'Acrylic 3mm', fixings:'stand_off', design:'standard', install:true },
      inputSchema:{}
    },
    {
      id:'preset-vehicle', type:'VEHICLE_DECAL', label:'Vehicle Decals/Wrap (estimator)',
      ui:{ steps:['Vehicle','Coverage','Finishing'] },
      defaults:{ vehicleClass:'van_lwb', coverage:'decals', laminate:'cast', sides:true, rear:true, bonnet:false },
      inputSchema:{}
    },
    {
      id:'preset-hoarding', type:'HOARDING', label:'Site Hoarding',
      ui:{ steps:['Basics','Structure','Install'] },
      defaults:{ linearM:25, heightM:2.4, panelMaterial:'ACM 3mm', laminate:'matt', freeStanding:true, site:'standard', install:true },
      inputSchema:{}
    }
  ],
  publishedAt: nowIso()
};

function getPB(){ return store.get('PB:PUBLISHED', DEFAULT); }
function getDraft(){ return store.get('PB:DRAFT', null); }

export const priceBook = {
  current(){ return getPB(); },
  version(){ return getPB().version; },
  meta(){
    const pb = getPB();
    const { version, productPresets } = pb;
    return { version, productPresets };
  },
  draft(){
    return getDraft() || Object.assign({}, getPB(), {status:'draft'});
  },
  saveDraft(patch){
    const draft = Object.assign({}, this.draft(), patch, {status:'draft'});
    store.set('PB:DRAFT', draft);
    return draft;
  },
  publish(){
    const draft = this.draft();
    const published = Object.assign({}, draft, { status:'published', version: (getPB().version||1)+1, publishedAt: nowIso() });
    store.set('PB:PUBLISHED', published);
    store.del('PB:DRAFT');
    return published.version;
  }
};
