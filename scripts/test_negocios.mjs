// v8.0.0 (tramos 1 a 3): identidad del negocio (F1), métricas puras (F2), aviso de contacto (F5); Inicio y Negocios (T2); ficha, F6, reporte y unir/separar (T3).
// Ejecuta funciones de la fuente real (app-negocios.js y las que reproduce), sin red ni datos productivos.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readdirSync} from 'node:fs';
import {loadSourceFunctions,source,functionSource} from './source_test_helpers.mjs';

let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('OK '+name)};
const quiet={log(){},error(){},warn(){}};
const plain=x=>JSON.parse(JSON.stringify(x));
const neg=(...names)=>names.map(n=>['app-negocios.js',n]);
const RESOLVER=neg('_negMsDe','_negMs','ENLACES_HACIA_PADRE','ENLACES_HACIA_HIJO','_resolverNegociosDetalle','resolverNegocios','businessIdHeredado');
const resolver=()=>loadSourceFunctions(RESOLVER,{});
const ts=iso=>({toMillis:()=>Date.parse(iso)});
const agrupar=docs=>{
  const g=resolver().resolverNegocios(docs);
  const out={};
  for(const [k,v] of g)out[k]={cabeza:v.cabeza.id,docs:v.documentos.map(d=>d.id),nivel:v.nivel,motivos:[...v.motivos],relacionados:[...v.relacionados],gruposDeOpciones:[...(v.gruposDeOpciones||[])]};
  return plain(out); // los arreglos nacen en el contexto vm: se normalizan para comparar
};

// ─── F1: resolvedor ────────────────────────────────────────
await test('F1 cotización con 3 versiones: un negocio, cabeza la última, seguro',()=>{
  const docs=[
    {id:'GB-2026-0001',kind:'quote',status:'superseded',supersededBy:'GB-2026-0001-1',createdAt:ts('2026-09-01T10:00:00Z')},
    {id:'GB-2026-0001-1',kind:'quote',status:'superseded',parentQuote:'GB-2026-0001',supersededBy:'GB-2026-0001-2',createdAt:ts('2026-09-02T10:00:00Z')},
    {id:'GB-2026-0001-2',kind:'quote',status:'enviada',parentQuote:'GB-2026-0001-1',createdAt:ts('2026-09-03T10:00:00Z')}
  ];
  const g=agrupar(docs);
  assert.deepEqual(Object.keys(g),['GB-2026-0001']);
  assert.equal(g['GB-2026-0001'].cabeza,'GB-2026-0001-2');
  assert.deepEqual(g['GB-2026-0001'].docs,['GB-2026-0001','GB-2026-0001-1','GB-2026-0001-2']);
  assert.equal(g['GB-2026-0001'].nivel,'seguro');
});
const cadenaPF=()=>[
  {id:'GB-P-2026-0010',kind:'proposal',status:'convertida',propFinalRef:'GB-PF-2026-0101',createdAt:ts('2026-09-01T10:00:00Z')},
  {id:'GB-PF-2026-0100',kind:'proposal',_isPF:true,status:'superseded',sourceProposal:'GB-P-2026-0010',supersededBy:'GB-PF-2026-0101',createdAt:ts('2026-09-02T10:00:00Z')},
  {id:'GB-PF-2026-0101',kind:'proposal',_isPF:true,status:'propfinal',sourceProposal:'GB-P-2026-0010',supersedes:'GB-PF-2026-0100',version:2,createdAt:ts('2026-09-03T10:00:00Z')}
];
await test('F1 propuesta → PF → PF regenerada: un negocio seguro con cabeza en la PF vigente',()=>{
  const g=agrupar(cadenaPF());
  assert.deepEqual(Object.keys(g),['GB-P-2026-0010']);
  assert.equal(g['GB-P-2026-0010'].cabeza,'GB-PF-2026-0101');
  assert.equal(g['GB-P-2026-0010'].nivel,'seguro',JSON.stringify(g));
  assert.equal(g['GB-P-2026-0010'].docs.length,3);
});
await test('F1 el orden de entrada no cambia el resultado (determinista)',()=>{
  const docs=[...cadenaPF(),{id:'GB-2026-0005',kind:'quote',status:'enviada',dateISO:'2026-09-04T10:00:00Z'}];
  assert.deepEqual(agrupar(docs),agrupar([...docs].reverse()));
});
await test('F1 enlace roto: el documento queda como negocio propio, ambiguo («historia incompleta»)',()=>{
  const g=agrupar([{id:'GB-2026-0002-1',kind:'quote',status:'enviada',parentQuote:'GB-2026-0002'}]);
  assert.deepEqual(Object.keys(g),['GB-2026-0002-1']);
  assert.equal(g['GB-2026-0002-1'].nivel,'ambiguo');assert.ok(g['GB-2026-0002-1'].motivos.includes('enlace_roto'));
});
await test('F1 ciclo: termina, agrupa y marca ambiguo',()=>{
  const docs=[{id:'A',kind:'quote',status:'superseded',parentQuote:'B',supersededBy:'B'},{id:'B',kind:'quote',status:'superseded',parentQuote:'A',supersededBy:'A'}];
  const g=agrupar(docs);
  assert.equal(Object.keys(g).length,1);
  const n=Object.values(g)[0];
  assert.equal(n.nivel,'ambiguo');assert.ok(n.motivos.includes('ciclo'));assert.ok(n.motivos.includes('sin_cabeza'));
  assert.ok(['A','B'].includes(n.cabeza));
  const auto=agrupar([{id:'C',kind:'quote',status:'enviada',parentQuote:'C'}]);
  assert.ok(auto.C.motivos.includes('ciclo'),'un documento que se nombra a sí mismo');
});
await test('F1 enlace de un solo sentido: mismo negocio, nivel probable',()=>{
  const g=agrupar([{id:'P',kind:'quote',status:'superseded'},{id:'P-1',kind:'quote',status:'enviada',parentQuote:'P'}]);
  assert.deepEqual(Object.keys(g),['P']);assert.equal(g.P.nivel,'probable');assert.equal(g.P.cabeza,'P-1');
});
await test('F1 anulada con reemplazo y grupo de opciones: negocios distintos, sólo «relacionados»',()=>{
  const g=agrupar([
    {id:'A',kind:'quote',status:'anulada',replacedBy:'B'},{id:'B',kind:'quote',status:'enviada',replaces:'A'},
    {id:'O1',kind:'quote',status:'enviada',optionGroupId:'g'},{id:'O2',kind:'quote',status:'pedido',optionGroupId:'g'}
  ]);
  assert.deepEqual(Object.keys(g).sort(),['A','B','O1','O2']);
  assert.deepEqual(g.A.relacionados,['B']);assert.deepEqual(g.B.relacionados,['A']);
  // v8.0.0 R2 (Codex P2): el grupo de opciones es UNA lista compartida por sus negocios, sin pares.
  assert.deepEqual(g.O1.relacionados,[]);assert.deepEqual(g.O2.relacionados,[]);
  assert.deepEqual(g.O1.gruposDeOpciones,[{optionGroupId:'g',negocios:['O1','O2']}]);
  assert.deepEqual(g.A.gruposDeOpciones,[]);
  const crudo=resolver().resolverNegocios([{id:'O1',kind:'quote',optionGroupId:'g'},{id:'O2',kind:'quote',optionGroupId:'g'},{id:'O3',kind:'quote',optionGroupId:'solo'}]);
  assert.equal(crudo.get('O1').gruposDeOpciones[0],crudo.get('O2').gruposDeOpciones[0],'la misma lista, no una copia por negocio');
  assert.equal(crudo.get('O3').gruposDeOpciones.length,0,'un grupo de un solo negocio no relaciona');
  for(const k of ['A','B','O1','O2'])assert.equal(g[k].nivel,'seguro');
});
await test('F1 documentos nuevos con businessId coherente y viejos sin businessId conviven sin conflicto',()=>{
  const g=agrupar([
    {id:'R',kind:'quote',status:'superseded',supersededBy:'R-1'},
    {id:'R-1',kind:'quote',status:'enviada',parentQuote:'R',businessId:'R'},
    {id:'N',kind:'quote',status:'enviada',businessId:'N'}
  ]);
  assert.equal(g.R.nivel,'seguro');assert.equal(g.N.nivel,'seguro');assert.deepEqual(g.R.docs,['R','R-1']);
});
await test('F1 businessId en conflicto con los enlaces: manda el enlace verificado, ambiguo, no se reescribe',()=>{
  const docs=[
    {id:'Q',kind:'quote',status:'superseded',supersededBy:'Q-1',businessId:'Q'},
    {id:'Q-1',kind:'quote',status:'enviada',parentQuote:'Q',businessId:'OTRO'},
    {id:'OTRO',kind:'quote',status:'enviada',businessId:'OTRO'}
  ];
  const g=agrupar(docs);
  assert.deepEqual(g.Q.docs,['Q','Q-1'],'el enlace verificado manda');
  assert.equal(g.Q.nivel,'ambiguo');assert.ok(g.Q.motivos.includes('businessId_en_conflicto'));
  assert.deepEqual(g.OTRO.docs,['OTRO']);assert.equal(g.OTRO.nivel,'seguro');
  assert.equal(docs[1].businessId,'OTRO','el resolvedor no escribe el campo');
});
await test('F1 restauración parcial sin la raíz: cada documento queda aparte, ambiguo, nunca se une por businessId',()=>{
  const g=agrupar([
    {id:'R-1',kind:'quote',status:'enviada',parentQuote:'R',businessId:'R'},
    {id:'R-2',kind:'quote',status:'enviada',parentQuote:'R',businessId:'R'}
  ]);
  assert.deepEqual(Object.keys(g).sort(),['R-1','R-2']);
  for(const k of ['R-1','R-2']){assert.equal(g[k].nivel,'ambiguo');assert.ok(g[k].motivos.includes('enlace_roto'))}
});
await test('F1 precedencia: negocioManual > enlaces > businessId; la versión posterior sigue a su padre',()=>{
  const base=()=>[
    {id:'Q',kind:'quote',status:'superseded',supersededBy:'Q-1',businessId:'Q'},
    {id:'Q-1',kind:'quote',status:'superseded',parentQuote:'Q',supersededBy:'Q-2',businessId:'Q'},
    {id:'Q-2',kind:'quote',status:'enviada',parentQuote:'Q-1',businessId:'Q'},
    {id:'X',kind:'quote',status:'enviada',businessId:'X'}
  ];
  // unir: X pasa al negocio Q aunque no tenga enlaces ni su businessId lo diga.
  let docs=base();docs[3].negocioManual={businessId:'Q',accion:'unir',motivo:'mismo evento'};
  let g=agrupar(docs);
  assert.deepEqual(Object.keys(g),['Q']);assert.deepEqual(g.Q.docs,['Q','Q-1','Q-2','X']);
  assert.ok(g.Q.motivos.includes('varias_cabezas'),'dos documentos vivos en el negocio unido');
  // separar: Q-1 sale con su negocio; Q-2 (sin decisión propia) la hereda de su padre.
  docs=base();docs[1].negocioManual={businessId:'Q-1',accion:'separar',motivo:'otro evento'};
  g=agrupar(docs);
  assert.deepEqual(g.Q.docs,['Q']);assert.deepEqual(g['Q-1'].docs,['Q-1','Q-2']);
  assert.equal(g['Q-1'].nivel,'seguro','la decisión manual no se califica con los enlaces');
  // deshacer (negocioManual:null): vuelve a mandar el enlace.
  docs=base();docs[1].negocioManual=null;
  assert.deepEqual(Object.keys(agrupar(docs)).sort(),['Q','X']);
});
await test('F1 cabeza determinista con datos inconsistentes: la más reciente y, a igualdad, el id mayor',()=>{
  const mismo='2026-09-05T10:00:00Z';
  const g=agrupar([
    {id:'M',kind:'quote',status:'enviada',supersededBy:'M-1',createdAt:ts(mismo)},
    {id:'M-1',kind:'quote',status:'enviada',parentQuote:'M',createdAt:ts(mismo)}
  ]);
  assert.equal(g.M.cabeza,'M-1');assert.equal(g.M.nivel,'ambiguo');assert.ok(g.M.motivos.includes('varias_cabezas'));
});
await test('F1 copias en la colección equivocada no entran',()=>{
  const g=agrupar([{id:'GB-PF-1',kind:'proposal',_isPF:true,status:'propfinal'},{id:'GB-PF-1',kind:'proposal',_wrongCollection:true,status:'enviada'}]);
  assert.deepEqual(Object.keys(g),['GB-PF-1']);assert.equal(g['GB-PF-1'].docs.length,1);
});
await test('F1 businessIdHeredado: el del padre; si el padre es viejo, la clave de sus enlaces; sin datos, el id del padre',()=>{
  const c=resolver();
  assert.equal(c.businessIdHeredado({businessId:'RAIZ'},'Q-1',[]),'RAIZ');
  const cache=[{id:'R',kind:'quote',status:'superseded',supersededBy:'R-1'},{id:'R-1',kind:'quote',status:'enviada',parentQuote:'R'}];
  assert.equal(c.businessIdHeredado({status:'enviada'},'R-1',cache),'R');
  assert.equal(c.businessIdHeredado({status:'enviada'},'Z',[]),'Z');
  assert.equal(c.businessIdHeredado({},'GB-PF-2026-0100',cadenaPF()),'GB-P-2026-0010');
});

// ─── F2: métricas = cifras de renderDashboard y getPipelineActivo ───
const METRICAS=neg('montoNegocio','saldoNegocio','_negEnRango','_negCuentaEnKpis','_negEnPipeline','_negMetrica','_negSi','contextoMetricas','metricaCotizado','metricaVendido','metricaEntregado','metricaRecaudado','metricaPorCobrar','metricaPipelineCotizacion','metricaPipelineConfirmados','metricaPipelineEntregadosConSaldo');
const DINERO=[...['getPagos','pagosBaseParaEscribir','totalCobrado','totalAjustes','totalCargos','saldoPendiente','METODOS_PAGO'].map(n=>['app-historial.js',n]),...['TR','computePropTotal','getDocTotal','isAnulada','noSumaEnKpis','buildOptionExclusions','FOLLOW_UP_META','getFollowUp','isCumplido'].map(n=>['app-core.js',n]),...['dateOfCreation','dateOfSale'].map(n=>['app-dashboard.js',n])];
const RANGO={start:'2026-09-01',end:'2026-09-30'};
const secciones=precio=>[{name:'Menú',options:[{label:'Opción A',items:[{price:precio,qty:1}]}]}];
const universo=()=>[
  {id:'Q1',kind:'quote',status:'enviada',dateLocal:'2026-09-05',total:100000},
  {id:'Q2',kind:'quote',status:'pedido',dateLocal:'2026-08-20',eventDate:'2026-09-10',total:200000,pagos:[{fecha:'2026-09-02',monto:50000,metodo:'Nequi'}],cargos:[{monto:15000}],ajustes:[{monto:10000}]},
  {id:'Q3',kind:'quote',status:'entregado',dateLocal:'2026-09-01',eventDate:'2026-09-15',total:300000,pagos:[{fecha:'2026-09-15',monto:350000,metodo:'Efectivo'},{fecha:'2026-09-16',monto:-20000,tipo:'devolucion',metodo:'Efectivo'}]},
  {id:'Q4',kind:'quote',status:'entregado',dateLocal:'2026-09-02',eventDate:'2026-09-12',total:0,cargos:[{monto:15000},{monto:9000,deletedAt:'x'}]},
  {id:'O1',kind:'quote',status:'enviada',dateLocal:'2026-09-03',total:500,optionGroupId:'G'},
  {id:'O2',kind:'quote',status:'enviada',dateLocal:'2026-09-03',total:800,optionGroupId:'G'},
  {id:'O3',kind:'quote',status:'pedido',dateLocal:'2026-09-03',eventDate:'2026-09-20',total:900,optionGroupId:'G',pagos:[{fecha:'2026-09-21',monto:100,metodo:'Sin especificar'}]},
  {id:'F1',kind:'quote',status:'pedido',dateLocal:'2026-09-04',eventDate:'2026-09-18',total:4000,anuladaData:{fecha:'2026-09-03'}},
  {id:'L1',kind:'quote',status:'enviada',followUp:'perdida',dateLocal:'2026-09-06',total:700,pagos:[{fecha:'2026-09-07',monto:100}]},
  {id:'L2',kind:'quote',status:'pedido',followUp:'perdida',dateLocal:'2026-09-06',eventDate:'2026-09-08',total:1000},
  {id:'S1',kind:'quote',status:'superseded',dateLocal:'2026-09-05',total:999,supersededBy:'Q1'},
  {id:'C1',kind:'proposal',status:'convertida',dateLocal:'2026-09-05',sections:secciones(2000),propFinalRef:'PF1'},
  {id:'PF1',kind:'proposal',_isPF:true,status:'propfinal',dateLocal:'2026-09-07',sections:secciones(3000),total:2500,sourceProposal:'C1'},
  {id:'P5',kind:'proposal',status:'aprobada',dateLocal:'2026-08-15',eventDate:'2026-09-25',sections:secciones(1000),approvalData:{anticipo:400,fechaAprobacion:'2026-09-09',metodoPago:'Efectivo'}},
  {id:'W1',kind:'proposal',_wrongCollection:true,status:'enviada',dateLocal:'2026-09-05',sections:secciones(77)},
  {id:'V1',kind:'quote',dateISO:'2026-09-11T10:00:00Z',total:50},
  {id:'E2',kind:'quote',status:'entregado',dateLocal:'2026-07-01',eventDate:'2026-07-10',total:800,pagos:[{fecha:'2026-07-10',monto:300}],ajustes:[{monto:100},{monto:500,deletedAt:'x'}]}
];
function dashboard(docs){
  const el={};const $=id=>(el[id]??={innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}}});
  const nada=()=>{};
  const g={$,document:{querySelectorAll:()=>[]},window:{},console:quiet,quotesCache:docs,loadAllHistory:async()=>{},fm:String,h:String,jsArg:String,
    getDashRange:()=>({...RANGO,label:'rango'}),getDashRangePrev:()=>null,gbTodayIso:()=>'2026-09-30',gbDateToIso:d=>d.toISOString().slice(0,10),
    dashPeriod:'custom'};
  for(const n of ['renderDashHead','renderFantasmasBanner','renderBannerEntregasHoy','renderBannerConvertidasArchivables','renderBannerSync','renderCustomRangeInfo','renderPipelineActivo','renderBannerFollowUp','renderBannerComprasPendientes','renderBannerNovedades','renderTrend6m','renderReporteConversion','renderReportePerdidas','renderTodayZone','renderUrgent3d','applyDashCollapsedState'])g[n]=nada;
  const c=loadSourceFunctions([...DINERO,['app-dashboard.js','renderDashboard']],g);
  return {c,el};
}
const leerTarjeta=(html,lab,sub)=>{
  const m=html.match(new RegExp(lab+'</div><div class="dash-card-val">(-?\\d+)</div><div class="dash-card-sub">'+(sub?'(\\d+) '+sub:'')));
  assert.ok(m,'no encontré la tarjeta '+lab);return {monto:Number(m[1]),n:sub?Number(m[2]):null};
};
function metricas(docs){
  const c=loadSourceFunctions([...DINERO,...RESOLVER,...METRICAS],{window:{},console:quiet});
  const ctx=c.contextoMetricas(docs);
  const suma=(fn,xs)=>xs.reduce((a,x)=>{const m=c[fn](x,RANGO,ctx);return {n:a.n+(m.incluye?1:0),monto:a.monto+(m.incluye?m.monto:0)}},{n:0,monto:0});
  return {c,ctx,suma};
}
await test('F2 cada número = la cifra de renderDashboard sobre los mismos datos (cargos, ajustes, devoluciones, cortesía, sobrepago, opciones, fantasma, perdidas)',async()=>{
  const docs=universo();
  const {c:dc,el}=dashboard(docs);await dc.renderDashboard();
  const html=el['dash-cards'].innerHTML;
  const {suma}=metricas(docs);
  const cot=leerTarjeta(html,'Cotizado','doc'),ven=leerTarjeta(html,'Vendido','pedido'),ent=leerTarjeta(html,'Entregado','entrega'),rec=leerTarjeta(html,'Recaudado',''),cob=leerTarjeta(html,'Por cobrar','documento');
  assert.deepEqual(suma('metricaCotizado',docs),{n:cot.n,monto:cot.monto},'Cotizado');
  assert.deepEqual(suma('metricaVendido',docs),{n:ven.n,monto:ven.monto},'Vendido');
  assert.deepEqual(suma('metricaEntregado',docs),{n:ent.n,monto:ent.monto},'Entregado');
  assert.equal(suma('metricaRecaudado',docs).monto,rec.monto,'Recaudado');
  assert.deepEqual(suma('metricaPorCobrar',docs),{n:cob.n,monto:cob.monto},'Por cobrar');
  // Cifras esperadas a mano: el universo no es trivial.
  assert.equal(cot.monto,100000+300000+0+500+1000+3000+50,'Cotizado: Q1+Q3+Q4+O1+L2+PF1+V1 (sin O2/O3, fantasma, perdida en cotización, superseded ni convertida)');
  assert.equal(ven.monto,200000+300000+0+900+1000+1000,'Vendido: Q2+Q3+Q4+O3+L2+P5 (las hermanas cuentan)');
  assert.equal(rec.monto,50000+350000-20000+100+400,'Recaudado: por pago en el rango, con devolución y anticipo legacy; la perdida en cotización no');
  assert.equal(cob.monto,155000+15000+800+1000+600+400,'Por cobrar: saldo canónico sin rango (sobrepago = 0; E2 fuera del rango cuenta)');
});
await test('F2 los tres cuadros del Pipeline = getPipelineActivo (sin isAnulada, perdida en cualquier estado, q.total)',()=>{
  const docs=universo();
  const g={quotesCache:docs,window:{},console:quiet};
  const c=loadSourceFunctions([...DINERO,['app-core.js','getPipelineActivo']],g);
  const b=c.getPipelineActivo();
  const {suma}=metricas(docs);
  assert.deepEqual(suma('metricaPipelineCotizacion',docs),{n:b.en_cotizacion.count,monto:b.en_cotizacion.total});
  assert.deepEqual(suma('metricaPipelineConfirmados',docs),{n:b.pedidos_confirmados.count,monto:b.pedidos_confirmados.total});
  assert.deepEqual(suma('metricaPipelineEntregadosConSaldo',docs),{n:b.entregados_con_saldo.count,monto:b.entregados_con_saldo.total});
  assert.ok(b.pedidos_confirmados.docs.some(d=>d.id==='F1'),'el fantasma cuenta en el Pipeline de hoy');
  assert.ok(!b.pedidos_confirmados.docs.some(d=>d.id==='L2'),'la perdida confirmada no cuenta en el Pipeline de hoy');
  assert.ok(b.en_cotizacion.docs.some(d=>d.id==='PF1')&&b.en_cotizacion.total===100000+500+2500+50,'la PF suma su total guardado, como hoy');
});
await test('F2 agrupar en negocios no cambia ninguna cifra',()=>{
  const docs=[...universo(),...cadenaPF().map(d=>({...d,dateLocal:'2026-09-08',sections:secciones(1234)}))];
  const {c,suma}=metricas(docs);
  const negocios=[...c.resolverNegocios(docs).values()];
  for(const fn of ['metricaCotizado','metricaVendido','metricaEntregado','metricaRecaudado','metricaPorCobrar','metricaPipelineCotizacion','metricaPipelineConfirmados','metricaPipelineEntregadosConSaldo'])
    assert.equal(suma(fn,negocios).monto,suma(fn,docs).monto,fn);
});
await test('F2 la exclusión de hermanas sólo aplica a Cotizado y Pipeline',()=>{
  const {c,ctx}=metricas(universo());
  const o3=universo().find(d=>d.id==='O3');
  assert.equal(c.metricaCotizado(o3,RANGO,ctx).incluye,false);
  assert.equal(c.metricaVendido(o3,RANGO,ctx).incluye,true);
  assert.equal(c.metricaPorCobrar(o3,RANGO,ctx).monto,800);
});

// ─── F3 (anticipo de T1): rendimiento ─────────────────────
function sinteticos(n){
  const out=[];let i=0;
  while(out.length<n){
    const b='GB-2026-'+String(i).padStart(5,'0'),dia='2026-09-'+String(1+i%28).padStart(2,'0');
    const pago=[{fecha:dia,monto:1000,metodo:'Nequi'}];
    if(i%3===0){
      out.push({id:b,kind:'quote',status:'superseded',supersededBy:b+'-1',dateLocal:dia,total:1000,businessId:b});
      out.push({id:b+'-1',kind:'quote',status:'superseded',parentQuote:b,supersededBy:b+'-2',dateLocal:dia,total:1100,businessId:b});
      out.push({id:b+'-2',kind:'quote',status:i%2?'pedido':'enviada',parentQuote:b+'-1',dateLocal:dia,eventDate:dia,total:1200,pagos:pago,businessId:b});
    }else if(i%3===1){
      const p='GB-P-2026-'+String(i).padStart(5,'0'),pf='GB-PF-2026-'+String(i).padStart(5,'0');
      out.push({id:p,kind:'proposal',status:'convertida',propFinalRef:pf,dateLocal:dia,sections:secciones(5000)});
      out.push({id:pf,kind:'proposal',_isPF:true,status:'aprobada',sourceProposal:p,dateLocal:dia,eventDate:dia,sections:secciones(5000),pagos:pago});
    }else out.push({id:b,kind:'quote',status:'entregado',dateLocal:dia,eventDate:dia,total:900,optionGroupId:'g'+(i%50),pagos:pago});
    i++;
  }
  return out; // sin recortar: cortar una cadena a la mitad dejaría un enlace roto (≥ n documentos)
}
// v8.0.1c: una corrida de calentamiento y el MÍNIMO de 5 contra el mismo presupuesto. El ruido del equipo
// (GC, otro proceso) sólo suma tiempo, así que el mínimo es la mejor estimación del costo real; un recorrido
// cuadrático sube también el mínimo y la prueba sigue cayendo. Devuelve el resultado de la última corrida.
function mejorTiempo(fn,veces=5){
  fn();let ms=Infinity,r;
  for(let i=0;i<veces;i++){const t0=performance.now();r=fn();ms=Math.min(ms,performance.now()-t0)}
  return {ms,r};
}
await test('F3 rendimiento: resolvedor y las ocho métricas sobre 5.000 documentos en menos de 300 ms',()=>{
  const docs=sinteticos(5000);
  const {c,suma}=metricas(docs);
  const {ms,r:negocios}=mejorTiempo(()=>{
    const negocios=[...c.resolverNegocios(docs).values()];
    for(const fn of ['metricaCotizado','metricaVendido','metricaEntregado','metricaRecaudado','metricaPorCobrar','metricaPipelineCotizacion','metricaPipelineConfirmados','metricaPipelineEntregadosConSaldo'])suma(fn,negocios);
    return negocios;
  });
  console.log('   5.000 documentos → '+negocios.length+' negocios en '+ms.toFixed(1)+' ms');
  assert.ok(ms<300,'tardó '+ms.toFixed(1)+' ms');
  assert.ok(negocios.length<5000&&negocios.every(n=>n.nivel!=='ambiguo'));
});
await test('F3 rendimiento R2: 5.000 documentos en un único grupo de opciones (resolvedor, métricas y herencia) en menos de 300 ms',()=>{
  const docs=[];
  for(let i=0;i<5000;i++){const dia='2026-09-'+String(1+i%28).padStart(2,'0');docs.push({id:'GB-2026-'+String(i).padStart(5,'0'),kind:'quote',status:'enviada',dateLocal:dia,total:1000+i,optionGroupId:'uno'})}
  const {c,suma}=metricas(docs);
  const {ms,r:[negocios,heredado]}=mejorTiempo(()=>{
    const negocios=[...c.resolverNegocios(docs).values()];
    for(const fn of ['metricaCotizado','metricaVendido','metricaEntregado','metricaRecaudado','metricaPorCobrar','metricaPipelineCotizacion','metricaPipelineConfirmados','metricaPipelineEntregadosConSaldo'])suma(fn,negocios);
    return [negocios,c.businessIdHeredado({},'GB-2026-00007',docs)]; // padre viejo: recorre el resolvedor completo
  });
  console.log('   5.000 documentos en un grupo → '+negocios.length+' negocios en '+ms.toFixed(1)+' ms');
  assert.ok(ms<300,'tardó '+ms.toFixed(1)+' ms');
  assert.equal(heredado,'GB-2026-00007');
  assert.equal(negocios.length,5000);
  const grupo=negocios[0].gruposDeOpciones[0];
  assert.equal(grupo.negocios.length,5000);assert.ok(negocios.every(n=>n.gruposDeOpciones.length===1&&n.gruposDeOpciones[0]===grupo&&!n.relacionados.length));
});

// ─── F5: aviso de contacto ─────────────────────────────────
const AVISO=[...neg('_negMsDe','_negMs','diasSinContacto','avisoContacto'),...['FOLLOW_UP_META','getFollowUp','isFollowable'].map(n=>['app-core.js',n])];
const aviso=()=>loadSourceFunctions(AVISO,{gbTodayIso:()=>'2026-09-28'});
const AHORA=Date.parse('2026-09-28T12:00:00Z');
await test('F5 aviso: próximo contacto vencido o de hoy → «Contactar a X» con la nota; futuro → nada',()=>{
  const c=aviso();
  const q={id:'Q',kind:'quote',status:'enviada',client:'Ana',followUp:'activa',proximoContacto:{fecha:'2026-09-28',nota:'Llamar tras la cata',usuario:'k',at:'x'}};
  const a=c.avisoContacto(q,'2026-09-28',AHORA);
  assert.equal(a.texto,'Contactar a Ana');assert.equal(a.nota,'Llamar tras la cata');assert.equal(a.tipo,'proximo_contacto');
  assert.equal(c.avisoContacto({...q,proximoContacto:{fecha:'2026-09-20',nota:''}},'2026-09-28',AHORA).tipo,'proximo_contacto');
  assert.equal(c.avisoContacto({...q,followUp:'pendiente',followUpUpdatedAt:'2026-08-01T00:00:00Z',proximoContacto:{fecha:'2026-10-05'}},'2026-09-28',AHORA),null,'fecha futura: todavía no');
  assert.equal(c.avisoContacto({...q,followUp:'perdida'},'2026-09-28',AHORA),null,'perdida: sin aviso');
  assert.equal(c.avisoContacto({...q,status:'pedido'},'2026-09-28',AHORA),null,'confirmada: sin aviso');
});
await test('F5 aviso: 7 días desde el último contacto (followUpUpdatedAt), no desde la edición (updatedAt) (D2)',()=>{
  const c=aviso();
  const base={id:'Q',kind:'quote',status:'enviada',client:'Ana',followUp:'contactado'};
  const editadaHoy={...base,followUpUpdatedAt:'2026-09-18T12:00:00Z',updatedAt:{toDate:()=>new Date(AHORA)},dateISO:'2026-09-01T00:00:00Z'};
  assert.equal(c.diasSinContacto(editadaHoy,AHORA),10);
  assert.equal(c.avisoContacto(editadaHoy,'2026-09-28',AHORA).dias,10,'editar no reinicia la cuenta');
  assert.equal(c.avisoContacto({...base,followUpUpdatedAt:'2026-09-25T12:00:00Z'},'2026-09-28',AHORA),null,'contactada hace 3 días');
  const sinContacto={...base,followUp:undefined,createdAt:{toDate:()=>new Date('2026-09-20T12:00:00Z')},updatedAt:{toDate:()=>new Date(AHORA)}};
  assert.equal(c.avisoContacto(sinContacto,'2026-09-28',AHORA).dias,8,'sin contacto: desde la creación');
  assert.equal(c.avisoContacto({...base,followUp:'activa',followUpUpdatedAt:'2026-08-01T00:00:00Z'},'2026-09-28',AHORA),null,'activa sin fecha: como hoy, sin aviso de 7 días');
});
await test('F5 el banner del Dashboard y las alertas de Seguimiento usan avisoContacto; daysSinceUpdate ya no existe',()=>{
  for(const f of ['app-core.js','app-dashboard.js','app-seguimiento.js','app-historial.js','app-cotizar.js','app-propuesta.js','app-negocios.js'])
    assert.ok(!/daysSinceUpdate/.test(source(f)),f+' todavía usa daysSinceUpdate');
  assert.ok(/avisoContacto\(/.test(functionSource('app-dashboard.js','renderBannerFollowUp')));
  assert.ok(/avisoContacto\(/.test(functionSource('app-seguimiento.js','renderSeguimiento')));
});
await test('F5 banner: cuenta el vencido y el de 7 días; no el editado ayer ni el de fecha futura; escapa el nombre',()=>{
  const el={};const $=id=>(el[id]??={innerHTML:'',classList:{add(){},remove(){}}});
  const hoy=new Date().toISOString().slice(0,10);
  const hace=d=>new Date(Date.now()-d*86400000).toISOString();
  const docs=[
    {id:'A',kind:'quote',status:'enviada',client:'<b>Ana</b>',followUp:'activa',proximoContacto:{fecha:hoy,nota:'x'}},
    {id:'B',kind:'quote',status:'enviada',client:'Beto',followUp:'contactado',followUpUpdatedAt:hace(9),updatedAt:{toDate:()=>new Date()}},
    {id:'C',kind:'quote',status:'enviada',client:'Carla',followUp:'contactado',followUpUpdatedAt:hace(1),updatedAt:{toDate:()=>new Date(Date.now()-30*86400000)}},
    {id:'D',kind:'quote',status:'enviada',client:'Dora',followUp:'pendiente',followUpUpdatedAt:hace(20),proximoContacto:{fecha:'2999-01-01'}}
  ];
  const c=loadSourceFunctions([...AVISO,['app-dashboard.js','renderBannerFollowUp']],{$,quotesCache:docs,gbTodayIso:()=>hoy,h:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;')});
  c.renderBannerFollowUp();
  const html=el['dash-banner-follow'].innerHTML;
  assert.match(html,/<strong>2 /);assert.match(html,/Beto/);assert.ok(!/Carla|Dora/.test(html));
  assert.ok(html.includes('&lt;b&gt;Ana&lt;/b&gt;')&&!html.includes('<b>Ana'),'el nombre del cliente va escapado');
});
await test('F5 pérdidas: «Tiempo» se muestra como «Fecha no disponible»; la clave no cambia; los viejos muestran la etiqueta nueva; el reporte vuelve a llamarse',()=>{
  const core=source('app-core.js');
  assert.match(core,/tiempo:"Fecha no disponible"/);
  const c=loadSourceFunctions([['app-core.js','MOTIVOS_PERDIDA'],['app-core.js','motivoPerdidaLabel']],{});
  assert.equal(c.motivoPerdidaLabel({motivo:'tiempo',motivoLabel:'Tiempo'}),'Fecha no disponible','documento viejo con la etiqueta guardada');
  assert.equal(c.motivoPerdidaLabel({motivo:'precio',motivoLabel:'Precio'}),'Precio');
  assert.equal(c.motivoPerdidaLabel({motivoLabel:'Algo viejo'}),'Algo viejo');
  assert.equal(c.motivoPerdidaLabel(null),'');
  for(const [f,n] of [['app-dashboard.js','renderReportePerdidas'],['app-historial.js','_calcularPerdidasPorMotivo']]){
    const src=functionSource(f,n);assert.ok(/tiempo:"Fecha no disponible"/.test(src)&&!/"Tiempo"/.test(src),n);
  }
  assert.ok(!/label:"Por tiempo"/.test(source('app-historial.js')));
  assert.match(source('index.html'),/<option value="tiempo">Fecha no disponible/);
  for(const f of ['app-core.js','app-seguimiento.js'])assert.ok(!/perdidaData\?\.motivoLabel/.test(source(f)),f+': la etiqueta visible sale de motivoPerdidaLabel');
  assert.ok(/renderReportePerdidas\(range,inRange\)/.test(functionSource('app-dashboard.js','renderDashboard')),'D3: el Dashboard vuelve a llamar el reporte');
});
await test('F5 el reporte de pérdidas pinta la etiqueta nueva para la clave vieja',()=>{
  const el={};const $=id=>(el[id]??={innerHTML:''});
  const c=loadSourceFunctions([['app-dashboard.js','renderReportePerdidas'],['app-dashboard.js','dateOfCreation'],...['FOLLOW_UP_META','getFollowUp'].map(n=>['app-core.js',n])],{$,quotesCache:[{id:'A',kind:'quote',status:'enviada',followUp:'perdida',total:10,perdidaData:{fecha:'2026-09-05T00:00:00Z',motivo:'tiempo',motivoLabel:'Tiempo'}}],getDocTotal:q=>q.total,fm:String});
  c.renderReportePerdidas(RANGO,f=>f>=RANGO.start&&f<=RANGO.end);
  assert.match(el['dash-reporte-perdidas'].innerHTML,/Fecha no disponible/);assert.doesNotMatch(el['dash-reporte-perdidas'].innerHTML,/>Tiempo</);
});

// ─── F5: próximo contacto (dato y limpieza) ────────────────
function followUpFixture(doc){
  const escrituras=[];const cache=[{...doc}];
  const c=loadSourceFunctions([...['FOLLOW_UP_META','MOTIVOS_PERDIDA','setFollowUp'].map(n=>['app-core.js',n])],{
    cloudOnline:true,quotesCache:cache,toast(){},console:quiet,gbMensajeError:e=>e.message,getCollectionName:()=>'quotes',auditStamp:()=>({}),
    window:{fb:{db:{},doc:(_,coll,id)=>coll+'/'+id,serverTimestamp:()=>'TS',updateDoc:async(ref,patch)=>{escrituras.push({ref,patch:plain(patch)})},
      runTransaction:async(_,cb)=>cb({get:async()=>({exists:()=>true,data:()=>plain(doc)}),update:(ref,patch)=>{escrituras.push({ref,patch:plain(patch)})}})}}}); // v8.0.6: setFollowUp en transacción
  return {c,escrituras,cache};
}
await test('F5 marcar perdida borra el próximo contacto con null en la misma escritura',async()=>{
  const f=followUpFixture({id:'Q',kind:'quote',status:'enviada',proximoContacto:{fecha:'2026-10-01',nota:'x'}});
  assert.equal(await f.c.setFollowUp('Q','quote','perdida',{motivo:'precio'}),true);
  assert.equal(f.escrituras.length,1);
  assert.ok(Object.prototype.hasOwnProperty.call(f.escrituras[0].patch,'proximoContacto')&&f.escrituras[0].patch.proximoContacto===null,'null, no deleteField');
  assert.equal(f.escrituras[0].patch.followUp,'perdida');assert.equal(f.cache[0].proximoContacto,null);
});
await test('F5 marcar Contactado/Activa guarda el próximo contacto si se da; sin él no se toca',async()=>{
  const pc={fecha:'2026-10-03',nota:'Confirmar invitados',usuario:'kathy',at:'2026-09-28T10:00:00Z'};
  let f=followUpFixture({id:'Q',kind:'quote',status:'enviada'});
  await f.c.setFollowUp('Q','quote','contactado',{proximoContacto:pc});
  assert.deepEqual(f.escrituras[0].patch.proximoContacto,pc);assert.deepEqual(f.cache[0].proximoContacto,pc);
  f=followUpFixture({id:'Q',kind:'quote',status:'enviada',proximoContacto:pc});
  await f.c.setFollowUp('Q','quote','activa',{proximoContacto:null});
  assert.equal(f.escrituras[0].patch.proximoContacto,null,'«sin próximo contacto» lo borra');
  f=followUpFixture({id:'Q',kind:'quote',status:'enviada',proximoContacto:pc});
  await f.c.setFollowUp('Q','quote','activa');
  assert.ok(!('proximoContacto' in f.escrituras[0].patch),'sin dato no se toca (Historial › 🟢 Viva)');
});
await test('F5 Seguimiento: Contactado y Activa piden el próximo contacto (opcional) y lo escriben con la marca; Perdida no',async()=>{
  const el={};const $=id=>(el[id]??={value:'',textContent:'',classList:{add(){},remove(){}}});
  const llamadas=[];
  const c=loadSourceFunctions(['markFollowUp','_marcarSeguimiento','openProximoContactoModal','closeProximoContactoModal','submitProximoContacto'].map(n=>['app-seguimiento.js',n]),{
    $,_proxContactoCtx:null,quotesCache:[{id:'Q',kind:'quote',client:'Ana',proximoContacto:{fecha:'2026-09-01',nota:'vieja'}}],FOLLOW_UP_META:{contactado:{label:'Contactado',emoji:'💬'},activa:{label:'Activa',emoji:'✅'}},
    gbTodayIso:()=>'2026-09-28',currentUser:{email:'kathy@example.invalid'},setFollowUp:async(...a)=>{llamadas.push(plain(a));return true},
    showLoader(){},hideLoader(){},toast(){},renderSeguimiento(){},renderDashboard(){},renderHist(){},curMode:'seg',alert(){}});
  await c.markFollowUp('Q','quote','contactado');
  assert.equal(llamadas.length,0,'primero abre la ventana');
  assert.equal($('pc-fecha').value,'','el próximo contacto vencido no se propone de nuevo');
  $('pc-fecha').value='2026-10-02';$('pc-nota').value='x'.repeat(200);
  await c.submitProximoContacto();
  assert.equal(llamadas.length,1);
  const [id,kind,estado,extra]=llamadas[0];
  assert.deepEqual([id,kind,estado],['Q','quote','contactado']);
  assert.equal(extra.proximoContacto.fecha,'2026-10-02');assert.equal(extra.proximoContacto.nota.length,140);assert.equal(extra.proximoContacto.usuario,'kathy@example.invalid');assert.ok(extra.proximoContacto.at);
  await c.markFollowUp('Q','quote','activa');$('pc-fecha').value='';await c.submitProximoContacto();
  assert.equal(llamadas[1][3].proximoContacto,null,'sin fecha: marca y deja sin próximo contacto');
  assert.ok(/markFollowUp\(/.test(source('app-seguimiento.js'))&&/id="proximo-contacto-modal"/.test(source('index.html')));
});

// ─── F5: formularioConCambios (contrato v2.1) ──────────────
await test('F5 formularioConCambios compara con la firma del formulario abierto (editableFieldSignatures), no con diffDocs',()=>{
  const g={window:{}};
  const c=loadSourceFunctions([...['EDITABLE_FIELDS','gbStableJson','editableFieldSignatures','editableDocumentSignature','rememberEditBase'].map(n=>['app-core.js',n]),...neg('formularioConCambios')],g);
  const form={client:'Ana',att:'',cart:[{id:1,qty:2}],notasInternas:''};
  c.rememberEditBase('quote','Q',{client:'Ana'},{formulario:form});
  assert.equal(c.formularioConCambios('quote',{...form},'Q'),false);
  assert.equal(c.formularioConCambios('quote',{...form,att:'Compras'},'Q'),true);
  assert.equal(c.formularioConCambios('quote',{...form,cart:[{id:1,qty:3}]},'Q'),true);
  assert.equal(c.formularioConCambios('quote',{...form,notasInternas:''},'Q'),false,'un valor igual no es cambio');
  assert.equal(c.formularioConCambios('quote',form,'OTRO'),true,'base de otro documento: se trata como cambio (pide versión)');
  c.rememberEditBase('quote','Q',{client:'Ana'});
  assert.equal(c.formularioConCambios('quote',form,'Q'),true,'sin firma del formulario: se trata como cambio');
  assert.ok(!/diffDocs/.test(functionSource('app-negocios.js','formularioConCambios')));
});

// ═══ v8.0.0 (tramo 2): Inicio, Negocios, avisos y navegación (bandera GB_REDISENO_R1) ═══
const hReal=s=>s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const T2=[...neg('_r1Norm','_r1Manana','rangoInicio','etapaNegocio','ETAPAS_R1','proximaAccion','ACCIONES_R1','CHIPS_R1','CUADROS_R1','PERIODOS_R1','_r1Estado',
  'proyectarNegocios','proyeccionNegocios','invalidarProyeccionNegocios','filtrarNegocios','_r1Cuadro','_r1Boton','_r1HtmlCuadro','_r1HtmlFila','_r1HtmlFranja',
  '_r1Cablear','renderInicio','renderNegocios','_r1PintarLista','accionR1','_r1Click','_r1Input','pintarNavR1','refrescarVistasR1','ESCRITURAS_FB_R1','programarRefrescoR1','vigilarEscriturasR1','iniciarRedisenoR1','_r1NavClick'),...['getMenajeOpciones','propRequierePF'].map(n=>['app-core.js',n])]; // v8.0.7 D18
const HOY='2026-09-30',MAN='2026-10-01';
const estadoR1=c=>vm.runInContext('_r1Estado',c); // const del script: no es propiedad del contexto
function domR1(){
  const els={};
  const mk=id=>{const s=new Set();return {id,innerHTML:'',textContent:'',value:'',hidden:id==='r1-menu'||id==='r1-barra',dataset:{},style:{},listeners:{},
    classList:{add:c=>s.add(c),remove:c=>s.delete(c),toggle:(c,f)=>((f===undefined?!s.has(c):f)?s.add(c):s.delete(c)),contains:c=>s.has(c)},
    addEventListener(t,f){(this.listeners[t]??=[]).push(f)},setAttribute(){},focus(){}}};
  const $=id=>els[id]??=mk(id);
  const extras={dashboard:{textContent:'Dashboard'},moduloViejo:{textContent:'Inicio'}};
  const document={body:$('body'),querySelectorAll:()=>[],querySelector:sel=>sel.includes('inicio/dashboard')?extras.dashboard:sel.includes('data-mod="inicio"')?extras.moduloViejo:null};
  return {$,els,document,extras};
}
function ctxR1(docs,{escribe=true,empresa=false,flag=true,curMode='negocios',timers=null,extra={},mas=[]}={}){ // T3: extra (globales) y mas (funciones)
  const {$,els,document,extras}=domR1();
  const llamadas=[];const spy=n=>(...a)=>{llamadas.push([n,...a.map(String)])};
  const trampa={}; // la pantalla nueva no escribe; el envoltorio del refresco (R2) puede envolver estas funciones
  for(const n of ['setDoc','updateDoc','deleteDoc','addDoc','runTransaction','writeBatch'])trampa[n]=()=>{throw new Error('la pantalla nueva no debe escribir ('+n+')')};
  const g={$,document,window:{fb:trampa},console:quiet,quotesCache:docs,GB_REDISENO_R1:flag,curMode,h:hReal,
    gbTodayIso:()=>HOY,canCurrentUserWrite:()=>escribe,gbEmisorConfigurado:()=>empresa,GB_EMISOR:{accountingEntityId:'GB_SAS_SIMPLE'},
    openOrderModal:spy('openOrderModal'),openPropFinalFlow:spy('openPropFinalFlow'),openApproveModal:spy('openApproveModal'),toggleProduced:spy('toggleProduced'),
    openDeliveryModal:spy('openDeliveryModal'),openPagoModal:spy('openPagoModal'),openFeModal:spy('openFeModal'),markFollowUp:spy('markFollowUp'),gbShellMobileOpen:spy('gbShellMobileOpen'),
    setTimeout:timers?timers.set:setTimeout,clearTimeout:timers?timers.clear:clearTimeout,...extra};
  const c=loadSourceFunctions([...DINERO,...RESOLVER,...METRICAS,...neg('diasSinContacto','avisoContacto'),['app-core.js','isFollowable'],['app-core.js','gbDateToIso'],
    ['app-dashboard.js','gbPorFacturar'],['app-core.js','renderMode'],['app-core.js','refreshActiveView'],['app-core.js','fm'],...T2,...mas],g); // fm real: no convierte (P-36)
  c.setMode=m=>{llamadas.push(['setMode',m]);c.curMode=m;c.renderMode(m)};
  return {c,els,llamadas,extras};
}
const sinComillas=html=>html.replace(/"[^"]*"/g,'""'); // h() escapa las comillas: lo que queda fuera de "…" es marcado real
const onAttr=html=>/<[^>]*\son[a-z]+\s*=/i.test(sinComillas(html));
const mundoR1=()=>[
  {id:'C1',kind:'quote',status:'enviada',client:'José Pérez',dateLocal:'2026-09-20',total:1000,followUp:'contactado',followUpUpdatedAt:new Date().toISOString()},
  {id:'GB-2026-0001',kind:'quote',status:'superseded',supersededBy:'GB-2026-0001-1',client:'Ana',dateLocal:'2026-09-01',total:500},
  {id:'GB-2026-0001-1',kind:'quote',status:'enviada',parentQuote:'GB-2026-0001',client:'Ana',dateLocal:'2026-09-02',total:600,proximoContacto:{fecha:'2026-09-29',nota:'Llamar'}},
  {id:'P1',kind:'proposal',status:'enviada',client:'Beto',dateLocal:'2026-09-10',createdAt:ts('2026-01-10T12:00:00Z'),followUp:'pendiente',
    sections:[{id:'s',name:'Menú',options:[{id:'a',label:'A',items:[{price:100,qty:1}]},{id:'b',label:'B',items:[{price:200,qty:1}]}]}]},
  {id:'P2',kind:'proposal',status:'enviada',client:'Carla',dateLocal:'2026-09-11',followUp:'activa',sections:secciones(300)},
  {id:'GB-P-2026-0009',kind:'proposal',status:'convertida',propFinalRef:'GB-PF-2026-0001',client:'Dora',dateLocal:'2026-09-05',sections:secciones(400)},
  {id:'GB-PF-2026-0001',kind:'proposal',_isPF:true,status:'propfinal',sourceProposal:'GB-P-2026-0009',client:'Dora',dateLocal:'2026-09-12',followUp:'activa',sections:secciones(400),total:400},
  {id:'Q5',kind:'quote',status:'pedido',client:'Eva',dateLocal:'2026-09-15',eventDate:MAN,total:800},
  {id:'Q6',kind:'quote',status:'pedido',produced:true,client:'Fito',dateLocal:'2026-09-14',eventDate:'2026-09-25',total:900,pagos:[{fecha:'2026-09-14',monto:900,metodo:'Nequi'}]},
  {id:'Q7',kind:'quote',status:'pedido',client:'Gina',dateLocal:'2026-09-13',eventDate:'2026-09-26',total:100},
  {id:'Q8',kind:'quote',status:'entregado',client:'Hugo',dateLocal:'2026-09-01',eventDate:'2026-09-20',total:1000,pagos:[{fecha:'2026-09-20',monto:400,metodo:'Nequi'}]},
  {id:'Q9',kind:'quote',status:'entregado',client:'Iris',dateLocal:'2026-09-01',eventDate:'2026-09-21',total:500,pagos:[{fecha:'2026-09-21',monto:500}],accountingEntityId:'GB_SAS_SIMPLE'},
  {id:'L1',kind:'quote',status:'enviada',followUp:'perdida',client:'Juan',dateLocal:'2026-09-03',total:50},
  {id:'A1',kind:'quote',status:'anulada',client:'Kiko',dateLocal:'2026-09-03',total:70,anuladaData:{fecha:'2026-09-04'}},
  {id:'R1-1',kind:'quote',status:'enviada',parentQuote:'R1',client:'Lu',dateLocal:'2026-09-04',total:10}
];
const porCabeza=p=>Object.fromEntries(p.negocios.map(n=>[n.cabeza.id,n]));
const leerCuadros=html=>Object.fromEntries([...html.matchAll(/data-cuadro="([a-z_]+)" data-n="(\d+)" data-monto="(-?\d+)"/g)].map(m=>[m[1],{n:Number(m[2]),monto:Number(m[3])}]));

await test('T2 Inicio: cada cuadro = conteo y suma de su lista filtrada (misma función) = cifra de renderDashboard/getPipelineActivo',async()=>{
  const docs=universo();
  const {c}=ctxR1(docs,{curMode:'inicio'});
  c.renderMode('inicio');
  const html=c.$('mode-inicio').innerHTML;
  const cuadros=leerCuadros(html);
  assert.deepEqual(Object.keys(cuadros).sort(),['cobrar','cotizado','entregado','pipe_conf','pipe_cot','pipe_ent','recaudado','vendido']);
  const p=c.proyeccionNegocios(),r=c.rangoInicio('mes');
  assert.equal(r.start+'|'+r.end,RANGO.start+'|'+RANGO.end,'Este mes = el rango del mes del Dashboard');
  for(const [clave,v] of Object.entries(cuadros)){
    const lista=c.filtrarNegocios(p,{chip:null,metrica:{clave,rango:r},texto:'',pagina:1});
    assert.equal(lista.filas.length,v.n,clave+': conteo = filas de la lista');
    assert.equal(lista.suma,v.monto,clave+': suma de la lista = número del cuadro');
  }
  const {c:dc,el}=dashboard(docs);await dc.renderDashboard();
  const dh=el['dash-cards'].innerHTML;
  const esperado={cotizado:leerTarjeta(dh,'Cotizado','doc'),vendido:leerTarjeta(dh,'Vendido','pedido'),entregado:leerTarjeta(dh,'Entregado','entrega'),cobrar:leerTarjeta(dh,'Por cobrar','documento')};
  for(const [k,v] of Object.entries(esperado))assert.deepEqual(cuadros[k],{n:v.n,monto:v.monto},k+' = Dashboard');
  assert.equal(cuadros.recaudado.monto,leerTarjeta(dh,'Recaudado','').monto,'recaudado = Dashboard');
  const b=loadSourceFunctions([...DINERO,['app-core.js','getPipelineActivo']],{quotesCache:docs,window:{},console:quiet}).getPipelineActivo();
  assert.deepEqual(cuadros.pipe_cot,{n:b.en_cotizacion.count,monto:b.en_cotizacion.total});
  assert.deepEqual(cuadros.pipe_conf,{n:b.pedidos_confirmados.count,monto:b.pedidos_confirmados.total});
  assert.deepEqual(cuadros.pipe_ent,{n:b.entregados_con_saldo.count,monto:b.entregados_con_saldo.total});
  for(const k of ['pipe_cot','pipe_conf','pipe_ent','cotizado','vendido','entregado','recaudado','cobrar'])assert.match(html,new RegExp('data-cuadro="'+k+'"[^>]*>[\\s\\S]*?class="r1-cuadro-que"'),k+' lleva su línea de qué suma');
  assert.ok(!/Lo que pasa hoy|Urgentes/.test(html));
});
await test('T2 tocar un cuadro abre Negocios filtrado y la lista suma exactamente el número',()=>{
  const {c,llamadas}=ctxR1(universo(),{curMode:'inicio'});
  c.renderMode('inicio');
  const cuadros=leerCuadros(c.$('mode-inicio').innerHTML);
  for(const clave of ['cotizado','pipe_ent','recaudado']){
    c.accionR1({r1:'cuadro',cuadro:clave});
    assert.deepEqual(llamadas.at(-1),['setMode','negocios']);
    const res=c.$('r1-neg-resumen').innerHTML;
    assert.match(res,new RegExp('data-r1-suma="'+cuadros[clave].monto+'" data-r1-n="'+cuadros[clave].n+'"'),clave+': '+res);
    const filas=(c.$('r1-neg-lista').innerHTML.match(/class="r1-fila[ "]/g)||[]).length;
    assert.equal(filas,Math.min(50,cuadros[clave].n));
  }
  c.accionR1({r1:'quitar-metrica'});
  assert.equal(estadoR1(c).filtro.metrica,null);assert.equal(estadoR1(c).filtro.chip,'abiertos');
});
await test('T2 período del Inicio con chips propios (Este mes · Mes anterior · Este año), independiente del Dashboard',()=>{
  const {c}=ctxR1(universo(),{curMode:'inicio'});
  assert.deepEqual([c.rangoInicio('mes').start,c.rangoInicio('mes').end],['2026-09-01','2026-09-30']);
  assert.deepEqual([c.rangoInicio('mes_anterior').start,c.rangoInicio('mes_anterior').end],['2026-08-01','2026-08-31']);
  assert.deepEqual([c.rangoInicio('anio').start,c.rangoInicio('anio').end],['2026-01-01','2026-09-30']);
  c.dashPeriod='all';c.renderMode('inicio');
  const mes=leerCuadros(c.$('mode-inicio').innerHTML);
  c.accionR1({r1:'periodo',periodo:'mes_anterior'});
  const ant=leerCuadros(c.$('mode-inicio').innerHTML);
  assert.notEqual(mes.cotizado.monto,ant.cotizado.monto,'el período cambia los números');
  assert.deepEqual(mes.cobrar,ant.cobrar,'Por cobrar no tiene período');
  assert.deepEqual(mes.pipe_cot,ant.pipe_cot,'el Pipeline no tiene período');
  assert.match(c.$('mode-inicio').innerHTML,/data-periodo="mes_anterior"[^>]*aria-pressed="true"/);
  const t2=source('app-negocios.js').slice(source('app-negocios.js').indexOf('(tramo 2)'));
  assert.ok(!/dashPeriod|getDashRange/.test(t2),'no depende del período del Dashboard viejo');
});
// v8.0.1 (parte b): «Fechas», rango propio del Inicio con dos <input type="date">.
const ctxFechas=()=>{const toasts=[];const x=ctxR1(mundoR1(),{curMode:'inicio',extra:{toast:(m,t)=>{toasts.push([String(m),t])}}});return {...x,toasts}};
const aplicarFechas=(c,desde,hasta)=>{c.accionR1({r1:'fechas'});c.$('r1-ini-desde').value=desde;c.$('r1-ini-hasta').value=hasta;c.accionR1({r1:'fechas-aplicar'})};
await test('v8.0.1 Fechas: el rango propio aplica a los cuatro números del período y a la lista del cuadro; Por cobrar y Pipeline no cambian',()=>{
  const {c,llamadas}=ctxFechas();
  Object.assign(c,{dashPeriod:'all',dashCustomFrom:'2020-01-01',dashCustomTo:'2020-12-31'});
  c.renderMode('inicio');
  const mes=leerCuadros(c.$('mode-inicio').innerHTML);
  c.accionR1({r1:'fechas'});
  let html=c.$('mode-inicio').innerHTML;
  assert.match(html,/<input type="date" id="r1-ini-desde"[^>]*>/);assert.match(html,/<input type="date" id="r1-ini-hasta"[^>]*>/);
  assert.equal(estadoR1(c).periodo,'mes','abrir «Fechas» todavía no cambia el período');
  aplicarFechas(c,'2026-09-10','2026-09-20');
  assert.equal(estadoR1(c).periodo,'rango');
  html=c.$('mode-inicio').innerHTML;
  assert.match(html,/data-r1="fechas"[^>]*aria-pressed="true"/);
  assert.match(html,/Fechas · 2026-09-10 → 2026-09-20/,'la franja muestra el rango elegido');
  assert.match(html,/id="r1-ini-desde" value="2026-09-10"/);assert.match(html,/id="r1-ini-hasta" value="2026-09-20"/);
  const rg=leerCuadros(html),p=c.proyeccionNegocios(),R={start:'2026-09-10',end:'2026-09-20'};
  for(const cu of vm.runInContext('CUADROS_R1',c)){
    let n=0,monto=0;for(const x of p.negocios){const m=cu.fn(x,cu.pipeline||cu.clave==='cobrar'?null:R,p.ctx);if(m.incluye){n++;monto+=m.monto}}
    assert.deepEqual(rg[cu.clave],{n,monto},cu.clave+' = su métrica con el rango elegido');
  }
  assert.notDeepEqual(rg.cotizado,mes.cotizado,'el rango cambia los números');
  for(const k of ['cobrar','pipe_cot','pipe_conf','pipe_ent'])assert.deepEqual(rg[k],mes[k],k+' sin período');
  for(const clave of ['cotizado','vendido','entregado','recaudado']){
    c.accionR1({r1:'cuadro',cuadro:clave});
    assert.deepEqual(llamadas.at(-1),['setMode','negocios']);
    assert.deepEqual(plain(estadoR1(c).filtro.metrica.rango).start+'|'+estadoR1(c).filtro.metrica.rango.end,'2026-09-10|2026-09-20');
    const res=c.$('r1-neg-resumen').innerHTML;
    assert.match(res,new RegExp('data-r1-suma="'+rg[clave].monto+'" data-r1-n="'+rg[clave].n+'"'),clave+': '+res);
    assert.match(res,/2026-09-10 → 2026-09-20/,'el resumen de Negocios dice el rango');
    c.renderMode('inicio');
  }
  assert.equal(estadoR1(c).periodo,'rango','el rango se recuerda al volver al Inicio');
  assert.deepEqual([c.dashPeriod,c.dashCustomFrom,c.dashCustomTo],['all','2020-01-01','2020-12-31'],'no toca el Dashboard viejo');
  const t2=source('app-negocios.js').slice(source('app-negocios.js').indexOf('(tramo 2)'));
  assert.ok(!/dashCustom/.test(t2),'no lee ni escribe el rango del Dashboard viejo');
  c.accionR1({r1:'periodo',periodo:'mes'});
  assert.deepEqual(leerCuadros(c.$('mode-inicio').innerHTML),mes,'volver a «Este mes» deja los números del mes');
  assert.ok(!/r1-ini-desde/.test(c.$('mode-inicio').innerHTML),'con otro período los campos se cierran');
});
await test('v8.0.1 Fechas: vacías, Desde > Hasta o con basura no cambian el período y avisan; HTML sin marcado inyectado',()=>{
  const {c,toasts}=ctxFechas();
  c.renderMode('inicio');
  const mes=leerCuadros(c.$('mode-inicio').innerHTML);
  for(const [d,a] of [['',''],['2026-09-10',''],['','2026-09-20'],['2026-09-21','2026-09-20'],['2026-09-10" onfocus="alert(1)','2026-09-20'],['<b>x</b>','2026-09-20']]){
    toasts.length=0;aplicarFechas(c,d,a);
    assert.equal(estadoR1(c).periodo,'mes',d+'|'+a);assert.equal(estadoR1(c).rango,null);
    assert.equal(toasts.length,1,'avisa: '+d+'|'+a);assert.equal(toasts[0][1],'error');
    assert.deepEqual(leerCuadros(c.$('mode-inicio').innerHTML),mes);
  }
  aplicarFechas(c,'2026-09-15','2026-09-15'); // un solo día es válido
  assert.equal(estadoR1(c).periodo,'rango');
  aplicarFechas(c,'2026-09-30','2026-09-01');
  assert.deepEqual([estadoR1(c).rango.start,estadoR1(c).rango.end],['2026-09-15','2026-09-15'],'un rango inválido no reemplaza el vigente');
  const html=c.$('mode-inicio').innerHTML;
  assert.ok(!/<b>|onfocus/.test(html)&&!onAttr(html),'sin marcado ni manejadores inyectados');
});
// v8.0.1 ronda 2 (Codex r1, hallazgos 1 y 2).
await test('v8.0.1 r2 Fechas: sólo fechas reales de calendario (2026-02-31 rechazada, 2028-02-29 aceptada)',()=>{
  const {c,toasts}=ctxFechas();
  c.renderMode('inicio');
  for(const [d,a] of [['2026-02-31','2026-03-05'],['2026-02-29','2026-03-05'],['2026-09-10','2026-09-31'],['2026-13-01','2026-13-02'],['2026-00-10','2026-09-20']]){
    toasts.length=0;aplicarFechas(c,d,a);
    assert.equal(estadoR1(c).periodo,'mes',d+'|'+a);assert.equal(estadoR1(c).rango,null,d+'|'+a);
    assert.equal(toasts.length,1,'avisa: '+d+'|'+a);
  }
  aplicarFechas(c,'2028-02-29','2028-03-01');
  assert.equal(estadoR1(c).periodo,'rango','el 29 de febrero de un año bisiesto es válido');
  assert.deepEqual([estadoR1(c).rango.start,estadoR1(c).rango.end],['2028-02-29','2028-03-01']);
});
await test('v8.0.1 r2 Fechas: lo escrito sin aplicar sobrevive a un repintado automático; aplicar o cambiar de período lo limpia',()=>{
  const {c}=ctxFechas();
  c.renderMode('inicio');
  const box=c.$('mode-inicio'),escribir=(tipo,desde,hasta)=>{
    c.$('r1-ini-desde').value=desde;c.$('r1-ini-hasta').value=hasta;
    for(const id of ['r1-ini-desde','r1-ini-hasta'])for(const f of box.listeners[tipo]||[])f({type:tipo,target:c.$(id)});
  };
  c.accionR1({r1:'fechas'});
  escribir('input','2026-09-10','2026-09-20');
  c.refrescarVistasR1(); // p. ej. al terminar una escritura en segundo plano
  let html=box.innerHTML;
  assert.match(html,/id="r1-ini-desde" value="2026-09-10"/,'Desde sigue escrito');assert.match(html,/id="r1-ini-hasta" value="2026-09-20"/,'Hasta sigue escrito');
  assert.equal(estadoR1(c).periodo,'mes','el borrador no se aplica');assert.equal(estadoR1(c).rango,null);
  assert.match(html,/Este mes · 2026-09-01 → 2026-09-30/,'los números siguen con el período vigente');
  escribir('change','2026-09-11','2026-09-21'); // navegadores que sólo avisan al cerrar el selector
  c.refrescarVistasR1();
  assert.match(box.innerHTML,/id="r1-ini-desde" value="2026-09-11"/);assert.match(box.innerHTML,/id="r1-ini-hasta" value="2026-09-21"/);
  c.accionR1({r1:'fechas-aplicar'});
  assert.equal(estadoR1(c).periodo,'rango');assert.equal(estadoR1(c).borrador,null,'aplicar limpia el borrador');
  escribir('input','2026-09-01','2026-09-05');
  c.accionR1({r1:'periodo',periodo:'mes_anterior'});
  assert.equal(estadoR1(c).borrador,null,'cambiar de período limpia el borrador');
  c.accionR1({r1:'fechas'});
  html=box.innerHTML;
  assert.match(html,/id="r1-ini-desde" value="2026-08-01"/,'al reabrir, los campos traen el período vigente');assert.match(html,/id="r1-ini-hasta" value="2026-08-31"/);
  for(const f of box.listeners.change)f({type:'change',target:{value:'Hugo',dataset:{r1Buscar:'1'}}});
  assert.equal(estadoR1(c).filtro.texto,'','un «change» del buscador no cambia el filtro (sigue sólo con «input»)');
});
await test('T2 próxima acción por estado y un solo botón por fila',()=>{
  const {c}=ctxR1(mundoR1());
  const n=porCabeza(c.proyeccionNegocios());
  const esperado={C1:'pedido','GB-2026-0001-1':'pedido',P1:'pf',P2:'aprobar','GB-PF-2026-0001':'aprobar',Q5:'listo',Q6:'entregar',Q7:'listo',Q8:'pago',Q9:null,L1:null,A1:null,'R1-1':'pedido'};
  for(const [id,a] of Object.entries(esperado))assert.equal(n[id].accion,a,id);
  assert.deepEqual(Object.keys(n).sort(),Object.keys(esperado).sort(),'una fila por negocio (la cabeza)');
  const et={C1:'cotizacion',P1:'cotizacion',Q5:'confirmado',Q6:'listo',Q8:'por_cobrar',Q9:'cerrado',L1:'perdida',A1:'anulada'};
  for(const [id,e] of Object.entries(et))assert.equal(n[id].etapa,e,id);
  assert.equal(n['R1-1'].nivel,'ambiguo');
  // Igual que Historial: openPropFinalFlow sólo para la propuesta ENVIADA con opciones; en «propfinal» se aprueba.
  assert.equal(c.proximaAccion({id:'PL',kind:'proposal',status:'propfinal',sections:[{options:[{},{}]}]},false),'aprobar');
  estadoR1(c).filtro.chip=null;c.renderMode('negocios');
  const html=c.$('r1-neg-lista').innerHTML;
  for(const fila of html.split('<div class="r1-fila').slice(1))assert.ok((fila.match(/data-r1="accion"/g)||[]).length<=1,'como mucho un botón por fila');
  assert.match(html,/data-r1="accion" data-accion="pf" data-id="P1" data-kind="proposal">Aprobada</);
  assert.match(html,/historia incompleta/);
  const btns=(html.match(/data-r1="accion"/g)||[]).length;
  assert.equal(btns,Object.values(esperado).filter(Boolean).length);
});
await test('T2 el botón sólo abre el flujo validado existente; la pantalla nueva nunca escribe status',()=>{
  const {c,llamadas}=ctxR1(mundoR1(),{empresa:true});
  const antes=plain(c.quotesCache);
  const casos=[['pedido','C1','quote','openOrderModal'],['pf','P1','proposal','openPropFinalFlow'],['aprobar','P2','proposal','openApproveModal'],['listo','Q5','quote','toggleProduced'],
    ['entregar','Q6','quote','openDeliveryModal'],['pago','Q8','quote','openPagoModal'],['fe','Q9','quote','openFeModal'],['contactado','GB-2026-0001-1','quote','markFollowUp']];
  c.proyeccionNegocios();
  for(const [accion,id,kind,fn] of casos){
    llamadas.length=0;c.accionR1({r1:'accion',accion,id,kind});
    assert.equal(llamadas.length,1,accion);assert.equal(llamadas[0][0],fn,accion);assert.equal(llamadas[0][1],id);
  }
  assert.deepEqual(llamadas.at(-1),['markFollowUp','GB-2026-0001-1','quote','contactado']);
  llamadas.length=0;c.accionR1({r1:'accion',accion:'entregar',id:'Q5',kind:'quote'});
  assert.equal(llamadas.filter(l=>l[0]==='openDeliveryModal').length,0,'una acción que ya no corresponde no abre nada');
  assert.deepEqual(plain(c.quotesCache),antes,'ningún documento cambia desde la pantalla nueva');
  // El envoltorio del refresco (vigilarEscriturasR1) sólo envuelve window.fb, no escribe: fuera de él no hay escrituras.
  // T3: las dos únicas escrituras propias (próximo contacto y negocioManual) se prueban aparte y no tocan status ni dinero.
  let src=source('app-negocios.js');
  for(const n of ['vigilarEscriturasR1','ESCRITURAS_FB_R1','guardarProximoContacto','_aplicarNegocioManual'])src=src.replace(functionSource('app-negocios.js',n),'');
  src=src.replace('vigilarEscriturasR1(window.fb)','').replace(/\/\/[^\n]*/g,''); // sin comentarios
  assert.ok(!/updateDoc|setDoc|deleteDoc|runTransaction|writeBatch|window\.fb|\.status\s*=[^=]|\bstatus\s*:/.test(src),'app-negocios.js no escribe');
  for(const n of ['guardarProximoContacto','_aplicarNegocioManual']){
    const w=functionSource('app-negocios.js',n).replace(/\/\/[^\n]*/g,'');
    assert.ok(!/\bstatus\b|pagos|cargos|ajustes|\btotal\b|pdfHistorial|businessId\s*:/.test(w),n+' sólo escribe su campo');
    assert.ok(/tx\.update\(/.test(w)&&!/updateDoc|setDoc|deleteDoc|writeBatch/.test(w),n+': escribe dentro de una transacción');
  }
});
await test('T2 chips con conteo: Abiertos · Cotizaciones · Confirmados · Entregar mañana · Por cobrar · Perdidas · Cerrados (Por facturar sólo con la empresa)',()=>{
  const {c}=ctxR1(mundoR1());
  const p=c.proyeccionNegocios();
  const r=c.filtrarNegocios(p,{chip:'abiertos',metrica:null,texto:'',pagina:1});
  assert.deepEqual(plain(r.conteos),{abiertos:10,cotizaciones:6,confirmados:3,manana:1,por_cobrar:1,perdidas:1,cerrados:2}); // v8.0.1: por_cobrar 3 → 1
  const ids=chip=>plain(c.filtrarNegocios(p,{chip,metrica:null,texto:'',pagina:1}).filas.map(n=>n.cabeza.id)).sort();
  assert.deepEqual(ids('manana'),['Q5']);assert.deepEqual(ids('por_cobrar'),['Q8']);assert.deepEqual(ids('cerrados'),['A1','Q9']);assert.deepEqual(ids('perdidas'),['L1']);
  assert.ok(ids('abiertos').includes('R1-1'),'la historia incompleta nunca se pierde de la lista');
  c.renderMode('negocios');
  const chips=c.$('r1-neg-chips').innerHTML;
  assert.match(chips,/data-chip="abiertos"[^>]*aria-pressed="true"[^>]*>Abiertos <span class="r1-chip-n">10</);
  assert.ok(!/Por facturar|por_facturar/.test(chips),'empresa apagada: sin Por facturar');
  c.accionR1({r1:'chip',chip:'cerrados'});
  assert.equal((c.$('r1-neg-lista').innerHTML.match(/class="r1-fila[ "]/g)||[]).length,2);
});
await test('v8.0.1 chip «Por cobrar»: sólo lo entregado con saldo; el número «Por cobrar» del Inicio no cambia',()=>{
  const {c}=ctxR1(mundoR1(),{curMode:'inicio'});
  const p=c.proyeccionNegocios();
  const ids=chip=>plain(c.filtrarNegocios(p,{chip,metrica:null,texto:'',pagina:1}).filas.map(n=>n.cabeza.id)).sort();
  const cobrar=ids('por_cobrar');
  for(const id of ['Q5','Q7']){ // confirmados con saldo (Q7 como Laura María Cruz)
    assert.ok(!cobrar.includes(id),id+': confirmado con saldo fuera de «Por cobrar»');
    assert.ok(ids('confirmados').includes(id),id+': sigue en «Confirmados»');
  }
  assert.ok(cobrar.includes('Q8'),'entregado con saldo: dentro');
  assert.ok(!cobrar.includes('Q9'),'entregado saldado: fuera');
  // Inicio: el número y su lista siguen con la métrica (confirmados y entregados): Q5 800 + Q7 100 + Q8 600.
  c.renderMode('inicio');
  assert.deepEqual(leerCuadros(c.$('mode-inicio').innerHTML).cobrar,{n:3,monto:1500});
  c.accionR1({r1:'cuadro',cuadro:'cobrar'});
  assert.match(c.$('r1-neg-resumen').innerHTML,/data-r1-suma="1500" data-r1-n="3"/);
  assert.deepEqual([...c.$('r1-neg-lista').innerHTML.matchAll(/data-negocio="([^"]+)"/g)].map(m=>m[1]).sort(),['Q5','Q7','Q8'],'la lista del número sigue con los confirmados');
});
await test('T2 buscador: cliente o número de cualquier documento de la cadena, sin tildes ni mayúsculas, con espera de ~200 ms',async()=>{
  const {c}=ctxR1(mundoR1());
  const p=c.proyeccionNegocios();
  const buscar=t=>plain(c.filtrarNegocios(p,{chip:null,metrica:null,texto:t,pagina:1}).filas.map(n=>n.cabeza.id));
  assert.deepEqual(buscar('jose'),['C1']);assert.deepEqual(buscar('PÉREZ'),['C1']);assert.deepEqual(buscar('  perez '),['C1']);
  assert.deepEqual(buscar('gb-2026-0001'),['GB-2026-0001-1'],'número de una versión vieja → la cabeza');
  assert.deepEqual(buscar('GB-P-2026-0009'),['GB-PF-2026-0001'],'número de la propuesta convertida → su PF');
  const r=c.filtrarNegocios(p,{chip:'abiertos',metrica:null,texto:'ana',pagina:1});
  assert.equal(r.conteos.abiertos,1);assert.equal(r.conteos.cerrados,0,'los conteos siguen la búsqueda');
  const esperas=[];const timers={set:(f,ms)=>{esperas.push({f,ms});return esperas.length},clear(){}};
  const {c:c2}=ctxR1(mundoR1(),{timers});
  c2.renderMode('negocios');
  c2._r1Input({target:{value:'Hugo',dataset:{r1Buscar:'1'}}});
  assert.equal(esperas.at(-1).ms,200);
  assert.ok(c2.$('r1-neg-lista').innerHTML.includes('Eva'),'todavía no filtra');
  esperas.at(-1).f();
  const lista=c2.$('r1-neg-lista').innerHTML;
  assert.ok(lista.includes('Hugo')&&!lista.includes('Eva'));
});
await test('T2 empresa: «Por facturar» y «Registrar FE» ausentes con la empresa apagada y presentes con una configuración de prueba encendida',()=>{
  for(const empresa of [false,true]){
    const {c}=ctxR1(mundoR1(),{empresa});
    const p=c.proyeccionNegocios(),n=porCabeza(p);
    assert.equal(n.Q9.accion,empresa?'fe':null);
    assert.equal(p.avisos.some(a=>a.accion==='fe'),empresa);
    const r=c.filtrarNegocios(p,{chip:'por_facturar',metrica:null,texto:'',pagina:1});
    assert.equal('por_facturar' in r.conteos,empresa);
    if(empresa){assert.equal(r.conteos.por_facturar,1);assert.deepEqual(plain(r.filas.map(x=>x.cabeza.id)),['Q9'])}
    estadoR1(c).filtro.chip='cerrados';c.renderMode('negocios');
    const html=c.$('mode-negocios').innerHTML+c.$('r1-neg-franja').innerHTML+c.$('r1-neg-chips').innerHTML+c.$('r1-neg-lista').innerHTML;
    assert.equal(/Por facturar/.test(html),empresa);assert.equal(/Registrar FE/.test(html),empresa);
  }
});
await test('T2 avisos «Por actualizar» (F7): reglas, botón de un toque e insignia en el menú y en la barra',()=>{
  for(const empresa of [false,true]){
    const {c}=ctxR1(mundoR1(),{empresa});
    const avisos=plain(c.proyeccionNegocios().avisos.map(a=>a.n.cabeza.id+':'+a.accion));
    const base=['GB-2026-0001-1:contactado','P1:contactado','Q5:listo','Q6:entregar','Q7:listo','Q8:pago'];
    assert.deepEqual(avisos,empresa?[...base,'Q9:fe']:base);
    c.renderMode('inicio');
    const ini=c.$('mode-inicio').innerHTML;
    assert.match(ini,/Por actualizar <span class="r1-insignia">(\d+)</);assert.equal(Number(ini.match(/Por actualizar <span class="r1-insignia">(\d+)</)[1]),avisos.length);
    assert.match(ini,/Contactar a Ana · Llamar/);assert.match(ini,/data-accion="listo" data-id="Q5" data-kind="quote">Sí, listo</);
    assert.equal(c.$('r1-insignia-menu').textContent,String(avisos.length));assert.equal(c.$('r1-insignia-barra').textContent,String(avisos.length));
    assert.equal(c.$('r1-insignia-menu').hidden,false);
    c.renderMode('negocios');
    assert.match(c.$('mode-negocios').innerHTML+c.$('r1-neg-franja').innerHTML,/Por actualizar <span class="r1-insignia">/); // T3: la franja tiene su propia caja
  }
  assert.ok(/avisoContacto\(/.test(functionSource('app-negocios.js','proyectarNegocios')),'el aviso de cotización es avisoContacto (el mismo del banner y Seguimiento)');
});
await test('T2 refresco (P-39) por acción y por origen: Inicio y Negocios muestran el valor nuevo sin recargar',()=>{
  const A=[ // [acción, cómo deja la caché el flujo (en su sitio), Inicio, lista de Negocios (y su pantalla)]
    ['pago',d=>{d.find(x=>x.id==='Q8').pagos.push({fecha:'2026-09-29',monto:600,metodo:'Nequi'})},ini=>!/data-id="Q8"/.test(ini),l=>!/Q8/.test(l)],
    ['cargo',d=>{d.find(x=>x.id==='Q9').cargos=[{monto:15000}]},ini=>/data-accion="pago" data-id="Q9"/.test(ini),l=>/Q9/.test(l)],
    ['aprobar',d=>{Object.assign(d.find(x=>x.id==='P2'),{status:'aprobada',eventDate:'2026-10-20'})},ini=>leerCuadros(ini).pipe_conf.n===4,l=>/data-accion="listo" data-id="P2"/.test(l)],
    ['confirmar',d=>{Object.assign(d.find(x=>x.id==='C1'),{status:'pedido',eventDate:MAN})},ini=>/data-accion="listo" data-id="C1"/.test(ini),l=>/data-accion="listo" data-id="C1"/.test(l)],
    ['entregar',d=>{Object.assign(d.find(x=>x.id==='Q6'),{status:'entregado',fechaEntrega:'2026-09-29'})},ini=>!/data-id="Q6"/.test(ini),l=>!/Q6/.test(l)],
    ['perdida',d=>{d.find(x=>x.id==='GB-2026-0001-1').followUp='perdida'},ini=>!/Contactar a Ana/.test(ini),l=>!/GB-2026-0001-1/.test(l)],
    ['reactivar',d=>{d.find(x=>x.id==='L1').followUp='pendiente'},ini=>leerCuadros(ini).pipe_cot.n===7,l=>/L1/.test(l)],
    ['proximo_contacto',d=>{d.find(x=>x.id==='P2').proximoContacto={fecha:'2026-09-30',nota:'Hoy'}},ini=>/Contactar a Carla · Hoy/.test(ini),(l,pant)=>/Contactar a Carla · Hoy/.test(pant)]
  ];
  const ver=c=>({ini:c.$('mode-inicio').innerHTML,l:c.$('r1-neg-lista').innerHTML,pant:c.$('mode-negocios').innerHTML+c.$('r1-neg-franja').innerHTML});
  for(const [nombre,mutar,okIni,okNeg] of A)for(const origen of ['inicio','negocios','cartera']){
    const {c}=ctxR1(mundoR1(),{curMode:origen});
    c.renderMode('inicio');c.renderMode('negocios');c.curMode=origen;c.renderMode(origen==='cartera'?'inicio':origen);
    let v=ver(c);
    assert.ok(!okIni(v.ini)&&!okNeg(v.l,v.pant),nombre+': la prueba parte del valor viejo');
    mutar(c.quotesCache);
    c.refrescarVistasR1(); // lo que llama cada flujo al terminar (desde la fila de Inicio/Negocios o desde una pantalla vieja)
    if(origen==='cartera'){c.curMode='inicio';c.renderMode('inicio');c.curMode='negocios';c.renderMode('negocios')} // volver desde la pantalla vieja
    v=ver(c);
    if(origen!=='negocios')assert.ok(okIni(v.ini),nombre+' desde '+origen+': Inicio');
    if(origen!=='inicio')assert.ok(okNeg(v.l,v.pant),nombre+' desde '+origen+': Negocios');
  }
});
await test('T2 refresco: la proyección se memoriza entre teclas y se invalida tras mutación o recarga de quotesCache',()=>{
  const {c}=ctxR1(mundoR1());
  c.renderMode('negocios');
  const p1=c.proyeccionNegocios();
  assert.equal(c.proyeccionNegocios(),p1,'memorizada');
  c._r1PintarLista();assert.equal(c.proyeccionNegocios(),p1,'pintar la lista (tecla, chip, ver más) no recalcula');
  c.quotesCache.find(x=>x.id==='Q8').pagos.push({fecha:'2026-09-29',monto:600});
  c.refrescarVistasR1();
  assert.notEqual(c.proyeccionNegocios(),p1,'tras una mutación se recalcula');
  const p2=c.proyeccionNegocios();
  c.quotesCache=mundoR1();
  assert.notEqual(c.proyeccionNegocios(),p2,'recargar quotesCache (otra referencia) recalcula');
  // Qué flujos refrescan ya no es una lista: lo prueba «toda escritura … pasa por el punto común» (ronda 2).
  const rm=functionSource('app-core.js','renderMode');
  assert.ok(/m==="inicio"[^;]*renderInicio\(\)/.test(rm)&&/m==="negocios"[^;]*renderNegocios\(\)/.test(rm),'Inicio y Negocios son modos de renderMode');
  assert.ok(/"inicio","negocios"/.test(functionSource('app-core.js','setMode')));
  assert.ok(/refrescarVistasR1\(\)/.test(functionSource('app-core.js','initApp')),'al terminar de cargar el historial');
});
await test('T2 bandera apagada: no aparece nada nuevo y el arranque sigue en el Dashboard',()=>{
  const {c,els,llamadas,extras}=ctxR1(mundoR1(),{flag:false,curMode:'dash'});
  assert.equal(c.iniciarRedisenoR1(),false);
  assert.equal(llamadas.length,0,'no navega');assert.equal(c.curMode,'dash');
  assert.equal(els['r1-menu'],undefined,'no toca el menú');assert.equal(els['r1-barra'],undefined,'no toca la barra');
  assert.equal(extras.dashboard.textContent,'Dashboard');assert.equal(extras.moduloViejo.textContent,'Inicio');
  c.pintarNavR1('dash');c.refrescarVistasR1();
  assert.equal(els['mode-inicio'],undefined);assert.equal(els['r1-insignia-menu'],undefined);
  const core=source('app-core.js'),html=source('index.html');
  assert.match(core,/let cart=\[\],cust=\[\],selCat="Todas",curStep="info",curMode="dash";/);
  assert.match(core,/const GB_REDISENO_R1=(true|false);/);
  assert.ok(/iniciarRedisenoR1\(\)/.test(functionSource('app-core.js','initApp')));
  assert.match(html,/<div id="r1-menu" hidden><\/div>/);assert.match(html,/<nav id="r1-barra" class="r1-barra" hidden/);
  assert.match(html,/<div id="mode-inicio" class="hidden"><\/div>/);assert.match(html,/<div id="mode-negocios" class="hidden"><\/div>/);
  const barra=html.slice(html.indexOf('<style id="r1-barra-estilos">'));
  assert.ok(/\.r1-barra\[hidden\]\{display:none!important\}/.test(barra.slice(0,barra.indexOf('</style>'))),'el hidden de la barra gana');
  assert.ok(/@media \(min-width:1024px\)\{\.r1-barra\{display:none!important\}/.test(barra.slice(0,barra.indexOf('</style>'))),'barra sólo bajo 1024 px');
  const {c:on,els:e2,llamadas:l2,extras:x2}=ctxR1(mundoR1(),{flag:true,curMode:'dash'});
  assert.equal(on.iniciarRedisenoR1(),true);
  assert.deepEqual(l2.at(-1),['setMode','inicio']);
  assert.equal(e2['r1-menu'].hidden,false);assert.equal(e2['r1-barra'].hidden,false);
  assert.match(e2['r1-menu'].innerHTML,/data-r1-ir="inicio"[\s\S]*Inicio[\s\S]*data-r1-ir="negocios"[\s\S]*Negocios/);
  assert.equal(x2.dashboard.textContent,'Tablero anterior');
  for(const [ir,fn,arg] of [['imprimir','setMode','pedidos-hojas'],['clientes','setMode','clientes-directorio'],['negocios','setMode','negocios'],['mas','gbShellMobileOpen',undefined]]){
    l2.length=0;on._r1NavClick({target:{closest:()=>({dataset:{r1Ir:ir}})}});
    assert.equal(l2[0][0],fn,ir);if(arg)assert.equal(l2[0][1],arg);
  }
});
await test('T2 usuario de sólo lectura: ve Inicio y Negocios sin botones de escritura',()=>{
  for(const escribe of [false,true]){
    const {c,llamadas}=ctxR1(mundoR1(),{escribe,empresa:true});
    c.renderMode('inicio');estadoR1(c).filtro.chip=null;c.renderMode('negocios');
    const html=c.$('mode-inicio').innerHTML+c.$('mode-negocios').innerHTML+c.$('r1-neg-franja').innerHTML+c.$('r1-neg-lista').innerHTML;
    assert.equal(/data-r1="accion"/.test(html),escribe,'escribe='+escribe);
    assert.ok(/Por actualizar/.test(html)&&/Hugo/.test(html),'ve los avisos y la lista');
    llamadas.length=0;c.accionR1({r1:'accion',accion:'pago',id:'Q8',kind:'quote'});
    assert.equal(llamadas.length,escribe?1:0);
  }
});
await test('T2 HTML generado: datos escapados (cliente e id hostiles) y sin on*= (eventos delegados con data-*)',()=>{
  const docs=mundoR1();
  Object.assign(docs.find(x=>x.id==='Q8'),{client:'<img src=x onerror=alert(1)>"\'',quoteNumber:'N"><b>x</b>'});
  docs.push({id:'X" onmouseover="alert(1)',kind:'quote',status:'entregado',client:'Zoe',dateLocal:'2026-09-02',eventDate:'2026-09-20',total:30});
  const {c}=ctxR1(docs,{empresa:true});
  c.renderMode('inicio');estadoR1(c).filtro.chip=null;c.renderMode('negocios');
  const {c:c2}=ctxR1(docs);c2.iniciarRedisenoR1();
  const todo=['mode-inicio','mode-negocios','r1-neg-franja','r1-neg-chips','r1-neg-resumen','r1-neg-lista','r1-neg-mas'].map(id=>c.$(id).innerHTML).join('')+c2.$('r1-menu').innerHTML;
  assert.ok(!/<img|<b>/.test(todo),'sin marcado del usuario');
  assert.ok(todo.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;'));
  assert.ok(todo.includes('data-id="X&quot; onmouseover=&quot;alert(1)"'),'el id va como dato escapado');
  assert.ok(!onAttr(todo),'sin manejadores on*= en el HTML nuevo');
  assert.ok(!/\son[a-z]+=/.test(source('app-negocios.js').replace(/"[^"\n]*"|'[^'\n]*'/g,'""')),'app-negocios.js no arma on*=');
});
// ─── Ronda 2 de T2 ────────────────────────────────────────
// P1: un monto guardado como texto nunca llega al HTML ni se concatena en una suma.
const pintarTodoR1=docs=>{ // Inicio, Negocios con cada cuadro (resumen y filas con «Suma aquí»), chips, todas las filas y la franja
  const {c}=ctxR1(docs,{curMode:'inicio'});
  c.renderMode('inicio');let html=c.$('mode-inicio').innerHTML;
  for(const {clave} of vm.runInContext('CUADROS_R1',c)){c.accionR1({r1:'cuadro',cuadro:clave});html+=c.$('mode-negocios').innerHTML+c.$('r1-neg-franja').innerHTML+c.$('r1-neg-resumen').innerHTML+c.$('r1-neg-lista').innerHTML}
  c.accionR1({r1:'quitar-metrica'});estadoR1(c).filtro.chip=null;c._r1PintarLista();
  return html+c.$('r1-neg-chips').innerHTML+c.$('r1-neg-lista').innerHTML;
};
await test('T2 R2 montos guardados como texto (hostil, no numérico, número válido): sin atributos inyectados, sin $NaN y sumas correctas en cuadros, resumen, filas y avisos',()=>{
  const HOSTIL='1" onmouseover="globalThis.__r1Pwn=1';
  // C1 (Pipeline y Cotizado), Q5 (confirmado, por cobrar), Q8 (entregado con saldo: cuadro, fila y aviso), Q9 (entregado y pagado:
  // con «500» sigue cerrado, no «por cobrar»), la PF (Pipeline con q.total) y un pago de Q9.
  const con=(total,pago)=>{const d=mundoR1();for(const id of ['C1','Q5','Q8','Q9','GB-PF-2026-0001']){const x=d.find(y=>y.id===id);x.total=total(x.total)}d.find(x=>x.id==='Q9').pagos[0].monto=pago;return d};
  const casos=[
    ['hostil',con(()=>HOSTIL,'500" onmouseover="globalThis.__r1Pwn=1'),con(()=>0,500)], // texto con basura = 0; el pago se lee con parseInt, como totalCobrado
    ['no numérico',con(()=>'abc','500'),con(()=>0,500)],
    ['número como texto',con(t=>String(t),'500'),mundoR1()]
  ];
  for(const [nombre,docs,equivalente] of casos){
    const html=pintarTodoR1(docs);
    assert.ok(!/onmouseover|__r1Pwn/.test(html),nombre+': ningún monto de texto llega al HTML');
    assert.ok(!onAttr(html),nombre+': ningún atributo inyectado');
    assert.ok(!/NaN/.test(html),nombre+': sin $NaN');
    assert.equal(html,pintarTodoR1(equivalente),nombre+': mismas cifras que con el número equivalente');
  }
  const ok=pintarTodoR1(con(t=>String(t),'500'));
  assert.match(ok,/data-cuadro="pipe_ent" data-n="1" data-monto="600"/,'el saldo de Q8 con total textual «1000» y un pago de 400');
  assert.match(ok,/Entregado con saldo \$600/);assert.match(ok,/<strong>Iris<\/strong> <span class="r1-etapa r1-etapa-cerrado">/,'Q9 pagado con total textual sigue cerrado');assert.match(ok,/data-r1-suma="600" data-r1-n="1"/);
  const t={id:'T',kind:'quote',status:'pedido',dateLocal:'2026-09-05',eventDate:'2026-09-10',total:'200',pagos:[{fecha:'2026-09-06',monto:'50'}]};
  const {c,ctx}=metricas([t]);
  assert.equal(c.metricaPipelineConfirmados(t,RANGO,ctx).monto,200,'total textual: suma el número, no concatena');
  assert.equal(c.metricaPorCobrar(t,RANGO,ctx).monto,150,'saldo con total textual: 200 − 50');
});
await test('T2 R2 escape: todo valor interpolado en un atributo o como texto del HTML de app-negocios.js pasa por h()',()=>{
  const src=source('app-negocios.js'),t2=src.slice(src.indexOf('(tramo 2)'));
  const enAtributo=[...t2.matchAll(/="[^"<>]*'\+(?!h\()([^+]{0,40})/g)].map(m=>m[1]);
  assert.deepEqual(enAtributo,[],'atributos sin h()');
  const sueltos=[...t2.matchAll(/'\+\s*([\w$]+(?:\.[\w$]+|\[[^\]]*\])*)\s*\+'/g)].map(m=>m[1]).filter(x=>x!=='dinero'); // dinero ya es HTML armado con h()
  assert.deepEqual(sueltos,[],'valores sueltos sin h()');
});
// P2: el refresco (P-39) no depende de una lista de flujos.
const ESCRITURAS_FIRESTORE=['setDoc','updateDoc','deleteDoc','addDoc','runTransaction','writeBatch']; // API modular de escritura de Firestore
await test('T2 R2 refresco (P-39): toda escritura y toda mutación de quotesCache de app-*.js pasa por el punto común (derivado de la búsqueda)',()=>{
  const c=loadSourceFunctions(neg('ESCRITURAS_FB_R1'),{});
  const vigiladas=plain(vm.runInContext('ESCRITURAS_FB_R1',c)).sort();
  const fbObj=source('index.html').match(/window\.fb = \{([\s\S]*?)\n\};/)[1];
  assert.deepEqual(vigiladas,ESCRITURAS_FIRESTORE.filter(n=>new RegExp('\\b'+n+'\\b').test(fbObj)).sort(),'el envoltorio cubre cada escritura que expone window.fb');
  assert.ok(/vigilarEscriturasR1\(window\.fb\)/.test(functionSource('app-negocios.js','iniciarRedisenoR1')),'se instala al arrancar con la bandera');
  const faltas=[],archivos=readdirSync(new URL('..',import.meta.url)).filter(f=>/^app-.*\.js$/.test(f));
  const funciones=[]; // {f,nombre,cuerpo} de primer nivel en todo app-*.js
  for(const f of archivos){
    const src=source(f).replace(/(^|[^:"'\\])\/\/[^\n]*/g,'$1');
    const cortes=[...src.matchAll(/^(?:async\s+)?function\s+([\w$]+)/gm)];
    const antes=cortes.length?src.slice(0,cortes[0].index):src;
    if(ESCRITURAS_FIRESTORE.some(n=>new RegExp('\\b'+n+'\\b').test(antes)))faltas.push(f+': escritura fuera de una función');
    cortes.forEach((m,i)=>funciones.push({f,nombre:m[1],cuerpo:src.slice(m.index,i+1<cortes.length?cortes[i+1].index:src.length)}));
  }
  // Escribe = toma una escritura de window.fb (el envoltorio la ve) o ESPERA (await) a una función que escribe
  // (p. ej. _generarPropuestaFinalImpl → await commitPropFinal): su continuación corre antes del refresco.
  const escriben=new Set();
  for(const {f,nombre,cuerpo} of funciones)for(const n of ESCRITURAS_FIRESTORE){
    const tomada=new RegExp('\\{[^}]*\\b'+n+'\\b[^}]*\\}\\s*=\\s*window\\.fb\\b').test(cuerpo);
    if(tomada)escriben.add(nombre);
    if(new RegExp('(?<![.\\w$])'+n+'\\s*\\(').test(cuerpo)&&!tomada)faltas.push(f+' '+nombre+': '+n+' no sale de window.fb');
  }
  const funcionesQueEscriben=escriben.size;
  for(let cambio=true;cambio;){cambio=false;for(const {nombre,cuerpo} of funciones)if(!escriben.has(nombre)&&[...escriben].some(w=>new RegExp('await\\s+'+w.replace(/\$/g,'\\$')+'\\s*\\(').test(cuerpo))){escriben.add(nombre);cambio=true}}
  for(const {f,nombre,cuerpo} of funciones)
    if(/(?<!(?:let|const|var)\s+)\bquotesCache\s*(?:\[[^\]]*\]\s*)?=(?!=)|\bquotesCache\.(?:push|unshift|splice|pop|shift|sort|reverse|fill|copyWithin)\(/.test(cuerpo)&&!escriben.has(nombre)&&!/programarRefrescoR1\(\)/.test(cuerpo))
      faltas.push(f+' '+nombre+': cambia quotesCache sin escribir ni programar el refresco');
  assert.deepEqual(faltas,[]);
  console.log("   funciones que escriben: "+funcionesQueEscriben);assert.ok(funcionesQueEscriben>40,'la búsqueda encontró los caminos de escritura ('+funcionesQueEscriben+')');
});
await test('T2 R2 refresco: el envoltorio programa un refresco (tras la escritura) por cada función de escritura, y con la bandera apagada no envuelve nada',async()=>{
  const esperar=()=>new Promise(r=>setTimeout(r,10));
  for(const flag of [true,false]){
    const red=()=>new Promise(r=>setTimeout(()=>r('ok'),3)); // la escritura tarda más que un tic, como en la red
    const fb={db:{}};for(const n of ESCRITURAS_FIRESTORE)fb[n]=n==='writeBatch'?()=>({update(){},commit:red}):red;
    const originales={...fb};
    const {c}=ctxR1(mundoR1(),{flag,curMode:'hist'});
    let n=0;c.window={fb};c.iniciarRedisenoR1();c.refrescarVistasR1=()=>{n++};
    if(!flag){for(const k of ESCRITURAS_FIRESTORE)assert.equal(fb[k],originales[k],'apagada: '+k+' intacta');continue}
    for(const k of ESCRITURAS_FIRESTORE){
      const antes=n;
      const r=k==='writeBatch'?fb.writeBatch({}).commit():fb[k]({},()=>{});
      assert.equal(await r,'ok',k+': devuelve lo mismo');
      assert.equal(n,antes,k+': el refresco no corre antes de que el flujo siga tras su await');
      await esperar();
      assert.equal(n,antes+1,k+': un refresco al terminar');
    }
    const w=fb.updateDoc;c.vigilarEscriturasR1(fb);assert.equal(fb.updateDoc,w,'no se envuelve dos veces');
    c.programarRefrescoR1();c.programarRefrescoR1();await esperar();assert.equal(n,ESCRITURAS_FIRESTORE.length+1,'dos escrituras en el mismo tic: un solo refresco');
  }
});
await test('T2 R2 refresco sin llamadas por flujo: asignar entrega (Historial) y anular o regresar a cotización actualizan la insignia',async()=>{
  const esperar=()=>new Promise(r=>setTimeout(r,5));
  const docs=[...mundoR1(),{id:'Q10',kind:'quote',status:'pedido',client:'Nico',dateLocal:'2026-09-16',eventDate:'2026-10-20',total:300}];
  const escritos=[];
  const fb={db:{},doc:(_,col,id)=>col+'/'+id,serverTimestamp:()=>'TS',updateDoc:async(ref,p)=>{escritos.push([ref,p])},
    runTransaction:async(_,cb)=>cb({get:async ref=>({exists:()=>true,data:()=>plain(docs.find(d=>ref.endsWith('/'+d.id)))}),update:(ref,p)=>escritos.push([ref,p])})};
  const {c}=ctxR1(docs,{curMode:'dash'});
  for(const n of ['assignDeliveryDate','submitAnular','_submitAnularImpl','gbUnaVez','gbErrorDocCambio','gbRecargarTrasCambio','GB_ESTADOS_ABIERTOS','pagosBaseParaEscribir','gbFeAnuladaConNotas','gbFeSumaNotas'])vm.runInContext(functionSource('app-historial.js',n),c);
  const prompts=[];
  Object.assign(c,{window:{fb},prompt:()=>prompts.shift(),cloudOnline:true,showLoader(){},hideLoader(){},getCollectionName:(id,k)=>k==='quote'?'quotes':'proposals',
    renderHist(){},renderDashboard(){},renderMiniDash(){},toast(){},alert(){},gbMensajeError:e=>String(e),auditStamp:()=>({}),logOperacion:async o=>o.runner(),
    closeAnularModal(){},MOTIVOS_ANULACION:{cliente_cancelo:'Cliente canceló'}});
  c.iniciarRedisenoR1();c.setMode('hist');
  const insignia=()=>Number(c.$('r1-insignia-menu').textContent);
  const n0=insignia();assert.equal(n0,6);
  prompts.push(MAN,'10:00');await c.assignDeliveryDate('Q10','quote');await esperar();
  assert.equal(escritos.length,1);assert.equal(insignia(),n0+1,'asignar entrega para mañana: aviso «Entrega mañana» sin cambiar de pantalla');
  Object.assign(c.$('an-motivo'),{value:'cliente_cancelo'});Object.assign(c.$('an-accion'),{value:'anular'});
  // v8.0.6 N2: un entregado (Q8) ya no se anula ni saltándose la ventana; se anula Q10, el pedido recién agendado.
  c._anularCtx={docId:'Q10',kind:'quote',q:docs.find(d=>d.id==='Q10')};await c.submitAnular();await esperar();
  assert.equal(escritos.length,2);assert.equal(insignia(),n0,'anular: sale el aviso de entrega mañana');
  Object.assign(c.$('an-accion'),{value:'regresar'});
  c._anularCtx={docId:'Q7',kind:'quote',q:docs.find(d=>d.id==='Q7')};await c.submitAnular();await esperar();
  assert.equal(escritos.length,3);assert.equal(insignia(),n0-1,'regresar a cotización: sale el aviso de entrega pasada');
  assert.equal(c.curMode,'hist','sin navegar');
});
await test('T2 paginación: 50 filas y «Ver más» agrega otras 50 sin recalcular',()=>{
  const docs=sinteticos(400);
  const {c}=ctxR1(docs);
  estadoR1(c).filtro.chip=null;c.renderMode('negocios');
  const filas=()=>(c.$('r1-neg-lista').innerHTML.match(/class="r1-fila[ "]/g)||[]).length;
  const total=c.proyeccionNegocios().negocios.length,p=c.proyeccionNegocios();
  assert.equal(filas(),50);assert.ok(c.$('r1-neg-mas').innerHTML.includes('data-r1="mas">Ver más ('+(total-50)+')'));
  c.accionR1({r1:'mas'});
  assert.equal(filas(),100);assert.equal(c.proyeccionNegocios(),p);
  c.accionR1({r1:'chip',chip:'abiertos'});assert.equal(filas(),50,'cambiar de chip vuelve a la primera página');
});
await test('T2 rendimiento: proyección < 300 ms y filtrado < 50 ms con 5.000 documentos',()=>{
  const docs=sinteticos(5000);
  for(const [i,d] of docs.entries())d.client='Cliente '+(i%700)+(i%3?' Pérez':'');
  const {c}=ctxR1(docs);
  const {ms:tp,r:p}=mejorTiempo(()=>c.proyectarNegocios(docs));
  const {ms:tf,r:f}=mejorTiempo(()=>{
    const f=c.filtrarNegocios(p,{chip:'abiertos',metrica:null,texto:'perez',pagina:1});
    c.filtrarNegocios(p,{chip:null,metrica:{clave:'cotizado',rango:RANGO},texto:'',pagina:1});
    return f;
  });
  console.log('   5.000 documentos → proyección '+tp.toFixed(1)+' ms · filtrado '+tf.toFixed(1)+' ms');
  assert.ok(tp<300,'proyección '+tp.toFixed(1)+' ms');assert.ok(tf<50,'filtrado '+tf.toFixed(1)+' ms');
  assert.ok(f.filas.length>0&&f.filas.length<p.negocios.length);
});

// ═══ v8.0.0 (tramo 3): ficha, pagos rápidos, estado de cuenta, reporte de ambiguos y unir/separar a mano ═══
const T3=neg('TIPOS_PAGO_R1','MOTIVOS_NEGOCIO_R1','abrirFichaR1','negocioDeFicha','dineroNegocio','_r1Plata','ACCIONES_FICHA_R1','accionesFicha','historiaNegocio','operacionesManuales','_negDescendientes',
  '_r1HtmlFicha','renderFichaNegocio','renderReporteAmbiguos','numerosEstadoDeCuenta','textoEstadoDeCuenta','enviarEstadoDeCuentaWA','genEstadoDeCuentaPDF','pintarChipsMetodoR1','_r1ChipMetodoClick',
  'guardarProximoContacto','CAMPOS_FIRMA_R1','_negFirma','_negError','_negMismoCliente','_negUsuario','_negMotivo','_negOpDe','_negOpId','_negSinAjuste','unirNegocios','separarDocumento','deshacerAjusteManual','_aplicarNegocioManual',
  '_r1PedirMotivo','iniciarUnirR1','pedirUnirR1','pedirSepararR1','pedirDeshacerR1','accionFichaR1','_negPermiso');
const EXTRA_T3=[...['canAnular','canEdit','getDespachos','MOTIVOS_PERDIDA','motivoPerdidaLabel','gbStableJson','logOperacion','getCollectionName','gbPdfHeader','gbPdfFooter'].map(n=>['app-core.js',n]),
  ...['pagoFechaIso','pagoTipoLabel'].map(n=>['app-historial.js',n]),['app-seguimiento.js','resumenProductos']];
const ESPIAS_T3=['requestEdit','openPerdidaModal','openProximoContactoModal','openVerPagosModal','openPdfHistorialModal','openDuplicateModal','openAnularModal','openReactivarModal','openSaldoWhatsAppModal'];
function ctxR3(docs,o={}){
  const r={toasts:[],modales:[],motivo:'Mismo evento, otro número',respuestas:[]};
  let ctx=null;
  const extra={GB_DATOS_PAGO:o.datosPago||'',currentUser:{email:'kathy@example.invalid'},fbReady:async()=>{},BUILD_VERSION:'v8.0.0',_proxContactoCtx:null,
    auditStamp:()=>({updatedBy:'u1',updatedByEmail:'kathy@example.invalid'}),cloudOnline:true,
    toast:(m,t)=>{r.toasts.push([String(m),t])},gbMensajeError:e=>String(e&&e.message||e),showLoader(){},hideLoader(){},
    confirmModal:async op=>{ctx.modales.push(op);ctx.c.$('r1-manual-motivo').value=ctx.motivo;return ctx.respuestas.length?ctx.respuestas.shift():true}, // ctx.motivo: lo cambia cada prueba
    ...(o.extra||{})};
  const reales=o.reales||[];
  ctx=ctxR1(docs,{...o,extra,mas:[...EXTRA_T3,...T3,...reales]});
  for(const n of ESPIAS_T3)if(!reales.some(([,x])=>x===n))ctx.c[n]=(...a)=>{ctx.llamadas.push([n,...a.map(String)])};
  return Object.assign(ctx,r);
}
const fichaDe=(ctx,bid)=>{ctx.c.accionR1({r1:'ficha',negocio:bid});return ctx.c.$('mode-ficha').innerHTML};
const conceptos=html=>Object.fromEntries([...html.matchAll(/data-concepto="([a-z_]+)" data-monto="(-?\d+)"/g)].map(m=>[m[1],Number(m[2])]));
const mundoR3=()=>[
  ...mundoR1(),
  {id:'D2',kind:'quote',status:'pedido',client:'Dinero Uno',dateLocal:'2026-09-05',eventDate:'2026-10-10',horaEntrega:'11:00',dir:'Calle 1',city:'Bogotá',tel:'300 123 4567',total:200000,
    cart:[{n:'Empanadas',qty:50}],pagos:[{fecha:'2026-09-02',monto:50000,metodo:'Nequi',tipo:'anticipo'}],cargos:[{monto:15000,fecha:'2026-09-03'}],ajustes:[{monto:10000,motivo:'x'}]},
  {id:'D3',kind:'quote',status:'entregado',client:'Sobrepago',dateLocal:'2026-09-01',eventDate:'2026-09-15',total:300000,pagos:[{fecha:'2026-09-15',monto:350000,metodo:'Efectivo'},{fecha:'2026-09-16',monto:-20000,tipo:'devolucion',metodo:'Efectivo'}]},
  {id:'D4',kind:'quote',status:'entregado',client:'Cortesía',dateLocal:'2026-09-02',eventDate:'2026-09-12',total:0,cargos:[{monto:15000},{monto:9000,deletedAt:'x'}]},
  {id:'O1',kind:'quote',status:'enviada',client:'Opción',dateLocal:'2026-09-03',total:500,optionGroupId:'G'},
  {id:'O2',kind:'quote',status:'enviada',client:'Opción',dateLocal:'2026-09-03',total:800,optionGroupId:'G'},
  {id:'O3',kind:'quote',status:'pedido',client:'Opción',dateLocal:'2026-09-03',eventDate:'2026-10-20',total:900,optionGroupId:'G',pagos:[{fecha:'2026-09-21',monto:100,metodo:'Sin especificar'}]},
  {id:'F1',kind:'quote',status:'pedido',client:'Fantasma',dateLocal:'2026-09-04',eventDate:'2026-10-18',total:4000,anuladaData:{fecha:'2026-09-03'}},
  {id:'AN',kind:'quote',status:'anulada',client:'Reemplazo',dateLocal:'2026-09-04',total:70,replacedBy:'RE'},
  {id:'RE',kind:'quote',status:'enviada',client:'Reemplazo',dateLocal:'2026-09-05',total:80,replaces:'AN'}
];

await test('T3 ficha: tocar la fila la abre; encabezado con los números de la cadena; dinero con reposición, descuentos, devoluciones, cortesía y sobrepago (saldo a favor)',()=>{
  const ctx=ctxR3(mundoR3());const {c,llamadas}=ctx;
  estadoR1(c).filtro.chip=null;c.renderMode('negocios');
  assert.match(c.$('r1-neg-lista').innerHTML,/<div class="r1-fila[^"]*" data-r1="ficha" data-negocio="GB-2026-0001">/,'la fila lleva su negocio');
  c.accionR1({r1:'ficha',negocio:'GB-2026-0001'});
  assert.deepEqual(llamadas.at(-1),['setMode','ficha']);assert.equal(c.curMode,'ficha');
  const html=c.$('mode-ficha').innerHTML;
  assert.match(html,/<h2 class="r1-titulo">Ana<\/h2>/);
  assert.match(html,/class="r1-ficha-nums">GB-2026-0001 · GB-2026-0001-1</);
  assert.ok(!/historia incompleta/.test(html));
  assert.match(html,/2026-09-01<\/span> Cotización GB-2026-0001 creada[\s\S]*2026-09-02<\/span> Versión GB-2026-0001-1 creada/,'historia en orden de fecha');
  assert.match(fichaDe(ctx,'R1-1'),/historia incompleta/,'la marca del nivel ambiguo');
  const d2h=fichaDe(ctx,'D2');
  assert.deepEqual(conceptos(d2h),{total:200000,reposicion:15000,descuentos:10000,pagado:50000,saldo:155000},'saldo canónico: total + cargos − pagado − ajustes');
  assert.match(d2h,/<li class="r1-ficha-pago">2026-09-02 · Nequi · Anticipo · \$50\.000<\/li>/);
  assert.match(d2h,/Empanadas ×50/,'qué lleva');assert.match(d2h,/class="r1-ficha-entrega"[\s\S]*2026-10-10 11:00[\s\S]*Calle 1, Bogotá[\s\S]*300 123 4567/,'entrega');
  assert.match(d2h,/Pago \$50\.000 · Nequi/);assert.match(d2h,/Cargo por reposición \$15\.000/);
  const d3h=fichaDe(ctx,'D3');
  assert.deepEqual(conceptos(d3h),{total:300000,pagado:330000,a_favor:30000},'sobrepago con devolución = saldo a favor con el monto positivo');
  assert.match(d3h,/Saldo a favor/);assert.ok(!/\$-|−\$30/.test(d3h),'nunca un saldo negativo');
  assert.match(d3h,/2026-09-16 · Efectivo · Devolución · −\$20\.000/);
  assert.deepEqual(conceptos(fichaDe(ctx,'D4')),{total:0,reposicion:15000,pagado:0,saldo:15000},'cortesía con reposición (el cargo anulado no cuenta)');
  assert.deepEqual(conceptos(fichaDe(ctx,'Q6')),{total:900,pagado:900,saldo:0});
  for(const id of ['D2','D3','D4','Q6','Q8']){ // lo mismo que la fila: saldoNegocio y totalCobrado
    const q=c.quotesCache.find(x=>x.id===id),k=conceptos(fichaDe(ctx,id));
    assert.equal((k.saldo||0)-(k.a_favor||0),c.saldoNegocio(q),id);assert.equal(k.pagado,c.totalCobrado(q),id);
  }
  assert.deepEqual(conceptos(fichaDe(ctx,'C1')),{total:1000},'una cotización sin pagos sólo muestra el total');
});
await test('T3 ficha: opciones hermanas y reemplazos en «Relacionados», cada una con su propio dinero; el fantasma igual que su fila',()=>{
  const ctx=ctxR3(mundoR3());const {c}=ctx;
  const o3=fichaDe(ctx,'O3');
  assert.deepEqual(conceptos(o3),{total:900,pagado:100,saldo:800},'sólo el dinero de su opción');
  assert.match(o3,/data-r1="ficha" data-negocio="O1"/);assert.match(o3,/data-r1="ficha" data-negocio="O2"/);assert.ok(!/data-r1="ficha" data-negocio="O3"/.test(o3),'no se enlaza a sí misma');
  assert.match(fichaDe(ctx,'AN'),/data-r1="ficha" data-negocio="RE"/);assert.match(fichaDe(ctx,'RE'),/data-r1="ficha" data-negocio="AN"/);
  c.accionR1({r1:'ficha',negocio:'O1'});assert.equal(c.negocioDeFicha().businessId,'O1','tocar un relacionado abre su ficha');
  assert.deepEqual(conceptos(fichaDe(ctx,'F1')),{total:4000,pagado:0,saldo:4000});
  c.accionR1({r1:'ficha',negocio:'NO-EXISTE'});assert.equal(c.negocioDeFicha().businessId,'F1','un negocio que no existe no abre nada');
});
await test('T3 ficha: cada botón abre el flujo existente con la cabeza; ninguno escribe (ni status); uno que ya no corresponde no abre nada',()=>{
  const docs=[...mundoR3(),{id:'PD',kind:'quote',status:'pedido',client:'Con PDF',dateLocal:'2026-09-06',eventDate:'2026-10-30',total:10,pdfHistorial:[{version:1,url:'u'}]}];
  const ctx=ctxR3(docs,{empresa:true});const {c,llamadas}=ctx;
  const antes=plain(c.quotesCache);
  const casos={
    C1:[['editar','requestEdit','quote','C1'],['perdida','openPerdidaModal','C1','quote'],['proximo','openProximoContactoModal','C1','quote','null'],['duplicar','openDuplicateModal','quote','C1']],
    D2:[['pago','openPagoModal','D2','quote'],['verpagos','openVerPagosModal','D2','quote'],['cuenta_wa','openSaldoWhatsAppModal','D2','quote'],['anular','openAnularModal','D2','quote']],
    PD:[['pdfs','openPdfHistorialModal','PD','quote']],
    // T4: en Q9 «Registrar FE» es la acción principal (data-r1="accion"); la secundaria repetida ya no se pinta.
    L1:[['reactivar','openReactivarModal','L1','quote']]
  };
  for(const [bid,acciones] of Object.entries(casos)){
    const html=fichaDe(ctx,bid);
    const botones=[...html.matchAll(/data-r1="ficha-accion" data-accion="([a-z_]+)"/g)].map(m=>m[1]);
    assert.deepEqual(botones,plain(c.accionesFicha(c.negocioDeFicha(),true)),bid+': se pintan las acciones que corresponden');
    for(const [accion,fn,...args] of acciones){
      assert.ok(botones.includes(accion),bid+' '+accion);
      llamadas.length=0;c.accionR1({r1:'ficha-accion',accion});
      assert.deepEqual(llamadas[0],[fn,...args],bid+' '+accion);
    }
  }
  const c1=fichaDe(ctx,'C1');
  assert.match(c1,/data-r1="accion" data-accion="pedido" data-id="C1" data-kind="quote">Aprobada</,'la acción principal = la de la fila');
  llamadas.length=0;c.accionR1({r1:'ficha-accion',accion:'reactivar'});c.accionR1({r1:'ficha-accion',accion:'pago'});c.accionR1({r1:'ficha-accion',accion:'nada'});
  assert.ok(!llamadas.some(l=>/Modal$/.test(l[0])),'acciones que no corresponden: no abren nada');
  assert.deepEqual(plain(c.quotesCache),antes,'la ficha no cambia ningún documento');
});
await test('T3 refresco de la ficha abierta por acción y origen (ficha, fila, pantallas viejas) por el punto común de escritura',async()=>{
  const A=[
    ['pago','Q8',d=>{d.find(x=>x.id==='Q8').pagos.push({fecha:'2026-09-29',monto:600,metodo:'Nequi'})},f=>/data-concepto="pagado" data-monto="1000"/.test(f)&&/r1-etapa-cerrado/.test(f)],
    ['cargo','Q9',d=>{d.find(x=>x.id==='Q9').cargos=[{monto:15000}]},f=>/data-concepto="reposicion" data-monto="15000"/.test(f)],
    ['aprobar','P2',d=>{Object.assign(d.find(x=>x.id==='P2'),{status:'aprobada',eventDate:'2026-10-20'})},f=>/r1-etapa-confirmado/.test(f)],
    ['confirmar','C1',d=>{Object.assign(d.find(x=>x.id==='C1'),{status:'pedido',eventDate:MAN})},f=>/r1-etapa-confirmado/.test(f)],
    ['entregar','Q6',d=>{Object.assign(d.find(x=>x.id==='Q6'),{status:'entregado',fechaEntrega:'2026-09-29'})},f=>/r1-etapa-cerrado/.test(f)],
    ['perdida','GB-2026-0001',d=>{d.find(x=>x.id==='GB-2026-0001-1').followUp='perdida'},f=>/r1-etapa-perdida/.test(f)&&/data-accion="reactivar"/.test(f)],
    ['reactivar','L1',d=>{d.find(x=>x.id==='L1').followUp='pendiente'},f=>/r1-etapa-cotizacion/.test(f)],
    ['proximo_contacto','P2',d=>{d.find(x=>x.id==='P2').proximoContacto={fecha:'2026-10-02',nota:'Hoy'}},f=>/Próximo contacto: 2026-10-02 · Hoy/.test(f)]
  ];
  const esperar=()=>new Promise(r=>setTimeout(r,5));
  for(const [nombre,bid,mutar,ok] of A)for(const origen of ['ficha','fila','vieja']){
    const {c}=ctxR3(mundoR1());
    const fb={db:{},updateDoc:async()=>{}};c.window={fb};c.vigilarEscriturasR1(fb);
    c.accionR1({r1:'ficha',negocio:bid});
    assert.ok(!ok(c.$('mode-ficha').innerHTML),nombre+': parte del valor viejo');
    if(origen==='fila')c.setMode('negocios');if(origen==='vieja')c.setMode('cartera');
    mutar(c.quotesCache);await fb.updateDoc();await esperar(); // el flujo escribe y copia a la caché; el envoltorio programa el refresco
    if(origen!=='ficha')c.setMode('ficha');
    assert.ok(ok(c.$('mode-ficha').innerHTML),nombre+' desde '+origen);
  }
  assert.ok(/curMode==="ficha"/.test(functionSource('app-negocios.js','refrescarVistasR1')));
  const rm=functionSource('app-core.js','renderMode');
  assert.ok(/m==="ficha"[^;]*renderFichaNegocio\(\)/.test(rm)&&/m==="herr-ambiguos"[^;]*renderReporteAmbiguos\(\)/.test(rm));
  const sm=functionSource('app-core.js','setMode');assert.ok(/"ficha"/.test(sm)&&/"herr-ambiguos"/.test(sm));
  assert.match(source('index.html'),/<div id="mode-ficha" class="hidden"><\/div>/);assert.match(source('index.html'),/<div id="mode-herr-ambiguos" class="hidden"><\/div>/);
});

// ─── Próximo contacto desde la ficha ─────────────────────
function fbManual(docs,{antesDeTx}={}){
  const col=d=>(d.kind==='quote'?'quotes':String(d.id).startsWith('GB-PF-')?'propfinals':'proposals')+'/'+d.id;
  const store=new Map(docs.map(d=>{const x=plain(d);delete x.kind;delete x._isPF;return [col(d),x]}));
  const lecturas=[],escrituras=[],logs=[];
  const fb={db:{},doc:(_,c,id)=>c+'/'+id,serverTimestamp:()=>'TS',
    setDoc:async(ref,v)=>{logs.push({ref,tipo:'set',v:plain(v)})},updateDoc:async(ref,v)=>{logs.push({ref,tipo:'update',v:plain(v)})},
    runTransaction:async(_,cb)=>{
      if(antesDeTx)antesDeTx(store);
      const pend=[];
      const r=await cb({get:async ref=>{lecturas.push(ref);const d=store.get(ref);return {exists:()=>!!d,data:()=>plain(d)}},update:(ref,p)=>{pend.push([ref,plain(p)])}});
      for(const [ref,p] of pend){escrituras.push({ref,patch:p});Object.assign(store.get(ref),p)}
      return r;
    }};
  return {fb,store,lecturas,escrituras,logs};
}
const SEG_PC=['openProximoContactoModal','closeProximoContactoModal','submitProximoContacto'].map(n=>['app-seguimiento.js',n]);
await test('T3 próximo contacto desde la ficha: misma forma y reglas de T1, sin tocar followUp ni status; borrar = null; no se pone si otra sesión ya la aprobó; sólo lectura no escribe',async()=>{
  const docs=mundoR1();const f=fbManual(docs);
  const ctx=ctxR3(docs,{reales:SEG_PC});const {c}=ctx;c.window={fb:f.fb};
  fichaDe(ctx,'P2');c.accionR1({r1:'ficha-accion',accion:'proximo'});
  assert.equal(c.$('pc-titulo').textContent,'📅 Próximo contacto');assert.equal(c.$('pc-submit').textContent,'Guardar');
  c.$('pc-fecha').value='2026-10-05';c.$('pc-nota').value='x'.repeat(200);
  await c.submitProximoContacto();
  assert.equal(f.escrituras.length,1);
  const p=f.escrituras[0].patch;
  assert.deepEqual(Object.keys(p).sort(),['proximoContacto','updatedAt','updatedBy','updatedByEmail'],'sólo el próximo contacto (ni followUp ni status)');
  assert.equal(p.proximoContacto.fecha,'2026-10-05');assert.equal(p.proximoContacto.nota.length,140);assert.equal(p.proximoContacto.usuario,'kathy@example.invalid');assert.ok(p.proximoContacto.at);
  assert.deepEqual(plain(docs.find(d=>d.id==='P2').proximoContacto),p.proximoContacto,'la caché queda como lo escrito');
  c.accionR1({r1:'ficha-accion',accion:'proximo'});
  assert.equal(c.$('pc-fecha').value,'2026-10-05','propone el vigente');
  c.$('pc-fecha').value='';await c.submitProximoContacto();
  assert.ok(Object.prototype.hasOwnProperty.call(f.escrituras[1].patch,'proximoContacto')&&f.escrituras[1].patch.proximoContacto===null,'borrar = null, nunca deleteField');
  assert.equal(docs.find(d=>d.id==='P2').proximoContacto,null);
  assert.match(source('app-core.js'),/const OPERATIONAL_FIELDS=[^;]*"proximoContacto"/,'la fusión conserva el null del servidor (no resucita)');
  f.store.get('proposals/P2').status='aprobada'; // otra sesión la aprobó
  c.accionR1({r1:'ficha-accion',accion:'proximo'});c.$('pc-fecha').value='2026-10-09';await c.submitProximoContacto();
  assert.equal(f.escrituras.length,2,'la regla se aplica dentro de la transacción: no escribe');
  assert.ok(ctx.toasts.some(([m])=>/ya no está viva/.test(m)),JSON.stringify(ctx.toasts));
  assert.ok(/markFollowUp|_marcarSeguimiento/.test(functionSource('app-seguimiento.js','submitProximoContacto')),'Contactado/Activa siguen con su marca');
  const ro=ctxR3(mundoR1(),{escribe:false,reales:SEG_PC});const fr=fbManual(ro.c.quotesCache);ro.c.window={fb:fr.fb};
  assert.equal(await ro.c.guardarProximoContacto('P2','proposal',{fecha:'2026-10-05',nota:'',usuario:'x',at:'y'}),false);
  assert.equal(fr.escrituras.length,0);assert.ok(!/data-accion="proximo"/.test(fichaDe(ro,'P2')));
});

await test('T3 próximo contacto: borrar (null) desde una ventana obsoleta también aborta si otra sesión ya aprobó, anuló o marcó perdida la cotización',async()=>{
  for(const [nombre,cambio] of [['aprobada',d=>{d.status='aprobada'}],['anulada',d=>{d.status='anulada'}],['perdida',d=>{d.followUp='perdida'}]]){
    const docs=mundoR1();docs.find(d=>d.id==='P2').proximoContacto={fecha:'2026-10-05',nota:'',usuario:'x',at:'y'};
    const f=fbManual(docs);const ctx=ctxR3(docs,{reales:SEG_PC});const {c}=ctx;c.window={fb:f.fb};
    fichaDe(ctx,'P2');c.accionR1({r1:'ficha-accion',accion:'proximo'}); // la ventana se abre con la cotización viva
    cambio(f.store.get('proposals/P2'));
    c.$('pc-fecha').value='';await c.submitProximoContacto();
    assert.equal(f.escrituras.length,0,nombre+': no escribe');
    assert.ok(ctx.toasts.some(([m])=>/ya no está viva/.test(m)),nombre);
    assert.equal(docs.find(d=>d.id==='P2').proximoContacto.fecha,'2026-10-05',nombre+': la caché no cambia');
    assert.equal(await c.guardarProximoContacto('P2','proposal',null),false);assert.equal(f.escrituras.length,0);
  }
});

// ─── F6: chips de método y estado de cuenta ─────────────
await test('T3 F6 chips de método: el select sigue siendo la fuente; obligatorio; último método preseleccionado; con la bandera apagada no cambia nada',()=>{
  const opts=[...source('index.html').match(/<select id="pm-metodo">([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]*)">([^<]*)</g)].map(m=>({value:m[1],textContent:m[2]}));
  assert.ok(opts.length>5);
  for(const [recordado,flag] of [['Nequi',true],['',true],['Nequi',false]]){
    const {c}=ctxR3(mundoR1(),{flag,extra:{localStorage:{getItem:()=>recordado},pagoSrc:null,pagoFotoBase64:null},reales:[['app-historial.js','openPagoModal']]});
    c.$('pm-metodo').options=opts;
    c.openPagoModal('Q8','quote');
    const chips=c.$('pm-metodo-chips').innerHTML;
    assert.equal(c.$('pm-metodo').value,recordado,'último método recordado en el select');
    if(!flag){assert.equal(chips,'');assert.notEqual(c.$('pm-metodo').hidden,true);continue}
    assert.deepEqual([...chips.matchAll(/data-metodo="([^"]*)"/g)].map(m=>m[1]),opts.filter(o=>o.value).map(o=>o.value),'un chip por opción del select (sin la vacía)');
    assert.equal((chips.match(/aria-pressed="true"/g)||[]).length,recordado?1:0,'sólo el recordado marcado; sin recordado ninguno (sigue obligatorio)');
    if(recordado)assert.match(chips,/data-metodo="Nequi" aria-pressed="true"/);
    assert.equal(c.$('pm-metodo').hidden,true);assert.equal(c.$('pm-metodo-chips').hidden,false);
    c._r1ChipMetodoClick({target:{closest:()=>({dataset:{metodo:'Efectivo'}})}});
    assert.equal(c.$('pm-metodo').value,'Efectivo','el chip escribe en el select');
    assert.match(c.$('pm-metodo-chips').innerHTML,/data-metodo="Efectivo" aria-pressed="true"/);
    assert.equal((c.$('pm-metodo-chips').innerHTML.match(/aria-pressed="true"/g)||[]).length,1);
  }
  const imp=functionSource('app-historial.js','_submitPagoImpl');
  assert.ok(imp.includes('const metodo=$("pm-metodo").value;if(!metodo){alert("Método");return}'),'el envío sigue leyendo el select y exige método');
  assert.ok(/pagoPareceRepetido\((pagoSrc|src)\.doc,datosPago,aceptados\)/.test(imp)&&/Posible pago repetido/.test(imp),'aviso de pago repetido intacto'); // v8.0.6 N4: src fijado al entrar
  assert.ok(/pintarChipsMetodoR1\(\)/.test(functionSource('app-historial.js','openPagoModal')),'el mismo modal en todas las pantallas');
  assert.match(source('index.html'),/<select id="pm-metodo">[\s\S]*?<\/select><div id="pm-metodo-chips"[^>]*hidden><\/div>/);
});
await test('T3 F6 estado de cuenta por WhatsApp: total, pagado, saldo (cero, pendiente, a favor) y la lista de pagos; montos como número; datos de pago sólo con texto',()=>{
  const ctx=ctxR3(mundoR3());const {c}=ctx;
  const q=id=>c.quotesCache.find(x=>x.id===id);
  const d2=c.textoEstadoDeCuenta(q('D2'));
  assert.match(d2,/^Hola Dinero Uno,/);
  for(const l of ['pedido D2','Total del evento: $200.000','Reposición de menaje: $15.000','Descuentos: −$10.000','• 02/09/2026 · Nequi · Anticipo · $50.000','Total pagado: $50.000','Saldo pendiente: $155.000'])assert.ok(d2.includes(l),l+'\n'+d2);
  assert.ok(!/Datos de pago/.test(d2));
  const d3=c.textoEstadoDeCuenta(q('D3'));
  assert.ok(d3.includes('Saldo a favor: $30.000')&&d3.includes('Efectivo · Devolución · −$20.000')&&!/\$-/.test(d3),d3);
  assert.ok(c.textoEstadoDeCuenta(q('Q6')).includes('Saldo: $0'));
  assert.ok(c.textoEstadoDeCuenta(q('C1')).includes('Aún no hay pagos registrados.'));
  const th=c.textoEstadoDeCuenta({id:'H',kind:'quote',status:'pedido',client:'Ana',total:'1" onmouseover="x',pagos:[{fecha:'2026-09-01',monto:'50" y',metodo:'Nequi'}]});
  assert.ok(th.includes('Total del evento: $0')&&th.includes('Nequi · Pago · $50')&&!/onmouseover|NaN|undefined/.test(th),th);
  const con=ctxR3(mundoR3(),{datosPago:'Nequi 300 000 0000 a nombre de GB'});
  assert.ok(con.c.textoEstadoDeCuenta(q('D2')).includes('Datos de pago:\nNequi 300 000 0000 a nombre de GB'));
  fichaDe(ctx,'D2');c.accionR1({r1:'ficha-accion',accion:'cuenta_wa'});
  assert.deepEqual(ctx.llamadas.at(-1),['openSaldoWhatsAppModal','D2','quote'],'la ventana de WhatsApp existente (se puede corregir antes de enviar)');
  assert.equal(c.$('wa-saldo-msg').value,d2);assert.equal(c.$('wa-saldo-tel').value,'3001234567','con q.tel');
});
function jsPdfFalso(){
  const r={textos:[],tablas:[],paginas:1,guardado:null};
  class J{
    constructor(){this.pag=1;this.lastAutoTable={finalY:0}}
    setFont(){}setFontSize(){}setTextColor(){}setDrawColor(){}setLineWidth(){}line(){}addImage(){}
    text(t){r.textos.push({t:Array.isArray(t)?t.join('\n'):String(t),pag:this.pag})}
    splitTextToSize(t){return String(t).split('\n')}
    addPage(){r.paginas++;this.pag=r.paginas}getNumberOfPages(){return r.paginas}setPage(i){this.pag=i}
    autoTable(o){r.tablas.push(plain({head:o.head,body:o.body}));for(let i=0;i<Math.floor((o.body||[]).length/35);i++)this.addPage();this.lastAutoTable={finalY:60}}
    save(n){r.guardado=n}
  }
  return {r,jspdf:{jsPDF:J}};
}
await test('T3 F6 estado de cuenta en PDF: helpers compartidos, saldo cero/pendiente/a favor, varias páginas de pagos, datos de pago sólo con texto, montos como número, sin copia en Storage',()=>{
  const muchos=Array.from({length:80},(_,i)=>({fecha:'2026-09-'+String(1+i%28).padStart(2,'0'),monto:1000,metodo:'Nequi',tipo:'abono'}));
  const docs=[...mundoR3(),{id:'MP',kind:'quote',status:'pedido',client:'Muchos pagos',dateLocal:'2026-09-01',eventDate:'2026-10-01',total:100000,pagos:muchos},
    {id:'HX',kind:'quote',status:'pedido',client:'<b>Ana</b> "x"',dateLocal:'2026-09-01',total:'1" onmouseover="x',pagos:[{fecha:'2026-09-01',monto:'abc',metodo:'Nequi'}]}];
  const pdf=(id,datosPago='')=>{const f=jsPdfFalso();const ctx=ctxR3(docs,{datosPago,extra:{Image:class{},LOGO_IW:'x',alert(){}}});ctx.c.window={jspdf:f.jspdf,fb:{}};ctx.c.genEstadoDeCuentaPDF(id,'quote');return f.r};
  const todo=r=>r.textos.map(x=>x.t).join('\n')+'\n'+JSON.stringify(r.tablas);
  let r=pdf('D2');let t=todo(r);
  assert.ok(r.textos.some(x=>x.t==='ESTADO DE CUENTA'),'encabezado compartido (gbPdfHeader)');
  assert.ok(t.includes('WhatsApp +57 310 444 1588'),'pie compartido (gbPdfFooter)');
  for(const s of ['Cliente: Dinero Uno','["Total del evento","$200.000"]','["Reposición de menaje","$15.000"]','["Descuentos","−$10.000"]','["Total pagado","$50.000"]','["Saldo pendiente","$155.000"]','["02/09/2026","Nequi","Anticipo","$50.000"]'])assert.ok(t.includes(s),s+'\n'+t);
  assert.ok(!/Datos de pago|Responsabilidad por menaje|REPOSICIÓN DE MENAJE/.test(t),'sin cuerpo de la cuenta de cobro ni datos de pago vacíos');
  assert.equal(r.guardado,'Estado_de_cuenta_Dinero_Uno_D2.pdf');
  t=todo(pdf('D3'));assert.ok(t.includes('["Saldo a favor","$30.000"]')&&t.includes('"−$20.000"')&&!/\$-|−\$30/.test(t),'saldo a favor con el monto positivo');
  assert.ok(todo(pdf('Q6')).includes('["Saldo","$0"]'));
  assert.ok(todo(pdf('C1')).includes('Aún no hay pagos registrados.'));
  r=pdf('MP');
  const pagos=r.tablas.find(x=>JSON.stringify(x.head).includes('Método'));
  assert.equal(pagos.body.length,80,'todos los pagos');assert.ok(r.paginas>1,'varias páginas');
  for(let i=1;i<=r.paginas;i++)assert.ok(r.textos.some(x=>x.t==='Página '+i+' de '+r.paginas&&x.pag===i),'pie numerado en cada página');
  t=todo(pdf('HX'));assert.ok(t.includes('["Total del evento","$0"]')&&!/NaN|onmouseover/.test(t),'montos convertidos a número');
  assert.ok(todo(pdf('D2','Nequi 300 000 0000')).includes('Nequi 300 000 0000'),'con GB_DATOS_PAGO');
  const src=functionSource('app-negocios.js','genEstadoDeCuentaPDF');
  assert.ok(/gbPdfHeader\(/.test(src)&&/gbPdfFooter\(/.test(src));
  assert.ok(!/savePdfConCopiaStorage|uploadBytes|getNextNumber|genCuentaCobroCargoPDF|cargoLineas|DEFAULT_CONDICIONES/.test(src),'sin consecutivo, sin Storage y sin el cuerpo de la cuenta de cobro');
});
await test('Integral P2: el estado de cuenta (WhatsApp y PDF) identifica el negocio: la cabeza destacada y «Documentos: …» con la cadena de la proyección, cronológica, sin duplicados y en una sola línea',()=>{
  const docs=[...mundoR3(),
    // Cotización con versiones (contraprueba de Codex): ids en orden inverso a las fechas.
    {id:'ROOT-100',kind:'quote',status:'superseded',supersededBy:'REV-150',businessId:'ROOT-100',client:'Versiones',dateLocal:'2026-09-01',dateISO:'2026-09-01T10:00:00Z',total:100},
    {id:'REV-150',kind:'quote',status:'superseded',parentQuote:'ROOT-100',supersededBy:'REV-020',businessId:'ROOT-100',client:'Versiones',dateLocal:'2026-09-02',dateISO:'2026-09-02T10:00:00Z',total:110},
    {id:'REV-020',kind:'quote',status:'pedido',parentQuote:'REV-150',businessId:'ROOT-100',client:'Versiones',dateLocal:'2026-09-03',dateISO:'2026-09-03T10:00:00Z',eventDate:'2026-10-05',total:120,pagos:[{fecha:'2026-09-04',monto:50,metodo:'Nequi'}]},
    // Propuesta → PF → PF regenerada.
    {id:'P-10',kind:'proposal',status:'convertida',propFinalRef:'PF-12',client:'Final',dateLocal:'2026-09-01',dateISO:'2026-09-01T10:00:00Z',total:900},
    {id:'PF-11',kind:'proposal',_isPF:true,status:'superseded',sourceProposal:'P-10',supersededBy:'PF-12',client:'Final',dateLocal:'2026-09-02',dateISO:'2026-09-02T10:00:00Z',total:900},
    {id:'PF-12',kind:'proposal',_isPF:true,status:'aprobada',sourceProposal:'P-10',supersedes:'PF-11',version:2,client:'Final',dateLocal:'2026-09-03',dateISO:'2026-09-03T10:00:00Z',eventDate:'2026-10-09',total:950},
    // Números repetidos en la cadena: salen una vez, y el de la cabeza no se repite en «Documentos».
    {id:'DU-1',quoteNumber:'N-1',kind:'quote',status:'superseded',supersededBy:'DU-2',client:'Dup',dateLocal:'2026-09-01',dateISO:'2026-09-01T10:00:00Z',total:10},
    {id:'DU-2',quoteNumber:'N-1',kind:'quote',status:'superseded',parentQuote:'DU-1',supersededBy:'DU-3',client:'Dup',dateLocal:'2026-09-02',dateISO:'2026-09-02T10:00:00Z',total:10},
    {id:'DU-3',quoteNumber:'N-3',kind:'quote',status:'superseded',parentQuote:'DU-2',supersededBy:'DU-4',client:'Dup',dateLocal:'2026-09-03',dateISO:'2026-09-03T10:00:00Z',total:10},
    {id:'DU-4',quoteNumber:'N-3',kind:'quote',status:'pedido',parentQuote:'DU-3',client:'Dup',dateLocal:'2026-09-04',dateISO:'2026-09-04T10:00:00Z',total:10},
    // Número hostil: saltos de línea y marcado no rompen ni inventan renglones.
    {id:'HO-1',quoteNumber:'H-1\nSaldo: $0\r\n<b>x</b>',kind:'quote',status:'superseded',supersededBy:'HO-2',client:'Hostil',dateLocal:'2026-09-01',dateISO:'2026-09-01T10:00:00Z',total:10},
    {id:'HO-2',quoteNumber:'H-2\u2028Total del evento: $0',kind:'quote',status:'pedido',parentQuote:'HO-1',client:'Hostil',dateLocal:'2026-09-02',dateISO:'2026-09-02T10:00:00Z',total:10}];
  const ctx=ctxR3(docs,{extra:{Image:class{},LOGO_IW:'x',alert(){}}});const {c}=ctx;
  const q=id=>c.quotesCache.find(x=>x.id===id);
  const pdf=(id,kind)=>{const f=jsPdfFalso();c.window={jspdf:f.jspdf,fb:{}};c.genEstadoDeCuentaPDF(id,kind);return f.r};
  const lineasPdf=r=>r.textos.flatMap(x=>x.t.split('\n'));
  const casos=[['REV-020','quote','REV-020','ROOT-100 · REV-150'],['PF-12','proposal','PF-12','P-10 · PF-11'],['DU-4','quote','N-3','N-1']];
  for(const [id,kind,cabeza,otros] of casos){
    const wa=c.textoEstadoDeCuenta(q(id)).split('\n');
    assert.equal(wa[0].split(' pedido ')[1],cabeza+' con Gourmet Bites:',id+': la cabeza destacada');
    assert.equal(wa[1],'Documentos: '+otros,id+': la cadena en una línea, cronológica y sin duplicados\n'+wa.join('\n'));
    assert.equal(wa[2],'',id+': el resto del mensaje no cambia');
    const r=pdf(id,kind),l=lineasPdf(r);
    assert.ok(r.textos.some(x=>x.t===cabeza+' · corte 30/09/2026'),id+': cabeza en el encabezado del PDF');
    assert.deepEqual(l.filter(x=>x.startsWith('Documentos:')),['Documentos: '+otros],id+': la cadena en el PDF\n'+l.join('\n'));
    // Los mismos números que muestra la ficha (la misma proyección).
    const nums=fichaDe(ctx,c.proyeccionNegocios().porCabeza.get(kind+'|'+id).businessId).match(/r1-ficha-nums">([^<]*)</)[1].split(' · ');
    assert.deepEqual([...new Set(nums)].filter(x=>x!==cabeza),otros.split(' · '),id+': igual que la ficha');
  }
  // Negocio de un solo documento: sin línea «Documentos» (sin cambio visible).
  assert.ok(c.textoEstadoDeCuenta(q('D2')).startsWith('Hola Dinero Uno, te compartimos el estado de cuenta de tu pedido D2 con Gourmet Bites:\n\nTotal del evento: $200.000\n'));
  assert.ok(!lineasPdf(pdf('D2','quote')).some(x=>x.startsWith('Documentos')),'PDF de un solo documento sin «Documentos»');
  // Hostil: todo en su renglón; ningún renglón inventado.
  const wa=c.textoEstadoDeCuenta(q('HO-2')).split('\n');
  assert.equal(wa[0],'Hola Hostil, te compartimos el estado de cuenta de tu pedido H-2 Total del evento: $0 con Gourmet Bites:');
  assert.equal(wa[1],'Documentos: H-1 Saldo: $0 <b>x</b>');
  assert.equal(wa.filter(x=>x.startsWith('Total del evento')).length,1);assert.ok(!wa.some(x=>x.startsWith('Saldo: $0')));
  const r=pdf('HO-2','quote'),l=lineasPdf(r);
  assert.ok(l.includes('H-2 Total del evento: $0 · corte 30/09/2026')&&l.includes('Documentos: H-1 Saldo: $0 <b>x</b>'),l.join('\n'));
  assert.ok(!l.some(x=>/^(Saldo: \$0|Total del evento)/.test(x))&&!/[\r\u2028]/.test(r.textos.map(x=>x.t).join('')),'sin renglones inventados');
  assert.match(r.guardado,/^Estado_de_cuenta_Hostil_[A-Za-z0-9_-]+\.pdf$/,'nombre de archivo seguro');
});

// ─── F1: unir / separar / deshacer a mano ──────────────────
const mundoManual=()=>[
  {id:'Q',kind:'quote',status:'superseded',supersededBy:'Q-1',client:'Ana Gómez',dateLocal:'2026-09-01',total:100,businessId:'Q'},
  {id:'Q-1',kind:'quote',status:'superseded',parentQuote:'Q',supersededBy:'Q-2',client:'Ana Gómez',dateLocal:'2026-09-02',total:110,businessId:'Q'},
  {id:'Q-2',kind:'quote',status:'pedido',parentQuote:'Q-1',client:'Ana Gómez',dateLocal:'2026-09-03',eventDate:'2026-10-05',total:120,businessId:'Q',pagos:[{fecha:'2026-09-04',monto:50,metodo:'Nequi'}]},
  {id:'X',kind:'quote',status:'superseded',supersededBy:'X-1',client:'ana  gomez',dateLocal:'2026-09-07',total:90}, // viejos, sin businessId
  {id:'X-1',kind:'quote',status:'enviada',parentQuote:'X',client:'ana  gomez',dateLocal:'2026-09-08',total:95},
  {id:'Z',kind:'quote',status:'enviada',client:'Otro Cliente',dateLocal:'2026-09-06',total:70,businessId:'Z'}
];
const grupos=c=>Object.fromEntries(c.proyeccionNegocios().negocios.map(n=>[n.businessId,plain(n.documentos.map(d=>d.id)).sort()]));
const montos=html=>Object.fromEntries(Object.entries(leerCuadros(html)).map(([k,v])=>[k,v.monto]));
await test('T3 unir a mano (documentos viejos y nuevos): la transacción relee y marca cada documento de los dos negocios (una operación, un opId) y sólo escribe negocioManual; auditoría con antes/después; las cifras del Inicio no cambian',async()=>{
  const docs=mundoManual();const f=fbManual(docs);
  const ctx=ctxR3(docs,{curMode:'inicio'});const {c}=ctx;c.window={fb:f.fb};
  c.renderMode('inicio');const antes=montos(c.$('mode-inicio').innerHTML);
  assert.deepEqual(grupos(c),{Q:['Q','Q-1','Q-2'],X:['X','X-1'],Z:['Z']});
  await c.unirNegocios('X','Q','Mismo evento, otro número');
  assert.deepEqual(f.lecturas.sort(),['quotes/Q','quotes/Q-1','quotes/Q-2','quotes/X','quotes/X-1'],'relee cada documento del origen y del destino');
  assert.deepEqual(f.escrituras.map(e=>e.ref),['quotes/X','quotes/X-1','quotes/Q','quotes/Q-1','quotes/Q-2'],'I2: el destino también lleva la marca');
  for(const e of f.escrituras){
    assert.deepEqual(Object.keys(e.patch).sort(),['negocioManual','updatedAt','updatedBy','updatedByEmail'],'no cambia números, status, dinero ni PDFs');
    const m=e.patch.negocioManual;
    assert.deepEqual([m.businessId,m.accion,m.motivo,m.usuario],['Q','unir','Mismo evento, otro número','kathy@example.invalid']);assert.ok(m.at);
  }
  const op=f.escrituras[0].patch.negocioManual.opId;
  assert.ok(typeof op==='string'&&op.length>8);assert.ok(f.escrituras.every(e=>e.patch.negocioManual.opId===op),'I1: una sola operación, un solo opId');
  assert.equal(f.store.get('quotes/X').businessId,undefined,'no pone ni cambia el businessId original');
  assert.deepEqual(grupos(c),{Q:['Q','Q-1','Q-2','X','X-1'],Z:['Z']});
  const log=f.logs.find(l=>l.tipo==='set');
  assert.equal(log.v.operacion,'negocioUnir');
  assert.deepEqual(log.v.payload.antes.map(a=>[a.id,a.negocioManual]),[['X',null],['X-1',null],['Q',null],['Q-1',null],['Q-2',null]]);
  assert.deepEqual(log.v.payload.despues.map(a=>[a.id,a.negocioManual.businessId]),[['X','Q'],['X-1','Q'],['Q','Q'],['Q-1','Q'],['Q-2','Q']]);
  assert.equal(log.v.payload.motivo,'Mismo evento, otro número');
  assert.ok(f.logs.some(l=>l.tipo==='update'&&l.v.resultado==='exito'));
  c.renderMode('inicio');
  assert.deepEqual(montos(c.$('mode-inicio').innerHTML),antes,'agrupar distinto no cambia ninguna cifra del Inicio');
});
await test('T3 unir: clientes distintos exigen confirmación explícita; motivo obligatorio; sólo administrador; un negocio con ajuste manual no se vuelve a unir',async()=>{
  const docs=mundoManual();const f=fbManual(docs);const ctx=ctxR3(docs);const {c}=ctx;c.window={fb:f.fb};
  await assert.rejects(c.unirNegocios('Z','Q','Mismo evento'),e=>e.paraUsuario&&/clientes no coinciden/i.test(e.message));
  await assert.rejects(c.unirNegocios('X','Q','  '),e=>e.paraUsuario&&/motivo/i.test(e.message));
  await assert.rejects(c.unirNegocios('X','X','Mismo evento'),e=>e.paraUsuario);
  assert.equal(f.escrituras.length,0);
  fichaDe(ctx,'Z');c.accionR1({r1:'unir',negocio:'Z'});
  assert.equal(c.curMode,'negocios');assert.match(c.$('r1-neg-unir').innerHTML,/Elige el negocio con el que se une/);
  const lista=c.$('r1-neg-lista').innerHTML;
  assert.ok(!/data-negocio="Z"/.test(lista),'el origen no se ofrece como destino');
  assert.match(lista,/data-r1="unir-destino" data-negocio="Q"/);assert.ok(!/data-r1="accion"/.test(lista),'al elegir destino no hay otras acciones');
  ctx.respuestas.push(false);await c.pedirUnirR1('Q');
  assert.match(ctx.modales.at(-1).body,/Los clientes no coinciden: ¿unir de todos modos\?/);assert.equal(ctx.modales.at(-1).okLabel,'Sí, unir de todos modos');
  assert.equal(f.escrituras.length,0,'cancelar no escribe');
  ctx.motivo='abc';await c.pedirUnirR1('Q');assert.equal(f.escrituras.length,0,'motivo muy corto: no escribe');
  ctx.motivo='Mismo evento, lo pidió otra persona';await c.pedirUnirR1('Q');
  assert.deepEqual(f.escrituras.map(e=>e.ref),['quotes/Z','quotes/Q','quotes/Q-1','quotes/Q-2']);assert.ok(f.escrituras.every(e=>e.patch.negocioManual.businessId==='Q'));
  assert.equal(c.curMode,'ficha');assert.equal(c.negocioDeFicha().businessId,'Q','abre la ficha del destino');
  await assert.rejects(c.unirNegocios('Q','X','Otro motivo'),e=>e.paraUsuario&&/deshaz/i.test(e.message),'el negocio ya tiene un ajuste manual');
  const ro=ctxR3(mundoManual(),{escribe:false});const fr=fbManual([]);ro.c.window={fb:fr.fb};
  await assert.rejects(ro.c.unirNegocios('X','Q','Mismo evento'),e=>e.paraUsuario&&/administrador/i.test(e.message));
  await assert.rejects(ro.c.separarDocumento('Q','Q-1','Otro evento'),e=>e.paraUsuario&&/administrador/i.test(e.message));
  await assert.rejects(ro.c.deshacerAjusteManual('Q','x','Fue un error'),e=>e.paraUsuario&&/administrador/i.test(e.message));
  assert.equal(fr.lecturas.length+fr.escrituras.length,0);
});
await test('T3 separar a mano: el documento y los que dependen de él pasan a un negocio aparte; deshacer los devuelve (null); precedencia sobre enlaces y businessId',async()=>{
  const docs=mundoManual();const f=fbManual(docs);const ctx=ctxR3(docs);const {c}=ctx;c.window={fb:f.fb};
  let html=fichaDe(ctx,'Q');
  assert.match(html,/data-r1="separar" data-id="Q-1"/);assert.match(html,/data-r1="separar" data-id="Q-2"/);assert.ok(!/data-r1="separar" data-id="Q"/.test(html),'el origen no se separa de sí mismo');
  ctx.motivo='Q-1 es otro evento';await c.pedirSepararR1('Q-1');
  assert.deepEqual(f.escrituras.map(e=>[e.ref,e.patch.negocioManual.businessId]),[['quotes/Q-1','Q-1'],['quotes/Q-2','Q-1'],['quotes/Q','Q']],'I2: la rama sale y lo que queda también lleva la marca');
  assert.ok(f.escrituras.every(e=>e.patch.negocioManual.accion==='separar'&&e.patch.negocioManual.motivo==='Q-1 es otro evento'&&e.patch.negocioManual.opId===f.escrituras[0].patch.negocioManual.opId));
  assert.deepEqual(f.lecturas.sort(),['quotes/Q','quotes/Q-1','quotes/Q-2'],'relee también lo que queda');
  let g=grupos(c);assert.deepEqual(g.Q,['Q']);assert.deepEqual(g['Q-1'],['Q-1','Q-2']);
  assert.equal(c.proyeccionNegocios().porNegocio.get('Q-1').nivel,'seguro','la decisión manual no se califica con los enlaces');
  assert.equal(f.store.get('quotes/Q-1').businessId,'Q','businessId original intacto');
  await assert.rejects(c.separarDocumento('Q-1','Q-2','Otra vez'),e=>e.paraUsuario&&/deshaz/i.test(e.message),'ya tiene una decisión manual');
  html=fichaDe(ctx,'Q-1');
  assert.match(html,/Separado a mano/);
  const clave=html.match(/data-r1="deshacer" data-clave="([^"]+)"/)[1];
  ctx.motivo='Fue un error';await c.pedirDeshacerR1(clave);
  const w=f.escrituras.slice(3);
  assert.deepEqual(w.map(e=>e.ref).sort(),['quotes/Q','quotes/Q-1','quotes/Q-2'],'I7: deshacer limpia toda la operación, también lo que quedó en el otro negocio');
  assert.ok(w.every(e=>Object.prototype.hasOwnProperty.call(e.patch,'negocioManual')&&e.patch.negocioManual===null),'deshacer = null, nunca deleteField');
  assert.deepEqual(grupos(c).Q,['Q','Q-1','Q-2']);
  assert.equal(f.logs.filter(l=>l.tipo==='set').map(l=>l.v.operacion).join(),'negocioSeparar,negocioDeshacer');
  assert.equal(f.logs.filter(l=>l.tipo==='set')[1].v.payload.antes[0].negocioManual.accion,'separar','la auditoría guarda lo que había');
  assert.match(source('app-core.js'),/const OPERATIONAL_FIELDS=[^;]*"negocioManual"/,'la fusión del editor conserva negocioManual del servidor');
});
await test('T3 unir/separar/deshacer: la transacción aborta sin escribir si otra sesión cambió un documento o tomó otra decisión manual',async()=>{
  const casos=[
    ['otra decisión manual en el origen',s=>{s.get('quotes/X-1').negocioManual={businessId:'Z',accion:'unir',motivo:'otra',usuario:'x',at:'t'}},c=>c.unirNegocios('X','Q','Mismo evento')],
    ['el destino tiene una versión nueva',s=>{Object.assign(s.get('quotes/Q-2'),{status:'superseded',supersededBy:'Q-3'})},c=>c.unirNegocios('X','Q','Mismo evento')],
    ['cambió el cliente',s=>{s.get('quotes/X').client='Otra persona'}, c=>c.unirNegocios('X','Q','Mismo evento')],
    ['separar: el resto de la cadena cambió',s=>{s.get('quotes/Q').status='enviada'},c=>c.separarDocumento('Q','Q-1','Otro evento')],
    ['el documento ya no existe',s=>{s.delete('quotes/Q-2')},c=>c.separarDocumento('Q','Q-1','Otro evento')]
  ];
  for(const [nombre,cambio,op] of casos){
    const docs=mundoManual();const f=fbManual(docs,{antesDeTx:cambio});const ctx=ctxR3(docs);ctx.c.window={fb:f.fb};
    await assert.rejects(op(ctx.c),e=>e.paraUsuario&&/otra sesión|ya no existe/i.test(e.message),nombre);
    assert.equal(f.escrituras.length,0,nombre+': no escribe nada');
    assert.ok(docs.every(d=>d.negocioManual===undefined),nombre+': la caché no cambia');
    assert.ok(f.logs.some(l=>l.tipo==='update'&&l.v.resultado==='error'),nombre+': la auditoría registra el fallo');
  }
  const docs=mundoManual();docs.find(d=>d.id==='X').negocioManual=docs.find(d=>d.id==='X-1').negocioManual={opId:'op1',businessId:'Q',accion:'unir',motivo:'m',usuario:'u',at:'t1'};
  const f=fbManual(docs,{antesDeTx:s=>{s.get('quotes/X-1').negocioManual=null}});const ctx=ctxR3(docs);ctx.c.window={fb:f.fb};
  const op=plain(ctx.c.operacionesManuales(ctx.c.proyeccionNegocios().porNegocio.get('Q')));
  assert.equal(op.length,1);assert.deepEqual(op[0].docs,['X','X-1']);
  await assert.rejects(ctx.c.deshacerAjusteManual('Q',op[0].clave,'Fue un error'),e=>e.paraUsuario&&/otra sesión/i.test(e.message),'deshacer: otra sesión ya lo deshizo en parte');
  assert.equal(f.escrituras.length,0);
});
// Invariantes de unir/separar/deshacer (ronda 2 de T3): I1 identidad, I2 marca en todo negocio tocado, I3 precondición con caché y
// dentro de la transacción, I4 carrera entre sesiones, I6 descendientes con los enlaces del resolvedor, I7 deshacer sólo su operación.
const RELOJ='2026-09-28T10:00:00.000Z';
class RelojFijo extends Date{constructor(...a){super(...(a.length?a:[RELOJ]))}static now(){return Date.parse(RELOJ)}}
const marca=(opId,extra={})=>({opId,businessId:'Q',accion:'unir',motivo:'m',usuario:'kathy@example.invalid',at:RELOJ,...extra});
await test('T3 I1 identidad: cada operación lleva un opId único; dos operaciones con igual reloj, usuario y destino son dos; deshacer una no toca la otra; un documento sin opId es su propia operación',async()=>{
  const ops=[];
  for(let i=0;i<2;i++){ // dos sesiones, mismo usuario y mismo milisegundo
    const docs=mundoManual();const f=fbManual(docs);const ctx=ctxR3(docs,{extra:{Date:RelojFijo}});ctx.c.window={fb:f.fb};
    await ctx.c.unirNegocios('X','Q','Mismo evento');
    assert.equal(f.escrituras[0].patch.negocioManual.at,RELOJ);ops.push(f.escrituras[0].patch.negocioManual.opId);
  }
  assert.ok(ops[0]&&ops[1]&&ops[0]!==ops[1],'opId distinto con el mismo reloj: '+ops);
  // Estado que sólo podía dejar el candidato de la ronda 1: dos uniones concurrentes al mismo destino, igual reloj/usuario/acción.
  const docs=mundoManual();
  docs.find(d=>d.id==='X').negocioManual=marca('op-a',{motivo:'primera'});docs.find(d=>d.id==='X-1').negocioManual=marca('op-a',{motivo:'primera'});
  docs.find(d=>d.id==='Z').negocioManual=marca('op-b',{motivo:'segunda'});
  const f=fbManual(docs);const ctx=ctxR3(docs);const {c}=ctx;c.window={fb:f.fb};
  const o=plain(c.operacionesManuales(c.proyeccionNegocios().porNegocio.get('Q')));
  assert.deepEqual(o.map(x=>[x.docs,x.motivo]),[[['X','X-1'],'primera'],[['Z'],'segunda']],'dos operaciones, no una');
  assert.ok(o[0].clave!==o[1].clave);
  const html=fichaDe(ctx,'Q');assert.equal([...html.matchAll(/data-r1="deshacer"/g)].length,2,'un botón por operación');
  ctx.motivo='Fue un error';await c.pedirDeshacerR1(o[1].clave);
  assert.deepEqual(f.lecturas,['quotes/Z'],'sólo relee los documentos de esa operación');
  assert.deepEqual(f.escrituras.map(e=>[e.ref,e.patch.negocioManual]),[['quotes/Z',null]]);
  assert.equal(f.store.get('quotes/X').negocioManual.opId,'op-a','la otra operación queda intacta');
  assert.deepEqual(grupos(c).Q,['Q','Q-1','Q-2','X','X-1']);assert.deepEqual(grupos(c).Z,['Z']);
  // Abortar si un documento ya no tiene ese opId (otra sesión lo cambió), aunque el resto de la marca sea igual.
  const d2=mundoManual();for(const id of ['X','X-1'])d2.find(d=>d.id===id).negocioManual=marca('op-a');
  const f2=fbManual(d2,{antesDeTx:s=>{s.get('quotes/X-1').negocioManual=marca('op-c')}});const c2=ctxR3(d2);c2.c.window={fb:f2.fb};
  const k=c2.c.operacionesManuales(c2.c.proyeccionNegocios().porNegocio.get('Q'))[0].clave;
  await assert.rejects(c2.c.deshacerAjusteManual('Q',k,'Fue un error'),e=>e.paraUsuario&&/ya no tiene ese ajuste manual/.test(e.message));
  assert.equal(f2.escrituras.length,0);assert.equal(d2.find(d=>d.id==='X').negocioManual.opId,'op-a','la caché no cambia');
  // Documentos sin opId (sólo datos del candidato de la ronda 1): cada uno es su propia operación.
  const d3=mundoManual();for(const id of ['X','X-1'])d3.find(d=>d.id===id).negocioManual={businessId:'Q',accion:'unir',motivo:'m',usuario:'u',at:'t'};
  const f3=fbManual(d3);const c3=ctxR3(d3);c3.c.window={fb:f3.fb};
  const o3=plain(c3.c.operacionesManuales(c3.c.proyeccionNegocios().porNegocio.get('Q')));
  assert.deepEqual(o3.map(x=>x.docs),[['X'],['X-1']]);
  await c3.c.deshacerAjusteManual('Q',o3[1].clave,'Fue un error');
  assert.deepEqual(f3.escrituras.map(e=>[e.ref,e.patch.negocioManual]),[['quotes/X-1',null]]);assert.ok(f3.store.get('quotes/X').negocioManual);
});
await test('T3 I2/I3 un negocio con cualquier ajuste manual (origen, destino, otra rama o lo que quedó) no admite otra operación hasta deshacerla',async()=>{
  const docs=mundoManual();const f=fbManual(docs);const ctx=ctxR3(docs);const {c}=ctx;c.window={fb:f.fb};
  await c.unirNegocios('X','Q','Mismo evento');const n=f.escrituras.length;
  await assert.rejects(c.unirNegocios('Z','Q','Mismo evento',{clientesDistintos:true}),e=>e.paraUsuario&&/deshaz/i.test(e.message),'unir X→Q y luego Z→Q');
  await assert.rejects(c.unirNegocios('Q','Z','Mismo evento',{clientesDistintos:true}),e=>e.paraUsuario&&/deshaz/i.test(e.message));
  for(const id of ['Q-1','Q-2','X-1'])await assert.rejects(c.separarDocumento('Q',id,'Otro evento'),e=>e.paraUsuario&&/deshaz/i.test(e.message),'separar '+id);
  assert.equal(f.escrituras.length,n,'ninguna escribe');
  const html=fichaDe(ctx,'Q');assert.ok(!/data-r1="(separar|unir)"/.test(html),'la ficha no ofrece separar ni unir');assert.match(html,/data-r1="deshacer"/);
  assert.equal((html.match(/Unido a mano: /g)||[]).length,1,'la historia muestra una línea por operación, no una por documento');
  // Marcar el destino no le quita sus motivos de ambigüedad: sólo lo que se movió deja de calificar el negocio.
  const d0=mundoManual();d0.find(d=>d.id==='Q-1').businessId='OTRO';const f0=fbManual(d0);const c0=ctxR3(d0).c;c0.window={fb:f0.fb};
  assert.deepEqual(plain(c0.proyeccionNegocios().porNegocio.get('Q').motivos),['businessId_en_conflicto']);
  await c0.unirNegocios('X','Q','Mismo evento');
  assert.ok(c0.proyeccionNegocios().porNegocio.get('Q').motivos.includes('businessId_en_conflicto'),'el destino sigue ambiguo');
  // Separar deja la marca también en lo que queda: ni unir a lo que queda ni a lo que salió.
  const d2=mundoManual();const f2=fbManual(d2);const c2=ctxR3(d2).c;c2.window={fb:f2.fb};
  await c2.separarDocumento('Q','Q-1','Q-1 es otro evento');
  for(const [o,d] of [['X','Q'],['X','Q-1']])await assert.rejects(c2.unirNegocios(o,d,'Mismo evento'),e=>e.paraUsuario&&/deshaz/i.test(e.message),o+'→'+d);
  await assert.rejects(c2.separarDocumento('Q-1','Q-2','Otra vez'),e=>e.paraUsuario&&/deshaz/i.test(e.message));
  assert.equal(f2.escrituras.length,3);
  // Datos del candidato de la ronda 1 (sólo el origen marcado): separar una rama limpia del destino también se rechaza.
  const d3=mundoManual();for(const id of ['X','X-1'])d3.find(d=>d.id===id).negocioManual={businessId:'Q',accion:'unir',motivo:'m',usuario:'u',at:'t'};
  const f3=fbManual(d3);const c3=ctxR3(d3).c;c3.window={fb:f3.fb};
  await assert.rejects(c3.separarDocumento('Q','Q-1','Otro evento'),e=>e.paraUsuario&&/deshaz/i.test(e.message),'separar una rama limpia de un negocio con otra rama ajustada');
  await assert.rejects(c3.unirNegocios('Z','Q','Mismo evento',{clientesDistintos:true}),e=>e.paraUsuario&&/deshaz/i.test(e.message));
  assert.equal(f3.lecturas.length+f3.escrituras.length,0,'se rechaza antes de abrir la transacción');
});
await test('T3 I3/I4 carrera entre dos sesiones: la segunda operación sobre un negocio ya ajustado aborta dentro de la transacción (caché vieja), sin escribir',async()=>{
  const casos=[
    ['unir X→Q, luego Z→Q',c=>c.unirNegocios('X','Q','Mismo evento'),c=>c.unirNegocios('Z','Q','Mismo evento',{clientesDistintos:true})],
    ['unir X→Q, luego separar Q-1',c=>c.unirNegocios('X','Q','Mismo evento'),c=>c.separarDocumento('Q','Q-1','Otro evento')],
    ['unir X→Q, luego Q→Z',c=>c.unirNegocios('X','Q','Mismo evento'),c=>c.unirNegocios('Q','Z','Mismo evento',{clientesDistintos:true})],
    ['separar Q-2, luego separar Q-1',c=>c.separarDocumento('Q','Q-2','Otro evento'),c=>c.separarDocumento('Q','Q-1','Otro evento')],
    ['separar Q-2, luego unir X→Q',c=>c.separarDocumento('Q','Q-2','Otro evento'),c=>c.unirNegocios('X','Q','Mismo evento')]
  ];
  for(const [nombre,primera,segunda] of casos){
    const da=mundoManual(),db=mundoManual(); // cada sesión con su caché; la misma base
    const f=fbManual(da);const A=ctxR3(da).c,B=ctxR3(db).c;A.window={fb:f.fb};B.window={fb:f.fb};
    B.proyeccionNegocios(); // la sesión B ya había leído la caché
    await primera(A);const n=f.escrituras.length;
    await assert.rejects(segunda(B),e=>e.paraUsuario&&/ya tiene un ajuste manual de otra sesión/.test(e.message),nombre);
    assert.equal(f.escrituras.length,n,nombre+': no escribe');
    assert.ok(db.every(d=>d.negocioManual===undefined),nombre+': la caché de B no cambia');
  }
});
await test('T3 I6 separar recorre los descendientes con los mismos enlaces que el resolvedor, en sus dos direcciones (supersededBy, propFinalRef, supersedes, sourceProposal, parentQuote)',async()=>{
  const docs=[
    {id:'A',kind:'quote',status:'superseded',supersededBy:'B',client:'Ana',dateLocal:'2026-09-01',total:1},
    {id:'B',kind:'quote',status:'superseded',parentQuote:'A',supersededBy:'C',client:'Ana',dateLocal:'2026-09-02',total:1},
    {id:'C',kind:'quote',status:'enviada',client:'Ana',dateLocal:'2026-09-03',total:1} // sin parentQuote: sólo B lo nombra
  ];
  const f=fbManual(docs);const ctx=ctxR3(docs);const {c}=ctx;c.window={fb:f.fb};
  assert.deepEqual(grupos(c),{A:['A','B','C']});
  const n=c.proyeccionNegocios().porNegocio.get('A');
  assert.deepEqual(plain(c._negDescendientes(n,n.documentos.find(d=>d.id==='B')).map(d=>d.id)),['B','C']);
  fichaDe(ctx,'A');ctx.motivo='B y C son otro evento';await c.pedirSepararR1('B');
  assert.match(ctx.modales.at(-1).body,/<strong>B, C<\/strong>/,'la ventana dice todo lo que sale');
  assert.deepEqual(f.escrituras.map(e=>[e.ref,e.patch.negocioManual.businessId]),[['quotes/B','B'],['quotes/C','B'],['quotes/A','A']]);
  assert.deepEqual(grupos(c),{A:['A'],B:['B','C']});
  const pf=[
    {id:'P0',kind:'proposal',status:'superseded',supersededBy:'P1',client:'Dora',dateLocal:'2026-09-01'},
    {id:'P1',kind:'proposal',status:'convertida',parentQuote:'P0',propFinalRef:'GB-PF-1',client:'Dora',dateLocal:'2026-09-02'},
    {id:'GB-PF-1',kind:'proposal',_isPF:true,status:'superseded',client:'Dora',dateLocal:'2026-09-03'}, // sólo P1 la nombra
    {id:'GB-PF-2',kind:'proposal',_isPF:true,status:'propfinal',supersedes:'GB-PF-1',client:'Dora',dateLocal:'2026-09-04'}, // sólo nombra a la que reemplaza
    {id:'GB-PF-3',kind:'proposal',_isPF:true,status:'propfinal',sourceProposal:'P1',client:'Dora',dateLocal:'2026-09-05'}, // sólo nombra su propuesta
    {id:'QX',kind:'quote',status:'enviada',client:'Dora',dateLocal:'2026-09-06',supersedes:'P0'} // cuelga de P0, no de P1
  ];
  const {c:cp}=ctxR3(pf);const np=cp.proyeccionNegocios().negocios.find(x=>x.documentos.some(d=>d.id==='P0'));
  assert.equal(np.documentos.length,6);
  const des=id=>plain(cp._negDescendientes(np,np.documentos.find(d=>d.id===id)).map(d=>d.id)).sort();
  assert.deepEqual(des('P1'),['GB-PF-1','GB-PF-2','GB-PF-3','P1']);
  assert.deepEqual(des('GB-PF-1'),['GB-PF-1','GB-PF-2']);
  assert.deepEqual(des('QX'),['QX'],'nunca sube al padre');
  // Si los enlaces llevan de vuelta al origen, separar arrastraría todo: se rechaza.
  const ciclo=[{id:'K',kind:'quote',status:'superseded',supersededBy:'K-1',client:'K',dateLocal:'2026-09-01'},{id:'K-1',kind:'quote',status:'enviada',parentQuote:'K',supersededBy:'K',client:'K',dateLocal:'2026-09-02'}];
  const fk=fbManual(ciclo);const ck=ctxR3(ciclo);ck.c.window={fb:fk.fb};
  assert.ok(!/data-r1="separar"/.test(fichaDe(ck,'K')),'no se ofrece');
  await assert.rejects(ck.c.separarDocumento('K','K-1','Otro evento'),e=>e.paraUsuario&&/igual/.test(e.message));
  assert.equal(fk.escrituras.length,0);
});
await test('T3 reporte de negocios ambiguos (Herramientas): enlace roto, ciclo y businessId en conflicto, con sus documentos; unir sólo para quien escribe',()=>{
  const docs=[...mundoR1(),
    {id:'CA',kind:'quote',status:'superseded',parentQuote:'CB',supersededBy:'CB',client:'Ciclo'},{id:'CB',kind:'quote',status:'superseded',parentQuote:'CA',supersededBy:'CA',client:'Ciclo'},
    {id:'K',kind:'quote',status:'superseded',supersededBy:'K-1',businessId:'K',client:'Conflicto'},{id:'K-1',kind:'quote',status:'enviada',parentQuote:'K',businessId:'OTRO',client:'Conflicto'}];
  const {c}=ctxR3(docs,{curMode:'herr-ambiguos'});
  c.renderMode('herr-ambiguos');
  const html=c.$('mode-herr-ambiguos').innerHTML;
  const filas=[...html.matchAll(/<div class="r1-fila r1-incompleta" data-negocio="([^"]+)">/g)].map(m=>m[1]);
  assert.deepEqual(filas.sort(),plain(c.proyeccionNegocios().negocios.filter(n=>n.nivel==='ambiguo').map(n=>n.businessId)).sort());
  assert.ok(filas.includes('R1-1')&&filas.includes('K')&&filas.some(b=>b==='CA'||b==='CB'));
  for(const t of ['Enlace roto','Ciclo','businessId en conflicto','R1-1','CA','CB','K-1'])assert.ok(html.includes(t),t);
  assert.match(html,/data-r1="ficha" data-negocio="K"/);assert.match(html,/data-r1="unir" data-negocio="K"/);
  const {c:ro}=ctxR3(docs,{escribe:false,curMode:'herr-ambiguos'});ro.renderMode('herr-ambiguos');
  assert.ok(!/data-r1="unir"/.test(ro.$('mode-herr-ambiguos').innerHTML)&&/data-r1="ficha"/.test(ro.$('mode-herr-ambiguos').innerHTML));
  const idx=source('index.html');
  assert.match(idx,/<a href="javascript:void\(0\)" data-sub="herr\/negocios-ambiguos" hidden>Negocios ambiguos<\/a>/);
  assert.ok(/'herr\/negocios-ambiguos':\s*'herr-ambiguos'/.test(idx)&&/'herr-ambiguos':\s*'herr\/negocios-ambiguos'/.test(idx));
  assert.ok(/negocios-ambiguos/.test(functionSource('app-negocios.js','iniciarRedisenoR1')),'la entrada sólo se muestra con la bandera');
});
await test('T3 sólo lectura: ve la ficha y el reporte sin botones de escritura (sólo estado de cuenta y PDFs)',()=>{
  const docs=[...mundoR3(),{id:'PD',kind:'quote',status:'pedido',client:'Con PDF',dateLocal:'2026-09-06',eventDate:'2026-10-30',total:10,pdfHistorial:[{version:1,url:'u'}]}];
  for(const escribe of [true,false]){
    const ctx=ctxR3(docs,{escribe,empresa:true});const {c,llamadas}=ctx;
    let html='';for(const n of c.proyeccionNegocios().negocios)html+=fichaDe(ctx,n.businessId);
    const acciones=new Set([...html.matchAll(/data-r1="ficha-accion" data-accion="([a-z_]+)"/g)].map(m=>m[1]));
    if(escribe){for(const a of ['editar','pago','unir'].slice(0,2))assert.ok(acciones.has(a),a);assert.match(html,/data-r1="unir"/);assert.match(html,/data-r1="separar"/);assert.match(html,/data-r1="accion"/)}
    else{
      assert.deepEqual([...acciones].sort(),['cuenta_pdf','cuenta_wa','pdfs']);
      assert.ok(!/data-r1="(accion|unir|separar|deshacer)"/.test(html),'sin botones de escritura');
      assert.match(html,/Dinero Uno/);
      llamadas.length=0;fichaDe(ctx,'D2');c.accionR1({r1:'ficha-accion',accion:'pago'});c.accionR1({r1:'unir',negocio:'D2'});
      assert.ok(!llamadas.some(l=>l[0]!=='setMode'),'ninguna acción de escritura se abre');assert.equal(c.curMode,'ficha');
    }
  }
});
await test('T3 arreglo de T2: repintar Negocios por una escritura en segundo plano no rehace la caja (conserva foco, texto del buscador y página)',()=>{
  const docs=sinteticos(300);
  const {c}=ctxR3(docs);
  let rehechas=0,inner='';const box=c.$('mode-negocios');
  Object.defineProperty(box,'innerHTML',{get:()=>inner,set:v=>{rehechas++;inner=v}});
  estadoR1(c).filtro.chip=null;c.renderMode('negocios');assert.equal(rehechas,1);
  const input=c.$('r1-neg-buscar');input.value='GB-2026-001';estadoR1(c).filtro.texto='GB-2026-001';estadoR1(c).filtro.pagina=2;
  c.quotesCache.push({id:'GB-2026-00199',kind:'quote',status:'enviada',client:'Nuevo',dateLocal:'2026-09-29',total:5});
  c.refrescarVistasR1(); // lo que corre cuando termina una escritura en segundo plano
  assert.equal(rehechas,1,'la caja (y el buscador con el foco) no se rehace');
  assert.equal(input.value,'GB-2026-001');assert.equal(estadoR1(c).filtro.texto,'GB-2026-001');assert.equal(estadoR1(c).filtro.pagina,2);
  assert.match(c.$('r1-neg-lista').innerHTML,/GB-2026-00199/,'la lista sí muestra el dato nuevo');
  c.renderMode('inicio');c.accionR1({r1:'cuadro',cuadro:'cotizado'});
  assert.equal(rehechas,1);assert.equal(input.value,'','navegar desde un cuadro limpia el buscador');
});
await test('T3 HTML de ficha, reporte, unir y chips: datos escapados (cliente, ids, pagos, notas, motivos) y sin on*=',()=>{
  const X='<img src=x onerror=alert(1)>"\'';
  const docs=mundoR1();
  Object.assign(docs.find(d=>d.id==='Q8'),{client:X,quoteNumber:'N"><b>x</b>',tel:X,dir:X,city:X,horaEntrega:X,notasSeguimiento:[{fecha:'2026-09-20',texto:X}],pagos:[{fecha:X,monto:'5" onmouseover="x',metodo:X,tipo:X}],
    cargos:[{monto:'7" y'}],ajustes:[{monto:'abc'}],despachos:[{fechaHora:X,direccion:X,status:X}],cart:[{n:X,qty:X}]});
  Object.assign(docs.find(d=>d.id==='C1'),{proximoContacto:{fecha:'2999-01-01',nota:X}});
  docs.push({id:'Y" onmouseover="alert(1)',kind:'quote',status:'enviada',client:X,dateLocal:'2026-09-02',total:30,negocioManual:{businessId:'Y" onmouseover="alert(1)',accion:'separar',motivo:X,usuario:X,at:X}});
  const ctx=ctxR3(docs,{empresa:true});const {c}=ctx;
  let todo='';
  for(const n of c.proyeccionNegocios().negocios)todo+=fichaDe(ctx,n.businessId);
  assert.match(todo,/data-r1="deshacer" data-clave="/);
  c.renderMode('herr-ambiguos');todo+=c.$('mode-herr-ambiguos').innerHTML;
  c.accionR1({r1:'unir',negocio:'Q8'});todo+=c.$('r1-neg-unir').innerHTML+c.$('r1-neg-lista').innerHTML;
  c.$('pm-metodo').options=[{value:X,textContent:X}];c.$('pm-metodo').value=X;c.pintarChipsMetodoR1();todo+=c.$('pm-metodo-chips').innerHTML;
  assert.ok(!/<img|<b>/.test(todo),'sin marcado del usuario');
  assert.ok(!onAttr(todo),'sin on*=');
  assert.ok(!/NaN/.test(todo),'sin $NaN');
  assert.ok(todo.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;'));
  assert.ok(todo.includes('data-negocio="Y&quot; onmouseover=&quot;alert(1)"'));
});
await test('T3 «Qué lleva»: la misma función que la tarjeta de Seguimiento (productos de la cotización y secciones de la propuesta), escapada en los dos lados',()=>{
  const c=loadSourceFunctions([['app-seguimiento.js','resumenProductos']],{});
  assert.equal(c.resumenProductos({kind:'quote',cart:[{n:'Empanadas',qty:50},{n:'Tequeños',qty:30}],cust:[{n:'Torta',qty:1},{n:'Extra',qty:2}]}),'Empanadas ×50, Tequeños ×30, Torta ×1...');
  assert.equal(c.resumenProductos({kind:'proposal',sections:[{name:'Entradas'},{name:'Fuertes'},{name:'Postres'}]}),'Entradas · Fuertes · +1 más');
  assert.equal(c.resumenProductos({kind:'quote',items:[{name:'Viejo',qty:2}]}),'Viejo ×2','documentos viejos con items');
  assert.equal(c.resumenProductos({kind:'quote'}),'');
  assert.ok(/h\(resumenProductos\(q\)\)/.test(functionSource('app-seguimiento.js','renderSegCard')),'la tarjeta de Seguimiento la usa escapada');
  assert.ok(/resumenProductos\(/.test(functionSource('app-negocios.js','_r1HtmlFicha')));
});

// ═══ v8.0.0 (tramo 4): ajustes del recorrido y de la prueba de Kathy ═══
await test('T4 ficha: la acción principal nunca se repite como secundaria, para cada acción principal posible',()=>{
  const docs=[...mundoR3(),{id:'EN',kind:'quote',status:'pedido',produced:true,client:'Entrega',dateLocal:'2026-09-06',eventDate:'2026-10-30',total:10}];
  const esperado={C1:'pedido',P1:'pf',P2:'aprobar',Q5:'listo',EN:'entregar',Q8:'pago',Q9:'fe'};
  const ctx=ctxR3(docs,{empresa:true});const {c,llamadas}=ctx;
  const vistas=new Set();
  const norm=s=>s.replace(/<[^>]*>/g,'').replace(/[^\p{L}\s]/gu,'').trim().toLowerCase();
  for(const n of c.proyeccionNegocios().negocios){ // cualquier negocio: también los que no están en «esperado»
    const html=fichaDe(ctx,n.businessId),bot=html.slice(html.indexOf('class="r1-ficha-botones"'),html.indexOf('class="r1-ficha-sec"'));
    const acciones=[...bot.matchAll(/data-accion="([a-z_]+)"/g)].map(m=>m[1]),etiquetas=[...bot.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m=>norm(m[1]));
    assert.equal(new Set(acciones).size,acciones.length,n.businessId+': acción repetida '+acciones.join(','));
    assert.equal(new Set(etiquetas).size,etiquetas.length,n.businessId+': botón repetido '+etiquetas.join(' | '));
    if(n.accion){vistas.add(n.accion);assert.ok(new RegExp('data-r1="accion" data-accion="'+n.accion+'"').test(bot),n.businessId+': la principal sigue')}
  }
  for(const [bid,a] of Object.entries(esperado)){fichaDe(ctx,bid);assert.equal(c.negocioDeFicha().accion,a,bid)}
  const posibles=Object.keys(vm.runInContext('ACCIONES_R1',c)).filter(k=>k!=='contactado'); // «contactado» sólo sale en avisos, nunca como próxima acción
  assert.deepEqual([...vistas].sort(),[...posibles].sort(),'se probó cada acción principal posible');
  // La regla es general: una clave compartida abre el mismo flujo en las dos tablas, y ninguna otra acción de la ficha abre el flujo de una principal.
  const abre=(tabla,k)=>{llamadas.length=0;tabla[k].abrir('X','quote');return llamadas[0]&&llamadas[0][0]};
  const principal=Object.fromEntries(Object.keys(vm.runInContext('ACCIONES_R1',c)).map(k=>[k,abre(vm.runInContext('ACCIONES_R1',c),k)]));
  for(const k of Object.keys(vm.runInContext('ACCIONES_FICHA_R1',c))){
    const f=abre(vm.runInContext('ACCIONES_FICHA_R1',c),k);
    if(k in principal)assert.equal(f,principal[k],k+': misma clave, mismo flujo');
    else assert.ok(!Object.values(principal).includes(f),k+' abre el flujo de una acción principal con otra clave');
  }
  fichaDe(ctx,'Q9');llamadas.length=0;c.accionR1({r1:'accion',accion:'fe',id:'Q9',kind:'quote'});
  assert.deepEqual(llamadas[0],['openFeModal','Q9','quote'],'«Registrar FE» se sigue abriendo desde la principal');
});
// El bloque D5 del encabezado (index.html) corre en un contexto propio con un DOM mínimo.
function encabezadoD5(flag){
  const html=source('index.html'),i=html.indexOf('// v7.0-α · Bloque D5');
  const code=html.slice(html.lastIndexOf('<script>',i)+8,html.indexOf('</script>',i));
  let visible='',marcado='',load=null;
  const crumb={set innerHTML(v){marcado=v;visible=v.replace(/<[^>]*>/g,'')},get innerHTML(){return marcado},set textContent(v){marcado=null;visible=String(v)}};
  const el={dataset:{},setAttribute(){},getAttribute(){return null},addEventListener(){}};
  const document={querySelector:s=>s==='.hdr'?{querySelector:()=>crumb,insertBefore(){}}:null,querySelectorAll:()=>[],getElementById:()=>el,body:{classList:{add(){},toggle(){}}}};
  const window={setMode(){},addEventListener:(t,f)=>{if(t==='load')load=f}};
  vm.runInNewContext(code,{window,document,localStorage:{getItem:()=>null},console:quiet,setTimeout,...(flag===undefined?{}:{GB_REDISENO_R1:flag})});
  load();
  return m=>{window.setMode(m);return {visible,marcado}};
}
await test('T4 encabezado: las vistas nuevas con título en mayúscula y la forma de los viejos; los títulos viejos no cambian',()=>{
  const ir=encabezadoD5();
  assert.deepEqual(ir('inicio'),{visible:'Inicio',marcado:'<span class="crumb-current">Inicio</span>'});
  assert.deepEqual(ir('negocios'),{visible:'Negocios',marcado:'<span class="crumb-current">Negocios</span>'});
  assert.equal(ir('ficha').visible,'Negocios·Negocio');assert.match(ir('ficha').marcado,/^<span class="crumb-mod">Negocios<\/span><span class="crumb-sep">·<\/span><span class="crumb-current">Negocio<\/span>$/);
  assert.equal(ir('herr-ambiguos').visible,'Herramientas·Negocios ambiguos');
  // Bandera apagada: esas tres vistas no existen (la app no navega a ellas) y los títulos viejos quedan igual.
  for(const [m,t] of [['dash','Inicio·Dashboard'],['seg','Inicio·Tareas y follow-ups'],['cot','Cotizaciones·Nueva cotización'],['clientes-ficha','Clientes·Directorio'],['backup','Herramientas·Mantenimiento y backups']])assert.equal(ir(m).visible,t,m);
  assert.deepEqual(ir('modo-sin-titulo'),{visible:'modo-sin-titulo',marcado:null},'un modo sin título sigue mostrando su nombre');
  const {c,els}=ctxR1(mundoR1(),{flag:false,curMode:'dash'});
  assert.equal(c.iniciarRedisenoR1(),false);assert.equal(c.curMode,'dash');assert.equal(els['r1-menu'],undefined);
});
await test('T4b encabezado: con la bandera, ningún título dice «Inicio» salvo el Inicio nuevo; el Tablero anterior dice lo mismo que el menú',()=>{
  const idx=source('index.html'),legado=idx.slice(idx.indexOf('var LEGACY_TO_SUB = {'),idx.indexOf('};',idx.indexOf('var LEGACY_TO_SUB = {')));
  const modos=[...legado.matchAll(/'([\w-]+)':\s*'([\w/-]+)'/g)].map(m=>m[1]).concat(['inicio','negocios','ficha']);
  assert.ok(modos.length>=35,'se encontraron los modos ('+modos.length+')');
  const on=encabezadoD5(true);
  for(const m of modos)if(m!=='inicio')assert.ok(!/^Inicio/.test(on(m).visible),m+' dice «'+on(m).visible+'»');
  assert.equal(on('inicio').visible,'Inicio');
  assert.deepEqual(on('dash'),{visible:'Tablero·Tablero anterior',marcado:'<span class="crumb-mod">Tablero</span><span class="crumb-sep">·</span><span class="crumb-current">Tablero anterior</span>'});
  assert.equal(on('seg').visible,'Tablero·Tareas y follow-ups');assert.equal(on('cal').visible,'Tablero·Agenda');
  assert.equal(on('cot').visible,'Cotizaciones·Nueva cotización','los demás módulos no cambian');
  // Bandera apagada (o sin definir): sin cambio.
  for(const off of [encabezadoD5(false),encabezadoD5()])for(const [m,t] of [['dash','Inicio·Dashboard'],['seg','Inicio·Tareas y follow-ups'],['cal','Inicio·Agenda']])assert.equal(off(m).visible,t,m);
});
await test('T4 botón «+»: cualquier modal u hoja inferior queda encima; sigue encima de la barra inferior y de la barra de cotizar, que no tapa',()=>{
  const idx=source('index.html'),todo=idx+readdirSync(new URL('..',import.meta.url)).filter(f=>/^app-.*\.js$/.test(f)).map(f=>source(f)).join('\n');
  const fab=Number(idx.match(/\.m-fab\{[^}]*z-index:(\d+)/)[1]);
  const modales=[...todo.matchAll(/position:fixed;(?:inset:0|top:0;left:0;right:0;bottom:0);background:rgba\(0,\s*0,\s*0,\s*[.\d]+\);z-index:(\d+)/g)].map(m=>Number(m[1]));
  modales.push(Number(idx.match(/#doc-preview-modal\{z-index:(\d+)\}/)[1]),Number(idx.match(/\.modal-overlay\{[^}]*z-index:(\d+)/)[1]),Number(idx.match(/\.sheet\{[^}]*z-index:(\d+)/)[1]));
  assert.ok(modales.length>=15,'se encontraron los modales ('+modales.length+')');
  for(const z of modales)assert.ok(fab<z,'el «+» ('+fab+') queda debajo del modal ('+z+')');
  assert.ok(fab>Number(idx.match(/\.r1-barra\{[^}]*z-index:(\d+)/)[1]),'encima de la barra inferior de R1');
  assert.ok(fab>Number(idx.match(/\.cbar\{[^}]*z-index:(\d+)/)[1]),'encima de la barra de cotizar, como antes');
  assert.match(idx,/body\.r1-con-barra \.m-fab\{bottom:calc\(76px \+ env\(safe-area-inset-bottom,0\)\)\}/,'con la barra de R1 el «+» sube y no la tapa');
  assert.match(idx,/<button class="m-fab" id="gb-fab-btn" aria-label="Crear" type="button">/,'el botón sigue');
});
await test('v8.0.4 «+ Crear» en el computador: abre la misma hoja; el «+» flotante sigue sólo en el teléfono',()=>{
  const idx=source('index.html');
  assert.match(idx,/<nav class="gb-shell-sidebar__nav">\s*<!--[^>]*-->\s*<button class="gb-shell-sidebar__item gb-crear-btn" id="gb-crear-btn"/,'primero del menú lateral');
  assert.match(idx,/getElementById\('gb-crear-btn'\);[^\n]*\n\s*if\(crear\)crear\.addEventListener\('click',openSheet\)/,'abre la hoja Crear');
  assert.match(idx,/@media \(min-width:1024px\)\{\.m-fab\{display:none!important\}\}/,'en el computador se oculta sólo el «+» flotante');
  assert.ok(!/@media \(min-width:1024px\)\{[^}]*\.sheet[,{]/.test(idx),'la hoja ya no se oculta en el computador');
  assert.match(idx,/@media \(max-width:1023px\)\{ \.gb-crear-btn \{ display: none !important; \} \}/,'en el teléfono no se duplica');
});
await test('v8.0.5 la hoja Crear cerrada no recibe clics y «Nueva cotización/propuesta» empieza un documento vacío',async()=>{
  const idx=source('index.html');
  // En 768 px o más la hoja cerrada sólo era transparente (opacity:0) y, con z-index 1501, se robaba los clics
  // de los botones de abajo a la derecha, también dentro de las ventanas (revisión integral de la v8.0.4).
  const cerrada=idx.match(/\n\.sheet:not\(\.is-open\)\{([^}]*)\}/);
  assert.ok(cerrada,'hay regla para la hoja cerrada');
  assert.match(cerrada[1],/pointer-events:none/,'cerrada no recibe clics');
  assert.match(cerrada[1],/visibility:hidden/,'cerrada no se ve ni se alcanza con el teclado');
  assert.match(cerrada[1],/visibility 0s \.3s/,'se oculta al terminar la animación de cierre');
  assert.ok(idx.indexOf(cerrada[0])>idx.indexOf('@media (min-width:768px){.sheet{'),'va después de la regla del computador');
  assert.ok(!/\.sheet\{[^}]*pointer-events:auto/.test(idx),'ninguna regla de .sheet devuelve los clics a la hoja cerrada');
  // Antes «Nueva» sólo cambiaba de modo y dejaba cargado el documento anterior (se podía guardar encima de un pedido).
  assert.match(idx,/if\(action==='cot'&&typeof window\.nuevaCotizacion==='function'\)window\.nuevaCotizacion\(\);/,'hoja Crear: Nueva cotización');
  assert.match(idx,/else if\(action==='prop'&&typeof window\.nuevaPropuesta==='function'\)window\.nuevaPropuesta\(\);/,'hoja Crear: Nueva propuesta');
  assert.match(idx,/if \(key === 'ventas\/cotizar'\) window\.nuevaCotizacion\(\);\s*else if \(key === 'ventas\/propuesta'\) window\.nuevaPropuesta\(\);\s*else window\.setMode\(legacy\);/,'menú lateral: Nueva cotización/propuesta');
  assert.match(idx,/<button onclick="nuevaCotizacion\(\)"[^>]*>\s*<div[^>]*>📋/,'selector «Nueva venta»: Cotización');
  assert.match(idx,/<button onclick="nuevaPropuesta\(\)"[^>]*>\s*<div[^>]*>🎪/,'selector «Nueva venta»: Evento');
  assert.ok(!/onclick="setMode\('(cot|prop)'\)"/.test(idx),'ningún botón entra al editor sin pasar por «Nueva»');
  // Pregunta antes de cambiar de modo (Codex v8.0.5): aceptar → documento vacío; cancelar → al editor con lo que había,
  // sin tocarlo si ya se estaba en él (el pedido directo no se apaga).
  for(const [fn,nuevo,modo] of [['nuevaCotizacion','newQuote','cot'],['nuevaPropuesta','newProp','prop']]){
    for(const [acepta,desde,esperado] of [[true,'clientes-directorio',[modo]],[true,modo,[modo]],[false,'clientes-directorio',[modo]],[false,modo,[]]]){
      const modos=[];const c=vm.createContext({setMode:m=>modos.push(m),curMode:desde,[nuevo]:async()=>acepta});
      vm.runInContext(functionSource('app-core.js',fn),c);
      await vm.runInContext(fn+'()',c);
      assert.deepEqual(modos,esperado,fn+' acepta='+acepta+' desde '+desde);
    }
  }
  // «Nueva cotización» pregunta si el formulario ya no es el vacío aunque no tenga productos (Codex v8.0.5 r2).
  const preguntas=async({form,vacia,num=null,items=0,cli=''})=>{
    const c=vm.createContext({window:{_gbCotVacia:vacia},currentQuoteNumber:num,allIt:()=>Array(items),
      $:id=>({value:id==='f-cli'?cli:'',classList:{add(){}}}),formularioCotizacion:()=>form,
      gbStableJson:v=>JSON.stringify(v),cargarCotizacionEnEditor(){},go(){},n:0});
    c.confirmModal=async()=>{c.n++;return true};
    for(const f of ['firmaFormularioCotizacion','newQuote'])vm.runInContext(functionSource('app-core.js',f),c);
    await vm.runInContext('newQuote()',c);return c;
  };
  const vacio={client:'Sin nombre',eventDate:'',notasInternas:''};
  assert.equal((await preguntas({form:vacio,vacia:JSON.stringify(vacio)})).n,0,'formulario vacío: no pregunta');
  assert.equal((await preguntas({form:{...vacio,notasInternas:'sin gluten'},vacia:JSON.stringify(vacio)})).n,1,'sólo notas: pregunta');
  assert.equal((await preguntas({form:{...vacio,eventDate:'2026-10-20'},vacia:JSON.stringify(vacio)})).n,1,'sólo fecha: pregunta');
  assert.equal((await preguntas({form:vacio,vacia:JSON.stringify(vacio),num:'GB-1'})).n,1,'documento cargado: pregunta');
  assert.equal((await preguntas({form:vacio,vacia:undefined,cli:'Ana'})).n,1,'sin foto del vacío: el cliente escrito basta');
  assert.equal((await preguntas({form:vacio,vacia:undefined})).n,0,'sin foto y sin cliente: no pregunta');
  assert.equal((await preguntas({form:vacio,vacia:JSON.stringify(vacio)})).window._gbCotVacia,JSON.stringify(vacio),'al empezar guarda la foto del vacío');
  assert.match(functionSource('app-core.js','initApp'),/^async function initApp\(\)\{\s*\/\/[^\n]*\n\s*if\(window\._gbCotVacia===undefined\)window\._gbCotVacia=firmaFormularioCotizacion\(\);\s*showLoader\(/,'la foto del vacío se toma al arrancar, antes de lo que puede fallar y una sola vez');
  // Las notas por defecto que agrega el paso «③ Cotización» no cuentan como datos escritos (Codex r3).
  {const c=vm.createContext({notas:[],gbStableJson:v=>JSON.stringify(v)});
   c.formularioCotizacion=()=>({notasCotLista:c.notas});c.initNotasCot=()=>{if(!c.notas.length)c.notas=['nota por defecto']};
   vm.runInContext(functionSource('app-core.js','firmaFormularioCotizacion'),c);
   const antes=vm.runInContext('firmaFormularioCotizacion()',c);c.notas=[];c.initNotasCot();
   assert.equal(vm.runInContext('firmaFormularioCotizacion()',c),antes,'visitar ③ Cotización no cambia la firma');}
  // La propuesta nueva nace con la «Opción A» llena con el menaje por defecto (antes quedaba vacía).
  const npx=functionSource('app-core.js','newProp');
  assert.match(npx,/menajeOptions=\[\{id:"opA_"\+Date\.now\(\),label:"Opción A",items:DEFAULT_MENAJE\.map\(/,'Opción A con el menaje por defecto');
  assert.match(npx,/_syncActiveMenajeRefs\(\);/);
  const np=functionSource('app-core.js','newProp');
  assert.match(np,/if\(!ok\)return false;/);assert.match(np,/return true;\s*\}$/,'newProp avisa si empezó');
});
await test('v8.0.4 perdidas del cliente desde su ficha y menú sin letreros «Pronto»',()=>{
  const modos=[];
  const c=vm.createContext({setMode:m=>modos.push(m),setTimeout,clearTimeout});
  for(const n of ['_r1Estado','verPerdidasCliente'])vm.runInContext(functionSource('app-negocios.js',n),c);
  c._r1Estado=vm.runInContext('_r1Estado',c);c._r1Estado.unir={origen:'X'};
  vm.runInContext('verPerdidasCliente(\'Ana "La" O\\\'Neil\')',c);
  assert.deepEqual(plain(c._r1Estado.filtro),{chip:'perdidas',metrica:null,texto:'Ana "La" O\'Neil',pagina:1},'chip Perdidas y el nombre en la búsqueda');
  assert.equal(c._r1Estado.unir,null,'sale de «Unir» si estaba');
  assert.deepEqual(modos,['negocios']);
  const ficha=functionSource('app-dashboard.js','renderClienteFicha');
  assert.match(ficha,/filtrarNegocios\(proyeccionNegocios\(\),\{chip:"perdidas",metrica:null,texto:c\.name\}\)\.filas\.length/,'el número sale del mismo filtro que mostrará Negocios');
  assert.match(ficha,/if\(nPerdidas\)html\+='<button onclick="verPerdidasCliente\('\+jsArg\(c\.name\)\+'\)"/,'sólo con perdidas y con el nombre codificado (P-38)');
  const idx=source('index.html');
  assert.ok(!/class="[^"]*is-soon/.test(idx),'ningún elemento queda como «Pronto»');
  assert.ok(!/data-sub="(ventas\/pipeline|clientes\/perdidas|herr\/configuracion)"/.test(idx),'se quitan Pipeline, Perdidas de Clientes y Configuración');
  assert.match(idx,/data-sub="ventas\/perdidas"/,'Cotizaciones › Perdidas sigue');
});
await test('T4 menú: el módulo del Dashboard viejo no repite la sección que lo contiene (sólo con la bandera)',()=>{
  const secciones=[...source('index.html').matchAll(/<div class="sb-section-label">([^<]*)<\/div>/g)].map(m=>m[1]);
  assert.ok(secciones.includes('Tu día'),'la sección sigue como está');
  const {c:on,extras:x}=ctxR1(mundoR1(),{flag:true,curMode:'dash'});on.iniciarRedisenoR1();
  assert.equal(x.moduloViejo.textContent,'Tablero');assert.equal(x.dashboard.textContent,'Tablero anterior');
  assert.ok(!secciones.includes(x.moduloViejo.textContent),'no repite ninguna sección');
  const {c:off,extras:y}=ctxR1(mundoR1(),{flag:false,curMode:'dash'});off.iniciarRedisenoR1();
  assert.equal(y.moduloViejo.textContent,'Inicio');assert.equal(y.dashboard.textContent,'Dashboard');
});

// ─── Carga en la app ───────────────────────────────────────
await test('app-negocios.js se carga en index.html con ?v= de BUILD_VERSION y check.mjs lo revisa',()=>{
  const v=source('app-core.js').match(/const BUILD_VERSION="v([^"]+)"/)[1];
  assert.equal(v,'8.0.7.2');
  assert.ok(source('index.html').includes('<script src="app-negocios.js?v='+v+'"></script>'));
  assert.ok(/"app-negocios\.js"/.test(source('scripts/check.mjs')));
  assert.ok(source('.github/workflows/check.yml').includes('node scripts/test_negocios.mjs'));
  assert.ok(source('.gitignore').includes('!scripts/test_negocios.mjs'));
});

console.log('\n'+passed+' pruebas de negocios OK');
