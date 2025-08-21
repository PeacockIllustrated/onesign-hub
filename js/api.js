import { store, uid, nowIso } from './common.js';
import { priceBook } from './pricebook.js';

export const api = {
  async latestPublishedPriceBookMeta(){ return priceBook.meta(); },

  async calculateQuote(body){
    const { productType, inputs } = body;
    const pb = priceBook.current();
    const calc = calculators[productType];
    if(!calc) throw new Error('Unsupported productType');
    const res = calc(pb, inputs);
    return res;
  },

  async createCustomerQuote({ productType, inputs, clientMeta }){
    const { breakdown, totals, validatedInputs } = await this.calculateQuote({productType, inputs});
    const id = uid('Q-') + '-' + Date.now();
    const shareToken = uid('share-');
    const record = {
      id, number: id, status:'sent',
      priceBookVersion: priceBook.version(),
      productType, inputs: validatedInputs, breakdown, totals,
      clientMeta: clientMeta || null, createdAt: nowIso(), shareToken
    };
    store.set('quote:'+id, record);
    const shareUrl = `${location.origin}${location.pathname.replace('admin.html','customer.html')}#share=${encodeURIComponent(id)}`;
    return { quoteId:id, shareUrl };
  },

  async fetchSharedQuote(id){
    return store.get('quote:'+id, null);
  },

  async listQuotes(){
    const keys = Object.keys(localStorage).filter(k=>k.startsWith('quote:'));
    return keys.map(k=>store.get(k)).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  },

  async publishPriceBook(){
    const v = priceBook.publish();
    return { version: v };
  }
};

// ---- Calculators ----
const GBP = (n) => Math.round(n);
const clamp = (x,min,max)=> Math.max(min, Math.min(max, x));

function m2FromDims(mmW, mmH, qty){ return (mmW/1000) * (mmH/1000) * qty; }
function roundPolicy(pence, policy){ if(policy==='nearest_5'){ const pounds = Math.round((pence/100)/5)*5; return pounds*100; } return Math.round(pence/100)*100; }
function rollCost(areaM2, roll){ return GBP(areaM2 * (roll.costPerLinearM / (roll.widthMm/1000))); }
function addVAT(p){ return GBP(p * 0.20); }

function service(pb, id){ return (pb.services||[]).find(s=>s.id===id) || { pricePerUnit:0 }; }

// Common finish time helpers
const time = {
  printMins(area, printer){ return (area / (printer.throughputM2PerHour||12)) * 60 + (printer.setupMins||0); },
  cutMins(area, plotter, contour){ return contour ? (10 + area*10) : 0; },
  appMins(area, applicator){ return (area/10)*60/(applicator.throughputM2PerHour||40); }
};

const calculators = {
  // --- Existing (kept) ---
  'ACM_TRAY_SIGN': (pb, inputs) => {
    const i = Object.assign({ qty:1, folds:true, returnsDepthMm:50, lit:'none', install:false, installHeightM:2 }, inputs);
    const area = m2FromDims(i.widthMm, i.heightMm, i.qty);
    const acm = pb.materials.find(m=>m.name.includes('ACM 3mm')) || pb.materials[0];
    const printVinyl = pb.materials.find(m=>m.id==='vinyl137') || pb.materials[0];
    const lam = pb.materials.find(m=>m.id==='lam137') || printVinyl;
    const sheetArea = (acm.sheet.widthMm/1000) * (acm.sheet.heightMm/1000);
    const sheetsNeeded = Math.ceil((area * 1.05) / sheetArea);
    const materialCost = (sheetsNeeded * acm.sheet.costPerSheet)
                       + rollCost(area, printVinyl.roll)
                       + rollCost(area, lam.roll);
    const printer = pb.machines.find(m=>m.type==='printer'); const cnc = pb.machines.find(m=>m.type==='cnc');
    const printMins = time.printMins(area, printer);
    const cncMins = 15 + (i.folds ? 20 : 5);
    const machineCost = GBP((printMins/60) * printer.ratePerHour) + GBP((cncMins/60)*cnc.ratePerHour);
    const labour = pb.labourRates;
    let designMins = 15; let productionMins = 20 + (i.folds?20:0); let installMins = i.install ? (45 + area*25 + (i.installHeightM>3?45:0)) : 0;
    const labourCost = GBP((designMins/60)*labour.design + (productionMins/60)*labour.production + (installMins/60)*labour.install);
    let electricalCost = 0;
    if(i.lit !== 'none'){
      const led = pb.materials.find(m=>m.kind==='led'); const psu = pb.materials.find(m=>m.kind==='psu');
      const modules = Math.ceil(area * (i.lit==='backlit'? 30 : 18));
      electricalCost = GBP(modules * led.unit.costPerUnit + Math.max(1,Math.ceil(modules/70))*psu.unit.costPerUnit);
    }
    let logistics = 0;
    if(i.install){
      const miles = 10; logistics += GBP(pb.logistics.travelPerMile * miles) + GBP(pb.logistics.parkingPerDay);
      if(i.installHeightM>3) logistics += GBP(pb.logistics.cherryPickerPerDay);
    }
    const materials = materialCost, machines = machineCost, labourCostP = labourCost, logisticsCost = logistics, extras = electricalCost;
    let subTotal = materials + machines + labourCostP + logisticsCost + extras;
    const margin = Math.max(pb.rules.marginGuardrailPct.min, pb.defaultMarginPct||30);
    const withMargin = GBP(subTotal * (1 + margin/100));
    const rounded = roundPolicy(withMargin, 'nearest_1');
    const vat = addVAT(rounded);
    const total = rounded + vat;
    return {
      validatedInputs: i,
      breakdown: {
        materials: [{name:'ACM + Print + Lam', qty:sheetsNeeded, uom:'sheet', cost:mate]()
