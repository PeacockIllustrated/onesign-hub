
import { store, uid, nowIso } from './common.js';
import { priceBook } from './pricebook.js';
export const api = {
  async latestPublishedPriceBookMeta(){ return priceBook.meta(); },
  async calculateQuote(body){
    const { productType, inputs } = body;
    const pb = priceBook.current();
    const calc = calculators[productType];
    if(!calc) throw new Error('Unsupported productType');
    return calc(pb, inputs);
  },
  async createCustomerQuote({ productType, inputs, clientMeta }){
    const { breakdown, totals, validatedInputs } = await this.calculateQuote({productType, inputs});
    const id = uid('Q-') + '-' + Date.now();
    const shareToken = uid('share-');
    const record = { id, number:id, status:'sent', priceBookVersion:priceBook.version(), productType, inputs:validatedInputs, breakdown, totals, clientMeta: clientMeta||null, createdAt:nowIso(), shareToken };
    store.set('quote:'+id, record);
    const shareUrl = `${location.origin}${location.pathname.replace('admin.html','customer.html')}#share=${encodeURIComponent(id)}`;
    return { quoteId:id, shareUrl };
  },
  async fetchSharedQuote(id){ return store.get('quote:'+id, null); },
  async listQuotes(){ const keys = Object.keys(localStorage).filter(k=>k.startsWith('quote:')); return keys.map(k=>store.get(k)).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||'')); },
  async publishPriceBook(){ const v = priceBook.publish(); return { version: v }; }
};
const GBP = (n) => Math.round(n);
function m2FromDims(mmW, mmH, qty){ return (mmW/1000) * (mmH/1000) * qty; }
function roundPolicy(pence, policy){ if(policy==='nearest_5'){ const pounds = Math.round((pence/100)/5)*5; return pounds*100; } return Math.round(pence/100)*100; }
const calculators = {
  'ACM_TRAY_SIGN': (pb, inputs) => {
    const i = Object.assign({ qty:1, folds:true, returnsDepthMm:50, lit:'none', install:false, installHeightM:2 }, inputs);
    const area = m2FromDims(i.widthMm, i.heightMm, i.qty);
    const acm = pb.materials.find(m=>m.name.includes('ACM 3mm')) || pb.materials[0];
    const printVinyl = pb.materials.find(m=>m.name.toLowerCase().includes('vinyl')) || pb.materials[0];
    const lam = pb.materials.find(m=>m.name.toLowerCase().includes('laminate')) || printVinyl;
    const sheetArea = (acm.sheet.widthMm/1000) * (acm.sheet.heightMm/1000);
    const sheetsNeeded = Math.ceil((area * 1.05) / sheetArea);
    const materialCost = (sheetsNeeded * acm.sheet.costPerSheet)
                       + GBP(area * (printVinyl.roll.costPerLinearM / (printVinyl.roll.widthMm/1000)))
                       + GBP(area * (lam.roll.costPerLinearM / (lam.roll.widthMm/1000)));
    const printer = pb.machines.find(m=>m.type==='printer'); const cnc = pb.machines.find(m=>m.type==='cnc');
    const printMins = (area / (printer.throughputM2PerHour||10)) * 60 + printer.setupMins;
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
      const miles = 10;
      logistics += GBP(pb.logistics.travelPerMile * miles) + GBP(pb.logistics.parkingPerDay);
      if(i.installHeightM>3) logistics += GBP(pb.logistics.cherryPickerPerDay);
    }
    const materials = materialCost, machines = machineCost, labourCostP = labourCost, logisticsCost = logistics, extras = electricalCost;
    let subTotal = materials + machines + labourCostP + logisticsCost + extras;
    const margin = Math.max(pb.rules.marginGuardrailPct.min, pb.defaultMarginPct||30);
    const withMargin = GBP(subTotal * (1 + margin/100));
    const rounded = roundPolicy(withMargin, 'nearest_1');
    const vat = GBP(rounded * 0.20);
    const total = rounded + vat;
    return {
      validatedInputs: i,
      breakdown: {
        materials: [{name:'ACM + Print + Lam', qty:sheetsNeeded, uom:'sheet', cost:materialCost}],
        machines: [{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60) * printer.ratePerHour)},{name:cnc.name, mins:cncMins, cost:GBP((cncMins/60) * cnc.ratePerHour)}],
        labour: [{role:'design', mins:designMins, cost:GBP((designMins/60)*labour.design)},
                 {role:'production', mins:productionMins, cost:GBP((productionMins/60)*labour.production)}]
                 .concat(i.install?[{role:'install', mins:installMins, cost:GBP((installMins/60)*labour.install)}]:[]),
        logistics: i.install? [{label:'Travel + Parking + Access', cost:logisticsCost}]:[],
        extras: i.lit!=='none' ? [{label:'LED + PSU', cost:electricalCost}] : []
      },
      totals: { materials, machines, labour: labourCostP, logistics: logisticsCost, extras,
        subTotal, marginPct: margin, marginValue: GBP(subTotal*(margin/100)), roundedSubTotal: rounded, vat, grandTotal: total }
    };
  },
  'PRINTED_PANEL': (pb, inputs) => {
    const i = Object.assign({ qty:1, substrate:'Foamex 5mm', contourCut:false, laminate:'none' }, inputs);
    const area = m2FromDims(i.widthMm, i.heightMm, i.qty);
    const vinyl = pb.materials.find(m=>m.name.toLowerCase().includes('vinyl'));
    const lam = pb.materials.find(m=> (i.laminate!=='none') && m.name.toLowerCase().includes('laminate'));
    const substrate = pb.materials.find(m=>m.name.includes(i.substrate)) || pb.materials[0];
    let materialCost = GBP(area * (vinyl.roll.costPerLinearM / (vinyl.roll.widthMm/1000)));
    if(lam) materialCost += GBP(area * (lam.roll.costPerLinearM / (lam.roll.widthMm/1000)));
    const sheetArea = (substrate.sheet.widthMm/1000) * (substrate.sheet.heightMm/1000);
    const sheets = Math.ceil((area*1.04)/sheetArea);
    materialCost += sheets * substrate.sheet.costPerSheet;
    const printer = pb.machines.find(m=>m.type==='printer'); const plotter = pb.machines.find(m=>m.type==='plotter');
    const printMins = (area / (printer.throughputM2PerHour||12)) * 60 + printer.setupMins;
    const cutMins = i.contourCut ? (10 + area*12) : 0;
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour);
    const labour = pb.labourRates;
    const designMins = 10; const productionMins = 10 + (i.contourCut?12:0);
    const labourCost = GBP((designMins/60)*labour.design + (productionMins/60)*labour.production);
    const subTotal = materialCost + machineCost + labourCost;
    const margin = pb.defaultMarginPct||30;
    const rounded = roundPolicy(GBP(subTotal*(1+margin/100)), 'nearest_1');
    const vat = GBP(rounded*0.20);
    const total = rounded + vat;
    return {
      validatedInputs:i,
      breakdown:{
        materials:[{name:`${i.substrate} + print${lam?' + lam':''}`, qty:sheets, uom:'sheet', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)}]
                 .concat(i.contourCut?[{name:plotter.name, mins:Math.round(cutMins), cost:GBP((cutMins/60)*plotter.ratePerHour)}]:[]),
        labour:[{role:'design', mins:designMins, cost:GBP((designMins/60)*labour.design)},
                {role:'production', mins:productionMins, cost:GBP((productionMins/60)*labour.production)}]
      },
      totals:{ materials:materialCost, machines:machineCost, labour:labourCost, logistics:0, extras:0,
        subTotal, marginPct:margin, marginValue:GBP(subTotal*(margin/100)), roundedSubTotal:rounded, vat, grandTotal:total }
    };
  },
  'WINDOW_WALL_VINYL': (pb, inputs) => {
    const i = Object.assign({ areaM2:5, laminate:'matt', contourCut:false, install:false }, inputs);
    const vinyl = pb.materials.find(m=>m.name.toLowerCase().includes('vinyl'));
    const lam = pb.materials.find(m=> m.name.toLowerCase().includes('laminate'));
    const printer = pb.machines.find(m=>m.type==='printer'); const plotter = pb.machines.find(m=>m.type==='plotter'); const app = pb.machines.find(m=>m.type==='applicator');
    let materialCost = GBP(i.areaM2 * (vinyl.roll.costPerLinearM / (vinyl.roll.widthMm/1000)));
    materialCost += GBP(i.areaM2 * (lam.roll.costPerLinearM / (lam.roll.widthMm/1000)));
    const printMins = (i.areaM2 / (printer.throughputM2PerHour||14)) * 60 + printer.setupMins;
    const cutMins = i.contourCut ? (10 + i.areaM2*10) : 0;
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour) + GBP((i.areaM2/10)*app.ratePerHour/6);
    const labour = pb.labourRates;
    const productionMins = 10 + i.areaM2*8 + (i.contourCut?12:0);
    let labourCost = GBP((productionMins/60)*labour.production);
    let logistics=0; let installCost=0;
    if(i.install){
      const installMins = i.areaM2*20 + (i.installHeightM>3?30:0);
      installCost = GBP((installMins/60)*labour.install);
      logistics += GBP(pb.logistics.travelPerMile*10) + GBP(pb.logistics.parkingPerDay);
    }
    labourCost += installCost;
    const subTotal = materialCost + machineCost + labourCost + logistics;
    const margin = pb.defaultMarginPct||30;
    const rounded = roundPolicy(GBP(subTotal*(1+margin/100)), 'nearest_1');
    const vat = GBP(rounded*0.20);
    const total = rounded + vat;
    return {
      validatedInputs:i,
      breakdown:{
        materials:[{name:'Print Vinyl + Laminate', qty:i.areaM2, uom:'m2', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)}]
                 .concat(i.contourCut?[{name:plotter.name, mins:Math.round(cutMins), cost:GBP((cutMins/60)*plotter.ratePerHour)}]:[]),
        labour:[{role:'production', mins:productionMins, cost:GBP((productionMins/60)*labour.production)}]
                .concat(i.install?[{role:'install', mins:Math.round(i.areaM2*20), cost:installCost}]:[]),
        logistics: i.install? [{label:'Travel + Parking', cost:logistics}]:[]
      },
      totals:{ materials:materialCost, machines:machineCost, labour:labourCost, logistics, extras:0,
        subTotal, marginPct:margin, marginValue:GBP(subTotal*(margin/100)), roundedSubTotal:rounded, vat, grandTotal:total }
    };
  }
};
