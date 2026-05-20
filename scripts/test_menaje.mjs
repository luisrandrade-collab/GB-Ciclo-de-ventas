#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de helpers de menaje con opciones (v7.9.8 F8 — Codex v6 CÓDIGO B5).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_menaje.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué no usa el archivo app-core.js directamente: mismo razonamiento que
// test_despachos.mjs — copiamos los helpers aquí para probarlos en aislamiento.
// Si las firmas cambian, actualizar este archivo.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Copia de los helpers de app-core.js (mantener sincronizado) ────────────

function getMenajeOpciones(q){
  if(!q)return [];
  if(Array.isArray(q.menajeOptions)&&q.menajeOptions.length){
    return q.menajeOptions;
  }
  if(Array.isArray(q.menaje)&&q.menaje.length){
    return [{
      id:"opcion_unica_legacy",
      label:"Única",
      items:q.menaje,
      _legacy:true
    }];
  }
  return [];
}

function getMenajeOpcionActiva(q){
  const opciones=getMenajeOpciones(q);
  if(!opciones.length)return null;
  const seleccionada=q?.propFinalSelection?.menaje;
  if(seleccionada){
    const found=opciones.find(op=>op.id===seleccionada);
    if(found)return found;
  }
  return opciones[0];
}

function getMenajeItemsActivos(q){
  const op=getMenajeOpcionActiva(q);
  return op&&Array.isArray(op.items)?op.items:[];
}

function getReposicionActivos(q, opcionId){
  if(!q||!q.reposicionData||typeof q.reposicionData!=="object")return {};
  const opId=opcionId||(getMenajeOpcionActiva(q)?.id);
  if(!opId)return q.reposicionData;
  const opciones=getMenajeOpciones(q);
  const algunaOpcionMatch=opciones.some(op=>q.reposicionData[op.id]&&typeof q.reposicionData[op.id]==="object");
  if(algunaOpcionMatch){
    return q.reposicionData[opId]||{};
  }
  return q.reposicionData;
}

function tieneMenajeOpciones(q){
  return Array.isArray(q?.menajeOptions)&&q.menajeOptions.length>0;
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

describe("Caso 1: doc legacy con q.menaje[] plano (sin menajeOptions)", () => {
  const q={
    id:"GB-P-2024-001",
    menaje:[
      {id:"m1",name:"Platos",qty:50,price:2000},
      {id:"m2",name:"Cubiertos",qty:50,price:2000}
    ],
    reposicionData:{Platos:75000,Cubiertos:40000}
  };
  const ops=getMenajeOpciones(q);
  eq(ops.length, 1, "getMenajeOpciones devuelve 1 opción derivada");
  eq(ops[0]._legacy, true, "la opción derivada está marcada como _legacy");
  eq(ops[0].id, "opcion_unica_legacy", "id de la opción legacy");
  eq(ops[0].items.length, 2, "items vienen del q.menaje[] plano");
  eq(getMenajeOpcionActiva(q).id, "opcion_unica_legacy", "opción activa = la única legacy");
  eq(getMenajeItemsActivos(q).length, 2, "items activos = los del plano");
  eq(getReposicionActivos(q).Platos, 75000, "reposicion legacy plana devuelta tal cual");
  eq(tieneMenajeOpciones(q), false, "tieneMenajeOpciones=false (no hay menajeOptions explícitos)");
});

describe("Caso 2: doc nuevo con 1 opción explícita", () => {
  const q={
    id:"GB-P-2026-001",
    menajeOptions:[
      {id:"opA",label:"Opción A",items:[{id:"m1",name:"Platos",qty:50,price:2000}]}
    ],
    reposicionByOption:{opA:{Platos:75000}}
  };
  const ops=getMenajeOpciones(q);
  eq(ops.length, 1, "devuelve la única opción explícita");
  eq(ops[0].id, "opA", "id correcto");
  eq(ops[0]._legacy, undefined, "no marcada como _legacy");
  eq(getMenajeOpcionActiva(q).id, "opA", "opción activa = la única");
  eq(tieneMenajeOpciones(q), true, "tieneMenajeOpciones=true");
});

describe("Caso 3: doc nuevo con 2 opciones explícitas (sin selección activa)", () => {
  const q={
    id:"GB-P-2026-002",
    menajeOptions:[
      {id:"opA",label:"Opción A · Proveedor 1",items:[{name:"Platos",qty:50,price:2000}]},
      {id:"opB",label:"Opción B · Proveedor 2",items:[{name:"Platos",qty:50,price:3500}]}
    ],
    reposicionData:{
      opA:{Platos:75000},
      opB:{Platos:120000}
    }
  };
  const ops=getMenajeOpciones(q);
  eq(ops.length, 2, "devuelve 2 opciones");
  eq(getMenajeOpcionActiva(q).id, "opA", "opción activa = primera (no hay propFinalSelection)");
  eq(getReposicionActivos(q, "opA").Platos, 75000, "reposicion de opA");
  eq(getReposicionActivos(q, "opB").Platos, 120000, "reposicion de opB anidada");
  eq(tieneMenajeOpciones(q), true, "tieneMenajeOpciones=true");
});

describe("Caso 4: PropFinal con propFinalSelection.menaje = opB", () => {
  const q={
    id:"GB-PF-2026-002",
    menajeOptions:[
      {id:"opA",label:"Opción A",items:[{name:"Platos",qty:50,price:2000}]},
      {id:"opB",label:"Opción B",items:[{name:"Platos",qty:50,price:3500}]}
    ],
    reposicionData:{opA:{Platos:75000},opB:{Platos:120000}},
    propFinalSelection:{menaje:"opB"}
  };
  eq(getMenajeOpcionActiva(q).id, "opB", "opción activa = la seleccionada en propFinalSelection");
  eq(getMenajeItemsActivos(q)[0].price, 3500, "items activos = los de la opción B");
  eq(getReposicionActivos(q).Platos, 120000, "reposicion activa = la de opB");
});

describe("Caso 5: propFinalSelection con id que no matchea ninguna opción", () => {
  const q={
    id:"GB-PF-2026-003",
    menajeOptions:[
      {id:"opA",label:"Opción A",items:[{name:"X",qty:1}]}
    ],
    propFinalSelection:{menaje:"opZ_no_existe"}
  };
  eq(getMenajeOpcionActiva(q).id, "opA", "cuando la selección no matchea, fallback a primera");
});

describe("Caso 6: edge cases defensivos", () => {
  eq(getMenajeOpciones(null), [], "getMenajeOpciones(null) = []");
  eq(getMenajeOpciones(undefined), [], "getMenajeOpciones(undefined) = []");
  eq(getMenajeOpciones({}), [], "getMenajeOpciones({}) = []");
  eq(getMenajeOpcionActiva(null), null, "getMenajeOpcionActiva(null) = null");
  eq(getMenajeOpcionActiva({}), null, "getMenajeOpcionActiva({}) = null (sin opciones)");
  eq(getMenajeItemsActivos(null), [], "getMenajeItemsActivos(null) = []");
  eq(getMenajeItemsActivos({}), [], "getMenajeItemsActivos({}) = []");
  eq(getReposicionActivos(null), {}, "getReposicionActivos(null) = {}");
  eq(getReposicionActivos({}), {}, "getReposicionActivos({}) sin reposicionData = {}");
  eq(tieneMenajeOpciones(null), false, "tieneMenajeOpciones(null) = false");
  eq(tieneMenajeOpciones({menajeOptions:[]}), false, "menajeOptions vacío = false");
});

describe("Caso 7: doc con menajeOptions vacío pero q.menaje legacy presente", () => {
  // No debería ocurrir en práctica pero validamos: si menajeOptions = [] vacío, cae a legacy.
  const q={
    id:"GB-P-2026-mixto",
    menajeOptions:[],
    menaje:[{name:"Platos",qty:50,price:2000}],
    reposicionData:{Platos:75000}
  };
  const ops=getMenajeOpciones(q);
  eq(ops.length, 1, "menajeOptions vacío → cae a q.menaje legacy");
  eq(ops[0]._legacy, true, "marcada como legacy");
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
