#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de helpers puros de dinero (v7.9.13 INF-03).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_dinero.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué no usa los app-*.js directamente: mismo razonamiento que
// test_despachos.mjs — copiamos los helpers aquí para probarlos en aislamiento.
// Si las firmas cambian, actualizar este archivo (scripts/check_drift.mjs
// detecta la desincronización en CI).
// ═══════════════════════════════════════════════════════════════════════════

// ─── Copia de app-core.js (tabla TR, dependencia de computePropTotal) ────────
const TR={"La Calera":{n:"Transporte La Calera",p:10000},"Bogotá":{n:"Transporte Bogotá",p:20000},"Chía":{n:"Transporte Chía / Cajicá",p:40000},"Cajicá":{n:"Transporte Chía / Cajicá",p:40000}};

// ─── Copia de app-historial.js (mantener sincronizado) ──────────────────────

function getPagos(q){
  if(Array.isArray(q.pagos)&&q.pagos.length)return q.pagos;
  const out=[];
  const ant=q.approvalData?.anticipo||q.orderData?.anticipo;
  const antMet=q.approvalData?.metodoPago||q.orderData?.metodoPago||"Sin especificar";
  const antFecha=q.approvalData?.fechaAprobacion||q.orderData?.fechaAprobacion;
  if(ant>0&&antFecha)out.push({fecha:antFecha,monto:ant,metodo:antMet,tipo:"anticipo",notas:q.approvalData?.notas||q.orderData?.notas||"",legacy:true});
  if(q.saldoData?.monto>0)out.push({fecha:q.saldoData.fecha,monto:q.saldoData.monto,metodo:q.saldoData.metodoPago||"Sin especificar",tipo:"saldo",notas:q.saldoData.notas||"",legacy:true});
  return out;
}
function totalCobrado(q){return getPagos(q).reduce((s,p)=>s+(parseInt(p.monto)||0),0)}
function totalAjustes(q){
  if(!q||!Array.isArray(q.ajustes))return 0;
  return q.ajustes.reduce((s,a)=>{
    if(a.deletedAt)return s;
    const m=parseFloat(a.monto)||0;
    return s+(m>0?m:0); // solo suma positivos (descuentos al cliente)
  },0);
}
function saldoPendiente(q){
  const t=(typeof getDocTotal==="function"?getDocTotal(q):(q.total||q.totalReal||0));
  return Math.max(0,t-totalCobrado(q)-totalAjustes(q));
}
function saldoNeto(q){
  const t=(typeof getDocTotal==="function"?getDocTotal(q):(q.total||q.totalReal||0));
  return t-totalCobrado(q)-totalAjustes(q);
}
function creditoAFavor(q){
  const neto=saldoNeto(q);
  return neto<0?-neto:0;
}

// ─── Copia de app-core.js (mantener sincronizado) — v7.9.13 ARQ-02 ──────────

function getDocTotal(q){
  if(!q)return 0;
  // v7.9.12 FIX: para propuestas SIEMPRE recalcular (no confiar en q.total guardado).
  // q.total se persistió con la fórmula vieja que no sumaba el transporte de
  // despachos múltiples; recalcular al leer corrige docs viejos (ej. Angela) sin
  // tocar Firestore. Para propuestas normales el valor no cambia (q.total ya era
  // == computePropTotal al guardar); solo corrige los eventos multi-despacho.
  if(q.kind==="proposal"&&typeof computePropTotal==="function")return computePropTotal(q);
  if(q.total)return q.total;
  return q.totalReal||0;
}

// ─── Copia de app-core.js (mantener sincronizado) — v7.9.13 ARQ-02 ──────────

function computePropTotal(q){
  if(!q)return 0;
  let totMenu=0,totCatering=0;
  (q.sections||[]).forEach(sec=>{
    // v7.8.4.2: secciones marcadas como alternativas (incluirEnTotal===false) no se suman
    if(sec.incluirEnTotal===false)return;
    const isCateringSec=/servicio\s*de\s*catering|coordinaci[oó]n/i.test(sec.name||"");
    (sec.options||[]).forEach(opt=>{
      if(opt.label==="Opción A"||sec.options.length===1){
        (opt.items||[]).forEach(it=>{
          const val=(it.price||0)*(it.qty||0);
          if(isCateringSec)totCatering+=val;else totMenu+=val;
        });
      }
    });
  });
  let totMenajeVal=0;
  (q.menaje||[]).forEach(m=>{const qty=parseFloat(m.qty)||0,p=parseFloat(m.price)||0;totMenajeVal+=qty*p});
  const pd=q.personalData||{meseros:{},auxiliares:{}};
  const pm=pd.meseros||{},pa=pd.auxiliares||{};
  const mSub=(parseFloat(pm.cantidad)||0)*((parseFloat(pm.valor4h)||0)+(parseFloat(pm.horasExtra)||0)*(parseFloat(pm.valorHoraExtra)||0));
  const aSub=(parseFloat(pa.cantidad)||0)*((parseFloat(pa.valor4h)||0)+(parseFloat(pa.horasExtra)||0)*(parseFloat(pa.valorHoraExtra)||0));
  const totPersonal=mSub+aSub;
  // v7.9.12 FIX: transporte de despachos múltiples. Mismo criterio que el PDF
  // (genPropPDF): si hay 2+ despachos, el transporte es la suma de cada uno;
  // si no, se usa el transporte legacy (cityType/trCustom) de la entrega única.
  // Antes computePropTotal ignoraba q.despachos[] → el total guardado subestimaba
  // eventos multi-domicilio (Cartera/saldo/stats quedaban cortos).
  const despachos=Array.isArray(q.despachos)?q.despachos:[];
  const totTranspDespachos=despachos.length>=2?despachos.reduce((s,d)=>s+(parseFloat(d.transporteCosto)||0),0):0;
  let totTransp=0;
  if(totTranspDespachos>0){
    totTransp=totTranspDespachos;
  }else if(q.cityType==="Otra"){
    totTransp=parseInt(q.trCustom)||0;
  }else if(q.cityType&&TR[q.cityType]){
    totTransp=TR[q.cityType].p;
  }
  return totMenu+totCatering+totMenajeVal+totPersonal+totTransp;
}

// ─── Framework mínimo de testing ────────────────────────────────────────────

let pass=0, fail=0;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", b: "", x: "" };

function eq(actual, expected, label){
  const a=JSON.stringify(actual);
  const e=JSON.stringify(expected);
  if(a===e){console.log(`  ${c.g}✅${c.x} ${label}`);pass++}
  else{console.log(`  ${c.r}❌${c.x} ${label}\n      esperado: ${e}\n      actual:   ${a}`);fail++}
}

function describe(name, fn){
  console.log(`\n${c.b}─── ${name} ───${c.x}`);
  fn();
}

// ─── Casos de prueba ────────────────────────────────────────────────────────

describe("Caso 1: doc sin pagos", () => {
  const q={id:"GB-C-001",total:500000};
  eq(getPagos(q), [], "getPagos = [] (sin pagos ni legacy)");
  eq(totalCobrado(q), 0, "totalCobrado = 0");
  eq(totalAjustes(q), 0, "totalAjustes = 0 (sin ajustes)");
  eq(saldoPendiente(q), 500000, "saldoPendiente = total completo");
  eq(saldoNeto(q), 500000, "saldoNeto = total completo");
  eq(creditoAFavor(q), 0, "creditoAFavor = 0");
});

describe("Caso 2: pagos legacy reconstruidos (anticipo + saldoData)", () => {
  const q={
    id:"GB-P-002",total:1000000,
    approvalData:{anticipo:400000,metodoPago:"Nequi",fechaAprobacion:"2026-01-10",notas:"50%"},
    saldoData:{monto:600000,fecha:"2026-02-01",metodoPago:"Efectivo"}
  };
  const pagos=getPagos(q);
  eq(pagos.length, 2, "reconstruye 2 pagos legacy");
  eq(pagos[0].tipo, "anticipo", "primer pago = anticipo");
  eq(pagos[0].legacy, true, "anticipo marcado legacy");
  eq(pagos[1].tipo, "saldo", "segundo pago = saldo");
  eq(totalCobrado(q), 1000000, "totalCobrado = anticipo + saldo");
  eq(saldoPendiente(q), 0, "saldoPendiente = 0 (cobrado al 100%)");
});

describe("Caso 3: pagos normales (q.pagos[] tiene prioridad sobre legacy)", () => {
  const q={
    id:"GB-P-003",total:800000,
    pagos:[
      {fecha:"2026-03-01",monto:300000,metodo:"Banco Falabella",tipo:"anticipo"},
      {fecha:"2026-03-15",monto:200000,metodo:"Efectivo",tipo:"abono"}
    ],
    approvalData:{anticipo:999999,fechaAprobacion:"2026-03-01"} // legacy ignorado
  };
  eq(getPagos(q).length, 2, "usa q.pagos[] directo (ignora legacy)");
  eq(totalCobrado(q), 500000, "totalCobrado = 500000");
  eq(saldoPendiente(q), 300000, "saldoPendiente = 300000");
});

describe("Caso 4: ajustes reducen saldo (deletedAt y negativos ignorados)", () => {
  const q={
    id:"GB-P-004",total:1000000,
    pagos:[{fecha:"2026-04-01",monto:700000,metodo:"Nequi",tipo:"anticipo"}],
    ajustes:[
      {monto:100000,tipo:"descuento"},
      {monto:50000,tipo:"perdon",deletedAt:"2026-04-02"}, // eliminado, no cuenta
      {monto:-30000,tipo:"raro"}                          // negativo, no suma
    ]
  };
  eq(totalAjustes(q), 100000, "totalAjustes solo cuenta vigentes positivos");
  eq(saldoPendiente(q), 200000, "saldoPendiente = total - cobrado - ajustes");
});

describe("Caso 5: sobrepago → crédito a favor", () => {
  const q={
    id:"GB-P-005",total:400000,
    pagos:[{fecha:"2026-05-01",monto:500000,metodo:"Efectivo",tipo:"anticipo"}]
  };
  eq(saldoNeto(q), -100000, "saldoNeto negativo = sobrepago");
  eq(saldoPendiente(q), 0, "saldoPendiente clampea a 0");
  eq(creditoAFavor(q), 100000, "creditoAFavor = monto sobrepagado");
});

describe("Caso 6: propuesta multi-despacho con transporte (fix v7.9.12)", () => {
  const q={
    id:"GB-PR-006",kind:"proposal",
    total:1000000, // total persistido VIEJO (sin transporte de despachos) — debe ignorarse
    sections:[{name:"Plato Fuerte",options:[{label:"Opción A",items:[{price:100000,qty:10}]}]}],
    despachos:[
      {transporteCosto:30000},
      {transporteCosto:"45000"} // string: parseFloat
    ]
  };
  eq(computePropTotal(q), 1075000, "computePropTotal suma transporte de 2+ despachos");
  eq(getDocTotal(q), 1075000, "getDocTotal recalcula propuesta (no usa q.total viejo)");
  eq(saldoPendiente(q), 1075000, "saldoPendiente usa el total recalculado");
  const q1={...q,despachos:[{transporteCosto:30000}],cityType:"Bogotá"};
  eq(computePropTotal(q1), 1020000, "1 solo despacho → cae al transporte legacy (TR Bogotá)");
});

describe("Caso 7: montos string vs number (mix parseInt/parseFloat)", () => {
  const q={
    id:"GB-P-007",total:300000,
    pagos:[
      {fecha:"2026-06-01",monto:"100000",metodo:"Nequi",tipo:"anticipo"}, // string
      {fecha:"2026-06-02",monto:50000,metodo:"Efectivo",tipo:"abono"},     // number
      {fecha:"2026-06-03",monto:"abc",metodo:"Otro",tipo:"abono"}          // basura → 0
    ],
    ajustes:[{monto:"25000.75",tipo:"descuento"}] // parseFloat conserva decimales
  };
  eq(totalCobrado(q), 150000, "totalCobrado parsea strings y descarta basura");
  eq(totalAjustes(q), 25000.75, "totalAjustes usa parseFloat (decimales)");
  eq(saldoNeto(q), 124999.25, "saldoNeto coherente con el mix string/number");
  const qLeg={
    id:"GB-P-007b",total:200000,
    orderData:{anticipo:"80000",fechaAprobacion:"2026-06-05"} // legacy string
  };
  eq(getPagos(qLeg).length, 1, "anticipo legacy string > 0 sí se reconstruye");
  eq(totalCobrado(qLeg), 80000, "totalCobrado parsea anticipo legacy string");
});

// ─── Resumen ────────────────────────────────────────────────────────────────

console.log("");
if(fail===0){
  console.log(`${c.g}${c.b}✅ ${pass} tests pasaron${c.x}`);
  process.exit(0);
}else{
  console.log(`${c.r}${c.b}❌ ${fail} falló(aron) · ${pass} pasaron${c.x}`);
  process.exit(1);
}
