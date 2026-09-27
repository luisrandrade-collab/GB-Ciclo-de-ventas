// v7.10.0: nueva empresa del Régimen Simple (plan v5, carril A). Ejecuta funciones de la fuente real.
import assert from 'node:assert/strict';
import {loadSourceFunctions,source,functionSource} from './source_test_helpers.mjs';

let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('OK '+name)};
const emisor=(extra={})=>({accountingEntityId:'GB_SAS_SIMPLE',razonSocial:'Gourmet Bites SAS',nit:'901234567',dv:'8',regimen:'SIMPLE',municipio:'La Calera',ciiu:['5621','5619','5629'],fechaInicio:'2026-10-12',preciosIncluyenINC:true,...extra});
const core=(names,globals)=>loadSourceFunctions(names.map(n=>['app-core.js',n]),globals);

await test('gbEmisorActivo: apagado sin fecha de inicio, sin NIT o sin razón social; activo desde la fecha de inicio',()=>{
  const run=(e,f)=>core(['gbEmisorConfigurado','gbEmisorActivo'],{GB_EMISOR:e}).gbEmisorActivo(f);
  assert.equal(run(emisor({fechaInicio:null}),'2026-12-01'),false);
  assert.equal(run(emisor({nit:''}),'2026-12-01'),false);
  assert.equal(run(emisor({razonSocial:''}),'2026-12-01'),false);
  assert.equal(run(emisor(),'2026-10-11'),false);
  assert.equal(run(emisor(),'2026-10-12'),true);
  assert.equal(run(emisor(),'2026-10-20T10:00'),true);
  assert.equal(run(emisor(),''),false);
});
await test('gbParseIdStr separa tipo y número',()=>{
  const c=core(['gbParseIdStr'],{});
  assert.deepEqual({...c.gbParseIdStr('NIT 830018305-1')},{tipo:'NIT',num:'830018305-1'});
  assert.deepEqual({...c.gbParseIdStr('cc 1032')},{tipo:'CC',num:'1032'});
  assert.deepEqual({...c.gbParseIdStr('')},{tipo:'',num:''});
  assert.deepEqual({...c.gbParseIdStr('123')},{tipo:'',num:'123'});
});
await test('gbFiscalValidar: los cinco datos de Luis, o consumidor final con nombre',()=>{
  const c=core(['gbFiscalValidar'],{});
  const ok={nombre:'Ana',tipoId:'CC',numId:'1',mail:'a@b.co',dir:'Calle 1',tel:'300'};
  assert.equal(c.gbFiscalValidar(ok),null);
  assert.match(c.gbFiscalValidar({...ok,mail:'sin-arroba'}),/correo/);
  assert.match(c.gbFiscalValidar({...ok,tipoId:''}),/identificación/);
  assert.match(c.gbFiscalValidar({...ok,dir:' ',tel:''}),/dirección, teléfono/);
  assert.match(c.gbFiscalValidar({...ok,nombre:''}),/nombre/);
  assert.equal(c.gbFiscalValidar({nombre:'Ana',consumidorFinal:true}),null);
});
await test('gbFiscalSello: empresa, copia del emisor y del cliente; consumidor final con 222222222222',()=>{
  const c=core(['gbEmisorSnapshot','gbFiscalSello'],{GB_EMISOR:emisor()});
  const s=c.gbFiscalSello({nombre:' Ana ',tipoId:'CC',numId:' 99 ',mail:'a@b.co',dir:'C1',tel:'3'},'2026-10-13');
  assert.equal(s.accountingEntityId,'GB_SAS_SIMPLE');
  assert.equal(s.emisorSnapshot.nit,'901234567');
  assert.equal(s.emisorSnapshot.preciosIncluyenINC,true);
  assert.equal(s.clienteFiscal.nombre,'Ana');assert.equal(s.clienteFiscal.numId,'99');
  assert.equal(s.clienteFiscal.fechaConfirmacion,'2026-10-13');
  const cf=c.gbFiscalSello({nombre:'Juan',consumidorFinal:true},'2026-10-13');
  assert.equal(cf.clienteFiscal.consumidorFinal,true);assert.equal(cf.clienteFiscal.numId,'222222222222');
});
await test('gbTextoLegalSimple: régimen SIMPLE, NIT y frase del INC según D-07',()=>{
  const t=e=>core(['gbTextoLegalSimple'],{GB_EMISOR:e}).gbTextoLegalSimple();
  const inc=t(emisor());
  assert.match(inc,/Gourmet Bites SAS \(NIT 901234567-8\)/);assert.match(inc,/Régimen Simple/);assert.match(inc,/incluyen el Impuesto Nacional al Consumo/);
  assert.doesNotMatch(inc,/Persona Natural/);
  assert.match(t(emisor({preciosIncluyenINC:false})),/se suma el Impuesto Nacional al Consumo/);
  assert.doesNotMatch(t(emisor({preciosIncluyenINC:null})),/Consumo/);
});
const feCtx=()=>loadSourceFunctions([['app-historial.js','gbFeValidar'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeClave'],['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida']],{getDocTotal:q=>q.total||0,totalCargos:q=>(q.cargos||[]).reduce((a,b)=>a+b.monto,0)});
const feOk={prefijo:'GB',numero:'1',cufe:'abc',fecha:'2026-10-20',base:925926,inc:74074,iva:null,total:1000000,motivo:''};
await test('gbFeValidar: obligatorios, suma, duplicados y total del pedido',()=>{
  const c=feCtx();const q={id:'P1',total:1000000,accountingEntityId:'GB_SAS_SIMPLE'};
  const r=c.gbFeValidar(q,feOk,[q]);
  assert.equal(r.error,undefined);assert.equal(r.campos.estado,'emitida');assert.equal(r.campos.iva,0);assert.equal(r.campos.motivoDiferencia,undefined);
  assert.match(c.gbFeValidar(q,{...feOk,cufe:''},[q]).error,/CUFE/);
  assert.match(c.gbFeValidar(q,{...feOk,fecha:'20/10/2026'},[q]).error,/fecha/);
  assert.match(c.gbFeValidar(q,{...feOk,inc:74000},[q]).error,/no da el total/);
  const otro={id:'P2',quoteNumber:'GB-P-2',feData:{cufe:'abc',prefijo:'X',numero:'9'}};
  assert.match(c.gbFeValidar(q,feOk,[q,otro]).error,/GB-P-2/);
  const otro2={id:'P3',quoteNumber:'GB-P-3',accountingEntityId:'GB_SAS_SIMPLE',feData:{cufe:'zzz',prefijo:'GB',numero:'1'}};
  assert.match(c.gbFeValidar(q,feOk,[q,otro2]).error,/GB-P-3/);
  assert.equal(c.gbFeValidar(q,feOk,[q,{id:'P1',feData:{cufe:'abc'}}]).error,undefined,'el mismo negocio no es duplicado');
  const conCargo={id:'P4',total:1000000,accountingEntityId:'GB_SAS_SIMPLE',cargos:[{monto:15000}]};
  assert.match(c.gbFeValidar(conCargo,feOk,[conCargo]).error,/motivo/);
  const r2=c.gbFeValidar(conCargo,{...feOk,motivo:'Reposición facturada aparte'},[conCargo]);
  assert.equal(r2.campos.motivoDiferencia,'Reposición facturada aparte');
});
await test('metodoFiscal: efectivo, electrónico y sin clasificar',()=>{
  const c=loadSourceFunctions([['app-historial.js','metodoFiscal']],{});
  assert.equal(c.metodoFiscal('Efectivo'),'efectivo');
  for(const m of ['Nequi','Daviplata','Banco Falabella','Transferencia','Tarjeta','Pasarela'])assert.equal(c.metodoFiscal(m),'electronico',m);
  for(const m of ['Otro','Sin especificar','',undefined])assert.equal(c.metodoFiscal(m),'sin_clasificar',String(m));
  assert.ok(/const METODOS_PAGO=\[[^\]]*"Tarjeta","Pasarela"/.test(source('app-historial.js')),'METODOS_PAGO incluye Tarjeta y Pasarela');
});
await test('gbRangoAtajo: mes, mes anterior y bimestres SIMPLE (ene-feb…), también al cambiar de año',()=>{
  const c=loadSourceFunctions([['app-dashboard.js','gbRangoAtajo']],{});
  const r=(t,h)=>{const x=c.gbRangoAtajo(t,h);return x.desde+'..'+x.hasta};
  assert.equal(r('mes','2026-10-15'),'2026-10-01..2026-10-31');
  assert.equal(r('mes_ant','2026-10-15'),'2026-09-01..2026-09-30');
  assert.equal(r('bim','2026-10-15'),'2026-09-01..2026-10-31');
  assert.equal(r('bim','2026-09-02'),'2026-09-01..2026-10-31');
  assert.equal(r('bim_ant','2026-10-15'),'2026-07-01..2026-08-31');
  assert.equal(r('mes_ant','2027-01-05'),'2026-12-01..2026-12-31');
  assert.equal(r('bim_ant','2027-02-10'),'2026-11-01..2026-12-31');
  assert.equal(r('bim','2028-02-10'),'2028-01-01..2028-02-29');
});
const VENDIDO=Function('return '+source('app-dashboard.js').match(/const REPORTES_VENDIDO_STATUS=(\{[^}]*\})/)[1])();
const expCtx=()=>loadSourceFunctions([['app-dashboard.js','gbExporteContable'],['app-historial.js','metodoFiscal'],['app-historial.js','pagoFechaIso'],['app-core.js','gbFiscalValidar'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeClave'],['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida']],{REPORTES_VENDIDO_STATUS:VENDIDO,
  getPagos:q=>q.pagos||[],totalCargos:q=>(q.cargos||[]).reduce((a,b)=>a+b.monto,0),totalAjustes:()=>0,gbDateToIso:d=>d.toISOString().slice(0,10)});
await test('gbExporteContable: ventas por fecha de FE, pagos por fecha de pago, sólo la nueva empresa, excepciones y cuadre',()=>{
  const c=expCtx();
  const A={id:'GB-P-1',quoteNumber:'GB-P-1',kind:'proposal',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',eventDate:'2026-10-20',city:'Bogotá',client:'A SAS',
    clienteFiscal:{nombre:'A SAS',tipoId:'NIT',numId:'900-1',mail:'a@b.co',dir:'Calle 1',tel:'300'},cargos:[{monto:15000}],
    feData:{prefijo:'GB',numero:'1',cufe:'c1',fecha:'2026-10-21',base:925926,inc:74074,iva:0,total:1000000,estado:'emitida'},
    pagos:[{fecha:'2026-10-10',monto:500000,metodo:'Nequi',tipo:'anticipo'},{fecha:'2026-11-02',monto:500000,metodo:'Efectivo',tipo:'saldo'},{fecha:'2026-10-25',monto:15000,metodo:'Otro',tipo:'reposicion_menaje'}]};
  const B={id:'GB-2026-5',quoteNumber:'GB-2026-5',kind:'quote',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',eventDate:'2026-10-22',client:'B',clienteFiscal:{consumidorFinal:true,nombre:'B',numId:'222222222222'},pagos:[]};
  const C={id:'GB-2026-6',kind:'quote',status:'entregado',eventDate:'2026-10-05',client:'Persona natural',feData:{cufe:'viejo',fecha:'2026-10-15',total:1},pagos:[{fecha:'2026-10-15',monto:99,metodo:'Efectivo'}]};
  const D={id:'GB-2026-7',kind:'quote',status:'pedido',accountingEntityId:'GB_SAS_SIMPLE',eventDate:'2026-10-05',client:'D',pagos:[]};
  const r=c.gbExporteContable([A,B,C,D],'2026-10-01','2026-10-31',emisor());
  assert.equal(r.ventas.length,1);assert.equal(r.ventas[0].factura,'GB-1');assert.equal(r.ventas[0].ciiu,'5621');assert.equal(r.ventas[0].inc,74074);
  assert.equal(r.pagos.length,2,'el saldo de noviembre queda fuera; C no es de la nueva empresa');
  assert.deepEqual(Array.from(r.pagos,p=>p.clase).sort(),['electronico','sin_clasificar']);
  const tipos=Array.from(r.excepciones,e=>e.tipo+':'+e.negocio).sort();
  assert.deepEqual(tipos,['A caballo del corte:GB-2026-7','Pago sin método clasificado:GB-P-1','Por facturar:GB-2026-5']);
  const cu=Object.fromEntries(r.cuadre.map(x=>[x[0].trim(),x[1]]));
  assert.equal(cu['Ventas facturadas (total)'],1000000);assert.equal(cu['INC'],74074);
  assert.equal(cu['Pagos recibidos'],515000);assert.equal(cu['Por medio electrónico'],500000);assert.equal(cu['Sin clasificar'],15000);
  assert.equal(cu['De ellos, anticipos'],500000);assert.equal(cu['Cargos de reposición en negocios facturados'],15000);
  const nov=c.gbExporteContable([A],'2026-11-01','2026-11-30',emisor());
  assert.equal(nov.ventas.length,0);assert.equal(nov.pagos.length,1);assert.equal(nov.pagos[0].valor,500000);
});
await test('gbPorFacturar: entregados de la nueva empresa sin CUFE',()=>{
  const docs=[{id:'1',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE'},{id:'2',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',feData:{cufe:'x'}},
    {id:'3',status:'pedido',accountingEntityId:'GB_SAS_SIMPLE'},{id:'4',status:'entregado'},{id:'5',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',feData:{numero:'1'}}];
  const c=loadSourceFunctions([['app-dashboard.js','gbPorFacturar']],{quotesCache:docs,GB_EMISOR:emisor()});
  assert.deepEqual(Array.from(c.gbPorFacturar(),q=>q.id),['1','5']);
});
await test('fuente: los campos del sello son operativos y ambas confirmaciones los escriben; la nota legal sólo cambia con la empresa activa',()=>{
  const core=source('app-core.js'),hist=source('app-historial.js');
  const oper=JSON.parse(core.match(/const OPERATIONAL_FIELDS=(\[[^\]]*\])/)[1]);
  for(const f of ['accountingEntityId','emisorSnapshot','clienteFiscal'])assert.ok(oper.includes(f),f);
  for(const [fn,p] of [['submitMarkAsOrder','om'],['submitApproveProposal','am']]){
    const i=hist.search(new RegExp('async function '+fn+'\\('));const body=hist.slice(i,hist.indexOf('\n}\n',i));
    assert.ok(body.includes('gbFiscalLeerSello("'+p+'"'),fn+' lee el sello');
    assert.ok(/if\(selloFiscal&&selloFiscal\.error\)\{toast\(/.test(body),fn+' bloquea si faltan datos');
    assert.ok(body.includes('if(selloFiscal)Object.assign(patch,selloFiscal);'),fn+' escribe el sello');
  }
  assert.ok(/if\(gbEmisorActivo\(gbTodayIso\(\)\)\)DEFAULT_NOTAS_COT\.n4=gbTextoLegalSimple\(\);/.test(source('app-cotizar.js')));
  assert.ok(/if\(gbEmisorActivo\(gbTodayIso\(\)\)\)DEFAULT_CONDICIONES\.c7=gbTextoLegalSimple\(\)/.test(source('app-propuesta.js')));
});
await test('toda función que usa serverTimestamp() lo toma de window.fb (defecto de submitFe desde v7.1)',()=>{
  const malos=[];
  for(const f of ['app-core.js','app-historial.js','app-dashboard.js','app-cotizar.js','app-propuesta.js','app-seguimiento.js']){
    const lines=source(f).split('\n');let ini=0,nombre='';
    lines.forEach((l,i)=>{const m=l.match(/^(?:async )?function (\w+)/);if(m){ini=i;nombre=m[1]}
      if(/serverTimestamp\(\)/.test(l)&&!/serverTimestamp[^()]*}=window\.fb/.test(lines.slice(ini,i+1).join('\n')))malos.push(f+':'+(i+1)+' '+nombre)});
  }
  assert.deepEqual(malos,[]);
});
// ─── Ronda 2 de Codex (v7.10.0) ───
await test('P1-01: el PDF de un documento sellado lleva la nota legal de su emisorSnapshot, aunque hoy la empresa esté apagada o se creara antes del inicio',()=>{
  const c=core(['gbTextoLegalSimple','gbNotaLegalSellada'],{GB_EMISOR:emisor({fechaInicio:null,razonSocial:'',nit:''})});
  const snap={...emisor()};
  const PN='Gourmet Bites by Andrade Matuk opera bajo Juan Pablo Andrade Matuk — Persona Natural No Responsable de IVA (C.C. 1.032.876.662).';
  const cot=c.gbNotaLegalSellada([{id:'n1',titulo:'A',texto:'x'},{id:'n4',titulo:'Legal',texto:PN}],{emisorSnapshot:snap},'n4','Legal');
  assert.match(cot[1].texto,/Gourmet Bites SAS \(NIT 901234567-8\)/);assert.match(cot[1].texto,/Régimen Simple/);assert.match(cot[1].texto,/incluyen el Impuesto Nacional/);
  assert.doesNotMatch(cot[1].texto,/Persona Natural/);assert.equal(cot[0].texto,'x');
  const prop=c.gbNotaLegalSellada([{id:'c7',titulo:'T',texto:PN+' Para reservar la fecha se requiere el pago de un anticipo del 50% del valor total del servicio.'}],{emisorSnapshot:{...snap,preciosIncluyenINC:false}},'c7','T');
  assert.match(prop[0].texto,/^Gourmet Bites by Andrade Matuk opera bajo Gourmet Bites SAS/);assert.match(prop[0].texto,/se suma el Impuesto Nacional/);
  assert.match(prop[0].texto,/Para reservar la fecha se requiere el pago de un anticipo del 50%/);assert.doesNotMatch(prop[0].texto,/Persona Natural/);
  assert.equal(c.gbNotaLegalSellada([{id:'n4',titulo:'L',texto:PN}],{},'n4','L')[0].texto,PN,'sin sello: el texto guardado');
  const borrada=c.gbNotaLegalSellada([{id:'n1',titulo:'A',texto:'x'}],{emisorSnapshot:snap},'n4','Legal');
  assert.equal(borrada.length,2);assert.match(borrada[1].texto,/Régimen Simple/);
  assert.ok(/gbNotaLegalSellada\(gbNotasNormalizar\(snapshot\.notasCotLista,[^;]*\),snapshot,"n4",/.test(functionSource('app-cotizar.js','genPDF')),'genPDF usa el sello');
  assert.ok(/gbNotaLegalSellada\(gbNotasNormalizar\(snapshot\.condicionesLista,[^;]*\),snapshot,"c7",/.test(functionSource('app-propuesta.js','genPropPDF')),'genPropPDF usa el sello');
});
await test('P1-02: exporte — FE de negocio anulado, cruce del corte en los dos sentidos, FE o cliente incompletos y facturas repetidas van a Excepciones',()=>{
  const c=expCtx();
  const cfOk={consumidorFinal:false,nombre:'A',tipoId:'NIT',numId:'900',mail:'a@b.co',dir:'C1',tel:'3'};
  const fe=x=>({prefijo:'GB',numero:'1',cufe:'c1',fecha:'2026-10-21',base:925926,inc:74074,iva:0,total:1000000,estado:'emitida',...x});
  const S={accountingEntityId:'GB_SAS_SIMPLE',clienteFiscal:cfOk};
  const docs=[
    {id:'AN',kind:'quote',status:'anulada',...S,eventDate:'2026-10-20',feData:fe({cufe:'an1',numero:'10'}),pagos:[{fecha:'2026-10-10',monto:100,metodo:'Nequi'}]},
    {id:'AN2',kind:'quote',status:'anulada',...S,eventDate:'2026-10-20',pagos:[{fecha:'2026-10-10',monto:7,metodo:'Nequi'}]},
    {id:'ANTES',kind:'quote',status:'pedido',...S,eventDate:'2026-10-05',pagos:[]},
    {id:'PN',kind:'proposal',status:'aprobada',eventDate:'2026-10-20',pagos:[]},
    {id:'PN3',kind:'quote',status:'entregado',eventDate:'2026-10-12',pagos:[]},
    {id:'VIVA',kind:'quote',status:'enviada',eventDate:'2026-10-20'},
    {id:'PN2',kind:'quote',status:'entregado',eventDate:'2026-10-11'},
    {id:'INC',kind:'quote',status:'entregado',...S,clienteFiscal:{nombre:'X',tipoId:'CC',numId:'',mail:'',dir:'',tel:''},eventDate:'2026-10-20',feData:{cufe:'c9',prefijo:'GB',numero:'9',fecha:'2026-10-21',total:5}},
    {id:'D1',kind:'quote',status:'entregado',...S,eventDate:'2026-10-20',feData:fe({cufe:' AB CD ',numero:'20'})},
    {id:'D2',kind:'proposal',status:'entregado',...S,eventDate:'2026-10-20',feData:fe({cufe:'abcd',numero:'21'})},
    {id:'D3',kind:'quote',status:'entregado',...S,eventDate:'2026-10-20',feData:fe({cufe:'otro',prefijo:'gb',numero:' 20 '})},
    {id:'SUMA',kind:'quote',status:'entregado',...S,eventDate:'2026-10-20',feData:fe({cufe:'su',numero:'40',inc:1})}
  ];
  const r=c.gbExporteContable(docs,'2026-10-01','2026-10-31',emisor());
  assert.deepEqual(Array.from(r.ventas,v=>v.negocio).sort(),['AN','D1','D2','D3','INC','SUMA']);
  assert.deepEqual(Array.from(r.pagos,p=>p.negocio),['AN'],'el pago del negocio anulado con FE no desaparece; el anulado sin FE sigue fuera');
  const exc=new Set(Array.from(r.excepciones,e=>e.tipo+':'+e.negocio));
  for(const k of ['Factura de negocio anulado:AN','A caballo del corte:ANTES','A caballo del corte:PN','A caballo del corte:PN3','Factura con datos incompletos:INC','Factura con datos incompletos:SUMA',
    'Cliente sin datos fiscales completos:INC','Factura repetida:D1','Factura repetida:D2','Factura repetida:D3'])assert.ok(exc.has(k),k);
  for(const n of ['VIVA','PN2','AN2'])assert.ok(![...exc].some(k=>k.endsWith(':'+n)),n);
  for(const n of ['AN','INC','SUMA'])assert.ok(!exc.has('Factura repetida:'+n),'no repetida '+n);
  assert.ok(!exc.has('Cliente sin datos fiscales completos:D1'));
  const sf=c.gbExporteContable([{id:'SF',kind:'quote',status:'entregado',...S,eventDate:'2026-10-20',feData:fe({cufe:'sf',numero:'30',fecha:''})}],'2026-10-01','2026-10-31',emisor());
  assert.ok(sf.excepciones.some(e=>e.tipo==='Factura sin fecha válida'&&e.negocio==='SF'));
});
await test('P1-03 / P2-02: gbFeValidar rechaza negativos, normaliza CUFE y prefijo-número, y detecta el duplicado con mismo id y distinto kind',()=>{
  const c=feCtx();const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE'};
  assert.match(c.gbFeValidar(q,{...feOk,base:-925926,inc:1925926},[q]).error,/negativ/);
  assert.match(c.gbFeValidar(q,{...feOk,base:-100,inc:0,total:-100,motivo:'x'},[q]).error,/negativ/);
  const r=c.gbFeValidar(q,{...feOk,prefijo:' g b ',numero:' 1 ',cufe:' AbC \n'},[q]);
  assert.equal(r.campos.prefijo,'GB');assert.equal(r.campos.numero,'1');assert.equal(r.campos.cufe,'abc');
  assert.equal(c.gbFeCufe(' A b\tC '),'abc');assert.equal(c.gbFeClave(' gb ','0 1'),'GB-01');
  assert.match(c.gbFeValidar(q,{...feOk,cufe:'abc'},[q,{id:'P9',kind:'proposal',quoteNumber:'GB-P-9',feData:{cufe:'ABC ',prefijo:'x',numero:'5'}}]).error,/GB-P-9/);
  assert.match(c.gbFeValidar(q,feOk,[q,{id:'P8',kind:'quote',quoteNumber:'GB-8',accountingEntityId:'GB_SAS_SIMPLE',feData:{cufe:'zz',prefijo:'gb',numero:' 1'}}]).error,/GB-8/);
  assert.match(c.gbFeValidar(q,feOk,[q,{id:'P1',kind:'proposal',quoteNumber:'GB-P-1',feData:{cufe:'abc'}}]).error,/GB-P-1/,'mismo id, otra colección');
  assert.equal(c.gbFeValidar(q,feOk,[{...q,feData:{cufe:'abc'}}]).error,undefined,'la copia fresca del mismo documento no es duplicado');
});
const feSubmit=({fresco,frescos={},feData,campos={},qExtra={},emisorCfg=emisor()})=>{
  const writes=[],toasts=[],lecturas=[],updates=[];let transacciones=0;
  const els={'fe-requiere':{checked:false},'fe-numero':{value:'1'},'fe-cufe':{value:'abc'},'fe-prefijo':{value:'GB'},'fe-fecha':{value:'2026-10-20'},
    'fe-base':{value:'925926'},'fe-inc':{value:'74074'},'fe-iva':{value:''},'fe-total':{value:'1000000'},'fe-motivo':{value:''},...campos};
  const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE',...(feData?{feData}:{}),...qExtra};
  const fb={db:{},doc:(db,c,id)=>({c,id}),serverTimestamp:()=>'TS',
    updateDoc:async(ref,p)=>updates.push([ref,p]),
    runTransaction:async(db,fn)=>{transacciones++;return fn({get:async()=>({exists:()=>true,data:()=>({accountingEntityId:'GB_SAS_SIMPLE',...fresco})}),update:(ref,p)=>writes.push([ref,p])})}};
  const ctx=loadSourceFunctions([['app-historial.js','submitFe'],['app-historial.js','gbFeLeer'],['app-historial.js','gbFeValidar'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeClave'],['app-historial.js','gbFeDocsFrescos'],
    ['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida'],['app-historial.js','gbFeBloqueo'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{
    window:{fb},$:id=>els[id],quotesCache:[q],GB_EMISOR:emisorCfg,_feBase64:null,getCollectionName:()=>'quotes',auditStamp:()=>({}),gbTodayIso:()=>'2026-10-20',
    getDocTotal:x=>x.total||0,totalCargos:x=>(x.cargos||[]).reduce((a,b)=>a+b.monto,0),logOperacion:async o=>o.runner(),toast:(m,t)=>toasts.push([m,t]),
    showLoader:()=>{},hideLoader:()=>{},closeConfirmModal:()=>{},renderHist:()=>{},curMode:'hist',gbMensajeError:e=>e.paraUsuario?e.message:'error genérico',
    readHistoryCollection:async(c,o)=>{lecturas.push(c+':'+!!(o&&o.requireFresh));return {docs:frescos[c]||[]}},console:{error(){},warn(){},log(){}}});
  return {ctx,writes,toasts,q,lecturas,updates,tx:()=>transacciones};
};
await test('P1-03: submitFe revalida en una transacción con el documento fresco y con duplicados leídos del servidor justo antes de guardar',async()=>{
  let t=feSubmit({fresco:{total:1000000}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1);assert.equal(t.writes[0][1].feData.cufe,'abc');assert.equal(t.writes[0][1].feData.numero,'1');
  assert.deepEqual(t.lecturas.sort(),['propfinals:true','proposals:true','quotes:true']);
  t=feSubmit({fresco:{total:1000000,cargos:[{monto:15000}]}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'el total cambió en otra sesión: no guarda');assert.match(t.toasts.at(-1)[0],/motivo/);
  t=feSubmit({fresco:{total:1000000},frescos:{propfinals:[{id:'GB-PF-7',quoteNumber:'GB-PF-7',feData:{cufe:'ABC',prefijo:'Z',numero:'3'}}]}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'otra sesión registró el mismo CUFE: no guarda');assert.match(t.toasts.at(-1)[0],/GB-PF-7/);
  t=feSubmit({fresco:{total:1000000},feData:{motivoDiferencia:'motivo anterior'}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes[0][1].feData.cufe,'abc');assert.equal(t.writes[0][1].feData.motivoDiferencia,undefined,'el total ya cuadra: no queda un motivo viejo');
  t=feSubmit({fresco:{total:1000000},frescos:{quotes:[{id:'P1',total:1000000,feData:{cufe:'abc'}}]}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1,'el propio documento en la lectura fresca no es duplicado');
});
const anular=({accion,q,fresco})=>{
  const writes=[],toasts=[];
  const els={'an-motivo':{value:'cliente_cancelo'},'an-motivo-otro':{value:''},'an-notas':{value:''},'an-accion':{value:accion},'an-dev-monto':{value:''},'an-reemplazo':{checked:false}};
  const fb={db:{},doc:(db,c,id)=>({c,id}),serverTimestamp:()=>'TS',
    runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>fresco}),update:(ref,p)=>writes.push(p)})};
  const ctx=loadSourceFunctions([['app-historial.js','submitAnular']],{
    window:{fb},$:id=>els[id],_anularCtx:{docId:q.id,kind:q.kind,q},quotesCache:[q],MOTIVOS_ANULACION:{cliente_cancelo:'Cliente canceló'},totalCobrado:()=>0,
    getCollectionName:()=>'quotes',auditStamp:()=>({}),logOperacion:async o=>o.runner(),showLoader:()=>{},hideLoader:()=>{},closeAnularModal:()=>{},renderHist:()=>{},
    curMode:'hist',toast:(m,t)=>toasts.push([m,t]),alert:m=>toasts.push([m,'alert']),getPagos:x=>x.pagos||[],fm:x=>String(x),
    gbMensajeError:e=>e.paraUsuario?e.message:'error genérico',console:{error(){},warn(){},log(){}}});
  return {ctx,writes,toasts};
};
await test('P2-01: regresar a cotización borra el sello; anular o regresar un pedido con FE registrada queda bloqueado («requiere nota crédito»)',async()=>{
  const sello={accountingEntityId:'GB_SAS_SIMPLE',emisorSnapshot:{nit:'1'},clienteFiscal:{nombre:'A'}};
  const q={id:'Q1',kind:'quote',status:'pedido',...sello};
  let t=anular({accion:'regresar',q,fresco:{status:'pedido',...sello}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,1);
  for(const f of ['accountingEntityId','emisorSnapshot','clienteFiscal']){assert.equal(t.writes[0][f],null,f);assert.equal(q[f],null,'caché '+f)}
  const qa={id:'Q2',kind:'quote',status:'pedido',...sello};
  t=anular({accion:'anular',q:qa,fresco:{status:'pedido',...sello}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,1);assert.equal(t.writes[0].accountingEntityId,undefined,'anular conserva el sello');
  for(const accion of ['anular','regresar']){
    const qf={id:'Q3',kind:'quote',status:'pedido',...sello};
    t=anular({accion,q:qf,fresco:{status:'pedido',...sello,feData:{cufe:'x'}}});await t.ctx.submitAnular();
    assert.equal(t.writes.length,0,accion+' con FE fresca');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  }
  const toasts=[];let abierto=false;
  const m=loadSourceFunctions([['app-historial.js','openAnularModal']],{cloudOnline:true,quotesCache:[{id:'Q4',kind:'quote',status:'pedido',feData:{cufe:'x'}}],
    toast:msg=>toasts.push(msg),$:()=>{abierto=true;return {classList:{add(){},remove(){}},value:'',textContent:''}},getDocTotal:()=>0,totalCobrado:()=>0,STATUS_META:{},fm:String,gbTodayIso:()=>'2026-10-01'});
  m.openAnularModal('Q4','quote');
  assert.equal(abierto,false);assert.match(toasts[0],/nota crédito/);
});
await test('P2-02: la tarjeta y la descarga del exporte exigen la activación completa (fecha, razón social y NIT)',async()=>{
  const conf=e=>core(['gbEmisorConfigurado'],{GB_EMISOR:e}).gbEmisorConfigurado();
  assert.equal(conf(emisor()),true);
  for(const x of [{nit:''},{razonSocial:''},{fechaInicio:null}])assert.equal(conf(emisor(x)),false,JSON.stringify(x));
  const tarjeta=async e=>{const el={innerHTML:''};const c=loadSourceFunctions([['app-dashboard.js','renderReportes'],['app-core.js','gbEmisorConfigurado']],
    {GB_EMISOR:e,quotesCache:[{}],$:id=>id==='reportes-content'?el:null,reportesFiltros:{desde:'x',hasta:'y',estado:'todos'},setTimeout:()=>{}});await c.renderReportes();return el.innerHTML};
  assert.match(await tarjeta(emisor()),/Exporte contable/);
  for(const x of [{nit:''},{razonSocial:''},{fechaInicio:null}])assert.doesNotMatch(await tarjeta(emisor(x)),/Exporte contable/,JSON.stringify(x));
  const descarga=e=>{const toasts=[];let exportado=false;
    const c=loadSourceFunctions([['app-dashboard.js','descargarExporteContable'],['app-core.js','gbEmisorConfigurado']],{GB_EMISOR:e,
      $:id=>({value:id==='rep-cont-desde'?'2026-10-01':'2026-10-31'}),toast:m=>toasts.push(m),XLSX:undefined,quotesCache:[],
      gbExporteContable:()=>{exportado=true;return {ventas:[],pagos:[],excepciones:[],cuadre:[]}}});
    c.descargarExporteContable();return {toasts,exportado}};
  for(const x of [{nit:''},{razonSocial:''}]){const d=descarga(emisor(x));assert.equal(d.exportado,false);assert.match(d.toasts[0],/no está activa/)}
  assert.match(descarga(emisor()).toasts[0],/librería de Excel/,'con la empresa completa pasa la compuerta');
});
// ─── Ronda 3 de Codex (v7.10.0): hallazgos de la ronda 2 ───
const FE_EMITIDA={prefijo:'GB',numero:'1',cufe:'abc',fecha:'2026-10-20',base:925926,inc:74074,iva:0,total:1000000,estado:'emitida',accountingEntityId:'GB_SAS_SIMPLE'};
const vacios={'fe-numero':{value:''},'fe-cufe':{value:''},'fe-prefijo':{value:''},'fe-fecha':{value:''},'fe-base':{value:''},'fe-inc':{value:''},'fe-total':{value:''}};
await test('R2 P1-01: una FE con CUFE no se borra ni se reemplaza desde su modal (caché o documento fresco): «requiere nota crédito»',async()=>{
  let t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},feData:FE_EMITIDA,campos:vacios});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length+t.updates.length,0,'desmarcar y vaciar no borra la FE');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},feData:FE_EMITIDA,campos:{'fe-requiere':{checked:true},'fe-cufe':{value:'otro'}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'otro CUFE no reemplaza la FE');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},feData:FE_EMITIDA,campos:{'fe-requiere':{checked:true},'fe-total':{value:'1000001'},'fe-base':{value:'925927'},'fe-motivo':{value:'x'}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'otros valores no reemplazan la FE');
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},feData:FE_EMITIDA,campos:{'fe-requiere':{checked:false}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'desmarcar «Requiere factura» con la FE emitida');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},feData:FE_EMITIDA,campos:{'fe-requiere':{checked:true}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1,'volver a guardarla igual (p. ej. para adjuntar el PDF) sí se puede');assert.equal(t.writes[0][1].feData.cufe,'abc');
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},campos:{...vacios,'fe-requiere':{checked:true}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'la caché no la tenía pero el documento fresco sí');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=feSubmit({fresco:{total:1000000,feData:FE_EMITIDA},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-20'},campos:{'fe-requiere':{checked:true},'fe-numero':{value:'FE-9'}}});
  await t.ctx.submitFe('P1','quote');
  assert.equal(t.updates.length+t.writes.length,0,'caché sin sello de un negocio del período de la empresa: se relee y se bloquea');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=feSubmit({fresco:{},feData:FE_EMITIDA,qExtra:{accountingEntityId:undefined,eventDate:'2026-10-05'},campos:vacios});await t.ctx.submitFe('P1','quote');
  assert.equal(t.updates.length,0,'fuera de la transacción (no sellado) también se bloquea con la caché');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  const b=loadSourceFunctions([['app-historial.js','gbFeBloqueo']],{});
  assert.equal(b.gbFeBloqueo({feData:{numero:'1'}},{requiereFE:false,feData:null}),null,'sin CUFE (persona natural) se puede quitar como en v7.9.36');
  assert.equal(b.gbFeBloqueo({feData:FE_EMITIDA},{requiereFE:true}),null,'sin tocar feData');
  assert.match(b.gbFeBloqueo({feData:FE_EMITIDA},{requiereFE:true,feData:null}),/nota crédito/,'borrar feData');
});
await test('R2 P2-01: el exporte y el modal comparten la validación fiscal: fecha de calendario real, número obligatorio y valores no negativos',()=>{
  const c=expCtx();
  const fe=x=>({prefijo:'GB',numero:'1',cufe:'c1',fecha:'2026-10-21',base:925926,inc:74074,iva:0,total:1000000,estado:'emitida',...x});
  const S={kind:'quote',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',clienteFiscal:{consumidorFinal:true,nombre:'A'},eventDate:'2026-10-20'};
  const r=c.gbExporteContable([{id:'F30',...S,feData:fe({cufe:'f30',numero:'2',fecha:'2026-02-30'})},{id:'SN',...S,feData:fe({cufe:'sn',numero:''})},
    {id:'NEG',...S,feData:fe({cufe:'ng',numero:'3',base:-90,inc:-10,total:-100})},{id:'OK',...S,feData:fe({cufe:'ok',numero:'4'})},{id:'F30B',...S,eventDate:'2026-11-20',feData:fe({cufe:'f30b',numero:'5',fecha:'2026-02-30'})}],'2026-02-01','2026-10-31',emisor());
  const exc=new Set(Array.from(r.excepciones,e=>e.tipo+':'+e.negocio));
  assert.ok(exc.has('Factura sin fecha válida:F30'),'fecha imposible');assert.ok(exc.has('Factura sin fecha válida:F30B'),'fecha imposible en el rango aunque la entrega esté fuera');assert.ok(!r.ventas.some(v=>v.negocio==='F30'),'sin fecha real no entra a Ventas');
  assert.ok(exc.has('Factura con datos incompletos:SN'),'número vacío');assert.ok(exc.has('Factura con datos incompletos:NEG'),'negativos');
  assert.ok(![...exc].some(k=>k.endsWith(':OK')),'la válida no');
  const v=feCtx();const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE'};
  assert.match(v.gbFeValidar(q,{...feOk,fecha:'2026-02-30'},[q]).error,/fecha/);
  assert.match(v.gbFeValidar(q,{...feOk,fecha:'2026-13-01'},[q]).error,/fecha/);
  assert.equal(v.gbFeValidar(q,{...feOk,fecha:'2028-02-29'},[q]).error,undefined,'bisiesto');
  assert.ok(/gbFeDatosError\(/.test(functionSource('app-historial.js','gbFeValidar'))&&/gbFeDatosError\(/.test(functionSource('app-dashboard.js','gbExporteContable')),'misma validación en el modal y el exporte');
});
await test('R2 P2-02: CUFE único entre todos los negocios; prefijo-número sólo dentro del mismo emisor (los no sellados no consumen la numeración de la SAS)',async()=>{
  const c=feCtx();const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE'};
  assert.equal(c.gbFeValidar(q,feOk,[q,{id:'PN1',kind:'quote',feData:{cufe:'persona',prefijo:'GB',numero:'1'}}]).error,undefined,'misma numeración de persona natural con otro CUFE');
  assert.equal(c.gbFeValidar(q,feOk,[q,{id:'PN2',kind:'quote',feData:{prefijo:'GB',numero:'1'}}]).error,undefined,'persona natural sin CUFE');
  assert.match(c.gbFeValidar(q,feOk,[q,{id:'PN3',kind:'quote',quoteNumber:'GB-PN3',feData:{cufe:'ABC'}}]).error,/GB-PN3/,'el CUFE es global');
  assert.match(c.gbFeValidar(q,feOk,[q,{id:'S2',kind:'quote',quoteNumber:'GB-S2',accountingEntityId:'GB_SAS_SIMPLE',feData:{prefijo:'gb',numero:'1'}}]).error,/GB-S2/,'mismo emisor, aunque sin CUFE');
  const x=expCtx();const S={kind:'quote',status:'entregado',clienteFiscal:{consumidorFinal:true,nombre:'A'},eventDate:'2026-10-20'};
  const fe=y=>({prefijo:'GB',numero:'1',fecha:'2026-10-21',base:925926,inc:74074,iva:0,total:1000000,...y});
  const r=x.gbExporteContable([{id:'SAS1',...S,accountingEntityId:'GB_SAS_SIMPLE',feData:fe({cufe:'s1'})},{id:'PN',...S,eventDate:'2026-09-20',feData:fe({cufe:'pn'})},
    {id:'SAS2',...S,accountingEntityId:'GB_SAS_SIMPLE',feData:fe({cufe:'dup',numero:'2'})},{id:'PN2',...S,eventDate:'2026-09-20',feData:fe({cufe:'DUP',numero:'77'})}],'2026-10-01','2026-10-31',emisor());
  const exc=new Set(Array.from(r.excepciones,e=>e.tipo+':'+e.negocio));
  assert.ok(!exc.has('Factura repetida:SAS1'),'la numeración de persona natural no choca con la de la SAS');
  assert.ok(exc.has('Factura repetida:SAS2'),'CUFE repetido contra un negocio no sellado');
  const t=feSubmit({fresco:{total:1000000,accountingEntityId:null}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,0,'el documento fresco ya no tiene el sello (regresado en otra sesión): no se registra la FE de la empresa');
});
await test('R2 P2-03: el registro de FE de negocios no sellados guarda con updateDoc como en v7.9.36 (sin transacción ni lecturas del servidor)',async()=>{
  const pn={'fe-requiere':{checked:true},'fe-numero':{value:'FE-1'},'fe-cufe':undefined};
  let t=feSubmit({fresco:{},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-20'},campos:pn,emisorCfg:emisor({fechaInicio:null,razonSocial:'',nit:''})});await t.ctx.submitFe('P1','quote');
  assert.equal(t.updates.length,1,'empresa apagada');assert.equal(t.tx(),0);assert.equal(t.lecturas.length,0);assert.equal(t.updates[0][1].feData.numero,'FE-1');assert.equal(t.updates[0][1].updatedAt,'TS');
  t=feSubmit({fresco:{},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-05'},campos:pn});await t.ctx.submitFe('P1','quote');
  assert.equal(t.updates.length,1,'empresa activa, entrega antes del inicio');assert.equal(t.tx(),0);
  t=feSubmit({fresco:{total:1000000},campos:{'fe-requiere':{checked:true}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.updates.length,0);assert.equal(t.tx(),1,'sellado: transacción');
});
// ─── Ronda 4 de Codex (v7.10.0): hallazgo de la ronda 3 ───
await test('R3 P2-R3-01: una caché sin sello no escribe una FE incompleta sobre un documento fresco ya sellado para la empresa: pide recargar',async()=>{
  const viejo={'fe-requiere':{checked:true},'fe-numero':{value:'FE-77'},'fe-cufe':undefined};
  let t=feSubmit({fresco:{total:1000000},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-20'},campos:viejo});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length+t.updates.length,0,'el modal antiguo (sólo número) no escribe sobre el documento sellado');
  assert.match(t.toasts.at(-1)[0],/[Rr]ecarga el historial/);
  t=feSubmit({fresco:{total:1000000,accountingEntityId:null},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-20'},campos:viejo});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1,'si el documento fresco tampoco está sellado, guarda como antes');assert.equal(t.writes[0][1].feData.numero,'FE-77');
  t=feSubmit({fresco:{total:1000000},campos:{'fe-requiere':{checked:true},...vacios}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1,'caché sellada sin datos fiscales (sólo «Requiere factura») sigue guardando');
});
console.log(`✅ ${passed} tests pasaron`);
