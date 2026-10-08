// ═══════════════════════════════════════════════════════════
// app-negocios.js · v8.0.0 (tramos 1 a 4) · 2026-09-28
// Un NEGOCIO es la cadena de documentos de un mismo encargo: la cotización y
// sus versiones; la propuesta, sus versiones, su PF y las PF regeneradas.
//  · F1 resolverNegocios: agrupa quotesCache en negocios (pura, O(n)).
//  · F2 métricas del Inicio: una función por número, con el mismo universo
//    que renderDashboard y getPipelineActivo.
//  · F5 aviso de contacto y detección de cambios del editor.
//  · Tramo 2: pantallas Inicio y Negocios, avisos y navegación (GB_REDISENO_R1).
//  · Tramo 3 (al final): ficha del negocio, pagos rápidos, estado de cuenta, reporte de ambiguos y unir/separar a mano.
// ═══════════════════════════════════════════════════════════

// ─── F1: IDENTIDAD DEL NEGOCIO ─────────────────────────────
// Milisegundos de un Timestamp de Firestore, un Date serializado o un texto ISO (NaN si no hay).
function _negMsDe(v){
  if(!v)return NaN;
  if(typeof v.toMillis==="function")return v.toMillis();
  if(typeof v.toDate==="function")return v.toDate().getTime();
  if(typeof v._seconds==="number")return v._seconds*1000;
  if(typeof v.seconds==="number")return v.seconds*1000;
  return Date.parse(v);
}
// Fecha de creación de un documento (0 si no se sabe): ordena y elige la cabeza.
function _negMs(q){
  const ms=_negMsDe(q.createdAt);
  return isNaN(ms)?(Date.parse(q.dateISO)||0):ms;
}
// Precedencia: negocioManual (decisión humana) > enlaces de la cadena > businessId.
//  · Enlaces hijo → padre: parentQuote (versión), supersedes (PF regenerada), sourceProposal (PF).
//    Enlaces padre → hijo: supersededBy, propFinalRef. «Verificado» = el otro documento apunta de vuelta.
//  · Nivel: «ambiguo» si hay enlace roto, ciclo, businessId en conflicto o no hay una sola cabeza;
//    «probable» si algún enlace es de un solo sentido; «seguro» en otro caso.
//  · La clave de un negocio es el id del origen de su cadena, nunca el businessId: un businessId
//    sin enlace no une (una restauración parcial sin la raíz queda como «historia incompleta»).
//  · replacedBy/replaces y optionGroupId no unen: los primeros van en «relacionados» y cada grupo de
//    opciones en «gruposDeOpciones» ({optionGroupId, negocios[]}, el mismo objeto para todo el grupo).
const ENLACES_HACIA_PADRE=["parentQuote","supersedes","sourceProposal"]; // los declara el hijo
const ENLACES_HACIA_HIJO=["supersededBy","propFinalRef"]; // los declara el padre (también los recorre «separar»)
function _resolverNegociosDetalle(docs){
  const HACIA_PADRE=ENLACES_HACIA_PADRE;
  const ENLACES=[...HACIA_PADRE,...ENLACES_HACIA_HIJO];
  const lista=[],porId=new Map(),ms=new Map();
  for(const q of docs||[]){
    // Las copias en la colección equivocada quedan fuera, como en los KPI y el seguimiento.
    if(!q||q._wrongCollection||!q.id||porId.has(q.id))continue;
    porId.set(q.id,q);lista.push(q);ms.set(q.id,_negMs(q));
  }
  const antes=(a,b)=>ms.get(a.id)<ms.get(b.id)||ms.get(a.id)===ms.get(b.id)&&a.id<b.id;
  const padreDe=q=>{for(const k of HACIA_PADRE){const t=q[k]&&porId.get(q[k]);if(t&&t!==q)return t}return null};
  const marcas=new Map();
  const marcar=(id,m)=>{if(!marcas.has(id))marcas.set(id,new Set());marcas.get(id).add(m)};
  const verificado=(tipo,q,t)=>{
    if(tipo==="parentQuote"||tipo==="supersedes")return t.supersededBy===q.id;
    if(tipo==="supersededBy")return t.parentQuote===q.id||t.supersedes===q.id;
    if(tipo==="propFinalRef")return t.sourceProposal===q.id;
    // sourceProposal: la propuesta nombra sólo la PF vigente; una PF reemplazada se verifica por su sucesora.
    if(t.propFinalRef===q.id)return true;
    const sig=q.supersededBy&&porId.get(q.supersededBy);
    return !!sig&&sig.supersedes===q.id&&sig.sourceProposal===t.id;
  };
  // Componentes por enlaces (union-find con compresión de caminos).
  const uf=new Map(lista.map(q=>[q.id,q.id]));
  const raiz=id=>{let r=id;while(uf.get(r)!==r)r=uf.get(r);while(uf.get(id)!==r){const n=uf.get(id);uf.set(id,r);id=n}return r};
  for(const q of lista){
    for(const tipo of ENLACES){
      const ref=q[tipo];if(!ref)continue;
      const t=porId.get(ref);
      if(!t){marcar(q.id,"enlace_roto");continue}
      if(t===q){marcar(q.id,"ciclo");continue}
      const a=raiz(q.id),b=raiz(t.id);
      if(a!==b)uf.set(a<b?b:a,a<b?a:b);
      if(!verificado(tipo,q,t))marcar(q.id,"enlace_de_un_sentido");
    }
  }
  // Ciclos en la cadena hacia el padre: cada documento se recorre una sola vez.
  const estado=new Map();
  for(const q of lista){
    const camino=[];let x=q;
    while(x&&!estado.has(x.id)){estado.set(x.id,1);camino.push(x);x=padreDe(x)}
    if(x&&estado.get(x.id)===1)for(let i=camino.indexOf(x);i<camino.length;i++)marcar(camino[i].id,"ciclo");
    for(const c of camino)estado.set(c.id,2);
  }
  // Clave por enlaces: el origen de la cadena (sin padre); con ciclo, el más antiguo.
  const componentes=new Map();
  for(const q of lista){const r=raiz(q.id);if(!componentes.has(r))componentes.set(r,[]);componentes.get(r).push(q)}
  const claveEnlaces=new Map();
  for(const miembros of componentes.values()){
    let origen=null;
    for(const q of miembros)if(!padreDe(q)&&(!origen||antes(q,origen)))origen=q;
    if(!origen)for(const q of miembros)if(!origen||antes(q,origen))origen=q;
    for(const q of miembros)claveEnlaces.set(q.id,origen.id);
  }
  // negocioManual manda; lo heredan los descendientes sin decisión propia (una versión creada
  // después de separar sigue a su padre, y deshacer la decisión del padre la devuelve).
  const manual=new Map();
  const manualDe=q=>{
    const tramo=[],vistos=new Set();let x=q,val=null;
    while(x&&!vistos.has(x.id)){
      if(manual.has(x.id)){val=manual.get(x.id);break}
      const m=x.negocioManual&&x.negocioManual.businessId;
      tramo.push(x);
      if(m){val=String(m);break}
      vistos.add(x.id);x=padreDe(x);
    }
    for(const t of tramo)manual.set(t.id,val);
    return val;
  };
  const grupos=new Map();
  for(const q of lista){
    const clave=manualDe(q)||claveEnlaces.get(q.id);
    if(!grupos.has(clave))grupos.set(clave,{businessId:clave,cabeza:null,documentos:[],nivel:"seguro",motivos:[],relacionados:new Set(),gruposDeOpciones:[]});
    grupos.get(clave).documentos.push(q);
  }
  for(const g of grupos.values()){
    g.documentos.sort((a,b)=>antes(a,b)?-1:1);
    const motivos=new Set();let unSentido=false;
    for(const q of g.documentos){
      const mq=manualDe(q);if(mq&&mq!==claveEnlaces.get(q.id))continue; // un documento movido a mano no califica el negocio con sus enlaces
      for(const m of marcas.get(q.id)||[])if(m==="enlace_de_un_sentido")unSentido=true;else motivos.add(m);
      if(q.businessId&&String(q.businessId)!==claveEnlaces.get(q.id))motivos.add("businessId_en_conflicto");
    }
    // Cabeza: lo que no está superseded ni convertida; si hay varias, la más reciente y, a igualdad, el id mayor.
    const vivos=g.documentos.filter(q=>q.status!=="superseded"&&q.status!=="convertida");
    if(vivos.length>1)motivos.add("varias_cabezas");
    if(!vivos.length)motivos.add("sin_cabeza");
    for(const q of vivos.length?vivos:g.documentos)if(!g.cabeza||antes(g.cabeza,q))g.cabeza=q;
    g.motivos=[...motivos].sort();
    g.nivel=motivos.size?"ambiguo":unSentido?"probable":"seguro";
  }
  const claveDe=id=>{const q=porId.get(id);return q?manualDe(q)||claveEnlaces.get(q.id):null};
  const relacionar=(a,b)=>{if(a&&b&&a!==b)grupos.get(a).relacionados.add(b)};
  const opciones=new Map();
  for(const q of lista){
    const k=claveDe(q.id);
    for(const ref of [q.replacedBy,q.replaces]){const o=ref?claveDe(ref):null;relacionar(k,o);relacionar(o,k)}
    if(q.optionGroupId){if(!opciones.has(q.optionGroupId))opciones.set(q.optionGroupId,new Set());opciones.get(q.optionGroupId).add(k)}
  }
  // v8.0.0 R2: un grupo de opciones es UNA lista compartida por sus negocios; no se materializan
  // los pares (n negocios en un grupo = n referencias, no n²).
  for(const [optionGroupId,claves] of opciones){
    if(claves.size<2)continue;
    const grupo={optionGroupId,negocios:[...claves].sort()};
    for(const k of claves)grupos.get(k).gruposDeOpciones.push(grupo);
  }
  for(const g of grupos.values()){g.relacionados=[...g.relacionados].sort();g.gruposDeOpciones.sort((a,b)=>a.optionGroupId<b.optionGroupId?-1:1)}
  return {grupos,claveEnlaces};
}
// Map businessId → {businessId, cabeza, documentos[], nivel, motivos[], relacionados[], gruposDeOpciones[]}.
function resolverNegocios(docs){return _resolverNegociosDetalle(docs).grupos}
// businessId de un documento que sale de otro (versión, PF, PF regenerada): el del padre leído
// dentro de la transacción; si el padre es viejo (sin businessId), la clave que dan sus enlaces.
// Sólo el padre viejo corre el resolvedor completo (lineal, en memoria sobre quotesCache, sin lecturas
// de red): la clave es el origen del COMPONENTE, que puede depender de enlaces de otras ramas, así que
// recorrer sólo la cadena del padre podría dar otra clave que la de resolverNegocios.
function businessIdHeredado(padre,padreId,docs){
  if(padre&&padre.businessId)return String(padre.businessId);
  return _resolverNegociosDetalle(docs).claveEnlaces.get(padreId)||padreId;
}

// ─── F2: MÉTRICAS DEL INICIO (funciones puras, sin pantalla) ─
// metrica(documento|negocio, rango, ctx) → {incluye, monto}; rango = {start,end} como getDashRange
// y ctx = contextoMetricas(quotesCache). Mismo universo que hoy:
//  · Cotizado, Vendido, Entregado, Recaudado y Por cobrar = el bucle de renderDashboard
//    (noSumaEnKpis, con anuladaData fantasma; perdidas fuera sólo en preconfirmación).
//  · Los tres cuadros del Pipeline = getPipelineActivo (sin isAnulada, perdida fuera en
//    cualquier estado y q.total guardado).
//  · Opciones hermanas (buildOptionExclusions) fuera sólo en Cotizado y en el Pipeline.
// Un negocio suma sus documentos; cada documento está en un solo negocio, así que agrupar no cambia cifras.
// Todo monto pasa por montoNegocio antes de sumarse (_negMetrica): un total guardado como texto no se concatena.
function contextoMetricas(docs){return {optExcl:buildOptionExclusions(docs||[])}}
function _negEnRango(f,r){return !!f&&f>=r.start&&f<=r.end}
function _negCuentaEnKpis(q){
  if(noSumaEnKpis(q,"negocios"))return false;
  const s=q.status||"enviada";
  return !(getFollowUp(q)==="perdida"&&(s==="enviada"||s==="propfinal"));
}
function _negEnPipeline(q,ctx){return !q._wrongCollection&&!["superseded","convertida","anulada"].includes(q.status)&&getFollowUp(q)!=="perdida"&&!ctx.optExcl.has(q.id)}
function _negSi(incluye,monto){return incluye?{incluye:true,monto:monto()}:{incluye:false,monto:0}}
// Monto guardado → número finito, o 0 (ronda 2 de T2, P1: getDocTotal devuelve q.total tal cual y un texto se
// concatenaba en las sumas y llegaba al HTML). Criterio: Number(), no parseInt: un número pasa idéntico (las cifras
// cuadran con renderDashboard/getPipelineActivo para datos válidos), «150000» vale 150000 y un texto con basura
// (un «1» seguido de un atributo inyectado, «abc») vale 0, no su prefijo. Los pagos siguen con parseInt, como totalCobrado.
function montoNegocio(v){const n=typeof v==="number"||typeof v==="string"?Number(v):NaN;return Number.isFinite(n)?n:0}
// Saldo neto (saldoNeto de app-historial.js) con el total normalizado; con datos válidos es idéntico. Negativo = a favor.
function saldoNegocio(q){return montoNegocio(montoNegocio(getDocTotal(q))+totalCargos(q)-totalCobrado(q)-totalAjustes(q))}
function _negMetrica(x,r,ctx,fn){
  if(!x)return {incluye:false,monto:0};
  let incluye=false,monto=0;
  for(const q of Array.isArray(x.documentos)?x.documentos:[x]){const m=fn(q,r,ctx);if(m.incluye){incluye=true;monto+=montoNegocio(m.monto)}}
  return {incluye,monto};
}
function metricaCotizado(x,r,ctx){return _negMetrica(x,r,ctx,(q,r,ctx)=>_negSi(_negCuentaEnKpis(q)&&_negEnRango(dateOfCreation(q),r)&&(q.status||"enviada")!=="convertida"&&!ctx.optExcl.has(q.id),()=>getDocTotal(q)))}
function metricaVendido(x,r,ctx){return _negMetrica(x,r,ctx,(q,r)=>_negSi(_negCuentaEnKpis(q)&&_negEnRango(dateOfSale(q),r)&&["pedido","aprobada","en_produccion","entregado"].includes(q.status||"enviada"),()=>getDocTotal(q)))}
function metricaEntregado(x,r,ctx){return _negMetrica(x,r,ctx,(q,r)=>_negSi(_negCuentaEnKpis(q)&&_negEnRango(q.fechaEntrega||q.eventDate,r)&&(q.status||"enviada")==="entregado",()=>getDocTotal(q)))}
// Recaudado: por pago con fecha en el rango (devoluciones restan), no por el saldo del negocio.
function metricaRecaudado(x,r,ctx){return _negMetrica(x,r,ctx,(q,r)=>{
  let incluye=false,monto=0;
  if(_negCuentaEnKpis(q))for(const p of getPagos(q))if(_negEnRango(p.fecha,r)){incluye=true;monto+=parseInt(p.monto)||0}
  return {incluye,monto};
})}
// Por cobrar: saldo canónico (saldoPendiente, vía saldoNegocio) de lo confirmado y lo entregado, sin rango.
function metricaPorCobrar(x,r,ctx){return _negMetrica(x,r,ctx,q=>{
  const pend=_negCuentaEnKpis(q)&&["pedido","aprobada","en_produccion","entregado"].includes(q.status||"enviada")?saldoNegocio(q):0;
  return pend>0?{incluye:true,monto:pend}:{incluye:false,monto:0};
})}
function metricaPipelineCotizacion(x,r,ctx){return _negMetrica(x,r,ctx,(q,r,ctx)=>{const s=q.status||"enviada";return _negSi(_negEnPipeline(q,ctx)&&(q.kind==="quote"&&s==="enviada"||q.kind==="proposal"&&(s==="enviada"||s==="propfinal")),()=>q.total||0)})}
function metricaPipelineConfirmados(x,r,ctx){return _negMetrica(x,r,ctx,(q,r,ctx)=>_negSi(_negEnPipeline(q,ctx)&&["pedido","aprobada","en_produccion"].includes(q.status||"enviada"),()=>q.total||0))}
function metricaPipelineEntregadosConSaldo(x,r,ctx){return _negMetrica(x,r,ctx,(q,r,ctx)=>{
  const saldo=_negEnPipeline(q,ctx)&&(q.status||"enviada")==="entregado"?saldoNegocio(q):0;
  return saldo>0?{incluye:true,monto:saldo}:{incluye:false,monto:0};
})}

// ─── F5: AVISO DE CONTACTO ─────────────────────────────────
// Una sola regla para el banner del Dashboard y las alertas de Seguimiento:
//  · próximo contacto con fecha ≤ hoy → «Contactar a X» con su nota; con fecha futura → nada todavía;
//  · sin próximo contacto → pendiente o contactado con 7+ días desde el último contacto
//    (followUpUpdatedAt: marcar, nota o reactivar; si no hay, la creación). D2: editar el
//    documento ya no reinicia la cuenta (antes se contaba desde updatedAt).
function diasSinContacto(q,ahora){
  if(!q)return 0;
  let ms=_negMsDe(q.followUpUpdatedAt);
  if(isNaN(ms))ms=_negMs(q);
  if(!ms)return 0;
  return Math.max(0,Math.floor(((ahora==null?Date.now():ahora)-ms)/86400000));
}
function avisoContacto(q,hoyIso,ahora){
  if(!isFollowable(q))return null;
  const fu=getFollowUp(q);
  if(fu==="perdida")return null;
  const pc=q.proximoContacto;
  if(pc&&pc.fecha){
    if(pc.fecha>(hoyIso||gbTodayIso()))return null;
    return {tipo:"proximo_contacto",texto:"Contactar a "+(q.client||"—"),nota:pc.nota||"",fecha:pc.fecha};
  }
  if(fu!=="pendiente"&&fu!=="contactado")return null;
  const dias=diasSinContacto(q,ahora);
  return dias>=7?{tipo:"sin_contacto",texto:dias+" días sin contacto",dias}:null;
}

// ─── F5: ¿EL EDITOR TIENE CAMBIOS? (contrato v2.1 del guardado silencioso) ─
// Compara lo que el formulario enviaría con la firma del formulario tal como quedó al abrir
// (base.formFields), campo por campo, igual que la fusión a tres bandas; no usa diffDocs.
// Sin una base verificable responde que sí: el guardado pregunta y nunca escribe a ciegas.
function formularioConCambios(kind,formObj,id){
  const base=window._gbEditBases?.[kind];
  if(!base||base.id!==id||!base.formFields)return true;
  const ahora=editableFieldSignatures(formObj,{formulario:true});
  for(const k of new Set([...Object.keys(ahora),...Object.keys(base.formFields)]))if(ahora[k]!==base.formFields[k])return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// v8.0.0 (tramo 2): Inicio, Negocios, avisos «Por actualizar» y navegación.
// Todo lo visible depende de GB_REDISENO_R1 (app-core.js); apagada, nada de esto se pinta.
// Reglas: los números salen de las métricas de F2 (cuadro y lista usan la misma función);
// los botones sólo ABREN los flujos validados existentes (esta pantalla nunca escribe);
// eventos por delegación con data-* (sin on*=); todo valor interpolado con h(); montos con montoNegocio/saldoNegocio.
// ═══════════════════════════════════════════════════════════
function _r1Norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function _r1Manana(hoy){const d=new Date(hoy+"T12:00:00");d.setDate(d.getDate()+1);return gbDateToIso(d)}
const PERIODOS_R1=[["mes","Este mes"],["mes_anterior","Mes anterior"],["anio","Este año"]];
// Rango propio del Inicio (no depende de los botones del Dashboard viejo); «Este mes» y «Este año» van hasta hoy, como allá.
function rangoInicio(periodo){
  if(periodo==="rango"&&_r1Estado.rango)return _r1Estado.rango; // v8.0.1: «Fechas», sólo tras validar Desde ≤ Hasta
  const hoy=gbTodayIso(),d=new Date(hoy+"T12:00:00");
  if(periodo==="mes_anterior")return {start:gbDateToIso(new Date(d.getFullYear(),d.getMonth()-1,1)),end:gbDateToIso(new Date(d.getFullYear(),d.getMonth(),0)),label:"Mes anterior"};
  if(periodo==="anio")return {start:hoy.slice(0,4)+"-01-01",end:hoy,label:"Este año"};
  return {start:hoy.slice(0,8)+"01",end:hoy,label:"Este mes"};
}
// Etapa del negocio según su cabeza (el documento vivo de la cadena).
function etapaNegocio(q){
  const s=q.status||"enviada";
  if(s==="anulada")return "anulada";
  if(isFollowable(q))return getFollowUp(q)==="perdida"?"perdida":"cotizacion";
  if(s==="pedido"||s==="aprobada"||s==="en_produccion")return q.produced?"listo":"confirmado";
  if(s==="entregado")return saldoNegocio(q)>0?"por_cobrar":"cerrado";
  return "otro"; // sin documento vivo (historia incompleta): nunca se pierde de la lista
}
const ETAPAS_R1={cotizacion:"Cotización",perdida:"Perdida",confirmado:"Confirmado",listo:"Listo para entregar",por_cobrar:"Entregado · por cobrar",cerrado:"Cerrado",anulada:"Anulada",otro:"Sin documento vigente"};
// F3.proxima_accion. «listo»/produced se conserva a propósito (se quita en v8.1).
function proximaAccion(q,porFacturar){
  const e=etapaNegocio(q);
  if(e==="cotizacion"){
    if(q.kind==="quote")return "pedido";
    if((q.status||"enviada")==="enviada"&&propRequierePF(q))return "pf"; // como Historial (v8.0.7 D18: también menaje A/B)
    return "aprobar";
  }
  if(e==="confirmado")return "listo";
  if(e==="listo")return "entregar";
  if(e==="por_cobrar")return "pago";
  if(e==="cerrado"&&porFacturar)return "fe";
  return null;
}
// Cada acción abre el flujo validado que ya existe; ninguna escribe desde aquí.
const ACCIONES_R1={
  pedido:{label:"Aprobada",abrir:id=>openOrderModal(id)},
  pf:{label:"Aprobada",abrir:id=>openPropFinalFlow(id)},
  aprobar:{label:"Aprobada",abrir:(id,kind)=>openApproveModal(id,kind)},
  listo:{label:"Marcar listo",abrir:(id,kind)=>toggleProduced(id,kind)},
  entregar:{label:"Entregar",abrir:(id,kind)=>openDeliveryModal(id,kind)},
  pago:{label:"Registrar pago",abrir:(id,kind)=>openPagoModal(id,kind)},
  fe:{label:"Registrar FE",abrir:(id,kind)=>openFeModal(id,kind)},
  contactado:{label:"Contactado",abrir:(id,kind)=>markFollowUp(id,kind,"contactado")}
};
// Chips de la lista; «Por facturar» sólo con la empresa encendida (D-v8-06).
const CHIPS_R1=[
  {clave:"abiertos",label:"Abiertos",si:n=>["cotizacion","confirmado","listo","por_cobrar","otro"].includes(n.etapa)},
  {clave:"cotizaciones",label:"Cotizaciones",si:n=>n.etapa==="cotizacion"},
  {clave:"confirmados",label:"Confirmados",si:n=>n.etapa==="confirmado"||n.etapa==="listo"},
  {clave:"manana",label:"Entregar mañana",si:(n,p)=>(n.etapa==="confirmado"||n.etapa==="listo")&&n.cabeza.eventDate===p.manana},
  // Decisión de Luis (Codex r1 v8.0.1, hallazgo 3): manda la cabeza; si difiere del Pipeline por historia anómala, se corrige con «Unir».
  {clave:"por_cobrar",label:"Por cobrar",si:n=>n.etapa==="por_cobrar"}, // v8.0.1: sólo entregados con saldo; el número del Inicio sigue con metricaPorCobrar
  {clave:"por_facturar",label:"Por facturar",empresa:true,si:n=>n.porFacturar},
  {clave:"perdidas",label:"Perdidas",si:n=>n.etapa==="perdida"},
  {clave:"cerrados",label:"Cerrados",si:n=>n.etapa==="cerrado"||n.etapa==="anulada"}
];
// Cuadros del Inicio: la misma métrica pinta el número y filtra la lista.
const CUADROS_R1=[
  {clave:"pipe_cot",pipeline:true,fn:metricaPipelineCotizacion,lab:"🧾 En cotización",que:"Cotizaciones y propuestas vivas (sin perdidas ni opciones alternas)"},
  {clave:"pipe_conf",pipeline:true,fn:metricaPipelineConfirmados,lab:"🤝 Pedidos confirmados",que:"Confirmados todavía sin entregar"},
  {clave:"pipe_ent",pipeline:true,fn:metricaPipelineEntregadosConSaldo,lab:"🎉 Entregados con saldo",que:"Sólo lo ya entregado: su saldo por cobrar"},
  {clave:"cotizado",fn:metricaCotizado,lab:"Cotizado",que:"Lo cotizado en el período (sin versiones viejas ni opciones alternas)"},
  {clave:"vendido",fn:metricaVendido,lab:"Vendido",que:"Confirmados con entrega en el período"},
  {clave:"entregado",fn:metricaEntregado,lab:"Entregado",que:"Entregado en el período"},
  {clave:"recaudado",fn:metricaRecaudado,lab:"Recaudado",que:"Pagos recibidos en el período (las devoluciones restan)"},
  {clave:"cobrar",fn:metricaPorCobrar,lab:"Por cobrar",que:"Confirmados y entregados, sin importar la fecha"}
];
const _r1Estado={periodo:"mes",rango:null,fechas:false,borrador:null,filtro:{chip:"abiertos",metrica:null,texto:"",pagina:1},proy:null,espera:null,refresco:null,ficha:null,unir:null};

// ─── Proyección: resolvedor + métricas + avisos + texto para buscar (se memoriza) ─
function proyectarNegocios(docs){
  const ctx=contextoMetricas(docs),empresa=gbEmisorConfigurado(),hoy=gbTodayIso(),manana=_r1Manana(hoy);
  const facturar=new Set(empresa?gbPorFacturar().map(q=>q.id):[]); // gbPorFacturar lee quotesCache (= docs)
  const negocios=[],avisos=[],porCabeza=new Map(),porNegocio=new Map();
  for(const g of resolverNegocios(docs).values()){
    const q=g.cabeza,etapa=etapaNegocio(q),fe=facturar.has(q.id);
    const n={businessId:g.businessId,cabeza:q,documentos:g.documentos,nivel:g.nivel,motivos:g.motivos,relacionados:g.relacionados,gruposDeOpciones:g.gruposDeOpciones,etapa,porFacturar:fe,accion:proximaAccion(q,fe),
      orden:(dateOfCreation(q)||"")+"|"+q.id,avisos:[],
      texto:_r1Norm([q.client].concat(g.documentos.map(d=>d.id+" "+(d.quoteNumber||""))).join(" "))};
    // F7: reglas de «Por actualizar» (las de la empresa sólo con la empresa encendida).
    const aviso=(regla,texto,accion,etiqueta)=>n.avisos.push({regla,texto,accion,etiqueta,n,fecha:q.eventDate||dateOfCreation(q)||""});
    const c=avisoContacto(q,hoy); // la misma regla del banner del Dashboard y de Seguimiento
    if(c)aviso(1,c.texto+(c.nota?" · "+c.nota:""),"contactado","Contactado");
    if(etapa==="confirmado"&&q.eventDate===manana)aviso(2,"Entrega mañana sin marcar listo","listo","Sí, listo");
    if((etapa==="confirmado"||etapa==="listo")&&q.eventDate&&q.eventDate<hoy)aviso(3,"Entrega del "+q.eventDate+" sin marcar entregada",n.accion,ACCIONES_R1[n.accion].label);
    if(etapa==="por_cobrar")aviso(4,"Entregado con saldo "+fm(saldoNegocio(q)),"pago","Registrar pago");
    if(fe)aviso(5,"Entregado sin factura electrónica","fe","Registrar FE");
    negocios.push(n);avisos.push(...n.avisos);porCabeza.set(q.kind+"|"+q.id,n);porNegocio.set(g.businessId,n);
  }
  negocios.sort((a,b)=>a.orden<b.orden?1:a.orden>b.orden?-1:0);
  avisos.sort((a,b)=>a.regla-b.regla||(a.fecha<b.fecha?-1:a.fecha>b.fecha?1:a.n.cabeza.id<b.n.cabeza.id?-1:1));
  return {negocios,avisos,porCabeza,porNegocio,ctx,empresa,hoy,manana,fuente:docs};
}
// Memorizada sobre quotesCache: otra referencia (recarga) la recalcula; pintarNavR1 la invalida
// en cada renderMode, que corre tras cada mutación (refreshActiveView/refrescarVistasR1) y al navegar.
function proyeccionNegocios(){
  if(!_r1Estado.proy||_r1Estado.proy.fuente!==quotesCache)_r1Estado.proy=proyectarNegocios(quotesCache);
  return _r1Estado.proy;
}
function invalidarProyeccionNegocios(){_r1Estado.proy=null}
// Lista filtrada por un cuadro (su métrica) o por un chip, y por el buscador; conteos de chips sobre la búsqueda.
function filtrarNegocios(p,f){
  const t=_r1Norm(f.texto).trim();
  const cuadro=f.metrica&&CUADROS_R1.find(c=>c.clave===f.metrica.clave);
  const chips=CHIPS_R1.filter(c=>!c.empresa||p.empresa);
  const chip=!cuadro&&chips.find(c=>c.clave===f.chip);
  const conteos={};for(const c of chips)conteos[c.clave]=0;
  const filas=[],montos=[];let suma=0;
  for(const n of p.negocios){
    if(t&&!n.texto.includes(t))continue;
    for(const c of chips)if(c.si(n,p))conteos[c.clave]++;
    if(cuadro){const m=cuadro.fn(n,f.metrica.rango,p.ctx);if(m.incluye){filas.push(n);montos.push(m.monto);suma+=m.monto}}
    else if(!chip||chip.si(n,p))filas.push(n);
  }
  return {filas,montos,conteos,suma};
}

// ─── HTML (todo valor interpolado con h(), también los números; montos ya normalizados) ─
function _r1Cuadro(c,p,r){let n=0,monto=0;for(const x of p.negocios){const m=c.fn(x,r,p.ctx);if(m.incluye){n++;monto+=m.monto}}return {n,monto}}
function _r1Boton(accion,q,etiqueta){
  return '<button type="button" class="r1-btn" data-r1="accion" data-accion="'+h(accion)+'" data-id="'+h(q.id)+'" data-kind="'+h(q.kind)+'">'+h(etiqueta||ACCIONES_R1[accion].label)+'</button>';
}
function _r1HtmlCuadro(c,p,r){
  const v=_r1Cuadro(c,p,r);
  return '<button type="button" class="r1-cuadro'+h(c.pipeline?' r1-cuadro-pipe':'')+'" data-r1="cuadro" data-cuadro="'+h(c.clave)+'" data-n="'+h(v.n)+'" data-monto="'+h(v.monto)+'">'+
    '<span class="r1-cuadro-lab">'+h(c.lab)+'</span><span class="r1-cuadro-val">'+h(fm(v.monto))+'</span>'+
    '<span class="r1-cuadro-n">'+h(v.n+' negocio'+(v.n!==1?'s':''))+'</span><span class="r1-cuadro-que">'+h(c.que)+'</span></button>';
}
function _r1HtmlFila(n,monto,puede,unir){
  const q=n.cabeza,e=n.etapa;
  const tipo=q.kind==="quote"?"Cotización":(q._isPF||String(q.id).startsWith("GB-PF-"))?"Propuesta final":"Propuesta";
  const fecha=e==="confirmado"||e==="listo"?"Entrega "+(q.eventDate||"sin fecha")
    :e==="por_cobrar"||e==="cerrado"?"Entregado "+(q.fechaEntrega||(q.entregaData&&q.entregaData.fechaEntrega)||q.eventDate||"")
    :"Creada "+(dateOfCreation(q)||"");
  let dinero='Total '+h(fm(montoNegocio(getDocTotal(q))));
  if(["confirmado","listo","por_cobrar","cerrado"].includes(e)){
    const s=saldoNegocio(q);
    dinero+=' · '+(s>0?'Saldo '+h(fm(s)):s<0?'Saldo a favor '+h(fm(-s)):'Pagado');
  }
  // T3: tocar la fila abre la ficha; al unir a mano, elige el negocio destino (sin otras acciones).
  return '<div class="r1-fila'+h(n.nivel==="ambiguo"?' r1-incompleta':'')+'" data-r1="'+h(unir?'unir-destino':'ficha')+'" data-negocio="'+h(n.businessId)+'">'+
    '<div class="r1-cli"><strong>'+h(q.client||"—")+'</strong> <span class="r1-etapa r1-etapa-'+h(e)+'">'+h(ETAPAS_R1[e])+'</span>'+
      (n.nivel==="ambiguo"?' <span class="r1-marca">historia incompleta</span>':'')+'</div>'+
    '<div class="r1-meta">'+h(q.quoteNumber||q.id)+' · '+h(tipo)+' · '+h(fecha)+'</div>'+
    '<div class="r1-montos">'+dinero+(monto!=null?' · <span class="r1-suma">Suma aquí '+h(fm(montoNegocio(monto)))+'</span>':'')+'</div>'+
    (puede&&n.accion&&!unir?'<div class="r1-accion">'+_r1Boton(n.accion,q)+'</div>':'')+
  '</div>';
}
function _r1HtmlFranja(avisos,abierta){
  if(!avisos.length)return '<div class="r1-franja r1-franja-ok">Por actualizar: todo al día ✓</div>';
  const puede=canCurrentUserWrite();
  return '<details class="r1-franja"'+(abierta?' open':'')+'><summary>Por actualizar <span class="r1-insignia">'+h(avisos.length)+'</span></summary><ul class="r1-avisos">'+
    avisos.map(a=>{const q=a.n.cabeza;return '<li class="r1-aviso"><div class="r1-aviso-txt"><strong>'+h(q.client||"—")+'</strong> · '+h(q.quoteNumber||q.id)+'<br>'+h(a.texto)+'</div>'+(puede?_r1Boton(a.accion,q,a.etiqueta):'')+'</li>'}).join("")+
    '</ul></details>';
}

// ─── Pantallas ─────────────────────────────────────────────
function _r1Cablear(box){
  if(box.dataset.r1Cableado)return;
  box.dataset.r1Cableado="1";
  box.addEventListener("click",_r1Click);
  box.addEventListener("input",_r1Input);
  box.addEventListener("change",_r1Input); // Desde/Hasta: algunos navegadores sólo avisan al cerrar el selector
}
function renderInicio(){
  const box=$("mode-inicio");if(!box)return;
  _r1Cablear(box);
  const p=proyeccionNegocios(),r=rangoInicio(_r1Estado.periodo);
  const b=_r1Estado.borrador||{desde:r.start,hasta:r.end}; // lo escrito sin aplicar sobrevive a los repintados automáticos
  const cuadros=pipe=>CUADROS_R1.filter(c=>!!c.pipeline===pipe).map(c=>_r1HtmlCuadro(c,p,r)).join("");
  box.innerHTML='<div class="r1-pantalla"><div class="r1-cab"><h2 class="r1-titulo">Inicio</h2>'+
    '<div class="r1-chips" role="group" aria-label="Período">'+PERIODOS_R1.map(([k,l])=>'<button type="button" class="r1-chip" data-r1="periodo" data-periodo="'+h(k)+'" aria-pressed="'+h(k===_r1Estado.periodo)+'">'+h(l)+'</button>').join("")+
      '<button type="button" class="r1-chip" data-r1="fechas" aria-pressed="'+h(_r1Estado.periodo==="rango")+'">Fechas</button></div></div>'+
    (_r1Estado.fechas||_r1Estado.periodo==="rango"?'<div class="r1-fechas"><label>Desde<input type="date" id="r1-ini-desde" value="'+h(b.desde)+'"></label>'+
      '<label>Hasta<input type="date" id="r1-ini-hasta" value="'+h(b.hasta)+'"></label><button type="button" class="r1-btn" data-r1="fechas-aplicar">Aplicar</button></div>':'')+
    '<div class="r1-sub">Pipeline · lo vivo hoy</div><div class="r1-cuadros r1-tres">'+cuadros(true)+'</div>'+
    '<div class="r1-sub">'+h(r.label)+' · '+h(r.start)+' → '+h(r.end)+'</div><div class="r1-cuadros">'+cuadros(false)+'</div>'+
    _r1HtmlFranja(p.avisos,true)+'</div>';
}
function renderNegocios(){
  const box=$("mode-negocios");if(!box)return;
  _r1Cablear(box);
  // T3 (arreglo de T2): la caja se arma una sola vez; los repintados (p. ej. al terminar una escritura en segundo
  // plano) sólo cambian la franja, el aviso de unir y la lista: el buscador conserva el foco, el texto y la página.
  if(!box.dataset.r1Armado){
    box.dataset.r1Armado="1";
    box.innerHTML='<div class="r1-pantalla"><div class="r1-cab"><h2 class="r1-titulo">Negocios</h2></div><div id="r1-neg-franja"></div><div id="r1-neg-unir"></div>'+
      '<input type="search" id="r1-neg-buscar" class="r1-buscar" data-r1-buscar="1" placeholder="Buscar cliente o número" autocomplete="off" value="'+h(_r1Estado.filtro.texto)+'">'+
      '<div id="r1-neg-chips" class="r1-chips"></div><div id="r1-neg-resumen"></div><div id="r1-neg-lista" class="r1-lista"></div><div id="r1-neg-mas"></div></div>';
  }
  const buscar=$("r1-neg-buscar");
  if(buscar&&buscar.value!==_r1Estado.filtro.texto)buscar.value=_r1Estado.filtro.texto; // navegar (p. ej. desde un cuadro) sí lo cambia
  const p=proyeccionNegocios();
  $("r1-neg-franja").innerHTML=_r1HtmlFranja(p.avisos,false);
  const u=_r1Estado.unir&&p.porNegocio.get(_r1Estado.unir.origen);
  if(!u)_r1Estado.unir=null;
  $("r1-neg-unir").innerHTML=u?['<div class="r1-unir"><span>🔗 Elige el negocio con el que se une <strong>',h(u.cabeza.client||"—"),'</strong> (',h(u.cabeza.quoteNumber||u.cabeza.id),')</span>',
    '<button type="button" class="r1-btn r1-btn-sec" data-r1="unir-cancelar">Cancelar</button></div>'].join(""):"";
  _r1PintarLista();
}
// Chips, resumen y filas; lo llaman el buscador, los chips y «Ver más» sin recalcular la proyección.
function _r1PintarLista(){
  const p=proyeccionNegocios(),f=_r1Estado.filtro,r=filtrarNegocios(p,f),puede=canCurrentUserWrite();
  const unir=_r1Estado.unir&&_r1Estado.unir.origen,filas=unir?r.filas.filter(n=>n.businessId!==unir):r.filas; // el origen no es destino
  $("r1-neg-chips").innerHTML=CHIPS_R1.filter(c=>c.clave in r.conteos).map(c=>'<button type="button" class="r1-chip" data-r1="chip" data-chip="'+h(c.clave)+'" aria-pressed="'+h(!f.metrica&&c.clave===f.chip)+'">'+h(c.label)+' <span class="r1-chip-n">'+h(r.conteos[c.clave])+'</span></button>').join("");
  const cuadro=f.metrica&&CUADROS_R1.find(c=>c.clave===f.metrica.clave);
  $("r1-neg-resumen").innerHTML=cuadro?'<div class="r1-resumen" data-r1-suma="'+h(r.suma)+'" data-r1-n="'+h(r.filas.length)+'"><span>'+h(cuadro.lab)+(cuadro.pipeline?'':' · '+h(f.metrica.rango.propio?f.metrica.rango.start+' → '+f.metrica.rango.end:f.metrica.rango.label||''))+': <strong>'+h(r.filas.length)+'</strong> · <strong>'+h(fm(r.suma))+'</strong></span>'+
    '<button type="button" class="r1-btn r1-btn-sec" data-r1="quitar-metrica">Quitar filtro</button></div>':'';
  const ver=filas.slice(0,f.pagina*50);
  $("r1-neg-lista").innerHTML=ver.length?ver.map((n,i)=>_r1HtmlFila(n,cuadro&&!unir?r.montos[i]:null,puede,!!unir)).join(""):'<div class="r1-vacio">No hay negocios con este filtro.</div>';
  $("r1-neg-mas").innerHTML=filas.length>ver.length?'<button type="button" class="r1-btn r1-btn-sec r1-mas" data-r1="mas">Ver más ('+h(filas.length-ver.length)+')</button>':'';
}
function accionR1(ds){
  if(!ds)return;
  const f=_r1Estado.filtro;
  if(ds.r1==="accion"){
    if(!canCurrentUserWrite())return;
    const a=ACCIONES_R1[ds.accion],n=proyeccionNegocios().porCabeza.get(ds.kind+"|"+ds.id);
    // Sólo la acción que hoy corresponde a ese negocio (fila o aviso); un botón viejo repinta en vez de abrir.
    if(!a||!n||(n.accion!==ds.accion&&!n.avisos.some(x=>x.accion===ds.accion))){refrescarVistasR1();return}
    a.abrir(n.cabeza.id,n.cabeza.kind);
  }else if(ds.r1==="cuadro"){
    const c=CUADROS_R1.find(x=>x.clave===ds.cuadro);if(!c)return;
    _r1Estado.filtro={chip:null,metrica:{clave:c.clave,rango:rangoInicio(_r1Estado.periodo)},texto:"",pagina:1};_r1Estado.unir=null;
    setMode("negocios");
  }else if(ds.r1==="periodo"){
    if(PERIODOS_R1.some(([k])=>k===ds.periodo)){_r1Estado.periodo=ds.periodo;_r1Estado.fechas=false;_r1Estado.borrador=null;renderInicio()}
  }else if(ds.r1==="fechas"){
    _r1Estado.fechas=true;renderInicio();
  }else if(ds.r1==="fechas-aplicar"){
    const d=$("r1-ini-desde").value,a=$("r1-ini-hasta").value,iso=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&gbDateToIso(new Date(s+"T12:00:00"))===s; // sólo fechas reales (2026-02-31 no)
    if(!iso(d)||!iso(a)||d>a){toast("Elige las dos fechas, con «Desde» igual o antes que «Hasta».","error");return}
    _r1Estado.rango={start:d,end:a,label:"Fechas",propio:true};_r1Estado.periodo="rango";_r1Estado.borrador=null;renderInicio();
  }else if(ds.r1==="chip"){
    f.chip=ds.chip;f.metrica=null;f.pagina=1;_r1PintarLista();
  }else if(ds.r1==="quitar-metrica"){
    f.metrica=null;f.chip="abiertos";f.pagina=1;_r1PintarLista();
  }else if(ds.r1==="mas"){
    f.pagina++;_r1PintarLista();
  }else accionFichaR1(ds); // T3: ficha, reporte y unir/separar
}
function _r1Click(e){const b=e.target&&e.target.closest&&e.target.closest("[data-r1]");if(b)accionR1(b.dataset)}
// Buscador con espera (~200 ms): sólo repinta la lista, no la caja (conserva el foco).
function _r1Input(e){
  const t=e.target;if(!t||!t.dataset)return;
  if(t.id==="r1-ini-desde"||t.id==="r1-ini-hasta"){_r1Estado.borrador={desde:$("r1-ini-desde").value,hasta:$("r1-ini-hasta").value};return}
  if(e.type==="change"||!t.dataset.r1Buscar)return; // el buscador sigue sólo con «input»
  _r1Estado.filtro.texto=t.value;
  clearTimeout(_r1Estado.espera);
  _r1Estado.espera=setTimeout(()=>{_r1Estado.filtro.pagina=1;_r1PintarLista()},200);
}

// ─── Navegación: menú lateral, barra inferior e insignias ──
// La llama renderMode con cada vista (navegar o repintar tras una acción): invalida la proyección,
// marca el destino activo y pone el número de avisos en el menú y en la barra.
function pintarNavR1(m){
  if(!GB_REDISENO_R1)return;
  invalidarProyeccionNegocios();
  const n=proyeccionNegocios().avisos.length;
  for(const id of ["r1-insignia-menu","r1-insignia-barra"]){const b=$(id);if(b){b.textContent=String(n);b.hidden=!n}}
  const destino=m==="inicio"||m==="negocios"?m:m==="ficha"?"negocios":m==="pedidos-hojas"?"imprimir":m==="clientes-directorio"||m==="clientes-ficha"?"clientes":"";
  for(const id of ["r1-menu","r1-barra"]){const box=$(id);if(box&&box.querySelectorAll)box.querySelectorAll("[data-r1-ir]").forEach(b=>b.classList.toggle("is-active",b.dataset.r1Ir===destino))}
  if(destino==="inicio"||destino==="negocios")document.querySelectorAll(".sb-module.is-active").forEach(el=>el.classList.remove("is-active"));
}
// Tras una acción terminada en cualquier pantalla: repinta Inicio, Negocios, la ficha o el reporte si están a la vista y, si no, las insignias.
function refrescarVistasR1(){
  if(!GB_REDISENO_R1)return;
  if(curMode==="inicio"||curMode==="negocios"||curMode==="ficha"||curMode==="herr-ambiguos")renderMode(curMode);
  else pintarNavR1(curMode);
}
// Punto común del refresco (ronda 2 de T2, P2): toda escritura de la app sale por window.fb (cada flujo lo
// desestructura al llamar; la prueba lo verifica sobre todo app-*.js). Con la bandera, sus funciones de escritura
// se envuelven una sola vez: al terminar cada una se programa UN refresco en una macrotarea, que corre después de
// que el flujo copie el cambio en quotesCache (en la continuación de su await). La recarga (loadAllHistory) también
// lo programa. Así ningún flujo necesita su propia llamada. El envoltorio no escribe ni cambia lo que devuelve.
const ESCRITURAS_FB_R1=["setDoc","updateDoc","deleteDoc","addDoc","runTransaction","writeBatch"];
function programarRefrescoR1(){
  if(!GB_REDISENO_R1||_r1Estado.refresco)return;
  _r1Estado.refresco=setTimeout(()=>{_r1Estado.refresco=null;refrescarVistasR1()},0);
}
function vigilarEscriturasR1(fb){
  if(!fb||fb._r1Vigilado)return;
  const tras=p=>{Promise.resolve(p).then(programarRefrescoR1,programarRefrescoR1);return p};
  for(const k of ESCRITURAS_FB_R1){
    const f=fb[k];if(typeof f!=="function")continue;
    fb[k]=k==="writeBatch"?(...a)=>{const b=f(...a),commit=b.commit;b.commit=(...x)=>tras(commit.apply(b,x));return b}:(...a)=>tras(f(...a));
  }
  fb._r1Vigilado=true;
}
// Arranque con la bandera encendida: entradas del menú, barra inferior (bajo 1024 px) y la app abre en Inicio.
function iniciarRedisenoR1(){
  if(!GB_REDISENO_R1)return false;
  vigilarEscriturasR1(window.fb);
  const menu=$("r1-menu");
  if(menu&&menu.hidden){
    menu.innerHTML='<button type="button" class="gb-shell-sidebar__item" data-r1-ir="inicio"><span class="gb-shell-icon">🏠</span><span class="gb-shell-sidebar__label">Inicio</span> <span id="r1-insignia-menu" class="r1-insignia" hidden></span></button>'+
      '<button type="button" class="gb-shell-sidebar__item" data-r1-ir="negocios"><span class="gb-shell-icon">📋</span><span class="gb-shell-sidebar__label">Negocios</span></button>';
    menu.hidden=false;
    menu.addEventListener("click",_r1NavClick);
  }
  // El Dashboard actual sigue como «Tablero anterior»; el módulo viejo deja de llamarse «Inicio» y no repite su sección «Tu día» (T4).
  const tablero=document.querySelector('.sb-submenu a[data-sub="inicio/dashboard"]');if(tablero)tablero.textContent="Tablero anterior";
  const modulo=document.querySelector('.sb-module[data-mod="inicio"] .sb-module__label');if(modulo)modulo.textContent="Tablero";
  const ambiguos=document.querySelector('.sb-submenu a[data-sub="herr/negocios-ambiguos"]');if(ambiguos)ambiguos.hidden=false; // T3: reporte en Herramientas
  const barra=$("r1-barra");
  if(barra&&barra.hidden){barra.hidden=false;barra.addEventListener("click",_r1NavClick);document.body.classList.add("r1-con-barra")}
  setMode("inicio");
  return true;
}
function _r1NavClick(e){
  const b=e.target&&e.target.closest&&e.target.closest("[data-r1-ir]");if(!b)return;
  const ir=b.dataset.r1Ir;
  if(ir==="mas"){if(typeof gbShellMobileOpen==="function")gbShellMobileOpen();return}
  const modo={inicio:"inicio",negocios:"negocios",imprimir:"pedidos-hojas",clientes:"clientes-directorio"}[ir];
  if(modo)setMode(modo);
}

// ═══════════════════════════════════════════════════════════
// v8.0.0 (tramo 3): ficha del negocio (F4), pagos rápidos y estado de cuenta (F6),
// reporte de ambiguos y unir/separar a mano (F1). Mismas reglas que el tramo 2: cada botón de la
// ficha ABRE el flujo existente con la cabeza (la ficha nunca escribe status); las dos únicas
// escrituras propias son guardarProximoContacto y _aplicarNegocioManual, en una transacción que relee.
// ═══════════════════════════════════════════════════════════
const TIPOS_PAGO_R1={anticipo:"Anticipo",parcial:"Pago parcial",abono:"Abono",saldo:"Saldo",devolucion:"Devolución",reposicion_menaje:"Reposición de menaje"};
const MOTIVOS_NEGOCIO_R1={enlace_roto:"Enlace roto",ciclo:"Ciclo",businessId_en_conflicto:"businessId en conflicto",varias_cabezas:"Varios documentos vigentes",sin_cabeza:"Sin documento vigente"};
// Monto con signo para mostrar (−$20.000); siempre recibe un número.
function _r1Plata(n){return n<0?"−"+fm(-n):fm(n)}
// Dinero de la cabeza, todo convertido a número antes de formatear (P-36): lo usan la ficha, el WhatsApp y el PDF.
// saldo = saldoNegocio (saldo canónico con el total normalizado); negativo = a favor del cliente.
function dineroNegocio(q){
  const pagos=getPagos(q).map(p=>{const t=String(p.tipo||"");return {fecha:pagoFechaIso(p.fecha),metodo:String(p.metodo||"Sin especificar"),tipo:Object.prototype.hasOwnProperty.call(TIPOS_PAGO_R1,t)?TIPOS_PAGO_R1[t]:t?pagoTipoLabel(t):"Pago",monto:parseInt(p.monto)||0}});
  return {total:montoNegocio(getDocTotal(q)),cargos:totalCargos(q),descuentos:totalAjustes(q),pagado:totalCobrado(q),saldo:saldoNegocio(q),pagos};
}

// ─── F4: ficha ─────────────────────────────────────────────
function abrirFichaR1(negocioId){
  const n=proyeccionNegocios().porNegocio.get(negocioId);if(!n)return;
  _r1Estado.ficha={businessId:n.businessId,docs:n.documentos.map(q=>q.id)};
  setMode("ficha");
}
// El negocio de la ficha abierta, recalculado con la caché; si su clave cambió (se unió a otro), el que tiene sus documentos.
function negocioDeFicha(){
  const f=_r1Estado.ficha;if(!f)return null;
  const p=proyeccionNegocios();
  let n=p.porNegocio.get(f.businessId);
  if(!n){const ids=new Set(f.docs);n=p.negocios.find(x=>x.documentos.some(q=>ids.has(q.id)))||null}
  if(n)_r1Estado.ficha={businessId:n.businessId,docs:n.documentos.map(q=>q.id)};
  return n;
}
// Cada acción abre la función que ya existe; «escribe» = sólo para quien puede escribir (canCurrentUserWrite).
const ACCIONES_FICHA_R1={
  editar:{label:"✏️ Editar",escribe:true,abrir:(id,kind)=>requestEdit(kind,id)}, // guardar una enviada siempre crea versión nueva (T1)
  perdida:{label:"❌ Perdida",escribe:true,abrir:(id,kind)=>openPerdidaModal(id,kind)},
  proximo:{label:"📅 Próximo contacto",escribe:true,abrir:(id,kind)=>openProximoContactoModal(id,kind,null)},
  pago:{label:"💵 Registrar pago",escribe:true,abrir:(id,kind)=>openPagoModal(id,kind)},
  verpagos:{label:"📒 Ver pagos",escribe:true,abrir:(id,kind)=>openVerPagosModal(id,kind)}, // como v7.9.36: trae botones de edición
  cuenta_wa:{label:"💬 Estado de cuenta",escribe:false,abrir:(id,kind)=>enviarEstadoDeCuentaWA(id,kind)},
  cuenta_pdf:{label:"📄 Estado de cuenta (PDF)",escribe:false,abrir:(id,kind)=>genEstadoDeCuentaPDF(id,kind)},
  pdfs:{label:"📎 PDFs",escribe:false,abrir:(id,kind)=>openPdfHistorialModal(id,kind)},
  duplicar:{label:"Duplicar",escribe:true,abrir:(id,kind)=>openDuplicateModal(kind,id)},
  anular:{label:"Anular",escribe:true,abrir:(id,kind)=>openAnularModal(id,kind)},
  fe:{label:"Registrar FE",escribe:true,abrir:(id,kind)=>openFeModal(id,kind)},
  reactivar:{label:"♻️ Reactivar",escribe:true,abrir:(id,kind)=>openReactivarModal(id,kind)}
};
// Las acciones que corresponden hoy a la cabeza (primero las de la cotización viva); pinta y valida con la misma lista.
// T4: la acción principal (n.accion) no se repite como secundaria; una clave compartida abre el mismo flujo en las dos tablas.
function accionesFicha(n,puede){
  const q=n.cabeza,e=n.etapa,d=dineroNegocio(q),conf=["confirmado","listo","por_cobrar","cerrado"].includes(e),viva=e==="cotizacion";
  const si=[["editar",viva],["perdida",viva],["proximo",viva],["pago",conf&&d.saldo>0],["verpagos",d.pagos.length>0||Array.isArray(q.cargos)&&q.cargos.length>0],
    ["cuenta_wa",conf||d.pagos.length>0],["cuenta_pdf",conf||d.pagos.length>0],["pdfs",Array.isArray(q.pdfHistorial)&&q.pdfHistorial.length>0],
    ["duplicar",true],["anular",canAnular(q)],["fe",n.porFacturar],["reactivar",e==="perdida"]];
  return si.filter(([k,ok])=>ok&&k!==n.accion&&(puede||!ACCIONES_FICHA_R1[k].escribe)).map(([k])=>k);
}
// Historia a partir de los campos que ya existen, en orden de fecha: [fecha AAAA-MM-DD, texto].
function historiaNegocio(n){
  const ev=[],add=(f,t)=>{const x=pagoFechaIso(f);if(x)ev.push([x,t])};
  for(const q of n.documentos){
    const num=q.quoteNumber||q.id,pf=q._isPF||String(q.id).startsWith("GB-PF-");
    const tipo=q.kind==="quote"?(q.parentQuote?"Versión":"Cotización"):pf?(q.supersedes?"Propuesta final regenerada":"Propuesta final"):(q.parentQuote?"Versión de la propuesta":"Propuesta");
    add(dateOfCreation(q),tipo+" "+num+" creada");
    const conf=q.orderData&&q.orderData.fechaAprobacion||q.approvalData&&q.approvalData.fechaAprobacion;
    if(conf)add(conf,"Confirmada ("+num+")");
    if(q.status==="entregado")add(q.fechaEntrega||q.entregaData&&q.entregaData.fechaEntrega||q.eventDate,"Entregada ("+num+")");
    for(const p of getPagos(q)){const m=parseInt(p.monto)||0;add(p.fecha,(m<0?"Devolución ":"Pago ")+_r1Plata(m)+" · "+(p.metodo||"Sin especificar"))}
    for(const c of Array.isArray(q.cargos)?q.cargos:[])if(c&&!c.deletedAt)add(c.fecha,"Cargo por reposición "+fm(parseInt(c.monto)||0));
    for(const x of Array.isArray(q.notasSeguimiento)?q.notasSeguimiento:[])if(x)add(x.fecha,"Nota: "+(x.texto||""));
    if(q.perdidaData)add(q.perdidaData.fecha,"Perdida: "+motivoPerdidaLabel(q.perdidaData));
    if(q.reactivadaData)add(q.reactivadaData.fecha,"Reactivada");
    if(q.status==="anulada")add(q.anuladaData&&q.anuladaData.fecha,"Anulada ("+num+")");
  }
  for(const o of operacionesManuales(n))if(o.at)add(o.at,(o.accion==="separar"?"Separado a mano: ":"Unido a mano: ")+o.motivo);
  return ev.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
}
// Clave de la operación manual de un documento: su opId; un documento sin opId (sólo datos del candidato de la
// ronda 1 de T3, nunca publicado) es su propia operación, así deshacerlo no toca ningún otro.
function _negOpDe(q){const m=q&&q.negocioManual;return m&&m.businessId?(m.opId?"op:"+m.opId:"doc:"+q.id):null}
function _negOpId(){return "neg_"+Date.now()+"_"+Math.random().toString(36).slice(2,11)}
// Operaciones manuales presentes en el negocio; docs = TODOS los documentos de cada una (separar deja parte en otro negocio).
function operacionesManuales(n){
  const ops=new Map();
  for(const q of n.documentos){
    const clave=_negOpDe(q);if(!clave||ops.has(clave))continue;
    const m=q.negocioManual;
    ops.set(clave,{clave,accion:m.accion,businessId:String(m.businessId),motivo:String(m.motivo||""),usuario:String(m.usuario||""),at:String(m.at||""),docs:[]});
  }
  if(ops.size)for(const x of proyeccionNegocios().negocios)for(const q of x.documentos){const o=ops.get(_negOpDe(q));if(o)o.docs.push(q.id)}
  return [...ops.values()];
}
// El documento y los que salen de él en la cadena, con los mismos enlaces que el resolvedor en sus dos direcciones:
// el hijo que nombra al padre (parentQuote, supersedes, sourceProposal) y el hijo que el padre nombra (supersededBy, propFinalRef).
function _negDescendientes(n,d){
  const en=new Set(n.documentos.map(x=>x.id)),hijos=new Map();
  const arista=(padre,hijo)=>{if(padre!==hijo&&en.has(padre)&&en.has(hijo)){if(!hijos.has(padre))hijos.set(padre,[]);hijos.get(padre).push(hijo)}};
  for(const x of n.documentos){for(const k of ENLACES_HACIA_PADRE)arista(x[k],x.id);for(const k of ENLACES_HACIA_HIJO)arista(x.id,x[k])}
  const vistos=new Set(),pila=[d.id];
  while(pila.length){const id=pila.pop();if(vistos.has(id))continue;vistos.add(id);pila.push(...(hijos.get(id)||[]))}
  return n.documentos.filter(x=>vistos.has(x.id));
}
function _r1HtmlFicha(n,puede){
  const q=n.cabeza,e=n.etapa,d=dineroNegocio(q),p=proyeccionNegocios();
  const conf=["confirmado","listo","por_cobrar","cerrado"].includes(e);
  const fila=(c,l,m,txt)=>'<div class="r1-ficha-dinero-fila" data-concepto="'+h(c)+'" data-monto="'+h(m)+'"><span>'+h(l)+'</span><strong>'+h(txt)+'</strong></div>';
  const dinero=[fila("total","Total",d.total,fm(d.total))];
  if(conf||d.pagos.length||d.cargos){
    if(d.cargos)dinero.push(fila("reposicion","Reposición",d.cargos,fm(d.cargos)));
    if(d.descuentos)dinero.push(fila("descuentos","Descuentos",d.descuentos,"−"+fm(d.descuentos)));
    dinero.push(fila("pagado","Pagado",d.pagado,_r1Plata(d.pagado)));
    dinero.push(d.saldo<0?fila("a_favor","Saldo a favor",-d.saldo,fm(-d.saldo)):fila("saldo","Saldo",d.saldo,fm(d.saldo)));
  }
  const acciones=accionesFicha(n,puede),boton=k=>'<button type="button" class="r1-btn r1-btn-sec" data-r1="ficha-accion" data-accion="'+h(k)+'">'+h(ACCIONES_FICHA_R1[k].label)+'</button>';
  const pc=e==="cotizacion"&&q.proximoContacto&&q.proximoContacto.fecha?q.proximoContacto:null;
  const entrega=[];
  if(q.eventDate)entrega.push('<div>📅 '+h(q.eventDate+(q.horaEntrega?" "+q.horaEntrega:""))+'</div>');
  if(q.dir)entrega.push('<div>📍 '+h(q.dir+(q.city?", "+q.city:""))+'</div>');
  if(q.tel)entrega.push('<div>📞 '+h(q.tel)+'</div>');
  for(const x of Array.isArray(q.despachos)?q.despachos:[])if(x)entrega.push('<div>🚚 '+h(String(x.fechaHora||"").replace("T"," ")+" · "+(x.direccion||q.dir||"")+" · "+(x.status||""))+'</div>');
  const rel=[...n.relacionados.map(b=>[b,"Reemplazo"]),...n.gruposDeOpciones.flatMap(g=>g.negocios.filter(b=>b!==n.businessId).map(b=>[b,"Opción del mismo grupo"]))];
  const ops=operacionesManuales(n),conManual=n.documentos.some(x=>x.negocioManual);
  const separables=new Set(puede&&!conManual?n.documentos.filter(x=>!_negDescendientes(n,x).some(y=>y.id===n.businessId)).map(x=>x.id):[]);
  const sec=(titulo,cuerpo)=>['<div class="r1-ficha-sec"><div class="r1-sub">',h(titulo),'</div>',cuerpo,'</div>'].join("");
  return ['<div class="r1-pantalla r1-ficha"><div class="r1-cab"><button type="button" class="r1-btn r1-btn-sec" data-r1="volver">← Negocios</button></div>',
    '<h2 class="r1-titulo">'+h(q.client||"—")+'</h2>',
    '<div class="r1-ficha-etapa"><span class="r1-etapa r1-etapa-'+h(e)+'">'+h(ETAPAS_R1[e])+'</span>'+(n.nivel==="ambiguo"?' <span class="r1-marca">historia incompleta</span>':'')+'</div>',
    '<div class="r1-ficha-nums">'+h(n.documentos.map(x=>x.quoteNumber||x.id).join(" · "))+'</div>',
    pc?'<div class="r1-ficha-pc">Próximo contacto: '+h(pc.fecha)+(pc.nota?' · '+h(pc.nota):'')+'</div>':'',
    '<div class="r1-ficha-dinero">',dinero.join(""),'</div>',
    '<div class="r1-ficha-botones">',puede&&n.accion?_r1Boton(n.accion,q):'',acciones.map(boton).join(""),'</div>',
    sec("Entrega",'<div class="r1-ficha-entrega">'+(entrega.join("")||'<div class="r1-meta">Sin fecha ni dirección</div>')+'</div>'),
    sec("Qué lleva",'<div class="r1-ficha-lleva">'+h(resumenProductos(q)||"Sin descripción")+'</div>'),
    d.pagos.length?sec("Pagos",'<ul>'+d.pagos.map(x=>'<li class="r1-ficha-pago">'+h(x.fecha+" · "+x.metodo+" · "+x.tipo+" · "+_r1Plata(x.monto))+'</li>').join("")+'</ul>'):'',
    sec("Historia",'<ul>'+historiaNegocio(n).map(([f,t])=>'<li class="r1-hist"><span class="r1-hist-f">'+h(f)+'</span> '+h(t)+'</li>').join("")+'</ul>'),
    rel.length?sec("Relacionados",'<ul>'+rel.map(([b,t])=>{const o=p.porNegocio.get(b);return o?'<li><button type="button" class="r1-link" data-r1="ficha" data-negocio="'+h(b)+'">'+h((o.cabeza.quoteNumber||o.cabeza.id)+" · "+(o.cabeza.client||"—")+" · "+ETAPAS_R1[o.etapa])+'</button> <span class="r1-meta">'+h(t)+'</span></li>':''}).join("")+'</ul>'):'',
    sec("Documentos del negocio",['<ul>',n.documentos.map(x=>'<li>'+h((x.quoteNumber||x.id)+" · "+(x.status||"enviada"))+(separables.has(x.id)?' <button type="button" class="r1-btn r1-btn-sec" data-r1="separar" data-id="'+h(x.id)+'">✂️ Separar</button>':'')+'</li>').join(""),'</ul>',
      ops.map(o=>'<div class="r1-ficha-manual">'+h((o.accion==="separar"?"Separado a mano":"Unido a mano")+" el "+o.at.slice(0,10)+" por "+o.usuario+": "+o.motivo+" ("+o.docs.join(", ")+")")+(puede?' <button type="button" class="r1-btn r1-btn-sec" data-r1="deshacer" data-clave="'+h(o.clave)+'">↩️ Deshacer ajuste manual</button>':'')+'</div>').join(""),
      puede&&!conManual?'<button type="button" class="r1-btn r1-btn-sec" data-r1="unir" data-negocio="'+h(n.businessId)+'">🔗 Unir con otro negocio</button>':''].join("")),
  '</div>'].join("");
}
function renderFichaNegocio(){
  const box=$("mode-ficha");if(!box)return;
  _r1Cablear(box);
  const n=negocioDeFicha();
  box.innerHTML=n?_r1HtmlFicha(n,canCurrentUserWrite()):'<div class="r1-pantalla"><div class="r1-vacio">Este negocio ya no está en la lista.</div><button type="button" class="r1-btn r1-btn-sec" data-r1="volver">← Negocios</button></div>';
}
// Botones de la ficha, del reporte y de unir (los de la fila y los avisos siguen en accionR1).
function accionFichaR1(ds){
  if(ds.r1==="ficha")abrirFichaR1(ds.negocio);
  else if(ds.r1==="volver")setMode("negocios");
  else if(ds.r1==="ficha-accion"){
    const n=negocioDeFicha();
    // Sólo una acción que hoy corresponde a la cabeza y al permiso; un botón viejo repinta en vez de abrir.
    if(!n||!accionesFicha(n,canCurrentUserWrite()).includes(ds.accion)){refrescarVistasR1();return}
    ACCIONES_FICHA_R1[ds.accion].abrir(n.cabeza.id,n.cabeza.kind);
  }
  else if(ds.r1==="unir")iniciarUnirR1(ds.negocio);
  else if(ds.r1==="unir-destino")pedirUnirR1(ds.negocio);
  else if(ds.r1==="unir-cancelar"){const o=_r1Estado.unir&&_r1Estado.unir.origen;_r1Estado.unir=null;if(o&&proyeccionNegocios().porNegocio.get(o))abrirFichaR1(o);else renderNegocios()}
  else if(ds.r1==="separar")pedirSepararR1(ds.id);
  else if(ds.r1==="deshacer")pedirDeshacerR1(ds.clave);
}

// ─── F1: reporte de negocios ambiguos (Herramientas) ─────
function renderReporteAmbiguos(){
  const box=$("mode-herr-ambiguos");if(!box)return;
  _r1Cablear(box);
  const puede=canCurrentUserWrite(),amb=proyeccionNegocios().negocios.filter(n=>n.nivel==="ambiguo");
  const enlaces=q=>["parentQuote","supersedes","sourceProposal","supersededBy","propFinalRef"].filter(k=>q[k]).map(k=>" · "+k+" → "+q[k]).join("");
  box.innerHTML=['<div class="r1-pantalla"><div class="r1-cab"><h2 class="r1-titulo">Negocios ambiguos</h2></div>',
    '<p class="r1-meta">Negocios cuya historia no se pudo armar sola (enlace roto, ciclo, businessId en conflicto o varios documentos vigentes). Revísalos y, si hace falta, únelos a mano.</p>',
    amb.length?'':'<div class="r1-vacio">No hay negocios ambiguos ✓</div>',
    '<div class="r1-lista">',amb.map(n=>['<div class="r1-fila r1-incompleta" data-negocio="',h(n.businessId),'"><div class="r1-cli"><strong>',h(n.cabeza.client||"—"),'</strong> <span class="r1-marca">',
      h(n.motivos.map(m=>MOTIVOS_NEGOCIO_R1[m]||m).join(" · ")),'</span></div><ul class="r1-docs">',
      n.documentos.map(q=>'<li>'+h((q.quoteNumber||q.id)+" · "+(q.status||"enviada")+enlaces(q))+'</li>').join(""),
      '</ul><div class="r1-accion"><button type="button" class="r1-btn r1-btn-sec" data-r1="ficha" data-negocio="',h(n.businessId),'">Ver ficha</button>',
      puede?' <button type="button" class="r1-btn r1-btn-sec" data-r1="unir" data-negocio="'+h(n.businessId)+'">🔗 Unir con…</button>':'','</div></div>'].join("")).join(""),'</div></div>'].join("");
}

// ─── F6: estado de cuenta (WhatsApp y PDF) ─────────────────
// Números del negocio, de la misma proyección que la ficha: la cabeza (destacada) y los demás documentos de la cadena
// (referencia en una línea «Documentos: …»), en orden cronológico y sin repetir. Cada número en un solo renglón.
function numerosEstadoDeCuenta(q){
  const num=x=>String(x.quoteNumber||x.id).replace(/[\s\u0000-\u001f\u007f-\u009f]+/g," ").trim();
  const numero=num(q),n=proyeccionNegocios().porCabeza.get(q.kind+"|"+q.id);
  return {numero,otros:[...new Set(n?n.documentos.map(num):[])].filter(x=>x!==numero)};
}
// Texto plano para la ventana de WhatsApp existente (textarea y wa.me, no HTML).
function textoEstadoDeCuenta(q){
  const d=dineroNegocio(q),dmy=s=>String(s||"").slice(0,10).split("-").reverse().join("/"),{numero,otros}=numerosEstadoDeCuenta(q);
  const l=["Hola "+(q.client||"")+", te compartimos el estado de cuenta de tu pedido "+numero+" con Gourmet Bites:"];
  if(otros.length)l.push("Documentos: "+otros.join(" · "));
  l.push("","Total del evento: "+fm(d.total));
  if(d.cargos)l.push("Reposición de menaje: "+fm(d.cargos));
  if(d.descuentos)l.push("Descuentos: −"+fm(d.descuentos));
  l.push("","Pagos recibidos:");
  if(d.pagos.length)for(const p of d.pagos)l.push("• "+dmy(p.fecha)+" · "+p.metodo+" · "+p.tipo+" · "+_r1Plata(p.monto));
  else l.push("Aún no hay pagos registrados.");
  l.push("","Total pagado: "+_r1Plata(d.pagado),d.saldo>0?"Saldo pendiente: "+fm(d.saldo):d.saldo<0?"Saldo a favor: "+fm(-d.saldo):"Saldo: "+fm(0));
  if(GB_DATOS_PAGO)l.push("","Datos de pago:\n"+GB_DATOS_PAGO);
  l.push("","¡Muchas gracias! 🙏");
  return l.join("\n");
}
// Reutiliza la ventana de WhatsApp de saldo (se puede corregir antes de enviar) con el texto del estado de cuenta y q.tel.
function enviarEstadoDeCuentaWA(docId,kind){
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);if(!q)return;
  openSaldoWhatsAppModal(q.id,q.kind);
  $("wa-saldo-msg").value=textoEstadoDeCuenta(q);
  const tel=String(q.tel||"").replace(/\D/g,"");if(tel)$("wa-saldo-tel").value=tel;
}
// PDF «Estado de cuenta» con el encabezado y el pie compartidos (gbPdfHeader/gbPdfFooter), cuerpo propio (no el de
// la cuenta de cobro de reposición), sin consecutivo y sin copia en Storage: sólo se descarga.
function genEstadoDeCuentaPDF(docId,kind){
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);if(!q)return;
  if(!window.jspdf||!window.jspdf.jsPDF){alert("jsPDF no cargado");return}
  try{
    const d=dineroNegocio(q),{numero:num,otros}=numerosEstadoDeCuenta(q),mg=16,tw=215.9-mg*2;
    const dmy=s=>String(s||"").slice(0,10).split("-").reverse().join("/");
    const docPdf=new window.jspdf.jsPDF("p","mm","letter");
    let y=gbPdfHeader(docPdf,{titulo:"ESTADO DE CUENTA",tituloSize:13,numero:num+" · corte "+dmy(gbTodayIso())})+9;
    docPdf.setFont("helvetica","normal");docPdf.setFontSize(10);docPdf.setTextColor(26,26,26);
    docPdf.text("Cliente: "+String(q.client||""),mg,y);y+=5;
    if(otros.length){const ls=docPdf.splitTextToSize("Documentos: "+otros.join(" · "),tw);docPdf.text(ls,mg,y);y+=ls.length*5}
    if(q.eventDate){docPdf.text("Fecha del evento: "+dmy(q.eventDate),mg,y);y+=5}
    const filas=[["Total del evento",fm(d.total)]];
    if(d.cargos)filas.push(["Reposición de menaje",fm(d.cargos)]);
    if(d.descuentos)filas.push(["Descuentos","−"+fm(d.descuentos)]);
    filas.push(["Total pagado",_r1Plata(d.pagado)],d.saldo>0?["Saldo pendiente",fm(d.saldo)]:d.saldo<0?["Saldo a favor",fm(-d.saldo)]:["Saldo",fm(0)]);
    const estilo={theme:"grid",margin:{left:mg,right:mg,bottom:20},headStyles:{fillColor:[201,169,110],textColor:[26,26,26],fontSize:9},bodyStyles:{fontSize:9,textColor:[40,40,40]}};
    docPdf.autoTable({...estilo,startY:y+3,head:[["Concepto","Valor"]],body:filas,columnStyles:{0:{cellWidth:tw*.6},1:{halign:"right"}}});
    y=docPdf.lastAutoTable.finalY+8;
    docPdf.setFont("helvetica","bold");docPdf.setFontSize(10);docPdf.text("Pagos",mg,y);y+=3;
    if(d.pagos.length){
      docPdf.autoTable({...estilo,startY:y,head:[["Fecha","Método","Tipo","Monto"]],body:d.pagos.map(p=>[dmy(p.fecha),p.metodo,p.tipo,_r1Plata(p.monto)]),columnStyles:{3:{halign:"right"}}});
      y=docPdf.lastAutoTable.finalY+8;
    }else{docPdf.setFont("helvetica","normal");docPdf.text("Aún no hay pagos registrados.",mg,y+4);y+=12}
    if(GB_DATOS_PAGO){
      const ls=docPdf.splitTextToSize(GB_DATOS_PAGO,tw);
      if(y+6+ls.length*4>255){docPdf.addPage();y=20}
      docPdf.setFont("helvetica","bold");docPdf.setFontSize(9);docPdf.text("Datos de pago",mg,y);y+=4.5;
      docPdf.setFont("helvetica","normal");docPdf.setFontSize(8.5);docPdf.text(ls,mg,y);
    }
    gbPdfFooter(docPdf,{numerar:true});
    const seguro=s=>String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-zA-Z0-9-]/g,"_");
    docPdf.save("Estado_de_cuenta_"+seguro(q.client||"sin")+"_"+seguro(num)+".pdf");
  }catch(e){
    console.error("[genEstadoDeCuentaPDF]",e);
    toast("No se generó el estado de cuenta: "+gbMensajeError(e),"error");
  }
}

// ─── F6: chips de método en la ventana de pago ─────────────
// openPagoModal lo llama al abrir (todas las pantallas). El <select id="pm-metodo"> sigue siendo la fuente del valor
// (_submitPagoImpl no cambia): los chips sólo lo escriben. Sin método elegido no hay chip marcado (sigue obligatorio).
function pintarChipsMetodoR1(){
  const sel=$("pm-metodo"),box=$("pm-metodo-chips");
  if(!GB_REDISENO_R1||!sel||!box)return;
  if(!box.dataset.r1Cableado){box.dataset.r1Cableado="1";box.addEventListener("click",_r1ChipMetodoClick)}
  box.innerHTML=[...sel.options].filter(o=>o.value).map(o=>'<button type="button" class="r1-chip" data-metodo="'+h(o.value)+'" aria-pressed="'+h(o.value===sel.value)+'">'+h(o.textContent)+'</button>').join("");
  box.hidden=false;sel.hidden=true;
}
function _r1ChipMetodoClick(e){
  const b=e.target&&e.target.closest&&e.target.closest("[data-metodo]");if(!b)return;
  $("pm-metodo").value=b.dataset.metodo;
  pintarChipsMetodoR1();
}

// ─── F5 en la ficha: próximo contacto ─────────────────────
// Misma forma que T1 ({fecha, nota ≤ 140, usuario, at}; borrar = null, nunca deleteField). Sólo escribe ese campo.
async function guardarProximoContacto(docId,kind,pc){
  if(!canCurrentUserWrite())return false;
  if(!cloudOnline){toast("Sin conexión.","error");return false}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);if(!q)return false;
  const {db,doc,runTransaction,serverTimestamp}=window.fb;
  const ref=doc(db,getCollectionName(docId,kind),docId);
  try{
    await runTransaction(db,async tx=>{
      const s=await tx.get(ref);
      if(!s.exists())throw _negError("El documento ya no existe; no se guardó el próximo contacto.");
      const fresco={...s.data(),kind};
      // La regla (sólo en la cotización viva) se aplica al documento que se escribe, también al borrar: otra sesión pudo aprobarla o perderla.
      if(!isFollowable(fresco)||getFollowUp(fresco)==="perdida")throw _negError("La cotización ya no está viva (otra sesión la aprobó, la anuló o la marcó perdida); no se guardó el próximo contacto.");
      tx.update(ref,{proximoContacto:pc,updatedAt:serverTimestamp(),...auditStamp()});
    });
    q.proximoContacto=pc;invalidarProyeccionNegocios();
    toast(pc?"📅 Próximo contacto guardado":"Próximo contacto quitado","success");
    return true;
  }catch(e){
    toast("No se guardó el próximo contacto: "+gbMensajeError(e),"error",8000);
    return false;
  }
}

// ─── F1: unir / separar / deshacer a mano ─────────────────
// negocioManual = {opId, businessId, accion "unir"|"separar", motivo, usuario, at}; deshacer = null. Sólo cambia cómo se
// agrupan en la ficha y en la lista: nunca números, status, dinero, PDFs ni el businessId original. Invariantes:
//  · Cada operación tiene un opId único en todos sus documentos; deshacer escribe null exactamente en los que lo llevan.
//  · Unir marca TODOS los documentos del origen y del destino; separar, TODOS los del negocio (la rama con el id del
//    documento, lo que queda con su clave). Así un negocio con cualquier documento marcado no admite otra operación
//    hasta deshacerla, y dos operaciones que comparten negocio escriben un documento común (Firestore las serializa).
//  · La transacción relee cada documento que escribe y aborta sin escribir si alguno ya no existe, no cumple la regla de
//    la operación con lo releído (sin ajuste manual; al deshacer, el mismo opId) o cambió en lo que decide el agrupamiento
//    (CAMPOS_FIRMA_R1) desde que se leyó la caché.
const CAMPOS_FIRMA_R1=["status","client","businessId","negocioManual","parentQuote","supersedes","sourceProposal","supersededBy","propFinalRef","replacedBy","replaces","optionGroupId"];
function _negFirma(q){return gbStableJson(CAMPOS_FIRMA_R1.map(k=>q[k]===undefined?null:q[k]))}
function _negError(m){return Object.assign(new Error(m),{paraUsuario:true})}
function _negUsuario(){return (currentUser&&(currentUser.email||currentUser.displayName))||""}
function _negMotivo(m){const t=String(m||"").trim();if(t.length<5)throw _negError("Escribe el motivo (al menos 5 caracteres).");return t.slice(0,200)}
function _negMismoCliente(a,b){const k=n=>_r1Norm(n.cabeza.client).replace(/\s+/g," ").trim();return k(a)===k(b)}
function _negPermiso(){if(!canCurrentUserWrite())throw _negError("Sólo un administrador puede unir, separar o deshacer negocios.")}
async function unirNegocios(origenId,destinoId,motivo,opts){
  _negPermiso();
  const p=proyeccionNegocios(),a=p.porNegocio.get(origenId),b=p.porNegocio.get(destinoId);
  if(!a||!b||a===b)throw _negError("Elige dos negocios distintos.");
  motivo=_negMotivo(motivo);
  const todos=[...a.documentos,...b.documentos];
  if(todos.some(q=>q.negocioManual))throw _negError("Uno de los dos negocios ya tiene un ajuste manual: deshazlo primero.");
  const mismo=_negMismoCliente(a,b);
  if(!mismo&&!(opts&&opts.clientesDistintos===true))throw _negError("Los clientes no coinciden: confirma que quieres unirlos de todos modos.");
  const valor={opId:_negOpId(),businessId:b.businessId,accion:"unir",motivo,usuario:_negUsuario(),at:new Date().toISOString()};
  await _aplicarNegocioManual("negocioUnir",todos.map(q=>[q,valor]),_negSinAjuste,{origen:a.businessId,destino:b.businessId,motivo,clientesDistintos:!mismo});
}
async function separarDocumento(negocioId,docId,motivo){
  _negPermiso();
  const n=proyeccionNegocios().porNegocio.get(negocioId),d=n&&n.documentos.find(q=>q.id===docId);
  if(!d)throw _negError("El documento ya no está en ese negocio. Recarga el historial.");
  motivo=_negMotivo(motivo);
  if(n.documentos.some(q=>q.negocioManual))throw _negError("Este negocio ya tiene un ajuste manual: deshazlo primero.");
  const sale=_negDescendientes(n,d);
  if(sale.some(q=>q.id===n.businessId))throw _negError("Separar ese documento dejaría el negocio igual.");
  const base={opId:_negOpId(),accion:"separar",motivo,usuario:_negUsuario(),at:new Date().toISOString()};
  const cambios=[...sale.map(q=>[q,{...base,businessId:d.id}]),...n.documentos.filter(q=>!sale.includes(q)).map(q=>[q,{...base,businessId:n.businessId}])];
  await _aplicarNegocioManual("negocioSeparar",cambios,_negSinAjuste,{negocio:n.businessId,documento:d.id,motivo});
}
async function deshacerAjusteManual(negocioId,clave,motivo){
  _negPermiso();
  const n=proyeccionNegocios().porNegocio.get(negocioId),op=n&&operacionesManuales(n).find(o=>o.clave===clave);
  if(!op)throw _negError("Ese ajuste manual ya no está en el negocio. Recarga el historial.");
  motivo=_negMotivo(motivo);
  const docs=proyeccionNegocios().negocios.flatMap(x=>x.documentos).filter(q=>_negOpDe(q)===clave);
  const mismaOp=(fresco,q)=>_negOpDe({...fresco,id:q.id})===clave?null:"ya no tiene ese ajuste manual (otra sesión lo cambió); no se cambió nada. Recarga el historial.";
  await _aplicarNegocioManual("negocioDeshacer",docs.map(q=>[q,null]),mismaOp,{negocio:n.businessId,accion:op.accion,destino:op.businessId,motivo});
}
// Regla de unir y separar sobre lo releído: ningún documento tocado puede tener ya un ajuste manual.
function _negSinAjuste(fresco){return fresco.negocioManual?"ya tiene un ajuste manual de otra sesión; no se cambió nada. Recarga el historial y deshaz ese ajuste primero.":null}
// cambios = [[documento de la caché, valor nuevo de negocioManual]]; regla(releído, documento de la caché) → texto del motivo para abortar o null.
async function _aplicarNegocioManual(operacion,cambios,regla,payload){
  _negPermiso();
  if(!cloudOnline)throw _negError("Sin conexión: no se cambió nada.");
  const {db,doc,runTransaction,serverTimestamp}=window.fb;
  const leer=cambios.map(([q])=>({q,ref:doc(db,getCollectionName(q.id,q.kind),q.id),firma:_negFirma(q)}));
  const antes=cambios.map(([q])=>({id:q.id,kind:q.kind,negocioManual:q.negocioManual||null}));
  const despues=cambios.map(([q,v])=>({id:q.id,kind:q.kind,negocioManual:v}));
  await logOperacion({operacion,docId:cambios[0][0].id,docKind:cambios[0][0].kind,payload:{...payload,antes,despues},runner:async()=>{
    await runTransaction(db,async tx=>{
      const snaps=[];
      for(const x of leer)snaps.push(await tx.get(x.ref)); // todas las lecturas antes de la primera escritura
      leer.forEach((x,i)=>{
        const num=x.q.quoteNumber||x.q.id;
        if(!snaps[i].exists())throw _negError(num+" ya no existe; no se cambió nada. Recarga el historial.");
        const fresco=snaps[i].data(),falla=regla(fresco,x.q);
        if(falla)throw _negError(num+" "+falla);
        if(_negFirma(fresco)!==x.firma)throw _negError("Otra sesión cambió "+num+"; no se cambió nada. Recarga el historial, revisa el negocio y vuelve a intentarlo.");
      });
      cambios.forEach(([,v],i)=>tx.update(leer[i].ref,{negocioManual:v,updatedAt:serverTimestamp(),...auditStamp()}));
    });
    return {payloadExtra:{documentos:cambios.length}};
  }});
  for(const [q,v] of cambios)q.negocioManual=v; // la caché sólo cambia si la transacción confirmó
  invalidarProyeccionNegocios(); // la agrupación cambió: nadie debe leer la proyección vieja antes del repintado
}
// Ventana de confirmación con el motivo (obligatorio); devuelve el texto o null si se cancela.
async function _r1PedirMotivo(o){
  const ok=await confirmModal({title:o.titulo,body:o.cuerpo+'<label class="r1-motivo-lbl" for="r1-manual-motivo">Motivo (obligatorio)</label><textarea id="r1-manual-motivo" class="r1-motivo" maxlength="200"></textarea>',okLabel:o.ok,tone:o.tono||"warn"});
  if(!ok)return null;
  const el=$("r1-manual-motivo");
  return el?el.value:"";
}
// Unir desde la ficha o el reporte: Negocios en modo «elegir destino» (el mismo buscador y la misma lista).
function iniciarUnirR1(negocioId){
  if(!canCurrentUserWrite()||!proyeccionNegocios().porNegocio.get(negocioId))return;
  _r1Estado.unir={origen:negocioId};
  _r1Estado.filtro={chip:null,metrica:null,texto:"",pagina:1};
  setMode("negocios");
}
// v8.0.4: desde la ficha del cliente, sus negocios perdidos (chip «Perdidas» + su nombre en la búsqueda).
function verPerdidasCliente(nombre){
  _r1Estado.filtro={chip:"perdidas",metrica:null,texto:String(nombre||""),pagina:1};_r1Estado.unir=null;
  setMode("negocios");
}
async function pedirUnirR1(destinoId){
  const p=proyeccionNegocios(),a=_r1Estado.unir&&p.porNegocio.get(_r1Estado.unir.origen),b=p.porNegocio.get(destinoId);
  if(!a||!b||a===b||!canCurrentUserWrite())return false;
  const mismo=_negMismoCliente(a,b);
  const cuerpo=['<p>Los documentos de <strong>',h(a.cabeza.client||"—"),'</strong> (',h(a.documentos.map(q=>q.quoteNumber||q.id).join(", ")),') pasan a verse en el negocio de <strong>',
    h(b.cabeza.client||"—"),'</strong> (',h(b.cabeza.quoteNumber||b.cabeza.id),'). No cambia números, estados, dinero ni PDFs.</p>',
    mismo?'':'<p class="r1-alerta"><strong>Los clientes no coinciden: ¿unir de todos modos?</strong></p>'].join("");
  const motivo=await _r1PedirMotivo({titulo:"🔗 Unir negocios",cuerpo,ok:mismo?"Unir":"Sí, unir de todos modos",tono:mismo?"warn":"danger"});
  if(motivo==null)return false;
  try{
    showLoader("Uniendo…");
    await unirNegocios(a.businessId,b.businessId,motivo,{clientesDistintos:!mismo});
    hideLoader();
    _r1Estado.unir=null;
    toast("🔗 Negocios unidos","success");
    abrirFichaR1(b.businessId);
    return true;
  }catch(e){hideLoader();toast("No se unieron: "+gbMensajeError(e),"error",8000);return false}
}
async function pedirSepararR1(docId){
  const n=negocioDeFicha(),d=n&&n.documentos.find(q=>q.id===docId);
  if(!d||!canCurrentUserWrite())return false;
  const cuerpo=['<p><strong>',h(_negDescendientes(n,d).map(q=>q.quoteNumber||q.id).join(", ")),'</strong> pasa a un negocio aparte. No cambia números, estados, dinero ni PDFs.</p>'].join("");
  const motivo=await _r1PedirMotivo({titulo:"✂️ Separar documento",cuerpo,ok:"Separar"});
  if(motivo==null)return false;
  try{
    showLoader("Separando…");
    await separarDocumento(n.businessId,d.id,motivo);
    hideLoader();toast("✂️ "+(d.quoteNumber||d.id)+" ahora es un negocio aparte","success");
    return true;
  }catch(e){hideLoader();toast("No se separó: "+gbMensajeError(e),"error",8000);return false}
}
async function pedirDeshacerR1(clave){
  const n=negocioDeFicha(),op=n&&operacionesManuales(n).find(o=>o.clave===clave);
  if(!op||!canCurrentUserWrite())return false;
  const motivo=await _r1PedirMotivo({titulo:"↩️ Deshacer ajuste manual",cuerpo:['<p><strong>',h(op.docs.join(", ")),'</strong> vuelven a agruparse por sus enlaces.</p>'].join(""),ok:"Deshacer"});
  if(motivo==null)return false;
  try{
    showLoader("Deshaciendo…");
    await deshacerAjusteManual(n.businessId,op.clave,motivo);
    hideLoader();toast("↩️ Ajuste manual deshecho","success");
    return true;
  }catch(e){hideLoader();toast("No se deshizo: "+gbMensajeError(e),"error",8000);return false}
}
