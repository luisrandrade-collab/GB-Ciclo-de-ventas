// v8.0.8: agenda con Google Calendar API. Módulo de eventos, cliente de la API y sincronización,
// con Firestore y Calendar en memoria. Sin red ni datos reales (plan v7_11_0, pruebas y C1–C4).
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {loadSourceFunctions} from './source_test_helpers.mjs';
const require=createRequire(import.meta.url);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const leer=f=>readFileSync(resolve(root,f),'utf8').replace(/\r\n/g,'\n');
const carga=f=>{try{return require(resolve(root,f))}catch(e){return {_error:e}}};
const A=carga('agenda-eventos.js'),CAL=carga('functions/agenda-calendar.js'),SYNC=carga('functions/agenda-sync.js');
let ok=0,fallos=0;
async function test(nombre,fn){try{await fn();ok++;console.log('OK   '+nombre)}catch(e){fallos++;console.log('FALLO '+nombre+'\n      '+String(e&&e.message||e).split('\n')[0])}}
const tick=()=>new Promise(r=>setImmediate(r));

// ─── Fixtures ────────────────────────────────────────────────────────────────
const CLIENTE='Cliente Fixture Ñandú',DIR='Calle Fixture 12-34',TEL='3000000000';
const base=(extra={})=>({id:'GB-P-2026-0001',quoteNumber:'GB-P-2026-0001',client:CLIENTE,dir:DIR,city:'Bogotá',tel:TEL,att:'Atención Fixture',notasInternas:'sin nueces',total:1234567,pagos:[{monto:500000}],...extra});
const desp=(id,fechaHora,extra={})=>({id,fechaHora,transporteCosto:25000,items:[],notas:'',status:'pendiente',...extra});
const ev=(q,c)=>A.eventosDeDoc(q,c);
const tipos=(l,t)=>l.filter(e=>e.tipo===t);

// ─── Fakes: Calendar (HTTP) y Firestore ──────────────────────────────────────
const CAL_ID='cal-fixture@group.calendar.google.com';
const RAIZ='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(CAL_ID)+'/events';
const bogotaLocal=iso=>{const d=new Date(Date.parse(iso)-5*3600e3);return d.toISOString().slice(0,19)+'-05:00'}; // Google responde en la zona del calendario
function fakeCalendar({porPagina=2500}={}){
  const eventos=new Map(),peticiones=[],fallas=[];
  const resp=(status,cuerpo)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(cuerpo??{})});
  const normal=r=>{const x=structuredClone(r);for(const k of ['start','end'])if(x[k]?.dateTime)x[k]={dateTime:bogotaLocal(x[k].dateTime),timeZone:x[k].timeZone};return x};
  async function fetch(url,opts={}){
    const metodo=opts.method||'GET';peticiones.push({metodo,url,headers:opts.headers||{}});
    if(url.startsWith('http://metadata.google.internal/')){
      assert.equal(opts.headers['Metadata-Flavor'],'Google');
      assert.ok(url.includes('scopes=https://www.googleapis.com/auth/calendar.events'),'alcance calendar.events');
      return resp(200,{access_token:'t-fake',expires_in:3600,token_type:'Bearer'});
    }
    const falla=fallas.findIndex(f=>f.cuando(metodo,url));
    if(falla>=0)return resp(fallas.splice(falla,1)[0].status,{error:{message:'falla simulada'}});
    if(opts.headers?.Authorization!=='Bearer t-fake')return resp(401);
    assert.ok(url.startsWith(RAIZ),'url del calendario: '+url);
    const resto=url.slice(RAIZ.length),[ruta,consulta='']=resto.split('?'),id=decodeURIComponent(ruta.replace(/^\//,''));
    if(metodo==='GET'&&!id){
      const q=new URLSearchParams(consulta),filtros=q.getAll('privateExtendedProperty').map(s=>s.split('='));
      const lista=[...eventos.values()].filter(e=>e.status!=='cancelled'&&filtros.every(([k,v])=>e.extendedProperties?.private?.[k]===v)).sort((a,b)=>a.id.localeCompare(b.id));
      const desde=+(q.get('pageToken')||0),pagina=lista.slice(desde,desde+porPagina);
      return resp(200,{items:pagina.map(normal),...(desde+porPagina<lista.length?{nextPageToken:String(desde+porPagina)}:{})});
    }
    const cuerpo=opts.body?JSON.parse(opts.body):null;
    if(metodo==='POST'){if(eventos.has(cuerpo.id))return resp(409);eventos.set(cuerpo.id,{...cuerpo,status:'confirmed'});return resp(200,normal(eventos.get(cuerpo.id)))}
    if(metodo==='PATCH'){const e=eventos.get(id);if(!e)return resp(404);const n={...e,...cuerpo,extendedProperties:{private:{...e.extendedProperties?.private,...cuerpo.extendedProperties?.private}}};eventos.set(id,n);return resp(200,normal(n))}
    if(metodo==='DELETE'){const e=eventos.get(id);if(!e)return resp(404);if(e.status==='cancelled')return resp(410);e.status='cancelled';return resp(204)}
    return resp(400);
  }
  const vivos=()=>[...eventos.values()].filter(e=>e.status!=='cancelled');
  return {fetch,eventos,vivos,peticiones,fallas,escrituras:()=>peticiones.filter(p=>['POST','PATCH','DELETE'].includes(p.metodo)).length};
}
function fakeFirestore(inicial={}){
  const store=new Map(Object.entries(inicial).map(([k,v])=>[k,structuredClone(v)]));
  return {store,
    leerDoc:async(c,id)=>store.has(c+'/'+id)?{...structuredClone(store.get(c+'/'+id)),id}:null,
    listarDocs:async c=>[...store.entries()].filter(([k])=>k.startsWith(c+'/')).map(([k,v])=>({...structuredClone(v),id:k.slice(c.length+1)}))};
}
function registro(){const lineas=[];const f=nivel=>(...a)=>lineas.push(nivel+' '+a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));return {lineas,log:{info:f('info'),warn:f('warn'),error:f('error'),log:f('log')}}}
function entorno({docs={},porPagina}={}){
  const g=fakeCalendar({porPagina}),fs=fakeFirestore(docs),r=registro();
  const cal=CAL.crearClienteCalendar({calendarId:CAL_ID,fetch:g.fetch,log:r.log,esperar:async()=>{}});
  const deps={leerDoc:fs.leerDoc,listarDocs:fs.listarDocs,cal,log:r.log};
  return {g,fs,r,cal,deps,sync:(c,id,d=deps)=>SYNC.sincronizarDoc(d,c,id),reconciliar:()=>SYNC.reconciliar(deps)};
}
const deseadosIds=(q,c)=>A.esAgendable(q,c)?ev(q,c).map(e=>e.id).sort():[];
const vivosDe=(g,gbDoc)=>g.vivos().filter(e=>e.extendedProperties.private.gbDoc===gbDoc);

for(const [n,m] of [['agenda-eventos.js',A],['functions/agenda-calendar.js',CAL],['functions/agenda-sync.js',SYNC]])if(m._error)console.log('AVISO no carga '+n+': '+m._error.message.split('\n')[0]);

// ═══ 1. Módulo de eventos (F1) ═══════════════════════════════════════════════
await test('cotización legacy sin despachos: exige eventDate, entrega desp_legacy y producción el día anterior',()=>{
  const q=base({status:'pedido',eventDate:'2026-10-10',horaEntrega:'12:30'});
  assert.equal(A.esAgendable(q,'quotes'),true);
  const l=ev(q,'quotes');
  assert.equal(l.length,2);
  const [e]=tipos(l,'entrega'),[p]=tipos(l,'produccion');
  assert.equal(e.fecha,'2026-10-10');assert.equal(e.hora,'12:30');assert.equal(e.gbDoc,'quotes/GB-P-2026-0001');
  assert.equal(e.id,A.idEvento('quotes/GB-P-2026-0001','entrega','desp_legacy'));
  assert.equal(p.fecha,'2026-10-09');assert.equal(p.hora,'');
  assert.deepEqual(ev(base({status:'pedido'}),'quotes'),[],'sin eventDate ni despachos no hay eventos');
});
await test('propuesta con despachos y sin eventDate: hoy (isAgendable del servidor) queda fuera; el filtro nuevo la incluye',()=>{
  const q=base({status:'aprobada',despachos:[desp('desp_1','2026-10-12T09:00')]});
  // Filtro anterior (functions/index.js v7.7.5): exigía eventDate aunque hubiera despachos.
  const viejo=x=>!x._wrongCollection&&x.status!=='superseded'&&x.status!=='anulada'&&!!x.eventDate&&['aprobada','en_produccion','entregado'].includes(x.status);
  assert.equal(viejo(q),false);
  assert.equal(A.esAgendable(q,'proposals'),true);
  assert.deepEqual(ev(q,'proposals').map(e=>[e.tipo,e.fecha]).sort(),[['entrega','2026-10-12'],['produccion','2026-10-11']]);
});
await test('propuesta final aprobada en propfinals; PF archivada (superseded) y PF sin aprobar fuera',()=>{
  const pf=base({id:'GB-PF-2026-0101',quoteNumber:'GB-PF-2026-0101',status:'aprobada',eventDate:'2026-11-03',horaEntrega:'18:00'});
  assert.equal(A.esAgendable(pf,'propfinals'),true);
  assert.ok(ev(pf,'propfinals').every(e=>e.gbDoc==='propfinals/GB-PF-2026-0101'));
  for(const s of ['en_produccion','entregado'])assert.equal(A.esAgendable({...pf,status:s},'propfinals'),true,s);
  for(const s of ['superseded','anulada','propfinal','enviada'])assert.equal(A.esAgendable({...pf,status:s},'propfinals'),false,s);
  assert.equal(A.esAgendable(pf,'proposals'),false,'PF fantasma en proposals/ no se agenda');
});
await test('anulada, superseded y convertida: 0 eventos deseados',()=>{
  for(const [c,s] of [['quotes','anulada'],['quotes','superseded'],['quotes','convertida'],['proposals','anulada'],['proposals','superseded'],['proposals','convertida'],['quotes','enviada'],['proposals','enviada']])
    assert.deepEqual(deseadosIds(base({status:s,eventDate:'2026-10-10'}),c),[],c+'/'+s);
  assert.equal(A.esAgendable(base({status:'pedido',eventDate:'2026-10-10',_wrongCollection:true}),'quotes'),false);
});
await test('despachos: mismo día y días distintos; ids por despacho, no por posición; reducir de 2 a 1',()=>{
  const d1=desp('desp_a','2026-10-20T08:00'),d2=desp('desp_b','2026-10-20T15:00'),d3=desp('desp_c','2026-10-22T10:00');
  const mismo=ev(base({status:'aprobada',eventDate:'2026-10-20',despachos:[d1,d2]}),'proposals');
  assert.equal(tipos(mismo,'entrega').length,2);assert.equal(tipos(mismo,'produccion').length,1,'un Producir por fecha');
  const distintos=ev(base({status:'aprobada',eventDate:'2026-10-20',despachos:[d1,d3]}),'proposals');
  assert.deepEqual(tipos(distintos,'produccion').map(e=>e.fecha),['2026-10-19','2026-10-21']);
  const ida=ev(base({status:'aprobada',despachos:[d1,d2]}),'proposals').map(e=>e.id).sort();
  const vuelta=ev(base({status:'aprobada',despachos:[d2,d1]}),'proposals').map(e=>e.id).sort();
  assert.deepEqual(vuelta,ida,'reordenar no cambia los ids');
  const uno=tipos(ev(base({status:'aprobada',despachos:[d2]}),'proposals'),'entrega');
  assert.equal(uno.length,1);assert.equal(uno[0].id,A.idEvento('proposals/GB-P-2026-0001','entrega','desp_b'));
});
await test('productionDate explícita: un solo Producir ese día, con las entregas que atiende',()=>{
  const l=ev(base({status:'pedido',productionDate:'2026-10-15',despachos:[desp('d1','2026-10-17T10:00'),desp('d2','2026-10-18T10:00')]}),'quotes');
  const p=tipos(l,'produccion');
  assert.equal(p.length,1);assert.equal(p[0].fecha,'2026-10-15');
  assert.ok(p[0].descripcion.includes('2026-10-17')&&p[0].descripcion.includes('2026-10-18'));
});
await test('hora vacía → día completo; hora válida → con hora',()=>{
  const sin=tipos(ev(base({status:'pedido',eventDate:'2026-10-10'}),'quotes'),'entrega')[0];
  assert.equal(sin.hora,'');
  const con=tipos(ev(base({status:'pedido',eventDate:'2026-10-10',horaEntrega:'7:05'}),'quotes'),'entrega')[0];
  assert.equal(con.hora,'07:05');
  assert.equal(tipos(ev(base({status:'pedido',eventDate:'2026-10-10',horaEntrega:'25:00'}),'quotes'),'entrega')[0].hora,'','hora inválida = día completo');
  assert.equal(tipos(ev(base({status:'aprobada',despachos:[desp('d','2026-10-10')]}),'proposals'),'entrega')[0].hora,'');
});
await test('límites en Bogotá: 23:30 local, 31-dic → 1-ene, 28/29-feb',()=>{
  assert.equal(A.bogotaAUtc('2026-10-10','23:30'),'2026-10-11T04:30:00.000Z');
  assert.equal(A.bogotaAUtc('2026-12-31','23:30'),'2027-01-01T04:30:00.000Z');
  assert.equal(A.bogotaAUtc('2028-02-28','23:30'),'2028-02-29T04:30:00.000Z');
  assert.equal(A.bogotaAUtc('2027-02-28','23:30'),'2027-03-01T04:30:00.000Z');
  assert.equal(A.bogotaAUtc('2026-10-10','00:00'),'2026-10-10T05:00:00.000Z');
  assert.equal(tipos(ev(base({status:'pedido',eventDate:'2027-01-01'}),'quotes'),'produccion')[0].fecha,'2026-12-31');
  assert.equal(tipos(ev(base({status:'pedido',eventDate:'2028-03-01'}),'quotes'),'produccion')[0].fecha,'2028-02-29');
  assert.equal(tipos(ev(base({status:'pedido',eventDate:'2027-03-01'}),'quotes'),'produccion')[0].fecha,'2027-02-28');
  assert.equal(A.sumarDias('2026-12-31',1),'2027-01-01');
  assert.deepEqual(ev(base({status:'pedido',eventDate:'2026-02-30'}),'quotes'),[],'fecha inexistente no genera eventos');
});
await test('D6: sin total ni importes; sí cliente, número, hora, dirección, ciudad, teléfono, atención y notas internas',()=>{
  const l=ev(base({status:'aprobada',total:1234567,despachos:[desp('d1','2026-10-20T08:00',{transporteCosto:99000}),desp('d2','2026-10-21T09:00')]}),'proposals');
  for(const e of l){
    const t=e.titulo+'\n'+e.descripcion+'\n'+e.lugar;
    assert.ok(!/\$|1\.?234\.?567|99\.?000|25\.?000|total|transporte/i.test(t),'importe en '+e.tipo+': '+t);
  }
  const e=tipos(l,'entrega')[0];
  for(const dato of [CLIENTE,'GB-P-2026-0001',DIR,'Bogotá',TEL,'Atención Fixture','sin nueces'])assert.ok((e.titulo+e.descripcion+e.lugar).includes(dato),'falta '+dato);
});
await test('id determinista y en base32hex (5–1024)',()=>{
  const q=base({status:'aprobada',despachos:[desp('desp_1727000000000_abcde','2026-10-20T08:00')]});
  const a=ev(q,'proposals'),b=ev({...q,client:'Otro nombre',dir:'Otra'},'proposals');
  assert.deepEqual(a.map(e=>e.id),b.map(e=>e.id),'el contenido no cambia el id');
  for(const e of a)assert.match(e.id,/^[0-9a-v]{5,1024}$/);
  assert.notEqual(A.idEvento('quotes/X','entrega','d1'),A.idEvento('proposals/X','entrega','d1'));
  assert.notEqual(A.idEvento('quotes/X','entrega','d1'),A.idEvento('quotes/X','produccion','d1'));
  assert.equal(A.idEvento('quotes/X','entrega','d1'),A.idEvento('quotes/X','entrega','d1'));
});

// ═══ 2. Cliente de la Calendar API (F2) ══════════════════════════════════════
const recurso=(id,gbDoc='quotes/GB-Q-1')=>({id,summary:'s',start:{date:'2026-10-10'},end:{date:'2026-10-11'},status:'confirmed',extendedProperties:{private:{gbApp:'1',gbDoc}}});
await test('token del servidor de metadatos con Metadata-Flavor y alcance calendar.events, reutilizado',async()=>{
  const {g,cal}=entorno();
  await cal.listarDoc('quotes/GB-Q-1');await cal.listarDoc('quotes/GB-Q-2');
  assert.equal(g.peticiones.filter(p=>p.url.startsWith('http://metadata')).length,1);
});
await test('404 al borrar = hecho (también 410)',async()=>{
  const {g,cal}=entorno();
  await cal.borrar('noexiste0');
  await cal.insertar(recurso('abc12'));await cal.borrar('abc12');await cal.borrar('abc12');
  assert.equal(g.vivos().length,0);
});
await test('409 al insertar → patch (restaura un id borrado antes)',async()=>{
  const {g,cal}=entorno();
  await cal.insertar(recurso('abc12'));await cal.borrar('abc12');
  await cal.insertar({...recurso('abc12'),summary:'nuevo'});
  assert.equal(g.eventos.get('abc12').status,'confirmed');assert.equal(g.eventos.get('abc12').summary,'nuevo');
  assert.ok(g.peticiones.some(p=>p.metodo==='PATCH'));
});
await test('5xx: un reintento; si vuelve a fallar, error',async()=>{
  const {g,cal}=entorno();
  g.fallas.push({cuando:m=>m==='POST',status:503});
  await cal.insertar(recurso('abc12'));
  assert.equal(g.vivos().length,1);
  g.fallas.push({cuando:m=>m==='DELETE',status:500},{cuando:m=>m==='DELETE',status:502});
  await assert.rejects(cal.borrar('abc12'));
  g.fallas.push({cuando:m=>m==='GET',status:503},{cuando:m=>m==='GET',status:503});
  await assert.rejects(cal.listarDoc('quotes/GB-Q-1'));
});
await test('list recorre nextPageToken (por gbDoc y global) y filtra por gbApp=1',async()=>{
  const {g,cal}=entorno({porPagina:2});
  for(let i=0;i<5;i++)await cal.insertar(recurso('evt0'+i,i<3?'quotes/A':'quotes/B'));
  g.eventos.set('ajeno0',{...recurso('ajeno0'),extendedProperties:{private:{gbDoc:'quotes/A'}}});
  assert.equal((await cal.listarDoc('quotes/A')).length,3);
  assert.equal((await cal.listarTodos()).length,5);
  const gets=g.peticiones.filter(p=>p.metodo==='GET'&&p.url.startsWith(RAIZ));
  assert.ok(gets.every(p=>new URL(p.url).searchParams.getAll('privateExtendedProperty').includes('gbApp=1')));
});

// ═══ 3. Sincronización y convergencia (F3) ═══════════════════════════════════
const Q='GB-P-2026-0001',P='proposals';
const prop=(extra)=>base({status:'aprobada',...extra});
await test('sincroniza un documento y la repetición no duplica ni escribe',async()=>{
  const q=prop({despachos:[desp('d1','2026-10-20T08:00'),desp('d2','2026-10-22T10:00')]});
  const {g,sync}=entorno({docs:{[P+'/'+Q]:q}});
  const r1=await sync(P,Q);
  assert.equal(r1.ok,true);assert.deepEqual(g.vivos().map(e=>e.id).sort(),deseadosIds({...q,id:Q},P));
  const antes=g.escrituras();const r2=await sync(P,Q);
  assert.equal(r2.ok,true);assert.equal(g.escrituras(),antes,'segunda sincronización sin escrituras');
  assert.equal(g.vivos().length,4);
});
await test('el recurso: con hora en UTC y zona America/Bogota (1 h); sin hora, día completo; marca gbApp/gbDoc',async()=>{
  const q=prop({despachos:[desp('d1','2026-12-31T23:30')]});
  const {g,sync}=entorno({docs:{[P+'/'+Q]:q}});
  await sync(P,Q);
  const e=g.vivos().find(x=>x.summary.includes('Entrega')),p=g.vivos().find(x=>x.summary.includes('Producir'));
  assert.equal(Date.parse(e.start.dateTime),Date.parse('2027-01-01T04:30:00Z'));assert.equal(e.start.timeZone,'America/Bogota');
  assert.equal(Date.parse(e.end.dateTime)-Date.parse(e.start.dateTime),3600e3);
  assert.deepEqual([p.start,p.end],[{date:'2026-12-30'},{date:'2026-12-31'}]);
  assert.deepEqual(e.extendedProperties.private,{gbApp:'1',gbDoc:P+'/'+Q});
});
await test('paso de evento con hora a día completo y viceversa',async()=>{
  const {g,fs,sync}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10',horaEntrega:'10:00'})}});
  await sync('quotes',Q);
  fs.store.get('quotes/'+Q).horaEntrega='';await sync('quotes',Q);
  let e=g.vivos().find(x=>x.summary.includes('Entrega'));
  assert.deepEqual(e.start,{date:'2026-10-10'});assert.equal((await sync('quotes',Q)).escrituras,0);
  fs.store.get('quotes/'+Q).horaEntrega='16:45';await sync('quotes',Q);
  e=g.vivos().find(x=>x.summary.includes('Entrega'));
  assert.equal(Date.parse(e.start.dateTime),Date.parse('2026-10-10T21:45:00Z'));assert.equal(e.start.date,undefined);
});
await test('reducir de 2 despachos a 1 y cambiar la fecha borra los eventos que ya no son deseados',async()=>{
  const {g,fs,sync}=entorno({docs:{[P+'/'+Q]:prop({despachos:[desp('d1','2026-10-20T08:00'),desp('d2','2026-10-23T08:00')]})}});
  await sync(P,Q);assert.equal(g.vivos().length,4);
  fs.store.get(P+'/'+Q).despachos=[desp('d2','2026-10-24T08:00')];await sync(P,Q);
  assert.deepEqual(g.vivos().map(e=>e.id).sort(),deseadosIds({...fs.store.get(P+'/'+Q),id:Q},P));
  assert.equal(g.vivos().length,2);
});
await test('triggers entregados al revés: el resultado es el del estado actual',async()=>{
  const {g,fs,sync}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'})}});
  fs.store.get('quotes/'+Q).eventDate='2026-10-12'; // v2 ya escrita; llega primero el trigger de v2 y después el de v1
  await sync('quotes',Q);await sync('quotes',Q);
  assert.deepEqual(g.vivos().map(e=>e.start.date).sort(),['2026-10-11','2026-10-12']);
});
await test('borrado del documento → sus eventos se borran; anular también',async()=>{
  const {g,fs,sync}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'}),['quotes/Q2']:base({id:'Q2',status:'pedido',eventDate:'2026-10-11'})}});
  await sync('quotes',Q);await sync('quotes','Q2');assert.equal(g.vivos().length,4);
  fs.store.delete('quotes/'+Q);await sync('quotes',Q);
  fs.store.get('quotes/Q2').status='anulada';await sync('quotes','Q2');
  assert.equal(g.vivos().length,0);
});
await test('conversión propuesta → PF: el origen deja de tener eventos y la PF los tiene',async()=>{
  const pfId='GB-PF-2026-0101';
  const {g,fs,sync}=entorno({docs:{[P+'/'+Q]:prop({eventDate:'2026-11-03'})}});
  await sync(P,Q);assert.equal(vivosDe(g,P+'/'+Q).length,2);
  fs.store.get(P+'/'+Q).status='convertida';fs.store.set('propfinals/'+pfId,base({id:pfId,quoteNumber:pfId,status:'aprobada',eventDate:'2026-11-03'}));
  await sync(P,Q);await sync('propfinals',pfId);
  assert.equal(vivosDe(g,P+'/'+Q).length,0);assert.equal(vivosDe(g,'propfinals/'+pfId).length,2);
});
await test('C1: entrelazado forzado — una sincronización con estado viejo termina después y el final es el estado actual',async()=>{
  const {g,fs,deps,sync}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10',horaEntrega:'09:00'})}});
  let soltar,lecturasA=0;const pausa=new Promise(r=>soltar=r);
  const depsA={...deps,leerDoc:async(c,id)=>{const d=await deps.leerDoc(c,id);if(lecturasA++===0)await pausa;return d}};
  const pA=sync('quotes',Q,depsA);          // A lee v1 y queda en pausa
  await tick();
  Object.assign(fs.store.get('quotes/'+Q),{eventDate:'2026-10-15',horaEntrega:'14:00'}); // v2
  const rB=await sync('quotes',Q);           // B: v2 completo y verificado
  assert.equal(rB.ok,true);
  soltar();const rA=await pA;                // A escribe v1 (viejo) DESPUÉS de B
  assert.equal(rA.ok,true);
  const q2={...fs.store.get('quotes/'+Q),id:Q};
  assert.deepEqual(g.vivos().map(e=>e.id).sort(),deseadosIds(q2,'quotes'));
  const e=g.vivos().find(x=>x.summary.includes('Entrega'));
  assert.equal(Date.parse(e.start.dateTime),Date.parse('2026-10-15T19:00:00Z'),'el calendario queda en v2, no en v1');
  assert.ok(rA.escrituras>=2,'A detectó la diferencia al releer y repitió');
});
await test('C1: si no converge en 3 intentos, lo registra para la reconciliación sin datos del cliente',async()=>{
  const {deps,r,sync}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'})}});
  let n=0;const depsX={...deps,leerDoc:async(c,id)=>{const d=await deps.leerDoc(c,id);d.eventDate='2026-10-'+(10+(n++));return d}}; // el documento cambia en cada lectura
  const res=await sync('quotes',Q,depsX);
  assert.equal(res.ok,false);assert.equal(res.escrituras,3);
  assert.ok(r.lineas.some(l=>l.includes('quotes/'+Q)&&/reconciliaci/.test(l)));
});
await test('trigger y reconciliación a la vez sobre el mismo documento',async()=>{
  const {g,fs,sync,reconciliar}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'})}});
  await sync('quotes',Q);
  fs.store.get('quotes/'+Q).eventDate='2026-10-20';
  await Promise.all([sync('quotes',Q),reconciliar()]);
  assert.deepEqual(g.vivos().map(e=>e.start.date).sort(),['2026-10-19','2026-10-20']);
});
await test('reconciliación: carga inicial de agendables y borra huérfanos (documento borrado, no agendable o colección ajena)',async()=>{
  const {g,cal,reconciliar}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'}),['quotes/Q3']:base({id:'Q3',status:'enviada',eventDate:'2026-10-10'})}});
  await cal.insertar(recurso('huerfano01','quotes/BORRADO'));
  await cal.insertar(recurso('huerfano02','quotes/Q3'));
  await cal.insertar(recurso('huerfano03','otra/cosa'));
  const res=await reconciliar();
  assert.deepEqual(g.vivos().map(e=>e.extendedProperties.private.gbDoc).sort(),['quotes/'+Q,'quotes/'+Q]);
  assert.equal(res.errores,0);
});
await test('C2: huérfano en una página posterior de events.list → la reconciliación lo borra',async()=>{
  const docs={};for(let i=1;i<=3;i++)docs['quotes/Q'+i]=base({id:'Q'+i,status:'pedido',eventDate:'2026-10-1'+i});
  const {g,cal,reconciliar,sync}=entorno({docs,porPagina:2});
  for(let i=1;i<=3;i++)await sync('quotes','Q'+i);
  await cal.insertar(recurso('vvvvvvvv','quotes/BORRADO')); // ordena al final: última página
  const r=await reconciliar();
  assert.equal(g.vivos().some(e=>e.id==='vvvvvvvv'),false);assert.equal(g.vivos().length,6);
  assert.equal(r.errores,0);
});
await test('C2: la lista por gbDoc pagina — un documento con más eventos que la página no se reescribe',async()=>{
  const q=prop({despachos:[desp('d1','2026-10-20T08:00'),desp('d2','2026-10-22T10:00'),desp('d3','2026-10-24T10:00')]});
  const {g,sync}=entorno({docs:{[P+'/'+Q]:q},porPagina:2});
  await sync(P,Q);const antes=g.escrituras();
  assert.equal((await sync(P,Q)).escrituras,0);assert.equal(g.escrituras(),antes);assert.equal(g.vivos().length,6);
});
await test('despachos con id repetido: ids de evento únicos y la sincronización converge',async()=>{
  const q=prop({despachos:[desp('dup','2026-10-20T08:00'),desp('dup','2026-10-21T08:00')]});
  const ids=tipos(ev({...q,id:Q},P),'entrega').map(e=>e.id);
  assert.equal(new Set(ids).size,2);
  const {g,sync}=entorno({docs:{[P+'/'+Q]:q}});
  const r=await sync(P,Q);assert.equal(r.ok,true);assert.equal(r.escrituras,1);assert.equal(g.vivos().length,4);
});
await test('reconciliación: un documento que falla no detiene a los demás',async()=>{
  const {g,deps}=entorno({docs:{['quotes/Q1']:base({id:'Q1',status:'pedido',eventDate:'2026-10-10'}),['quotes/Q2']:base({id:'Q2',status:'pedido',eventDate:'2026-10-11'})}});
  const depsX={...deps,leerDoc:async(c,id)=>{if(id==='Q1')throw new Error('falla simulada');return deps.leerDoc(c,id)}};
  const r=await SYNC.reconciliar(depsX);
  assert.equal(r.errores,1);assert.equal(vivosDe(g,'quotes/Q2').length,2);
});
await test('registros sin datos de clientes (errores, reintentos y no convergencia)',async()=>{
  const {g,deps,r,sync,reconciliar}=entorno({docs:{['quotes/'+Q]:base({status:'pedido',eventDate:'2026-10-10'})}});
  g.fallas.push({cuando:m=>m==='POST',status:503},{cuando:m=>m==='POST',status:503});
  await sync('quotes',Q).catch(()=>{});
  g.fallas.push({cuando:m=>m==='GET',status:500});
  await reconciliar();
  let n=0;await sync('quotes',Q,{...deps,leerDoc:async(c,id)=>({...await deps.leerDoc(c,id),eventDate:'2026-11-1'+(n++)})});
  assert.ok(r.lineas.length>0,'hubo registros');
  for(const l of r.lineas)for(const dato of [CLIENTE,DIR,TEL,'Atención Fixture','sin nueces','Bogotá'])assert.ok(!l.includes(dato),'dato del cliente en el registro: '+l);
});

// ═══ 4. App: descarga manual, panel retirado y cableado ══════════════════════
await test('descarga manual .ics: lista de eventos del módulo, con alarmas y productos',()=>{
  const q={...base({status:'aprobada',kind:'proposal',despachos:[desp('d1','2026-10-20T08:00'),desp('d2','2026-10-22T10:30')]}),sections:[{name:'Entradas',options:[{label:'Opción A',items:[{qty:33,name:'Hummus'}]}]}]};
  const c=loadSourceFunctions(['_icsEscape','_icsFold','_icsDateUtc','_icsDateOnly','_buildItemsInline','_eventosAgenda','_tieneEventosAgenda','_getProdSlot','_buildVeventsForDoc'].map(n=>['app-dashboard.js',n]),
    {GBAgenda:A,quotesCache:[q],getCollectionName:(id,k)=>id.startsWith('GB-PF-')?'propfinals':k==='quote'?'quotes':'proposals',isoToDate:s=>new Date(s+'T12:00:00'),dateToIso:d=>d.toISOString().slice(0,10)});
  const txt=c._buildVeventsForDoc(q).join('\r\n'),vev=txt.split('BEGIN:VEVENT').slice(1);
  const lista=A.eventosDeDoc(q,'proposals');
  assert.equal(vev.length,lista.length,'un VEVENT por evento del módulo');
  for(const e of lista)assert.ok(txt.replace(/\r\n /g,'').includes('UID:'+e.id+'@gourmetbites'),'UID del módulo '+e.tipo);
  assert.ok(txt.includes('DTSTART:20261022T103000'));assert.ok(txt.includes('TRIGGER:-PT2H'));assert.ok(txt.includes('33× Hummus'));
  assert.equal((txt.match(/BEGIN:VALARM/g)||[]).length,2+2+2,'producción 1 alarma; entrega con hora 2');
});
await test('panel «Sync Agenda» retirado, token borrado al cargar y nota del calendario de Google',()=>{
  const dash=leer('app-dashboard.js'),core=leer('app-core.js'),html=leer('index.html');
  for(const t of ['SYNC_AGENDA_','renderSyncAgendaPanel','saveSyncAgendaToken','copySyncAgendaUrl','shareSyncAgendaWA','forgetSyncAgendaToken','agendaics-'])
    assert.ok(!dash.includes(t)&&!core.includes(t)&&!html.includes(t),'queda '+t);
  assert.ok(!html.includes('sync-agenda-panel'));
  assert.match(dash+core,/localStorage\.removeItem\("gb_sync_agenda_token"\)/);
  assert.ok(html.includes('Gourmet Bites — Pedidos'),'nota del calendario de Google');
  const v=(core.match(/const BUILD_VERSION="v([^"]+)"/)||[])[1];
  assert.ok(html.includes('<script src="agenda-eventos.js?v='+v+'"></script>'),'script del módulo con buster');
  assert.ok(html.indexOf('agenda-eventos.js')<html.indexOf('app-dashboard.js?v='),'el módulo carga antes que app-dashboard');
});
await test('functions/index.js: sin agendaIcs ni su secreto; triggers en las 3 colecciones, reconciliación 03:00 Bogotá, parámetros y cuenta dedicada',()=>{
  const ix=leer('functions/index.js').split('\n').filter(l=>!l.trim().startsWith('//')).join('\n'); // código, no los comentarios que documentan la baja
  assert.ok(!/agendaIcs|defineSecret|GB_AGENDA_TOKEN|onRequest/.test(ix),'queda el endpoint .ics');
  for(const c of ['quotes','proposals','propfinals'])assert.ok(ix.includes('"'+c+'"'),c);
  assert.match(ix,/onDocumentWritten/);assert.match(ix,/onSchedule/);
  assert.match(ix,/"0 3 \* \* \*"/);assert.match(ix,/America\/Bogota/);
  assert.match(ix,/defineString\("GB_CALENDAR_ID"/);assert.match(ix,/serviceAccount:\s*AGENDA_SA/);
  const pkg=JSON.parse(leer('functions/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),['firebase-admin','firebase-functions'],'sin dependencias nuevas');
});
await test('como <script> del navegador (sin module) define window.GBAgenda',()=>{
  const ctx={window:{},TextEncoder};vm.runInNewContext(leer('agenda-eventos.js'),ctx);
  assert.equal(typeof ctx.window.GBAgenda.eventosDeDoc,'function');
  assert.equal(ctx.window.GBAgenda.idEvento('quotes/X','entrega','d1'),A.idEvento('quotes/X','entrega','d1'));
});
await test('C3: agenda-eventos.js y functions/agenda-eventos.js son idénticos',()=>{
  assert.equal(leer('functions/agenda-eventos.js'),leer('agenda-eventos.js'));
});

// ═══ 5. Hallazgos de la ronda 1 de código (v8.0.8) ═══════════════════════════
const isoLocal=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const colDe=(id,k)=>id.startsWith('GB-PF-')?'propfinals':k==='quote'?'quotes':'proposals';
function appIcs(cache){
  const sal={archivos:[],alertas:[]};
  const c=loadSourceFunctions(['isoToDate','dateToIso','eventsAllStatuses','_icsEscape','_icsFold','_icsDateUtc','_icsDateOnly','_buildItemsInline','_eventosAgenda','_tieneEventosAgenda','_getProdSlot','_buildVeventsForDoc','_icsHeader','_icsFooter','exportPedidoIcs','exportAgendaIcs'].map(n=>['app-dashboard.js',n]),
    {GBAgenda:A,quotesCache:cache,BUILD_VERSION:'v-test',getCollectionName:colDe,alert:m=>sal.alertas.push(m),shareOrDownloadIcs:async(nombre,lineas)=>{sal.archivos.push({nombre,txt:lineas.join('\r\n')})}});
  return {c,sal};
}
const uids=txt=>(txt.replace(/\r\n /g,'').match(/UID:[^\r\n]+/g)||[]).sort();
await test('H1 r1: propuesta aprobada con fecha sólo en un despacho se descarga sola y en la agenda completa',async()=>{
  const fd=isoLocal(5);
  const q={...base({status:'aprobada',kind:'proposal',despachos:[desp('d1',fd+'T09:00')]}),sections:[]};
  const fuera={...base({id:'GB-P-2026-0002',status:'aprobada',kind:'proposal',despachos:[desp('d9',isoLocal(90)+'T09:00')]}),sections:[]};
  const noAg={...base({id:'GB-P-2026-0003',status:'enviada',kind:'proposal',despachos:[desp('d8',fd+'T09:00')]}),sections:[]};
  const {c,sal}=appIcs([q,fuera,noAg]);
  const esperados=A.eventosDeDoc(q,'proposals').map(e=>'UID:'+e.id+'@gourmetbites').sort();
  assert.equal(esperados.length,2);
  await c.exportPedidoIcs(q.id,'proposal');
  assert.deepEqual(sal.alertas,[],'rechazó la descarga individual');
  assert.deepEqual(uids(sal.archivos[0]?.txt||''),esperados);
  await c.exportAgendaIcs();
  assert.deepEqual(uids(sal.archivos[1]?.txt||''),esperados,'la agenda completa: sólo el agendable dentro del rango');
});
await test('H1 r1: slot de producción cuenta los documentos con fecha sólo en despachos',()=>{
  const fd=isoLocal(5),fp=A.sumarDias(fd,-1);
  const legacy=base({id:'GB-Q-2026-0001',quoteNumber:'GB-Q-2026-0001',kind:'quote',status:'pedido',eventDate:fd,horaEntrega:'10:00'});
  const soloDesp=base({kind:'proposal',status:'aprobada',despachos:[desp('d1',fd+'T09:00')]});
  const {c}=appIcs([legacy,soloDesp]);
  const a=c._getProdSlot(soloDesp,fp),b=c._getProdSlot(legacy,fp);
  assert.equal(a.totalSameDay,2);assert.equal(b.totalSameDay,2);
  assert.deepEqual([a.position,b.position],[1,2],'ordena por la hora de entrega del módulo');
});
await test('H1 r1: el botón .ics del historial usa la lista del módulo, no eventDate/productionDate',()=>{
  const hist=leer('app-historial.js');
  assert.ok(!/eventDate\|\|q\.productionDate\)[^\n]*exportPedidoIcs/.test(hist),'botón .ics condicionado a eventDate/productionDate');
  assert.equal((hist.match(/_tieneEventosAgenda\(q\)\?'<button class="btn hc-btn-ics"|_tieneEventosAgenda\(q\)\)actionBtns\.push\('<button class="btn hc-btn-ics"/g)||[]).length,3);
});
await test('H2 r1 (D6 aclarada): notas internas tal cual aunque mencionen montos; el total no aparece',()=>{
  const l=ev(base({status:'aprobada',total:1234567,notasInternas:'Cobrar 150000 pesos al entregar',despachos:[desp('d1','2026-10-20T08:00')]}),'proposals');
  for(const e of l){
    assert.ok(e.descripcion.includes('Notas internas: Cobrar 150000 pesos al entregar'),'notas literales en '+e.tipo);
    assert.ok(!/1\.?234\.?567/.test(e.titulo+e.descripcion+e.lugar),'total en '+e.tipo);
  }
});
await test('H3 r1: .ics manual — entrega 23:30 termina al día siguiente (también 31-dic → 1-ene)',()=>{
  for(const [f,ini,fin] of [['2026-12-31','20261231T233000','20270101T003000'],['2026-10-10','20261010T233000','20261011T003000'],['2028-02-28','20280228T233000','20280229T003000'],['2026-10-10','20261010T223000','20261010T233000']]){
    const q={...base({kind:'quote',status:'pedido',eventDate:f,horaEntrega:ini.slice(9,11)+':'+ini.slice(11,13)}),sections:[]};
    const txt=appIcs([q]).c._buildVeventsForDoc(q).join('\r\n');
    const ent=txt.split('BEGIN:VEVENT').find(v=>v.includes('ENTREGA'));
    assert.ok(ent.includes('DTSTART:'+ini),'inicio '+ini);assert.ok(ent.includes('DTEND:'+fin),'fin esperado '+fin+' en '+f);
  }
});
await test('H4 r1: id con tope de longitud — SHA-256 de la clave completa en base32hex, también con id de documento de 700+ caracteres',async()=>{
  const {createHash}=await import('node:crypto');
  const b32=buf=>{let o='',acc=0,bits=0;for(const b of buf){acc=(acc<<8)|b;bits+=8;while(bits>=5){o+='0123456789abcdefghijklmnopqrstuv'[(acc>>>(bits-5))&31];bits-=5}acc&=(1<<bits)-1}if(bits)o+='0123456789abcdefghijklmnopqrstuv'[(acc<<(5-bits))&31];return o};
  const ref=(g,t,k)=>b32(createHash('sha256').update(g+'/'+t+'/'+k,'utf8').digest());
  for(const [g,t,k] of [['quotes/X','entrega','d1'],['quotes/'+'x'.repeat(700),'entrega','d1'],['proposals/'+'ñ'.repeat(1500),'produccion','2026-10-10'],['q','e',''],['quotes/'+'a'.repeat(41),'entrega','d'],['quotes/'+'a'.repeat(50),'entrega','d']]){
    const id=A.idEvento(g,t,k);
    assert.match(id,/^[0-9a-v]{5,1024}$/,'longitud '+id.length);
    assert.equal(id,ref(g,t,k),'SHA-256 de '+g.slice(0,12)+'… ('+(g+t+k).length+')');
  }
  assert.notEqual(A.idEvento('quotes/'+'x'.repeat(700),'entrega','d1'),A.idEvento('quotes/'+'x'.repeat(701),'entrega','d1'));
  for(let n=0;n<140;n++)assert.equal(A.idEvento('x'.repeat(n),'e','k'),ref('x'.repeat(n),'e','k'),'relleno de '+(n+4)+' bytes');
});
// ═══ 6. Hallazgos de la ronda 2 de código (v8.0.8) ═══════════════════════════
await test('H2 r2: la agenda completa sólo emite los eventos del rango, con sus alarmas y productos',async()=>{
  const q={...base({id:'GB-Q-2026-0009',quoteNumber:'GB-Q-2026-0009',kind:'quote',status:'pedido',cart:[{n:'Hummus',qty:3}],despachos:[desp('dentro',isoLocal(5)+'T09:00'),desp('fuera',isoLocal(90)+'T09:00')]}),sections:[]};
  const {c,sal}=appIcs([q]);
  const todos=A.eventosDeDoc(q,'quotes'),dentro=todos.filter(e=>e.fecha<=isoLocal(60));
  assert.ok(dentro.length>0&&dentro.length<todos.length,'fixture con eventos dentro y fuera del rango');
  await c.exportAgendaIcs();
  const txt=(sal.archivos[0]?.txt||'').replace(/\r\n /g,''),sinStamp=s=>s.replace(/DTSTAMP:[^\r\n]+/g,'');
  assert.deepEqual(uids(txt),dentro.map(e=>'UID:'+e.id+'@gourmetbites').sort(),'sólo los eventos del rango');
  const bloques=c._buildVeventsForDoc(q).join('\r\n').replace(/\r\n /g,'').split('BEGIN:VEVENT').slice(1).filter(b=>dentro.some(e=>b.includes('UID:'+e.id+'@')));
  assert.equal(bloques.length,dentro.length);
  for(const b of bloques)assert.ok(sinStamp(txt).includes(sinStamp(b)),'evento completo (alarmas y productos)');
  assert.ok(txt.includes('BEGIN:VALARM')&&txt.includes('A ENTREGAR: 3× Hummus'));
});
// H5 — alcance fijado por Luis (ronda 5): sólo la comprobación de la ronda 1. El orden de autorización en DEPLOY.md
// se revisa a mano; la protección efectiva la dan el gancho pre-push, los vetos del trabajador y la regla de la frase (AGENTS.md).
await test('H5: DEPLOY.md — sin gb_push_autorizado ni gh auth switch; todo git push (con o sin origin) por con_cuenta.sh',()=>{
  const dep=leer('DEPLOY.md').replace(/[ \t]+/g,' '); // cualquier secuencia de espacios o tabuladores cuenta como uno
  assert.ok(!dep.includes('gb_push_autorizado'),'queda gb_push_autorizado');
  assert.ok(!dep.includes('gh auth switch'),'con_cuenta.sh no cambia la cuenta activa de gh');
  let pushes=0;
  for(const m of dep.matchAll(/git push\b/g)){
    pushes++;
    assert.ok(dep.slice(0,m.index).endsWith('herramientas/relevo/con_cuenta.sh" '),'push sin con_cuenta.sh: '+dep.slice(m.index).split('\n')[0]);
  }
  assert.ok(pushes>=5,'pushes: '+pushes);
});

await test('v8.0.8 r1: id de despacho que ya trae el sufijo (x~3, x, x) no choca',()=>{
  const q=prop({despachos:[desp('x~3','2026-10-20T08:00'),desp('x','2026-10-21T08:00'),desp('x','2026-10-22T08:00')]});
  const ids=tipos(ev({...q,id:Q},P),'entrega').map(e=>e.id);
  assert.equal(ids.length,3);assert.equal(new Set(ids).size,3,'tres ids distintos');
});
await test('v8.0.8 r1: la agenda interna usa la lista del módulo (despachos sin eventDate, una entrega por despacho)',()=>{
  const q={id:'GB-P-2026-0009',kind:'proposal',status:'aprobada',client:'C',despachos:[desp('a','2026-10-20T08:00'),desp('b','2026-10-22T15:30')]};
  const fns=['eventsAllStatuses','_shouldShowProduccion','eventsForCalendarEntries'].map(n=>['app-dashboard.js',n]).concat([['app-core.js','getCollectionName']]);
  const c=loadSourceFunctions(fns,{window:{GBAgenda:A},quotesCache:[q],getFollowUp:()=>null});
  const e=c.eventsForCalendarEntries();
  const ent=e.filter(x=>x.tipo==='entregar').map(x=>x.iso+' '+x.hora),prod=e.filter(x=>x.tipo==='producir').map(x=>x.iso);
  assert.deepEqual([...ent],['2026-10-20 08:00','2026-10-22 15:30']);assert.deepEqual([...prod],['2026-10-19','2026-10-21']);
  const c2=loadSourceFunctions(fns,{window:{GBAgenda:A},quotesCache:[{...q,produced:true}],getFollowUp:()=>null});
  assert.equal(c2.eventsForCalendarEntries().filter(x=>x.tipo==='producir').length,0,'ya producido: sin «producir»');
});
await test('v8.0.8 r1: DEPLOY exige errores 0 y sinConverger 0 en la carga inicial',()=>{
  assert.match(leer('DEPLOY.md'),/`errores: 0` \*\*y\*\* `sinConverger: 0`/);
});
await test('v8.0.8 r2: las tarjetas usan la fecha y hora del despacho; «Marcar producido» en la semana pasa el kind',()=>{
  const q={id:'GB-P-2026-0009',kind:'proposal',status:'aprobada',client:'C',horaEntrega:'07:00',despachos:[desp('a','2026-10-20T08:00'),desp('b','2026-10-22T15:30')]};
  const fns=['eventsAllStatuses','_shouldShowProduccion','eventsForCalendarEntries','renderWeekProductionCard'].map(n=>['app-dashboard.js',n]).concat([['app-core.js','getCollectionName']]);
  const c=loadSourceFunctions(fns,{window:{GBAgenda:A},quotesCache:[q],getFollowUp:()=>null,fm:String,getDocTotal:()=>0,jsArg:JSON.stringify,_calEntregaLabel:iso=>'«'+iso+'»'});
  const e=c.eventsForCalendarEntries();
  const p=e.filter(x=>x.tipo==='producir');
  assert.deepEqual([...p.map(x=>x.entregaIso+' '+x.entregaHora)],['2026-10-20 08:00','2026-10-22 15:30'],'cada producción nombra su entrega');
  const html=c.renderWeekProductionCard(q,p[1]);
  assert.match(html,/«2026-10-22» 15:30/);assert.doesNotMatch(html,/07:00/,'no la hora vieja del documento');
  const dash=leer('app-dashboard.js');
  assert.match(dash,/renderWeekEventCard\(e\.q,iso,todayIso,e\.hora\)/);assert.match(dash,/const horaE=e\.tipo==="entregar"\?e\.hora:e\.entregaHora;/);
  assert.match(dash,/toggleProduced\('\+jsArg\(q\.id\)\+','\+jsArg\(q\.kind\)\+',event\)" title="Marcar como producido"/);
});
await test('v8.0.8.1: producir naranja (6), entrega azul (9); un evento sin color o con otro no coincide',()=>{
  const l=ev(base({status:'pedido',eventDate:'2026-10-10'}),'quotes').map(SYNC.aRecurso);
  const [p]=l.filter(r=>r.summary.startsWith('🔥')),[e]=l.filter(r=>r.summary.startsWith('🚚'));
  assert.equal(p.colorId,'6');assert.equal(e.colorId,'9');
  assert.ok(SYNC.coincide(l,l.map(r=>({...r}))),'mismo color: coincide');
  assert.ok(!SYNC.coincide(l,l.map(r=>({...r,colorId:undefined}))),'creado antes de v8.0.8.1 (sin color): se recolorea');
  assert.ok(!SYNC.coincide(l,l.map(r=>({...r,colorId:'11'}))),'otro color: se corrige');
});
console.log(`\n${ok} OK · ${fallos} fallo(s)`);
process.exit(fallos?1:0);
