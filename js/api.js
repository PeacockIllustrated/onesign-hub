import { store, uid, nowIso } from './common.js';
import { db, doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, getDocs, runTransaction } from './firebase.js';
import { priceBook } from './pricebook.js';

export const api = {
  async latestPublishedPriceBookMeta(){
    try{
      const snap = await getDoc(doc(db, 'pricebook', 'published'));
      if(snap.exists()){
        const pb = snap.data();
        return { version: pb.version, productPresets: pb.productPresets };
      }
    }catch(e){ /* fallback to local */ }
    return priceBook.meta();
  },

  async _getCurrentPB(){
    try{
      const snap = await getDoc(doc(db, 'pricebook', 'published'));
      if(snap.exists()) return snap.data();
    }catch(e){}
    return priceBook.current();
  },

  async calculateQuote(body){
    const { productType, inputs } = body;
    const pb = await this._getCurrentPB();
    const calc = calculators[productType];
    if(!calc) throw new Error('Unsupported productType');
    const res = calc(pb, inputs);
    return res;
  },

  async createCustomerQuote({ productType, inputs, clientMeta }){
    const { breakdown, totals, validatedInputs } = await this.calculateQuote({productType, inputs});
    const id = uid('Q-') + '-' + Date.now();
    const shareToken = uid('share-') + Date.now();
    const record = {
      id, number: id, status:'sent',
      priceBookVersion: (await this.latestPublishedPriceBookMeta()).version || priceBook.version(),
      productType, inputs: validatedInputs, breakdown, totals,
      clientMeta: clientMeta || null, createdAt: nowIso(), shareToken
    };
    // Firestore write
    try{
      const docRef = await addDoc(collection(db,'quotes'), Object.assign({}, record, { createdAt: serverTimestamp() }));
      await setDoc(doc(db,'shares', shareToken), { quoteId: docRef.id, createdAt: serverTimestamp() });
      // local fallback copy
      store.set('quote:'+id, record);
    }catch(e){
      // fallback entirely to local if offline
      store.set('quote:'+id, record);
    }
    const shareUrl = `${location.origin}${location.pathname.replace('admin.html','customer.html')}#share=${encodeURIComponent(shareToken)}`;
    return { quoteId:id, shareUrl };
  },

  async fetchSharedQuote(tokenOrId){
    // Prefer token flow -> shares/{token} -> quotes/{id}
    if(typeof tokenOrId === 'string' && tokenOrId.startsWith('share-')){
      try{
        const shareSnap = await getDoc(doc(db,'shares', tokenOrId));
        if(shareSnap.exists()){
          const { quoteId } = shareSnap.data();
          const qSnap = await getDoc(doc(db,'quotes', quoteId));
          if(qSnap.exists()) return qSnap.data();
        }
      }catch(e){ /* fall through */ }
      // last resort: local by exact id (dev)
      return store.get('quote:'+tokenOrId, null);
    }
    // legacy path: direct quote id
    try{
      const qSnap = await getDoc(doc(db,'quotes', tokenOrId));
      if(qSnap.exists()) return qSnap.data();
    }catch(e){}
    return store.get('quote:'+tokenOrId, null);
  },

  async listQuotes(){
    try{
      const qy = query(collection(db,'quotes'), orderBy('createdAt','desc'));
      const snap = await getDocs(qy);
      return snap.docs.map(d=> Object.assign({ id: d.id }, d.data()));
    }catch(e){
      const keys = Object.keys(localStorage).filter(k=>k.startsWith('quote:'));
      return keys.map(k=>store.get(k)).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    }
  },

  async publishPriceBook(){
    // Take current local draft, publish to Firestore with version bump
    const draft = priceBook.draft();
    let newVersion = draft.version || 1;
    try{
      await runTransaction(db, async (txn)=>{
        const pubRef = doc(db,'pricebook','published');
        const cur = await txn.get(pubRef);
        const curV = cur.exists() ? (cur.data().version||1) : 1;
        newVersion = curV + 1;
        const published = Object.assign({}, draft, { status:'published', version:newVersion, publishedAt: new Date().toISOString() });
        txn.set(pubRef, published);
      });
      return { version: newVersion };
    }catch(e){
      // fallback to local publish if Firestore not available
      const v = priceBook.publish();
      return { version: v };
    }
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
        materials: [{name:'ACM + Print + Lam', qty:sheetsNeeded, uom:'sheet', cost:materialCost}],
        machines: [{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60) * printer.ratePerHour)},
                   {name:cnc.name, mins:cncMins, cost:GBP((cncMins/60) * cnc.ratePerHour)}],
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
    const vinyl = pb.materials.find(m=>m.id==='vinyl137');
    const lam = i.laminate!=='none' ? pb.materials.find(m=>m.id==='lam137') : null;
    const substrate = pb.materials.find(m=>m.name.includes(i.substrate)) || pb.materials[0];
    let materialCost = rollCost(area, vinyl.roll);
    if(lam) materialCost += rollCost(area, lam.roll);
    const sheetArea = (substrate.sheet.widthMm/1000) * (substrate.sheet.heightMm/1000);
    const sheets = Math.ceil((area*1.04)/sheetArea);
    materialCost += sheets * substrate.sheet.costPerSheet;
    const printer = pb.machines.find(m=>m.type==='printer'); const plotter = pb.machines.find(m=>m.type==='plotter');
    const printMins = time.printMins(area, printer);
    const cutMins = time.cutMins(area, plotter, i.contourCut);
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour);
    const labour = pb.labourRates;
    const designMins = 10; const productionMins = 10 + (i.contourCut?12:0);
    const labourCost = GBP((designMins/60)*labour.design + (productionMins/60)*labour.production);
    const subTotal = materialCost + machineCost + labourCost;
    const margin = pb.defaultMarginPct||30;
    const rounded = roundPolicy(GBP(subTotal*(1+margin/100)), 'nearest_1');
    const vat = addVAT(rounded);
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
    const vinyl = pb.materials.find(m=>m.id==='vinyl137');
    // laminate: pick r10 for floors, else lam137 (matt/gloss)
    const lam = i.laminate==='antiSlipR10' ? pb.materials.find(m=>m.id==='r10lam') : pb.materials.find(m=>m.id==='lam137');
    const printer = pb.machines.find(m=>m.type==='printer'); const plotter = pb.machines.find(m=>m.type==='plotter'); const app = pb.machines.find(m=>m.type==='applicator');
    let materialCost = rollCost(i.areaM2, vinyl.roll) + rollCost(i.areaM2, lam.roll);
    const printMins = time.printMins(i.areaM2, printer);
    const cutMins = time.cutMins(i.areaM2, plotter, i.contourCut);
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour) + GBP(time.appMins(i.areaM2, app)/60*app.ratePerHour);
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
    const vat = addVAT(rounded);
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
  },

  // --- New products ---
  'BANNER_POSTER': (pb, inputs) => {
    const i = Object.assign({ widthMm:2000, heightMm:1000, qty:1, material:'PVC Banner 440gsm', finish:'hem_eyelet_all', turnaround:'standard' }, inputs);
    const area = m2FromDims(i.widthMm, i.heightMm, i.qty);
    // choose roll
    let rollMat = pb.materials.find(m=> m.id==='banner440');
    if(i.material.toLowerCase().includes('mesh')) rollMat = pb.materials.find(m=>m.id==='mesh340');
    if(i.material.toLowerCase().includes('poster')) rollMat = pb.materials.find(m=>m.id==='poster200');
    const materialCost = rollCost(area, rollMat.roll);
    // finishing
    const perimeterM = ((i.widthMm/1000)*2 + (i.heightMm/1000)*2) * i.qty;
    let finishingCost = 0;
    const hemSvc = service(pb, 'hemEyeletPerM').pricePerUnit;
    const eyeSvc = service(pb, 'eyeletEach').pricePerUnit;
    if(i.finish==='hem_eyelet_all'){
      finishingCost += GBP(perimeterM * hemSvc) + GBP(Math.ceil(perimeterM / 0.5) * eyeSvc * 0.5); // approx eyelet spacing 0.5m
    }else if(i.finish==='hem_eyelet_sides'){
      const sidesM = ((i.heightMm/1000)*2) * i.qty;
      finishingCost += GBP(sidesM * hemSvc) + GBP(Math.ceil(sidesM / 0.5) * eyeSvc * 0.5);
    }
    // machines & labour
    const printer = pb.machines.find(m=>m.type==='printer');
    const printMins = time.printMins(area, printer);
    const machineCost = GBP((printMins/60)*printer.ratePerHour);
    const labour = pb.labourRates;
    const prodMins = 8 + area*6 + (i.finish!=='none'?10:0);
    const labourCost = GBP((prodMins/60)*labour.production);
    // rush
    const rushMult = (pb.rules.rushMultipliers||{standard:1,priority:1.25})[i.turnaround] || 1;
    let subTotal = (materialCost + machineCost + labourCost + finishingCost) * rushMult;
    const margin = pb.defaultMarginPct||30;
    const rounded = roundPolicy(GBP(subTotal*(1+margin/100)), 'nearest_1');
    const vat = addVAT(rounded);
    const total = rounded + vat;
    return {
      validatedInputs:i,
      breakdown:{
        materials:[{name:rollMat.name, qty:area, uom:'m2', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)}],
        labour:[{role:'production', mins:prodMins, cost:GBP((prodMins/60)*labour.production)}],
        extras: finishingCost? [{label:'Hem & Eyelets', cost:finishingCost}] : []
      },
      totals:{ materials:materialCost, machines:machineCost, labour:labourCost, logistics:0, extras:finishingCost,
        subTotal: GBP(materialCost+machineCost+labourCost+finishingCost), marginPct:margin, marginValue:GBP((materialCost+machineCost+labourCost+finishingCost)*(margin/100)),
        roundedSubTotal:rounded, vat, grandTotal:total }
    };
  },

  'WAYFINDING_PACK': (pb, inputs) => {
    const i = Object.assign({ doorSigns:10, directional:6, directoryBoards:1, substrate:'Acrylic 3mm', fixings:'stand_off', design:'standard', install:true }, inputs);
    // use typical sizes
    const areaDoor = 0.2*0.2;        // 200x200mm
    const areaDirectional = 0.6*0.2; // 600x200mm
    const areaDirectory = 0.8*1.2;   // 800x1200mm
    const totalArea = i.doorSigns*areaDoor + i.directional*areaDirectional + i.directoryBoards*areaDirectory;
    const vinyl = pb.materials.find(m=>m.id==='vinyl137');
    const lam = pb.materials.find(m=>m.id==='lam137');
    const substrate = pb.materials.find(m=>m.name.includes(i.substrate)) || pb.materials[0];
    // materials: print + lam + substrate sheets
    let materialCost = rollCost(totalArea, vinyl.roll) + rollCost(totalArea, lam.roll);
    const sheetArea = (substrate.sheet.widthMm/1000) * (substrate.sheet.heightMm/1000);
    const sheets = Math.ceil((totalArea*1.06)/sheetArea);
    materialCost += sheets * substrate.sheet.costPerSheet;
    // fixings cost
    let fixCost = 0;
    if(i.fixings==='stand_off'){
      fixCost += GBP(service(pb,'standOffEach').pricePerUnit * (i.doorSigns*4 + i.directional*4 + i.directoryBoards*6));
    } else if(i.fixings==='rail') {
      const railM = i.directoryBoards*2 + i.directional*1.2; // rough metres
      fixCost += GBP(service(pb,'railPerM').pricePerUnit * railM);
    }
    // machines + labour
    const printer = pb.machines.find(m=>m.type==='printer');
    const plotter = pb.machines.find(m=>m.type==='plotter');
    const cnc = pb.machines.find(m=>m.type==='cnc');
    const printMins = time.printMins(totalArea, printer);
    const cutMins = 10 + totalArea*12;
    const cncMins = 10 + totalArea*10;
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour) + GBP((cncMins/60)*cnc.ratePerHour);
    const labour = pb.labourRates;
    const designMins = (i.design==='complex'? 180 : i.design==='standard'? 90 : 45);
    const prodMins = 20 + totalArea*25;
    let installMins = i.install ? (i.doorSigns*6 + i.directional*10 + i.directoryBoards*60) : 0;
    const labourCost = GBP((designMins/60)*labour.design + (prodMins/60)*labour.production + (installMins/60)*labour.install);
    // logistics
    let logistics = 0;
    if(i.install){ logistics += GBP(pb.logistics.travelPerMile*12) + GBP(pb.logistics.parkingPerDay); }
    const subBase = materialCost + machineCost + labourCost + fixCost + logistics;
    const margin = pb.defaultMarginPct||35;
    const rounded = roundPolicy(GBP(subBase*(1+margin/100)), 'nearest_1');
    const vat = addVAT(rounded);
    return {
      validatedInputs: i,
      breakdown:{
        materials:[{name:`${substrate.name} + print + lam`, qty:sheets, uom:'sheet', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)},
                  {name:plotter.name, mins:Math.round(cutMins), cost:GBP((cutMins/60)*plotter.ratePerHour)},
                  {name:cnc.name, mins:Math.round(cncMins), cost:GBP((cncMins/60)*cnc.ratePerHour)}],
        labour:[{role:'design', mins:designMins, cost:GBP((designMins/60)*labour.design)},
                {role:'production', mins:prodMins, cost:GBP((prodMins/60)*labour.production)}]
                .concat(i.install?[{role:'install', mins:installMins, cost:GBP((installMins/60)*labour.install)}]:[]),
        extras: fixCost? [{label:'Fixings', cost:fixCost}]:[],
        logistics: i.install? [{label:'Travel + Parking', cost:logistics}]:[]
      },
      totals:{
        materials:materialCost, machines:machineCost, labour:labourCost, logistics, extras:fixCost,
        subTotal: GBP(subBase), marginPct:margin, marginValue:GBP(subBase*(margin/100)),
        roundedSubTotal:rounded, vat, grandTotal:rounded+vat
      }
    };
  },

  'VEHICLE_DECAL': (pb, inputs) => {
    const i = Object.assign({ vehicleClass:'van_lwb', coverage:'decals', laminate:'cast', sides:true, rear:true, bonnet:false }, inputs);
    // heuristics
    const areaByClass = { car:10, van_swb:14, van_lwb:18, luton:24, hgv:35 }; // max printable m2 for full wrap baseline
    const wrapFactor = i.coverage==='full_wrap' ? 1 : i.coverage==='partial_wrap' ? 0.45 : 0.18; // decals ~18%
    const area = (areaByClass[i.vehicleClass] || 16) * wrapFactor;
    // materials (cast wrap + cast lam)
    const wrapVinyl = pb.materials.find(m=>m.id==='castWrap');
    const castLam = pb.materials.find(m=>m.id==='castLam');
    let materialCost = rollCost(area, wrapVinyl.roll) + (i.laminate==='cast' ? rollCost(area, castLam.roll) : 0);
    // machines
    const printer = pb.machines.find(m=>m.type==='printer');
    const plotter = pb.machines.find(m=>m.type==='plotter');
    const app = pb.machines.find(m=>m.type==='applicator');
    const printMins = time.printMins(area, printer);
    const cutMins = 15 + area*15;
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour) + GBP(time.appMins(area, app)/60*app.ratePerHour);
    // labour (install hours vary by coverage/class)
    const baseInstallHrs = (i.coverage==='full_wrap' ? 24 : i.coverage==='partial_wrap' ? 10 : 4);
    const classMult = i.vehicleClass==='car'? 0.8 : i.vehicleClass==='van_swb'?1.0 : i.vehicleClass==='van_lwb'?1.2 : i.vehicleClass==='luton'?1.6 : 2.0;
    const installHrs = baseInstallHrs * classMult;
    const labour = pb.labourRates;
    const prodMins = 20 + area*12;
    const labourCost = GBP((prodMins/60)*labour.production + installHrs*labour.install);
    // bay hire
    const bay = service(pb,'vehicleBayHour').pricePerUnit;
    const bayCost = GBP(bay * installHrs);
    const subBase = materialCost + machineCost + labourCost + bayCost;
    const margin = pb.defaultMarginPct||35;
    const rounded = roundPolicy(GBP(subBase*(1+margin/100)), 'nearest_1');
    const vat = addVAT(rounded);
    return {
      validatedInputs:i,
      breakdown:{
        materials:[{name:`Cast Wrap + ${i.laminate==='cast'?'Cast Lam':''}`, qty:area, uom:'m2', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)},
                  {name:plotter.name, mins:Math.round(cutMins), cost:GBP((cutMins/60)*plotter.ratePerHour)}],
        labour:[{role:'production', mins:prodMins, cost:GBP((prodMins/60)*labour.production)},
                {role:'install', mins:installHrs*60, cost:GBP(installHrs*labour.install)}],
        extras: bayCost? [{label:'Vehicle bay hire', cost:bayCost}]:[]
      },
      totals:{
        materials:materialCost, machines:machineCost, labour:labourCost, logistics:0, extras:bayCost,
        subTotal: GBP(subBase), marginPct:margin, marginValue:GBP(subBase*(margin/100)),
        roundedSubTotal:rounded, vat, grandTotal:rounded+vat
      }
    };
  },

  'HOARDING': (pb, inputs) => {
    const i = Object.assign({ linearM:25, heightM:2.4, panelMaterial:'ACM 3mm', laminate:'matt', freeStanding:true, site:'standard', install:true }, inputs);
    const area = i.linearM * i.heightM;
    const substrate = pb.materials.find(m=>m.name.includes(i.panelMaterial)) || pb.materials.find(m=>m.id==='acm3');
    const vinyl = pb.materials.find(m=>m.id==='vinyl137');
    const lam = pb.materials.find(m=>m.id==='lam137');
    // material costs: panels + print + lam
    const sheetArea = (substrate.sheet.widthMm/1000) * (substrate.sheet.heightMm/1000);
    const sheets = Math.ceil((area*1.05)/sheetArea);
    let materialCost = sheets * substrate.sheet.costPerSheet + rollCost(area, vinyl.roll) + rollCost(area, lam.roll);
    // structure: posts/rails if free-standing
    let structureCost = 0;
    if(i.freeStanding){
      structureCost += GBP(service(pb,'postPerM').pricePerUnit * i.linearM);
      structureCost += GBP(service(pb,'railPerM').pricePerUnit * (i.linearM*2));
    }
    // machines & labour
    const printer = pb.machines.find(m=>m.type==='printer'); const cnc = pb.machines.find(m=>m.type==='cnc'); const plotter = pb.machines.find(m=>m.type==='plotter');
    const printMins = time.printMins(area, printer);
    const cutMins = 10 + area*6;
    const cncMins = 15 + area*4;
    const machineCost = GBP((printMins/60)*printer.ratePerHour) + GBP((cutMins/60)*plotter.ratePerHour) + GBP((cncMins/60)*cnc.ratePerHour);
    const labour = pb.labourRates;
    const prodMins = 20 + area*12;
    let installMins = i.install ? (i.linearM*6 + (i.site==='complex'? 240 : i.site==='standard'? 120 : 60)) : 0;
    let labourCost = GBP((prodMins/60)*labour.production + (installMins/60)*labour.install);
    // logistics & plant
    let logistics = 0;
    if(i.install){
      logistics += GBP(pb.logistics.travelPerMile*15) + GBP(pb.logistics.parkingPerDay);
      if(i.heightM>=3 || i.site==='complex'){ logistics += GBP(pb.logistics.cherryPickerPerDay); }
      if(i.site==='complex'){ logistics += GBP(pb.logistics.trafficMgmtPerDay); }
    }
    const subBase = materialCost + structureCost + machineCost + labourCost + logistics;
    const margin = pb.defaultMarginPct||35;
    const rounded = roundPolicy(GBP(subBase*(1+margin/100)), 'nearest_1');
    const vat = addVAT(rounded);
    return {
      validatedInputs:i,
      breakdown:{
        materials:[{name:`${substrate.name} + print + lam`, qty:sheets, uom:'sheet', cost:materialCost}],
        machines:[{name:printer.name, mins:Math.round(printMins), cost:GBP((printMins/60)*printer.ratePerHour)},
                  {name:plotter.name, mins:Math.round(cutMins), cost:GBP((cutMins/60)*plotter.ratePerHour)},
                  {name:cnc.name, mins:Math.round(cncMins), cost:GBP((cncMins/60)*cnc.ratePerHour)}],
        labour:[{role:'production', mins:prodMins, cost:GBP((prodMins/60)*labour.production)}]
               .concat(i.install?[{role:'install', mins:installMins, cost:GBP((installMins/60)*labour.install)}]:[]),
        extras: structureCost? [{label:'Posts & Rails', cost:structureCost}]:[],
        logistics: i.install? [{label:'Travel/Access/TM', cost:logistics}]:[]
      },
      totals:{
        materials:materialCost, machines:machineCost, labour:labourCost, logistics, extras:structureCost,
        subTotal: GBP(subBase), marginPct:margin, marginValue:GBP(subBase*(margin/100)),
        roundedSubTotal:rounded, vat, grandTotal:rounded+vat
      }
    };
  }
};

