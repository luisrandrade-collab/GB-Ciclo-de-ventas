#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Test aislado de computePropTotal — transporte de despachos (v7.9.12 BUGFIX).
// ═══════════════════════════════════════════════════════════════════════════
// Uso: node scripts/test_proptotal_transporte.mjs
// Sale con 0 si todos los casos pasan, 1 si alguno falla.
//
// Por qué copia el helper de app-propuesta.js (no lo importa):
//   app-propuesta.js es UMD-style sin export, cargado por <script>. Igual que
//   los otros test_*.mjs, copiamos la función aquí para probarla en aislamiento.
//   computePropTotal lee el global TR → lo stubeamos con el valor real de
//   app-core.js:527. Si la firma o TR cambian, actualizar este archivo.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Stub de TR (espejo de app-core.js:527) ─────────────────────────────────
const TR={"La Calera":{n:"Transporte La Calera",p:10000},"Bogotá":{n:"Transporte Bogotá",p:20000},"Chía":{n:"Transporte Chía / Cajicá",p:40000},"Cajicá":{n:"Transporte Chía / Cajicá",p:40000}};

// ─── Copia de app-propuesta.js computePropTotal (mantener sincronizado) ──────
function computePropTotal(q){
  if(!q)return 0;
  let totMenu=0,totCatering=0;
  (q.sections||[]).forEach(sec=>{
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
let pass = 0, fail = 0;
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = useColor
  ? { g: "\x1b[32m", r: "\x1b[31m", b: "\x1b[1m", x: "\x1b[0m" }
  : { g: "", r: "", b: "", x: "" };

function eq(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ${c.g}✅${c.x} ${label}`);
    pass++;
  } else {
    console.log(`  ${c.r}❌${c.x} ${label}\n      esperado: ${expected}\n      actual:   ${actual}`);
    fail++;
  }
}
function describe(name, fn) { console.log(`\n${c.b}─── ${name} ───${c.x}`); fn(); }

// Sección "Plato Fuerte" base = $1.000.000 (para aislar el transporte)
const baseSection = () => ([{ name: "Plato Fuerte", options: [{ label: "Opción A", items: [{ price: 1000000, qty: 1 }] }] }]);

// ─── Casos de prueba ────────────────────────────────────────────────────────

describe("Caso 1: transporte legacy por ciudad conocida (sin despachos)", () => {
  const q = { sections: baseSection(), cityType: "Bogotá" };
  eq(computePropTotal(q), 1020000, "base $1.000.000 + transporte Bogotá $20.000");
});

describe("Caso 2: transporte legacy 'Otra' con trCustom", () => {
  const q = { sections: baseSection(), cityType: "Otra", trCustom: "35000" };
  eq(computePropTotal(q), 1035000, "base + trCustom $35.000");
});

describe("Caso 3: 1 solo despacho → usa transporte legacy (no el del despacho)", () => {
  // Un único despacho: el transporte real vive en trCustom, no en el objeto despacho.
  const q = { sections: baseSection(), cityType: "Otra", trCustom: "25000", despachos: [{ transporteCosto: 0 }] };
  eq(computePropTotal(q), 1025000, "1 despacho → legacy trCustom $25.000 (umbral >=2)");
});

describe("Caso 4: 2 despachos → suma los transportes de cada uno", () => {
  const q = { sections: baseSection(), cityType: "Otra", trCustom: "99999",
    despachos: [{ transporteCosto: 20000 }, { transporteCosto: 20000 }] };
  eq(computePropTotal(q), 1040000, "base + (20.000+20.000); ignora trCustom legacy");
});

describe("Caso 5: caso Angela — 4 domicilios (AM/PM × 2 días) = $80.000 transporte", () => {
  const q = { sections: baseSection(), cityType: "Otra", trCustom: "0",
    despachos: [{ transporteCosto: 20000 }, { transporteCosto: 20000 }, { transporteCosto: 20000 }, { transporteCosto: 20000 }] };
  eq(computePropTotal(q), 1080000, "base $1.000.000 + $80.000 de los 4 despachos");
});

describe("Caso 6: sin transporte de ningún tipo = 0", () => {
  const q = { sections: baseSection() };
  eq(computePropTotal(q), 1000000, "solo la base, sin transporte");
});

describe("Caso 7: secciones alternativas (incluirEnTotal:false) no se suman, transporte sí", () => {
  const q = {
    sections: [...baseSection(), { name: "Premium", incluirEnTotal: false, options: [{ label: "Opción A", items: [{ price: 500000, qty: 1 }] }] }],
    despachos: [{ transporteCosto: 30000 }, { transporteCosto: 30000 }]
  };
  eq(computePropTotal(q), 1060000, "base $1.000.000 (sin la premium) + $60.000 de 2 despachos");
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
