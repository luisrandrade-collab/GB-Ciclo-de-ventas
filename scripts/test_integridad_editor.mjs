#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Tests v7.9.16 — Deshacer del editor de propuesta + lógica de integridad DAT-2.
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_integridad_editor.mjs — exit 0 si todo pasa.
//
// Igual que las demás suites: COPIA la lógica pura (sin DOM/Firestore) para
// probarla en aislamiento. Si cambia la fuente, actualizar aquí (check_drift
// no cubre estas copias por ser lógica extraída, no funciones espejo 1:1).
// ═══════════════════════════════════════════════════════════════════════════

let pass=0,fail=0;
const useColor=process.stdout.isTTY&&!process.env.NO_COLOR;
const c=useColor?{g:"\x1b[32m",r:"\x1b[31m",b:"\x1b[1m",x:"\x1b[0m"}:{g:"",r:"",b:"",x:""};
function eq(actual,expected,label){
  const a=JSON.stringify(actual),e=JSON.stringify(expected);
  if(a===e){console.log(`  ${c.g}✅${c.x} ${label}`);pass++}
  else{console.log(`  ${c.r}❌${c.x} ${label}\n      esperado: ${e}\n      actual:   ${a}`);fail++}
}
function describe(name,fn){console.log(`\n${c.b}─── ${name} ───${c.x}`);fn()}

// ─── Copia: snapshot/restore del editor (app-propuesta.js v7.9.16) ──────────
function _propSnapshot(propSections){return JSON.parse(JSON.stringify(propSections))}

// ─── Copia: lógica de pagos frescos de submitAnular (app-historial.js B1) ───
// Dado pagosFrescos (del snapshot de la tx) y devPago, devuelve el array a escribir.
function mergeDevolucion(pagosFrescos,devPago){
  const yaEsta=pagosFrescos.some(p=>p.tipo==="devolucion"&&p.registradoEn===devPago.registradoEn);
  return yaEsta?pagosFrescos:[...pagosFrescos,devPago];
}

// ─── Copia: lógica de ajustes frescos de applyAjusteToDoc (app-core.js B2) ──
function mergeAjuste(ajustesFrescos,ajusteEnDoc){
  const out=ajustesFrescos.slice();
  if(!out.some(a=>a.id===ajusteEnDoc.id))out.push(ajusteEnDoc);
  return out;
}

// ─── Copia: lógica de saldo a favor de _addSaldoAFavor (app-historial.js B3) ─
function mergeSaldoAFavor(dataFresca,movimiento,monto,logId){
  const movs=Array.isArray(dataFresca.saldoAFavorMovs)?dataFresca.saldoAFavorMovs.slice():[];
  const yaEsta=movs.some(m=>m.logId===logId);
  if(!yaEsta)movs.push(movimiento);
  const saldo=yaEsta?(parseFloat(dataFresca.saldoAFavor)||0):(parseFloat(dataFresca.saldoAFavor)||0)+monto;
  return {saldo,movs};
}

// ═══ Tests Workstream A: snapshot/restore ═══

describe("A1: snapshot es deep-copy (mutar el original no toca el snapshot)",()=>{
  const secs=[{name:"Entradas",options:[{label:"Opción A",items:[{name:"Hummus",qty:10,price:5000}]}]}];
  const snap=_propSnapshot(secs);
  secs.splice(0,1); // simular delPropSec
  eq(secs.length,0,"el original quedó vacío tras el borrado");
  eq(snap.length,1,"el snapshot conserva la sección");
  eq(snap[0].options[0].items[0].name,"Hummus","items intactos en el snapshot");
});

describe("A2: restaurar tras borrar una opción con items",()=>{
  const secs=[{name:"Plato",options:[{label:"Opción A",items:[{name:"Lomo"}]},{label:"Opción B",items:[{name:"Pollo"},{name:"Pescado"}]}]}];
  const snap=_propSnapshot(secs);
  secs[0].options.splice(1,1); // borrar Opción B (2 items) — el caso reportado por Luis
  eq(secs[0].options.length,1,"opción B borrada");
  const restored=snap; // _propRestore asigna el snapshot
  eq(restored[0].options.length,2,"restore recupera ambas opciones");
  eq(restored[0].options[1].items.length,2,"los 2 items de Opción B vuelven");
});

describe("A3: snapshot anidado profundo (notas, precios, flags)",()=>{
  const secs=[{name:"Sec",nota:"nota x",incluirEnTotal:false,options:[{label:"Única",items:[{name:"A",qty:3,price:1500,desc:"d"}]}]}];
  const snap=_propSnapshot(secs);
  secs[0].options[0].items[0].price=9999;
  secs[0].nota="mutada";
  eq(snap[0].options[0].items[0].price,1500,"precio original preservado");
  eq(snap[0].nota,"nota x","nota original preservada");
  eq(snap[0].incluirEnTotal,false,"flag incluirEnTotal preservado");
});

// ═══ Tests Workstream B: merges transaccionales ═══

describe("B1: devolución se suma a pagos FRESCOS (no pisa pago concurrente)",()=>{
  // Escenario Kathy: el caché local tenía 1 pago, pero Firestore fresco tiene 2
  // (Kathy registró uno después). La tx parte del fresco.
  const pagosFrescos=[
    {fecha:"2026-07-01",monto:100000,tipo:"anticipo"},
    {fecha:"2026-07-26",monto:50000,tipo:"saldo"} // ← el pago de Kathy
  ];
  const dev={fecha:"2026-07-27",monto:-150000,tipo:"devolucion",registradoEn:"2026-07-27T10:00:00Z"};
  const out=mergeDevolucion(pagosFrescos,dev);
  eq(out.length,3,"3 pagos: los 2 frescos + la devolución");
  eq(out[1].monto,50000,"el pago de Kathy sobrevive");
  eq(out[2].tipo,"devolucion","la devolución quedó al final");
});

describe("B1b: idempotencia — reintento de la tx no duplica la devolución",()=>{
  const dev={tipo:"devolucion",registradoEn:"2026-07-27T10:00:00Z",monto:-150000};
  const yaConDev=[{tipo:"anticipo",monto:100000},dev];
  const out=mergeDevolucion(yaConDev,dev);
  eq(out.length,2,"no se duplica en el reintento");
});

describe("B2: ajuste se aplica sobre ajustes FRESCOS",()=>{
  const frescos=[{id:"aj_1",monto:20000}]; // ajuste concurrente de otra sesión
  const nuevo={id:"aj_2",monto:10000,motivo:"perdón",tipo:"ajuste_saldo",fecha:"2026-07-27"};
  const out=mergeAjuste(frescos,nuevo);
  eq(out.length,2,"ambos ajustes conviven");
  eq(out[0].id,"aj_1","el ajuste concurrente sobrevive");
});

describe("B2b: idempotencia por id",()=>{
  const nuevo={id:"aj_2",monto:10000};
  const out=mergeAjuste([{id:"aj_2",monto:10000}],nuevo);
  eq(out.length,1,"reintento no duplica el ajuste");
});

describe("B3: nota crédito suma sobre saldo FRESCO",()=>{
  // Caché decía saldoAFavor=0, pero fresco tiene 30000 (nota concurrente).
  const fresca={saldoAFavor:30000,saldoAFavorMovs:[{logId:"log_a",monto:30000}]};
  const mov={logId:"log_b",monto:20000,fecha:"2026-07-27"};
  const {saldo,movs}=mergeSaldoAFavor(fresca,mov,20000,"log_b");
  eq(saldo,50000,"saldo = 30000 fresco + 20000 nuevo (no 0+20000 del caché)");
  eq(movs.length,2,"ambos movimientos conviven");
});

describe("B3b: idempotencia por logId (reintento no re-suma)",()=>{
  const fresca={saldoAFavor:50000,saldoAFavorMovs:[{logId:"log_b",monto:20000}]};
  const mov={logId:"log_b",monto:20000};
  const {saldo,movs}=mergeSaldoAFavor(fresca,mov,20000,"log_b");
  eq(saldo,50000,"saldo NO se re-suma en el reintento");
  eq(movs.length,1,"movimiento no duplicado");
});

describe("B3c: cliente legacy sin movimientos previos",()=>{
  const fresca={saldoAFavor:15000}; // saldo legacy sin array de movs
  const mov={logId:"log_c",monto:5000};
  const {saldo,movs}=mergeSaldoAFavor(fresca,mov,5000,"log_c");
  eq(saldo,20000,"saldo legacy 15000 se respeta y suma 5000");
  eq(movs.length,1,"primer movimiento del array");
});

// ─── Resumen ────────────────────────────────────────────────────────────────
console.log("");
if(fail===0){console.log(`${c.g}${c.b}✅ ${pass} tests pasaron${c.x}`);process.exit(0)}
else{console.log(`${c.r}${c.b}❌ ${fail} falló(aron) · ${pass} pasaron${c.x}`);process.exit(1)}
