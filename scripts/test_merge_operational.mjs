#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de mergeOperationalFields (v7.9.10 — hardening lost-update).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_merge_operational.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué copia el helper de app-core.js (no lo importa):
//   app-core.js es UMD-style sin export, cargado por <script>. Igual que
//   test_despachos.mjs, copiamos la función aquí para probarla en aislamiento.
//   Si la firma o la lista OPERATIONAL_FIELDS cambia, actualizar este archivo.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Copia de app-core.js (mantener sincronizado) ───────────────────────────

const OPERATIONAL_FIELDS=["status","supersededBy","pagos","orderData","entregaData","produced","productionDate","approvalData","propFinalRef","comentarioCliente","pdfHistorial","pdfRegenCount"];

function mergeOperationalFields(formObj,freshDoc){
  const out={...formObj};
  if(!freshDoc)return out;
  for(const f of OPERATIONAL_FIELDS){
    if(typeof freshDoc[f]!=="undefined")out[f]=freshDoc[f];
  }
  const freshHist=Array.isArray(freshDoc.editHistory)?freshDoc.editHistory:[];
  const formHist=Array.isArray(formObj.editHistory)?formObj.editHistory:[];
  let common=0;
  while(common<freshHist.length&&common<formHist.length&&JSON.stringify(freshHist[common])===JSON.stringify(formHist[common]))common++;
  const nuevasDeSesion=formHist.slice(common);
  const merged=[...freshHist,...nuevasDeSesion];
  if(merged.length>0)out.editHistory=merged; else delete out.editHistory;
  if(out.orderData&&typeof out.orderData==="object"){
    out.orderData={
      ...out.orderData,
      fechaEntrega:out.eventDate||out.orderData.fechaEntrega||"",
      horaEntrega:out.horaEntrega||out.orderData.horaEntrega||"",
      productionDate:out.productionDate||out.orderData.productionDate||""
    };
  }
  return out;
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

describe("Caso 1: el CONTENIDO del form gana", () => {
  const form = { client: "Cliente NUEVO", cart: [{ id: "a", qty: 3 }], total: 90000, status: "enviada" };
  const fresh = { client: "Cliente VIEJO", cart: [{ id: "a", qty: 1 }], total: 30000, status: "enviada" };
  const out = mergeOperationalFields(form, fresh);
  eq(out.client, "Cliente NUEVO", "client del form gana");
  eq(out.cart, [{ id: "a", qty: 3 }], "cart del form gana");
  eq(out.total, 90000, "total del form gana");
});

describe("Caso 2: los CAMPOS OPERATIVOS del fresco ganan (no se pierde un pago concurrente)", () => {
  const form = { client: "X", status: "enviada", pagos: [], produced: false };
  const fresh = {
    client: "X",
    status: "pedido",                                  // otra sesión avanzó el estado
    pagos: [{ clientId: "p1", monto: 50000 }],         // otra sesión registró un pago
    produced: true,                                    // otra sesión marcó producido
    orderData: { fechaEntrega: "2026-06-10" },
  };
  const out = mergeOperationalFields(form, fresh);
  eq(out.status, "pedido", "status viene del fresco");
  eq(out.pagos, [{ clientId: "p1", monto: 50000 }], "pagos del fresco NO se pierden");
  eq(out.produced, true, "produced del fresco gana");
  eq(out.orderData, { fechaEntrega: "2026-06-10", horaEntrega: "", productionDate: "" }, "orderData del fresco se preserva (normalizado con campos de fecha)");
});

describe("Caso 3: editHistory append-only (no pierde entradas de otra sesión)", () => {
  // El form vio [h1] al abrir y añadió h2 → formHist=[h1,h2].
  // Mientras tanto otra sesión añadió h3 → freshHist=[h1,h3].
  const form = { editHistory: [{ id: "h1" }, { id: "h2" }] };
  const fresh = { editHistory: [{ id: "h1" }, { id: "h3" }] };
  const out = mergeOperationalFields(form, fresh);
  eq(out.editHistory, [{ id: "h1" }, { id: "h3" }, { id: "h2" }], "fresco + nuevas de la sesión");
});

describe("Caso 4: campo operativo ausente en el fresco no se inyecta", () => {
  const form = { client: "X" };           // sin pagos ni status
  const fresh = { client: "X" };          // tampoco
  const out = mergeOperationalFields(form, fresh);
  eq("pagos" in out, false, "no aparece pagos si no existía en ninguno");
  eq("status" in out, false, "no aparece status si no existía en ninguno");
});

describe("Caso 5: campo operativo solo en el form se conserva (doc nuevo / fresco parcial)", () => {
  const form = { client: "X", pagos: [{ clientId: "p9" }] };
  const fresh = { client: "X" };          // fresco sin pagos
  const out = mergeOperationalFields(form, fresh);
  eq(out.pagos, [{ clientId: "p9" }], "pagos del form se conserva si el fresco no lo trae");
});

describe("Caso 6: sin doc fresco devuelve el form intacto", () => {
  const form = { client: "X", status: "enviada", editHistory: [{ id: "h1" }] };
  eq(mergeOperationalFields(form, null), form, "freshDoc null → form sin cambios");
  eq(mergeOperationalFields(form, undefined), form, "freshDoc undefined → form sin cambios");
});

describe("Caso 8: orderData reconciliado — fecha del form gana, productionDate del fresco", () => {
  // El usuario cambió la fecha del evento en el form; otra sesión marcó producido
  // (productionDate operativo). orderData debe quedar coherente: fecha nueva + prodDate fresco.
  const form = {
    eventDate: "2026-07-01", horaEntrega: "14:00",
    orderData: { fechaEntrega: "2026-06-15", horaEntrega: "10:00", productionDate: "", extra: "keep" },
  };
  const fresh = {
    eventDate: "2026-06-15",
    produced: true, productionDate: "2026-06-30",
    orderData: { fechaEntrega: "2026-06-15", horaEntrega: "10:00", productionDate: "2026-06-30", extra: "fresh" },
  };
  const out = mergeOperationalFields(form, fresh);
  eq(out.eventDate, "2026-07-01", "eventDate top-level = form (contenido)");
  eq(out.productionDate, "2026-06-30", "productionDate = fresco (operativo)");
  eq(out.orderData.fechaEntrega, "2026-07-01", "orderData.fechaEntrega reconciliada al form");
  eq(out.orderData.horaEntrega, "14:00", "orderData.horaEntrega reconciliada al form");
  eq(out.orderData.productionDate, "2026-06-30", "orderData.productionDate = fresco");
  eq(out.orderData.extra, "fresh", "base de orderData viene del fresco");
});

describe("Caso 7: status bloqueado vive en el fresco (la guardia lo lee de ahí)", () => {
  const form = { client: "X", status: "enviada" };
  const fresh = { client: "X", status: "superseded" };
  const out = mergeOperationalFields(form, fresh);
  eq(out.status, "superseded", "el merge expone el status fresco para que el caller aborte");
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
