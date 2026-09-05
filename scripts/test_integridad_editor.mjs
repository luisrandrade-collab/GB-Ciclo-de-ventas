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

// ═══ Tests v7.9.18: resolución de ids en addC (cotizador) ═══
// Copia de la cadena de lookup de app-core.js addC(). El bug: los personalizados
// del catálogo se pintan con id "cp_<docId>" y addC no sabía resolverlos.
function resolverProducto(id,{customProductsCache=[],productosCache=null,C=[]}={}){
  let p=null,extra={};
  if(typeof id==="string"&&id.indexOf("cp_")===0){
    const cp=(customProductsCache||[]).find(x=>("cp_"+x.id)===id);
    if(cp)p={id:id,n:cp.n,d:cp.d||"",p:parseInt(cp.p)||0,u:cp.u||""};
  }else if(typeof id==="string"&&productosCache&&productosCache[id]){
    const fp=productosCache[id];
    p={id:fp.productId,n:fp.nombre,d:fp.descripcion||"",p:fp.precio||0,u:fp.unidad||""};
    extra={productId:fp.productId};
  }else{
    p=C.find(x=>x.id===id)||null;
  }
  return {p,extra};
}

describe("v7.9.18: producto personalizado del catálogo (id cp_) SÍ se resuelve",()=>{
  const cache=[{id:"abc123",n:"Peanut Butter Oreo Cheesecake",d:"5 personas",p:70000,u:"5 personas",inCatalog:true}];
  const {p}=resolverProducto("cp_abc123",{customProductsCache:cache});
  eq(!!p,true,"encuentra el producto (antes devolvía null → botón mudo)");
  eq(p&&p.n,"Peanut Butter Oreo Cheesecake","nombre correcto");
  eq(p&&p.p,70000,"precio correcto");
  eq(p&&p.id,"cp_abc123","conserva el id cp_ (lo esperan renderP, chgQ y el guardado)");
});

describe("v7.9.18: no se rompe la resolución por productosCache (Firestore)",()=>{
  const pc={"prod_9":{productId:"prod_9",nombre:"Lasagna",descripcion:"Pollo",precio:45000,unidad:"10 personas"}};
  const {p,extra}=resolverProducto("prod_9",{productosCache:pc});
  eq(p&&p.n,"Lasagna","resuelve por productosCache");
  eq(extra.productId,"prod_9","conserva productId para el BOM");
});

describe("v7.9.18: no se rompe el catálogo hardcodeado (ids numéricos)",()=>{
  const C=[{id:26,n:"Plato Mixto Libanés",d:"",p:56500,u:"por plato"}];
  const {p}=resolverProducto(26,{C});
  eq(p&&p.n,"Plato Mixto Libanés","resuelve por C[]");
});

describe("v7.9.18: id inexistente devuelve null (ahora el caller avisa, no calla)",()=>{
  const {p}=resolverProducto("cp_noexiste",{customProductsCache:[{id:"otro",n:"X",p:1}]});
  eq(p,null,"null cuando el cp_ no está en cache");
  const r2=resolverProducto(999,{C:[{id:1,n:"A"}]});
  eq(r2.p,null,"null cuando el id numérico no está en C[]");
});

// ═══ Tests v7.9.19 (A): softDeleteAjuste — filtro sobre ajustes FRESCOS ═══
// Copia del predicado de app-core.js softDeleteAjuste. El bug: filtraba el array
// del CACHÉ (podía pisar ajustes concurrentes) y se saltaba el doc si no estaba en
// caché. Ahora filtra los frescos por logId/id y reporta cuántos quitó.
function filtrarAjusteFresco(frescos,ajusteLogId,ajusteIdInDoc){
  const esElAjuste=a=>a&&(a.logId===ajusteLogId||a.id===ajusteLogId||(ajusteIdInDoc&&a.id===ajusteIdInDoc));
  const filtrados=frescos.filter(a=>!esElAjuste(a));
  return {filtrados,quitados:frescos.length-filtrados.length};
}

describe("v7.9.19: revertir ajuste quita SOLO el indicado y conserva el concurrente",()=>{
  // Firestore fresco tiene 2 ajustes: el que Luis borra + uno que Kathy aplicó después
  const frescos=[{id:"aj_1",logId:"log_1",monto:20000},{id:"aj_2",logId:"log_2",monto:5000}];
  const {filtrados,quitados}=filtrarAjusteFresco(frescos,"log_1",null);
  eq(quitados,1,"quitó exactamente 1");
  eq(filtrados.map(a=>a.id),["aj_2"],"el ajuste de Kathy sobrevive (antes se perdía al escribir el caché)");
});

describe("v7.9.19: matchea por logId aunque el caché no tenga el id interno",()=>{
  const frescos=[{id:"x9",logId:"log_7",monto:1000}];
  const r=filtrarAjusteFresco(frescos,"log_7",null); // ajusteIdInDoc=null (doc fuera del caché)
  eq(r.quitados,1,"ya no depende de que el doc esté en quotesCache");
});

describe("v7.9.19: idempotente — si ya no estaba, quitados=0 y no cambia nada",()=>{
  const frescos=[{id:"aj_2",logId:"log_2",monto:5000}];
  const r=filtrarAjusteFresco(frescos,"log_1","aj_1");
  eq(r.quitados,0,"0 quitados → el caller avisa, no dice ✅ a ciegas");
  eq(r.filtrados.length,1,"el array queda intacto");
});

// ═══ Tests v7.9.19 (B): regla de commit del renombrado de sección ═══
function commitNombreSeccion(actual,tecleado){
  const v=(tecleado||"").trim();
  return (v&&v!==actual)?v:actual; // vacío o igual → conserva
}
describe("v7.9.19: renombrar sección — reglas de commit",()=>{
  eq(commitNombreSeccion("Nueva sección","Desayuno"),"Desayuno","guarda el nombre nuevo");
  eq(commitNombreSeccion("Almuerzo","   "),"Almuerzo","vacío conserva el anterior");
  eq(commitNombreSeccion("Almuerzo","  Menaje  "),"Menaje","recorta espacios");
  eq(commitNombreSeccion("Cena","Cena"),"Cena","igual → sin cambio");
});

// ═══ Tests v7.9.20: títulos editables (retrocompatibilidad) ═══
// Copia de los resolvedores de app-cotizar.js / app-propuesta.js. La regla clave:
// un doc SIN los campos nuevos debe imprimir exactamente los títulos de siempre.
const NOTAS_TIT_DEF={n1:"Confirmación y Anticipo",n2:"Política de Cancelación",n3:"Modificaciones al Pedido",n4:"Responsable Tributario"};
const resolverTitNota=(guardados,k)=>(guardados&&guardados[k])||NOTAS_TIT_DEF[k];
const resolverTit=(guardado,def)=>guardado||def;

describe("v7.9.20: doc VIEJO sin títulos guardados → defaults (PDF idéntico a hoy)",()=>{
  const doc={notasCotData:{n1:"texto"}}; // sin notasCotTitulos ni titulo*
  const t=(doc.notasCotTitulos&&typeof doc.notasCotTitulos==="object")?{...doc.notasCotTitulos}:{};
  eq(resolverTitNota(t,"n1"),"Confirmación y Anticipo","cláusula 1 con su título de siempre");
  eq(resolverTitNota(t,"n4"),"Responsable Tributario","cláusula 4 con su título de siempre");
  eq(resolverTit(doc.tituloInstruccionesPago||"","INSTRUCCIONES DE PAGO"),"INSTRUCCIONES DE PAGO","encabezado de pago por defecto");
  eq(resolverTit(doc.tituloCondiciones||"","CONDICIONES DEL SERVICIO"),"CONDICIONES DEL SERVICIO","encabezado de condiciones por defecto");
});

describe("v7.9.20: doc con títulos propios → se respetan",()=>{
  const guardados={n2:"Cancelaciones y reembolsos"};
  eq(resolverTitNota(guardados,"n2"),"Cancelaciones y reembolsos","usa el título del documento");
  eq(resolverTitNota(guardados,"n1"),"Confirmación y Anticipo","los no cambiados siguen en default");
  eq(resolverTit("FORMAS DE PAGO","INSTRUCCIONES DE PAGO"),"FORMAS DE PAGO","encabezado personalizado");
});

describe("v7.9.20: título vacío o solo espacios NO pisa el default",()=>{
  eq(resolverTitNota({n1:""},"n1"),"Confirmación y Anticipo","vacío cae al default");
  eq(resolverTit("","CONDICIONES DEL SERVICIO"),"CONDICIONES DEL SERVICIO","cadena vacía cae al default");
});

describe("v7.9.20: bloques MENAJE / PERSONAL de la propuesta (pedido JP)",()=>{
  eq(resolverTit("","MENAJE"),"MENAJE","propuesta vieja imprime MENAJE");
  eq(resolverTit("","PERSONAL DE SERVICIO"),"PERSONAL DE SERVICIO","propuesta vieja imprime PERSONAL DE SERVICIO");
  eq(resolverTit("VAJILLA Y CRISTALERÍA","MENAJE"),"VAJILLA Y CRISTALERÍA","título nuevo se usa");
  // el encabezado de reposición y el sufijo de opción siguen al título
  const tm=resolverTit("VAJILLA","MENAJE");
  eq(tm+" — Opción A","VAJILLA — Opción A","multi-opción conserva el sufijo");
  eq("VALORES DE REPOSICIÓN DE "+tm+" (valores unitarios)","VALORES DE REPOSICIÓN DE VAJILLA (valores unitarios)","reposición queda coherente");
});

// ═══ Tests v7.9.20 (C): motor compartido de notas dinámicas ═══
// Copia de app-core.js gbNotasNormalizar / gbNotaMover. Regla crítica: un doc
// viejo (objeto legacy {n1..}) debe producir EXACTAMENTE la lista de siempre.
function gbNotasNormalizar(lista,legacy,defaults,titulos){
  if(Array.isArray(lista)&&lista.length){
    return lista.filter(n=>n&&(n.titulo||n.texto)).map((n,i)=>({id:n.id||("x"+i),titulo:String(n.titulo||""),texto:String(n.texto||"")}));
  }
  const src=(legacy&&typeof legacy==="object")?legacy:null;
  return Object.keys(defaults).map(k=>({id:k,titulo:titulos[k]||"",texto:(src&&typeof src[k]==="string")?src[k]:defaults[k]}));
}
function gbNotasALegacy(lista,defaults){
  const out={};Object.keys(defaults).forEach((k,i)=>{out[k]=(lista[i]&&lista[i].texto)||defaults[k]});return out;
}
function gbNotaMover(lista,i,dir){
  const j=i+dir;if(i<0||i>=lista.length||j<0||j>=lista.length)return lista;
  const out=lista.slice();const t=out[i];out[i]=out[j];out[j]=t;return out;
}
const DEF={n1:"txt1",n2:"txt2",n3:"txt3"},TIT={n1:"Uno",n2:"Dos",n3:"Tres"};

describe("v7.9.20: doc VIEJO (objeto legacy) → lista idéntica a la de siempre",()=>{
  const l=gbNotasNormalizar(null,{n1:"editado",n2:"txt2",n3:"txt3"},DEF,TIT);
  eq(l.length,3,"3 notas");
  eq(l.map(x=>x.titulo),["Uno","Dos","Tres"],"títulos por defecto en orden");
  eq(l[0].texto,"editado","conserva el texto que el usuario había editado");
});

describe("v7.9.20: doc SIN notas → set por defecto completo",()=>{
  const l=gbNotasNormalizar(null,null,DEF,TIT);
  eq(l.map(x=>x.texto),["txt1","txt2","txt3"],"textos por defecto");
});

describe("v7.9.20: doc NUEVO con lista → se respeta tal cual (incluye agregadas)",()=>{
  const guardada=[{id:"n1",titulo:"Uno",texto:"a"},{id:"nn99",titulo:"Nota propia",texto:"b"}];
  const l=gbNotasNormalizar(guardada,{n1:"viejo"},DEF,TIT);
  eq(l.length,2,"la lista manda sobre el legacy");
  eq(l[1].titulo,"Nota propia","conserva la nota agregada por el usuario");
});

describe("v7.9.20: reordenar",()=>{
  const l=[{id:"a",titulo:"A"},{id:"b",titulo:"B"},{id:"c",titulo:"C"}];
  eq(gbNotaMover(l,0,1).map(x=>x.id),["b","a","c"],"bajar la primera");
  eq(gbNotaMover(l,2,-1).map(x=>x.id),["a","c","b"],"subir la última");
  eq(gbNotaMover(l,0,-1).map(x=>x.id),["a","b","c"],"subir la primera no hace nada");
  eq(gbNotaMover(l,2,1).map(x=>x.id),["a","b","c"],"bajar la última no hace nada");
});

describe("v7.9.20: notas vacías se descartan (no ensucian el PDF)",()=>{
  const l=gbNotasNormalizar([{id:"a",titulo:"A",texto:"x"},{id:"b",titulo:"",texto:""}],null,DEF,TIT);
  eq(l.length,1,"la nota totalmente vacía no entra");
});

describe("v7.9.20: legacy de salida — cliente con caché vieja no ve vacío",()=>{
  const l=[{id:"n1",titulo:"Uno",texto:"nuevo1"},{id:"nn5",titulo:"Extra",texto:"extra"}];
  const leg=gbNotasALegacy(l,DEF);
  eq(leg.n1,"nuevo1","primera nota mapeada a n1");
  eq(leg.n2,"extra","segunda posición mapeada a n2");
  eq(leg.n3,"txt3","faltantes con el default (nunca undefined)");
});

// ═══ Tests v7.9.21: reposición opcional (reporte JP) ═══
// Copia de getIncluirReposicion. Regla crítica: un doc SIN el campo debe
// comportarse como siempre (sale en PropFinal, no en propuesta inicial).
function getIncluirReposicion(guardado,esFinal){
  if(guardado===true||guardado===false)return guardado;
  return !!esFinal;
}
// Gate del PDF (app-propuesta.js): con repoOn false la lista queda vacía.
function opcionesParaRepo(repoOn,menajeOptions,menajeItems){
  return repoOn&&Array.isArray(menajeOptions)&&menajeOptions.length
    ?menajeOptions
    :(repoOn?[{id:"_active",label:"",items:menajeItems}]:[]);
}

describe("v7.9.21: doc VIEJO sin el campo → comportamiento histórico intacto",()=>{
  eq(getIncluirReposicion(undefined,true),true,"PropFinal vieja SÍ imprime reposición");
  eq(getIncluirReposicion(undefined,false),false,"propuesta inicial vieja NO imprime (regla v7.9.8.1)");
  eq(getIncluirReposicion(null,false),false,"null = sin decidir → default");
});

describe("v7.9.21: JP puede activarla en la propuesta de evento",()=>{
  eq(getIncluirReposicion(true,false),true,"activada explícitamente en propuesta inicial");
  const ops=opcionesParaRepo(true,[{id:"opA",items:[{name:"Platos",qty:10}]}],[]);
  eq(ops.length,1,"el PDF sí recorre las opciones de menaje");
});

describe("v7.9.21: y desactivarla en una PropFinal si no la quiere",()=>{
  eq(getIncluirReposicion(false,true),false,"desactivada explícitamente en PropFinal");
  eq(opcionesParaRepo(false,[{id:"opA",items:[{name:"Platos"}]}],[{name:"X"}]).length,0,"gate cerrado → no se imprime nada");
});

describe("v7.9.21: multi-opción se conserva cuando está activada",()=>{
  const ops=opcionesParaRepo(true,[{id:"a",items:[]},{id:"b",items:[]}],[]);
  eq(ops.length,2,"dos opciones de menaje → dos tablas de reposición");
});

// ─── Resumen ────────────────────────────────────────────────────────────────
console.log("");
if(fail===0){console.log(`${c.g}${c.b}✅ ${pass} tests pasaron${c.x}`);process.exit(0)}
else{console.log(`${c.r}${c.b}❌ ${fail} falló(aron) · ${pass} pasaron${c.x}`);process.exit(1)}
