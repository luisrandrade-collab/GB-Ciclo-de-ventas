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
const expCtx=()=>loadSourceFunctions([['app-dashboard.js','gbExporteContable'],['app-historial.js','gbFeSumaNotas'],['app-historial.js','gbFeEstado'],['app-historial.js','gbFeAnuladaConNotas'],['app-dashboard.js','gbCompraFiscalError'],['app-historial.js','metodoFiscal'],['app-historial.js','pagoFechaIso'],['app-core.js','gbFiscalValidar'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeClave'],['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida']],{REPORTES_VENDIDO_STATUS:VENDIDO,
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
const feSubmit=({fresco,frescos={},feData,campos={},qExtra={},emisorCfg=emisor(),base64=null,extra={}})=>{
  const writes=[],toasts=[],lecturas=[],updates=[],subidas=[],borrados=[];let transacciones=0;
  const els={'fe-requiere':{checked:false},'fe-numero':{value:'1'},'fe-cufe':{value:'abc'},'fe-prefijo':{value:'GB'},'fe-fecha':{value:'2026-10-20'},
    'fe-base':{value:'925926'},'fe-inc':{value:'74074'},'fe-iva':{value:''},'fe-total':{value:'1000000'},'fe-motivo':{value:''},...campos};
  const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE',...(feData?{feData}:{}),...qExtra};
  const fb={db:{},doc:(db,c,id)=>({c,id}),serverTimestamp:()=>'TS',storage:{},storageRef:(st,path)=>({path}),deleteObject:async r=>borrados.push(r.path),
    updateDoc:async(ref,p)=>updates.push([ref,p]),
    runTransaction:async(db,fn)=>{transacciones++;return fn({get:async()=>({exists:()=>true,data:()=>({accountingEntityId:'GB_SAS_SIMPLE',...fresco})}),update:(ref,p)=>writes.push([ref,p])})}};
  const ctx=loadSourceFunctions([['app-historial.js','submitFe'],['app-historial.js','gbFeLeer'],['app-historial.js','gbFeValidar'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeClave'],['app-historial.js','gbFeDocsFrescos'],
    ['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida'],['app-historial.js','gbFeBloqueo'],['app-historial.js','gbFeSumaNotas'],['app-historial.js','gbFeEstado'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{
    window:{fb},$:id=>els[id],quotesCache:[q],GB_EMISOR:emisorCfg,_feBase64:base64,uploadFotoFromBase64:async()=>{const r={url:'https://x/fe.jpg',path:'facturas/P1-1.jpg'};subidas.push(r.path);return r},getCollectionName:()=>'quotes',auditStamp:()=>({}),gbTodayIso:()=>'2026-10-20',
    getDocTotal:x=>x.total||0,totalCargos:x=>(x.cargos||[]).reduce((a,b)=>a+b.monto,0),logOperacion:async o=>o.runner(),toast:(m,t)=>toasts.push([m,t]),
    showLoader:()=>{},hideLoader:()=>{},closeConfirmModal:()=>{},renderHist:()=>{},curMode:'hist',gbMensajeError:e=>e.paraUsuario?e.message:'error genérico',
    readHistoryCollection:async(c,o)=>{lecturas.push(c+':'+!!(o&&o.requireFresh));return {docs:frescos[c]||[]}},console:{error(){},warn(){},log(){}},...extra});
  return {ctx,writes,toasts,q,lecturas,updates,subidas,borrados,tx:()=>transacciones};
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
  const ctx=loadSourceFunctions([['app-historial.js','submitAnular'],['app-historial.js','gbFeAnuladaConNotas'],['app-historial.js','gbFeSumaNotas']],{
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
  const m=loadSourceFunctions([['app-historial.js','openAnularModal'],['app-historial.js','gbFeAnuladaConNotas'],['app-historial.js','gbFeSumaNotas']],{cloudOnline:true,quotesCache:[{id:'Q4',kind:'quote',status:'pedido',feData:{cufe:'x'}}],
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
// ─── v7.10.1: compras fiscales, notas crédito, exporte completo y resumen (plan C1–C4) ───
const FE_NC={prefijo:'GB',numero:'1',cufe:'abc',fecha:'2026-10-20',base:925926,inc:74074,iva:0,total:1000000,estado:'emitida',accountingEntityId:'GB_SAS_SIMPLE'};
const ncCtx=()=>loadSourceFunctions([['app-historial.js','gbNcValidar'],['app-historial.js','gbFeSumaNotas'],['app-historial.js','gbFeEstado'],['app-historial.js','gbFeAnuladaConNotas'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida']],{});
const ncOk={prefijo:'NC',numero:'1',cufe:'nc1',fecha:'2026-10-25',valor:100000,base:92593,inc:7407,iva:null,motivo:'Descuento acordado'};
await test('v7.10.1 C2: nota crédito — validación, CUFE repetido, suma mayor que la FE y estado derivado',()=>{
  const c=ncCtx();
  const r=c.gbNcValidar(FE_NC,ncOk,[]);
  assert.equal(r.error,undefined);assert.equal(r.nota.valor,100000);assert.equal(r.nota.iva,0);assert.equal(r.nota.cufe,'nc1');
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,cufe:''},[]).error,/CUFE/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,fecha:'2026-02-30'},[]).error,/fecha/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,inc:1},[]).error,/no da el total de la nota crédito/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,base:-1,inc:100001},[]).error,/negativ/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,valor:0,base:0,inc:0},[]).error,/mayor que cero/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,motivo:' '},[]).error,/motivo/);
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,fecha:'2026-10-19'},[]).error,/anterior a la factura/);
  assert.match(c.gbNcValidar({numero:'1'},ncOk,[]).error,/CUFE/,'sin FE con CUFE no hay nota');
  assert.match(c.gbNcValidar(FE_NC,{...ncOk,cufe:' ABC '},[]).error,/ya está registrado/,'el CUFE de la propia FE');
  const conNota={...FE_NC,notasCredito:[{id:'n1',...ncOk}]};
  assert.match(c.gbNcValidar(conNota,{...ncOk,numero:'2'},[]).error,/ya está registrado/,'CUFE de otra nota de la misma FE');
  assert.match(c.gbNcValidar(FE_NC,ncOk,[{id:'X',quoteNumber:'GB-X',feData:{cufe:'zz',notasCredito:[{cufe:'NC1'}]}}]).error,/GB-X/,'CUFE de una nota de otro negocio');
  assert.match(c.gbNcValidar(FE_NC,ncOk,[{id:'Y',quoteNumber:'GB-Y',feData:{cufe:'nc1'}}]).error,/GB-Y/,'CUFE de la FE de otro negocio');
  assert.match(c.gbNcValidar(conNota,{...ncOk,cufe:'nc2',valor:900001,base:900001,inc:0},[]).error,/superan el total/);
  assert.equal(c.gbNcValidar(conNota,{...ncOk,cufe:'nc2',valor:900000,base:900000,inc:0},[]).error,undefined,'hasta el total exacto');
  assert.equal(c.gbFeEstado(FE_NC),'emitida');assert.equal(c.gbFeEstado(conNota),'ajustada');
  const anulada={...FE_NC,notasCredito:[{valor:600000},{valor:400000}]};
  assert.equal(c.gbFeEstado(anulada),'anulada');assert.equal(c.gbFeAnuladaConNotas(anulada),true);
  assert.equal(c.gbFeAnuladaConNotas(conNota),false);assert.equal(c.gbFeAnuladaConNotas({...FE_NC,estado:'anulada'}),false,'anulada sin notas no cuenta');
});
const ncSubmit=({fresco,frescos={},campos={},qFe=FE_NC,emisorCfg=emisor()})=>{
  const writes=[],toasts=[],lecturas=[];
  const els={'nc-prefijo':{value:'NC'},'nc-numero':{value:'1'},'nc-cufe':{value:'nc1'},'nc-fecha':{value:'2026-10-25'},'nc-valor':{value:'100000'},'nc-base':{value:'92593'},
    'nc-inc':{value:'7407'},'nc-iva':{value:''},'nc-motivo':{value:'Descuento'},...campos};
  const q={id:'P1',kind:'quote',total:1000000,accountingEntityId:'GB_SAS_SIMPLE',feData:qFe};
  const fb={db:{},doc:(db,c,id)=>({c,id}),serverTimestamp:()=>'TS',
    runTransaction:async(db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>({accountingEntityId:'GB_SAS_SIMPLE',...fresco})}),update:(ref,p)=>writes.push([ref,p])})};
  const ctx=loadSourceFunctions([['app-historial.js','submitNotaCredito'],['app-historial.js','gbNcValidar'],['app-historial.js','gbFeSumaNotas'],['app-historial.js','gbFeEstado'],['app-historial.js','gbFeCufe'],
    ['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeFechaValida'],['app-historial.js','gbFeDocsFrescos'],['app-core.js','gbEmisorConfigurado']],{
    window:{fb},$:id=>els[id],quotesCache:[q],GB_EMISOR:emisorCfg,getCollectionName:()=>'quotes',auditStamp:()=>({}),logOperacion:async o=>o.runner(),toast:(m,t)=>toasts.push([m,t]),
    showLoader:()=>{},hideLoader:()=>{},closeConfirmModal:()=>{},renderHist:()=>{},curMode:'hist',gbMensajeError:e=>e.paraUsuario?e.message:'error genérico',
    readHistoryCollection:async(c,o)=>{lecturas.push(c+':'+!!(o&&o.requireFresh));return {docs:frescos[c]||[]}},console:{error(){},warn(){},log(){}}});
  return {ctx,writes,toasts,q,lecturas};
};
await test('v7.10.1 C2: submitNotaCredito agrega la nota a la lista fresca (append-only) en una transacción y deriva el estado',async()=>{
  const previa={id:'n0',prefijo:'NC',numero:'0',cufe:'nc0',fecha:'2026-10-21',valor:50000,base:46296,inc:3704,iva:0,motivo:'x'};
  let t=ncSubmit({fresco:{feData:{...FE_NC,notasCredito:[previa]}}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,1);const fe=t.writes[0][1].feData;
  assert.deepEqual(Array.from(fe.notasCredito,n=>n.cufe),['nc0','nc1'],'conserva la nota que la caché no tenía');
  assert.equal(fe.estado,'ajustada');assert.equal(fe.cufe,'abc');assert.ok(fe.notasCredito[1].id,'la nota lleva id');
  assert.deepEqual(t.lecturas.sort(),['propfinals:true','proposals:true','quotes:true']);
  assert.equal(t.q.feData.notasCredito.length,2,'caché actualizada');
  t=ncSubmit({fresco:{feData:{...FE_NC,notasCredito:[{...previa,valor:950000,base:950000,inc:0}]}}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,0,'otra sesión ya registró notas: la suma supera la FE');assert.match(t.toasts.at(-1)[0],/superan el total/);
  t=ncSubmit({fresco:{feData:FE_NC},campos:{'nc-valor':{value:'1000000'},'nc-base':{value:'925926'},'nc-inc':{value:'74074'}}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes[0][1].feData.estado,'anulada');
  t=ncSubmit({fresco:{feData:FE_NC},frescos:{proposals:[{id:'Z',quoteNumber:'GB-P-Z',feData:{cufe:'NC1'}}]}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,0,'CUFE registrado en otro negocio (lectura del servidor)');assert.match(t.toasts.at(-1)[0],/GB-P-Z/);
  t=ncSubmit({fresco:{feData:{...FE_NC,cufe:'otra'}}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,0,'la FE cambió en otra sesión');assert.match(t.toasts.at(-1)[0],/[Rr]ecarga/);
  t=ncSubmit({fresco:{feData:FE_NC},campos:{'nc-cufe':{value:''}}});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,0);assert.match(t.toasts.at(-1)[0],/CUFE/);
});
await test('v7.10.1 C2: registrar la FE otra vez (p. ej. adjuntar el PDF) conserva las notas frescas y el estado derivado',async()=>{
  const nota={id:'n1',cufe:'nc1',fecha:'2026-10-25',valor:100000,base:92593,inc:7407,iva:0};
  const t=feSubmit({fresco:{total:1000000,feData:{...FE_EMITIDA,notasCredito:[nota],estado:'ajustada'}},feData:FE_EMITIDA,campos:{'fe-requiere':{checked:true}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1);assert.deepEqual(Array.from(t.writes[0][1].feData.notasCredito,n=>n.id),['n1']);assert.equal(t.writes[0][1].feData.estado,'ajustada');
});
await test('v7.10.1 C2: anular un pedido con FE sólo se permite con la FE anulada por completo con notas crédito; regresar sigue bloqueado',async()=>{
  const sello={accountingEntityId:'GB_SAS_SIMPLE',emisorSnapshot:{nit:'1'},clienteFiscal:{nombre:'A'}};
  const feAnulada={...FE_NC,notasCredito:[{valor:1000000}],estado:'anulada'};
  const feParcial={...FE_NC,notasCredito:[{valor:1}],estado:'ajustada'};
  let t=anular({accion:'anular',q:{id:'A1',kind:'quote',status:'pedido',...sello,feData:feAnulada},fresco:{status:'pedido',...sello,feData:feAnulada}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,1,'FE anulada: se puede anular');assert.equal(t.writes[0].status,'anulada');assert.equal(t.writes[0].feData,undefined,'la FE y sus notas se conservan');
  t=anular({accion:'anular',q:{id:'A2',kind:'quote',status:'pedido',...sello,feData:feAnulada},fresco:{status:'pedido',...sello,feData:feParcial}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,0,'el documento fresco sólo está ajustado');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=anular({accion:'regresar',q:{id:'A3',kind:'quote',status:'pedido',...sello,feData:feAnulada},fresco:{status:'pedido',...sello,feData:feAnulada}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,0,'regresar con FE: bloqueado');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  t=anular({accion:'regresar',q:{id:'A4',kind:'quote',status:'pedido',...sello},fresco:{status:'pedido',...sello,feData:feAnulada}});await t.ctx.submitAnular();
  assert.equal(t.writes.length,0,'regresar: la transacción lo bloquea aunque la caché no tenga la FE');assert.match(t.toasts.at(-1)[0],/nota crédito/);
  const abrir=fe=>{const toasts=[];let abierto=false;
    const m=loadSourceFunctions([['app-historial.js','openAnularModal'],['app-historial.js','gbFeAnuladaConNotas'],['app-historial.js','gbFeSumaNotas']],{cloudOnline:true,quotesCache:[{id:'Q4',kind:'quote',status:'pedido',feData:fe}],
      toast:msg=>toasts.push(msg),$:()=>{abierto=true;return {classList:{add(){},remove(){}},value:'',textContent:''}},getDocTotal:()=>0,totalCobrado:()=>0,STATUS_META:{},fm:String,gbTodayIso:()=>'2026-10-01'});
    m.openAnularModal('Q4','quote');return {abierto,toasts}};
  assert.equal(abrir(feAnulada).abierto,true,'con la FE anulada abre la ventana');
  const p=abrir(feParcial);assert.equal(p.abierto,false);assert.match(p.toasts[0],/nota crédito/);
});
const cfA={consumidorFinal:false,nombre:'A SAS',tipoId:'NIT',numId:'900-1',mail:'a@b.co',dir:'Calle 1',tel:'300'};
const compra=(x={})=>({id:'C1',estado:'comprada',fecha:'2026-10-15',total:119000,formaPago:'transferencia',proveedorNombre:'Prov',accountingEntityId:'GB_SAS_SIMPLE',
  proveedorFiscal:{nombre:'Prov',tipoId:'NIT',idNum:'800-1'},soporteFiscal:{tipo:'FE',prefijo:'PV',numero:'77',cufe:'pc1',base:100000,iva:19000,inc:0,total:119000,motivo:''},...x});
await test('v7.10.1 C3: exporte — notas crédito en negativo en su propio período, estado, Clientes, Compras, Resumen y excepciones nuevas',()=>{
  const c=expCtx();
  const n1={id:'n1',prefijo:'NC',numero:'1',cufe:'nc1',fecha:'2026-10-25',valor:100000,base:92593,inc:7407,iva:0,motivo:'x'};
  const n2={id:'n2',prefijo:'NC',numero:'2',cufe:'nc2',fecha:'2026-11-05',valor:900000,base:833333,inc:66667,iva:0,motivo:'y'};
  const S={kind:'proposal',status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',clienteFiscal:cfA,eventDate:'2026-10-20',city:'La Calera'};
  const docs=[
    {id:'F1',quoteNumber:'GB-P-1',...S,feData:{...FE_NC,notasCredito:[n1,n2],estado:'anulada'},pagos:[{fecha:'2026-10-10',monto:300000,metodo:'Nequi'}]},
    {id:'F2',quoteNumber:'GB-2',...S,kind:'quote',city:'Bogotá',clienteFiscal:{...cfA,nombre:'A SAS (otro nombre)'},feData:{...FE_NC,cufe:'f2',numero:'2',base:185185,inc:14815,total:200000}},
    {id:'F3',...S,clienteFiscal:{consumidorFinal:true,nombre:'Juan',numId:'222222222222'},feData:{...FE_NC,cufe:'f3',numero:'3',estado:'anulada'}},
    {id:'F4',...S,feData:{...FE_NC,cufe:'f4',numero:'4',notasCredito:[{...n1,cufe:'nc4',valor:1100000,base:1100000,inc:0}]}},
    {id:'F5',...S,feData:{numero:'5',notasCredito:[{...n1,cufe:'nc5'}]}},
    {id:'F6',...S,feData:{...FE_NC,cufe:'f6',numero:'6',notasCredito:[{...n1,cufe:'nc6',fecha:'2026-10-45'}]}},
    {id:'F7',...S,status:'anulada',feData:{...FE_NC,cufe:'f7',numero:'7',estado:'anulada',notasCredito:[{...n1,cufe:'nc7',fecha:'2026-10-26',valor:1000000,base:925926,inc:74074}]}}
  ];
  const compras=[compra(),compra({id:'C2',soporteFiscal:{tipo:'SIN',motivo:'Plaza de mercado'},proveedorFiscal:{nombre:'Plaza',tipoId:'',idNum:''},total:50000,formaPago:'efectivo'}),
    compra({id:'C3',soporteFiscal:{tipo:'DS',prefijo:'',numero:'9',cufe:'',base:1,iva:0,inc:0,total:1}}),
    compra({id:'C4',fecha:'2026-11-02'}),compra({id:'C5',accountingEntityId:undefined}),compra({id:'C6',estado:'pendiente'})];
  const r=c.gbExporteContable(docs,'2026-10-01','2026-10-31',emisor(),compras);
  const f1=r.ventas.filter(v=>v.negocio==='GB-P-1');
  assert.deepEqual(Array.from(f1,v=>v.total),[1000000,-100000],'FE con su valor original y la nota de octubre en negativo; la de noviembre queda fuera');
  assert.equal(f1[0].estado,'anulada');assert.equal(f1[1].estado,'nota crédito');assert.equal(f1[1].afecta,'GB-1');assert.equal(f1[1].cufe,'nc1');assert.equal(f1[1].fechaFE,'2026-10-25');
  assert.equal(f1[1].base,-92593);assert.equal(f1[1].inc,-7407);assert.equal(f1[0].afecta,'');
  const nov=c.gbExporteContable(docs,'2026-11-01','2026-11-30',emisor(),compras);
  const f1n=nov.ventas.filter(v=>v.negocio==='GB-P-1');
  assert.deepEqual(Array.from(f1n,v=>v.total),[-900000],'la segunda nota en su propio período, sin la FE');
  const exc=new Set(Array.from(r.excepciones,e=>e.tipo+':'+e.negocio));
  for(const k of ['Factura anulada sin notas crédito:F3','Notas crédito mayores que la factura:F4','Nota crédito sin factura:F5','Nota crédito con datos incompletos:F6',
    'Compra sin identificación del proveedor:C2','Compra con datos fiscales inválidos:C3'])assert.ok(exc.has(k),k);
  for(const k of ['Factura anulada sin notas crédito:GB-P-1','Notas crédito mayores que la factura:GB-P-1','Compra sin identificación del proveedor:C1','Compra con datos fiscales inválidos:C1','Compra con datos fiscales inválidos:C2','Factura de negocio anulado:F7'])assert.ok(!exc.has(k),k);
  assert.deepEqual(Array.from(r.compras,x=>x.id).sort(),['C1','C2','C3'],'sólo compras selladas, compradas y del período');
  const c1=r.compras.find(x=>x.id==='C1');
  assert.equal(c1.tipo,'Factura electrónica');assert.equal(c1.factura,'PV-77');assert.equal(c1.cufe,'pc1');assert.equal(c1.tipoId,'NIT');assert.equal(c1.idNum,'800-1');
  assert.equal(c1.iva,19000);assert.equal(c1.total,119000);assert.equal(c1.medioPago,'transferencia');assert.equal(c1.proveedor,'Prov');
  const c2=r.compras.find(x=>x.id==='C2');assert.equal(c2.tipo,'Sin soporte');assert.equal(c2.total,50000);
  assert.deepEqual(Array.from(r.clientes,x=>x.tipoId+':'+x.numId).sort(),[':222222222222','NIT:900-1'],'clientes únicos por identificación');
  const res=Object.fromEntries(r.resumen.map(x=>[x[0],x[1]]));
  const netas=1000000-100000+200000+1000000+1000000-1100000+1000000;
  assert.equal(res['Ingresos brutos (facturado menos notas crédito)'],netas);
  assert.equal(res['INC'],r.ventas.reduce((t,v)=>t+v.inc,0));assert.equal(res['Base gravada con INC'],925926*4+185185-92593,'sólo filas con INC (la nota nc4 sin INC no suma)');
  assert.equal(res['Ingresos · La Calera · CIIU 5621'],netas-200000);assert.equal(res['Ingresos · Bogotá · CIIU 5619'],200000);
  assert.equal(res['Cobros por medio electrónico'],300000);
  assert.equal(res['Compras · base'],100001);assert.equal(res['Compras · IVA'],19000);assert.equal(res['Compras · INC'],0);
  assert.ok('Aportes a pensión (dato manual)' in res);assert.equal(res['Aportes a pensión (dato manual)'],'');
  const cu=Object.fromEntries(r.cuadre.map(x=>[x[0].trim(),x[1]]));
  assert.equal(cu['Ventas facturadas (total)'],netas);assert.equal(cu['De ellas, notas crédito'],-2200000);
  const sin=c.gbExporteContable(docs,'2026-10-01','2026-10-31',emisor());
  assert.equal(sin.compras.length,0,'sin compras: hoja vacía');
});
await test('v7.10.1 C3: descargarExporteContable escribe Ventas (con «Afecta a»), Pagos, Compras, Clientes, Resumen, Excepciones y Cuadre',async()=>{
  const hojas={};let recibidas=null;
  const XLSX={utils:{book_new:()=>({}),aoa_to_sheet:a=>a,book_append_sheet:(wb,sh,n)=>{hojas[n]=sh}},writeFile:()=>{}};
  const c=loadSourceFunctions([['app-dashboard.js','descargarExporteContable'],['app-core.js','gbEmisorConfigurado']],{GB_EMISOR:emisor(),XLSX,toast:()=>{},quotesCache:[],comprasCache:[compra()],cloudOnline:false,
    $:id=>({value:id==='rep-cont-desde'?'2026-10-01':'2026-10-31'}),
    gbExporteContable:(d,a,b,e,comp)=>{recibidas=comp;return {ventas:[{afecta:'GB-1'}],pagos:[],excepciones:[],cuadre:[],compras:[{id:'C1'}],clientes:[{}],resumen:[['Ingresos brutos (facturado menos notas crédito)',1]]}}});
  await c.descargarExporteContable();
  assert.equal(recibidas.length,1,'pasa las compras al exporte');
  for(const n of ['Ventas','Pagos','Compras','Clientes','Resumen','Excepciones','Cuadre'])assert.ok(hojas[n],n);
  assert.ok(hojas.Ventas[0].includes('Afecta a'));assert.equal(hojas.Ventas[1].at(-1),'GB-1');
  assert.ok(hojas.Compras[0].includes('CUFE / CUDS'));assert.ok(hojas.Resumen.some(f=>f[0]==='Ingresos brutos (facturado menos notas crédito)'));
});
await test('v7.10.1 C1: gbCompraFiscalError — obligatorios según el tipo de soporte, no negativos, suma y total de la compra',()=>{
  const c=loadSourceFunctions([['app-dashboard.js','gbCompraFiscalError'],['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeFechaValida']],{});
  const sf={tipo:'FE',prefijo:'PV',numero:'77',cufe:'pc1',base:100000,iva:19000,inc:0,total:119000,motivo:''};
  assert.equal(c.gbCompraFiscalError(sf,119000,'2026-10-15'),null);
  assert.equal(c.gbCompraFiscalError({...sf,tipo:'DS'},119000,'2026-10-15'),null);
  assert.match(c.gbCompraFiscalError({...sf,tipo:''},119000,'2026-10-15'),/tipo de soporte/);
  assert.match(c.gbCompraFiscalError({...sf,cufe:''},119000,'2026-10-15'),/CUFE/);
  assert.match(c.gbCompraFiscalError({...sf,numero:''},119000,'2026-10-15'),/número/);
  assert.match(c.gbCompraFiscalError({...sf,base:null},119000,'2026-10-15'),/base/);
  assert.match(c.gbCompraFiscalError({...sf,iva:-1,base:100001},119000,'2026-10-15'),/negativ/);
  assert.match(c.gbCompraFiscalError({...sf,iva:18000},119000,'2026-10-15'),/no da el total del soporte/);
  assert.match(c.gbCompraFiscalError(sf,120000,'2026-10-15'),/motivo/);
  assert.equal(c.gbCompraFiscalError({...sf,motivo:'Propina aparte'},120000,'2026-10-15'),null);
  assert.equal(c.gbCompraFiscalError({tipo:'SIN',motivo:'Plaza de mercado'},50000,'2026-10-15'),null,'sin soporte sólo exige motivo');
  assert.match(c.gbCompraFiscalError({tipo:'SIN',motivo:''},50000,'2026-10-15'),/motivo/);
});
const compraEditor=({emisorCfg=emisor(),fiscal={},previa=null,proveedor={id:'PR1',nombre:'Prov',tipoId:'NIT',idNum:'800-1'},sel='PR1',estado='comprada',fecha='2026-10-15',total='119000',foto=null})=>{
  const guardados=[],toasts=[];
  const els={'compra-ed-proveedorId':{value:sel},'compra-ed-estado-pendiente':{checked:estado==='pendiente'},'compra-ed-estado-comprada':{checked:estado==='comprada'},'compra-ed-items-list':{querySelectorAll:()=>[]},
    'compra-ed-total':{value:total},'compra-ed-fecha':{value:fecha},'compra-ed-formaPago':{value:'transferencia'},'compra-ed-nota':{value:''},
    'compra-ed-fis-tipo':{value:'FE'},'compra-ed-fis-prefijo':{value:'pv'},'compra-ed-fis-numero':{value:'77'},'compra-ed-fis-cufe':{value:' PC1 '},'compra-ed-fis-base':{value:'100000'},
    'compra-ed-fis-iva':{value:'19000'},'compra-ed-fis-inc':{value:''},'compra-ed-fis-total':{value:'119000'},'compra-ed-fis-motivo':{value:''}};
  for(const k in fiscal)els['compra-ed-fis-'+k]={value:fiscal[k]};
  const ctx=loadSourceFunctions([['app-dashboard.js','saveCompraEditor'],['app-dashboard.js','gbCompraFiscalAplica'],['app-dashboard.js','gbCompraFiscalLeer'],['app-dashboard.js','gbCompraFiscalError'],
    ['app-historial.js','gbFeDatosError'],['app-historial.js','gbFeCufe'],['app-historial.js','gbFeFechaValida'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{
    $:id=>els[id],GB_EMISOR:emisorCfg,proveedoresCache:proveedor?[proveedor]:[],comprasCache:previa?[previa]:[],_compraEditorId:previa?previa.id:null,_compraEdFotoB64:foto,_compraEdFotoExisting:null,_compraEdLinkedPendientes:[],
    _comprasPendSelected:new Set(),saveCompraToCloud:async(o,opts)=>{guardados.push(o);return (opts&&opts.id)||'NUEVA'},uploadFotoFromBase64:async()=>({url:'u',path:'p'}),
    showLoader:()=>{},hideLoader:()=>{},toast:(m,t)=>toasts.push([m,t]),closeCompraEditor:()=>{},curMode:'x',gbMensajeError:e=>e.message,console:{error(){},warn(){},log(){}}});
  return {ctx,guardados,toasts};
};
await test('v7.10.1 C1: saveCompraEditor sella las compras de la nueva empresa (soporte, proveedor fiscal) y no toca las demás',async()=>{
  let t=compraEditor({});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,1);const o=t.guardados[0];
  assert.equal(o.accountingEntityId,'GB_SAS_SIMPLE');
  assert.deepEqual({...o.soporteFiscal},{tipo:'FE',prefijo:'PV',numero:'77',cufe:'pc1',base:100000,iva:19000,inc:0,total:119000,motivo:''});
  assert.deepEqual({...o.proveedorFiscal},{nombre:'Prov',tipoId:'NIT',idNum:'800-1'});
  t=compraEditor({fiscal:{cufe:''}});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,0,'datos inválidos: no guarda');assert.match(t.toasts.at(-1)[0],/CUFE/);
  t=compraEditor({proveedor:{id:'PR1',nombre:'Plaza'}});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,1,'proveedor sin identificación: guarda');assert.deepEqual({...t.guardados[0].proveedorFiscal},{nombre:'Plaza',tipoId:'',idNum:''});
  assert.match(t.toasts.at(-1)[0],/identificación/,'avisa que irá a Excepciones');
  t=compraEditor({fiscal:{tipo:'SIN',motivo:'Plaza de mercado',cufe:''}});await t.ctx.saveCompraEditor();
  assert.deepEqual({...t.guardados[0].soporteFiscal},{tipo:'SIN',motivo:'Plaza de mercado'});
  for(const x of [{emisorCfg:emisor({fechaInicio:null})},{emisorCfg:emisor({nit:''})},{fecha:'2026-10-11'},{estado:'pendiente'}]){
    t=compraEditor({...x,fiscal:{cufe:''}});await t.ctx.saveCompraEditor();
    assert.equal(t.guardados.length,1,JSON.stringify(x));const g=t.guardados[0];
    for(const k of ['accountingEntityId','soporteFiscal','proveedorFiscal'])assert.equal(k in g,false,k+' '+JSON.stringify(x));
  }
});
await test('v7.10.1 C1: al editar, la compra sellada conserva y revalida sus datos fiscales, también en la segunda escritura del comprobante',async()=>{
  const previa=compra({fecha:'2026-10-05'});
  let t=compraEditor({previa,fecha:'2026-10-05',fiscal:{cufe:''}});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,0,'sellada con fecha anterior al inicio: sigue exigiendo datos válidos');
  t=compraEditor({previa,fecha:'2026-10-05',foto:'data:image/jpeg;base64,xx'});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,2,'guarda y luego el comprobante');
  for(const g of t.guardados){assert.equal(g.accountingEntityId,'GB_SAS_SIMPLE');assert.equal(g.soporteFiscal.cufe,'pc1');assert.equal(g.proveedorFiscal.idNum,'800-1')}
  const els={};const $=id=>els[id]||(els[id]={value:'',checked:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{h:true,toggle(c,v){this.h=v},add(){this.h=true},remove(){this.h=false}}});
  const abrir=(c,e)=>{for(const k in els)delete els[k];
    const x=loadSourceFunctions([['app-dashboard.js','openCompraEditor'],['app-dashboard.js','compraEdFiscalActualizar'],['app-dashboard.js','gbCompraFiscalAplica'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{
      $,comprasCache:c?[c]:[],GB_EMISOR:e,_compraEditorId:null,_compraEdFotoB64:null,_compraEdFotoExisting:null,_compraEdLinkedPendientes:[],_compraEdItemRowSeq:0,
      _compraEdRefreshProveedorOptions:()=>{},compraEdAddItem:()=>{},_compraEdRefreshItemsDatalist:()=>{},escapeHtml:String,gbTodayIso:()=>'2026-10-20'});
    x.openCompraEditor(c?c.id:null);return els};
  let e=abrir(previa,emisor());
  assert.equal(e['compra-ed-fiscal'].classList.h,false,'sellada: bloque visible');assert.equal(e['compra-ed-fis-cufe'].value,'pc1');assert.equal(e['compra-ed-fis-iva'].value,19000);assert.equal(e['compra-ed-fis-tipo'].value,'FE');
  e=abrir(null,emisor());assert.equal(e['compra-ed-fiscal'].classList.h,false,'nueva compra de hoy con la empresa activa');assert.equal(e['compra-ed-fis-cufe'].value,'');
  e=abrir(null,emisor({fechaInicio:null}));assert.equal(e['compra-ed-fiscal'].classList.h,true,'apagada: el editor queda como hoy');
  assert.ok(/id="compra-ed-fecha"[^>]*onchange="compraEdFiscalActualizar\(\)"/.test(source('index.html')),'cambiar la fecha actualiza el bloque');
  assert.ok(/compraEdFiscalActualizar\(\)/.test(functionSource('app-dashboard.js','compraEdToggleEstado')),'cambiar el estado actualiza el bloque');
});
await test('v7.10.1 C4 (P3-R4-01): si la transacción de la FE aborta, el adjunto ya subido se borra de Storage',async()=>{
  const viejo={'fe-requiere':{checked:true},'fe-numero':{value:'FE-77'},'fe-cufe':undefined};
  let t=feSubmit({fresco:{total:1000000},qExtra:{accountingEntityId:undefined,eventDate:'2026-10-20'},campos:viejo,base64:'data:image/jpeg;base64,xx'});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length+t.updates.length,0);assert.match(t.toasts.at(-1)[0],/[Rr]ecarga el historial/);
  assert.deepEqual(t.borrados,t.subidas,'ningún adjunto huérfano');
  t=feSubmit({fresco:{total:1000000},campos:{'fe-requiere':{checked:true}},base64:'data:image/jpeg;base64,xx'});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1);assert.equal(t.writes[0][1].feData.fotoUrl,'https://x/fe.jpg');assert.equal(t.borrados.length,0,'guardado: el adjunto se conserva');
  t=feSubmit({fresco:{total:1000000},campos:{'fe-requiere':{checked:true}},base64:'data:image/jpeg;base64,xx',extra:{renderHist:()=>{throw new Error('pantalla')}}});await t.ctx.submitFe('P1','quote');
  assert.equal(t.writes.length,1);assert.equal(t.borrados.length,0,'un error después de guardar no borra el adjunto que ya quedó referenciado');
});
// ─── v7.10.1, ronda 1 de Codex (P2-01, P2-02, P3-01) ───
await test('v7.10.1 P2-01: con la empresa apagada no aparecen las notas crédito ni se registran, aunque el negocio esté sellado con CUFE',async()=>{
  const modal=(e,fe=FE_NC)=>{let body='';
    const m=loadSourceFunctions([['app-historial.js','openFeModal'],['app-historial.js','gbFeEstado'],['app-historial.js','gbFeSumaNotas'],['app-core.js','gbEmisorConfigurado']],{
      quotesCache:[{id:'P1',kind:'quote',quoteNumber:'GB-1',accountingEntityId:'GB_SAS_SIMPLE',feData:fe}],GB_EMISOR:e,toast:()=>{},h:String,fm:String,gbTodayIso:()=>'2026-10-25',
      _feBase64:null,confirmModal:o=>{body=o.body}});
    m.openFeModal('P1','quote');return body};
  let b=modal(emisor());assert.match(b,/Notas crédito/);assert.match(b,/Registrar nota crédito/);
  assert.ok(!modal(emisor(),{...FE_NC,cufe:''}).includes('Notas crédito'),'sin CUFE de la FE no hay notas');
  for(const e of [emisor({fechaInicio:null}),emisor({razonSocial:''}),emisor({nit:''})]){
    b=modal(e);assert.ok(b.includes('Datos de la factura'),'el bloque de la FE sellada sigue como en v7.10.0');
    assert.ok(!b.includes('Notas crédito'),'apagada: sin bloque de notas');assert.ok(!b.includes('Registrar nota crédito'),'apagada: sin formulario');
  }
  const t=ncSubmit({fresco:{feData:FE_NC},emisorCfg:emisor({fechaInicio:null})});await t.ctx.submitNotaCredito('P1','quote');
  assert.equal(t.writes.length,0,'apagada: el envío no escribe');assert.deepEqual(t.lecturas,[],'ni lee el servidor');
});
await test('v7.10.1 P2-02: la hoja Clientes toma el cliente de cada negocio aunque dos colecciones compartan el ID',()=>{
  const c=expCtx();
  const S={status:'entregado',accountingEntityId:'GB_SAS_SIMPLE',eventDate:'2026-10-20',city:'La Calera'};
  const docs=[{id:'COLISION',kind:'proposal',...S,clienteFiscal:{...cfA,numId:'900-A',nombre:'A SAS'},feData:{...FE_NC,cufe:'ca',numero:'10'}},
    {id:'COLISION',kind:'quote',...S,clienteFiscal:{...cfA,numId:'900-B',nombre:'B SAS'},feData:{...FE_NC,cufe:'cb',numero:'11'}},
    {id:'SOLO-NC',kind:'quote',...S,clienteFiscal:{...cfA,numId:'900-C',nombre:'C SAS'},feData:{...FE_NC,cufe:'cc',numero:'12',fecha:'2026-09-20',notasCredito:[{...ncOk,cufe:'ncc'}]}},
    {id:'SIN-VENTA',kind:'quote',...S,clienteFiscal:{...cfA,numId:'900-D',nombre:'D SAS'}}];
  const r=c.gbExporteContable(docs,'2026-10-01','2026-10-31',emisor());
  assert.equal(r.ventas.length,3);
  assert.deepEqual(Array.from(r.clientes,x=>x.numId).sort(),['900-A','900-B','900-C'],'un cliente por negocio con ventas o notas en el período');
  assert.deepEqual(Array.from(r.clientes,x=>x.nombre).sort(),['A SAS','B SAS','C SAS']);
  assert.deepEqual({...r.clientes.find(x=>x.numId==='900-B')},{tipoId:'NIT',numId:'900-B',nombre:'B SAS',correo:'a@b.co',direccion:'Calle 1',telefono:'300'});
});
await test('v7.10.1 P3-01: la compra ya sellada conserva su bloque fiscal al pasar a pendiente',async()=>{
  const c=loadSourceFunctions([['app-dashboard.js','gbCompraFiscalAplica'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{GB_EMISOR:emisor()});
  const sellada=compra({fecha:'2026-10-05'});
  assert.equal(c.gbCompraFiscalAplica('comprada','2026-10-05',sellada),true);
  assert.equal(c.gbCompraFiscalAplica('pendiente','2026-10-05',sellada),true,'sellada y pendiente: el bloque sigue');
  assert.equal(c.gbCompraFiscalAplica('pendiente','2026-10-15',null),false,'nueva y pendiente: sin bloque');
  assert.equal(c.gbCompraFiscalAplica('comprada','2026-10-05',null),false,'antes del corte y sin sello: sin bloque');
  assert.equal(c.gbCompraFiscalAplica('comprada','2026-10-15',compra({accountingEntityId:undefined})),true);
  assert.equal(c.gbCompraFiscalAplica('pendiente','2026-10-15',compra({accountingEntityId:undefined})),false,'pendiente sin sello: sin bloque');
  const t=compraEditor({previa:sellada,estado:'pendiente',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,2,'guarda y luego limpia el comprobante');
  for(const g of t.guardados){assert.equal(g.estado,'pendiente');assert.equal(g.accountingEntityId,'GB_SAS_SIMPLE');assert.equal(g.soporteFiscal.cufe,'pc1')}
});
// ─── v7.10.1, ronda 2 de Codex (P2-01) ───
await test('v7.10.1 P2-01 (ronda 2): la compra sellada conserva su proveedor si la ficha no está en el selector (archivada o borrada)',async()=>{
  const sellada=compra({fecha:'2026-10-05',proveedorId:'PR1'});
  const archivado={id:'PR1',nombre:'Prov cambiado',tipoId:'CC',idNum:'1',archivado:true};
  let t=compraEditor({previa:sellada,proveedor:archivado,sel:'',estado:'pendiente',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,2,'guarda y luego limpia el comprobante');
  for(const g of t.guardados){
    assert.deepEqual({...g.proveedorFiscal},{nombre:'Prov',tipoId:'NIT',idNum:'800-1'},'sin selección válida: conserva la copia fiscal');
    assert.equal(g.proveedorId,'PR1');assert.equal(g.proveedorNombre,'Prov');assert.equal(g.estado,'pendiente');assert.equal(g.accountingEntityId,'GB_SAS_SIMPLE');
  }
  assert.equal(t.toasts.at(-1)[1],'success','no avisa falta de identificación');
  const pend=compra({...t.guardados[1],id:'C1'});
  t=compraEditor({previa:pend,proveedor:archivado,sel:'',estado:'comprada',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,0,'de vuelta a comprada sin proveedor elegible: no guarda (como v7.10.0)');
  t=compraEditor({previa:pend,proveedor:null,sel:'PR1',estado:'comprada',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.equal(t.guardados.length,2,'de vuelta a comprada con la ficha fuera de la caché');
  for(const g of t.guardados){assert.deepEqual({...g.proveedorFiscal},{nombre:'Prov',tipoId:'NIT',idNum:'800-1'});assert.equal(g.proveedorId,'PR1');assert.equal(g.proveedorNombre,'Prov');assert.equal(g.estado,'comprada')}
  t=compraEditor({previa:pend,proveedor:{id:'PR2',nombre:'Otro',tipoId:'CC',idNum:'123'},sel:'PR2',estado:'comprada',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.deepEqual({...t.guardados[0].proveedorFiscal},{nombre:'Otro',tipoId:'CC',idNum:'123'},'sólo una selección válida reemplaza la copia');
  assert.equal(t.guardados[0].proveedorId,'PR2');assert.equal(t.guardados[0].proveedorNombre,'Otro');
  t=compraEditor({previa:pend,proveedor:{id:'PR1',nombre:'Prov SAS',tipoId:'NIT',idNum:'800-2'},sel:'PR1',estado:'comprada',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.deepEqual({...t.guardados[0].proveedorFiscal},{nombre:'Prov SAS',tipoId:'NIT',idNum:'800-2'},'la misma ficha, activa y elegida: se copia de nuevo');
  t=compraEditor({previa:pend,proveedor:null,sel:'PR9',estado:'comprada',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
  assert.deepEqual({...t.guardados[0].proveedorFiscal},{nombre:'',tipoId:'',idNum:''},'otra ficha fuera de la caché: no hereda la copia anterior');
  assert.equal(t.guardados[0].proveedorId,'PR9');
  for(const accountingEntityId of [undefined,'OTRA']){
    t=compraEditor({previa:compra({fecha:'2026-10-05',proveedorId:'PR1',accountingEntityId}),proveedor:archivado,sel:'',estado:'pendiente',fecha:'2026-10-05'});await t.ctx.saveCompraEditor();
    assert.equal(t.guardados[0].proveedorId,null,'sin sello de la nueva empresa: como v7.10.0');assert.equal(t.guardados[0].proveedorNombre,'');assert.equal('proveedorFiscal' in t.guardados[0],false);
  }
});
// ─── v7.10.1, ronda 3 de Codex (P2-01) ───
await test('v7.10.1 P2-01 (ronda 3): con la empresa apagada, la compra sellada no muestra, valida ni guarda el bloque fiscal',async()=>{
  const sellada=compra({fecha:'2026-10-15'});
  for(const e of [emisor({fechaInicio:null}),emisor({razonSocial:''}),emisor({nit:''}),emisor({fechaInicio:null,razonSocial:'',nit:''})]){
    const c=loadSourceFunctions([['app-dashboard.js','gbCompraFiscalAplica'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{GB_EMISOR:e});
    for(const estado of ['pendiente','comprada']){
      assert.equal(c.gbCompraFiscalAplica(estado,'2026-10-15',sellada),false,'apagada, sellada y '+estado+': sin bloque');
      const t=compraEditor({emisorCfg:e,previa:sellada,estado,fecha:'2026-10-15',fiscal:{cufe:''}});await t.ctx.saveCompraEditor();
      assert.equal(t.guardados.length,2,estado+': guarda sin validar el soporte (y luego limpia el comprobante)');
      for(const g of t.guardados)for(const k of ['accountingEntityId','soporteFiscal','proveedorFiscal'])assert.equal(k in g,false,k+' omitido: updateDoc conserva lo guardado');
    }
  }
  const els={};const $=id=>els[id]||(els[id]={value:'',checked:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{h:true,toggle(c,v){this.h=v},add(){this.h=true},remove(){this.h=false}}});
  const x=loadSourceFunctions([['app-dashboard.js','openCompraEditor'],['app-dashboard.js','compraEdFiscalActualizar'],['app-dashboard.js','gbCompraFiscalAplica'],['app-core.js','gbEmisorConfigurado'],['app-core.js','gbEmisorActivo']],{
    $,comprasCache:[sellada],GB_EMISOR:emisor({fechaInicio:null}),_compraEditorId:null,_compraEdFotoB64:null,_compraEdFotoExisting:null,_compraEdLinkedPendientes:[],_compraEdItemRowSeq:0,
    _compraEdRefreshProveedorOptions:()=>{},compraEdAddItem:()=>{},_compraEdRefreshItemsDatalist:()=>{},escapeHtml:String,gbTodayIso:()=>'2026-10-20'});
  x.openCompraEditor('C1');assert.equal(els['compra-ed-fiscal'].classList.h,true,'apagada: la sellada abre sin bloque fiscal');
});
console.log(`✅ ${passed} tests pasaron`);
