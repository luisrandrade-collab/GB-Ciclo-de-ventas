#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de helpers de despachos (v7.9.7.1 F10 — recomendación Codex v2/v3).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_despachos.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué no usa el archivo app-core.js directamente:
//   app-core.js es UMD-style sin export. Copiamos las funciones aquí para
//   probarlas en aislamiento. Si las firmas cambian, hay que actualizar este
//   archivo. Es una decisión consciente para no introducir un build step.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Copia de los helpers de app-core.js (mantener sincronizado) ────────────

function getDespachos(q){
  if(!q)return [];
  if(Array.isArray(q.despachos)&&q.despachos.length){
    return q.despachos;
  }
  const fechaHora=q.eventDate?(q.eventDate+(q.horaEntrega?"T"+q.horaEntrega:"T09:00")):"";
  return [{
    id:"desp_legacy",
    fechaHora,
    direccion:null,
    transporteCosto:parseFloat(q.trCustom||q.transporte||0)||0,
    items:[],
    notas:"",
    status:q.status==="entregado"?"entregado":(q.produced?"producido":"pendiente"),
    producedAt:q.producedAt||null,
    entregadoEn:q.entregaData?.fechaReal||null,
    _legacy:true
  }];
}

function getTransporteTotal(q){
  if(!q)return 0;
  if(Array.isArray(q.despachos)&&q.despachos.length){
    return q.despachos.reduce((s,d)=>s+(parseFloat(d.transporteCosto)||0),0);
  }
  return parseFloat(q.trCustom||q.transporte||0)||0;
}

function getDespachoStatusAgregado(q){
  const ds=getDespachos(q);
  if(!ds.length)return "pendiente";
  const entregados=ds.filter(d=>d.status==="entregado").length;
  if(entregados===0)return "pendiente";
  if(entregados===ds.length)return "completo";
  return "parcial";
}

function tieneDespachosExplicitos(q){
  return Array.isArray(q?.despachos)&&q.despachos.length>0;
}

// ─── Framework mínimo de testing ────────────────────────────────────────────

let pass = 0, fail = 0;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", b: "", x: "" };

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ${c.g}✅${c.x} ${label}`);
    pass++;
  } else {
    console.log(`  ${c.r}❌${c.x} ${label}\n      esperado: ${e}\n      actual:   ${a}`);
    fail++;
  }
}

function describe(name, fn) {
  console.log(`\n${c.b}─── ${name} ───${c.x}`);
  fn();
}

// ─── Casos de prueba ────────────────────────────────────────────────────────

describe("Caso 1: doc legacy (sin despachos[], modelo viejo)", () => {
  const q = {
    id: "GB-2024-001",
    eventDate: "2024-06-15",
    horaEntrega: "12:30",
    trCustom: 25000,
    status: "pedido",
  };
  const ds = getDespachos(q);
  eq(ds.length, 1, "getDespachos devuelve 1 despacho derivado");
  eq(ds[0]._legacy, true, "el despacho derivado está marcado como _legacy");
  eq(ds[0].fechaHora, "2024-06-15T12:30", "fechaHora se compone de eventDate + horaEntrega");
  eq(ds[0].transporteCosto, 25000, "transporteCosto = trCustom");
  eq(ds[0].status, "pendiente", "status pendiente cuando q.produced es falsy");
  eq(getTransporteTotal(q), 25000, "getTransporteTotal cae al trCustom legacy");
  eq(tieneDespachosExplicitos(q), false, "tieneDespachosExplicitos = false");
  eq(getDespachoStatusAgregado(q), "pendiente", "status agregado pendiente");
});

describe("Caso 2: 1 despacho explícito", () => {
  const q = {
    id: "GB-P-2026-0001",
    despachos: [
      { id: "d1", fechaHora: "2026-05-20T10:00", transporteCosto: 30000, status: "pendiente" },
    ],
  };
  const ds = getDespachos(q);
  eq(ds.length, 1, "devuelve el único despacho explícito");
  eq(ds[0].id, "d1", "id correcto");
  eq(ds[0]._legacy, undefined, "no está marcado como _legacy");
  eq(getTransporteTotal(q), 30000, "transporte total = transporte del único despacho");
  eq(tieneDespachosExplicitos(q), true, "tieneDespachosExplicitos = true");
  eq(getDespachoStatusAgregado(q), "pendiente", "agregado pendiente (0 entregados)");
});

describe("Caso 3: N despachos mismo día (AM + PM)", () => {
  const q = {
    id: "GB-P-2026-0002",
    despachos: [
      { id: "d1", fechaHora: "2026-05-27T09:00", transporteCosto: 20000, status: "entregado" },
      { id: "d2", fechaHora: "2026-05-27T15:00", transporteCosto: 20000, status: "producido" },
    ],
  };
  const ds = getDespachos(q);
  eq(ds.length, 2, "devuelve 2 despachos");
  eq(getTransporteTotal(q), 40000, "transporte total = suma");
  eq(getDespachoStatusAgregado(q), "parcial", "agregado parcial (1 de 2 entregados)");
});

describe("Caso 4: N despachos en días distintos (caso Angela: AM/PM × 2 días)", () => {
  const q = {
    id: "GB-P-2026-0103",
    despachos: [
      { id: "d1", fechaHora: "2026-05-27T09:00", transporteCosto: 20000, status: "entregado" },
      { id: "d2", fechaHora: "2026-05-27T15:00", transporteCosto: 20000, status: "entregado" },
      { id: "d3", fechaHora: "2026-05-28T09:00", transporteCosto: 20000, status: "entregado" },
      { id: "d4", fechaHora: "2026-05-28T15:00", transporteCosto: 20000, status: "entregado" },
    ],
  };
  const ds = getDespachos(q);
  eq(ds.length, 4, "devuelve 4 despachos (Angela)");
  eq(getTransporteTotal(q), 80000, "transporte total = $80.000");
  eq(getDespachoStatusAgregado(q), "completo", "agregado completo (todos entregados)");
});

describe("Caso 5: edge cases defensivos", () => {
  eq(getDespachos(null), [], "getDespachos(null) = []");
  eq(getDespachos(undefined), [], "getDespachos(undefined) = []");
  eq(getTransporteTotal(null), 0, "getTransporteTotal(null) = 0");
  eq(tieneDespachosExplicitos(null), false, "tieneDespachosExplicitos(null) = false");
  eq(tieneDespachosExplicitos({}), false, "tieneDespachosExplicitos({}) = false");
  eq(tieneDespachosExplicitos({ despachos: [] }), false, "tieneDespachosExplicitos con array vacío = false");
});

// ─── Resumen ────────────────────────────────────────────────────────────────

console.log("");
if (fail === 0) {
  console.log(`${c.g}${c.b}✅ ${pass} tests pasaron${c.x}`);
  process.exit(0);
} else {
  console.log(`${c.r}${c.b}❌ ${fail} falló(aron) · ${pass} pasaron${c.x}`);
  process.exit(1);
}
