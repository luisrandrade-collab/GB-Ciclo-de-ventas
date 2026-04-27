// ═══════════════════════════════════════════════════════════
// app-historial.js · v6.0.0 · 2026-04-23
// Historial + ciclo de vida (order/approve/saldo) + pagos +
// duplicar + features v4.12: foto entrega, notas producción,
// notas entrega, quién entregó, recibido conforme, comentarios cliente.
// v5.0.1b: filtro "Convertidas" oculta por default + badge "origen de PF".
// v5.0.2: badge "pendiente sync" + marcar needsSync al confirmar pedido/aprobada.
// v5.0.3: botón ↩️ Anular + modal + filtro Anuladas + devolución opcional.
// v5.0.4: filtro "Pedidos" consolidado (pedido+aprobada+en_produccion) +
//         badge followUp + exclusión de perdidas en el "Todas".
// v5.0.5: filtro "Vivas" + badge binario VIVA/PERDIDA + bloqueo conversión
//         perdida→pedido + botón ♻️ Reactivar en perdidas.
// v5.1.0: 4 sub-pestañas (Vivas/Pedidos/Perdidas/Anuladas) + buscador por
//         palabras + botones rápidos 🟢 Viva / ❌ Perdida en tarjetas +
//         adjuntar comprobante después del pago.
// v5.5.0: matriz de edición permisiva + botón ✏️ según canEdit + modal
//         advertencia requestEdit + botón 🕒 timeline de cambios.
// v6.0.0: 5ta pestaña "📦 Ventas anteriores" (pedidos cumplidos = entregado
//         + pagado completo) con filtros por año. Toggle "Incluir cumplidas"
//         en Pedidos → Entregadas. Botón ↩️ Anular ahora respeta canAnular()
//         que bloquea si el pedido ya fue cobrado al 100%. Defensa doble
//         en openAnularModal.
// ═══════════════════════════════════════════════════════════

const METODOS_PAGO=["Efectivo","Nequi","Daviplata","Banco Falabella","Transferencia","Otro"];

// ─── PAGOS: helpers (migración + cálculos) ─────────────────
function getPagos(q){
  if(Array.isArray(q.pagos)&&q.pagos.length)return q.pagos;
  const out=[];
  const ant=q.approvalData?.anticipo||q.orderData?.anticipo;
  const antMet=q.approvalData?.metodoPago||q.orderData?.metodoPago||"Sin especificar";
  const antFecha=q.approvalData?.fechaAprobacion||q.orderData?.fechaAprobacion;
  if(ant>0&&antFecha)out.push({fecha:antFecha,monto:ant,metodo:antMet,tipo:"anticipo",notas:q.approvalData?.notas||q.orderData?.notas||"",legacy:true});
  if(q.saldoData?.monto>0)out.push({fecha:q.saldoData.fecha,monto:q.saldoData.monto,metodo:q.saldoData.metodoPago||"Sin especificar",tipo:"saldo",notas:q.saldoData.notas||"",legacy:true});
  return out;
}
function totalCobrado(q){return getPagos(q).reduce((s,p)=>s+(parseInt(p.monto)||0),0)}
// v4.12.1: usar getDocTotal — para propuestas viejas sin q.total recalcula igual que el PDF
function saldoPendiente(q){const t=(typeof getDocTotal==="function"?getDocTotal(q):(q.total||q.totalReal||0));return Math.max(0,t-totalCobrado(q))}

// ─── HISTORIAL render ──────────────────────────────────────
// v5.1.0: Sistema de ARCHIVOS + FILTROS + BUSCADOR
//
//   ARCHIVO (histArchive): vista principal. 4 opciones mutuamente exclusivas.
//     - vivas     : cotizaciones/propuestas sin cerrar y NO perdidas
//     - pedidos   : todo lo vendido (pedido, aprobada, en_produccion, entregado)
//     - perdidas  : followUp=perdida
//     - anuladas  : status=anulada
//
//   FILTRO (histFilter): sub-filtro dentro del archivo activo. Depende del archivo:
//     - En "vivas"    : all | cot | prop | propfinal
//     - En "pedidos"  : all | pedido | aprobada | en_produccion | entregado
//     - En "perdidas" : all | precio | competencia | no_respondio | cambio_planes | tiempo | otro
//     - En "anuladas" : all
//
//   BUSCADOR (histSearch): texto libre. Busca en cliente + número + productos.
//     Case-insensitive, sin tildes. Se combina con archivo + filtro.
//
//   Las cotizaciones "convertidas" (status=convertida) quedan ocultas siempre
//   (son referencias históricas a su PF correspondiente, no se muestran).

// Estado global (defaults). Si no existen, se inicializan.
if(typeof histArchive==="undefined")var histArchive="vivas";
if(typeof histFilter==="undefined")var histFilter="all";
if(typeof histSearch==="undefined")var histSearch="";
// v6.0: toggle para incluir cumplidas en "Pedidos → Entregadas"
// (normalmente viven solo en "Ventas anteriores").
// v6.0.2: persiste en localStorage ("gb_hist_incluir_cumplidos") para que
// no se resetee en cada refresh. Si no hay nada guardado, default=false.
if(typeof histIncluirCumplidos==="undefined"){
  try{var histIncluirCumplidos=localStorage.getItem("gb_hist_incluir_cumplidos")==="1";}
  catch(_e){var histIncluirCumplidos=false;}
}

// Normaliza texto: quita tildes, a minúsculas. Para comparar en buscador.
function _normTxt(s){
  return String(s||"").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

// Extrae todo el texto "buscable" de un doc (cliente + número + productos/secciones)
function _docSearchableText(q){
  const parts=[q.client||"",q.quoteNumber||"",q.id||""];
  if(Array.isArray(q.cart))q.cart.forEach(it=>parts.push(it.name||""));
  if(Array.isArray(q.items))q.items.forEach(it=>parts.push(it.name||""));
  if(Array.isArray(q.cust))q.cust.forEach(it=>parts.push(it.name||""));
  if(Array.isArray(q.sections))q.sections.forEach(sec=>{
    parts.push(sec.title||"");
    if(Array.isArray(sec.options))sec.options.forEach(op=>{
      if(Array.isArray(op.items))op.items.forEach(it=>parts.push(it.name||""));
    });
  });
  return _normTxt(parts.join(" "));
}

// ¿El doc pertenece al archivo dado?
// v6.0.0: nuevo archivo "ventas_anteriores" para pedidos cumplidos
// (entregados + pagados completos). Por defecto los cumplidos SALEN
// de "pedidos" y viven SOLO en "ventas_anteriores". El toggle
// histIncluirCumplidos los vuelve a mostrar en "pedidos" (útil para
// búsquedas o chequeos esporádicos sin cambiar de pestaña).
//
// IMPORTANTE sobre los contadores:
//   El parámetro `respectToggle` define si la función respeta el toggle
//   "Incluir cumplidas" de Pedidos. Para la LISTA filtrada pasamos true
//   (si toggle=ON, cumplidas aparecen en Pedidos). Para los CONTADORES
//   de los chips superiores pasamos false → el chip "Pedidos" siempre
//   muestra el conteo operativo (sin cumplidas) y "Ventas anteriores"
//   siempre muestra las cumplidas. Así los 5 chips SIEMPRE suman al
//   total de docs, sin doble conteo cuando el toggle está activo.
function _docEnArchivo(q,arch,respectToggle){
  if(respectToggle===undefined)respectToggle=false;
  const s=q.status||"enviada";
  const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
  if(s==="convertida")return false; // siempre ocultas
  if(arch==="anuladas")return s==="anulada";
  if(s==="anulada")return false;
  if(arch==="perdidas")return fu==="perdida"&&(s==="enviada"||s==="propfinal");
  if(fu==="perdida"&&(s==="enviada"||s==="propfinal"))return false;
  if(arch==="vivas")return ["enviada","propfinal"].includes(s)&&(typeof isFollowable==="function"?isFollowable(q):true);
  // v6.0: "ventas_anteriores" = pedidos cumplidos (entregado + pagado completo)
  if(arch==="ventas_anteriores"){
    return (typeof isCumplido==="function")?isCumplido(q):false;
  }
  if(arch==="pedidos"){
    if(!["pedido","aprobada","en_produccion","entregado"].includes(s))return false;
    // v6.0: excluir cumplidos (viven en ventas_anteriores).
    // El toggle "incluir cumplidas" SOLO afecta la LISTA filtrada,
    // no los contadores de los chips. Así evitamos doble conteo.
    const _cumplido=(typeof isCumplido==="function")&&isCumplido(q);
    if(_cumplido){
      if(respectToggle&&histIncluirCumplidos)return true;
      return false;
    }
    return true;
  }
  return false;
}

// Sub-filtros disponibles por archivo
const HIST_SUBFILTERS={
  vivas:[
    {k:"all",label:"Todas"},
    {k:"cot",label:"Cotizaciones"},
    {k:"prop",label:"Propuestas"},
    {k:"propfinal",label:"P. Final"}
  ],
  pedidos:[
    {k:"all",label:"Todas"},
    {k:"pedido",label:"Pedido"},
    {k:"aprobada",label:"Aprobada"},
    {k:"en_produccion",label:"En producción"},
    {k:"entregado",label:"Entregadas"}
  ],
  perdidas:[
    {k:"all",label:"Todas"},
    {k:"precio",label:"Por precio"},
    {k:"competencia",label:"Por competencia"},
    {k:"no_respondio",label:"No respondió"},
    {k:"cambio_planes",label:"Cambio de planes"},
    {k:"tiempo",label:"Por tiempo"},
    {k:"otro",label:"Otro motivo"}
  ],
  anuladas:[
    {k:"all",label:"Todas"}
  ],
  // v6.0: Ventas anteriores — pedidos cumplidos (entregado + pagado)
  // Permite filtrar por año para no ahogar la lista cuando haya muchos.
  // v6.0.2: se añaden 3 filtros de rango corto (mes actual / últ. 3 meses /
  // últ. 6 meses) para agilizar consultas de corto plazo sin navegar por año.
  ventas_anteriores:[
    {k:"all",label:"Todas"},
    {k:"month_current",label:"Este mes"},
    {k:"last_3m",label:"Últ. 3 meses"},
    {k:"last_6m",label:"Últ. 6 meses"},
    {k:"year_current",label:"Este año"},
    {k:"year_prev",label:"Año anterior"},
    {k:"older",label:"Más antiguas"}
  ]
};

// ¿El doc pasa el sub-filtro activo?
function _docEnSubfiltro(q,arch,filt){
  if(filt==="all")return true;
  const s=q.status||"enviada";
  if(arch==="vivas"){
    if(filt==="cot")return q.kind==="quote";
    if(filt==="prop")return q.kind==="proposal"&&s==="enviada";
    if(filt==="propfinal")return q.kind==="proposal"&&s==="propfinal";
  }
  if(arch==="pedidos"){
    return s===filt;
  }
  if(arch==="perdidas"){
    const motivo=q.perdidaData?.motivo||"otro";
    return motivo===filt;
  }
  // v6.0: Ventas anteriores — filtro por año basado en fecha de entrega
  // v6.0.2: nuevos filtros de rango corto (mes actual / últ. 3m / últ. 6m).
  if(arch==="ventas_anteriores"){
    const fEnt=q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||"";
    if(!fEnt)return false; // sin fecha de entrega no puede evaluarse rango
    const yearDoc=fEnt.slice(0,4);
    const yearNow=new Date().getFullYear();
    if(filt==="year_current")return yearDoc===String(yearNow);
    if(filt==="year_prev")return yearDoc===String(yearNow-1);
    if(filt==="older")return yearDoc!==""&&parseInt(yearDoc,10)<yearNow-1;
    // v6.0.2: rangos cortos
    if(filt==="month_current"){
      const ym=fEnt.slice(0,7);
      const now=new Date();
      const ymNow=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
      return ym===ymNow;
    }
    if(filt==="last_3m"||filt==="last_6m"){
      // Comparamos fechas ISO: fEnt >= hace N meses
      const meses=filt==="last_3m"?3:6;
      const d=new Date();
      d.setMonth(d.getMonth()-meses);
      const cutoff=d.toISOString().slice(0,10);
      return fEnt>=cutoff;
    }
  }
  return true;
}

async function renderHist(){
  const el=$("hist-list");
  el.innerHTML='<div class="empty"><div class="spinner" style="margin:0 auto 10px"></div><p>Cargando historial...</p></div>';
  try{await loadAllHistory()}catch(e){}
  if(!quotesCache.length){el.innerHTML='<div class="empty"><div class="ic">📁</div><p>No hay cotizaciones guardadas</p></div>';return}

  // Contadores por archivo (todos, independiente del sub-filtro/búsqueda)
  // v6.0: añadimos ventas_anteriores (pedidos cumplidos)
  const archCnt={vivas:0,pedidos:0,ventas_anteriores:0,perdidas:0,anuladas:0};
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return; // fantasmas excluidos de contadores
    Object.keys(archCnt).forEach(arch=>{
      if(_docEnArchivo(q,arch))archCnt[arch]++;
    });
  });

  // Filtrar por archivo + sub-filtro + búsqueda
  const searchNorm=_normTxt(histSearch.trim());
  const filtered=quotesCache.filter(q=>{
    if(q._wrongCollection&&histArchive!=="anuladas")return false;
    // v6.0: la lista filtrada SÍ respeta el toggle "incluir cumplidas"
    if(!_docEnArchivo(q,histArchive,true))return false;
    if(!_docEnSubfiltro(q,histArchive,histFilter))return false;
    if(searchNorm){
      const txt=_docSearchableText(q);
      if(!txt.includes(searchNorm))return false;
    }
    return true;
  });

  // Barra de archivos (principal)
  // v6.0: nuevo archivo "Ventas anteriores" (pedidos cumplidos)
  const archMeta={
    vivas:            {label:"🟢 Vivas",            cls:"arch-vivas"},
    pedidos:          {label:"🤝 Pedidos",          cls:"arch-pedidos"},
    ventas_anteriores:{label:"📦 Ventas anteriores",cls:"arch-ventas-ant"},
    perdidas:         {label:"❌ Perdidas",         cls:"arch-perdidas"},
    anuladas:         {label:"↩️ Anuladas",         cls:"arch-anuladas"}
  };
  const archBar='<div class="hist-archives">'+
    Object.keys(archMeta).map(k=>{
      const m=archMeta[k];
      const act=histArchive===k?"act":"";
      return '<button class="hist-archive '+m.cls+' '+act+'" onclick="setHistArchive(\''+k+'\')">'+m.label+
        '<span class="cnt">'+archCnt[k]+'</span></button>';
    }).join("")+
    '</div>';

  // Buscador
  const searchBar='<div class="hist-search-bar">'+
    '<input type="text" id="hist-search-input" class="hist-search-input" placeholder="🔍 Buscar por cliente, número o producto..." value="'+(histSearch||"").replace(/"/g,"&quot;")+'" oninput="onHistSearchInput(event)">'+
    (histSearch?'<button class="hist-search-clear" onclick="clearHistSearch()" title="Limpiar">×</button>':'')+
    '</div>';

  // Sub-filtros del archivo activo
  const subs=HIST_SUBFILTERS[histArchive]||[{k:"all",label:"Todas"}];
  const subCnt={};
  subs.forEach(sf=>{
    subCnt[sf.k]=quotesCache.filter(q=>{
      if(q._wrongCollection&&histArchive!=="anuladas")return false;
      // v6.0: los sub-contadores DEBEN coincidir con la lista que se muestra
      // abajo, así que respetan el toggle "incluir cumplidas". Si el toggle
      // está ON, "Todas" y "Entregadas" muestran el número aumentado.
      return _docEnArchivo(q,histArchive,true)&&_docEnSubfiltro(q,histArchive,sf.k);
    }).length;
  });
  const subBar=subs.length>1?('<div class="hist-subfilters">'+
    subs.map(sf=>'<button class="hist-subfilter '+(histFilter===sf.k?"act":"")+'" onclick="setHistFilter(\''+sf.k+'\')">'+sf.label+
      '<span class="cnt">'+(subCnt[sf.k]||0)+'</span></button>').join("")+
    '</div>'):'';

  // v6.0: toggle "Incluir cumplidas" cuando estás en Pedidos → Entregadas
  // Permite ver los cumplidos mezclados con los entregados con saldo sin
  // cambiar de pestaña, útil para comparar o buscar algo específico.
  let toggleBar='';
  if(histArchive==="pedidos"&&(histFilter==="entregado"||histFilter==="all")){
    const totalCumplidos=archCnt.ventas_anteriores;
    if(totalCumplidos>0){
      const activo=histIncluirCumplidos?"act":"";
      const txt=histIncluirCumplidos
        ?'✅ Mostrando cumplidas ('+totalCumplidos+')'
        :'📦 '+totalCumplidos+' cumplida'+(totalCumplidos!==1?'s':'')+' en Ventas anteriores';
      toggleBar='<div class="hist-toggle-cumplidas">'+
        '<button class="hist-toggle-btn '+activo+'" onclick="toggleIncluirCumplidos()">'+txt+'</button>'+
        (histIncluirCumplidos?'':'<button class="hist-toggle-link" onclick="setHistArchive(\'ventas_anteriores\')">Ver → </button>')+
        '</div>';
    }
  }
  // v6.0: banner descriptivo en Ventas anteriores
  let ventasAntBanner='';
  if(histArchive==="ventas_anteriores"){
    ventasAntBanner='<div class="hist-ventas-ant-info">'+
      '<strong>📦 Ventas anteriores</strong> — Pedidos entregados y pagados completos. '+
      'Archivo de referencia histórica: el trabajo ya cerró financiera y operativamente.'+
      '</div>';
  }

  const header=archBar+searchBar+subBar+toggleBar+ventasAntBanner;

  if(!filtered.length){
    const emptyMsg=histSearch
      ? '<div class="empty"><div class="ic">🔍</div><p>Sin resultados para "<strong>'+histSearch.replace(/[<>]/g,"")+'</strong>"</p><p style="font-size:11px;color:#999">Intenta con otro término o cambia de archivo</p></div>'
      : '<div class="empty"><div class="ic">📭</div><p>No hay documentos en <strong>'+archMeta[histArchive].label+'</strong></p></div>';
    el.innerHTML=header+emptyMsg;
    return;
  }
  const cards=filtered.map(q=>{
    const dObj=q.createdAt?.toDate?.()||new Date(q.dateISO||Date.now());
    const ds=dObj.getDate()+"/"+(dObj.getMonth()+1)+"/"+dObj.getFullYear()+" "+dObj.getHours()+":"+String(dObj.getMinutes()).padStart(2,"0");
    const isProp=q.kind==="proposal";
    const isPF=q._isPF||(q.id&&q.id.startsWith("GB-PF-")&&!q._wrongCollection);
    const qNum=q.quoteNumber||q.id;
    const status=q.status||"enviada";
    const sMeta=STATUS_META[status]||STATUS_META.enviada;
    const statusBadge='<span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span>';
    // v4.12.7: badges de superseded y wrongCollection
    const supersededBadge=(status==="superseded")?'<span class="hc-superseded-badge">⬇️ Reemplazada</span>':'';
    const wrongCollBadge=q._wrongCollection?'<span class="hc-wrong-badge">⚠️ Fantasma</span>':'';
    // v5.0.1b: badge "origen de PF-XXXX" para propuestas convertidas
    const origenPfBadge=(status==="convertida"&&q.propFinalRef)?'<span class="hc-origen-pf">→ origen de '+q.propFinalRef+'</span>':'';
    // v5.0.3: badge Anulada (motivo visible como tooltip)
    const motivoAnulacion=q.anuladaData?.motivoLabel||q.anuladaData?.motivo||"";
    const anuladaBadge=(status==="anulada")?'<span class="hc-anulada-badge" title="'+motivoAnulacion+'">❌ Anulada</span>':'';
    // v5.0.5: badge binario VIVA/PERDIDA (principal) + tag interno contactado/activa
    let followUpBadge="";
    if(typeof isFollowable==="function"&&isFollowable(q)){
      const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
      const ec=typeof estadoComercial==="function"?estadoComercial(q):(fu==="perdida"?"perdida":"viva");
      const ecMeta=(typeof ESTADO_COMERCIAL_META!=="undefined"&&ESTADO_COMERCIAL_META[ec])||{label:ec,cls:ec,emoji:""};
      followUpBadge='<span class="hc-estado-badge '+ecMeta.cls+'" title="Estado comercial">'+ecMeta.emoji+' '+ecMeta.label+'</span>';
      // Tag interno opcional (contactado/activa) — solo si es viva y no está en default
      if(ec==="viva"&&fu!=="pendiente"&&FOLLOW_UP_META[fu]){
        const meta=FOLLOW_UP_META[fu];
        followUpBadge+='<span class="hc-follow-badge '+meta.cls+'" title="'+meta.desc+'">'+meta.emoji+' '+meta.label+'</span>';
      }
    }
    const _pagos=getPagos(q);
    const _cobrado=totalCobrado(q);
    const _saldo=saldoPendiente(q);
    const _total=q.total||0;
    const pagadoBadge=(_total>0&&_cobrado>=_total)?'<span class="hc-pagado-ok">💰 Pagado ✓</span>':(q.saldoData?'<span class="hc-saldo-ok">💰 Saldo ✓</span>':'');
    const prodBadge=q.produced?'<span class="hc-prod-ok">🔪 Producido</span>':'';
    const comentBadge=q.comentarioCliente?.texto?'<span class="hc-coment-ok">💬 Comentario</span>':'';
    // v5.0.2: badge sync pendiente / sync OK (solo en docs agendables con fecha futura)
    let syncBadge="";
    if(typeof isAgendable==="function"&&isAgendable(q)){
      if(q.needsSync)syncBadge='<span class="hc-sync-pending">📤 Pendiente sync</span>';
      else if(q.lastSyncAt)syncBadge='<span class="hc-sync-ok">✓ Sync</span>';
    }
    const actionBtns=[];
    // v5.0.5: Si es followable y está perdida, bloqueamos conversión.
    // Solo se ofrece ♻️ Reactivar (viva) o editar.
    const _esPerdida=typeof isPerdida==="function"&&isPerdida(q);
    const _esFollowable=typeof isFollowable==="function"&&isFollowable(q);
    // v5.1.0: Botones rápidos 🟢 Viva / ❌ Perdida para docs followable no perdidos.
    // Permite marcar el estado comercial desde la tarjeta sin ir a Seguimiento.
    if(_esFollowable&&!_esPerdida){
      const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
      const vivaLabel=fu==="activa"?"🟢 Activa ✓":(fu==="contactado"?"🟢 Marcar activa":"🟢 Viva");
      actionBtns.push('<button class="btn hc-btn-viva-quick" onclick="quickMarkViva(\''+q.id+'\',\''+q.kind+'\',event)" title="Marcar como viva/activa">'+vivaLabel+'</button>');
      actionBtns.push('<button class="btn hc-btn-perdida-quick" onclick="openPerdidaModal(\''+q.id+'\',\''+q.kind+'\');event.stopPropagation();" title="Marcar como perdida">❌ Perdida</button>');
    }
    // v5.5.0: Botón ✏️ Editar según matriz de edición
    // Aparece en cotizaciones: enviada, pedido, en_produccion, entregado
    // Aparece en propuestas: enviada, propfinal, aprobada, en_produccion, entregado
    // NO aparece: anulada, convertida, superseded
    const _editable=(typeof canEdit==="function")?canEdit(q):false;
    if(_editable&&!isPF){
      // FIX #1: si status requiere advertencia, usar handler que muestra modal primero
      const _statusLbl=(STATUS_META[q.status||"enviada"]?.label)||"";
      const _needsWarn=(typeof requiresWarning==="function"&&requiresWarning(q));
      const _onclick=_needsWarn
        ?'event.stopPropagation();requestEdit(\''+q.kind+'\',\''+q.id+'\')'
        :'event.stopPropagation();loadQuote(\''+q.kind+'\',\''+q.id+'\')';
      actionBtns.push('<button class="btn hc-btn-edit" onclick="'+_onclick+'" title="Editar '+_statusLbl+'">✏️ Editar</button>');
    }
    // v5.5.0: Botón 🕒 historial de cambios — solo si hay editHistory
    if(Array.isArray(q.editHistory)&&q.editHistory.length>0){
      actionBtns.push('<button class="btn hc-btn-timeline" onclick="event.stopPropagation();openEditHistoryModal(\''+q.id+'\',\''+q.kind+'\')" title="Historial de cambios">🕒 '+q.editHistory.length+'</button>');
    }
    // Ciclo de vida según tipo + status
    if(!isProp&&status==="enviada"){
      // v5.0.5: solo ofrecer "Marcar como pedido" si NO está perdida
      if(!_esPerdida){
        actionBtns.push('<button class="btn hc-btn-order" onclick="openOrderModal(\''+q.id+'\',event)">✅ Marcar como pedido</button>');
      }else{
        actionBtns.push('<button class="btn hc-btn-reactivar" onclick="openReactivarModal(\''+q.id+'\',\'quote\',event)">♻️ Reactivar</button>');
      }
    }else if(!isProp&&(status==="pedido"||status==="en_produccion")){
      if(!q.eventDate)actionBtns.push('<button class="btn hc-btn-order" onclick="assignDeliveryDate(\''+q.id+'\',event)">📅 Asignar fecha de entrega</button>');
      // E1.1: botón "Iniciar producción" solo si status==='pedido' y no está ya producido.
      if(status==="pedido"&&!q.produced)actionBtns.push('<button class="btn hc-btn-order" style="background:#FFF3E0;color:#E65100;border-color:#FFB74D" onclick="markAsInProduction(\''+q.id+'\',\'quote\',event)">🔥 Iniciar producción</button>');
      // v7.0-α FIX-02b: si NO producido → botón normal "Marcar producido". Si SÍ producido →
      // botón verde "Producido ✓" clickeable para desmarcar (con confirm).
      if(!q.produced)actionBtns.push('<button class="btn hc-btn-edit" onclick="toggleProduced(\''+q.id+'\',\'quote\',event)">🔪 Marcar producido</button>');
      else actionBtns.push('<button class="btn hc-btn-edit" style="background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7" title="Toca para desmarcar producido" onclick="confirmUnproduced(\''+q.id+'\',\'quote\',event)">🔪 Producido ✓</button>');
      // v7.0-α FIX-02a: gate — solo permitir entregar si está producido
      if(q.produced)actionBtns.push('<button class="btn hc-btn-deliver" onclick="openDeliveryModal(\''+q.id+'\',\'quote\',event)">🎉 Marcar como entregado</button>');
      if(q.eventDate||q.productionDate)actionBtns.push('<button class="btn hc-btn-ics" onclick="exportPedidoIcs(\''+q.id+'\',\'quote\',event)">📅 .ics</button>');
    }else if(isProp&&status==="enviada"){
      // v5.0.5: bloquear PF/aprobada si es perdida; ofrecer Reactivar
      if(!_esPerdida){
        const hasMulti=(q.sections||[]).some(s=>(s.options||[]).length>1);
        if(hasMulti)actionBtns.push('<button class="btn hc-btn-final" onclick="openPropFinalFlow(\''+q.id+'\',event)">✓ Generar Propuesta Final</button>');
        else actionBtns.push('<button class="btn hc-btn-approve" onclick="openApproveModal(\''+q.id+'\',\'proposal\',event)">✓ Marcar como aprobada</button>');
      }else{
        actionBtns.push('<button class="btn hc-btn-reactivar" onclick="openReactivarModal(\''+q.id+'\',\'proposal\',event)">♻️ Reactivar</button>');
      }
    }else if(isProp&&status==="propfinal"){
      // v5.0.5: bloquear aprobada si es perdida; ofrecer Reactivar
      if(!_esPerdida){
        actionBtns.push('<button class="btn hc-btn-approve" onclick="openApproveModal(\''+q.id+'\',\'proposal\',event)">✓ Marcar como aprobada</button>');
      }else{
        actionBtns.push('<button class="btn hc-btn-reactivar" onclick="openReactivarModal(\''+q.id+'\',\'proposal\',event)">♻️ Reactivar</button>');
      }
    }else if(isProp&&(status==="aprobada"||status==="en_produccion")){
      // E1.1: botón "Iniciar producción" solo si status==='aprobada' (equivalente a 'pedido' del lado quotes) y no producido.
      if(status==="aprobada"&&!q.produced)actionBtns.push('<button class="btn hc-btn-order" style="background:#FFF3E0;color:#E65100;border-color:#FFB74D" onclick="markAsInProduction(\''+q.id+'\',\'proposal\',event)">🔥 Iniciar producción</button>');
      // v7.0-α FIX-02b: ver explicación arriba (mismo patrón para propuestas)
      if(!q.produced)actionBtns.push('<button class="btn hc-btn-edit" onclick="toggleProduced(\''+q.id+'\',\'proposal\',event)">🔪 Marcar producido</button>');
      else actionBtns.push('<button class="btn hc-btn-edit" style="background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7" title="Toca para desmarcar producido" onclick="confirmUnproduced(\''+q.id+'\',\'proposal\',event)">🔪 Producido ✓</button>');
      // v7.0-α FIX-02a: gate — solo permitir entregar si está producido
      if(q.produced)actionBtns.push('<button class="btn hc-btn-deliver" onclick="openDeliveryModal(\''+q.id+'\',\'proposal\',event)">🎉 Marcar como entregado</button>');
      if(q.eventDate||q.productionDate)actionBtns.push('<button class="btn hc-btn-ics" onclick="exportPedidoIcs(\''+q.id+'\',\'proposal\',event)">📅 .ics</button>');
    }
    // v4.12.7: botón 🔄 Nueva versión para PFs (cliente pidió cambios → regenerar PF nueva)
    if(isPF&&status!=="superseded"){
      actionBtns.push('<button class="btn hc-btn-regen" onclick="regeneratePropFinal(\''+q.id+'\',event)">🔄 Nueva versión</button>');
    }
    // v4.12.7: botón eliminar fantasma (docs GB-PF-* guardados por error en proposals/)
    if(q._wrongCollection){
      actionBtns.push('<button class="btn hc-btn-wrong" onclick="deleteWrongDoc(\''+q.id+'\',event)">🗑️ Eliminar fantasma</button>');
    }
    // v5.0.3: botón ↩️ Anular para docs en estados reversibles (antes de entregar)
    // v6.0.0: además, si el doc ya está cobrado al 100%, NO se puede anular
    // (operativamente no tiene sentido y requiere devolución grande).
    // Centralizado en canAnular(q) de app-core.
    const _anulable=(typeof canAnular==="function")?canAnular(q):["pedido","en_produccion","aprobada"].includes(status);
    if(_anulable){
      actionBtns.push('<button class="btn hc-btn-anular" onclick="openAnularModal(\''+q.id+'\',\''+q.kind+'\',event)">↩️ Anular</button>');
    }
    const _puedePago=(!isProp&&["pedido","en_produccion","entregado"].includes(status))||(isProp&&["aprobada","en_produccion","entregado"].includes(status));
    if(_puedePago&&_saldo>0)actionBtns.push('<button class="btn hc-btn-pago" onclick="openPagoModal(\''+q.id+'\',event)">💵 Registrar pago</button>');
    if(_pagos.length>0)actionBtns.push('<button class="btn hc-btn-pagos-ver" onclick="openVerPagosModal(\''+q.id+'\',event)">📒 Ver pagos ('+_pagos.length+')</button>');
    // v4.12: comentario cliente disponible si entregado o ya hay uno
    if(status==="entregado"||q.comentarioCliente){
      actionBtns.push('<button class="btn hc-btn-coment" onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\',event)">💬 '+(q.comentarioCliente?'Editar':'Registrar')+' comentario</button>');
    }
    // v6.4.0 P6: si ya está entregado y tiene foto guardada, permitir reenviar a Kathy por WhatsApp
    if(status==="entregado"&&q.entregaData&&(q.entregaData.fotoUrl||q.entregaData.foto2Url||q.entregaData.fotoBase64||q.entregaData.foto2Base64)){
      actionBtns.push('<button class="btn hc-btn-coment" style="background:#E8F5E9;color:#1B5E20;border-color:#A5D6A7" onclick="event.stopPropagation();reopenEntregaWhatsApp(\''+q.id+'\',\''+q.kind+'\')">📸 Enviar fotos a Kathy</button>');
    }
    // v5.4.1 (Bloque B): botón para ver PDFs anteriores si hay historial de regeneraciones
    if(Array.isArray(q.pdfHistorial)&&q.pdfHistorial.length>0){
      actionBtns.push('<button class="btn hc-btn-pdfs" onclick="openPdfHistorialModal(\''+q.id+'\',\''+q.kind+'\',event)">📎 PDFs ('+q.pdfHistorial.length+')</button>');
    }
    const actions=actionBtns.length?'<div class="hc-actions">'+actionBtns.join("")+'</div>':"";
    const summary=isProp
      ?'<div class="hc-items">'+(q.sections||[]).length+' secciones · '+(q.pers||"?")+' personas</div>'
      :'<div class="hc-total">'+fm(q.total||0)+'</div><div class="hc-items">'+((q.cart||[]).length+(q.cust||[]).length)+' productos</div>';
    // v5.0.1b: clase hc-convertida aplicada si es convertida (para opacity + borde lateral)
    // v5.0.3: clase hc-anulada aplicada si es anulada (igual efecto visual)
    let cardCls="hcard";
    if(status==="convertida")cardCls+=" hc-convertida";
    if(status==="anulada")cardCls+=" hc-anulada";
    const cardExtra=(status==="superseded"||q._wrongCollection)?' style="opacity:.65"':"";
    return '<div class="'+cardCls+'"'+cardExtra+' onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="hc-top"><div><span class="qnum">'+h(qNum)+'</span> <span class="hc-cli">'+h(q.client)+'</span><span class="hc-type '+(isProp?"prop":"cot")+'">'+(isProp?"Propuesta":"Cotización")+'</span>'+statusBadge+supersededBadge+wrongCollBadge+origenPfBadge+anuladaBadge+followUpBadge+pagadoBadge+prodBadge+comentBadge+syncBadge+'</div>'+
      '<div><button class="dup-btn" onclick="openDuplicateModal(\''+q.kind+'\',\''+q.id+'\',event)" title="Duplicar">📋</button><button class="del-btn" onclick="delHistItem(\''+q.kind+'\',\''+q.id+'\',event)">×</button></div></div>'+
      '<div class="hc-date">'+ds+'</div>'+summary+actions+
      '</div>';
  }).join("");
  el.innerHTML=header+cards;
  // Re-focus del input de búsqueda si había texto (para que no se pierda al tipear)
  if(histSearch){
    const inp=$("hist-search-input");
    if(inp){
      inp.focus();
      const v=inp.value;
      inp.setSelectionRange(v.length,v.length);
    }
  }
  // v5.4.3: actualizar badge del botón "Todos los PDFs" según docs con upload fallido
  if(typeof refreshAllPdfsBadge==="function")refreshAllPdfsBadge();
}

// v5.1.0: cambiar de archivo principal
function setHistArchive(arch){
  if(histArchive===arch)return;
  histArchive=arch;
  histFilter="all"; // al cambiar de archivo, resetear sub-filtro
  renderHist();
}

function setHistFilter(k){histFilter=k;renderHist()}

// v6.0: Toggle para incluir/excluir pedidos cumplidos de la vista "Pedidos → Entregadas".
// Por defecto los cumplidos viven en su propia pestaña "Ventas anteriores" y
// no aparecen mezclados con los entregados con saldo pendiente.
function toggleIncluirCumplidos(){
  histIncluirCumplidos=!histIncluirCumplidos;
  // v6.0.2: persistir selección en localStorage
  try{localStorage.setItem("gb_hist_incluir_cumplidos",histIncluirCumplidos?"1":"0");}catch(_e){}
  renderHist();
}

// v5.1.0: buscador en tiempo real
let _histSearchTimer=null;
function onHistSearchInput(ev){
  const v=ev.target.value;
  histSearch=v;
  clearTimeout(_histSearchTimer);
  _histSearchTimer=setTimeout(()=>renderHist(),180); // debounce ligero
}
function clearHistSearch(){
  histSearch="";
  renderHist();
}

// v5.1.0: Tap rápido en 🟢 Viva desde tarjeta del Historial.
// Regla: pendiente → activa. contactado → activa. activa → toast "ya está activa".
async function quickMarkViva(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(typeof setFollowUp!=="function"){alert("Función no disponible");return}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){if(typeof toast==="function")toast("No se encontró el documento","error");else alert("No se encontró el documento");return}
  const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
  if(fu==="activa"){
    if(typeof toast==="function")toast("🟢 Ya está marcada como activa","info");
    return;
  }
  if(typeof showLoader==="function")showLoader("Marcando como activa...");
  const ok=await setFollowUp(docId,kind,"activa");
  if(typeof hideLoader==="function")hideLoader();
  if(ok){
    if(typeof toast==="function")toast("🟢 Marcada como ACTIVA (viva, caliente)","success");
    renderHist();
    if(typeof renderDashboard==="function"&&curMode==="dash")renderDashboard();
    if(typeof renderSeguimiento==="function"&&curMode==="seg")renderSeguimiento();
  }
}

// ─── ORDER MODAL ───────────────────────────────────────────
function openOrderModal(quoteId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
  if(!q){if(typeof toast==="function")toast("No se encontró la cotización","error");else alert("No se encontró la cotización");return}
  $("om-num").value=q.quoteNumber||q.id;
  $("om-cli").value=q.client||"";
  const hoy=new Date().toISOString().slice(0,10);
  $("om-fecha").value=hoy;
  const mañana=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const entrega=q.eventDate||mañana;
  $("om-entrega-fecha").value=entrega;
  $("om-entrega-hora").value=q.horaEntrega||"";
  const entregaDate=new Date(entrega+"T00:00:00");
  const prodDefault=new Date(entregaDate.getTime()-86400000);
  const prodIso=prodDefault<new Date(hoy+"T00:00:00")?hoy:prodDefault.toISOString().slice(0,10);
  $("om-prod-fecha").value=q.productionDate||prodIso;
  // v5.4.0 (Bloque C): producción editable. Al cambiar fecha entrega, recalcula default
  // de producción (entrega - 1d) SOLO si el usuario no la ha editado manualmente.
  // También sincroniza min/max del input de producción.
  $("om-prod-fecha").removeAttribute("readonly");
  $("om-prod-fecha").style.background="";
  $("om-prod-fecha").style.color="";
  $("om-prod-fecha").dataset.userEdited="0";
  $("om-prod-fecha").min=hoy;
  $("om-prod-fecha").max=entrega;
  $("om-prod-fecha").oninput=function(){this.dataset.userEdited="1"};
  $("om-produced").checked=!!q.produced;
  $("om-entrega-fecha").oninput=function(){
    const e=this.value;if(!e)return;
    const eD=new Date(e+"T00:00:00");
    const pD=new Date(eD.getTime()-86400000);
    const h=new Date(hoy+"T00:00:00");
    const newProdDefault=(pD<h?hoy:pD.toISOString().slice(0,10));
    // Solo auto-actualiza si el usuario no la tocó
    if($("om-prod-fecha").dataset.userEdited!=="1"){
      $("om-prod-fecha").value=newProdDefault;
    }
    $("om-prod-fecha").max=e;
  };
  $("om-anticipo").value="";
  $("om-metodo").value="";
  $("om-notas").value="";
  // v5.4.0 (Bloque A): pre-llenar notas de producción con los momentos/instrucciones
  // de la cotización original si no hay notas previas guardadas en orderData.
  // Así las instrucciones críticas ("sin nueces", "es regalo", "entregar a X") que el
  // cliente escribió en el paso de fecha de la cotización llegan a producción y al .ics
  // en vez de perderse.
  let notaProdDefault="";
  if(q.orderData?.notasProduccion){
    notaProdDefault=q.orderData.notasProduccion;
  }else{
    // Reconstruir a partir de momentos/instrucciones de la cotización
    const parts=[];
    const estandares=["Desayuno","Almuerzo","Cena","Coffee Break","Cóctel","Picada","Mañana","Tarde","Noche"];
    // Momentos guardados como array (v5.4.0+): filtra valores tipo checkbox estándar y deja solo el texto libre
    if(Array.isArray(q.momentosArr)&&q.momentosArr.length){
      const libres=q.momentosArr.filter(m=>m&&!estandares.includes(m));
      if(libres.length)parts.push(libres.join(" · "));
    }
    // Fallback defensivo para cotizaciones legacy (pre-v5.4.0): extraer del string `deliv`
    // Formato típico: "22 de mayo de 2026 — Regalo para X, incluir nota..."
    // Filtra si el texto extraído es solo un momento estándar (ej "Almuerzo") para no meter ruido.
    if(!parts.length&&q.deliv&&typeof q.deliv==="string"&&q.deliv.includes(" — ")){
      const parteDespues=q.deliv.split(" — ").slice(1).join(" — ").trim();
      // Solo agregar si no es una lista de solo momentos estándar (ej "Almuerzo, Cena")
      const tokens=parteDespues.split(",").map(s=>s.trim()).filter(Boolean);
      const hayTextoLibre=tokens.some(t=>!estandares.includes(t));
      if(parteDespues&&hayTextoLibre)parts.push(parteDespues);
    }
    notaProdDefault=parts.join(" · ");
  }
  $("om-notas-prod").value=notaProdDefault;
  // Si la nota viene de la cotización (no editada antes), resaltamos visualmente
  if(notaProdDefault&&!q.orderData?.notasProduccion){
    $("om-notas-prod").style.background="#FFF8E1";
    $("om-notas-prod").style.borderColor="#FFB300";
  }else{
    $("om-notas-prod").style.background="";
    $("om-notas-prod").style.borderColor="";
  }
  $("om-num").dataset.quoteId=q.id;
  $("order-modal").classList.remove("hidden");
}
function closeOrderModal(){$("order-modal").classList.add("hidden")}

async function submitMarkAsOrder(){
  const quoteId=$("om-num").dataset.quoteId;
  if(!quoteId)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión.");return}
  const fecha=$("om-fecha").value;if(!fecha){alert("Ingresa la fecha de aprobación del cliente");return}
  const fechaEntrega=$("om-entrega-fecha").value;
  const horaEntrega=$("om-entrega-hora").value;
  if(!fechaEntrega){alert("Ingresa la fecha de entrega");return}
  if(!horaEntrega){alert("Ingresa la hora de entrega");return}
  // v5.4.0 (Bloque C): producción ahora es EDITABLE. Default sigue siendo entrega-1d
  // pero el usuario puede ponerla el mismo día de la entrega si así lo necesita.
  // Validaciones: no puede ser en el pasado, no puede ser después de la entrega.
  // Si es el mismo día que la entrega, se pide confirmación explícita.
  const todayIso=new Date().toISOString().slice(0,10);
  let productionDate=$("om-prod-fecha").value;
  if(!productionDate){
    // Fallback defensivo si alguien vació el campo: re-calcular entrega-1d
    const _entD=new Date(fechaEntrega+"T00:00:00");
    const _prodD=new Date(_entD.getTime()-86400000);
    productionDate=_prodD.toISOString().slice(0,10);
    if(productionDate<todayIso)productionDate=todayIso;
  }
  if(productionDate<todayIso){
    toast("⚠️ Fecha de producción no puede estar en el pasado (hoy "+todayIso+", ingresaste "+productionDate+")","warn",5500);
    return;
  }
  if(productionDate>fechaEntrega){
    toast("⚠️ Producción no puede ser posterior a la entrega (entrega "+fechaEntrega+", producción "+productionDate+")","warn",5500);
    return;
  }
  if(productionDate===fechaEntrega){
    const ok=await confirmModal({
      title:"⚡ Producción y entrega el MISMO día",
      body:"Fecha: <strong>"+h(fechaEntrega)+" "+h(horaEntrega)+"</strong><br><br>¿Confirmas que tienes tiempo para producir y entregar hoy mismo?<br><br><em>Normal es producir el día anterior — esto es solo para casos especiales.</em>",
      okLabel:"Sí, producir y entregar hoy",
      tone:"warn"
    });
    if(!ok)return;
  }
  const produced=$("om-produced").checked;
  const anticipo=parseInt($("om-anticipo").value)||0;
  const metodo=$("om-metodo").value;
  const notas=$("om-notas").value.trim();
  const notasProd=$("om-notas-prod").value.trim();
  const orderData={
    fechaAprobacion:fecha,fechaEntrega:fechaEntrega,horaEntrega:horaEntrega,
    productionDate:productionDate,produced:produced,
    anticipo:anticipo,metodoPago:metodo,notas:notas,
    notasProduccion:notasProd,marcadoEn:new Date().toISOString()
  };
  const pagos=[];
  if(anticipo>0)pagos.push({fecha:fecha,monto:anticipo,metodo:metodo||"Sin especificar",tipo:"anticipo",notas:notas,registradoEn:new Date().toISOString()});
  // E1.1 (2026-04-26): siempre arranca en 'pedido'. La transición a 'en_produccion' es manual
  // vía botón "🔥 Iniciar producción" cuando Kathy realmente prende la cocina.
  const initialStatus="pedido";
  const _prevStatusOM=(quotesCache.find(x=>x.id===quoteId&&x.kind==="quote")||{}).status||"enviada";
  if(typeof auditTransition==="function"&&!auditTransition(_prevStatusOM,initialStatus,"submitMarkAsOrder "+quoteId))return;
  try{
    showLoader("Actualizando estado...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const patch={
      status:initialStatus,orderData:orderData,
      eventDate:fechaEntrega,horaEntrega:horaEntrega,
      productionDate:productionDate,produced:produced,
      producedAt:produced?new Date().toISOString():null,
      updatedAt:serverTimestamp()
    };
    if(pagos.length)patch.pagos=pagos;
    // v5.0.2: al confirmar un pedido con fecha futura, queda needsSync=true automáticamente.
    const hoyIso=new Date().toISOString().slice(0,10);
    if(fechaEntrega&&fechaEntrega>=hoyIso)patch.needsSync=true;
    await updateDoc(doc(db,"quotes",quoteId),patch);
    const local=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
    if(local){
      local.status=initialStatus;local.orderData=orderData;
      local.eventDate=fechaEntrega;local.horaEntrega=horaEntrega;
      local.productionDate=productionDate;local.produced=produced;
      local.producedAt=patch.producedAt;
      if(pagos.length)local.pagos=pagos;
      if(patch.needsSync)local.needsSync=true;
    }
    hideLoader();closeOrderModal();
    toast("✅ Pedido "+($("om-num").value)+" · Entrega "+fechaEntrega+" "+horaEntrega+" · Producción "+productionDate+(produced?" (✓ ya producido)":""),"success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();toast("Error al actualizar: "+e.message,"error");console.error(e)}
}

// ─── ASIGNAR FECHA DE ENTREGA ──────────────────────────────
async function assignDeliveryDate(quoteId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
  if(!q){if(typeof toast==="function")toast("No se encontró el pedido","error");else alert("No se encontró el pedido");return}
  const hoy=new Date().toISOString().slice(0,10);
  const fecha=prompt("Fecha de entrega (YYYY-MM-DD):",q.eventDate||hoy);
  if(!fecha)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){alert("Formato inválido. Usa YYYY-MM-DD");return}
  const hora=prompt("Hora de entrega (HH:MM):",q.horaEntrega||"12:00");
  if(!hora)return;
  if(!/^\d{2}:\d{2}$/.test(hora)){alert("Formato inválido. Usa HH:MM");return}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  try{
    showLoader("Asignando fecha...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const patch={eventDate:fecha,horaEntrega:hora,updatedAt:serverTimestamp()};
    if(q.orderData){patch["orderData.fechaEntrega"]=fecha;patch["orderData.horaEntrega"]=hora}
    // v5.0.2: fecha futura → needsSync
    if(fecha>=hoy)patch.needsSync=true;
    await updateDoc(doc(db,"quotes",quoteId),patch);
    q.eventDate=fecha;q.horaEntrega=hora;
    if(q.orderData){q.orderData.fechaEntrega=fecha;q.orderData.horaEntrega=hora}
    if(patch.needsSync)q.needsSync=true;
    hideLoader();renderHist();
    if(typeof renderDashboard==="function")renderDashboard();
  }catch(e){hideLoader();toast("Error: "+e.message,"error")}
}

// ─── APROBAR PROPUESTA ─────────────────────────────────────
function openApproveModal(propId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const p=quotesCache.find(x=>x.id===propId&&x.kind===kind);
  if(!p){if(typeof toast==="function")toast("No se encontró la propuesta","error");else alert("No se encontró la propuesta");return}
  $("am-num").value=p.quoteNumber||p.id;
  $("am-cli").value=p.client||"";
  $("am-fecha").value=new Date().toISOString().slice(0,10);
  $("am-anticipo").value="";
  $("am-metodo").value="";
  $("am-notas").value="";
  // v5.4.0 (Bloque A): pre-llenar notas de producción con el campo `momento` de la
  // propuesta si no hay notas previas — así instrucciones/contextos del evento
  // llegan a producción y al .ics sin tener que volver a digitarlos.
  let notaProdDefault="";
  if(p.approvalData?.notasProduccion){
    notaProdDefault=p.approvalData.notasProduccion;
  }else if(p.momento&&typeof p.momento==="string"&&p.momento.trim()){
    notaProdDefault=p.momento.trim();
  }
  $("am-notas-prod").value=notaProdDefault;
  if(notaProdDefault&&!p.approvalData?.notasProduccion){
    $("am-notas-prod").style.background="#FFF8E1";
    $("am-notas-prod").style.borderColor="#FFB300";
  }else{
    $("am-notas-prod").style.background="";
    $("am-notas-prod").style.borderColor="";
  }
  $("am-num").dataset.propId=p.id;
  $("am-num").dataset.propKind=kind;
  $("approve-modal").classList.remove("hidden");
}
function closeApproveModal(){$("approve-modal").classList.add("hidden")}

async function submitApproveProposal(){
  const propId=$("am-num").dataset.propId;
  const kind=$("am-num").dataset.propKind||"proposal";
  if(!propId)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión.");return}
  const fecha=$("am-fecha").value;if(!fecha){alert("Ingresa la fecha de aprobación");return}
  const anticipo=parseInt($("am-anticipo").value)||0;
  const metodo=$("am-metodo").value;
  const notas=$("am-notas").value.trim();
  const notasProd=$("am-notas-prod").value.trim();
  const approvalData={
    fechaAprobacion:fecha,anticipo:anticipo,metodoPago:metodo,
    notas:notas,notasProduccion:notasProd,marcadoEn:new Date().toISOString()
  };
  const pagos=[];
  if(anticipo>0)pagos.push({fecha:fecha,monto:anticipo,metodo:metodo||"Sin especificar",tipo:"anticipo",notas:notas,registradoEn:new Date().toISOString()});
  // v7.0-α FIX-05: audit FSM (no bloquea en audit, sí en enforce)
  const _prevStatusAP=(quotesCache.find(x=>x.id===propId&&x.kind===kind)||{}).status||"enviada";
  if(typeof auditTransition==="function"&&!auditTransition(_prevStatusAP,"aprobada","submitApproveProposal "+propId))return;
  try{
    showLoader("Actualizando estado...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(propId&&propId.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";
    const patch={status:"aprobada",approvalData:approvalData,updatedAt:serverTimestamp()};
    if(pagos.length)patch.pagos=pagos;
    // v5.0.2: si la propuesta aprobada tiene fecha de evento futura, marcar needsSync
    const localPre=quotesCache.find(x=>x.id===propId&&x.kind===kind);
    const eventDate=localPre?.eventDate;
    const hoyIso=new Date().toISOString().slice(0,10);
    if(eventDate&&eventDate>=hoyIso)patch.needsSync=true;
    await updateDoc(doc(db,coll,propId),patch);
    const local=quotesCache.find(x=>x.id===propId&&x.kind===kind);
    if(local){local.status="aprobada";local.approvalData=approvalData;if(pagos.length)local.pagos=pagos;if(patch.needsSync)local.needsSync=true}
    hideLoader();closeApproveModal();
    toast("✓ Propuesta aprobada: "+($("am-num").value),"success");
    renderHist();
  }catch(e){hideLoader();toast("Error al actualizar: "+e.message,"error");console.error(e)}
}

// ─── DUPLICAR ──────────────────────────────────────────────
let dupSource=null;

function openDuplicateModal(kind,id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión.");return}
  let coll;
  if(kind==="quote")coll="quotes";
  else if(id&&id.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  showLoader("Cargando para duplicar...");
  const {db,doc,getDoc}=window.fb;
  getDoc(doc(db,coll,id)).then(snap=>{
    hideLoader();
    if(!snap.exists()){if(typeof toast==="function")toast("No se encontró el documento","error");else alert("No se encontró el documento");return}
    dupSource={kind:kind,id:id,coll:coll,data:snap.data()};
    const effKind=coll==="propfinals"?"proposal":kind;
    $("dup-kind-label").textContent=effKind==="quote"?"cotización":"propuesta";
    $("dup-num").textContent=snap.data().quoteNumber||id;
    $("dup-cli").textContent=snap.data().client||"—";
    $("dup-modal").classList.remove("hidden");
  }).catch(e=>{hideLoader();toast("Error cargando documento: "+e.message,"error");console.error(e)});
}
function closeDuplicateModal(){$("dup-modal").classList.add("hidden");dupSource=null}

function duplicateQuote(preserveClient){
  if(!dupSource)return;
  const src=dupSource.data;
  const effKind=dupSource.coll==="propfinals"?"proposal":dupSource.kind;
  closeDuplicateModal();
  if(effKind==="quote"){
    setMode("cot");cart=[];cust=[];
    if(src.cart){src.cart.forEach(ci=>{const p=C.find(x=>x.id===ci.id);if(p)cart.push({...p,p:ci.p,origP:ci.origP||p.p,qty:ci.qty,edited:!!ci.edited});else cart.push({id:ci.id||Date.now()+Math.random(),n:ci.n,d:ci.d,u:ci.u,p:ci.p,origP:ci.origP||ci.p,qty:ci.qty,edited:!!ci.edited})})}
    if(src.cust)cust=src.cust.map((ci,ix)=>({id:"x"+Date.now()+ix,...ci,custom:true}));
    if(preserveClient){
      $("f-cli").value=src.client||"";
      const parts=(src.idStr||"").split(" ");
      $("f-idtype").value=parts[0]||"";
      $("f-idnum").value=parts.slice(1).join(" ")||"";
      $("f-att").value=src.att||"";$("f-mail").value=src.mail||"";
      $("f-tel").value=src.tel||"";$("f-dir").value=src.dir||"";
      if(src.cityType){$("f-city").value=src.cityType;if(src.cityType==="Otra"){$("f-city-custom").value=src.city||"";$("f-tr-custom").value=src.trCustom||""}}
      updTr();
    }else{
      ["f-cli","f-idnum","f-att","f-mail","f-tel","f-dir","f-city-custom","f-tr-custom"].forEach(id=>{if($(id))$(id).value=""});
      $("f-idtype").value="";$("f-city").value="";updTr();
    }
    $("f-date").value="";
    document.querySelectorAll('#f-moments input[type=checkbox]').forEach(c=>{c.checked=false;togMom(c)});
    if($("f-time-other"))$("f-time-other").value="";
    if($("f-time-other-wrap"))$("f-time-other-wrap").classList.add("hidden");
    if(src.notasCotData&&typeof src.notasCotData==="object"){notasCotData={...src.notasCotData}}
    else{notasCotData={...DEFAULT_NOTAS_COT}}
    if(src.firma)firmaCot=src.firma;
    setFirma("cot",firmaCot);
    currentQuoteNumber=null;
    go("info");
    toast("📋 Duplicado listo. Revisa y guarda para asignar consecutivo.","info",5000);
    return;
  }
  setMode("prop");
  if(preserveClient){
    $("fp-cli").value=src.client||"";
    const parts=(src.idStr||"").split(" ");
    $("fp-idtype").value=parts[0]||"";
    $("fp-idnum").value=parts.slice(1).join(" ")||"";
    $("fp-att").value=src.att||"";$("fp-mail").value=src.mail||"";
    $("fp-tel").value=src.tel||"";$("fp-dir").value=src.dir||"";
    if(src.cityType){$("fp-city").value=src.cityType;if(src.cityType==="Otra"){$("fp-city-custom").value=src.city||"";$("fp-tr-custom").value=src.trCustom||""}}
    updTrP();
  }else{
    ["fp-cli","fp-idnum","fp-att","fp-mail","fp-tel","fp-dir","fp-city-custom","fp-tr-custom"].forEach(id=>{if($(id))$(id).value=""});
    $("fp-idtype").value="";$("fp-city").value="";updTrP();
  }
  $("fp-date").value="";$("fp-pers").value="";$("fp-momento").value="";
  propSections=JSON.parse(JSON.stringify(src.sections||[]));
  menajeItems=JSON.parse(JSON.stringify(src.menaje||[]));
  personalData=JSON.parse(JSON.stringify(src.personalData||{meseros:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""},auxiliares:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""}}));
  tipoServicio=src.tipoServicio||"";
  condicionesData=JSON.parse(JSON.stringify(src.condicionesData||{}));
  reposicionData=JSON.parse(JSON.stringify(src.reposicionData||{}));
  firmaProp=src.firma||"jp";
  aperturaFrase=src.aperturaFrase||aperturaFrase;
  fechaVencimiento="";setDefaultFechaVenc();
  $("fp-apertura").value=aperturaFrase;
  setTipoServ(tipoServicio||null);
  renderPropSections();renderMenaje();renderPersonal();renderCondiciones();renderReposicion();
  setFirma("prop",firmaProp);
  currentPropNumber=null;
  toast("📋 Propuesta duplicada. Revisa fechas y datos del evento antes de guardar.","info",5000);
}

// ─── SALDO MODAL (legacy) ──────────────────────────────────
let saldoSource=null;
function openSaldoModal(propId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const p=quotesCache.find(x=>x.id===propId);
  if(!p){if(typeof toast==="function")toast("No se encontró","error");else alert("No se encontró");return}
  const anticipoProp=p.approvalData?.anticipo;
  const anticipoOrder=p.orderData?.anticipo;
  if(!anticipoProp&&!anticipoOrder){alert("Este documento no tiene anticipo registrado.");return}
  const totalEstimado=p.total||p.totalReal||0;
  const anticipo=anticipoProp||anticipoOrder||0;
  const saldoEstimado=Math.max(0,totalEstimado-anticipo);
  saldoSource={id:propId,kind:p.kind,doc:p};
  $("sm-num").value=p.quoteNumber||p.id;
  $("sm-cli").value=p.client||"";
  $("sm-fecha").value=new Date().toISOString().slice(0,10);
  $("sm-metodo").value="";
  $("sm-notas").value="";
  $("sm-monto").value=saldoEstimado||"";
  $("saldo-monto-disp").textContent=saldoEstimado>0?fm(saldoEstimado)+" (estimado)":"Sin total. Ingresa monto manual.";
  $("saldo-modal").classList.remove("hidden");
}
function closeSaldoModal(){$("saldo-modal").classList.add("hidden");saldoSource=null}

async function submitSaldoCobrado(){
  if(!saldoSource)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión.");return}
  const fecha=$("sm-fecha").value;if(!fecha){alert("Fecha");return}
  const metodo=$("sm-metodo").value;if(!metodo){alert("Método");return}
  const monto=parseInt($("sm-monto").value)||0;if(monto<=0){alert("Monto inválido");return}
  const notas=$("sm-notas").value.trim();
  const saldoData={fecha:fecha,monto:monto,metodoPago:metodo,notas:notas,marcadoEn:new Date().toISOString()};
  try{
    showLoader("Registrando cobro...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const propId=saldoSource.id;
    const coll=saldoSource.kind==="quote"?"quotes":(propId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,propId),{saldoData:saldoData,updatedAt:serverTimestamp()});
    saldoSource.doc.saldoData=saldoData;
    hideLoader();closeSaldoModal();
    toast("💰 Saldo cobrado registrado","success");
    renderHist();
    if(curMode==="cot")renderMiniDash();
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

// ─── PAGOS modal ───────────────────────────────────────────
let pagoSrc=null;
let pagoFotoBase64=null;

function openPagoModal(docId,kindOrEv,evMaybe){
  let kind,ev;
  if(typeof kindOrEv==="string"){kind=kindOrEv;ev=evMaybe}
  else{ev=kindOrEv;kind=null}
  if(ev){ev.stopPropagation();ev.preventDefault()}
  let q;
  if(kind)q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  else q=quotesCache.find(x=>x.id===docId);
  if(!q){if(typeof toast==="function")toast("No se encontró","error");else alert("No se encontró");return}
  pagoSrc={id:docId,kind:q.kind,doc:q};
  pagoFotoBase64=null;
  $("pm-foto-preview").innerHTML="";
  $("pm-foto").value="";
  $("pm-num").value=q.quoteNumber||q.id;
  $("pm-cli").value=q.client||"";
  const total=(typeof getDocTotal==="function"?getDocTotal(q):(q.total||q.totalReal||0));
  const cobrado=totalCobrado(q);
  const pend=Math.max(0,total-cobrado);
  $("pm-resumen").innerHTML="Total: <strong>"+fm(total)+"</strong> · Cobrado: <strong>"+fm(cobrado)+"</strong> · Pendiente: <strong>"+fm(pend)+"</strong>";
  $("pm-fecha").value=new Date().toISOString().slice(0,10);
  $("pm-monto").value=pend||"";
  $("pm-metodo").value="";
  $("pm-tipo").value=cobrado===0?"anticipo":(pend>0?"parcial":"saldo");
  $("pm-notas").value="";
  $("pago-modal").classList.remove("hidden");
}
function closePagoModal(){$("pago-modal").classList.add("hidden");pagoSrc=null;pagoFotoBase64=null}

// Comprime foto en cliente: 800px JPEG 0.7
function _compressImageFile(file,cb){
  if(file.size>10*1024*1024){alert("La foto es muy grande (>10MB).");return}
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const max=800;let w=img.width,h=img.height;
      if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
      const cv=document.createElement("canvas");cv.width=w;cv.height=h;
      cv.getContext("2d").drawImage(img,0,0,w,h);
      cb(cv.toDataURL("image/jpeg",0.7));
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function previewPagoFoto(ev){
  const file=ev.target.files[0];
  if(!file){pagoFotoBase64=null;$("pm-foto-preview").innerHTML="";return}
  _compressImageFile(file,b64=>{
    pagoFotoBase64=b64;
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("pm-foto-preview").innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Comprimida: '+sizeKB+' KB</div>';
  });
}

async function submitPago(){
  if(!pagoSrc)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  const fecha=$("pm-fecha").value;if(!fecha){alert("Fecha");return}
  const monto=parseInt($("pm-monto").value)||0;if(monto<=0){alert("Monto inválido");return}
  const metodo=$("pm-metodo").value;if(!metodo){alert("Método");return}
  const tipo=$("pm-tipo").value||"parcial";
  const notas=$("pm-notas").value.trim();
  const nuevo={fecha,monto,metodo,tipo,notas,registradoEn:new Date().toISOString()};
  // v5.0: foto va a Firebase Storage (no base64 inline)
  if(pagoFotoBase64){
    try{
      const {url}=await uploadFotoFromBase64(pagoFotoBase64,"pago",pagoSrc.id,"pagos");
      nuevo.fotoUrl=url;
    }catch(e){
      console.warn("Upload foto falló, guardo base64 como fallback:",e);
      nuevo.foto=pagoFotoBase64; // compat legacy
    }
  }
  try{
    showLoader("Registrando pago...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const coll=pagoSrc.kind==="quote"?"quotes":(pagoSrc.id.startsWith("GB-PF-")?"propfinals":"proposals");
    const pagosActuales=getPagos(pagoSrc.doc).map(p=>({...p}));
    pagosActuales.push(nuevo);
    await updateDoc(doc(db,coll,pagoSrc.id),{pagos:pagosActuales,updatedAt:serverTimestamp(),...auditStamp()});
    pagoSrc.doc.pagos=pagosActuales;
    hideLoader();closePagoModal();
    toast("💵 Pago registrado: "+fm(monto)+" via "+metodo,"success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

function openVerPagosModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  let q;
  if(kind)q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  else q=quotesCache.find(x=>x.id===docId);
  if(!q){alert("No encontrado");return}
  window.__verPagosId=docId;
  window.__verPagosKind=q.kind;
  $("vp-num").value=q.quoteNumber||q.id;
  $("vp-cli").value=q.client||"";
  const total=(typeof getDocTotal==="function"?getDocTotal(q):(q.total||q.totalReal||0));
  const cobrado=totalCobrado(q);
  const pend=Math.max(0,total-cobrado);
  const pct=total>0?Math.round(cobrado*100/total):0;
  $("vp-resumen").innerHTML='Total: <strong>'+fm(total)+'</strong> · Cobrado: <strong>'+fm(cobrado)+'</strong> ('+pct+'%) · Pendiente: <strong>'+fm(pend)+'</strong>'+
    '<div class="pagos-progress"><div class="pagos-progress-fill" style="width:'+pct+'%"></div></div>';
  const pagos=getPagos(q);
  if(!pagos.length){$("vp-list").innerHTML='<div class="dash-met-empty">Aún no hay pagos registrados.</div>'}
  else{
    $("vp-list").innerHTML=pagos.map((p,idx)=>{
      // v5.0: soporta fotoUrl (Storage) o foto base64 legacy
      const fotoSrc=p.fotoUrl||p.foto;
      const fotoHtml=fotoSrc?'<div class="pago-item-foto"><img src="'+fotoSrc+'"></div>':'';
      const legBadge=p.legacy?' <span style="font-size:9px;color:#888">[migrado]</span>':'';
      // v5.1.0: botón "Adjuntar comprobante" si el pago NO tiene foto.
      // Se usa un input file oculto por pago, con data-idx para saber a cuál adjuntar.
      const adjuntarHtml=fotoSrc?'':(
        '<div class="pago-item-adjuntar">'+
          '<button class="pago-adj-btn" onclick="triggerAdjuntarPago('+idx+')">📎 Adjuntar comprobante</button>'+
          '<input type="file" id="vp-adj-input-'+idx+'" accept="image/*" style="display:none" onchange="onAdjuntarPagoFile(event,'+idx+')">'+
          '<div id="vp-adj-prev-'+idx+'"></div>'+
        '</div>'
      );
      return '<div class="pago-item">'+
        '<div class="pago-item-top"><span class="pago-item-monto">'+fm(p.monto)+'</span><span class="pago-item-tipo">'+p.tipo+'</span></div>'+
        '<div class="pago-item-meta">'+p.fecha+' · '+p.metodo+legBadge+'</div>'+
        (p.notas?'<div class="pago-item-meta" style="margin-top:3px">📝 '+p.notas+'</div>':'')+fotoHtml+adjuntarHtml+
      '</div>';
    }).join("");
  }
  $("verpagos-modal").classList.remove("hidden");
}
function closeVerPagosModal(){$("verpagos-modal").classList.add("hidden")}

// v5.1.0: Adjuntar comprobante DESPUÉS de registrar un pago.
// Útil cuando en el momento del pago no se tenía la foto del comprobante.
function triggerAdjuntarPago(idx){
  const input=$("vp-adj-input-"+idx);
  if(input)input.click();
}

async function onAdjuntarPagoFile(ev,idx){
  const file=ev.target.files[0];
  if(!file)return;
  const docId=window.__verPagosId;
  const kind=window.__verPagosKind;
  if(!docId){alert("Contexto perdido");return}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("Documento no encontrado");return}
  const pagos=getPagos(q);
  if(idx<0||idx>=pagos.length){alert("Pago no encontrado");return}
  // Preview mientras sube
  _compressImageFile(file,async b64=>{
    $("vp-adj-prev-"+idx).innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:120px;border-radius:6px;margin-top:6px;opacity:.6"><div style="font-size:10px;color:#666">Subiendo...</div>';
    try{
      showLoader("Subiendo comprobante...");
      const {url}=await uploadFotoFromBase64(b64,"pago",docId,"pagos");
      // Construir array de pagos actualizado (reemplazando el idx con la foto nueva)
      const pagosActuales=pagos.map(p=>({...p}));
      pagosActuales[idx].fotoUrl=url;
      pagosActuales[idx].fotoAdjuntadaEn=new Date().toISOString();
      const {db,doc,updateDoc,serverTimestamp}=window.fb;
      const coll=kind==="quote"?"quotes":(docId.startsWith("GB-PF-")?"propfinals":"proposals");
      await updateDoc(doc(db,coll,docId),{pagos:pagosActuales,updatedAt:serverTimestamp(),...auditStamp()});
      q.pagos=pagosActuales;
      hideLoader();
      toast("📎 Comprobante adjuntado","success");
      // Re-abrir el modal para que se vea actualizado
      openVerPagosModal(docId,kind);
    }catch(e){
      hideLoader();
      console.error("onAdjuntarPagoFile error:",e);
      toast("Error subiendo comprobante: "+e.message,"error");
    }
  });
}

// ─── PRODUCED FLAG ─────────────────────────────────────────
// E1.1 (2026-04-26): transición manual pedido/aprobada → en_produccion. Disparada por Kathy
// cuando realmente prende la cocina. Reemplaza el auto-promote por fecha que existía antes.
async function markAsInProduction(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return;
  if(q.status==="en_produccion"){if(typeof toast==="function")toast("Ya está en producción","info");return}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  const _prev=q.status;
  if(typeof auditTransition==="function"&&!auditTransition(_prev,"en_produccion","markAsInProduction "+docId))return;
  try{
    showLoader("Iniciando producción...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const coll=kind==="quote"?"quotes":(docId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,docId),{status:"en_produccion",updatedAt:serverTimestamp()});
    q.status="en_produccion";
    hideLoader();renderHist();
    if(curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
    if(typeof toast==="function")toast("🔥 Producción iniciada","success",3000);
  }catch(e){hideLoader();toast("Error: "+e.message,"error")}
}

async function toggleProduced(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return;
  const newVal=!q.produced;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  try{
    showLoader("Actualizando...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const coll=kind==="quote"?"quotes":(docId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,docId),{produced:newVal,producedAt:newVal?new Date().toISOString():null,updatedAt:serverTimestamp()});
    q.produced=newVal;q.producedAt=newVal?new Date().toISOString():null;
    hideLoader();renderHist();
    if(curMode==="dash")renderDashboard();
    // v7.0-α FIX-02b: toast de confirmación visible
    if(typeof toast==="function"){
      toast(newVal?"🔪 Marcado como producido":"↩️ Desmarcado producido — el pedido vuelve a 'pendiente de producir'",newVal?"success":"info",newVal?3000:5000);
    }
  }catch(e){hideLoader();toast("Error: "+e.message,"error")}
}

// v7.0-α FIX-02c: setea estado del toggle "Recibido conforme" en el delivery-modal.
// Sincroniza el checkbox hidden (para que submitDelivery siga leyendo .checked) +
// pinta los dos botones pill (activo verde sólido, inactivo outline) +
// muestra/oculta el campo "nombre receptor" según corresponda.
function _setRecibidoConforme(val){
  const cb=document.getElementById("dm-recibido-conforme");
  if(cb)cb.checked=!!val;
  const btnYes=document.getElementById("dm-recibido-yes");
  const btnNo=document.getElementById("dm-recibido-no");
  const receptor=document.getElementById("dm-receptor");
  if(btnYes&&btnNo){
    if(val){
      btnYes.style.background="#2E7D32";btnYes.style.color="#fff";btnYes.style.borderColor="#2E7D32";
      btnNo.style.background="#fff";btnNo.style.color="#546E7A";btnNo.style.borderColor="#B0BEC5";
    }else{
      btnYes.style.background="#fff";btnYes.style.color="#388E3C";btnYes.style.borderColor="#66BB6A";
      btnNo.style.background="#ECEFF1";btnNo.style.color="#37474F";btnNo.style.borderColor="#90A4AE";
    }
  }
  if(receptor)receptor.style.display=val?"":"none";
}

// v7.0-α FIX-02b: confirmación antes de desmarcar producido (con bullet de impacto).
// Llamado solo desde el card cuando el pedido ya está producido.
function confirmUnproduced(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!confirm("¿Desmarcar como producido?\n\nEl pedido va a aparecer como 'pendiente de producir' otra vez y no podrás marcarlo entregado hasta volver a producirlo."))return;
  toggleProduced(docId,kind,null);
}

// ═══════════════════════════════════════════════════════════
// v4.12: MARCAR COMO ENTREGADO (con foto + notas + quien + recibido)
// ═══════════════════════════════════════════════════════════
let deliverySrc=null;
let entregaFotoBase64=null;
let entregaFoto2Base64=null; // v6.4.0 P6: segunda foto opcional

// v7.0-α FIX-04: estados considerados "abiertos" para el chequeo multi-pedido.
// 'producto_producido' del spec original no existe en v6.4.0 — q.produced es flag boolean.
// Cuando llegue FIX-05 (máquina de estados formal) se podrá ampliar esta lista.
const _OPEN_STATUSES_FIX04=["pedido","aprobada","en_produccion"];

// Normaliza nombre de cliente para comparación tolerante (case + espacios).
function _normClientName(s){
  return String(s||"").toLowerCase().trim().replace(/\s+/g," ");
}

// Busca pedidos abiertos del mismo cliente, excluyendo el target.
function _findOpenSiblingsByClient(targetId,targetKind,clientName){
  const target=_normClientName(clientName);
  if(!target)return [];
  return (quotesCache||[]).filter(x=>{
    if(x.id===targetId&&x.kind===targetKind)return false;
    if(!_OPEN_STATUSES_FIX04.includes(x.status||""))return false;
    return _normClientName(x.client)===target;
  });
}

// v7.0-α FIX-04: entry point con chequeo multi-pedido.
// Si el cliente tiene 2+ pedidos abiertos (target + ≥1 hermano), abre primero
// modal de contexto. Si solo es el target, sigue al flujo original.
function openDeliveryModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No encontrado");return}
  // v7.0-α FIX-02a: gate de transición — defensa profunda contra apertura forzada del modal
  if(!q.produced){
    if(typeof toast==="function")toast("⚠️ Falta marcar como producido antes de entregar","warn",5000);
    return;
  }
  const siblings=_findOpenSiblingsByClient(docId,kind,q.client);
  if(siblings.length>=1){
    if(window.__GB_V7_DEBUG)console.log("[FIX-04] multi-pedido detectado",{target:docId,cliente:q.client,siblings:siblings.map(s=>s.id)});
    _openMultiPedidoConfirmModal({
      target:q,
      siblings:siblings,
      onConfirm:()=>_doOpenDeliveryModal(docId,kind,q)
    });
    return;
  }
  _doOpenDeliveryModal(docId,kind,q);
}

// v7.0-α FIX-04: sub-modal informativo (NO destructivo, sin typing requerido).
// Muestra el pedido objetivo + lista de OTROS pedidos abiertos del cliente.
// DOM-injected, prefijo .gb-multipedido-* (cero colisiones).
function _openMultiPedidoConfirmModal(opts){
  const prev=document.getElementById("gb-multipedido-modal-bk");
  if(prev)prev.remove();
  const tgt=opts.target;
  const fmt=(typeof fm==="function")?fm:(n=>"$"+n);
  const totFn=(typeof getDocTotal==="function")?getDocTotal:(q=>q.total||0);
  const tgtTotal=totFn(tgt);
  const tgtFecha=tgt.eventDate||tgt.fechaEntrega||tgt.entregaData?.fechaEntrega||"—";
  const tgtNumProd=((tgt.cart||[]).length+(tgt.cust||[]).length);
  const tgtProdNames=[
    ...(tgt.cart||[]).slice(0,3).map(c=>c.n||c.id||""),
    ...(tgt.cust||[]).slice(0,3).map(c=>c.n||"")
  ].filter(Boolean).slice(0,3);
  const tgtProdLbl=tgtProdNames.length?tgtProdNames.join(", ")+(tgtNumProd>tgtProdNames.length?" +"+(tgtNumProd-tgtProdNames.length)+" más":""):tgtNumProd+" producto"+(tgtNumProd!==1?"s":"");
  const sibsHtml=opts.siblings.map(s=>{
    const sMeta=(typeof STATUS_META!=="undefined"&&STATUS_META[s.status])||{label:s.status,cls:s.status};
    const sFecha=s.eventDate||s.fechaEntrega||"—";
    const sTotal=totFn(s);
    const sNumP=((s.cart||[]).length+(s.cust||[]).length);
    const sQNum=s.quoteNumber||s.id;
    return '<div style="background:#fff;border:1px solid #E0E0E0;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-size:12px;line-height:1.45">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:3px">'+
        '<strong style="font-family:monospace;color:#37474F">'+h(sQNum)+'</strong>'+
        '<span class="hc-status '+h(sMeta.cls)+'" style="font-size:10.5px;padding:1.5px 7px">'+h(sMeta.label)+'</span>'+
      '</div>'+
      '<div style="color:#546E7A;font-size:11.5px">📅 '+h(sFecha)+' · <strong>'+h(fmt(sTotal))+'</strong> · '+sNumP+' producto'+(sNumP!==1?"s":"")+'</div>'+
      '</div>';
  }).join("");
  const bk=document.createElement("div");
  bk.id="gb-multipedido-modal-bk";
  bk.setAttribute("style","position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit");
  bk.innerHTML=
    '<div class="gb-multipedido-modal-box" style="background:#fff;border-radius:10px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-size:14px;color:#263238">'+
      '<div style="font-size:17px;font-weight:700;margin-bottom:10px;color:#0277BD">⚠️ Este cliente tiene varios pedidos abiertos</div>'+
      '<div style="background:#E1F5FE;border:1px solid #81D4FA;border-radius:6px;padding:10px 12px;margin-bottom:14px;line-height:1.45;font-size:12.5px;color:#01579B">'+
        '<strong>'+h(tgt.client||"—")+'</strong> tiene <strong>'+(opts.siblings.length+1)+' pedidos abiertos</strong>. Confirma que el pedido que vas a marcar entregado es el correcto antes de continuar.'+
      '</div>'+
      '<div style="font-size:12px;font-weight:700;color:#37474F;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Pedido a marcar entregado</div>'+
      '<div style="background:#E8F5E9;border:1.5px solid #66BB6A;border-radius:6px;padding:10px 12px;margin-bottom:14px;font-size:12.5px;line-height:1.55">'+
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:4px">'+
          '<strong style="font-family:monospace;font-size:13px;color:#1B5E20">'+h(tgt.quoteNumber||tgt.id)+'</strong>'+
          '<strong style="color:#1B5E20">'+h(fmt(tgtTotal))+'</strong>'+
        '</div>'+
        '<div style="color:#33691E"><strong>📅 Entrega:</strong> '+h(tgtFecha)+(tgt.horaEntrega?' a las '+h(tgt.horaEntrega):'')+'</div>'+
        '<div style="color:#33691E;margin-top:2px"><strong>🍽️ Productos:</strong> '+h(tgtProdLbl)+'</div>'+
        (tgt.dir?'<div style="color:#33691E;margin-top:2px"><strong>📍 Dirección:</strong> '+h(tgt.dir)+'</div>':'')+
      '</div>'+
      '<div style="font-size:12px;font-weight:700;color:#37474F;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Otros pedidos abiertos del cliente ('+opts.siblings.length+')</div>'+
      '<div style="background:#FAFAFA;border:1px solid #E0E0E0;border-radius:6px;padding:8px;margin-bottom:14px;max-height:220px;overflow-y:auto">'+
        sibsHtml+
      '</div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end">'+
        '<button id="gb-multipedido-modal-cancel" type="button" style="padding:9px 16px;border:1px solid #B0BEC5;background:#fff;color:#37474F;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit">Cancelar</button>'+
        '<button id="gb-multipedido-modal-confirm" type="button" style="padding:9px 18px;border:1px solid #2E7D32;background:#2E7D32;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">Sí, continuar con esta entrega</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(bk);
  const btnConfirm=document.getElementById("gb-multipedido-modal-confirm");
  const btnCancel=document.getElementById("gb-multipedido-modal-cancel");
  const close=()=>{bk.remove()};
  btnCancel.addEventListener("click",close);
  bk.addEventListener("click",e=>{if(e.target===bk)close()});
  btnConfirm.addEventListener("click",()=>{
    close();
    try{opts.onConfirm()}catch(e){console.error("[multipedido onConfirm]",e)}
  });
  const onKey=(e)=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",onKey)}};
  document.addEventListener("keydown",onKey);
  btnConfirm.focus();
}

// v7.0-α FIX-04: lógica original de openDeliveryModal — extraída para que el
// chequeo multi-pedido pueda invocarla post-confirmación o directo si solo hay 1 pedido.
function _doOpenDeliveryModal(docId,kind,q){
  deliverySrc={id:docId,kind:kind,doc:q};
  // v5.0: soporta fotoUrl (Storage) o fotoBase64 (legacy)
  entregaFotoBase64=q.entregaData?.fotoUrl||q.entregaData?.fotoBase64||null;
  // v6.4.0 P6: cargar segunda foto si existe
  entregaFoto2Base64=q.entregaData?.foto2Url||q.entregaData?.foto2Base64||null;
  $("dm-num").value=q.quoteNumber||q.id;
  $("dm-cli").value=q.client||"";
  $("dm-fecha").value=q.entregaData?.fechaEntrega||new Date().toISOString().slice(0,10);
  $("dm-entregado-por").value=q.entregaData?.entregadoPor&&["Kathy","Juan Pablo","Luis"].includes(q.entregaData.entregadoPor)?q.entregaData.entregadoPor:(q.entregaData?.entregadoPor?"Otro":"");
  $("dm-entregado-otro").value=q.entregaData?.entregadoPor&&!["Kathy","Juan Pablo","Luis"].includes(q.entregaData.entregadoPor)?q.entregaData.entregadoPor:"";
  $("dm-entregado-otro").classList.toggle("hidden",$("dm-entregado-por").value!=="Otro");
  $("dm-notas-entrega").value=q.entregaData?.notasEntrega||"";
  // v7.0-α FIX-02c: setear toggle visual (sincroniza checkbox hidden + estilos de los pills + visibilidad del receptor)
  _setRecibidoConforme(!!q.entregaData?.recibidoConforme);
  $("dm-receptor").value=q.entregaData?.nombreReceptor||"";
  document.querySelectorAll('input[name="dm-foto-tipo"]').forEach(r=>{r.checked=(r.value===(q.entregaData?.fotoTipo||"producto"))});
  $("dm-foto").value="";
  if(entregaFotoBase64){
    $("dm-foto-preview").innerHTML='<img src="'+entregaFotoBase64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Foto 1 cargada (cambiar = subir nueva)</div>';
  }else{$("dm-foto-preview").innerHTML=""}
  // v6.4.0 P6: preview foto 2
  if($("dm-foto2"))$("dm-foto2").value="";
  if($("dm-foto2-preview")){
    if(entregaFoto2Base64){
      $("dm-foto2-preview").innerHTML='<img src="'+entregaFoto2Base64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Foto 2 cargada (opcional)</div>';
    }else{$("dm-foto2-preview").innerHTML=""}
  }
  // v6.4.0 hallazgo-2: sincronizar botones de quitar al abrir modal
  if(typeof _syncFotoClearBtns==="function")_syncFotoClearBtns();
  $("delivery-modal").classList.remove("hidden");
}
function closeDeliveryModal(){$("delivery-modal").classList.add("hidden");deliverySrc=null;entregaFotoBase64=null;entregaFoto2Base64=null}

// v6.4.0 hallazgo-2: sincroniza visibilidad de los botones "Quitar foto"
// con la presencia real de cada foto. Llamado desde openDeliveryModal,
// previewEntregaFoto, previewEntregaFoto2 y clearEntregaFoto.
function _syncFotoClearBtns(){
  const b1=$("dm-foto-clear-btn"),b2=$("dm-foto2-clear-btn");
  if(b1)b1.classList.toggle("hidden",!entregaFotoBase64);
  if(b2)b2.classList.toggle("hidden",!entregaFoto2Base64);
}

function onEntregadoPorChange(){
  $("dm-entregado-otro").classList.toggle("hidden",$("dm-entregado-por").value!=="Otro");
}
function previewEntregaFoto(ev){
  const file=ev.target.files[0];
  if(!file){return}
  _compressImageFile(file,b64=>{
    entregaFotoBase64=b64;
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("dm-foto-preview").innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Foto 1 comprimida: '+sizeKB+' KB</div>';
    if(typeof _syncFotoClearBtns==="function")_syncFotoClearBtns();
  });
}
// v6.4.0 P6: handler para la segunda foto
function previewEntregaFoto2(ev){
  const file=ev.target.files[0];
  if(!file){return}
  _compressImageFile(file,b64=>{
    entregaFoto2Base64=b64;
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("dm-foto2-preview").innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Foto 2 comprimida: '+sizeKB+' KB</div>';
    if(typeof _syncFotoClearBtns==="function")_syncFotoClearBtns();
  });
}
// v6.4.0 P6: borra una de las fotos (1 o 2)
function clearEntregaFoto(idx){
  if(idx===2){
    entregaFoto2Base64=null;
    if($("dm-foto2-preview"))$("dm-foto2-preview").innerHTML="";
    if($("dm-foto2"))$("dm-foto2").value="";
  }else{
    entregaFotoBase64=null;
    if($("dm-foto-preview"))$("dm-foto-preview").innerHTML="";
    if($("dm-foto"))$("dm-foto").value="";
  }
  if(typeof _syncFotoClearBtns==="function")_syncFotoClearBtns();
}

async function submitDelivery(){
  if(!deliverySrc)return;
  // v7.0-α FIX-02a: gate de transición — defensa profunda en el save final
  if(!deliverySrc.doc.produced){
    if(typeof toast==="function")toast("⚠️ Falta marcar como producido antes de entregar","warn",5000);
    return;
  }
  // v7.0-α FIX-05: audit de transición FSM (no bloquea en audit, sí en enforce)
  if(typeof auditTransition==="function"&&!auditTransition(deliverySrc.doc.status,"entregado","submitDelivery "+deliverySrc.id))return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  const fecha=$("dm-fecha").value||new Date().toISOString().slice(0,10);
  let entregadoPor=$("dm-entregado-por").value;
  if(entregadoPor==="Otro"){entregadoPor=$("dm-entregado-otro").value.trim();if(!entregadoPor){alert("Indica quién entregó");return}}
  const notasEntrega=$("dm-notas-entrega").value.trim();
  const recibidoConforme=$("dm-recibido-conforme").checked;
  const nombreReceptor=$("dm-receptor").value.trim();
  const fotoTipo=document.querySelector('input[name="dm-foto-tipo"]:checked')?.value||"producto";
  const entregaData={
    fechaEntrega:fecha,entregadoPor:entregadoPor||"",
    notasEntrega:notasEntrega,recibidoConforme:recibidoConforme,
    nombreReceptor:nombreReceptor,fotoTipo:fotoTipo,
    marcadoEn:new Date().toISOString()
  };
  // v5.0: foto a Storage (solo si es base64 nueva — si es URL legacy la mantiene)
  if(entregaFotoBase64){
    if(entregaFotoBase64.startsWith("data:")){
      try{
        const {url}=await uploadFotoFromBase64(entregaFotoBase64,"entrega",deliverySrc.id,"entregas");
        entregaData.fotoUrl=url;
      }catch(e){
        console.warn("Upload foto entrega falló, fallback a base64:",e);
        entregaData.fotoBase64=entregaFotoBase64;
      }
    }else{
      // Ya es URL (doc viejo recargado)
      entregaData.fotoUrl=entregaFotoBase64;
    }
  }
  // v6.4.0 P6: misma lógica para la segunda foto
  if(entregaFoto2Base64){
    if(entregaFoto2Base64.startsWith("data:")){
      try{
        const {url}=await uploadFotoFromBase64(entregaFoto2Base64,"entrega2",deliverySrc.id,"entregas");
        entregaData.foto2Url=url;
      }catch(e){
        console.warn("Upload foto2 entrega falló, fallback a base64:",e);
        entregaData.foto2Base64=entregaFoto2Base64;
      }
    }else{
      entregaData.foto2Url=entregaFoto2Base64;
    }
  }
  try{
    showLoader("Registrando entrega...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const propId=deliverySrc.id;
    const coll=deliverySrc.kind==="quote"?"quotes":(propId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,propId),{
      status:"entregado",
      fechaEntrega:fecha,
      entregaData:entregaData,
      updatedAt:serverTimestamp(),
      ...auditStamp()
    });
    deliverySrc.doc.status="entregado";
    deliverySrc.doc.fechaEntrega=fecha;
    deliverySrc.doc.entregaData=entregaData;
    hideLoader();
    // v6.4.0 P6: si hay al menos una foto, ofrecer envío por WhatsApp a Kathy ANTES de cerrar
    const tieneFotos=!!(entregaData.fotoUrl||entregaData.foto2Url||entregaData.fotoBase64||entregaData.foto2Base64);
    const docInfoForWA={
      id:deliverySrc.id,
      kind:deliverySrc.kind,
      cliente:deliverySrc.doc.client||"—",
      direccion:deliverySrc.doc.dir||"",
      fecha:fecha,
      hora:deliverySrc.doc.horaEntrega||"",
      receptor:nombreReceptor||"",
      foto1:entregaData.fotoUrl||"",
      foto2:entregaData.foto2Url||""
    };
    closeDeliveryModal();
    toast("🎉 Entrega registrada","success");
    renderHist();
    if(curMode==="dash")renderDashboard();
    if(tieneFotos&&typeof openEntregaWhatsAppModal==="function"){
      // Pequeño delay para que se vea el toast antes del modal
      setTimeout(()=>openEntregaWhatsAppModal(docInfoForWA),700);
    }
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

// v6.4.0 P6: modal post-entrega para enviar foto(s) a Kathy por WhatsApp.
// Como solo Kathy tiene WhatsApp Business de GourmetBites, el flujo es:
//  1) Quien entrega registra la entrega + sube foto(s) a Firebase Storage
//  2) Aparece este modal con un mensaje pre-armado y los links de las fotos
//  3) Botón abre WhatsApp con el mensaje hacia el número de Kathy
//  4) Kathy descarga las fotos del link y las reenvía al cliente desde el WhatsApp Business
// La foto queda guardada en el doc → se puede reenviar después desde el historial.
const KATHY_WA_TEL=(typeof window!=="undefined"&&window.__GB_KATHY_WA)||"573104441588"; // GB WhatsApp Business (Kathy)
function openEntregaWhatsAppModal(info){
  const modal=$("entrega-wa-modal");
  if(!modal){
    // Fallback si el modal no existe (HTML viejo): abrir wa.me directo con texto
    const txt=_buildEntregaWaText(info);
    window.open("https://wa.me/"+KATHY_WA_TEL+"?text="+encodeURIComponent(txt),"_blank");
    return;
  }
  // Almacenar info para los botones
  modal._info=info;
  const cli=$("ewm-cli"),fec=$("ewm-fecha"),rec=$("ewm-receptor"),txt=$("ewm-texto");
  if(cli)cli.textContent=info.cliente;
  if(fec)fec.textContent=info.fecha+(info.hora?" "+info.hora:"");
  if(rec)rec.textContent=info.receptor||"—";
  if(txt)txt.value=_buildEntregaWaText(info);
  // Preview de fotos
  const prev=$("ewm-fotos-preview");
  if(prev){
    let html="";
    if(info.foto1)html+='<a href="'+info.foto1+'" target="_blank" style="display:inline-block;margin:4px"><img src="'+info.foto1+'" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #ddd"></a>';
    if(info.foto2)html+='<a href="'+info.foto2+'" target="_blank" style="display:inline-block;margin:4px"><img src="'+info.foto2+'" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #ddd"></a>';
    prev.innerHTML=html||'<div style="color:#999;font-size:11px;padding:6px">Sin fotos adjuntas</div>';
  }
  modal.classList.remove("hidden");
}
function closeEntregaWhatsAppModal(){
  const modal=$("entrega-wa-modal");
  if(modal){modal.classList.add("hidden");modal._info=null}
}
function _buildEntregaWaText(info){
  const li=[];
  li.push("✅ *Entrega completada — Gourmet Bites*");
  li.push("");
  li.push("👤 Cliente: "+info.cliente);
  if(info.direccion)li.push("📍 Dirección: "+info.direccion);
  li.push("📅 Fecha: "+info.fecha+(info.hora?" "+info.hora:""));
  if(info.receptor)li.push("✍️ Recibió: "+info.receptor);
  li.push("");
  if(info.foto1||info.foto2){
    li.push("📸 Fotos:");
    if(info.foto1)li.push(info.foto1);
    if(info.foto2)li.push(info.foto2);
    li.push("");
    li.push("(Descarga las fotos del link y reenvíalas al cliente desde el WhatsApp Business)");
  }
  return li.join("\n");
}
function sendEntregaWhatsApp(){
  const modal=$("entrega-wa-modal");
  const info=modal&&modal._info;
  if(!info)return;
  const customTxt=$("ewm-texto")?.value||_buildEntregaWaText(info);
  const url="https://wa.me/"+KATHY_WA_TEL+"?text="+encodeURIComponent(customTxt);
  window.open(url,"_blank");
  closeEntregaWhatsAppModal();
}
function copyEntregaWhatsAppText(){
  const txt=$("ewm-texto")?.value||"";
  if(!txt)return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>{
      if(typeof toast==="function")toast("📋 Mensaje copiado","success",2000);
    }).catch(()=>{
      if(typeof toast==="function")toast("No se pudo copiar","error");
    });
  }
}
// v6.4.0 P6: reabrir el modal WhatsApp desde el historial (entregas pasadas)
function reopenEntregaWhatsApp(docId,kind){
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q||!q.entregaData){if(typeof toast==="function")toast("No hay datos de entrega","warn");return}
  const ed=q.entregaData;
  const tieneFotos=!!(ed.fotoUrl||ed.foto2Url||ed.fotoBase64||ed.foto2Base64);
  if(!tieneFotos){if(typeof toast==="function")toast("Esta entrega no tiene fotos guardadas","warn");return}
  openEntregaWhatsAppModal({
    id:docId,kind:kind,
    cliente:q.client||"—",
    direccion:q.dir||"",
    fecha:ed.fechaEntrega||q.fechaEntrega||"",
    hora:q.horaEntrega||"",
    receptor:ed.nombreReceptor||"",
    foto1:ed.fotoUrl||"",
    foto2:ed.foto2Url||""
  });
}

// Compat: el botón legacy markAsDelivered (si alguien lo llama) abre el modal nuevo
function markAsDelivered(propId,ev){
  const q=quotesCache.find(x=>x.id===propId);
  if(!q)return;
  openDeliveryModal(propId,q.kind,ev);
}

// ═══════════════════════════════════════════════════════════
// v4.12: COMENTARIOS DEL CLIENTE
// ═══════════════════════════════════════════════════════════
let comentSrc=null;
let comentFotoBase64=null;

function openComentModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No encontrado");return}
  comentSrc={id:docId,kind:kind,doc:q};
  const c=q.comentarioCliente||{};
  comentFotoBase64=c.fotoUrl||c.fotoBase64||null; // v5.0: fotoUrl o legacy base64
  $("cm-num").value=q.quoteNumber||q.id;
  $("cm-cli").value=q.client||"";
  $("cm-fecha").value=c.fecha||new Date().toISOString().slice(0,10);
  $("cm-texto").value=c.texto||"";
  $("cm-foto").value="";
  if(comentFotoBase64)$("cm-foto-preview").innerHTML='<img src="'+comentFotoBase64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd">';
  else $("cm-foto-preview").innerHTML="";
  $("coment-modal").classList.remove("hidden");
}
function closeComentModal(){$("coment-modal").classList.add("hidden");comentSrc=null;comentFotoBase64=null}
function previewComentFoto(ev){
  const file=ev.target.files[0];if(!file)return;
  _compressImageFile(file,b64=>{
    comentFotoBase64=b64;
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("cm-foto-preview").innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Comprimida: '+sizeKB+' KB</div>';
  });
}

async function submitComentario(){
  if(!comentSrc)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  const texto=$("cm-texto").value.trim();
  if(!texto&&!comentFotoBase64){alert("Agrega texto o una foto");return}
  const fecha=$("cm-fecha").value||new Date().toISOString().slice(0,10);
  const comentarioCliente={texto:texto,fecha:fecha,registradoEn:new Date().toISOString()};
  // v5.0: foto a Storage
  if(comentFotoBase64){
    if(comentFotoBase64.startsWith("data:")){
      try{
        const {url}=await uploadFotoFromBase64(comentFotoBase64,"comentario",comentSrc.id,"comentarios");
        comentarioCliente.fotoUrl=url;
      }catch(e){
        console.warn("Upload foto comentario falló, fallback a base64:",e);
        comentarioCliente.fotoBase64=comentFotoBase64;
      }
    }else{
      comentarioCliente.fotoUrl=comentFotoBase64;
    }
  }
  try{
    showLoader("Guardando comentario...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const propId=comentSrc.id;
    const coll=comentSrc.kind==="quote"?"quotes":(propId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,propId),{comentarioCliente:comentarioCliente,updatedAt:serverTimestamp(),...auditStamp()});
    comentSrc.doc.comentarioCliente=comentarioCliente;
    hideLoader();closeComentModal();
    toast("💬 Comentario guardado","success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

// ═══════════════════════════════════════════════════════════
// v4.12.7: Eliminar doc fantasma (GB-PF-* guardado por error en proposals/)
// ═══════════════════════════════════════════════════════════
async function deleteWrongDoc(docId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  if(!docId||!docId.startsWith("GB-PF-")){alert("Solo aplica a docs con prefijo GB-PF-");return}
  if(!confirm("🗑️ Eliminar fantasma\n\n"+docId+" quedó guardado por error en la colección 'proposals/' (pasó antes de v4.12.7 cuando alguien editó una PF directamente).\n\nLa PF real sigue intacta en 'propfinals/'.\n\n¿Confirmar borrado del fantasma?"))return;
  try{
    showLoader("Eliminando fantasma...");
    const {db,doc,deleteDoc}=window.fb;
    await deleteDoc(doc(db,"proposals",docId));
    // Quitar del cache local
    quotesCache=quotesCache.filter(x=>!(x.id===docId&&x._wrongCollection));
    hideLoader();
    toast("✅ Fantasma eliminado","success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

// v4.12.7: limpieza masiva de fantasmas — llamar desde consola del navegador
// Ejemplo: cleanupWrongDocs()
async function cleanupWrongDocs(){
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión");return}
  const fantasmas=quotesCache.filter(q=>q._wrongCollection);
  if(!fantasmas.length){toast("🎉 No hay fantasmas. Todo limpio","success");return}
  const lista=fantasmas.map(q=>"• "+q.id+" ("+(q.client||"—")+")").join("\n");
  if(!confirm("🧹 Limpieza de docs fantasmas\n\nSe detectaron "+fantasmas.length+" docs GB-PF-* mal guardados en la colección 'proposals/':\n\n"+lista+"\n\nLas PF reales en 'propfinals/' están intactas.\n\n¿Eliminar todos los fantasmas?"))return;
  try{
    showLoader("Limpiando "+fantasmas.length+" fantasmas...");
    const {db,doc,deleteDoc}=window.fb;
    let ok=0,fail=0;
    for(const q of fantasmas){
      try{await deleteDoc(doc(db,"proposals",q.id));ok++}
      catch(e){fail++;console.warn("No se pudo eliminar "+q.id,e)}
    }
    quotesCache=quotesCache.filter(x=>!x._wrongCollection);
    hideLoader();
    toast("✅ Limpieza completa · Eliminados: "+ok+(fail?" · Fallidos: "+fail:""),fail?"warn":"success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}

// ═══════════════════════════════════════════════════════════
// v5.0.3: ANULAR PEDIDO / EVENTO
// Permite regresar un pedido en estado pedido/aprobada/en_produccion
// a estado "anulada" (registro histórico) o "enviada" (cotización viva).
// Opcionalmente registra una devolución como pago negativo si hubo anticipo.
// ═══════════════════════════════════════════════════════════

const MOTIVOS_ANULACION={
  cliente_cancelo:"Cliente canceló",
  no_pago_anticipo:"Cliente no pagó anticipo",
  no_pudimos_producir:"No pudimos producir / cambio de agenda",
  error_cotizacion:"Error en cotización",
  problema_pago:"Problema con el pago / chargeback",
  otro:"Otro"
};

let _anularCtx=null;

function openAnularModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");else alert("Sin conexión.");return}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){if(typeof toast==="function")toast("No se encontró el documento","error");else alert("No se encontró el documento.");return}
  const status=q.status||"enviada";
  if(!["pedido","aprobada","en_produccion"].includes(status)){
    toast("Solo se pueden anular pedidos en estado Pedido, Aprobada o En producción. Estado actual: "+(STATUS_META[status]?.label||status),"warn",6000);
    return;
  }
  // v6.0.0: si ya fue cobrado al 100%, bloquear la anulación desde el modal también
  // (defensa en profundidad — el botón UI ya lo oculta via canAnular).
  const _total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||q.totalReal||0);
  const _cobrado=totalCobrado(q);
  if(_total>0&&_cobrado>=_total){
    toast("❌ No se puede anular: cliente ya pagó 100% ("+fm(_cobrado)+"/"+fm(_total)+"). Registra devolución manual desde 'Ver pagos' si necesitas revertir.","warn",8000);
    return;
  }
  _anularCtx={docId:docId,kind:kind,q:q};
  $("an-doc-id").textContent=q.quoteNumber||q.id;
  $("an-doc-cli").textContent=q.client||"—";
  $("an-doc-estado").textContent="Estado: "+(STATUS_META[status]?.label||status)+" · Total: "+fm(q.total||0)+(q.eventDate?" · Entrega: "+q.eventDate:"");
  $("an-motivo").value="";
  $("an-motivo-otro").value="";
  $("an-motivo-otro-wrap").classList.add("hidden");
  $("an-notas").value="";
  $("an-accion").value="anular";
  // Fecha default para devolución = hoy
  $("an-dev-fecha").value=new Date().toISOString().slice(0,10);
  $("an-dev-monto").value="";
  $("an-dev-metodo").value="";
  $("an-dev-notas").value="";
  // Si hay pagos previos, mostrar bloque de devolución con total cobrado
  const cobrado=totalCobrado(q);
  if(cobrado>0){
    $("an-pagos-total").textContent=fm(cobrado);
    $("an-devolucion-wrap").classList.remove("hidden");
    // Sugerir monto = total cobrado
    $("an-dev-monto").value=cobrado;
  }else{
    $("an-devolucion-wrap").classList.add("hidden");
  }
  $("anular-modal").classList.remove("hidden");
}
function closeAnularModal(){
  $("anular-modal").classList.add("hidden");
  _anularCtx=null;
}
function onMotivoChange(){
  const v=$("an-motivo").value;
  if(v==="otro")$("an-motivo-otro-wrap").classList.remove("hidden");
  else $("an-motivo-otro-wrap").classList.add("hidden");
}

async function submitAnular(){
  if(!_anularCtx){alert("Contexto perdido.");return}
  const motivo=$("an-motivo").value;
  if(!motivo){alert("Escoge un motivo.");return}
  const motivoLabel=motivo==="otro"?($("an-motivo-otro").value.trim()||"Otro"):MOTIVOS_ANULACION[motivo];
  if(motivo==="otro"&&!$("an-motivo-otro").value.trim()){alert("Especifica el motivo 'Otro'.");return}
  const notas=$("an-notas").value.trim();
  const accion=$("an-accion").value;
  if(!["anular","regresar"].includes(accion)){alert("Escoge qué hacer con el registro.");return}

  const {docId,kind,q}=_anularCtx;
  const cobrado=totalCobrado(q);
  // Devolución opcional
  let devPago=null;
  const devMonto=parseInt($("an-dev-monto").value)||0;
  if(cobrado>0&&devMonto>0){
    const devFecha=$("an-dev-fecha").value;
    const devMetodo=$("an-dev-metodo").value||"Sin especificar";
    const devNotas=$("an-dev-notas").value.trim();
    if(!devFecha){alert("Escoge la fecha de la devolución.");return}
    devPago={
      fecha:devFecha,
      monto:-Math.abs(devMonto), // negativo para que reste del cobrado
      metodo:devMetodo,
      tipo:"devolucion",
      notas:devNotas||"Devolución por anulación: "+motivoLabel,
      registradoEn:new Date().toISOString()
    };
  }

  try{
    showLoader("Anulando...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(docId&&docId.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";

    const anuladaData={
      fecha:new Date().toISOString(),
      motivo:motivo,
      motivoLabel:motivoLabel,
      notas:notas,
      accion:accion, // "anular" o "regresar"
      estadoAnterior:q.status,
      totalCobradoAlAnular:cobrado
    };

    const patch={updatedAt:serverTimestamp()};
    if(typeof auditStamp==="function")Object.assign(patch,auditStamp());

    if(accion==="anular"){
      patch.status="anulada";
      patch.anuladaData=anuladaData;
      patch.needsSync=false; // ya no va a agenda
    }else{
      // Regresar a cotización viva
      patch.status="enviada";
      patch.anuladaData=anuladaData; // se guarda el histórico del regreso igual
      patch.orderData=null;
      patch.approvalData=null;
      patch.eventDate=null;
      patch.horaEntrega=null;
      patch.productionDate=null;
      patch.produced=false;
      patch.producedAt=null;
      patch.needsSync=false;
      patch.lastSyncAt=null;
    }

    // Agregar devolución a pagos[] si aplica
    if(devPago){
      const pagosExistentes=getPagos(q)||[];
      const pagosNuevos=[...pagosExistentes,devPago];
      patch.pagos=pagosNuevos;
    }

    await updateDoc(doc(db,coll,docId),patch);
    // Actualizar cache local
    const local=quotesCache.find(x=>x.id===docId&&x.kind===kind);
    if(local){
      local.status=patch.status;
      local.anuladaData=anuladaData;
      if(accion==="regresar"){
        local.orderData=null;
        local.approvalData=null;
        local.eventDate=null;
        local.horaEntrega=null;
        local.productionDate=null;
        local.produced=false;
        local.producedAt=null;
      }
      if(devPago)local.pagos=patch.pagos;
      local.needsSync=false;
    }
    hideLoader();
    closeAnularModal();
    const msg=accion==="anular"
      ? "❌ "+(q.quoteNumber||docId)+" anulada: "+motivoLabel+(devPago?" · Devolución registrada "+fm(Math.abs(devPago.monto)):"")
      : "↩️ "+(q.quoteNumber||docId)+" regresada a cotización viva · "+motivoLabel+(devPago?" · Devolución registrada "+fm(Math.abs(devPago.monto)):"");
    toast(msg,"success");
    renderHist();
    if(curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
    if(typeof renderMiniDash==="function")renderMiniDash();
  }catch(e){
    hideLoader();
    toast("Error al anular: "+(e.message||e),"error");
    console.error(e);
  }
}

// ═══════════════════════════════════════════════════════════
// v5.4.1 (Bloque B): MODAL "VER PDFs ANTERIORES"
// ═══════════════════════════════════════════════════════════
// Muestra todas las versiones de PDF generadas para un doc, con link de
// descarga directa desde Firebase Storage. La versión más reciente se
// marca "actual" visualmente. Si un upload a Storage falló en su momento,
// esa entrada no estará en el historial (porque el helper hace best-effort).
function openPdfHistorialModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){if(typeof toast==="function")toast("No se encontró el documento","error");else alert("No se encontró el documento");return}
  const hist=Array.isArray(q.pdfHistorial)?q.pdfHistorial:[];
  if(!hist.length){alert("Este documento no tiene historial de PDFs guardado en Storage.");return}
  $("ph-doc-id").textContent=q.quoteNumber||q.id;
  $("ph-doc-cli").textContent=q.client||"—";
  $("ph-doc-meta").textContent=(kind==="quote"?"Cotización":(kind==="propfinal"?"Propuesta Final":"Propuesta"))+" · "+hist.length+" versión"+(hist.length!==1?"es":"");
  // v5.5.0: banner de PDF desactualizado si doc fue editado después del último PDF
  let bannerDesact="";
  if(typeof pdfDesactualizado==="function"&&pdfDesactualizado(q)){
    bannerDesact='<div style="background:#FFF3E0;border:1px solid #FFB74D;color:#E65100;padding:9px 12px;border-radius:8px;margin-bottom:10px;font-size:12px;font-weight:600">⚠️ Doc editado después de este PDF. Considera regenerar para tener una versión actualizada.</div>';
  }
  // Ordenar: más reciente primero (mayor version)
  const sorted=[...hist].sort((a,b)=>(b.version||0)-(a.version||0));
  const maxV=sorted[0]?.version||0;
  const listHtml=sorted.map(e=>{
    const isLatest=(e.version===maxV);
    const fecha=(e.fecha||"").slice(0,10);
    const hora=(e.fecha||"").slice(11,16);
    const fn=e.filename||("v"+e.version+".pdf");
    const tag=isLatest?'<span style="background:#E8F5E9;color:#1B5E20;padding:2px 7px;border-radius:10px;font-size:9.5px;font-weight:700;margin-left:6px">ACTUAL</span>':'';
    const url=e.url||"#";
    // v5.4.4 BUG-012 fix: agregado botón "Ver" (preview) además de "Descargar" para flujo móvil → WhatsApp.
    return '<div style="padding:10px 12px;border:1px solid #E0E0E0;border-radius:8px;margin-bottom:8px;background:'+(isLatest?'#F1F8E9':'#FAFAFA')+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:6px;flex-wrap:wrap">'+
        '<div style="font-size:12px;font-weight:700;color:#1A1A1A">Versión '+e.version+tag+'</div>'+
        '<div style="display:flex;gap:6px">'+
          '<a href="'+url+'" target="_blank" rel="noopener" style="font-size:11px;font-weight:600;color:#0D47A1;text-decoration:none;padding:5px 10px;background:#E3F2FD;border:1px solid #90CAF9;border-radius:12px">👁️ Ver</a>'+
          '<a href="'+url+'" download style="font-size:11px;font-weight:600;color:#1B5E20;text-decoration:none;padding:5px 10px;background:#E8F5E9;border:1px solid #A5D6A7;border-radius:12px">📥 Descargar</a>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:10px;color:#666;line-height:1.4">'+
        '<div>📆 '+fecha+(hora?' · '+hora:'')+'</div>'+
        '<div>👤 '+((e.generadoPor||"?").replace(/[<>]/g,""))+'</div>'+
        '<div style="font-family:monospace;font-size:9.5px;color:#999;margin-top:2px;word-break:break-all">'+(fn||"").replace(/[<>]/g,"")+'</div>'+
      '</div>'+
    '</div>';
  }).join("");
  $("ph-list").innerHTML=bannerDesact+listHtml;
  $("pdf-hist-modal").classList.remove("hidden");
}

function closePdfHistorialModal(){
  $("pdf-hist-modal").classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════
// v5.4.2: NAVEGADOR GLOBAL DE TODOS LOS PDFs
// ═══════════════════════════════════════════════════════════
// Recorre quotesCache, junta todos los pdfHistorial de todos los docs,
// permite buscar/filtrar por cliente/número y descargar cada versión.
let _pdfGlobalFilter=""; // búsqueda en vivo

function openAllPdfsModal(){
  // Forzar carga si no hay cache
  if(!quotesCache||!quotesCache.length){
    loadAllHistory().then(()=>openAllPdfsModal());
    return;
  }
  _pdfGlobalFilter="";
  const input=$("pga-search");
  if(input)input.value="";
  renderAllPdfsList();
  $("all-pdfs-modal").classList.remove("hidden");
  setTimeout(()=>input?.focus(),100);
}

function closeAllPdfsModal(){
  $("all-pdfs-modal").classList.add("hidden");
  _pdfGlobalFilter="";
}

function onAllPdfsSearchInput(ev){
  _pdfGlobalFilter=(ev.target.value||"").toLowerCase().trim();
  renderAllPdfsList();
}

// v5.4.3: refresca el badge ⚠️ del botón "Todos los PDFs" en header
// del historial según cantidad de docs con pdfUploadFailed=true
function refreshAllPdfsBadge(){
  const badge=$("btn-all-pdfs-badge");
  if(!badge)return;
  const fallidos=(quotesCache||[]).filter(q=>q.pdfUploadFailed===true).length;
  if(fallidos>0){
    badge.textContent="⚠️ "+fallidos;
    badge.style.display="inline-block";
    badge.classList.remove("hidden");
    // También tintar el botón para más visibilidad
    const btn=$("btn-all-pdfs");
    if(btn){btn.style.background="#FFF3E0";btn.style.borderColor="#FB8C00";btn.style.color="#BF360C"}
  }else{
    badge.style.display="none";
    badge.classList.add("hidden");
    const btn=$("btn-all-pdfs");
    if(btn){btn.style.background="";btn.style.borderColor="";btn.style.color=""}
  }
}

function renderAllPdfsList(){
  const listEl=$("pga-list");
  const statsEl=$("pga-stats");
  if(!listEl)return;
  // Juntar todos los docs que tengan pdfHistorial
  const docsConPdf=(quotesCache||[])
    .filter(q=>Array.isArray(q.pdfHistorial)&&q.pdfHistorial.length>0)
    .map(q=>{
      // Mapear: encontrar la versión más reciente para ordenar
      const hist=q.pdfHistorial;
      const maxV=Math.max(...hist.map(e=>e.version||0));
      const latest=hist.find(e=>e.version===maxV);
      return {
        id:q.id,
        kind:q.kind,
        quoteNumber:q.quoteNumber||q.id,
        client:q.client||"—",
        total:q.total||0,
        dateISO:q.dateISO||"",
        hist:hist,
        latestDate:latest?.fecha||"",
        versionCount:hist.length
      };
    });
  // Ordenar por PDF más reciente primero
  docsConPdf.sort((a,b)=>(b.latestDate||"").localeCompare(a.latestDate||""));
  // Filtrar por búsqueda
  const q=_pdfGlobalFilter;
  const filtered=q?docsConPdf.filter(d=>{
    return (d.quoteNumber||"").toLowerCase().includes(q)||
           (d.client||"").toLowerCase().includes(q);
  }):docsConPdf;
  // Stats
  const totalPdfs=docsConPdf.reduce((s,d)=>s+d.versionCount,0);
  // v5.4.3: docs con upload fallido (todos los que tienen el flag, aunque no tengan hist)
  const fallidos=(quotesCache||[]).filter(x=>x.pdfUploadFailed===true);
  if(statsEl){
    let statsHtml="📊 "+docsConPdf.length+" documento"+(docsConPdf.length!==1?'s':'')+" · "+totalPdfs+" PDF"+(totalPdfs!==1?'s':'')+" en la nube"+
      (q?' · <strong style="color:#0D47A1">'+filtered.length+' coinciden</strong>':'');
    if(fallidos.length){
      statsHtml+='<div style="margin-top:6px;padding:6px 10px;background:#FFF3E0;border-left:3px solid #FB8C00;border-radius:6px;font-size:11px;color:#BF360C;font-weight:600">⚠️ '+fallidos.length+' PDF'+(fallidos.length!==1?'s':'')+' no se pudo subir a la nube (mira abajo · puedes reintentar regenerando el PDF)</div>';
    }
    statsEl.innerHTML=statsHtml;
  }
  // Render sección de fallidos arriba si hay
  let fallidosHtml="";
  if(fallidos.length){
    // v5.4.4: botón "Reintentar todos" para regenerar PDFs huérfanos en bulk
    fallidosHtml='<div style="margin-bottom:12px;padding:10px;border:1.5px dashed #FB8C00;border-radius:8px;background:#FFFBF5">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;flex-wrap:wrap">'+
        '<div style="font-size:11.5px;font-weight:700;color:#BF360C">⚠️ PDFs pendientes de subir ('+fallidos.length+')</div>'+
        '<button onclick="retryAllFailedPdfs()" id="btn-retry-all-pdfs" style="font-size:10.5px;padding:5px 11px;background:#FB8C00;color:#fff;border:none;border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit">🔄 Reintentar todos</button>'+
      '</div>'+
      fallidos.map(q=>{
        const qNum=q.quoteNumber||q.id;
        const err=(q.pdfUploadLastError||"").replace(/[<>]/g,"").slice(0,80);
        const lastAt=(q.pdfUploadLastAttempt||"").slice(0,16).replace("T"," ");
        return '<div style="padding:7px 9px;background:#fff;border:1px solid #FFCC80;border-radius:6px;margin-bottom:5px;cursor:pointer" onclick="closeAllPdfsModal();openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
          '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px"><span style="font-weight:700;color:#1A1A1A">'+qNum+'</span><span style="color:#BF360C;font-size:10px">↗ Abrir y regenerar</span></div>'+
          '<div style="font-size:10.5px;color:#455A64;margin-top:2px">'+(q.client||"—").replace(/[<>]/g,"")+'</div>'+
          (lastAt?'<div style="font-size:9.5px;color:#888;margin-top:2px">Último intento: '+lastAt+'</div>':'')+
          (err?'<div style="font-size:9.5px;color:#B71C1C;margin-top:2px;font-style:italic">'+err+'</div>':'')+
        '</div>';
      }).join("")+
    '</div>';
  }
  if(!filtered.length){
    if(!docsConPdf.length){
      listEl.innerHTML=fallidosHtml+'<div style="padding:30px 20px;text-align:center;color:#999"><div style="font-size:36px;margin-bottom:8px">📭</div><strong style="color:#555">Aún no hay PDFs en la nube</strong><br><span style="font-size:11.5px">Cada vez que generes o regeneres un PDF (desde v5.4.1) queda una copia aquí automáticamente.</span></div>';
    }else{
      listEl.innerHTML=fallidosHtml+'<div style="padding:30px 20px;text-align:center;color:#999"><div style="font-size:28px;margin-bottom:6px">🔍</div>Nada coincide con "<strong>'+(q||"").replace(/[<>]/g,"")+'</strong>"</div>';
    }
    return;
  }
  const html=filtered.map(d=>{
    const kindLabel=d.kind==="quote"?"Cotización":(d.id.startsWith("GB-PF-")?"Propuesta Final":"Propuesta");
    // Sub-lista de versiones (ordenada desc)
    const sorted=[...d.hist].sort((a,b)=>(b.version||0)-(a.version||0));
    const maxV=sorted[0]?.version||0;
    const versionesHtml=sorted.map(e=>{
      const isLatest=(e.version===maxV);
      const fecha=(e.fecha||"").slice(0,10);
      const hora=(e.fecha||"").slice(11,16);
      const tag=isLatest?'<span style="background:#C8E6C9;color:#1B5E20;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:700;margin-left:4px">ACTUAL</span>':'';
      const url=e.url||"";
      // v5.4.4 BUG-012 fix: botones explícitos Ver (preview en nueva pestaña) y Descargar (download directo).
      // Antes la fila completa era un <a> solo con ícono 📥 — UX confusa, Luis no sabía qué hacía al tocar.
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:'+(isLatest?'#F1F8E9':'#FAFAFA')+';border:1px solid '+(isLatest?'#A5D6A7':'#E0E0E0')+';border-radius:6px;margin-bottom:4px;font-size:11px;color:#263238;gap:6px">'+
        '<span style="flex:1;min-width:0">v'+e.version+tag+' <span style="color:#888;font-size:10px;margin-left:4px">· '+fecha+(hora?' '+hora:'')+'</span></span>'+
        '<a href="'+url+'" target="_blank" rel="noopener" style="font-size:10px;padding:3px 8px;background:#E3F2FD;color:#0D47A1;border:1px solid #90CAF9;border-radius:10px;text-decoration:none;font-weight:600;white-space:nowrap">👁️ Ver</a>'+
        '<a href="'+url+'" download style="font-size:10px;padding:3px 8px;background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;border-radius:10px;text-decoration:none;font-weight:600;white-space:nowrap">📥 Descargar</a>'+
      '</div>';
    }).join("");
    return '<div style="padding:12px;border:1px solid #CFD8DC;border-radius:10px;margin-bottom:10px;background:#fff">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:10px">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:700;color:#1A1A1A">'+d.quoteNumber+'</div>'+
          '<div style="font-size:11.5px;color:#455A64;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(d.client||"—").replace(/[<>]/g,"")+'</div>'+
          '<div style="font-size:10px;color:#78909C;margin-top:2px">'+kindLabel+' · '+fm(d.total)+' · '+(d.dateISO||"—")+'</div>'+
        '</div>'+
        '<button onclick="closeAllPdfsModal();openDocument(\''+d.kind+'\',\''+d.id+'\')" style="font-size:10.5px;background:#ECEFF1;border:1px solid #B0BEC5;color:#455A64;padding:4px 10px;border-radius:12px;cursor:pointer;white-space:nowrap;font-family:inherit">📂 Abrir cotización</button>'+
      '</div>'+
      '<div style="margin-top:8px">'+versionesHtml+'</div>'+
    '</div>';
  }).join("");
  listEl.innerHTML=fallidosHtml+html;
}

// ═══════════════════════════════════════════════════════════
// v5.4.4: REINTENTAR TODOS LOS PDFs FALLIDOS
// ═══════════════════════════════════════════════════════════
// Abre uno por uno los documentos con pdfUploadFailed=true para que Luis
// los regenere manualmente. No automatizamos el loop porque genPDF/genPropPDF
// dependen del estado del formulario (inputs cargados por loadQuote). Abrir
// de a uno con guía explícita es más robusto que simular un submit en loop.
async function retryAllFailedPdfs(){
  const fallidos=(quotesCache||[]).filter(q=>q.pdfUploadFailed===true);
  if(!fallidos.length){
    toast("✅ No hay PDFs pendientes de subir. Todo al día.","success",4000);
    return;
  }
  const nombres=fallidos.map(q=>(q.quoteNumber||q.id)+" ("+(q.client||"—")+")").slice(0,5).map(n=>h(n)).join("<br>• ");
  const extra=fallidos.length>5?"<br>• ...y "+(fallidos.length-5)+" más":"";
  const body="Se van a abrir <strong>"+fallidos.length+"</strong> documento(s) con PDF pendiente:<br><br>• "+nombres+extra+
    "<br><br><strong>PROCESO:</strong><br>1. Abriré el primer documento<br>2. Clic en \"Generar PDF\" para regenerarlo<br>3. Vuelve y clic \"Reintentar todos\" otra vez<br>4. Repite hasta vaciar la lista";
  const ok=await confirmModal({
    title:"Reintentar PDFs pendientes",
    body,
    okLabel:"Continuar con el primero",
    tone:"primary"
  });
  if(!ok)return;
  // Abrir el primero
  const q=fallidos[0];
  closeAllPdfsModal();
  try{
    await loadQuote(q.kind,q.id);
    // Toast guía (el alert bloquea menos que otro confirm)
    setTimeout(()=>{
      toast("📄 Documento abierto: "+(q.quoteNumber||q.id)+". Clic en \"Generar PDF\" para regenerarlo. Quedan "+fallidos.length+" pendiente(s).","info",6000);
    },400);
  }catch(e){
    console.error("[retryAllFailedPdfs] error abriendo doc:",e);
    toast("⚠️ No pude abrir "+(q.quoteNumber||q.id)+": "+(e&&e.message||e),"error",6000);
  }
}

// v5.5.0 FIX #1: requestEdit — intercepta clic en Editar para docs que requieren advertencia.
// Muestra modal de advertencia; si el usuario confirma, procede con loadQuote.
function requestEdit(kind,docId){
  const q=(quotesCache||[]).find(x=>x.id===docId&&x.kind===kind);
  if(!q){if(typeof toast==="function")toast("No se encontró el documento","error");else alert("No se encontró el documento");return}
  if(typeof requiresWarning==="function"&&requiresWarning(q)&&typeof openEditWarningModal==="function"){
    openEditWarningModal(q,function(){loadQuote(kind,docId)});
  }else{
    loadQuote(kind,docId);
  }
}
