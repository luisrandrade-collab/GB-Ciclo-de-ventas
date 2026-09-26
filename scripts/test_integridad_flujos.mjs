// v7.9.24: regresiones sobre funciones reales; sin red ni datos productivos.
import assert from 'node:assert/strict';
import {loadSourceFunctions,source} from './source_test_helpers.mjs';
let passed=0;
async function test(name,fn){await fn();passed++;console.log('OK '+name)}
const plain=x=>JSON.parse(JSON.stringify(x));
const quiet={log(){},error(){},warn(){}};
const core=(...names)=>names.map(n=>['app-core.js',n]);
const common=()=>({console:quiet,toast(){},alert(){},showLoader(){},hideLoader(){},localStorage:{setItem(){},getItem(){return null}},currentUser:{email:'fixture@example.invalid'},gbTodayIso:()=> '2026-09-20',auditStamp:()=>({}),quotesCache:[],ajustesLogCache:[],autoSaveClientDocument:async()=>{}});
function fakeDb(initial={},rejectWrite=()=>false,onTxGet=async()=>{}){
  const store=new Map(Object.entries(initial));
  const snap=path=>({exists:()=>store.has(path),data:()=>structuredClone(store.get(path))});
  const fb={db:{},doc:(_,coll,id)=>coll+'/'+id,serverTimestamp:()=> 'SERVER_TIME',getDoc:async path=>snap(path),runTransaction:async(_,cb)=>{
    const writes=[];
    const result=await cb({get:async path=>{assert.equal(writes.length,0,'las lecturas preceden a las escrituras');await onTxGet(path);return snap(path)},set:(path,data)=>writes.push({path,data:structuredClone(data),mode:'set'}),update:(path,data)=>writes.push({path,data:structuredClone(data),mode:'update'})});
    if(writes.some(rejectWrite))throw new Error('permission-denied');
    for(const w of writes)store.set(w.path,w.mode==='update'?{...store.get(w.path),...w.data}:w.data);
    return result;
  }};
  return {fb,store};
}
// v7.9.32: carga funciones que sólo existen desde cierta versión, para que una prueba
// sobre una versión anterior falle por comportamiento y no por no encontrar la función.
const existe=(file,name)=>new RegExp('function\\s+'+name+'\\s*\\(').test(source(file));
const opcional=(file,...names)=>names.filter(n=>existe(file,n)).map(n=>[file,n]);
const editEntries=core('EDITABLE_FIELDS','EDITABLE_FIELD_LABELS','etiquetasDeCampos','gbStableJson','editableFieldSignatures','editableDocumentSignature','rememberEditBase',...(existe('app-core.js','recordarFormularioAbierto')?['recordarFormularioAbierto']:[]),'assertEditableUnchanged','resolveEditableConflicts');
const mergeEntries=[...core('OPERATIONAL_FIELDS','QUOTE_TOTAL_INPUTS','computeQuoteTotal','recalcularTotalTrasAdoptar','aplicarAdopcion','mergeDespachosForSave','mergeOperationalFields'),...editEntries];
await test('editar conserva seguimiento, evidencia y factura fresca',()=>{
  const c=loadSourceFunctions(mergeEntries);
  const result=c.mergeOperationalFields({client:'editado',feData:{id:'viejo'},despachos:[{id:'d1',status:'pendiente',notas:'editar'}]},{client:'antes',followUp:'perdida',notasSeguimiento:['nota'],perdidaData:{motivo:'precio'},feData:{id:'nuevo'},despachos:[{id:'d1',status:'entregado',entregaData:{foto:'fixture'},entregadoEn:'hoy'}],campoFuturo:42});
  assert.equal(result.client,'editado');assert.equal(result.followUp,'perdida');assert.equal(result.feData.id,'nuevo');assert.equal(result.despachos[0].status,'entregado');assert.equal(result.despachos[0].entregaData.foto,'fixture');assert.equal(result.campoFuturo,42);
});
await test('no resucita factura eliminada ni permite quitar despacho entregado',()=>{
  const c=loadSourceFunctions(mergeEntries);
  assert.equal(c.mergeOperationalFields({feData:{id:'viejo'}},{status:'pedido'}).feData,undefined);
  assert.throws(()=>c.mergeOperationalFields({despachos:[]},{despachos:[{id:'d1',status:'entregado'}]}));
});
await test('lector del editor mantiene evidencia por despacho',()=>{
  const d={id:'d1',fechaHora:'2026-09-20T10:00',status:'entregado',producedAt:'ayer',entregadoEn:'hoy',entregaData:{receptor:'fixture'}};
  const c=loadSourceFunctions([['app-propuesta.js','readDespachosFromForm']],{currentDespachos:[d]});
  assert.deepEqual(plain(c.readDespachosFromForm()[0].entregaData),d.entregaData);
  assert.equal(c.readDespachosFromForm()[0].producedAt,'ayer');
});
await test('PF mantiene logística y calcula dos transportes',()=>{
  const c=loadSourceFunctions([...core('TR','computePropTotal'),['app-propuesta.js','inheritPropFinalLogistics']]);
  const src={despachos:[{id:'1',transporteCosto:20},{id:'2',transporteCosto:30}],horaEntrega:'12:00',notasInternas:'fixture',requiereFE:true,cityType:'Otra',trCustom:1};
  const final=c.inheritPropFinalLogistics({sections:[{options:[{items:[{price:100,qty:1}]}]}]},src);
  assert.equal(c.computePropTotal(final),150);assert.equal(final.requiereFE,true);
  final.despachos[0].transporteCosto=999;assert.equal(src.despachos[0].transporteCosto,20);
});
await test('cartera distingue pagos, ajustes y saldo a favor',()=>{
  const c=loadSourceFunctions([...['getPagos','totalCobrado','totalAjustes','saldoPendiente','saldoNeto','creditoAFavor'].map(n=>['app-historial.js',n]),...opcional('app-historial.js','totalCargos','puedeCargoReposicion'),['app-dashboard.js','renderCarteraCard']],{carteraGetFecha:()=>'',fm:n=>String(n),h:s=>String(s)});
  const html=c.renderCarteraCard({total:100000,pagos:[{monto:20000}],ajustes:[{monto:30000}]},'vencido');
  assert.ok(html.includes('Cobrado 20000'));assert.ok(html.includes('Ajustes 30000'));assert.ok(html.includes('Saldo 50000'));
  assert.ok(c.renderCarteraCard({total:100,pagos:[{monto:120}]},'vencido').includes('Saldo a favor 20'));
});
await test('selector PF incluye transportes y excluye secciones alternativas',()=>{
  const nodes={'pf-sections-list':{},'pf-total':{}};
  const c=loadSourceFunctions([...core('TR','computePropTotal'),['app-propuesta.js','renderPropFinalPicker']],{propFinalSource:{sections:[{id:'s1',name:'Menu',options:[{id:'a',label:'A',items:[{name:'fixture',qty:1,price:100}]}]},{id:'s2',name:'Extra',incluirEnTotal:false,options:[{id:'b',label:'B',items:[{name:'extra',qty:1,price:500}]}]}],despachos:[{transporteCosto:20},{transporteCosto:30}]},propFinalSelection:{s1:'a',s2:'b'},$:id=>nodes[id],h:String,fm:String});
  c.renderPropFinalPicker();assert.equal(nodes['pf-total'].textContent,'150');
});
await test('Excel informa cobrado real tanto por pedido como por día',()=>{
  const sheets={};let downloaded=false;
  const styles=Object.fromEntries(['_REP_FILL_ZEBRA','_REP_FILL_WHITE','_REP_FONT_BASE','_REP_BORDER_FULL','_REP_FMT_PESOS','_REP_FILL_DARK','_REP_FONT_TITLE','_REP_FILL_TITLE','_REP_FILL_GOLD','_REP_FONT_SECTION','_REP_FONT_HEADER','_REP_FILL_HEADER'].map(k=>[k,{}]));
  const c=loadSourceFunctions([...['getPagos','totalCobrado','totalAjustes','saldoPendiente'].map(n=>['app-historial.js',n]),...opcional('app-historial.js','totalCargos'),['app-dashboard.js','descargarExcel']],{...styles,reportesResultado:{docs:[{id:'q',kind:'quote',total:100000,pagos:[{monto:20000}],ajustes:[{monto:30000}]}],filtros:{desde:'2026-09-01',hasta:'2026-09-20'}},XLSX:{utils:{book_new:()=>({}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(_,ws,name)=>{sheets[name]=ws.rows}},writeFile:()=>{downloaded=true}},_repCalcularKPIs:()=>({}),_reportesGetFecha:()=> '2026-09-18',_repFormatearTabla(){}});
  c.descargarExcel();assert.ok(downloaded);assert.equal(sheets.Pedidos[1][9],20000);assert.equal(sheets['Por dia'][1][3],20000);
});
await test('restauración no reemplaza ID existente aunque el preview esté viejo',async()=>{
  const original={status:'entregado',pagos:[{monto:100}]};
  const {fb,store}=fakeDb({'quotes/old':original});
  const c=loadSourceFunctions(core('restoreMissingDocument'),{...common(),window:{fb}});
  assert.equal(await c.restoreMissingDocument('quotes','old',{pagos:[]}),false);
  assert.deepEqual(store.get('quotes/old'),original);
  assert.equal(await c.restoreMissingDocument('quotes','new',{dateISO:'2026-04-01T10:00:00Z',kind:'quote',_isPF:false}),true);
  assert.equal(store.get('quotes/new').createdAt.toISOString(),'2026-04-01T10:00:00.000Z');
  assert.equal(store.get('quotes/new').kind,undefined);
  await assert.rejects(c.restoreMissingDocument('quotes','bad/id',{}));
});
await test('restauración denegada deja almacén intacto',async()=>{
  const {fb,store}=fakeDb({},()=>true);
  const c=loadSourceFunctions(core('restoreMissingDocument'),{...common(),window:{fb}});
  await assert.rejects(c.restoreMissingDocument('quotes','new',{}));assert.equal(store.size,0);
});
await test('reversión crea evento append-only y mantiene ajustes ajenos',async()=>{
  const original={docId:'GB-PF-fixture',docKind:'proposal',tipo:'ajuste_saldo',monto:30};
  const {fb,store}=fakeDb({'ajustesLog/a':original,'propfinals/GB-PF-fixture':{ajustes:[{logId:'a',monto:30},{logId:'b',monto:10}]}},w=>w.path==='ajustesLog/a');
  const c=loadSourceFunctions(core('getCollectionName','projectAjustesLog','softDeleteAjuste'),{...common(),window:{fb}});
  assert.equal((await c.softDeleteAjuste('a','GB-PF-fixture','proposal')).quitados,1);
  assert.deepEqual(store.get('ajustesLog/a'),original);
  assert.equal(store.get('propfinals/GB-PF-fixture').ajustes[0].logId,'b');
  assert.equal(store.get('ajustesLog/reversion_a').reversesLogId,'a');
  assert.equal((await c.softDeleteAjuste('a','GB-PF-fixture','proposal')).quitados,0);
  const projection=c.projectAjustesLog([{id:'a',...original},{id:'reversion_a',...store.get('ajustesLog/reversion_a')}]);
  assert.equal(projection.length,1);assert.ok(projection[0].deletedAt);
});
await test('reversión rechazada no cambia saldo ni log',async()=>{
  const initial={'ajustesLog/a':{docId:'q',docKind:'quote',monto:30},'quotes/q':{ajustes:[{logId:'a',monto:30}]}};
  const {fb,store}=fakeDb(initial,w=>w.path==='ajustesLog/reversion_a');
  const c=loadSourceFunctions(core('getCollectionName','softDeleteAjuste'),{...common(),window:{fb}});
  await assert.rejects(c.softDeleteAjuste('a','q','quote'));
  assert.deepEqual(Object.fromEntries(store),initial);
});
await test('nota crédito no se marca revertida sin revertir saldo del cliente',async()=>{
  const {fb,store}=fakeDb({'ajustesLog/a':{tipo:'nota_credito',monto:30}});
  const c=loadSourceFunctions(core('getCollectionName','softDeleteAjuste'),{...common(),window:{fb}});
  await assert.rejects(c.softDeleteAjuste('a'));assert.equal(store.size,1);
});
await test('historial pagina 451 docs e incluye legacy sin createdAt',async()=>{
  const docs=Array.from({length:451},(_,i)=>({id:String(i).padStart(4,'0'),data:()=>({client:'fixture'})}));
  let calls=0;
  const fb={db:{},collection:(_,name)=>name,documentId:()=> '__name__',orderBy:field=>({field}),limit:n=>({limit:n}),startAfter:d=>({after:d.id}),query:(coll,...rules)=>({coll,rules}),getDocs:async q=>{
    calls++;const after=q.rules.find(r=>r.after)?.after;
    return {docs:docs.filter(d=>!after||d.id>after).slice(0,200),metadata:{fromCache:false}};
  }};
  const c=loadSourceFunctions(core('readHistoryCollection'),{window:{fb}});
  const result=await c.readHistoryCollection('quotes');assert.equal(result.docs.length,451);assert.equal(calls,3);assert.equal(result.docs[450].id,'0450');
});
await test('fallo en una colección no publica historial parcial y bloquea export fresco',async()=>{
  const c=loadSourceFunctions(core('loadAllHistory'),{...common(),quotesCache:[{id:'previo'}],readHistoryCollection:async name=>{if(name==='propfinals')throw new Error('denied');return {docs:[{id:'nuevo'}]};},setCloudStatus(){}});
  await assert.rejects(c.loadAllHistory({requireFresh:true,transition:false}));assert.equal(c.quotesCache[0].id,'previo');
  await c.loadAllHistory({transition:false});assert.equal(c.quotesCache[0].id,'previo');
});
for(const [file,name,number,save] of [['app-cotizar.js','genPDF','currentQuoteNumber','saveCurrentQuote'],['app-propuesta.js','genPropPDF','currentPropNumber','savePropQuote']]){
  await test(name+' aborta si save falla, cancela o está ocupado',async()=>{
    let reached=0;
    const c=loadSourceFunctions([[file,name]],{...common(),allIt:()=>[{}],cloudOnline:true,[number]:'EXISTENTE',[save]:async()=>undefined,window:{jspdf:{jsPDF:function(){reached++}}}});
    await c[name]();assert.equal(reached,0);
  });
}
await test('guardar cotización devuelve snapshot confirmado y sincroniza cache',async()=>{
  const {fb,store}=fakeDb({'quotes/q':{status:'pedido',followUp:'perdida',pagos:[{monto:30}],feData:{id:'fresh'}}});
  const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='f-cli'?'Fixture':'',checked:false});return nodes.get(id)};
  const c=loadSourceFunctions([...mergeEntries,...opcional('app-cotizar.js','formularioCotizacion'),['app-cotizar.js','_saveCurrentQuoteImpl'],['app-cotizar.js','saveCurrentQuote']],{
    ...common(),window:{fb},$,cloudOnline:true,currentQuoteNumber:'q',APP_YEAR:2026,cart:[{id:'text-id',n:'fixture',p:100,qty:1}],cust:[],allIt:()=>[{}],curStep:'items',shouldVersionWithSuffix:()=>false,autoSaveClientFromCot:async()=>{},getIdStr:()=>'',getCityName:()=>'',getDelivStr:()=>'',getTotal:()=>100,gbNotasALegacy:()=>({}),notasCotLista:[],DEFAULT_NOTAS_COT:{},firmaCot:'km',tituloInstruccionesPago:'',tituloCondiciones:'',cambiosAfectanCliente:()=>false
  });
  c.rememberEditBase('quote','q',store.get('quotes/q'));
  const result=await c.saveCurrentQuote(true);
  assert.equal(result?.ok,true);assert.equal(result.id,'q');assert.equal(result.document.followUp,'perdida');assert.equal(c.quotesCache[0].followUp,'perdida');assert.equal(store.get('quotes/q').pagos[0].monto,30);
});
for(const mode of ['quote','proposal','final']){
  await test('PDF '+mode+' usa snapshot confirmado y termina emisión',async()=>{
    const texts=[],tables=[],emitted=[],errors=[];
    const doc=new Proxy({lastAutoTable:{finalY:35},splitTextToSize:s=>[s],text:s=>texts.push(s),autoTable:o=>tables.push(o.body)}, {get:(t,p)=>p in t?t[p]:(()=>{})});
    const snapshot={quoteNumber:'CONFIRMADO',client:'Cliente guardado',cart:[{n:'Producto guardado',p:100,qty:1}],total:150,sections:[{name:'Menu',options:[{label:'A',items:[{name:'Producto guardado',price:100,qty:1}]}]}],despachos:[{id:'d1',transporteCosto:20},{id:'d2',transporteCosto:30}],menaje:[],notasCotLista:[],condicionesLista:[]};
    if(mode==='final')snapshot.quoteNumber='GB-PF-CONFIRMADO';
    const name=mode==='quote'?'genPDF':'genPropPDF';
    const file=mode==='quote'?'app-cotizar.js':'app-propuesta.js';
    const saved=async()=>({ok:true,id:snapshot.quoteNumber,document:snapshot});
    const c=loadSourceFunctions([[file,name]],{...common(),alert:s=>errors.push(s),window:{__pfMode:mode==='final',jspdf:{jsPDF:function(){return doc}}},allIt:()=>[{}],cloudOnline:true,saveCurrentQuote:saved,savePropQuote:saved,currentQuoteNumber:'EDITOR',currentPropNumber:'EDITOR',gbNotasNormalizar:x=>x||[],DEFAULT_NOTAS_COT:{},NOTAS_COT_TITULOS:{},DEFAULT_CONDICIONES:{},CONDICIONES_TITULOS:{},DEFAULT_TIT_PAGO:'Pago',DEFAULT_TIT_CONDICIONES:'Condiciones',TR:{},fm:String,dateStr:()=> 'fixture',gbPdfHeader:()=>20,gbPdfFirma:()=>20,gbPdfFooter(){},FIRMANTES:{km:{},jp:{}},savePdfConCopiaStorage:async(_doc,filename,kind,id)=>emitted.push({filename,kind,id})});
    await c[name](mode==='final'?snapshot:undefined);
    assert.deepEqual(errors,[]);assert.equal(emitted.length,1);assert.equal(emitted[0].id,snapshot.quoteNumber);assert.equal(emitted[0].kind,mode==='final'?'propfinal':mode);
    assert.ok(texts.some(s=>String(s).includes('Cliente guardado')));assert.ok(JSON.stringify(tables).includes('Producto guardado'));
    assert.ok(!JSON.stringify(emitted).includes('EDITOR'));
    if(mode!=='quote')assert.ok(JSON.stringify(tables).includes('150'));
  });
}
await test('SDK expone paginación/lectura de servidor y CI incluye suite real',()=>{
  const html=source('index.html');for(const api of ['getDocsFromServer','documentId','startAfter'])assert.ok(html.includes(api));
  assert.ok(source('.github/workflows/check.yml').includes('node scripts/test_integridad_flujos.mjs'));
});
// v7.9.25: dos sesiones representadas por base abierta y documento remoto cambiado.
function editorFixture(kind,onTxGet){
  const proposal=kind==='proposal',coll=proposal?'proposals':'quotes';
  const base={client:'Original',status:'enviada',despachos:[{id:'d1',status:'pendiente',transporteCosto:20}]};
  const {fb,store}=fakeDb({[coll+'/q']:structuredClone(base)},()=>false,onTxGet);
  const nodes=new Map(),messages=[];
  const $=id=>{if(!nodes.has(id))nodes.set(id,{value:id.endsWith('-cli')?'Editado':'',checked:false});return nodes.get(id)};
  // v7.9.33: un guardado que adopta campos recarga el editor con el cargador canónico real.
  const cargadores=proposal
    ?['initCondiciones','loadDespachosFromDoc','_syncActiveMenajeRefs','loadPropQuote'].map(n=>['app-propuesta.js',n])
    :opcional('app-core.js','cargarCotizacionEnEditor');
  const c=loadSourceFunctions([...mergeEntries,...core('TR','computePropTotal','gbEsErrorDePermiso','gbMensajeError','markEditorContext','gbNotasNormalizar'),...cargadores,...opcional(proposal?'app-propuesta.js':'app-cotizar.js',proposal?'formularioPropuesta':'formularioCotizacion'),[proposal?'app-propuesta.js':'app-cotizar.js',proposal?'_savePropQuoteImpl':'_saveCurrentQuoteImpl']],{
    document:{querySelectorAll:()=>[],querySelector:()=>null},C:[],updTr(){},updTrP(){},togMom(){},setFirma(){},go(){},NOTAS_COT_TITULOS:{},CONDICIONES_TITULOS:{},
    renderDespachos(){},renderPropSections(){},renderMenaje(){},renderPersonal(){},renderCondiciones(){},renderReposicion(){},showClientHistoryPanel(){},setDefaultFechaVenc(){},renderPropEditBanners(){},
    ...common(),window:{fb},$,toast:msg=>messages.push(msg),cloudOnline:true,currentQuoteNumber:'q',currentPropNumber:'q',APP_YEAR:2026,cart:[{id:'fixture',n:'producto',p:100,qty:1}],cust:[],allIt:()=>[{}],curStep:'items',shouldVersionWithSuffix:()=>false,autoSaveClientFromCot:async()=>{},autoSaveClientFromProp:async()=>{},getIdStr:()=>'',getPropIdStr:()=>'',getCityName:()=>'',getCityNameP:()=>'',getDelivStr:()=>'',getTotal:()=>100,gbNotasALegacy:()=>({}),notasCotLista:[],DEFAULT_NOTAS_COT:{},firmaCot:'km',tituloInstruccionesPago:'',tituloCondiciones:'',cambiosAfectanCliente:()=>false,
    propSections:[],menajeItems:[],menajeOptions:[],activeMenajeOptionId:'a',menajeAssignedTo:null,personalData:{},tipoServicio:'',tituloMenaje:'',tituloPersonal:'',condicionesLista:[],condicionesData:{},DEFAULT_CONDICIONES:{},aperturaFrase:'',fechaVencimiento:'',reposicionByOption:{},reposicionData:{},firmaProp:'jp',getIncluirReposicion:()=>false,rememberPricesFromProposal(){},readDespachosFromForm:()=>structuredClone(base.despachos),
    confirmModal:async()=>true,buildChildNumber:()=> 'q-A',h:String,STATUS_META:{},diffDocs:()=>[]
  });
  c.rememberEditBase(kind,'q',base);
  return {c,store,base,messages,path:coll+'/q',childPath:coll+'/q-A',save:silent=>c[proposal?'_savePropQuoteImpl':'_saveCurrentQuoteImpl'](silent)};
}
for(const kind of ['quote','proposal']){
  await test(kind+': contenido remoto cambiado no se sobrescribe',async()=>{
    const f=editorFixture(kind);f.store.get(f.path).client='Otra sesión';const before=plain(Object.fromEntries(f.store));
    assert.equal(await f.save(true),undefined);assert.deepEqual(Object.fromEntries(f.store),before);assert.ok(f.messages.some(m=>m.includes('contenido cambió')));assert.equal(f.c.quotesCache.length,0);
  });
  // v7.9.26 REV-01: con la comparación a tres bandas este guardado ya NO se rechaza.
  // El criterio de siempre —el despacho de la otra sesión no se pierde— se mantiene, y
  // además la edición comercial se puede guardar. Antes de v7.9.26 se exigía `undefined`
  // (rechazo); esa aserción describía el mecanismo, no el resultado deseado.
  await test(kind+': despacho pendiente añadido por otra sesión no se pierde y deja guardar',async()=>{
    const f=editorFixture(kind);f.store.get(f.path).despachos.push({id:'d2',status:'pendiente'});
    assert.equal((await f.save(true))?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.store.get(f.path).despachos.length,2);
    assert.equal(f.store.get(f.path).client,'Editado');
  });
  await test(kind+': pago y evidencia concurrentes se conservan; segundo guardado válido',async()=>{
    const f=editorFixture(kind),fresh=f.store.get(f.path);fresh.pagos=[{monto:30}];fresh.despachos[0].status='entregado';fresh.despachos[0].entregaData={receptor:'fixture'};
    assert.equal((await f.save(true))?.ok,true);assert.equal(f.store.get(f.path).pagos[0].monto,30);assert.equal(f.store.get(f.path).despachos[0].entregaData.receptor,'fixture');
    assert.equal((await f.save(true))?.ok,true,JSON.stringify(f.messages));
  });
  await test(kind+': no recrea documento eliminado',async()=>{
    const f=editorFixture(kind);f.store.delete(f.path);assert.equal(await f.save(true),undefined);assert.equal(f.store.size,0);assert.ok(f.messages.some(m=>m.includes('eliminada')));
  });
  await test(kind+': colisión de versión hija deja padre e hija intactos',async()=>{
    const f=editorFixture(kind);f.c.shouldVersionWithSuffix=()=>true;f.store.set(f.childPath,{client:'Existente'});const before=plain(Object.fromEntries(f.store));
    assert.equal(await f.save(false),undefined);assert.deepEqual(Object.fromEntries(f.store),before);assert.ok(f.messages.some(m=>m.includes('ya existe')));
  });
  await test(kind+': versión hija se guarda y archiva padre',async()=>{
    const f=editorFixture(kind);f.c.shouldVersionWithSuffix=()=>true;
    assert.equal((await f.save(false))?.ok,true,JSON.stringify(f.messages));assert.equal(f.store.get(f.path).status,'superseded');assert.equal(f.store.get(f.childPath).parentQuote,'q');
  });
  await test(kind+': sin base de edición no guarda a ciegas',async()=>{
    const f=editorFixture(kind);f.c.window._gbEditBases={};assert.equal(await f.save(true),undefined);assert.equal(f.store.get(f.path).client,'Original');
  });
  await test(kind+': padre confirmado durante guardado no se archiva',async()=>{
    const f=editorFixture(kind);f.c.shouldVersionWithSuffix=()=>true;
    f.c.confirmModal=async()=>{f.store.get(f.path).status='pedido';return true};
    assert.equal(await f.save(false),undefined);assert.equal(f.store.get(f.path).status,'pedido');assert.equal(f.store.has(f.childPath),false);
  });
  await test(kind+': versión hija no archiva documento con pagos',async()=>{
    const f=editorFixture(kind);f.c.shouldVersionWithSuffix=()=>true;f.store.get(f.path).pagos=[{monto:10}];
    assert.equal(await f.save(false),undefined);assert.equal(f.store.get(f.path).status,'enviada');assert.equal(f.store.has(f.childPath),false);
  });
  // v7.9.26 REV-01: la agenda operativa (reagendar/crear pedido/aprobar) escribe
  // eventDate y horaEntrega fuera del editor. No debe bloquear una edición comercial
  // que no tocó la programación, y su valor debe ganar.
  await test(kind+': reagendamiento concurrente no bloquea la edición y su fecha gana',async()=>{
    const f=editorFixture(kind);
    const fresco=f.store.get(f.path);fresco.eventDate='2026-10-02';fresco.horaEntrega='15:00';
    assert.equal((await f.save(true))?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.store.get(f.path).eventDate,'2026-10-02');
    assert.equal(f.store.get(f.path).horaEntrega,'15:00');
    assert.equal(f.store.get(f.path).client,'Editado'); // la edición comercial sí se guardó
  });
  await test(kind+': conflicto real sobre el mismo campo sigue abortando y nombra el campo',async()=>{
    const f=editorFixture(kind);f.store.get(f.path).client='Otra sesión';
    const before=plain(Object.fromEntries(f.store));
    assert.equal(await f.save(true),undefined);
    assert.deepEqual(Object.fromEntries(f.store),before);
    // v7.9.29: antes se exigía la clave interna 'client'; ahora el aviso nombra el campo
    // por su etiqueta visible. El requisito —que el aviso diga QUÉ campo chocó— sigue igual.
    assert.ok(f.messages.some(m=>m.includes('(Cliente)')),JSON.stringify(f.messages));
  });
  await test(kind+': si ambos lados fijan el mismo valor no hay conflicto',async()=>{
    const f=editorFixture(kind);f.store.get(f.path).client='Editado'; // el otro guardó lo mismo
    assert.equal((await f.save(true))?.ok,true,JSON.stringify(f.messages));
  });
  await test(kind+': cambiar de editor durante la transacción cancela sin escribir auxiliares',async()=>{
    let f,aux=0,changed=false;
    f=editorFixture(kind,async()=>{if(!changed){changed=true;f.c.window._gbEditorContexts={[kind]:1}}});
    f.c.autoSaveClientDocument=async()=>{aux++};
    const before=plain(Object.fromEntries(f.store));
    assert.equal(await f.save(true),undefined);assert.deepEqual(Object.fromEntries(f.store),before);assert.equal(aux,0);
  });
}
const pfEntries=[...editEntries,...core('TR','computePropTotal'),...['inheritPropFinalLogistics','commitPropFinal'].map(n=>['app-propuesta.js',n])];
function pfFixture(regenerate=false,rejectWrite){
  const source={id:'p',client:'Fixture',status:regenerate?'convertida':'enviada',sections:[{id:'s',options:[{id:'a',items:[{price:100,qty:1}]}]}],despachos:[{id:'d1',transporteCosto:20},{id:'d2',transporteCosto:30}]};
  if(regenerate)source.propFinalRef='old';
  const initial={'proposals/p':structuredClone(source)};
  if(regenerate)initial['propfinals/old']={sourceProposal:'p',status:'propfinal',version:2};
  const {fb,store}=fakeDb(initial,rejectWrite),pfWindow={fb,_propFinalFlowSeq:1};
  const c=loadSourceFunctions(pfEntries,{window:pfWindow,propFinalSource:source});
  const pf={quoteNumber:'new',sourceProposal:'p',status:'propfinal',client:'Fixture',sections:source.sections};
  const regeneration=regenerate?{oldPfId:'old',sourceProposalId:'p',oldVersion:1}:null;
  return {c,store,source,pf,regeneration,commit:()=>c.commitPropFinal(pf,source,regeneration)};
}
await test('PF confirma fuente y nueva con logística y total',async()=>{
  const f=pfFixture();const result=await f.commit();assert.equal(result.total,150);assert.equal(f.store.get('proposals/p').propFinalRef,'new');assert.equal(f.store.get('propfinals/new').despachos.length,2);
});
for(const field of ['client','reposicionData','despachos']){
  await test('PF rechaza cambio remoto en '+field,async()=>{
    const f=pfFixture();f.store.get('proposals/p')[field]=field==='client'?'Otro':field==='despachos'?[]:{valor:100};const before=plain(Object.fromEntries(f.store));
    await assert.rejects(f.commit(),{code:'EDIT_CONFLICT'});assert.deepEqual(Object.fromEntries(f.store),before);
  });
}
await test('PF regenerada archiva anterior y usa versión fresca en una transacción',async()=>{
  const f=pfFixture(true);const result=await f.commit();assert.equal(result.version,3);assert.equal(f.store.get('propfinals/old').status,'superseded');assert.equal(f.store.get('proposals/p').propFinalRef,'new');
});
await test('PF fallo de archivo anterior no deja PF nueva ni fuente modificada',async()=>{
  const f=pfFixture(true,w=>w.path==='propfinals/old');const before=plain(Object.fromEntries(f.store));await assert.rejects(f.commit(),/permission-denied/);assert.deepEqual(Object.fromEntries(f.store),before);
});
await test('PF otra regeneración ya cambió referencia vigente',async()=>{
  const f=pfFixture(true);f.store.get('proposals/p').propFinalRef='otra';await assert.rejects(f.commit(),/vigente cambió/);assert.equal(f.store.has('propfinals/new'),false);
});
for(const activity of [{pagos:[{monto:10}]},{ajustes:[{monto:10}]},{despachos:[{status:'entregado'}]},{feData:{id:'factura'}}]){
  await test('PF con '+Object.keys(activity)[0]+' no se archiva perdiendo actividad',async()=>{
    const f=pfFixture(true);Object.assign(f.store.get('propfinals/old'),activity);await assert.rejects(f.commit(),/actividad operativa/);assert.equal(f.store.get('propfinals/old').status,'propfinal');assert.equal(f.store.has('propfinals/new'),false);
  });
}
await test('PF colisión de consecutivo no reemplaza otro documento',async()=>{
  const f=pfFixture();f.store.set('propfinals/new',{client:'Existente'});await assert.rejects(f.commit(),/ya existe/);assert.equal(f.store.get('propfinals/new').client,'Existente');assert.equal(f.store.get('proposals/p').status,'enviada');
});
await test('PF selector cambiado cancela antes de cualquier escritura',async()=>{
  const f=pfFixture();f.c.window._propFinalFlowSeq=2;const before=plain(Object.fromEntries(f.store));
  await assert.rejects(f.c.commitPropFinal(f.pf,f.source,null,1),/selector cambió/);assert.deepEqual(Object.fromEntries(f.store),before);
});
await test('PF doble clic sólo ejecuta una generación y libera guard tras error',async()=>{
  let release,calls=0;const c=loadSourceFunctions([['app-propuesta.js','generarPropuestaFinal']],{window:{},_generarPropuestaFinalImpl:()=>{calls++;return new Promise(resolve=>{release=resolve})}});
  const first=c.generarPropuestaFinal();await c.generarPropuestaFinal();assert.equal(calls,1);release();await first;assert.equal(c.window._generarPfBusy,false);
  c._generarPropuestaFinalImpl=async()=>{throw new Error('fixture')};await assert.rejects(c.generarPropuestaFinal());assert.equal(c.window._generarPfBusy,false);
});
// v7.9.26 REV-02: la sonda debe decir la verdad. Si no se alcanza el servidor,
// cloudOnline sigue en false (SYNC-01: no anunciar "Nube conectada" con caché local).
await test('sonda de conectividad: lectura al servidor correcta habilita la nube',async()=>{
  let pedido=null;
  const fb={db:{},collection:(_,n)=>n,query:(c,...r)=>({c,r}),limit:n=>({limit:n}),
    getDocsFromServer:async q=>{pedido=q;return {docs:[]}}};
  const c=loadSourceFunctions(core('probeCloudReachable'),{window:{fb},console:quiet});
  assert.equal(await c.probeCloudReachable(),true);
  assert.equal(pedido.c,'clients');
  assert.deepEqual(pedido.r,[{limit:1}]); // una sola lectura, no el historial completo
});
await test('sonda de conectividad: fallo del servidor deja la nube en false',async()=>{
  const fb={db:{},collection:(_,n)=>n,query:()=>({}),limit:n=>({limit:n}),
    getDocsFromServer:async()=>{throw new Error('unavailable')}};
  const c=loadSourceFunctions(core('probeCloudReachable'),{window:{fb},console:quiet});
  assert.equal(await c.probeCloudReachable(),false);
});
// v7.9.27: el tope de productos por cotizacion y su letrero deben decir lo mismo.
function fakeEl(){return{textContent:'',classList:{add(){},remove(){},toggle(){}}}}
await test('el letrero del tope toma el numero de MX, no de un texto fijo',()=>{
  const els={};
  const c=loadSourceFunctions(core('updUI'),{console:quiet,curStep:'products',MX:7,
    totCnt:()=>3,distIt:()=>7,fm:()=>'$0',getTotal:()=>0,
    $:id=>(els[id]=els[id]||fakeEl())});
  c.updUI();
  assert.equal(els['limit-warn'].textContent,'Máximo 7 productos por cotización. Elimina uno para agregar otro.');
});
await test('index.html no lleva el tope escrito a mano en el letrero',()=>{
  const html=source('index.html');
  const div=html.match(/<div id="limit-warn"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(div,'no se encontro el letrero #limit-warn en index.html');
  assert.ok(!/[0-9]+\s*productos/.test(div[1]),'el letrero tiene el numero escrito a mano: se desincronizaria de MX');
});
await test('el tope de productos por cotizacion quedo ampliado',()=>{
  const m=source('app-core.js').match(/const\s+MX\s*=\s*([0-9]+)/);
  assert.ok(m,'no se encontro la constante MX en app-core.js');
  assert.ok(Number(m[1])>12,'MX deberia ser mayor que el viejo tope de 12, es '+m[1]);
});

// v7.9.28: en qué despacho se entrega el menaje (remisión de GB-P-2026-0122-7).
const menajeEntries=core('getMenajeDespachoTarget','menajeTocaEsteDespacho');
const D=[{id:'d1',fechaHora:'2026-09-23T08:00'},{id:'d7',fechaHora:'2026-09-29T10:00'}];
await test('sin asignación el menaje sigue yendo al primer despacho',()=>{
  const c=loadSourceFunctions(menajeEntries);
  assert.equal(c.getMenajeDespachoTarget({},D).origen,'sin_asignar');
  assert.equal(c.menajeTocaEsteDespacho({},D,D[0],true),true);
  assert.equal(c.menajeTocaEsteDespacho({},D,D[1],false),false);
});
await test('asignado a un despacho posterior, el menaje va en ESA hoja y sólo en esa',()=>{
  const c=loadSourceFunctions(menajeEntries);
  const q={menajeAssignedTo:'d7'};
  assert.equal(c.getMenajeDespachoTarget(q,D).origen,'asignado');
  assert.equal(c.menajeTocaEsteDespacho(q,D,D[1],false),true,'debe imprimirse en el despacho asignado');
  assert.equal(c.menajeTocaEsteDespacho(q,D,D[0],true),false,'no debe duplicarse en el primero');
});
await test('asignación a un despacho borrado cae al primero y se marca huerfana',()=>{
  const c=loadSourceFunctions(menajeEntries);
  const q={menajeAssignedTo:'d_borrado'};
  assert.equal(c.getMenajeDespachoTarget(q,D).origen,'huerfano');
  assert.equal(c.menajeTocaEsteDespacho(q,D,D[0],true),true,'no debe perderse el menaje');
  assert.equal(c.menajeTocaEsteDespacho(q,D,D[1],false),false);
});
await test('la asignación de menaje es campo editable protegido (REV-03)',()=>{
  const linea=source('app-core.js').match(/const EDITABLE_FIELDS=\[[^\]]*\]/)[0];
  assert.ok(linea.includes('"menajeAssignedTo"'),'sin esto el campo queda sin protección de concurrencia (REV-03)');
});
await test('los items de menaje sin cantidad ya no se descartan en la remision',()=>{
  const src=source('app-propuesta.js');
  assert.ok(!/menajeItemsLocal\.filter\(m=>m\.name&&m\.qty\)/.test(src),'el filtro que exigia cantidad debe haber desaparecido');
  assert.ok(/const menajeConNombre=menajeItemsLocal\.filter\(m=>m&&m\.name\)/.test(src),'debe filtrarse solo por nombre');
});
// v7.9.28: el menaje debe salir en la HOJA DE ENTREGAS, que es la que se imprime.
const heEntries=[['app-dashboard.js','_menajeTextos'],['app-dashboard.js','_menajeParaDespachoHE'],['app-core.js','getMenajeOpcionActiva'],['app-core.js','getMenajeOpciones'],['app-core.js','getMenajeItemsActivos'],['app-core.js','getMenajeDespachoTarget'],['app-core.js','menajeTocaEsteDespacho']];
const qMenaje=ass=>({menajeOptions:[{id:'opA',items:[{name:'Plato hondo',qty:120},{name:'Copa vino',qty:120},{name:'Mantel blanco',qty:''}]}],propFinalSelection:{menaje:'opA'},menajeAssignedTo:ass});
const DD=[{id:'d1',fechaHora:'2026-09-17T09:00'},{id:'d7',fechaHora:'2026-09-23T09:00'}];
await test('el menaje sale en la hoja de entregas del despacho asignado',()=>{
  const c=loadSourceFunctions(heEntries);
  const r=c._menajeParaDespachoHE(qMenaje('d7'),DD[1],DD);
  assert.deepEqual(r,['120 Plato hondo','120 Copa vino','Mantel blanco']);
});
await test('el menaje NO se repite en los demas despachos',()=>{
  const c=loadSourceFunctions(heEntries);
  assert.equal(c._menajeParaDespachoHE(qMenaje('d7'),DD[0],DD).length,0,'no debe duplicarse el menaje en otra hoja');
});
await test('sin asignacion el menaje va en el primer despacho cronologico',()=>{
  const c=loadSourceFunctions(heEntries);
  assert.equal(c._menajeParaDespachoHE(qMenaje(null),DD[0],DD).length,3);
  assert.equal(c._menajeParaDespachoHE(qMenaje(null),DD[1],DD).length,0);
});
await test('entrega unica legacy: el menaje va en su unica fila',()=>{
  const c=loadSourceFunctions(heEntries);
  assert.equal(c._menajeParaDespachoHE(qMenaje(null),{id:'x',_legacy:true},[]).length,3);
});
await test('comida y menaje en la misma fila se separan legible',()=>{
  const c=loadSourceFunctions([...heEntries,['app-dashboard.js','_buildItemsResumenHE']]);
  const q={kind:'proposal',despachos:[{id:'a',fechaHora:'2026-09-23T09:00'},{id:'b',fechaHora:'2026-09-24T09:00'}],
    sections:[{options:[{items:[{name:'Canapés',qty:50,assignedTo:'a'}]}]}],
    menajeOptions:[{id:'opA',items:[{name:'Plato hondo',qty:120}]}],propFinalSelection:{menaje:'opA'},menajeAssignedTo:'a'};
  const txt=c._buildItemsResumenHE(q,q.despachos[0],q.despachos);
  assert.ok(!/·\s*\|/.test(txt),'el separador no debe quedar como "· |"');
  assert.ok(/50 Canapés\s+\|\s+MENAJE: 120 Plato hondo/.test(txt),'obtenido: '+txt);
});
await test('la hoja de entregas no imprime precios de reposicion del menaje',()=>{
  const c=loadSourceFunctions(heEntries);
  const txt=c._menajeTextos([{name:'Plato hondo',qty:120,price:18000}]).join(' ');
  assert.ok(!/18000|18\.000|\$/.test(txt),'los precios ya estan en la cotizacion, aqui estorban');
});
await test('la remision no mete emojis en el PDF (helvetica no los tiene)',()=>{
  const linea=source('app-propuesta.js').match(/const labelDesp=[^;]*/)[0];
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(linea),'el emoji salia como basura en la linea que firma el cliente');
});
await test('una remision sin comida ni menaje imprime aviso en vez de salir muda',()=>{
  const src=source('app-propuesta.js');
  assert.ok(/ESTA HOJA NO LISTA NING/.test(src),'falta el aviso de hoja vacia');
});

// v7.9.29: errores de permiso legibles, etiquetas en el conflicto, numeración y total en página 1.
await test('un permiso negado se reconoce venga de donde venga',()=>{
  const c=loadSourceFunctions(core('gbEsErrorDePermiso'));
  assert.equal(c.gbEsErrorDePermiso({code:'permission-denied',message:'x'}),true,'código de Firestore');
  assert.equal(c.gbEsErrorDePermiso({message:'Missing or insufficient permissions.'}),true,'mensaje de Firestore en producción');
  assert.equal(c.gbEsErrorDePermiso({message:"\nfalse for 'update' @ L69, false for 'update' @ L79"}),true,'detalle del emulador');
  assert.equal(c.gbEsErrorDePermiso({code:'storage/unauthorized',message:'x'}),true,'Storage');
  assert.equal(c.gbEsErrorDePermiso({code:'unavailable',message:'Failed to get document because the client is offline.'}),false,'un fallo de red NO es de permiso');
  assert.equal(c.gbEsErrorDePermiso({code:'EDIT_CONFLICT',message:'El contenido cambió en otra sesión'}),false,'un conflicto NO es de permiso');
});
await test('el mensaje de permiso sale en español y sin detalle técnico; los demás no se tocan',()=>{
  const c=loadSourceFunctions(core('gbEsErrorDePermiso','gbMensajeError'));
  const m=c.gbMensajeError({message:"false for 'update' @ L69"});
  assert.ok(/no tiene permiso/.test(m),m);
  assert.ok(!/false for|L69|Missing|insufficient/i.test(m),'no debe filtrar el detalle técnico: '+m);
  // v7.9.33 P2-R2-04 (ronda 3): cambia el contrato. Antes todo error que no fuera de permiso
  // se mostraba tal cual; ahora sólo los que la app marca como aptos para el usuario.
  assert.equal(c.gbMensajeError({message:'Sin conexión',paraUsuario:true}),'Sin conexión');
  assert.notEqual(c.gbMensajeError({message:'Contador no existe: counters/x'}),'Contador no existe: counters/x');
});
await test('el aviso de conflicto nombra el campo por su etiqueta, no por la clave interna',()=>{
  const c=loadSourceFunctions(editEntries);
  const base={id:'q',fields:c.editableFieldSignatures({att:'Compras'})};
  let err=null;
  try{c.resolveEditableConflicts({att:'Luis'},{att:'Kathy'},base,'q')}catch(e){err=e}
  assert.ok(err,'debió haber conflicto');
  assert.ok(/Atención/.test(err.message),err.message);
  assert.ok(!/\(att\)/.test(err.message),'no debe decir (att): '+err.message);
  assert.deepEqual(plain(err.fields),['att'],'el código sigue recibiendo la clave interna');
});
await test('cada campo editable tiene etiqueta visible',()=>{
  const src=source('app-core.js');
  const campos=JSON.parse(src.match(/const EDITABLE_FIELDS=(\[[^\]]*\])/)[1]);
  const etiquetas=Function('return '+src.match(/const EDITABLE_FIELD_LABELS=(\{[^}]*\})/)[1])();
  const sin=campos.filter(k=>!etiquetas[k]);
  assert.deepEqual(sin,[],'campos sin etiqueta: '+sin.join(', '));
});
await test('el pie numera las páginas sólo cuando se pide',()=>{
  const c=loadSourceFunctions(core('gbPdfFooter'));
  const hojas=(n)=>{const textos=[];let actual=0;return {textos,getNumberOfPages:()=>n,setPage:p=>{actual=p},setDrawColor(){},setLineWidth(){},line(){},setFontSize(){},setTextColor(){},text:(t)=>textos.push(actual+':'+t)}};
  const con=hojas(3); c.gbPdfFooter(con,{numerar:true});
  assert.deepEqual(plain(con.textos.filter(t=>/Página/.test(t))),['1:Página 1 de 3','2:Página 2 de 3','3:Página 3 de 3']);
  const sin=hojas(3); c.gbPdfFooter(sin);
  assert.equal(sin.textos.filter(t=>/Página/.test(t)).length,0,'la propuesta no debe numerar');
});
await test('la cotización numera sus páginas y pone el total en la primera hoja',()=>{
  const src=source('app-cotizar.js');
  assert.ok(/gbPdfFooter\(doc,\{numerar:true\}\)/.test(src),'genPDF debe pedir numeración');
  assert.ok(/TOTAL DE LA COTIZACIÓN/.test(src)&&/doc\.text\(fm\(tot\),W-mg-4/.test(src),'el resumen de la página 1 debe usar el mismo tot que el recuadro verde');
});
await test('un pago rechazado por permiso no ofrece reintentar',()=>{
  const src=source('app-historial.js');
  const i=src.indexOf('gbEsErrorDePermiso(e)'), j=src.indexOf('PERSISTENT ERROR MODAL');
  assert.ok(i>0&&j>i,'la rama de permiso debe ir ANTES del modal con Reintentar');
  const rama=src.slice(i,j);
  assert.ok(/return;/.test(rama)&&!/Reintentar/.test(rama),'la rama de permiso debe salir sin ofrecer reintentar');
});

// v7.9.30 REV-03: todo campo que escriben los guardados REALES debe estar clasificado.
// La firma de contenido es una lista blanca: un campo nuevo que nadie clasifique queda sin
// protección de concurrencia EN SILENCIO. Esta prueba convierte ese silencio en un fallo.
// Al añadir un campo al guardado: si lo edita el usuario → EDITABLE_FIELDS (y su etiqueta);
// si lo mueve la operación → OPERATIONAL_FIELDS; si lo calcula el sistema → esta lista,
// con su motivo. Fue esta prueba la que descubrió el total desfasado de v7.9.26.
const DERIVADOS_Y_SISTEMA={
  quoteNumber:'identidad del documento',
  type:'tipo de documento, fijo',
  year:'año del consecutivo, fijo',
  dateISO:'fecha de emisión, la pone el sistema',
  dateLocal:'fecha de emisión legible, la pone el sistema',
  updatedAt:'sello de servidor',
  total:'DERIVADO de productos y transporte: se recalcula tras adoptar (recalcularTotalTrasAdoptar)'
};
await test('REV-03: cada campo que escriben los guardados reales está clasificado',async()=>{
  const src=source('app-core.js');
  const EDIT=JSON.parse(src.match(/const EDITABLE_FIELDS=(\[[^\]]*\])/)[1]);
  const OPER=JSON.parse(src.match(/const OPERATIONAL_FIELDS=(\[[^\]]*\])/)[1]);
  for(const kind of ['quote','proposal']){
    const f=editorFixture(kind);const r=await f.save(true);
    assert.ok(r&&r.ok,kind+': el guardado del arnés debe funcionar: '+JSON.stringify(f.messages));
    const escritos=Object.keys(f.store.get(f.path));
    const sin=escritos.filter(k=>!EDIT.includes(k)&&!OPER.includes(k)&&!(k in DERIVADOS_Y_SISTEMA));
    assert.deepEqual(sin,[],kind+': campos guardados sin clasificar (ver comentario de esta prueba): '+sin.join(', '));
  }
});
async function escenarioOtraSesionCambiaContenido(kind,cambiarContenido){
  const f=editorFixture(kind);
  assert.ok((await f.save(true))?.ok);
  const abierto=structuredClone(f.store.get(f.path));
  f.c.rememberEditBase(kind,'q',abierto);           // A abre el documento
  cambiarContenido(f.store.get(f.path));            // B cambia el contenido y guarda
  f.c.$('f-att').value='Sólo cambió Atención';      // A toca otra cosa y guarda
  const r=await f.save(true);
  return {f,r,doc:f.store.get(f.path)};
}
await test('cotización: si otra sesión cambió los productos, el total se recalcula y cuadra',async()=>{
  const {f,r,doc}=await escenarioOtraSesionCambiaContenido('quote',d=>{d.cart=structuredClone(d.cart);d.cart[0].qty=5;d.total=500});
  assert.ok(r?.ok,JSON.stringify(f.messages));
  assert.equal(doc.att,'Sólo cambió Atención','la edición de A se guarda');
  assert.equal(doc.cart[0].qty,5,'se adoptan los productos de B');
  const suma=doc.cart.reduce((s,i)=>s+i.p*i.qty,0);
  assert.equal(doc.total,suma,'el total debe cuadrar con los productos (antes quedaba el total viejo)');
});
await test('cotización: si nadie tocó los productos, el total es el del formulario',async()=>{
  const {r,doc}=await escenarioOtraSesionCambiaContenido('quote',d=>{d.eventDate='2026-12-01'});
  assert.ok(r?.ok);assert.equal(doc.total,100,'sin adoptar productos no se recalcula nada');
});
await test('propuesta: si otra sesión cambió secciones, el total guardado es el que lee la app',async()=>{
  const {f,r,doc}=await escenarioOtraSesionCambiaContenido('proposal',d=>{d.sections=[{id:'s',name:'Menú',options:[{id:'o',label:'A',items:[{name:'x',qty:3,price:1000}]}]}]});
  assert.ok(r?.ok,JSON.stringify(f.messages));
  assert.equal(doc.total,f.c.computePropTotal(doc),'total guardado = computePropTotal (lo que usa getDocTotal)');
});
// v7.9.30 REV-04: generar una PF no le quita al editor el documento que tenía abierto.
function pfEmisionFixture(genPropPDF){
  const g={window:{},currentPropNumber:'GB-P-2026-0001',genPropPDF};
  const c=loadSourceFunctions([['app-propuesta.js','emitirPdfPropFinal']],g);
  return c;
}
await test('REV-04: al emitir el PDF de una PF, el editor recupera su documento',async()=>{
  let durante=null;
  const c=pfEmisionFixture(async()=>{durante=c.currentPropNumber});
  await c.emitirPdfPropFinal('GB-PF-2026-0100',{quoteNumber:'GB-PF-2026-0100'});
  assert.equal(durante,'GB-PF-2026-0100','durante la emisión apunta a la PF');
  assert.equal(c.currentPropNumber,'GB-P-2026-0001','después vuelve a la propuesta que estaba abierta');
  assert.equal(c.window.__pfMode,false);
});
await test('REV-04: si el PDF falla, el editor igual recupera su documento',async()=>{
  const c=pfEmisionFixture(async()=>{throw new Error('fixture')});
  await assert.rejects(c.emitirPdfPropFinal('GB-PF-2026-0100',{}));
  assert.equal(c.currentPropNumber,'GB-P-2026-0001');assert.equal(c.window.__pfMode,false);
});
await test('REV-04: si durante la emisión se abrió otro documento, se respeta',async()=>{
  const c=pfEmisionFixture(async()=>{c.currentPropNumber='GB-P-2026-0999'});
  await c.emitirPdfPropFinal('GB-PF-2026-0100',{});
  assert.equal(c.currentPropNumber,'GB-P-2026-0999');
});

// ════ v7.9.31 — respuesta a la revisión independiente de Codex (ronda 1) ════
// P1-01: en el FORMULARIO, un campo presente y vacío es una decisión ("lo quiero
// vacío"), no una ausencia de opinión. En los DOCUMENTOS (base y remoto) ausente y
// vacío siguen siendo el mismo estado, para no reabrir el conflicto falso de REV-01.
const conflictoDe=(c,base,form,fresco)=>{
  try{return {conflicto:null,adopt:plain(c.resolveEditableConflicts(form,fresco,{id:'q',fields:c.editableFieldSignatures(base)},'q'))}}
  catch(e){return {conflicto:plain(e.fields||[]),mensaje:e.message}}
};
await test('P1-01 (1) vacío local frente a cambio remoto: conflicto, no se pierde el borrado',()=>{
  const c=loadSourceFunctions(mergeEntries);
  assert.deepEqual(conflictoDe(c,{att:'Compras'},{att:''},{att:'Ventas'}).conflicto,['att']);
});
await test('P1-01 (2) cambio local frente a borrado remoto: conflicto en sus tres formas',()=>{
  const c=loadSourceFunctions(mergeEntries);
  for(const fresco of [{},{att:''},{att:null}])
    assert.deepEqual(conflictoDe(c,{att:'Compras'},{att:'Nuevo'},fresco).conflicto,['att'],'remoto '+JSON.stringify(fresco));
});
await test('P1-01 (3) ambos lados convergen al mismo vacío: sin conflicto y queda vacío',()=>{
  const c=loadSourceFunctions(mergeEntries);
  for(const fresco of [{att:''},{att:null},{}]){
    const r=conflictoDe(c,{att:'Compras'},{att:''},fresco);
    assert.equal(r.conflicto,null,'remoto '+JSON.stringify(fresco)+': '+r.mensaje);
    assert.ok(!r.adopt.includes('att'));
    const out=c.mergeOperationalFields({att:''},fresco,r.adopt);
    assert.ok(out.att===''||out.att==null,'debe quedar vacío');
  }
});
await test('P1-01 (4) propiedad ausente ≠ propiedad presente vacía ("", null o undefined)',()=>{
  const c=loadSourceFunctions(mergeEntries);
  const ausente=conflictoDe(c,{att:'Compras'},{},{att:'Ventas'});
  assert.equal(ausente.conflicto,null);assert.deepEqual(ausente.adopt,['att'],'ausente = no opino: se adopta el remoto');
  for(const vacio of ['',null,undefined]){
    const form={att:vacio};
    assert.deepEqual(conflictoDe(c,{att:'Compras'},form,{att:'Ventas'}).conflicto,['att'],'presente '+String(vacio)+' = decisión del usuario');
  }
});
await test('P1-01 no reabre REV-01: documento sin fecha, formulario sin tocar y reagendamiento remoto',()=>{
  const c=loadSourceFunctions(mergeEntries);
  for(const base of [{},{eventDate:null},{eventDate:''}]){
    const r=conflictoDe(c,base,{eventDate:''},{eventDate:'2026-10-02'});
    assert.equal(r.conflicto,null,'base '+JSON.stringify(base)+': '+r.mensaje);
    assert.deepEqual(r.adopt,['eventDate']);
  }
});
await test('ADV-02 la versión hija no hereda propiedades undefined al adoptar un borrado remoto',async()=>{
  const f=editorFixture('quote');f.c.shouldVersionWithSuffix=()=>true;
  const base={...structuredClone(f.store.get(f.path)),att:'Compras'};
  f.store.set(f.path,structuredClone(base));f.c.rememberEditBase('quote','q',base);
  f.c.$('f-att').value='Compras';                    // A no tocó Atención
  delete f.store.get(f.path).att;                    // B la borró del documento
  await f.save(false);
  const hija=f.store.get(f.childPath);
  assert.ok(hija,'debe haberse creado la versión hija: '+JSON.stringify(f.messages));
  const indefinidos=Object.keys(hija).filter(k=>hija[k]===undefined);
  assert.deepEqual(indefinidos,[],'Firestore rechaza escribir undefined');
});

// P1-02: duplicar una propuesta no puede heredar estado del documento abierto antes.
// Semántica definida en v7.9.31 (ver plan): la duplicación COPIA el contenido-plantilla
// del documento fuente; los datos del cliente, la ciudad/transporte y la marca de
// factura sólo si se pide conservar el cliente; y NO copia nada propio de un evento
// concreto: despachos, asignación del menaje, fecha, hora, personas, momento,
// vencimiento, notas internas, número, estado ni movimientos.
function duplicacionFixture(){
  const dom={};const el=id=>dom[id]||(dom[id]={value:'',checked:false,classList:{add(){},remove(){},toggle(){}}});
  const nada=()=>{};
  const g={console:quiet,window:{},document:{querySelectorAll:()=>[]},$:el,toast:nada,setMode:nada,closeDuplicateModal:nada,updTrP:nada,renderDespachos:nada,
    showClientHistoryPanel:nada,renderPropSections:nada,renderMenaje:nada,renderPersonal:nada,renderCondiciones:nada,renderReposicion:nada,renderPropEditBanners:nada,
    setFirma:nada,setDefaultFechaVenc:nada,setTipoServ:nada,DEFAULT_CONDICIONES:{c1:'Condición por defecto'},CONDICIONES_TITULOS:{c1:'Título'},
    // Estado de la propuesta A, abierta en el editor antes de duplicar B
    currentPropNumber:'GB-P-A',currentDespachos:[{id:'dA',fechaHora:'2026-12-01T09:00',status:'entregado',entregaData:{nombreReceptor:'Portería A'}}],
    menajeAssignedTo:'dA',menajeOptions:[{id:'opA',label:'A',items:[{name:'Copa de A',qty:50}]}],activeMenajeOptionId:'opA',
    reposicionByOption:{opA:{'Copa de A':9999}},reposicionData:{},condicionesLista:[{id:'x',titulo:'Condición de A',texto:'sólo A'}],condicionesData:{},
    tituloMenaje:'Menaje de A',tituloPersonal:'Personal de A',incluirReposicion:true,tipoServicio:'A',propSections:[{id:'sA'}],menajeItems:[],personalData:{},
    aperturaFrase:'Frase A',fechaVencimiento:'2026-12-31',firmaProp:'km',
    dupSource:{kind:'proposal',coll:'proposals',data:{
      client:'Cliente B',att:'Compras B',idStr:'NIT 900',mail:'b@example.invalid',tel:'300',dir:'Calle B',city:'Cajicá',cityType:'Cajicá',
      eventDate:'2026-10-20',horaEntrega:'15:00',pers:'80',momento:'Almuerzo',fechaVencimiento:'2026-10-01',
      sections:[{id:'sB',name:'Menú B',incluirEnTotal:true,options:[{id:'oB',label:'Única',items:[{name:'Plato B',qty:80,price:1000}]}]}],
      menajeOptions:[{id:'opB',label:'Opción B',items:[{name:'Plato hondo B',qty:80}]}],propFinalSelection:{menaje:'opB'},menaje:[{name:'Plato hondo B',qty:80}],
      reposicionByOption:{opB:{'Plato hondo B':18000}},incluirReposicion:false,
      condicionesLista:[{id:'cB',titulo:'Condición de B',texto:'sólo B'}],tituloMenaje:'Menaje de B',tituloPersonal:'Personal de B',tipoServicio:'B',
      personalData:{meseros:{cantidad:'4'},auxiliares:{cantidad:'1'}},aperturaFrase:'Frase B',firma:'jp',
      despachos:[{id:'dB',fechaHora:'2026-10-20T10:00',status:'entregado',entregaData:{nombreReceptor:'Portería B'}}],menajeAssignedTo:'dB',
      notasInternas:'Nota privada del cliente B',requiereFE:true,status:'aprobada',pagos:[{monto:1}]}}};
  el('fp-notas-internas').value='Nota privada del cliente A';el('fp-requiere-fe').checked=true;el('fp-city').value='Chía';el('fp-hora-entrega').value='08:00';
  const c=loadSourceFunctions([...editEntries,...core('markEditorContext','gbNotasNormalizar'),
    ['app-propuesta.js','initCondiciones'],['app-propuesta.js','loadDespachosFromDoc'],['app-propuesta.js','readDespachosFromForm'],
    ['app-propuesta.js','_syncActiveMenajeRefs'],['app-propuesta.js','loadPropQuote'],['app-historial.js','duplicateQuote']],g);
  return {c,el};
}
function nadaDeA(c,el){
  // Contrato de readDespachosFromForm: sin despachos devuelve undefined y el guardado no los escribe.
  assert.deepEqual(plain(c.currentDespachos),[],'no hereda despachos (ni de A ni de B)');
  assert.equal(c.readDespachosFromForm(),undefined,'el guardado no escribirá despachos');
  assert.equal(c.menajeAssignedTo,null,'no hereda la asignación del menaje');
  assert.deepEqual(plain(c.menajeOptions),[{id:'opB',label:'Opción B',items:[{name:'Plato hondo B',qty:80}]}],'menaje de B, no de A');
  assert.equal(c.activeMenajeOptionId,'opB');
  assert.deepEqual(plain(c.reposicionByOption),{opB:{'Plato hondo B':18000}},'reposición de B, no de A');
  assert.deepEqual(plain(c.condicionesLista).map(x=>x.titulo),['Condición de B'],'condiciones de B, no de A');
  assert.equal(c.tituloMenaje,'Menaje de B');assert.equal(c.tituloPersonal,'Personal de B');assert.equal(c.incluirReposicion,false);
  assert.equal(el('fp-notas-internas').value,'','las notas internas son de un evento: no se copian');
  for(const id of ['fp-date','fp-hora-entrega','fp-pers','fp-momento'])assert.equal(el(id).value,'',id+' es del evento: se vacía');
  assert.equal(c.currentPropNumber,null,'es un documento nuevo');
}
await test('P1-02 (5) abrir A, duplicar B: no se hereda nada de A ni la logística de B',()=>{
  const {c,el}=duplicacionFixture();
  c.duplicateQuote(false);
  nadaDeA(c,el);
  assert.equal(el('fp-cli').value,'');assert.equal(el('fp-city').value,'','sin conservar cliente, sin ciudad');
  assert.equal(el('fp-requiere-fe').checked,false,'sin conservar cliente, sin marca de factura de A');
});
await test('P1-02 (6) semántica: conservando cliente se copian sus datos, ciudad y factura, nunca la logística',()=>{
  const {c,el}=duplicacionFixture();
  c.duplicateQuote(true);
  nadaDeA(c,el);
  assert.equal(el('fp-cli').value,'Cliente B');assert.equal(el('fp-att').value,'Compras B');
  assert.equal(el('fp-city').value,'Cajicá','la ciudad del cliente sí se copia');
  assert.equal(el('fp-requiere-fe').checked,true,'la factura electrónica es del cliente: se copia');
  assert.equal(plain(c.propSections)[0].name,'Menú B');
});
await test('P1-02 la copia es profunda: editar el duplicado no toca la fuente',()=>{
  const {c}=duplicacionFixture();
  c.duplicateQuote(false);
  c.menajeOptions[0].items[0].qty=1;c.propSections[0].name='cambiado';
  assert.equal(c.dupSource.data.menajeOptions[0].items[0].qty,80);assert.equal(c.dupSource.data.sections[0].name,'Menú B');
});

// Misma clase que P1-02, en cotizaciones (no la reportó Codex; se encontró al corregir P1-02).
function duplicacionCotFixture(){
  const dom={};const el=id=>dom[id]||(dom[id]={value:'',checked:false,classList:{add(){},remove(){},toggle(){}}});
  const nada=()=>{};
  const g={console:quiet,window:{},document:{querySelectorAll:()=>[]},$:el,toast:nada,setMode:nada,closeDuplicateModal:nada,updTr:nada,togMom:nada,go:nada,setFirma:nada,
    C:[],cart:[{id:'viejo',n:'de A',p:1,qty:1}],cust:[],DEFAULT_NOTAS_COT:{n1:'nota'},NOTAS_COT_TITULOS:{n1:'t'},gbNotasNormalizar:()=>[],
    notasCotData:{},notasCotLista:[],tituloInstruccionesPago:'',tituloCondiciones:'',firmaCot:'km',currentQuoteNumber:'GB-A',
    dupSource:{kind:'quote',coll:'quotes',data:{client:'Cliente B',att:'Compras B',idStr:'NIT 900',cityType:'Bogotá',city:'Bogotá',
      cart:[{id:'p1',n:'Producto B',p:1000,qty:2}],cust:[],notasInternas:'Nota privada B',requiereFE:true,firma:'jp'}}};
  el('f-notas-internas').value='Nota privada del cliente A';el('f-requiere-fe').checked=true;
  const c=loadSourceFunctions([...editEntries,...core('markEditorContext'),...opcional('app-core.js','cargarCotizacionEnEditor'),['app-historial.js','duplicateQuote']],g);
  return {c,el};
}
await test('duplicar cotización sin conservar cliente: sin notas internas ni factura de la cotización anterior',()=>{
  const {c,el}=duplicacionCotFixture();
  c.duplicateQuote(false);
  assert.equal(el('f-notas-internas').value,'','las notas internas son de un pedido: no se heredan ni se copian');
  assert.equal(el('f-requiere-fe').checked,false,'sin conservar cliente no hay factura de nadie');
  assert.equal(c.currentQuoteNumber,null);
});
await test('duplicar cotización conservando cliente: la factura es del cliente B, las notas no se copian',()=>{
  const {c,el}=duplicacionCotFixture();
  c.duplicateQuote(true);
  assert.equal(el('f-requiere-fe').checked,true,'factura electrónica del cliente B');
  assert.equal(el('f-notas-internas').value,'');
  assert.equal(el('f-cli').value,'Cliente B');
});

// P2-01 (7): un fallo de permisos al pedir el consecutivo se muestra traducido.
for(const kind of ['quote','proposal']){
  await test('P2-01 (7) '+kind+': permiso negado en getNextNumber se muestra en español, sin texto de Firestore',async()=>{
    const f=editorFixture(kind);
    f.c[kind==='quote'?'currentQuoteNumber':'currentPropNumber']=null;
    f.c.getNextNumber=async()=>{const e=new Error('Missing or insufficient permissions.');e.code='permission-denied';throw e};
    await f.save(false);
    const m=f.messages.join(' | ');
    assert.ok(/no tiene permiso/.test(m),'mensaje: '+m);
    assert.ok(!/Missing|insufficient|permission-denied/i.test(m),'filtra texto técnico: '+m);
  });
}

// ════ v7.9.32 — respuesta a la segunda revisión independiente de Codex (ronda 2) ════
// Editor REAL: cargador y guardado de la fuente, con un DOM simulado. Las funciones que
// sólo existen desde v7.9.32 se cargan si están, para que sobre v7.9.31 estas pruebas
// fallen por COMPORTAMIENTO y no por no encontrar una función.
function domSimulado(){
  const dom={};
  const el=id=>dom[id]||(dom[id]={id,value:'',checked:false,classList:{add(){},remove(){},toggle(){}}});
  return {dom,el};
}
const nada=()=>{};
const editorComun=()=>({
  ...common(),document:{querySelectorAll:()=>[]},cloudOnline:true,APP_YEAR:2026,
  shouldVersionWithSuffix:()=>false,confirmModal:async()=>true,buildChildNumber:n=>n+'-A',h:String,STATUS_META:{},diffDocs:()=>[],
  cambiosAfectanCliente:()=>false,registerCustomProduct:async()=>{},closeDuplicateModal:nada,setMode:nada,setFirma:nada,go:nada,
  showClientHistoryPanel:nada,prompt:()=>''
});
function propReal(docs){
  const {fb,store}=fakeDb(Object.fromEntries(Object.entries(docs).map(([id,d])=>['proposals/'+id,structuredClone(d)])));
  const {el}=domSimulado();const messages=[];
  const g={...editorComun(),window:{fb},$:el,toast:m=>messages.push(m),currentPropNumber:null,
    propSections:[],menajeItems:[],menajeOptions:[],activeMenajeOptionId:null,menajeAssignedTo:null,personalData:{},tipoServicio:'',
    tituloMenaje:'',tituloPersonal:'',condicionesLista:[],condicionesData:{},reposicionByOption:{},reposicionData:{},incluirReposicion:null,
    aperturaFrase:'',fechaVencimiento:'',firmaProp:'jp',currentDespachos:[],DEFAULT_CONDICIONES:{c1:'Condición'},CONDICIONES_TITULOS:{c1:'Título'},
    DEFAULT_MENAJE:['Plato'],updTrP:nada,renderDespachos:nada,renderPropSections:nada,renderMenaje:nada,renderPersonal:nada,renderCondiciones:nada,
    renderReposicion:nada,renderPropEditBanners:nada,setDefaultFechaVenc:nada,rememberPricesFromProposal:nada,loadLastPersonalRates:nada,
    applyPriceMemorySuggestions:nada,getNextNumber:async()=>'nuevo'};
  const c=loadSourceFunctions([...mergeEntries,...core('TR','computePropTotal','getCityNameP','getTrP','getPropIdStr','markEditorContext','gbNotasNormalizar','gbNotasALegacy','gbEsErrorDePermiso','gbMensajeError','newProp'),
    ...['initCondiciones','loadDespachosFromDoc','readDespachosFromForm','resetDespachos','_syncActiveMenajeRefs','getIncluirReposicion','loadPropQuote','_savePropQuoteImpl'].map(n=>['app-propuesta.js',n]),
    ...opcional('app-propuesta.js','formularioPropuesta'),['app-historial.js','duplicateQuote']],g);
  return {c,store,el,messages,
    abrir:id=>c.loadPropQuote({...structuredClone(store.get('proposals/'+id)),quoteNumber:id}),
    guardar:()=>c._savePropQuoteImpl(true),
    doc:id=>store.get('proposals/'+id)};
}
function cotReal(docs){
  const {fb,store}=fakeDb(Object.fromEntries(Object.entries(docs).map(([id,d])=>['quotes/'+id,structuredClone(d)])));
  const {el}=domSimulado();const messages=[];
  const g={...editorComun(),window:{fb},$:el,toast:m=>messages.push(m),currentQuoteNumber:null,C:[],cart:[],cust:[],curStep:'info',
    notasCotData:{},notasCotLista:[],DEFAULT_NOTAS_COT:{n1:'Nota'},NOTAS_COT_TITULOS:{n1:'Título'},tituloInstruccionesPago:'',tituloCondiciones:'',
    firmaCot:'km',updTr:nada,togMom:nada,renderR:nada,getNextNumber:async()=>'nuevo'};
  const c=loadSourceFunctions([...mergeEntries,...core('TR','getTr','getTotal','allIt','getIdStr','getCityName','getMomentos','getDelivStr','getCollectionName',
    'markEditorContext','gbNotasNormalizar','gbNotasALegacy','gbEsErrorDePermiso','gbMensajeError','loadQuote','newQuote'),
    ...opcional('app-core.js','cargarCotizacionEnEditor'),...opcional('app-cotizar.js','formularioCotizacion'),
    ['app-cotizar.js','_saveCurrentQuoteImpl'],['app-historial.js','duplicateQuote']],g);
  return {c,store,el,messages,
    abrir:id=>c.loadQuote('quote',id),
    guardar:()=>c._saveCurrentQuoteImpl(true),
    doc:id=>store.get('quotes/'+id)};
}
const seccion=(id,precio=100000)=>({id,name:'Menú '+id,options:[{id:'o'+id,label:'Opción A',items:[{name:'Plato '+id,qty:1,price:precio,catId:'c'}]}]});

// P1-R2-01: un valor que el editor normalizó al abrir no es una edición del usuario.
await test('P1-R2-01 (1) propuesta sin secciones ni personal: otra sesión los añade y el guardado los adopta',async()=>{
  const f=propReal({p:{client:'Cliente',att:'Compras',status:'enviada'}});
  await f.abrir('p');
  f.doc('p').sections=[seccion('s1')];
  f.doc('p').personalData={meseros:{cantidad:'3',valor4h:'100000',horasExtra:'',valorHoraExtra:''},auxiliares:{cantidad:'',valor4h:'',horasExtra:'',valorHoraExtra:''}};
  f.el('fp-att').value='Ventas';
  const r=await f.guardar();
  assert.equal(r?.ok,true,'conflicto falso: '+JSON.stringify(f.messages));
  assert.equal(f.doc('p').att,'Ventas');
  assert.equal(f.doc('p').sections.length,1,'se adoptan las secciones de la otra sesión');
  assert.equal(f.doc('p').personalData.meseros.cantidad,'3','se adopta el personal de la otra sesión');
});
await test('P1-R2-01 contenedores vacíos del formulario frente a campo ausente (reproducción de Codex, sin firma de formulario)',()=>{
  const c=loadSourceFunctions(mergeEntries);
  const listas=conflictoDe(c,{},{sections:[]},{sections:[{id:'s1',name:'Nueva'}]});
  assert.equal(listas.conflicto,null,listas.mensaje);assert.deepEqual(listas.adopt,['sections']);
  const objeto=conflictoDe(c,{},{personalData:{}},{personalData:{meseros:{cantidad:'2'}}});
  assert.equal(objeto.conflicto,null,objeto.mensaje);assert.deepEqual(objeto.adopt,['personalData']);
});
await test('P1-R2-01 (2) el usuario vacía la lista y la otra sesión la cambia distinto: conflicto',async()=>{
  const f=propReal({p:{client:'Cliente',status:'enviada',sections:[seccion('s1')]}});
  await f.abrir('p');
  f.c.propSections=[];
  f.doc('p').sections=[seccion('s1'),seccion('s2')];
  const antes=plain(f.doc('p'));
  assert.equal(await f.guardar(),undefined);
  assert.deepEqual(plain(f.doc('p')),antes,'no se escribe nada');
  assert.ok(f.messages.some(m=>m.includes('Secciones del menú')),JSON.stringify(f.messages));
});
await test('P1-R2-01 (3) sin tocar la lista, la otra sesión la vacía: se adopta el vacío',async()=>{
  for(const vaciar of [d=>{d.sections=[]},d=>{delete d.sections}]){
    const f=propReal({p:{client:'Cliente',att:'Compras',status:'enviada',sections:[seccion('s1')]}});
    await f.abrir('p');
    vaciar(f.doc('p'));
    f.el('fp-att').value='Ventas';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal((f.doc('p').sections||[]).length,0,'la otra sesión vació las secciones');
    assert.equal(f.doc('p').att,'Ventas');
  }
});
await test('P1-R2-01 (4) ambos lados vacían la lista, por caminos distintos: sin conflicto',async()=>{
  for(const vaciar of [d=>{d.sections=[]},d=>{delete d.sections},d=>{d.sections=null}]){
    const f=propReal({p:{client:'Cliente',status:'enviada',sections:[seccion('s1')]}});
    await f.abrir('p');
    f.c.propSections=[];
    vaciar(f.doc('p'));
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal((f.doc('p').sections||[]).length,0);
  }
});
await test('P1-R2-01 (5) por el camino real se conservan P1-01 y REV-01',async()=>{
  const a=propReal({p:{client:'Cliente',att:'Compras',status:'enviada'}});
  await a.abrir('p');a.el('fp-att').value='';a.doc('p').att='Ventas';
  assert.equal(await a.guardar(),undefined,'P1-01: el borrado local no se pierde');
  assert.ok(a.messages.some(m=>m.includes('(Atención)')),JSON.stringify(a.messages));
  const b=propReal({p:{client:'Cliente',status:'enviada'}});
  await b.abrir('p');b.doc('p').eventDate='2026-11-15';b.doc('p').horaEntrega='10:00';b.el('fp-tel').value='300';
  assert.equal((await b.guardar())?.ok,true,'REV-01: '+JSON.stringify(b.messages));
  assert.equal(b.doc('p').eventDate,'2026-11-15');assert.equal(b.doc('p').tel,'300');
});

// CL-R2-01 (encontrado por Claude): tras adoptar un campo de otra sesión, el formulario
// sigue mostrando el valor viejo; un segundo guardado no puede devolverlo.
for(const [kind,fixture,fecha] of [['quote',cotReal,'f-date'],['proposal',propReal,'fp-date']]){
  await test('CL-R2-01 '+kind+': guardar dos veces después de adoptar un reagendamiento no revierte la fecha',async()=>{
    const f=fixture({q:{client:'Cliente',status:'enviada',eventDate:'2026-10-01',cart:[{id:'p',n:'Producto',p:1000,qty:1}]}});
    await f.abrir('q');
    assert.equal(f.el(fecha).value,'2026-10-01');
    f.doc('q').eventDate='2026-10-02';                         // otra sesión reagenda
    f.el(kind==='quote'?'f-att':'fp-att').value='Primera edición';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.doc('q').eventDate,'2026-10-02','primer guardado: adopta');
    f.el(kind==='quote'?'f-att':'fp-att').value='Segunda edición';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.doc('q').att,'Segunda edición');
    assert.equal(f.doc('q').eventDate,'2026-10-02','el segundo guardado no debe devolver la fecha vieja');
  });
}

// P1-02 / P1-R2-02: ni abrir ni duplicar pueden dejar valores del documento anterior.
await test('P1-R2-02 abrir una propuesta sin ciudad después de otra con ciudad: sin ciudad ni transporte, y el total no lo suma',async()=>{
  const f=propReal({a:{client:'A',status:'enviada',city:'Tabio',cityType:'Otra',trCustom:'90000',sections:[seccion('sa')]},
                   b:{client:'B',status:'enviada',sections:[seccion('sb')]}});
  await f.abrir('a');
  assert.equal(f.el('fp-city').value,'Otra');
  await f.abrir('b');
  for(const id of ['fp-city','fp-city-custom','fp-tr-custom'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
  f.el('fp-att').value='Compras B';
  assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
  assert.equal(f.doc('b').cityType||'','');assert.equal(f.doc('b').trCustom||'','');
  assert.equal(f.doc('b').total,100000,'el transporte de A no puede entrar en el total de B');
});
await test('P1-R2-02 abrir una cotización sin ciudad después de otra con ciudad: sin ciudad ni transporte, y el total no lo suma',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',city:'Tabio',cityType:'Otra',trCustom:'90000',cart:[{id:'p',n:'Producto',p:100000,qty:1}]},
                  b:{client:'B',status:'enviada',cart:[{id:'p',n:'Producto',p:100000,qty:1}]}});
  await f.abrir('a');
  await f.abrir('b');
  for(const id of ['f-city','f-city-custom','f-tr-custom'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
  f.el('f-att').value='Compras B';
  assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
  assert.equal(f.doc('b').cityType||'','');assert.equal(f.doc('b').total,100000,'el transporte de A no puede entrar en el total de B');
});
await test('P1-02 duplicar una propuesta sin ciudad conservando el cliente, con A en otra ciudad: el duplicado guardado no lleva la ciudad de A',async()=>{
  const f=propReal({a:{client:'A',status:'enviada',city:'Tabio',cityType:'Otra',trCustom:'90000',horaEntrega:'08:30',eventDate:'2026-12-01',sections:[seccion('sa')]}});
  await f.abrir('a');
  f.c.dupSource={kind:'proposal',coll:'proposals',data:{client:'B',att:'Compras B',sections:[seccion('sb')],status:'aprobada'}};
  f.c.duplicateQuote(true);
  for(const id of ['fp-city','fp-city-custom','fp-tr-custom','fp-hora-entrega','fp-date'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
  assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
  const d=f.doc('nuevo');
  assert.equal(d.client,'B');assert.equal(d.cityType||'','');assert.equal(d.trCustom||'','');assert.equal(d.horaEntrega,undefined);assert.equal(d.eventDate||'','');
  assert.equal(d.total,100000,'sin transporte de A');
});
for(const conservar of [true,false]){
  await test('P1-02 duplicar una cotización sin ciudad ni hora '+(conservar?'conservando':'sin conservar')+' el cliente: el duplicado guardado no lleva nada de A',async()=>{
    const f=cotReal({a:{client:'A',status:'enviada',city:'Tabio',cityType:'Otra',trCustom:'90000',eventDate:'2026-12-01',horaEntrega:'08:30',
      notasInternas:'Nota privada de A',requiereFE:true,cart:[{id:'p',n:'Producto A',p:100000,qty:1}]}});
    await f.abrir('a');
    f.c.dupSource={kind:'quote',coll:'quotes',data:{client:'B',att:'Compras B',cart:[{id:'p',n:'Producto B',p:100000,qty:1}],status:'pedido'}};
    f.c.duplicateQuote(conservar);
    for(const id of ['f-city','f-city-custom','f-tr-custom','f-hora-entrega','f-date','f-notas-internas'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
    assert.equal(f.el('f-requiere-fe').checked,false,'la factura era de A');
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    const d=f.doc('nuevo');
    assert.equal(d.cityType||'','');assert.equal(d.horaEntrega,undefined);assert.equal(d.eventDate||'','');assert.equal(d.notasInternas,'');assert.equal(d.requiereFE,false);
    assert.equal(d.total,100000,'sin transporte de A');
    assert.equal(d.client,conservar?'B':'Sin nombre');
  });
}
await test('P1-02 duplicar una cotización conservando el cliente copia su ciudad, transporte y factura',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',cart:[{id:'p',n:'Producto A',p:1,qty:1}]}});
  await f.abrir('a');
  f.c.dupSource={kind:'quote',coll:'quotes',data:{client:'B',city:'Tabio',cityType:'Otra',trCustom:'50000',requiereFE:true,eventDate:'2026-10-01',horaEntrega:'10:00',cart:[{id:'p',n:'Producto B',p:100000,qty:1}]}};
  f.c.duplicateQuote(true);
  assert.equal(f.el('f-city').value,'Otra');assert.equal(f.el('f-city-custom').value,'Tabio');assert.equal(f.el('f-tr-custom').value,'50000');
  assert.equal(f.el('f-requiere-fe').checked,true);assert.equal(f.el('f-date').value,'');assert.equal(f.el('f-hora-entrega').value,'');
});

// CL-R2-02 (encontrado por Claude): un documento NUEVO tampoco hereda del anterior.
await test('CL-R2-02 nueva cotización después de abrir otra: sin fecha, hora, notas internas ni factura de la anterior',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',eventDate:'2026-12-01',horaEntrega:'08:30',notasInternas:'Nota privada de A',requiereFE:true,city:'Chía',cityType:'Chía',cart:[{id:'p',n:'Producto A',p:1,qty:1}]}});
  await f.abrir('a');
  await f.c.newQuote();
  for(const id of ['f-date','f-hora-entrega','f-notas-internas','f-cli','f-city'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
  assert.equal(f.el('f-requiere-fe').checked,false);assert.equal(f.c.currentQuoteNumber,null);assert.equal(f.c.cart.length,0);
});
await test('CL-R2-02 nueva propuesta después de abrir otra: sin hora, notas internas, factura ni títulos de la anterior',async()=>{
  const f=propReal({a:{client:'A',status:'enviada',horaEntrega:'08:30',notasInternas:'Nota privada de A',requiereFE:true,tituloMenaje:'Menaje de A',tituloPersonal:'Personal de A',incluirReposicion:true,
    condicionesLista:[{id:'cA',titulo:'Condición de A',texto:'sólo A'}],sections:[seccion('sa')]}});
  await f.abrir('a');
  await f.c.newProp();
  for(const id of ['fp-hora-entrega','fp-notas-internas','fp-cli'])assert.equal(f.el(id).value,'',id+' quedó con el valor de A');
  assert.equal(f.el('fp-requiere-fe').checked,false);
  assert.equal(f.c.tituloMenaje,'');assert.equal(f.c.tituloPersonal,'');assert.equal(f.c.incluirReposicion,null);assert.equal(f.c.currentPropNumber,null);
  assert.deepEqual(plain(f.c.condicionesLista).map(x=>x.titulo),['Título'],'condiciones por defecto, no las de A');
});

// P1-R2-03: la marca de factura electrónica de un documento guardado se puede cambiar.
for(const [kind,fixture,casilla,att,tel] of [['quote',cotReal,'f-requiere-fe','f-att','f-tel'],['proposal',propReal,'fp-requiere-fe','fp-att','fp-tel']]){
  await test('P1-R2-03 '+kind+': abrir carga la factura y se puede cambiar en ambos sentidos',async()=>{
    const f=fixture({q:{client:'Cliente',status:'enviada',requiereFE:false,cart:[{id:'p',n:'Producto',p:1,qty:1}]}});
    await f.abrir('q');assert.equal(f.el(casilla).checked,false);
    f.el(casilla).checked=true;
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));assert.equal(f.doc('q').requiereFE,true,'false → true');
    await f.abrir('q');assert.equal(f.el(casilla).checked,true,'al reabrir se ve marcada');
    f.el(casilla).checked=false;
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));assert.equal(f.doc('q').requiereFE,false,'true → false');
  });
  await test('P1-R2-03 '+kind+': factura con cambio concurrente',async()=>{
    const a=fixture({q:{client:'Cliente',status:'enviada',requiereFE:false,cart:[{id:'p',n:'Producto',p:1,qty:1}]}});
    await a.abrir('q');a.doc('q').requiereFE=true;a.el(att).value='Otra cosa';   // la otra sesión la marca en el modal de factura
    assert.equal((await a.guardar())?.ok,true,JSON.stringify(a.messages));
    assert.equal(a.doc('q').requiereFE,true,'sin tocar la casilla, gana la marca de la otra sesión');
    const b=fixture({q:{client:'Cliente',status:'enviada',requiereFE:false,cart:[{id:'p',n:'Producto',p:1,qty:1}]}});
    await b.abrir('q');b.el(casilla).checked=true;b.doc('q').tel='300';          // ésta la marca; la otra cambia el teléfono
    assert.equal((await b.guardar())?.ok,true,JSON.stringify(b.messages));
    assert.equal(b.doc('q').requiereFE,true,'el cambio del usuario no se descarta');assert.equal(b.doc('q').tel,'300','y se adopta el de la otra sesión');
    const c=fixture({q:{client:'Cliente',status:'enviada',requiereFE:true,cart:[{id:'p',n:'Producto',p:1,qty:1}]}});
    await c.abrir('q');c.el(casilla).checked=false;c.doc('q').requiereFE=false;  // los dos la desmarcan
    assert.equal((await c.guardar())?.ok,true,JSON.stringify(c.messages));assert.equal(c.doc('q').requiereFE,false);
  });
}

// P2-R2-04: ningún mensaje visible muestra el texto técnico de un error.
const TECNICO=/Missing|insufficient|permission-denied|FirebaseError|client is offline|Failed to|INTERNAL|ASSERTION|undefined|TypeError|Cannot read/i;
await test('P2-R2-04 gbMensajeError: lo técnico en español, lo propio intacto, el detalle en consola',()=>{
  const detalles=[];
  const c=loadSourceFunctions(core('gbEsErrorDePermiso','gbMensajeError'),{console:{...quiet,error:(...a)=>detalles.push(a)}});
  const fb=(code,message)=>Object.assign(new Error(message),{name:'FirebaseError',code});
  const red=c.gbMensajeError(fb('unavailable','Failed to get document because the client is offline.'));
  assert.ok(/conexión/i.test(red)&&!TECNICO.test(red),'red: '+red);
  for(const e of [fb('internal','INTERNAL ASSERTION FAILED: Unexpected state'),fb('aborted','Transaction aborted'),new TypeError("Cannot read properties of undefined (reading 'x')"),fb('storage/unknown','An unknown error occurred')]){
    const m=c.gbMensajeError(e);
    assert.ok(m.length>10&&!TECNICO.test(m)&&!m.includes(e.message),'técnico: '+m);
  }
  assert.ok(detalles.length>=5,'el detalle técnico queda en console.error');
  // v7.9.33 (ronda 3): los mensajes propios se muestran porque la app los MARCA (paraUsuario).
  const propio=Object.assign(new Error('La cotización fue eliminada. No se recreó; guarda tus cambios y revisa el historial.'),{paraUsuario:true});
  assert.equal(c.gbMensajeError(propio),propio.message,'los mensajes escritos por la app se muestran tal cual');
  const conflicto=Object.assign(new Error('El contenido cambió en otra sesión (Atención) mientras editabas.'),{code:'EDIT_CONFLICT',paraUsuario:true});
  assert.equal(c.gbMensajeError(conflicto),conflicto.message);
  assert.ok(/no tiene permiso/.test(c.gbMensajeError(fb('permission-denied','Missing or insufficient permissions.'))));
});
function pfErrorFixture(g){
  const messages=[];
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError'),...['openPropFinalFlow','_generarPropuestaFinalImpl','regeneratePropFinal'].map(n=>['app-propuesta.js',n])],
    {...common(),toast:m=>messages.push(m),cloudOnline:true,$:()=>({classList:{remove(){},add(){}}}),renderPropFinalPicker:nada,h:String,...g});
  return {c,messages};
}
const permisoNegado=()=>Object.assign(new Error('Missing or insufficient permissions.'),{name:'FirebaseError',code:'permission-denied'});
await test('P2-R2-04 abrir el selector de Propuesta Final con permiso negado: mensaje en español',async()=>{
  const {c,messages}=pfErrorFixture({window:{fb:{db:{},doc:()=>'x',getDoc:async()=>{throw permisoNegado()}}}});
  await c.openPropFinalFlow('p');
  const m=messages.join(' | ');assert.ok(/no tiene permiso/.test(m)&&!TECNICO.test(m),m);
});
await test('P2-R2-04 generar la Propuesta Final: consecutivo negado y transacción fallida sin texto técnico',async()=>{
  const fuente={id:'p',client:'Cliente',sections:[{id:'s',name:'Menú',options:[{id:'o',label:'A',items:[]}]}]};
  const a=pfErrorFixture({window:{},propFinalSource:fuente,propFinalSelection:{s:'o'},getNextNumber:async()=>{throw permisoNegado()}});
  await a.c._generarPropuestaFinalImpl();
  const ma=a.messages.join(' | ');assert.ok(/no tiene permiso/.test(ma)&&!TECNICO.test(ma),ma);
  const b=pfErrorFixture({window:{_propFinalFlowSeq:0},propFinalSource:fuente,propFinalSelection:{s:'o'},getNextNumber:async()=>'GB-PF-1',APP_YEAR:2026,
    gbNotasNormalizar:()=>[],gbNotasALegacy:()=>({}),DEFAULT_CONDICIONES:{},CONDICIONES_TITULOS:{},menajeAssignedTo:null,inheritPropFinalLogistics:nada,computePropTotal:()=>0,
    commitPropFinal:async()=>{throw Object.assign(new Error('Transaction failed: INTERNAL ASSERTION FAILED'),{name:'FirebaseError',code:'internal'})}});
  await b.c._generarPropuestaFinalImpl();
  const mb=b.messages.join(' | ');assert.ok(mb.length&&!TECNICO.test(mb),mb);
});
await test('P2-R2-04 regenerar una Propuesta Final con permiso negado: mensaje en español',async()=>{
  const {c,messages}=pfErrorFixture({window:{fb:{db:{},doc:()=>'x',getDoc:async()=>{throw permisoNegado()}}}});
  await c.regeneratePropFinal('GB-PF-1');
  const m=messages.join(' | ');assert.ok(/no tiene permiso/.test(m)&&!TECNICO.test(m),m);
});
await test('P2-R2-04 abrir un documento con un fallo de red: mensaje en español',async()=>{
  const f=cotReal({});
  f.c.window.fb.getDoc=async()=>{throw Object.assign(new Error('Failed to get document because the client is offline.'),{name:'FirebaseError',code:'unavailable'})};
  await f.abrir('q');
  const m=f.messages.join(' | ');assert.ok(m.length&&!TECNICO.test(m),m);
});
await test('P2-R2-04 el pago fallido por otra causa ofrece reintentar sin mostrar el detalle técnico',()=>{
  const src=source('app-historial.js');
  const i=src.indexOf('PERSISTENT ERROR MODAL');const modal=src.slice(i,src.indexOf('okLabel:"Reintentar"',i));
  assert.ok(i>0&&/gbMensajeError\(e\)/.test(modal),'el modal debe usar el traductor');
  assert.ok(!/e\.message/.test(modal),'el modal no debe mostrar e.message');
});
// Barrido: en los cinco archivos de la app, ningún mensaje visible concatena e.message.
// Lo que queda permitido es invisible para el usuario y va justificado aquí.
const MESSAGE_PERMITIDOS=[
  [/function gbEsErrorDePermiso|function gbMensajeError|const msg=String\(\(e&&e\.message\)/,'el propio traductor'],
  [/if\(e&&e\.paraUsuario&&e\.message\)return String\(e\.message\)/,'el traductor devuelve sólo los mensajes que la app marcó'],
  [/gbMensajeError\([\w$]+\):[\w$]+\.message/,'respaldo si el traductor no cargó; nunca ocurre (app-core se carga primero)'],
  [/typeof txErr\.message==="string"&&txErr\.message\.startsWith/,'comparación interna, no se muestra'],
  [/pdfUploadLastError/,'se guarda para diagnóstico, no se muestra'],
  [/patch\.errorMsg=/,'bitácora de operaciones'],
  [/renameWarn=|errores\.push\(/,'se registra en consola'],
  [/const _msg=String\(\(e&&e\.message\)\|\|e\|\|""\)/,'traductor']
];
await test('P2-R2-04 barrido: ningún mensaje visible concatena el texto crudo de un error',()=>{
  const crudos=[];
  for(const file of ['app-core.js','app-cotizar.js','app-propuesta.js','app-historial.js','app-dashboard.js']){
    source(file).split('\n').forEach((linea,i)=>{
      // Lo que va DENTRO de una llamada a la consola no se muestra; el resto de la línea sí.
      const visible=linea.replace(/console\.(log|warn|error|info)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g,'');
      if(!/\b[\w$]+\??\.message\b/.test(visible))return;
      if(MESSAGE_PERMITIDOS.some(([re])=>re.test(visible)))return;
      crudos.push(file+':'+(i+1)+'  '+linea.trim().slice(0,110));
    });
  }
  assert.deepEqual(crudos,[],'mensajes con el texto crudo del error:\n'+crudos.join('\n'));
});

// ════ v7.9.33 — respuesta a la tercera revisión independiente de Codex (ronda 3) ════
// A. P1-02 / CL-R2-02: la firma de la cotización la define el documento o el valor por
// defecto explícito ("km", el mismo de la declaración de firmaCot y del PDF), nunca la
// firma que tenía el documento abierto antes.
await test('R3-A nueva cotización después de abrir una firmada por jp: firma km, también en el documento guardado',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',firma:'jp',cart:[{id:'p',n:'Producto',p:1000,qty:1}]}});
  await f.abrir('a');assert.equal(f.c.firmaCot,'jp');
  await f.c.newQuote();
  assert.equal(f.c.firmaCot,'km','la cotización nueva no hereda la firma de A');
  f.c.cart.push({id:'p',n:'Producto',p:1000,qty:1});f.el('f-cli').value='Nuevo';
  assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
  assert.equal(f.doc('nuevo').firma,'km');
});
await test('R3-A abrir una cotización sin firma después de una firmada por jp: firma km',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',firma:'jp',cart:[{id:'p',n:'P',p:1,qty:1}]},b:{client:'B legacy',status:'enviada',cart:[{id:'p',n:'P',p:1,qty:1}]}});
  await f.abrir('a');await f.abrir('b');
  assert.equal(f.c.firmaCot,'km');
});
for(const conservar of [true,false]){
  await test('R3-A duplicar una cotización sin firma '+(conservar?'conservando':'sin conservar')+' el cliente, con A firmada por jp: firma km',async()=>{
    const f=cotReal({a:{client:'A',status:'enviada',firma:'jp',cart:[{id:'p',n:'P',p:1,qty:1}]}});
    await f.abrir('a');
    f.c.dupSource={kind:'quote',coll:'quotes',data:{client:'B legacy',cart:[{id:'p',n:'P',p:1,qty:1}]}};
    f.c.duplicateQuote(conservar);
    assert.equal(f.c.firmaCot,'km');
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.doc('nuevo').firma,'km');
  });
}
await test('R3-A duplicar una fuente con firma propia conserva la suya, no la del documento anterior',async()=>{
  const f=cotReal({a:{client:'A',status:'enviada',firma:'km',cart:[{id:'p',n:'P',p:1,qty:1}]}});
  await f.abrir('a');
  f.c.dupSource={kind:'quote',coll:'quotes',data:{client:'B',firma:'jp',cart:[{id:'p',n:'P',p:1,qty:1}]}};
  f.c.duplicateQuote(false);
  assert.equal(f.c.firmaCot,'jp');
});

// B. CL-R2-01 en la versión hija: el hijo confirmado manda en todo lo local, y el editor
// muestra lo confirmado para que la base nunca sea ficticia.
for(const [kind,fixture,fecha,att,coll] of [['quote',cotReal,'f-date','f-att','quotes'],['proposal',propReal,'fp-date','fp-att','proposals']]){
  await test('R3-B '+kind+': versión hija que adopta un reagendamiento: hijo, caché, base, snapshot y auxiliares coinciden',async()=>{
    const f=fixture({q:{client:'Cliente',status:'enviada',eventDate:'2026-10-01',cart:[{id:'p',n:'Producto',p:1000,qty:2}],sections:[seccion('s1')]}});
    const auxiliares=[];f.c.autoSaveClientDocument=async d=>{auxiliares.push(structuredClone(d))};
    await f.abrir('q');
    f.doc('q').eventDate='2026-10-02';                               // otra sesión reagenda el padre
    f.doc('q').requiereFE=false;                                     // y escribe un valor por defecto que no cambia nada visible
    f.c.shouldVersionWithSuffix=()=>true;                              // el usuario crea una versión hija
    f.el(att).value='Versión nueva';
    const r=await (kind==='quote'?f.c._saveCurrentQuoteImpl(false):f.c._savePropQuoteImpl(false));
    assert.equal(r?.ok,true,JSON.stringify(f.messages));
    const hijo=f.store.get(coll+'/q-A');
    assert.ok(hijo,'debe existir la versión hija');
    assert.equal(hijo.eventDate,'2026-10-02','el hijo adopta la fecha de la otra sesión');
    assert.equal(r.document.eventDate,'2026-10-02','snapshot devuelto');
    assert.equal(r.document.total,hijo.total,'total del snapshot = total del hijo');
    assert.equal(auxiliares.at(-1).eventDate,'2026-10-02','objeto que reciben los auxiliares');
    const cache=f.c.quotesCache.find(x=>x.id==='q-A');
    assert.equal(cache?.eventDate,'2026-10-02','caché');
    const base=f.c.window._gbEditBases[kind];
    assert.equal(base.id,'q-A');
    assert.equal(base.signature,f.c.editableDocumentSignature(hijo),'firma de la base = hijo confirmado');
    assert.deepEqual(plain(base.fields),plain(f.c.editableFieldSignatures(hijo)),'campos de la base = hijo confirmado');
    assert.equal(f.el(fecha).value,'2026-10-02','el editor muestra lo confirmado');
    const aviso=f.messages.find(m=>/otra sesión/.test(m))||'';
    assert.ok(/Fecha de entrega/.test(aviso),'el aviso nombra lo incorporado: '+JSON.stringify(f.messages));
    assert.ok(!/Factura/.test(aviso),'no nombra un valor que no cambió en pantalla: '+aviso);
    // 6. un segundo guardado no revierte el dato remoto
    f.c.shouldVersionWithSuffix=()=>false;
    f.el(att).value='Segunda edición';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.store.get(coll+'/q-A').eventDate,'2026-10-02');
    // 7. escribir el mismo valor remoto no da conflicto
    f.el(fecha).value='2026-10-02';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    // 8. un tercer valor deliberado se guarda: la base no es ficticia
    f.el(fecha).value='2026-10-05';
    assert.equal((await f.guardar())?.ok,true,'no puede quedar atrapado: '+JSON.stringify(f.messages));
    assert.equal(f.store.get(coll+'/q-A').eventDate,'2026-10-05');
    const indefinidos=Object.keys(f.store.get(coll+'/q-A')).filter(k=>f.store.get(coll+'/q-A')[k]===undefined);
    assert.deepEqual(indefinidos,[],'ADV-02');
    assert.equal(f.store.get(coll+'/q').status,'superseded');assert.equal(hijo.parentQuote,'q');
  });
  await test('R3-B '+kind+': guardado directo que adopta: el editor muestra lo confirmado y un valor nuevo del usuario se guarda',async()=>{
    const f=fixture({q:{client:'Cliente',status:'enviada',eventDate:'2026-10-01',cart:[{id:'p',n:'Producto',p:1000,qty:1}],sections:[seccion('s1')]}});
    await f.abrir('q');
    f.doc('q').eventDate='2026-10-02';
    f.el(att).value='Primera';
    assert.equal((await f.guardar())?.ok,true,JSON.stringify(f.messages));
    assert.equal(f.el(fecha).value,'2026-10-02','el editor muestra la fecha adoptada');
    f.el(fecha).value='2026-10-09';
    assert.equal((await f.guardar())?.ok,true,'un valor nuevo del usuario no queda atrapado: '+JSON.stringify(f.messages));
    assert.equal(f.doc('q').eventDate,'2026-10-09');
  });
}

// C. P2-R2-04: sólo se muestran los mensajes que la app marca como aptos para el usuario.
await test('R3-C el traductor oculta un Error común con detalle interno y conserva los mensajes marcados',()=>{
  const detalles=[];
  const c=loadSourceFunctions(core('gbEsErrorDePermiso','gbMensajeError'),{console:{...quiet,error:(...a)=>detalles.push(a)}});
  for(const e of [new Error('Documento GB-1 no existe en Firestore (collection quotes)'),new Error('Transaction failed: INTERNAL ASSERTION FAILED'),new Error('Contador no existe: counters/x'),new Error('productId requerido')]){
    const m=c.gbMensajeError(e);
    assert.ok(!/Firestore|collection|GB-1|INTERNAL|ASSERTION|Contador|counters|productId/.test(m),'técnico visible: '+m);
    assert.ok(m.length>10);
  }
  assert.equal(detalles.length,4,'el detalle queda en la consola');
  const propio=Object.assign(new Error('La cotización fue eliminada. No se recreó; guarda tus cambios y revisa el historial.'),{paraUsuario:true});
  assert.equal(c.gbMensajeError(propio),propio.message);
});
await test('R3-C los mensajes funcionales de guardado siguen llegando al usuario',async()=>{
  // conflicto, documento eliminado, colisión de consecutivo y versión existente, por el camino real
  const a=editorFixture('quote');a.store.get(a.path).client='Otra sesión';await a.save(true);
  assert.ok(a.messages.some(m=>m.includes('(Cliente)')),JSON.stringify(a.messages));
  const b=editorFixture('proposal');b.store.delete(b.path);await b.save(true);
  assert.ok(b.messages.some(m=>m.includes('fue eliminada')),JSON.stringify(b.messages));
  const c=editorFixture('quote');c.c.currentQuoteNumber=null;c.c.getNextNumber=async()=>'q';await c.save(true);
  assert.ok(c.messages.some(m=>m.includes('El número generado ya existe')),JSON.stringify(c.messages));
  const d=editorFixture('proposal');d.c.shouldVersionWithSuffix=()=>true;d.store.set(d.childPath,{client:'Existente'});await d.save(false);
  assert.ok(d.messages.some(m=>m.includes('La versión nueva ya existe')),JSON.stringify(d.messages));
  const e=editorFixture('quote');e.c.shouldVersionWithSuffix=()=>true;e.store.get(e.path).pagos=[{monto:1}];await e.save(false);
  assert.ok(e.messages.some(m=>m.includes('movimientos financieros')),JSON.stringify(e.messages));
});
function pagoFixture(errorDelRunner){
  const {el}=domSimulado();
  Object.assign(el('pm-fecha'),{value:'2026-09-22'});Object.assign(el('pm-monto'),{value:'1000'});
  Object.assign(el('pm-metodo'),{value:'Efectivo'});Object.assign(el('pm-tipo'),{value:'parcial'});
  el('pm-submit-btn').style={};el('pm-submit-btn').textContent='Registrar pago';
  const modales=[];
  const store=new Map();
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',runTransaction:async(_,cb)=>cb({get:async p=>({exists:()=>store.has(p),data:()=>store.get(p)}),update(){}})};
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError','getCollectionName','gbDateToIso'),...['getPagos','totalCobrado','pagoFechaIso','pagoClave','pagoPareceRepetido','submitPago','_submitPagoImpl'].map(n=>['app-historial.js',n]),...opcional('app-historial.js','totalCargos','totalAjustes','saldoPendiente')],{
    ...common(),console:quiet,window:{fb},$:el,cloudOnline:true,pagoSrc:{id:'GB-1',kind:'quote',doc:{total:0,pagos:[]}},pagoFotoBase64:null,
    getDocTotal:()=>0,fm:String,alert(){},closePagoModal(){},renderHist(){},
    logOperacion:async({runner})=>{if(errorDelRunner)throw errorDelRunner;return runner('log1')},
    confirmModal:async o=>{modales.push(o);return false}
  });
  return {c,modales};
}
await test('R3-C pago que falla por un error técnico común: aviso en español, sin jerga, con Reintentar',async()=>{
  const {c,modales}=pagoFixture();       // el documento no existe: error real que lanza submitPago
  await c.submitPago();
  const m=modales.at(-1);
  assert.ok(m,'debe abrirse el modal de error');
  assert.equal(m.okLabel,'Reintentar','conserva Reintentar');
  assert.ok(!/Firestore|collection|GB-1/.test(m.body),'jerga visible: '+m.body);
  for(const tecnico of [new Error('Documento GB-1 no existe en Firestore (collection quotes)'),new Error('Transaction failed: INTERNAL ASSERTION FAILED')]){
    const g=pagoFixture(tecnico);          // el mismo error, lanzado tal cual (caso exacto de Codex)
    await g.c.submitPago();
    assert.ok(!/Firestore|collection|GB-1|INTERNAL|ASSERTION|Transaction failed/.test(g.modales.at(-1).body),g.modales.at(-1).body);
    assert.equal(g.modales.at(-1).okLabel,'Reintentar');
  }
});

// v7.9.34 P-02: aviso de pago repetido (caso real: anticipo registrado dos veces en GB-P-2026-0122-7).
function repetidoFixture({pagos,doc,fecha='2026-09-22',monto='500',tipo='parcial',respuestas=[]}){
  const {el}=domSimulado();
  Object.assign(el('pm-fecha'),{value:fecha});Object.assign(el('pm-monto'),{value:monto});
  Object.assign(el('pm-metodo'),{value:'Nequi'});Object.assign(el('pm-tipo'),{value:tipo});Object.assign(el('pm-notas'),{value:''});
  el('pm-submit-btn').style={};el('pm-submit-btn').textContent='Registrar pago';
  const d=doc||{total:1000,pagos};
  const store=new Map([['quotes/GB-1',plain(d)]]);const escritos=[];const modales=[];
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',runTransaction:async(_,cb)=>cb({get:async p=>({exists:()=>store.has(p),data:()=>store.get(p)}),update(p,v){escritos.push(v)}})};
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError','getCollectionName','gbDateToIso'),...['getPagos','totalCobrado','pagoFechaIso','pagoClave','pagoPareceRepetido','submitPago','_submitPagoImpl'].map(n=>['app-historial.js',n]),...opcional('app-historial.js','totalCargos','totalAjustes','saldoPendiente')],{
    ...common(),window:{fb},$:el,cloudOnline:true,pagoSrc:{id:'GB-1',kind:'quote',doc:d},pagoFotoBase64:null,
    getDocTotal:q=>q.total||0,fm:n=>'$'+n,_showPagoSuccessModal:async()=>{},curMode:'hist',escapeHtml:s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),closePagoModal(){},renderHist(){},
    logOperacion:async({runner})=>runner('log1'),
    confirmModal:async o=>{modales.push(o);return respuestas.length?respuestas.shift():true}
  });
  return {c,modales,escritos};
}
const anticipo={fecha:'2026-09-22',monto:500,metodo:'Nequi',tipo:'anticipo',registradoEn:'2026-09-22T15:00:00Z'};
const esRepetido=m=>/pago repetido/i.test(m.title);
await test('P-02 mismo monto y misma fecha: avisa; «Cancelar» no escribe y conserva el formulario',async()=>{
  const {c,modales,escritos}=repetidoFixture({pagos:[anticipo],respuestas:[false]});
  await c.submitPago();
  assert.ok(modales.some(esRepetido),JSON.stringify(modales.map(m=>m.title)));
  assert.equal(escritos.length,0,'no debe escribir');
  assert.ok(!c.window._submitPagoBusy,'el formulario no queda bloqueado');
});
await test('P-02 mismo caso y «Sí, es otro pago»: registra normalmente',async()=>{
  const {c,modales,escritos}=repetidoFixture({pagos:[anticipo],respuestas:[true,true]});
  await c.submitPago();
  assert.ok(modales.some(esRepetido));
  assert.equal(escritos.length,1);assert.equal(escritos[0].pagos.length,2);
});
await test('P-02 segundo anticipo del mismo monto con otra fecha: avisa',async()=>{
  const {c,modales,escritos}=repetidoFixture({pagos:[anticipo],fecha:'2026-09-25',tipo:'anticipo',respuestas:[false]});
  await c.submitPago();
  assert.ok(modales.some(esRepetido));assert.equal(escritos.length,0);
});
await test('P-02 saldo 50/50 igual al anticipo, otra fecha y tipo saldo: NO avisa',async()=>{
  const {c,modales,escritos}=repetidoFixture({pagos:[anticipo],fecha:'2026-09-25',tipo:'saldo'});
  await c.submitPago();
  assert.ok(!modales.some(esRepetido),JSON.stringify(modales.map(m=>m.title)));
  assert.equal(escritos.length,1);
});
await test('P-02 monto distinto el mismo día: NO avisa por repetido',async()=>{
  const {c,modales}=repetidoFixture({pagos:[anticipo],monto:'300',respuestas:[true]});
  await c.submitPago();
  assert.ok(!modales.some(esRepetido));
});
await test('P-02 documento legacy (anticipo fabricado por getPagos) con mismo monto y fecha: avisa',async()=>{
  const {c,modales}=repetidoFixture({doc:{total:1000,approvalData:{anticipo:500,fechaAprobacion:'2026-09-22',metodoPago:'Nequi'}},respuestas:[false]});
  await c.submitPago();
  assert.ok(modales.some(esRepetido));
});
await test('P-02 una devolución del mismo valor no cuenta como pago repetido',async()=>{
  const {c,modales}=repetidoFixture({pagos:[anticipo,{fecha:'2026-09-23',monto:-500,metodo:'Nequi',tipo:'devolucion'}],monto:'500',fecha:'2026-09-23',tipo:'parcial'});
  await c.submitPago();
  assert.ok(!modales.some(esRepetido));
});
await test('P-02 el aviso escapa lo que escribió el usuario',async()=>{
  const {c,modales}=repetidoFixture({pagos:[{...anticipo,metodo:'<img src=x onerror=alert(1)>'}],respuestas:[false]});
  await c.submitPago();
  const m=modales.find(esRepetido);
  assert.ok(m&&!m.body.includes('<img'),m&&m.body);
});

// v7.9.34 R2 — P1-01 de Codex: el aviso debe aplicarse al estado FRESCO que se escribe, no a la
// caché. Usa el logOperacion REAL para contar también las escrituras de auditoría.
function carreraFixture({cache=[],fresco=[],frescoEnEscritura=null,respuestas=[],reintentoTx=false,fecha='2026-09-22',monto='500',tipo='parcial',manual=false}){
  const {el}=domSimulado();
  Object.assign(el('pm-fecha'),{value:fecha});Object.assign(el('pm-monto'),{value:monto});
  Object.assign(el('pm-metodo'),{value:'Nequi'});Object.assign(el('pm-tipo'),{value:tipo});Object.assign(el('pm-notas'),{value:''});
  el('pm-submit-btn').style={};el('pm-submit-btn').textContent='Registrar pago';
  let doc={total:1000,pagos:plain(fresco)};
  const escrituras=[];const modales=[];const pendientes=[];let lecturas=0,reintentado=false;
  const snap=()=>({exists:()=>true,data:()=>plain(doc)});
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',
    setDoc:async(p,v)=>{escrituras.push({p,v})},updateDoc:async(p,v)=>{escrituras.push({p,v})},
    runTransaction:async(_,cb)=>{
      const intento=async()=>{const v=[];const r=await cb({get:async()=>{lecturas++;if(frescoEnEscritura&&lecturas>=2)doc.pagos=plain(frescoEnEscritura);return snap()},update(p,x){v.push({p,x})}});return {r,v}};
      let {r,v}=await intento();
      if(reintentoTx&&v.length&&!reintentado){reintentado=true;({r,v}=await intento())} // contención: el primer intento se descarta
      v.forEach(({p,x})=>{escrituras.push({p,v:x});doc={...doc,...plain(x)}});
      return r;
    }};
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError','getCollectionName','gbDateToIso','logOperacion'),...['getPagos','totalCobrado','pagoFechaIso','pagoClave','pagoPareceRepetido','submitPago','_submitPagoImpl'].map(n=>['app-historial.js',n]),...opcional('app-historial.js','totalCargos','totalAjustes','saldoPendiente')],{
    ...common(),window:{fb},$:el,cloudOnline:true,pagoSrc:{id:'GB-1',kind:'quote',doc:{total:1000,pagos:cache.map(p=>({...p}))}},pagoFotoBase64:null,
    fbReady:async()=>{},BUILD_VERSION:'test',
    getDocTotal:q=>q.total||0,fm:n=>'$'+n,_showPagoSuccessModal:async()=>{},curMode:'hist',
    escapeHtml:s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),closePagoModal(){},renderHist(){},
    confirmModal:o=>{modales.push(o);if(manual)return new Promise(r=>pendientes.push(r));return Promise.resolve(respuestas.length?respuestas.shift():true)}
  });
  const alDoc=()=>escrituras.filter(e=>e.p==='quotes/GB-1');
  return {c,modales,escrituras,alDoc,pendientes,doc:()=>doc};
}
const pagoOtraSesion={...anticipo,clientId:'pago_otra_sesion'};
await test('P1-01 canónica: caché sin pagos y el pago repetido sólo en el estado fresco: avisa; «Cancelar» = cero escrituras',async()=>{
  const f=carreraFixture({cache:[],fresco:[pagoOtraSesion],respuestas:[false]});
  await f.c.submitPago();
  assert.equal(f.modales.filter(esRepetido).length,1,JSON.stringify(f.modales.map(m=>m.title)));
  assert.equal(f.escrituras.length,0,'ni documento ni auditoría: '+JSON.stringify(f.escrituras));
  assert.ok(!f.c.window._submitPagoBusy,'la guarda queda libre');
});
await test('P1-01 «Sí, es otro pago» tras el aviso del estado fresco: exactamente un pago nuevo y el aviso no reaparece',async()=>{
  const f=carreraFixture({cache:[],fresco:[pagoOtraSesion],respuestas:[true,true]});
  await f.c.submitPago();
  assert.equal(f.modales.filter(esRepetido).length,1);
  assert.equal(f.alDoc().length,1);assert.equal(f.doc().pagos.length,2);
});
await test('P1-01 carrera dentro de la escritura: el pago llega entre la lectura previa y la transacción; no escribe sin confirmar',async()=>{
  const a=carreraFixture({cache:[],fresco:[],frescoEnEscritura:[pagoOtraSesion],respuestas:[true,false]}); // monto distinto: sí; repetido: cancelar
  await a.c.submitPago();
  assert.equal(a.modales.filter(esRepetido).length,1,JSON.stringify(a.modales.map(m=>m.title)));
  assert.equal(a.alDoc().length,0,'el documento no se toca');
  assert.equal(a.doc().pagos.length,1);
  assert.ok(!a.c.window._submitPagoBusy);
  const b=carreraFixture({cache:[],fresco:[],frescoEnEscritura:[pagoOtraSesion],respuestas:[true,true]});
  await b.c.submitPago();
  assert.equal(b.modales.filter(esRepetido).length,1,'se pregunta una sola vez');
  assert.equal(b.alDoc().length,1);assert.equal(b.doc().pagos.length,2);
});
await test('P1-01 reintento de la transacción tras confirmar: sigue siendo exactamente un pago',async()=>{
  const f=carreraFixture({cache:[pagoOtraSesion],fresco:[pagoOtraSesion],respuestas:[true],reintentoTx:true});
  await f.c.submitPago();
  assert.equal(f.modales.filter(esRepetido).length,1);
  assert.equal(f.alDoc().length,1);assert.equal(f.doc().pagos.length,2);
  assert.equal(new Set(f.doc().pagos.map(p=>p.clientId)).size,2);
});
await test('P3-02 dos invocaciones con el aviso abierto: la segunda no espera ni escribe; una sola escritura',async()=>{
  const f=carreraFixture({cache:[pagoOtraSesion],fresco:[pagoOtraSesion],manual:true});
  const p1=f.c.submitPago();
  for(let i=0;i<20&&!f.pendientes.length;i++)await new Promise(r=>setTimeout(r,0));
  assert.equal(f.pendientes.length,1,'el aviso está abierto');
  const resuelta=await Promise.race([f.c.submitPago().then(()=>true),new Promise(r=>setTimeout(()=>r(false),200))]);
  assert.ok(resuelta,'la segunda invocación termina de inmediato');
  assert.equal(f.modales.length,1,'no abre un segundo aviso');
  f.pendientes.shift()(true);
  await p1;
  assert.equal(f.alDoc().length,1);assert.equal(f.doc().pagos.length,2);
  assert.ok(!f.c.window._submitPagoBusy);
});
await test('P3-01 fecha guardada como Timestamp de Firestore: también avisa',async()=>{
  const ts={...pagoOtraSesion,fecha:{toDate:()=>new Date(2026,8,22,15)}};
  const f=carreraFixture({cache:[ts],fresco:[ts],respuestas:[false]});
  await f.c.submitPago();
  assert.equal(f.modales.filter(esRepetido).length,1);
  assert.equal(f.escrituras.length,0);
});

// v7.9.34 R3 — P2-01 de Codex (ronda 2): el monto guardado no puede llegar como HTML al aviso.
await test('P2-01 monto guardado con marcado: el aviso muestra el número comparado, sin HTML',async()=>{
  const sucio={...pagoOtraSesion,monto:'500<img src=x onerror=alert(1)>'};
  const f=carreraFixture({cache:[sucio],fresco:[sucio],respuestas:[false]});
  await f.c.submitPago();
  const m=f.modales.find(esRepetido);
  assert.ok(m,'el pago coincide por parseInt y avisa');
  assert.ok(!/<img|onerror/.test(m.body),m.body);
  assert.ok(m.body.includes('$500'),m.body);
  assert.equal(f.escrituras.length,0);
});
// ═══ v7.9.35 P-35: cargos por reposición de menaje (vaso roto de $15.000) ═══
const hist=(...n)=>n.map(x=>['app-historial.js',x]);
const menajeCore=core('getMenajeOpciones','getMenajeOpcionActiva','getMenajeItemsActivos','getReposicionActivos','gbDateToIso');
// Copia de h() de app-core.js: el extractor no admite sus regex con comillas.
const hReal=s=>s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const cargoFns=['getPagos','totalCobrado','totalAjustes','totalCargos','saldoPendiente','saldoNeto','creditoAFavor','pagoFechaIso','pagoTipoLabel','puedeCargoReposicion','cargoLineas','cargoCalcular','plantillaCobroCargo','cargosVerPagosHtml'];
const fmReal=n=>'$'+n.toLocaleString('es-CO');
const cargosCtx=(extra={})=>loadSourceFunctions([...menajeCore,...opcional('app-historial.js',...cargoFns)],{...common(),fm:fmReal,h:hReal,getDocTotal:q=>q.total||0,GB_DATOS_PAGO:'',...extra});
const vaso={id:'cg1',clientId:'cg1',tipo:'reposicion_menaje',items:[{name:'Vaso',qty:1,precio:15000}],monto:15000,fecha:'2026-09-26'};
const eventoPagado=()=>({kind:'proposal',status:'entregado',client:'Cliente',total:100000,pagos:[{fecha:'2026-09-20',monto:100000,metodo:'Nequi',tipo:'saldo'}],menaje:[{name:'Vaso',qty:50}],reposicionData:{Vaso:15000}});
const pagoRepo={fecha:'2026-09-27',monto:15000,metodo:'Nequi',tipo:'reposicion_menaje'};
await test('P-35 totalCargos suma los vigentes, ignora los anulados y lee montos con parseInt',()=>{
  const c=cargosCtx();
  assert.equal(c.totalCargos({cargos:[vaso,{...vaso,id:'x',monto:'5000'},{...vaso,id:'y',deletedAt:'2026-09-27'},{monto:'<b>'}]}),20000);
  assert.equal(c.totalCargos({}),0);assert.equal(c.totalCargos(null),0);
});
await test('P-35 saldoPendiente y saldoNeto incluyen los cargos; getDocTotal no cambia',()=>{
  const c=cargosCtx();
  const q={...eventoPagado(),cargos:[vaso]};
  assert.equal(c.saldoPendiente(q),15000);assert.equal(c.saldoNeto(q),15000);assert.equal(c.creditoAFavor(q),0);
  const t=loadSourceFunctions(core('TR','computePropTotal','getDocTotal'));
  assert.equal(t.getDocTotal({kind:'quote',total:100000,cargos:[vaso]}),100000);
  assert.equal(t.getDocTotal({kind:'proposal',sections:[seccion('s1')],cargos:[vaso]}),100000);
});
await test('P-35 caso real: pagado completo + vaso de $15.000 → pendiente 15.000; pago de reposición → 0 y sin saldo a favor',()=>{
  const c=cargosCtx();
  const q={...eventoPagado(),cargos:[vaso]};
  assert.equal(c.saldoPendiente(q),15000);
  q.pagos.push(pagoRepo);
  assert.equal(c.saldoPendiente(q),0);assert.equal(c.creditoAFavor(q),0);
  const d=loadSourceFunctions([...hist('getPagos','totalCobrado','totalAjustes'),...opcional('app-historial.js','totalCargos'),['app-dashboard.js','getSobrepagosCliente']],{getDocTotal:x=>x.total||0});
  assert.deepEqual(plain(d.getSobrepagosCliente([q])),{total:0,detalle:[]},'la reposición pagada no es saldo a favor');
  assert.equal(d.getSobrepagosCliente([{...q,cargos:[]}]).total,15000,'sin cargo, el mismo pago sí sería sobrepago');
});
await test('P-35 D2: cargo sólo en propuestas vendidas con menaje; no en cotizaciones, sin menaje, sin vender ni archivadas',()=>{
  const c=cargosCtx();
  const base=eventoPagado();
  for(const status of ['aprobada','en_produccion','entregado'])assert.equal(c.puedeCargoReposicion({...base,status}),true,status);
  for(const status of ['enviada','propfinal','anulada','superseded','convertida',undefined])assert.equal(c.puedeCargoReposicion({...base,status}),false,String(status));
  assert.equal(c.puedeCargoReposicion({...base,kind:'quote'}),false,'cotización');
  assert.equal(c.puedeCargoReposicion({...base,menaje:[]}),false,'sin menaje');
});
await test('P-35 modal: precios de la tabla de reposición de la opción aprobada; cantidad 0 no suma; total entero',()=>{
  const c=cargosCtx();
  const q={kind:'proposal',menajeOptions:[{id:'A',label:'A',items:[{name:'Copa'}]},{id:'B',label:'B',items:[{name:'Vaso'},{name:'Plato'}]}],propFinalSelection:{menaje:'B'},reposicionData:{A:{Copa:9000},B:{Vaso:15000,Plato:'12000'}}};
  assert.deepEqual(plain(c.cargoLineas(q)),[{name:'Vaso',precio:15000},{name:'Plato',precio:12000}]);
  assert.deepEqual(plain(c.cargoCalcular([{name:'Vaso',qty:'2',precio:'15000'},{name:'Plato',qty:'0',precio:'12000'}])),{items:[{name:'Vaso',qty:2,precio:15000}],monto:30000});
  assert.equal(c.cargoCalcular([{name:'Vaso',qty:'0',precio:'15000'},{name:'Plato',qty:'-1',precio:'12000'}]).monto,0);
});

function cargoFixture({doc=eventoPagado(),fresco=null,reintentoTx=false,respuestas=[],qty='1',precio=null,prompts=[]}={}){
  const {el}=domSimulado();
  let almacen={...plain(fresco||doc)};const escrituras=[];const modales=[];const toasts=[];let reintentado=false;
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',
    setDoc:async(p,v)=>{escrituras.push({p,v})},updateDoc:async(p,v)=>{escrituras.push({p,v})},
    runTransaction:async(_,cb)=>{
      const intento=async()=>{const v=[];const r=await cb({get:async()=>({exists:()=>true,data:()=>plain(almacen)}),update(p,x){v.push({p,x})}});return {r,v}};
      let {r,v}=await intento();
      if(reintentoTx&&!reintentado){reintentado=true;({r,v}=await intento())} // contención: el primer intento se descarta
      v.forEach(({p,x})=>{escrituras.push({p,v:x});almacen={...almacen,...plain(x)}});
      return r;
    }};
  const cache={...plain(doc),id:'GB-P-1',kind:'proposal'};
  const c=loadSourceFunctions([...menajeCore,...core('getCollectionName','logOperacion','gbMensajeError','gbEsErrorDePermiso'),
    ...opcional('app-historial.js',...cargoFns,'openCargoModal','closeCargoModal','cargoFilasDelFormulario','cargoRecalcular','submitCargo','_submitCargoImpl','anularCargo')],{
    ...common(),window:{fb},$:el,cloudOnline:true,quotesCache:[cache],fbReady:async()=>{},BUILD_VERSION:'test',fm:fmReal,h:hReal,getDocTotal:q=>q.total||0,GB_DATOS_PAGO:'',
    toast:(m)=>toasts.push(m),renderHist(){},openVerPagosModal(){},curMode:'hist',prompt:()=>prompts.length?prompts.shift():'',
    confirmModal:async o=>{modales.push(o);return respuestas.length?respuestas.shift():true}});
  const abrir=()=>{c.openCargoModal('GB-P-1','proposal');
    for(const m of String(el('cg-items').innerHTML).matchAll(/id="(cg-(?:qty|precio)-\d+)" value="([^"]*)"/g))el(m[1]).value=m[2]; // como el navegador
    el('cg-qty-0').value=qty;if(precio!=null)el('cg-precio-0').value=precio;el('cg-fecha').value='2026-09-26';el('cg-notas').value='Vaso roto por un invitado'};
  const alDoc=()=>escrituras.filter(e=>e.p==='proposals/GB-P-1');
  return {c,el,cache,escrituras,alDoc,modales,toasts,abrir,almacen:()=>almacen};
}
await test('P-35 registrar cargo: una escritura en transacción, con auditoría, y el pendiente sube',async()=>{
  const f=cargoFixture();
  f.abrir();
  assert.equal(String(f.el('cg-precio-0').value),'15000','precio de la tabla de reposición');
  await f.c.submitCargo();
  assert.equal(f.alDoc().length,1);
  const cargos=f.almacen().cargos;
  assert.equal(cargos.length,1);
  assert.equal(cargos[0].monto,15000);assert.equal(cargos[0].tipo,'reposicion_menaje');
  assert.deepEqual(cargos[0].items,[{name:'Vaso',qty:1,precio:15000}]);
  assert.equal(cargos[0].fecha,'2026-09-26');assert.ok(cargos[0].logId&&cargos[0].clientId&&cargos[0].registradoEn);
  assert.ok(f.escrituras.some(e=>/^operacionesLog\//.test(e.p)&&e.v.operacion==='registrarCargo'),'queda en la auditoría');
  assert.equal(f.cache.cargos.length,1,'la caché se sincroniza con lo escrito');
  assert.equal(cargosCtx().saldoPendiente(f.cache),15000);
  assert.ok(!f.c.window._submitCargoBusy);
});
await test('P-35 registrar cargo: total 0 no guarda; «Cancelar» en la confirmación no guarda',async()=>{
  const a=cargoFixture({qty:'0'});a.abrir();await a.c.submitCargo();
  assert.equal(a.escrituras.length,0);
  const b=cargoFixture({respuestas:[false]});b.abrir();await b.c.submitCargo();
  assert.equal(b.escrituras.length,0);assert.ok(!b.c.window._submitCargoBusy);
});
await test('P-35 registrar cargo: el reintento de la transacción deja un solo cargo',async()=>{
  const f=cargoFixture({reintentoTx:true});f.abrir();await f.c.submitCargo();
  assert.equal(f.almacen().cargos.length,1);
});
await test('P-35 registrar cargo: relee dentro de la transacción; conserva el pago y el cargo de otra sesión',async()=>{
  const otro={...vaso,id:'otro',clientId:'otro',monto:8000};
  const fresco={...eventoPagado(),pagos:[...eventoPagado().pagos,pagoRepo],cargos:[otro]};
  const f=cargoFixture({fresco});f.abrir();await f.c.submitCargo();
  const d=f.almacen();
  assert.equal(d.cargos.length,2);assert.equal(d.cargos[0].id,'otro');
  assert.equal(d.pagos.length,2,'el pago de la otra sesión sigue');
});
await test('P-35 anular cargo: exige motivo; marca deletedAt; el pendiente baja; anular dos veces no escribe',async()=>{
  const doc={...eventoPagado(),cargos:[vaso]};
  const abrirVer=f=>{f.c.window.__verPagosId='GB-P-1';f.c.window.__verPagosKind='proposal'};
  const sin=cargoFixture({doc,prompts:['']});abrirVer(sin);
  await sin.c.anularCargo(0);
  assert.equal(sin.escrituras.length,0,'sin motivo no escribe');
  const f=cargoFixture({doc,prompts:['El vaso apareció en la bodega']});abrirVer(f);
  await f.c.anularCargo(0);
  const c0=f.almacen().cargos[0];
  assert.ok(c0.deletedAt);assert.equal(c0.motivo,'El vaso apareció en la bodega');assert.equal(c0.deletedBy,'fixture@example.invalid');
  assert.equal(c0.monto,15000,'el cargo se conserva (borrado lógico)');
  assert.equal(cargosCtx().saldoPendiente(f.almacen()),0);
  assert.ok(f.escrituras.some(e=>/^operacionesLog\//.test(e.p)&&e.v.operacion==='anularCargo'),'queda en la auditoría');
  const antes=f.escrituras.length;
  await f.c.anularCargo(0);
  assert.equal(f.escrituras.length,antes,'ya anulado en la caché: no escribe');
  const g=cargoFixture({doc,fresco:{...doc,cargos:[{...vaso,deletedAt:'2026-09-27',motivo:'otra sesión'}]},prompts:['Anulado otra vez por error']});abrirVer(g);
  await g.c.anularCargo(0);
  assert.equal(g.alDoc().length,0,'ya anulado en el estado fresco: no reescribe');
  assert.equal(g.almacen().cargos[0].motivo,'otra sesión');
});
await test('P-35 guardar la propuesta en el editor no pisa un cargo que otra sesión registró',async()=>{
  const c=loadSourceFunctions(mergeEntries);
  assert.deepEqual(plain(c.mergeOperationalFields({client:'x',cargos:[]},{client:'y',cargos:[vaso]}).cargos),[vaso],'el formulario viejo sin el cargo no lo borra');
  const f=propReal({p:{client:'Cliente',att:'Compras',status:'entregado',sections:[seccion('s1')]}});
  await f.abrir('p');
  f.doc('p').cargos=[vaso];
  f.el('fp-att').value='Ventas';
  const r=await f.guardar();
  assert.equal(r?.ok,true,JSON.stringify(f.messages));
  assert.deepEqual(plain(f.doc('p').cargos),[vaso]);
});
await test('P-35 versión hija bloqueada si hay cargos; el cargador canónico no lee cargos (duplicar no los copia)',()=>{
  const src=source('app-propuesta.js');
  const lineas=src.split('\n').filter(l=>/\((parent|old)\.ajustes\|\|\[\]\)\.length/.test(l));
  assert.equal(lineas.length,2);
  for(const l of lineas)assert.ok(/\((parent|old)\.cargos\|\|\[\]\)\.length/.test(l),l.trim().slice(0,140));
  for(const f of ['loadPropQuote','duplicateQuote']){
    const file=f==='duplicateQuote'?'app-historial.js':'app-propuesta.js';
    const s=source(file);const i=s.search(new RegExp('function\\s+'+f+'\\s*\\('));
    assert.ok(i>=0&&!/cargos/.test(s.slice(i,s.indexOf('\n}\n',i))),f+' no debe leer ni copiar cargos');
  }
});
await test('P-35 WhatsApp: ítems, total y cláusula; montos con parseInt; datos de pago sólo si existen',()=>{
  const c=cargosCtx();
  const q={...eventoPagado(),quoteNumber:'GB-P-2026-0122-7'};
  const cargo={...vaso,monto:'15000<img src=x>',items:[{name:'Vaso',qty:'1',precio:'15000<b>'}]};
  const t=c.plantillaCobroCargo(q,cargo);
  assert.ok(t.includes('GB-P-2026-0122-7'),t);assert.ok(/1 × Vaso/.test(t),t);assert.ok(t.includes('$15.000'),t);
  assert.ok(!/<img|<b>/.test(t),t);assert.ok(/responsabilidad por menaje/i.test(t),t);
  assert.ok(!/Datos de pago/i.test(t),'sin GB_DATOS_PAGO no se inventan datos');
  assert.ok(cargosCtx({GB_DATOS_PAGO:'Nequi 300 000 0000'}).plantillaCobroCargo(q,cargo).includes('Nequi 300 000 0000'));
});
await test('P-35 «Ver pagos»: los cargos se muestran escapados, con su estado',()=>{
  const c=cargosCtx();
  const q={cargos:[{...vaso,items:[{name:'<img src=x onerror=alert(1)>',qty:1,precio:15000}],notas:'<script>x</script>',monto:'15000<b>'},{...vaso,id:'y',deletedAt:'2026-09-27',motivo:'<i>apareció</i>'}]};
  const html=c.cargosVerPagosHtml(q);
  assert.ok(!/<img|<script|<b>|<i>/.test(html),html);
  assert.ok(html.includes('$15.000'));assert.ok(/Anulado/.test(html));
  assert.equal(c.cargosVerPagosHtml({}),'');
  assert.equal(c.pagoTipoLabel('reposicion_menaje'),'Reposición de menaje');
});
await test('P-35 lectores del pendiente: cumplido, notas de la hoja, estado de pago y tarjeta cuentan los cargos',()=>{
  const q={...eventoPagado(),cargos:[vaso]};
  const g={getDocTotal:x=>x.total||0,fm:fmReal,h:String,STATUS_META:{}};
  const base=[...hist('getPagos','totalCobrado','totalAjustes','saldoPendiente'),...opcional('app-historial.js','totalCargos')];
  const k=loadSourceFunctions([...base,...core('isCumplido'),['app-dashboard.js','hojaNotasPago'],['app-dashboard.js','_estadoPago']],g);
  assert.equal(k.isCumplido(q),false,'debe la reposición: no está cumplido');
  assert.equal(k.hojaNotasPago(q),'SALDO $15.000');
  assert.notEqual(k._estadoPago(q).cls,'pagado');
  const pagado={...q,pagos:[...q.pagos,pagoRepo]};
  assert.equal(k.isCumplido(pagado),true);assert.equal(k.hojaNotasPago(pagado),'CANCELADO');assert.equal(k._estadoPago(pagado).cls,'pagado');
  const r=loadSourceFunctions([...base,['app-historial.js','_actionBtnsPorContexto'],['app-historial.js','renderDocCard']],{...g,quotesCache:[],canEdit:()=>false,requiresWarning:()=>false,canAnular:()=>false,puedeCargoReposicion:()=>false});
  const card=r.renderDocCard({...q,id:'GB-P-1'},'cartera',{showSaldo:true});
  assert.ok(card.includes('Cobrado $100.000'),card);assert.ok(card.includes('Saldo $15.000'),card);
});
await test('P-35 registrar pago tras el cargo: el modal de éxito no muestra la reposición como crédito a favor',async()=>{
  const {el}=domSimulado();
  Object.assign(el('pm-fecha'),{value:'2026-09-27'});Object.assign(el('pm-monto'),{value:'15000'});
  Object.assign(el('pm-metodo'),{value:'Nequi'});Object.assign(el('pm-tipo'),{value:'reposicion_menaje'});Object.assign(el('pm-notas'),{value:''});
  el('pm-submit-btn').style={};
  const d={...eventoPagado(),cargos:[vaso]};let almacen=plain(d);const exitos=[];const modales=[];
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',runTransaction:async(_,cb)=>cb({get:async()=>({exists:()=>true,data:()=>plain(almacen)}),update(p,v){almacen={...almacen,...plain(v)}}})};
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError','getCollectionName','gbDateToIso'),...hist('getPagos','totalCobrado','pagoFechaIso','pagoClave','pagoPareceRepetido','submitPago','_submitPagoImpl'),...opcional('app-historial.js','totalCargos','totalAjustes','saldoPendiente')],{
    ...common(),window:{fb},$:el,cloudOnline:true,pagoSrc:{id:'GB-P-1',kind:'proposal',doc:plain(d)},pagoFotoBase64:null,
    getDocTotal:q=>q.total||0,fm:fmReal,_showPagoSuccessModal:async o=>{exitos.push(o)},curMode:'hist',escapeHtml:String,closePagoModal(){},renderHist(){},
    logOperacion:async({runner})=>runner('log1'),confirmModal:async o=>{modales.push(o);return true}});
  await c.submitPago();
  assert.equal(almacen.pagos.length,2);
  assert.ok(!modales.some(m=>/Monto distinto/.test(m.title)),'pagar exactamente la reposición no avisa monto distinto');
  assert.equal(exitos.length,1);
  assert.ok(!/Crédito a favor/.test(exitos[0].saldoLabel),exitos[0].saldoLabel);
  assert.ok(/Saldo: \$0/.test(exitos[0].saldoLabel),exitos[0].saldoLabel);
});
// ═══ v7.9.35 ronda 1 bis de Codex (gpt-5.6-sol): 4 P2 y 1 P3 ═══
// R1B-P2-1: registrar pago usa el saldo canónico (descuenta ajustes).
function pagoConAjusteFixture({monto='15000',respuestas=[]}={}){
  const {el}=domSimulado();
  Object.assign(el('pm-fecha'),{value:'2026-09-27'});Object.assign(el('pm-monto'),{value:monto});
  Object.assign(el('pm-metodo'),{value:'Nequi'});Object.assign(el('pm-tipo'),{value:'reposicion_menaje'});Object.assign(el('pm-notas'),{value:''});
  el('pm-submit-btn').style={};
  // Evento de $100.000, ajuste de $10.000, cobrado $90.000, cargo de $15.000: pendiente canónico $15.000.
  const d={kind:'proposal',status:'entregado',total:100000,pagos:[{fecha:'2026-09-20',monto:90000,metodo:'Nequi',tipo:'saldo'}],ajustes:[{id:'a1',monto:10000}],cargos:[vaso],menaje:[{name:'Vaso',qty:50}],reposicionData:{Vaso:15000}};
  let almacen=plain(d);const exitos=[];const modales=[];
  const fb={db:{},doc:(_,c,i)=>c+'/'+i,serverTimestamp:()=>'T',runTransaction:async(_,cb)=>cb({get:async()=>({exists:()=>true,data:()=>plain(almacen)}),update(p,v){almacen={...almacen,...plain(v)}}})};
  const c=loadSourceFunctions([...core('gbEsErrorDePermiso','gbMensajeError','getCollectionName','gbDateToIso'),
    ...hist('getPagos','totalCobrado','totalAjustes','saldoPendiente','pagoFechaIso','pagoClave','pagoPareceRepetido','submitPago','_submitPagoImpl','openPagoModal'),...opcional('app-historial.js','totalCargos')],{
    ...common(),window:{fb},$:el,cloudOnline:true,pagoSrc:{id:'GB-P-1',kind:'proposal',doc:plain(d)},pagoFotoBase64:null,quotesCache:[{...plain(d),id:'GB-P-1'}],
    getDocTotal:q=>q.total||0,fm:fmReal,_showPagoSuccessModal:async o=>{exitos.push(o)},curMode:'hist',escapeHtml:String,closePagoModal(){},renderHist(){},
    logOperacion:async({runner})=>runner('log1'),confirmModal:async o=>{modales.push(o);return respuestas.length?respuestas.shift():true}});
  return {c,el,exitos,modales,almacen:()=>almacen};
}
await test('R1B-P2-1 con ajuste: el modal de pago propone el pendiente canónico, no avisa monto distinto y el éxito dice $0',async()=>{
  const f=pagoConAjusteFixture();
  f.c.openPagoModal('GB-P-1','proposal');
  assert.equal(String(f.el('pm-monto').value),'15000','monto por defecto = pendiente canónico');
  assert.ok(/Pendiente: <strong>\$15\.000/.test(f.el('pm-resumen').innerHTML),f.el('pm-resumen').innerHTML);
  f.c.pagoSrc={id:'GB-P-1',kind:'proposal',doc:f.c.pagoSrc.doc};
  Object.assign(f.el('pm-monto'),{value:'15000'});Object.assign(f.el('pm-metodo'),{value:'Nequi'});
  await f.c.submitPago();
  assert.ok(!f.modales.some(m=>/Monto distinto/.test(m.title)),JSON.stringify(f.modales.map(m=>m.title)));
  assert.equal(f.exitos.length,1);
  assert.ok(/Saldo: \$0/.test(f.exitos[0].saldoLabel),f.exitos[0].saldoLabel);
});
// R1B-P2-2: D2 se aplica al estado fresco dentro de la transacción.
await test('R1B-P2-2 la propuesta se anuló en otra sesión mientras el modal estaba abierto: no escribe el cargo',async()=>{
  for(const cambio of [{status:'anulada'},{status:'enviada'},{menaje:[],menajeOptions:[]}]){
    const f=cargoFixture({fresco:{...eventoPagado(),...cambio}});
    f.abrir();await f.c.submitCargo();
    assert.equal(f.alDoc().length,0,JSON.stringify(cambio)+': no se escribe en el documento');
    assert.ok(!(f.almacen().cargos||[]).length,JSON.stringify(cambio));
    assert.ok(f.toasts.some(t=>/no se registró el cargo/i.test(t)),JSON.stringify(f.toasts));
    assert.ok(!f.c.window._submitCargoBusy);
  }
});
// R1B-P2-3: estados de pago con el saldo canónico.
await test('R1B-P2-3 lectores de estado: cortesía con cargo, porcentaje con cargo y pedido saldado con ajuste',async()=>{
  const g={getDocTotal:x=>x.total||0,fm:fmReal,h:hReal,STATUS_META:{}};
  const base=[...hist('getPagos','totalCobrado','totalAjustes','saldoPendiente'),...opcional('app-historial.js','totalCargos')];
  const k=loadSourceFunctions([...base,...core('isCumplido'),['app-dashboard.js','hojaNotasPago'],['app-dashboard.js','_estadoPago']],g);
  // (1) cortesía entregada con cargo impago
  const cortesia={kind:'proposal',status:'entregado',total:0,pagos:[],cargos:[vaso]};
  assert.equal(k.isCumplido(cortesia),false,'cortesía con reposición por cobrar no está cumplida');
  assert.equal(k.hojaNotasPago(cortesia),'SALDO $15.000');
  assert.ok(k._estadoPago(cortesia)&&k._estadoPago(cortesia).cls!=='pagado',JSON.stringify(k._estadoPago(cortesia)));
  const cortesiaPagada={...cortesia,pagos:[pagoRepo]};
  assert.equal(k.isCumplido(cortesiaPagada),true);assert.equal(k.hojaNotasPago(cortesiaPagada),'CANCELADO');assert.equal(k._estadoPago(cortesiaPagada).cls,'pagado');
  assert.equal(k.isCumplido({kind:'proposal',status:'entregado',total:0,pagos:[]}),true,'la cortesía sin cargos sigue siendo cumplida');
  // (2) evento pagado con cargo impago: no puede decir 100 %
  const e=k._estadoPago({...eventoPagado(),cargos:[vaso]});
  assert.equal(e.cls,'anticipo');assert.ok(!/100%/.test(e.label),e.label);
  // (3) pedido saldado con un ajuste (decisión de Luis: saldo canónico)
  const ajustado={kind:'quote',status:'entregado',total:100000,pagos:[{fecha:'2026-09-20',monto:90000,tipo:'saldo'}],ajustes:[{id:'a1',monto:10000}]};
  assert.equal(k.isCumplido(ajustado),true);assert.equal(k.hojaNotasPago(ajustado),'CANCELADO');assert.equal(k._estadoPago(ajustado).cls,'pagado');
  const vp=loadSourceFunctions([...base,...hist('pagoTipoLabel','pagoFechaIso','cargosVerPagosHtml','openVerPagosModal')],{...g,...common(),h:hReal,$:domSimulado().el,window:{},quotesCache:[{...ajustado,id:'Q1'},{...eventoPagado(),cargos:[vaso],id:'P1'},{...ajustado,pagos:[{fecha:'2026-09-20',monto:50000,tipo:'anticipo'}],id:'Q2'}]});
  vp.openVerPagosModal('Q1','quote');assert.ok(/\(100%\)/.test(vp.$('vp-resumen').innerHTML),vp.$('vp-resumen').innerHTML);
  vp.openVerPagosModal('Q2','quote');assert.ok(/\(55%\)/.test(vp.$('vp-resumen').innerHTML),'50.000 de 90.000 que se deben tras el ajuste: '+vp.$('vp-resumen').innerHTML);
  vp.openVerPagosModal('P1','proposal');assert.ok(!/\(100%\)/.test(vp.$('vp-resumen').innerHTML),vp.$('vp-resumen').innerHTML);
  const src=source('app-historial.js');
  const linea=src.split('\n').find(l=>/const pagadoBadge=/.test(l));
  assert.ok(/_saldo<=0/.test(linea),'«Pagado ✓» sigue el saldo canónico: '+linea.trim().slice(0,160));
});
// R1B-P2-4: el botón del cargo no ejecuta un ID restaurado con comillas.
await test('R1B-P2-4 el onclick del botón del cargo lleva el ID como dato, aunque traiga comillas',async()=>{
  const c=loadSourceFunctions(hist('_btnCargoReposicion'),{h:hReal});
  const id="GB-P-X');globalThis.__xss=1;//",kind="proposal";
  const html=c._btnCargoReposicion({id,kind});
  const attr=/onclick="([^"]*)"/.exec(html);
  assert.ok(attr,html);
  const js=attr[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const vm=await import('node:vm');const ctx=vm.createContext({llamadas:[],event:{}});
  vm.runInContext('function openCargoModal(...a){llamadas.push(a)}',ctx);
  vm.runInContext(js,ctx);
  assert.equal(ctx.__xss,undefined,'no se ejecuta código del ID');
  assert.equal(ctx.llamadas.length,1);assert.equal(ctx.llamadas[0][0],id);assert.equal(ctx.llamadas[0][1],kind);
});
// R1B-P3-1: anular un cargo que otra sesión ya anuló no se registra como una anulación nueva.
await test('R1B-P3-1 anulación que no hizo nada: el log la marca sin cambios y la interfaz lo dice',async()=>{
  const doc={...eventoPagado(),cargos:[vaso]};
  const g=cargoFixture({doc,fresco:{...doc,cargos:[{...vaso,deletedAt:'2026-09-27',motivo:'otra sesión'}]},prompts:['Anulado otra vez por error']});
  g.c.window.__verPagosId='GB-P-1';g.c.window.__verPagosKind='proposal';
  await g.c.anularCargo(0);
  assert.equal(g.alDoc().length,0);
  const cierre=g.escrituras.find(e=>/^operacionesLog\//.test(e.p)&&e.v.resultado==='exito');
  assert.ok(cierre&&cierre.v.payloadExtra&&cierre.v.payloadExtra.sinCambios===true,JSON.stringify(cierre&&cierre.v));
  assert.ok(g.toasts.some(t=>/ya estaba anulado/i.test(t)),JSON.stringify(g.toasts));
  assert.ok(!g.toasts.some(t=>/^Cargo anulado$/.test(t)));
});
// ═══ v7.9.35 ronda 2 de Codex (gpt-5.6-sol): 2 P2 y 1 P3 ═══
// R2-P2-1: D2 permite el cargo en los tres estados vendidos; el botón debe estar en todas las vistas de Pedidos.
await test('R2-P2-1 el botón del cargo sale en Pedidos aprobados, en producción, producidos y por entregar',async()=>{
  const g={...cargosCtx(),getDocTotal:x=>x.total||0,fm:fmReal,h:hReal,STATUS_META:{},quotesCache:[],canEdit:()=>false,requiresWarning:()=>false,canAnular:()=>false};
  const r=loadSourceFunctions([...hist('_btnCargoReposicion','_actionBtnsPorContexto')],g);
  const casos=[['pedidos-aprobados','aprobada'],['pedidos-produccion','en_produccion'],['pedidos-producidos','en_produccion'],['entregar','en_produccion'],['entregadas','entregado'],['cartera','entregado']];
  for(const [ctx,status] of casos){
    const btns=r._actionBtnsPorContexto({...eventoPagado(),id:'GB-P-1',status,produced:ctx==='pedidos-producidos'||ctx==='entregar'},ctx);
    assert.equal(btns.filter(b=>/Cargo por reposición/.test(b)).length,1,ctx+': '+btns.join(' '));
  }
  const sinMenaje=r._actionBtnsPorContexto({...eventoPagado(),id:'GB-P-1',status:'aprobada',menaje:[]},'pedidos-aprobados');
  assert.ok(!sinMenaje.some(b=>/Cargo por reposición/.test(b)),'sin menaje no hay botón');
});
// R2-P2-2: el drill-down «Entregado» mira el saldo antes que la cortesía.
function dashEntregado(docs){
  let lista=null;
  const g={getDocTotal:x=>x.total||0,fm:fmReal,h:hReal,quotesCache:docs,_dashDetailTipoActual:null,
    getDashRange:()=>({start:'2026-09-01',end:'2026-09-30',label:'sep'}),_renderDashGroupedList:o=>{lista=o}};
  const d=loadSourceFunctions([...hist('getPagos','totalCobrado','totalAjustes','saldoPendiente'),...opcional('app-historial.js','totalCargos'),...core('isCumplido','isCortesia'),['app-dashboard.js','openDashDetail']],g);
  d.openDashDetail('entregado');
  return lista.rows.map(x=>x.extra);
}
await test('R2-P2-2 Entregado: una cortesía que debe reposición muestra el saldo, no «Cortesía»',async()=>{
  const base={kind:'proposal',status:'entregado',eventDate:'2026-09-20',total:0,pagos:[]};
  const [debe,pagada,sinCargo]=dashEntregado([{...base,cargos:[vaso]},{...base,cargos:[vaso],pagos:[pagoRepo]},{...base}]);
  assert.ok(/Saldo \$15\.000/.test(debe)&&!/Cortesía/.test(debe),debe);
  assert.ok(!/Saldo/.test(pagada),pagada);
  assert.ok(/Cortesía/.test(sinCargo),sinCargo);
});
// R2-P3-1: «Pagado ✓» parte del total canónico (getDocTotal), no de q.total.
await test('R2-P3-1 «Pagado ✓» en una propuesta antigua sin q.total: usa getDocTotal',async()=>{
  const src=source('app-historial.js');
  const ini=src.indexOf('const _pagos=getPagos(q);');const lin=src.indexOf('const pagadoBadge=',ini);
  assert.ok(ini>0&&lin>ini,'bloque del distintivo');
  const trozo=src.slice(ini,src.indexOf('\n',lin));
  const c=loadSourceFunctions([...hist('getPagos','totalCobrado','totalAjustes','saldoPendiente'),...opcional('app-historial.js','totalCargos')],{getDocTotal:x=>x.total||x._calculado||0});
  const vm=await import('node:vm');vm.runInContext('function _badge(q){'+trozo+';return pagadoBadge}',c);
  const antigua={kind:'proposal',status:'entregado',_calculado:100000,pagos:[{fecha:'2026-09-20',monto:100000,tipo:'saldo'}]};
  assert.ok(/Pagado ✓/.test(c._badge(antigua)),'sin q.total, saldada según getDocTotal: '+c._badge(antigua));
  assert.ok(!/Pagado ✓/.test(c._badge({...antigua,pagos:[{fecha:'2026-09-20',monto:50000,tipo:'anticipo'}]})),'con saldo no es Pagado');
  const cortesia={kind:'proposal',status:'entregado',total:0,pagos:[],cargos:[vaso]};
  assert.ok(/Pagado ✓/.test(c._badge({...cortesia,pagos:[pagoRepo]})),'cortesía con la reposición pagada');
  assert.ok(!/Pagado ✓/.test(c._badge(cortesia)),'cortesía que debe la reposición');
});
console.log(`${passed} escenarios de integridad pasaron (adaptadores en memoria; no emulador Firebase).`);
