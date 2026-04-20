// ═══════════════════════════════════════════════════════════
// app-historial.js · v4.12 · 2026-04-19
// Historial + ciclo de vida (order/approve/saldo) + pagos +
// duplicar + features v4.12: foto entrega, notas producción,
// notas entrega, quién entregó, recibido conforme, comentarios cliente.
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
async function renderHist(){
  const el=$("hist-list");
  el.innerHTML='<div class="empty"><div class="spinner" style="margin:0 auto 10px"></div><p>Cargando historial...</p></div>';
  try{await loadAllHistory()}catch(e){}
  if(!quotesCache.length){el.innerHTML='<div class="empty"><div class="ic">📁</div><p>No hay cotizaciones guardadas</p></div>';return}
  const cnt={all:quotesCache.length,cot:0,prop:0,pedido:0,propfinal:0,aprobada:0,en_produccion:0};
  quotesCache.forEach(q=>{
    const s=q.status||"enviada";
    if(q.kind==="quote")cnt.cot++;else cnt.prop++;
    if(s==="pedido")cnt.pedido++;
    if(s==="propfinal")cnt.propfinal++;
    if(s==="aprobada")cnt.aprobada++;
    if(s==="en_produccion")cnt.en_produccion++;
  });
  const filtered=quotesCache.filter(q=>{
    if(histFilter==="all")return true;
    if(histFilter==="cot")return q.kind==="quote";
    if(histFilter==="prop")return q.kind==="proposal";
    const s=q.status||"enviada";
    return s===histFilter;
  });
  const mkFilter=(k,label,n)=>'<button class="hist-filter '+(histFilter===k?"act":"")+'" onclick="setHistFilter(\''+k+'\')">'+label+'<span class="cnt">'+n+'</span></button>';
  const filtersBar='<div class="hist-filters">'+
    mkFilter("all","Todas",cnt.all)+
    mkFilter("cot","Cotizaciones",cnt.cot)+
    mkFilter("prop","Propuestas",cnt.prop)+
    mkFilter("pedido","Pedidos",cnt.pedido)+
    mkFilter("propfinal","P. Final",cnt.propfinal)+
    mkFilter("aprobada","Aprobadas",cnt.aprobada)+
    mkFilter("en_produccion","En producción",cnt.en_produccion)+'</div>';
  if(!filtered.length){el.innerHTML=filtersBar+'<div class="empty"><div class="ic">🔍</div><p>Sin resultados para este filtro</p></div>';return}
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
    const _pagos=getPagos(q);
    const _cobrado=totalCobrado(q);
    const _saldo=saldoPendiente(q);
    const _total=q.total||0;
    const pagadoBadge=(_total>0&&_cobrado>=_total)?'<span class="hc-pagado-ok">💰 Pagado ✓</span>':(q.saldoData?'<span class="hc-saldo-ok">💰 Saldo ✓</span>':'');
    const prodBadge=q.produced?'<span class="hc-prod-ok">🔪 Producido</span>':'';
    const comentBadge=q.comentarioCliente?.texto?'<span class="hc-coment-ok">💬 Comentario</span>':'';
    const actionBtns=[];
    // Ciclo de vida según tipo + status
    if(!isProp&&status==="enviada"){
      actionBtns.push('<button class="btn hc-btn-edit" onclick="event.stopPropagation();loadQuote(\'quote\',\''+q.id+'\')">✏️ Editar</button>');
      actionBtns.push('<button class="btn hc-btn-order" onclick="openOrderModal(\''+q.id+'\',event)">✅ Marcar como pedido</button>');
    }else if(!isProp&&(status==="pedido"||status==="en_produccion")){
      if(!q.eventDate)actionBtns.push('<button class="btn hc-btn-order" onclick="assignDeliveryDate(\''+q.id+'\',event)">📅 Asignar fecha de entrega</button>');
      if(!q.produced)actionBtns.push('<button class="btn hc-btn-edit" onclick="toggleProduced(\''+q.id+'\',\'quote\',event)">🔪 Marcar producido</button>');
      actionBtns.push('<button class="btn hc-btn-deliver" onclick="openDeliveryModal(\''+q.id+'\',\'quote\',event)">🎉 Marcar como entregado</button>');
      if(q.eventDate||q.productionDate)actionBtns.push('<button class="btn hc-btn-ics" onclick="exportPedidoIcs(\''+q.id+'\',\'quote\',event)">📅 .ics</button>');
    }else if(isProp&&status==="enviada"){
      const hasMulti=(q.sections||[]).some(s=>(s.options||[]).length>1);
      if(hasMulti)actionBtns.push('<button class="btn hc-btn-final" onclick="openPropFinalFlow(\''+q.id+'\',event)">✓ Generar Propuesta Final</button>');
      else actionBtns.push('<button class="btn hc-btn-approve" onclick="openApproveModal(\''+q.id+'\',\'proposal\',event)">✓ Marcar como aprobada</button>');
    }else if(isProp&&status==="propfinal"){
      actionBtns.push('<button class="btn hc-btn-approve" onclick="openApproveModal(\''+q.id+'\',\'proposal\',event)">✓ Marcar como aprobada</button>');
    }else if(isProp&&(status==="aprobada"||status==="en_produccion")){
      if(!q.produced)actionBtns.push('<button class="btn hc-btn-edit" onclick="toggleProduced(\''+q.id+'\',\'proposal\',event)">🔪 Marcar producido</button>');
      actionBtns.push('<button class="btn hc-btn-deliver" onclick="openDeliveryModal(\''+q.id+'\',\'proposal\',event)">🎉 Marcar como entregado</button>');
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
    const _puedePago=(!isProp&&["pedido","en_produccion","entregado"].includes(status))||(isProp&&["aprobada","en_produccion","entregado"].includes(status));
    if(_puedePago&&_saldo>0)actionBtns.push('<button class="btn hc-btn-pago" onclick="openPagoModal(\''+q.id+'\',event)">💵 Registrar pago</button>');
    if(_pagos.length>0)actionBtns.push('<button class="btn hc-btn-pagos-ver" onclick="openVerPagosModal(\''+q.id+'\',event)">📒 Ver pagos ('+_pagos.length+')</button>');
    // v4.12: comentario cliente disponible si entregado o ya hay uno
    if(status==="entregado"||q.comentarioCliente){
      actionBtns.push('<button class="btn hc-btn-coment" onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\',event)">💬 '+(q.comentarioCliente?'Editar':'Registrar')+' comentario</button>');
    }
    const actions=actionBtns.length?'<div class="hc-actions">'+actionBtns.join("")+'</div>':"";
    const summary=isProp
      ?'<div class="hc-items">'+(q.sections||[]).length+' secciones · '+(q.pers||"?")+' personas</div>'
      :'<div class="hc-total">'+fm(q.total||0)+'</div><div class="hc-items">'+((q.cart||[]).length+(q.cust||[]).length)+' productos</div>';
    // v4.12.7: aplicar opacity reducida a docs superseded/fantasmas para distinguir visualmente
    const cardExtra=(status==="superseded"||q._wrongCollection)?' style="opacity:.65"':"";
    return '<div class="hcard"'+cardExtra+' onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="hc-top"><div><span class="qnum">'+qNum+'</span> <span class="hc-cli">'+q.client+'</span><span class="hc-type '+(isProp?"prop":"cot")+'">'+(isProp?"Propuesta":"Cotización")+'</span>'+statusBadge+supersededBadge+wrongCollBadge+pagadoBadge+prodBadge+comentBadge+'</div>'+
      '<div><button class="dup-btn" onclick="openDuplicateModal(\''+q.kind+'\',\''+q.id+'\',event)" title="Duplicar">📋</button><button class="del-btn" onclick="delHistItem(\''+q.kind+'\',\''+q.id+'\',event)">×</button></div></div>'+
      '<div class="hc-date">'+ds+'</div>'+summary+actions+
      '</div>';
  }).join("");
  el.innerHTML=filtersBar+cards;
}
function setHistFilter(k){histFilter=k;renderHist()}

// ─── ORDER MODAL ───────────────────────────────────────────
function openOrderModal(quoteId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
  if(!q){alert("No se encontró la cotización");return}
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
  $("om-produced").checked=!!q.produced;
  $("om-entrega-fecha").oninput=function(){
    const e=this.value;if(!e)return;
    const eD=new Date(e+"T00:00:00");
    const pD=new Date(eD.getTime()-86400000);
    const h=new Date(hoy+"T00:00:00");
    $("om-prod-fecha").value=(pD<h?hoy:pD.toISOString().slice(0,10));
  };
  $("om-anticipo").value="";
  $("om-metodo").value="";
  $("om-notas").value="";
  $("om-notas-prod").value=q.orderData?.notasProduccion||"";
  $("om-num").dataset.quoteId=q.id;
  $("order-modal").classList.remove("hidden");
}
function closeOrderModal(){$("order-modal").classList.add("hidden")}

async function submitMarkAsOrder(){
  const quoteId=$("om-num").dataset.quoteId;
  if(!quoteId)return;
  if(!cloudOnline){alert("Sin conexión.");return}
  const fecha=$("om-fecha").value;if(!fecha){alert("Ingresa la fecha de aprobación del cliente");return}
  const fechaEntrega=$("om-entrega-fecha").value;
  const horaEntrega=$("om-entrega-hora").value;
  if(!fechaEntrega){alert("Ingresa la fecha de entrega");return}
  if(!horaEntrega){alert("Ingresa la hora de entrega");return}
  // v4.12.6: producción es SIEMPRE entrega − 1 día (por definición, no editable)
  const _entD=new Date(fechaEntrega+"T00:00:00");
  const _prodD=new Date(_entD.getTime()-86400000);
  const productionDate=_prodD.toISOString().slice(0,10);
  const produced=$("om-produced").checked;
  const anticipo=parseInt($("om-anticipo").value)||0;
  const metodo=$("om-metodo").value;
  const notas=$("om-notas").value.trim();
  const notasProd=$("om-notas-prod").value.trim();
  const todayIso=new Date().toISOString().slice(0,10);
  const orderData={
    fechaAprobacion:fecha,fechaEntrega:fechaEntrega,horaEntrega:horaEntrega,
    productionDate:productionDate,produced:produced,
    anticipo:anticipo,metodoPago:metodo,notas:notas,
    notasProduccion:notasProd,marcadoEn:new Date().toISOString()
  };
  const pagos=[];
  if(anticipo>0)pagos.push({fecha:fecha,monto:anticipo,metodo:metodo||"Sin especificar",tipo:"anticipo",notas:notas,registradoEn:new Date().toISOString()});
  const initialStatus=(productionDate<=todayIso)?"en_produccion":"pedido";
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
    await updateDoc(doc(db,"quotes",quoteId),patch);
    const local=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
    if(local){
      local.status=initialStatus;local.orderData=orderData;
      local.eventDate=fechaEntrega;local.horaEntrega=horaEntrega;
      local.productionDate=productionDate;local.produced=produced;
      local.producedAt=patch.producedAt;
      if(pagos.length)local.pagos=pagos;
    }
    hideLoader();closeOrderModal();
    toast("✅ Pedido "+($("om-num").value)+" · Entrega "+fechaEntrega+" "+horaEntrega+" · Producción "+productionDate+(produced?" (✓ ya producido)":""),"success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();alert("Error al actualizar: "+e.message);console.error(e)}
}

// ─── ASIGNAR FECHA DE ENTREGA ──────────────────────────────
async function assignDeliveryDate(quoteId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===quoteId&&x.kind==="quote");
  if(!q){alert("No se encontró el pedido");return}
  const hoy=new Date().toISOString().slice(0,10);
  const fecha=prompt("Fecha de entrega (YYYY-MM-DD):",q.eventDate||hoy);
  if(!fecha)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){alert("Formato inválido. Usa YYYY-MM-DD");return}
  const hora=prompt("Hora de entrega (HH:MM):",q.horaEntrega||"12:00");
  if(!hora)return;
  if(!/^\d{2}:\d{2}$/.test(hora)){alert("Formato inválido. Usa HH:MM");return}
  if(!cloudOnline){alert("Sin conexión");return}
  try{
    showLoader("Asignando fecha...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const patch={eventDate:fecha,horaEntrega:hora,updatedAt:serverTimestamp()};
    if(q.orderData){patch["orderData.fechaEntrega"]=fecha;patch["orderData.horaEntrega"]=hora}
    await updateDoc(doc(db,"quotes",quoteId),patch);
    q.eventDate=fecha;q.horaEntrega=hora;
    if(q.orderData){q.orderData.fechaEntrega=fecha;q.orderData.horaEntrega=hora}
    hideLoader();renderHist();
    if(typeof renderDashboard==="function")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message)}
}

// ─── APROBAR PROPUESTA ─────────────────────────────────────
function openApproveModal(propId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const p=quotesCache.find(x=>x.id===propId&&x.kind===kind);
  if(!p){alert("No se encontró la propuesta");return}
  $("am-num").value=p.quoteNumber||p.id;
  $("am-cli").value=p.client||"";
  $("am-fecha").value=new Date().toISOString().slice(0,10);
  $("am-anticipo").value="";
  $("am-metodo").value="";
  $("am-notas").value="";
  $("am-notas-prod").value=p.approvalData?.notasProduccion||"";
  $("am-num").dataset.propId=p.id;
  $("am-num").dataset.propKind=kind;
  $("approve-modal").classList.remove("hidden");
}
function closeApproveModal(){$("approve-modal").classList.add("hidden")}

async function submitApproveProposal(){
  const propId=$("am-num").dataset.propId;
  const kind=$("am-num").dataset.propKind||"proposal";
  if(!propId)return;
  if(!cloudOnline){alert("Sin conexión.");return}
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
  try{
    showLoader("Actualizando estado...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(propId&&propId.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";
    const patch={status:"aprobada",approvalData:approvalData,updatedAt:serverTimestamp()};
    if(pagos.length)patch.pagos=pagos;
    await updateDoc(doc(db,coll,propId),patch);
    const local=quotesCache.find(x=>x.id===propId&&x.kind===kind);
    if(local){local.status="aprobada";local.approvalData=approvalData;if(pagos.length)local.pagos=pagos}
    hideLoader();closeApproveModal();
    toast("✓ Propuesta aprobada: "+($("am-num").value),"success");
    renderHist();
  }catch(e){hideLoader();alert("Error al actualizar: "+e.message);console.error(e)}
}

// ─── DUPLICAR ──────────────────────────────────────────────
let dupSource=null;

function openDuplicateModal(kind,id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){alert("Sin conexión.");return}
  let coll;
  if(kind==="quote")coll="quotes";
  else if(id&&id.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  showLoader("Cargando para duplicar...");
  const {db,doc,getDoc}=window.fb;
  getDoc(doc(db,coll,id)).then(snap=>{
    hideLoader();
    if(!snap.exists()){alert("No se encontró el documento");return}
    dupSource={kind:kind,id:id,coll:coll,data:snap.data()};
    const effKind=coll==="propfinals"?"proposal":kind;
    $("dup-kind-label").textContent=effKind==="quote"?"cotización":"propuesta";
    $("dup-num").textContent=snap.data().quoteNumber||id;
    $("dup-cli").textContent=snap.data().client||"—";
    $("dup-modal").classList.remove("hidden");
  }).catch(e=>{hideLoader();alert("Error cargando documento: "+e.message);console.error(e)});
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
    alert("📋 Duplicado listo. Revisa y guarda para asignar consecutivo.");
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
  alert("📋 Propuesta duplicada. Revisa fechas y datos del evento antes de guardar.");
}

// ─── SALDO MODAL (legacy) ──────────────────────────────────
let saldoSource=null;
function openSaldoModal(propId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const p=quotesCache.find(x=>x.id===propId);
  if(!p){alert("No se encontró");return}
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
  if(!cloudOnline){alert("Sin conexión.");return}
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
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
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
  if(!q){alert("No se encontró");return}
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
  if(!cloudOnline){alert("Sin conexión");return}
  const fecha=$("pm-fecha").value;if(!fecha){alert("Fecha");return}
  const monto=parseInt($("pm-monto").value)||0;if(monto<=0){alert("Monto inválido");return}
  const metodo=$("pm-metodo").value;if(!metodo){alert("Método");return}
  const tipo=$("pm-tipo").value||"parcial";
  const notas=$("pm-notas").value.trim();
  const nuevo={fecha,monto,metodo,tipo,notas,registradoEn:new Date().toISOString()};
  if(pagoFotoBase64)nuevo.foto=pagoFotoBase64;
  try{
    showLoader("Registrando pago...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const coll=pagoSrc.kind==="quote"?"quotes":(pagoSrc.id.startsWith("GB-PF-")?"propfinals":"proposals");
    const pagosActuales=getPagos(pagoSrc.doc).map(p=>({...p}));
    pagosActuales.push(nuevo);
    await updateDoc(doc(db,coll,pagoSrc.id),{pagos:pagosActuales,updatedAt:serverTimestamp()});
    pagoSrc.doc.pagos=pagosActuales;
    hideLoader();closePagoModal();
    toast("💵 Pago registrado: "+fm(monto)+" via "+metodo,"success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
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
    $("vp-list").innerHTML=pagos.map(p=>{
      const fotoHtml=p.foto?'<div class="pago-item-foto"><img src="'+p.foto+'"></div>':'';
      const legBadge=p.legacy?' <span style="font-size:9px;color:#888">[migrado]</span>':'';
      return '<div class="pago-item">'+
        '<div class="pago-item-top"><span class="pago-item-monto">'+fm(p.monto)+'</span><span class="pago-item-tipo">'+p.tipo+'</span></div>'+
        '<div class="pago-item-meta">'+p.fecha+' · '+p.metodo+legBadge+'</div>'+
        (p.notas?'<div class="pago-item-meta" style="margin-top:3px">📝 '+p.notas+'</div>':'')+fotoHtml+
      '</div>';
    }).join("");
  }
  $("verpagos-modal").classList.remove("hidden");
}
function closeVerPagosModal(){$("verpagos-modal").classList.add("hidden")}

// ─── PRODUCED FLAG ─────────────────────────────────────────
async function toggleProduced(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return;
  const newVal=!q.produced;
  if(!cloudOnline){alert("Sin conexión");return}
  try{
    showLoader("Actualizando...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const coll=kind==="quote"?"quotes":(docId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,docId),{produced:newVal,producedAt:newVal?new Date().toISOString():null,updatedAt:serverTimestamp()});
    q.produced=newVal;q.producedAt=newVal?new Date().toISOString():null;
    hideLoader();renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message)}
}

// ═══════════════════════════════════════════════════════════
// v4.12: MARCAR COMO ENTREGADO (con foto + notas + quien + recibido)
// ═══════════════════════════════════════════════════════════
let deliverySrc=null;
let entregaFotoBase64=null;

function openDeliveryModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No encontrado");return}
  deliverySrc={id:docId,kind:kind,doc:q};
  entregaFotoBase64=q.entregaData?.fotoBase64||null;
  $("dm-num").value=q.quoteNumber||q.id;
  $("dm-cli").value=q.client||"";
  $("dm-fecha").value=q.entregaData?.fechaEntrega||new Date().toISOString().slice(0,10);
  $("dm-entregado-por").value=q.entregaData?.entregadoPor&&["Kathy","Juan Pablo","Luis"].includes(q.entregaData.entregadoPor)?q.entregaData.entregadoPor:(q.entregaData?.entregadoPor?"Otro":"");
  $("dm-entregado-otro").value=q.entregaData?.entregadoPor&&!["Kathy","Juan Pablo","Luis"].includes(q.entregaData.entregadoPor)?q.entregaData.entregadoPor:"";
  $("dm-entregado-otro").classList.toggle("hidden",$("dm-entregado-por").value!=="Otro");
  $("dm-notas-entrega").value=q.entregaData?.notasEntrega||"";
  $("dm-recibido-conforme").checked=!!q.entregaData?.recibidoConforme;
  $("dm-receptor").value=q.entregaData?.nombreReceptor||"";
  document.querySelectorAll('input[name="dm-foto-tipo"]').forEach(r=>{r.checked=(r.value===(q.entregaData?.fotoTipo||"producto"))});
  $("dm-foto").value="";
  if(entregaFotoBase64){
    $("dm-foto-preview").innerHTML='<img src="'+entregaFotoBase64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Foto previa cargada (cambiar = subir nueva)</div>';
  }else{$("dm-foto-preview").innerHTML=""}
  $("delivery-modal").classList.remove("hidden");
}
function closeDeliveryModal(){$("delivery-modal").classList.add("hidden");deliverySrc=null;entregaFotoBase64=null}

function onEntregadoPorChange(){
  $("dm-entregado-otro").classList.toggle("hidden",$("dm-entregado-por").value!=="Otro");
}
function previewEntregaFoto(ev){
  const file=ev.target.files[0];
  if(!file){return}
  _compressImageFile(file,b64=>{
    entregaFotoBase64=b64;
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("dm-foto-preview").innerHTML='<img src="'+b64+'" style="max-width:100%;max-height:160px;border-radius:6px;border:1px solid #ddd"><div style="font-size:10px;color:#666;margin-top:3px">Comprimida: '+sizeKB+' KB</div>';
  });
}

async function submitDelivery(){
  if(!deliverySrc)return;
  if(!cloudOnline){alert("Sin conexión");return}
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
  if(entregaFotoBase64)entregaData.fotoBase64=entregaFotoBase64;
  try{
    showLoader("Registrando entrega...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const propId=deliverySrc.id;
    const coll=deliverySrc.kind==="quote"?"quotes":(propId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,propId),{
      status:"entregado",
      fechaEntrega:fecha,
      entregaData:entregaData,
      updatedAt:serverTimestamp()
    });
    deliverySrc.doc.status="entregado";
    deliverySrc.doc.fechaEntrega=fecha;
    deliverySrc.doc.entregaData=entregaData;
    hideLoader();closeDeliveryModal();
    toast("🎉 Entrega registrada","success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
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
  comentFotoBase64=c.fotoBase64||null;
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
  if(!cloudOnline){alert("Sin conexión");return}
  const texto=$("cm-texto").value.trim();
  if(!texto&&!comentFotoBase64){alert("Agrega texto o una foto");return}
  const fecha=$("cm-fecha").value||new Date().toISOString().slice(0,10);
  const comentarioCliente={texto:texto,fecha:fecha,registradoEn:new Date().toISOString()};
  if(comentFotoBase64)comentarioCliente.fotoBase64=comentFotoBase64;
  try{
    showLoader("Guardando comentario...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const propId=comentSrc.id;
    const coll=comentSrc.kind==="quote"?"quotes":(propId.startsWith("GB-PF-")?"propfinals":"proposals");
    await updateDoc(doc(db,coll,propId),{comentarioCliente:comentarioCliente,updatedAt:serverTimestamp()});
    comentSrc.doc.comentarioCliente=comentarioCliente;
    hideLoader();closeComentModal();
    toast("💬 Comentario guardado","success");
    renderHist();
    if(curMode==="dash")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
}

// ═══════════════════════════════════════════════════════════
// v4.12.7: Eliminar doc fantasma (GB-PF-* guardado por error en proposals/)
// ═══════════════════════════════════════════════════════════
async function deleteWrongDoc(docId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){alert("Sin conexión");return}
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
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
}

// v4.12.7: limpieza masiva de fantasmas — llamar desde consola del navegador
// Ejemplo: cleanupWrongDocs()
async function cleanupWrongDocs(){
  if(!cloudOnline){alert("Sin conexión");return}
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
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
}
