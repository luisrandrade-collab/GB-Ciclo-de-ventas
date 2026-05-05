// ═══════════════════════════════════════════════════════════
// app-cotizar.js · v4.12 · 2026-04-19
// Modo Cotización: review render, save, PDF.
// ═══════════════════════════════════════════════════════════

// ─── COTIZACIÓN: review notas ──────────────────────────────
const DEFAULT_NOTAS_COT={
  n1:"Para confirmar el pedido se requiere un abono del 50% del valor total con mínimo 24 horas de anticipación a la entrega. El saldo restante se cancela al momento de la entrega o máximo 24 horas después. Por favor envía el comprobante de pago por WhatsApp para procesar la confirmación.",
  n2:"Cancelaciones con 48 horas o más de anticipación a la entrega: devolución del 100% del anticipo. Cancelaciones entre 24 y 48 horas: pérdida del 50% del anticipo. Cancelaciones con menos de 24 horas o el mismo día de la entrega: pérdida total del anticipo.",
  n3:"Cambios en cantidades o productos se aceptan hasta 24 horas antes de la fecha de entrega. La cantidad confirmada en ese momento será la cantidad facturada, se consuma o no la totalidad de los productos solicitados.",
  n4:"Gourmet Bites by Andrade Matuk opera bajo Juan Pablo Andrade Matuk — Persona Natural No Responsable de IVA (C.C. 1.032.876.662). Los valores cotizados no incluyen IVA. Se emite factura electrónica sin discriminación del impuesto conforme al régimen tributario aplicable."
};
const NOTAS_COT_TITULOS={
  n1:"Confirmación y Anticipo",
  n2:"Política de Cancelación",
  n3:"Modificaciones al Pedido",
  n4:"Responsable Tributario"
};
let notasCotData={};
let firmaCot="km";

function setFirma(mode,key){
  if(mode==="cot"){firmaCot=key}
  else{firmaProp=key}
  const selId=mode==="cot"?"firma-sel-cot":"firma-sel-prop";
  const sel=$(selId);
  if(sel)sel.querySelectorAll(".firma-opt").forEach(el=>el.classList.toggle("act",el.dataset.key===key));
}

function initNotasCot(){
  Object.keys(DEFAULT_NOTAS_COT).forEach(k=>{if(!notasCotData[k])notasCotData[k]=DEFAULT_NOTAS_COT[k]});
  Object.keys(notasCotData).forEach(k=>{
    if(typeof notasCotData[k]==="string"&&notasCotData[k].includes("1.032.876.667")){
      notasCotData[k]=notasCotData[k].replace(/1\.032\.876\.667/g,"1.032.876.662");
    }
  });
}
function renderNotasCot(){
  initNotasCot();
  const el=$("notas-cot-list");if(!el)return;
  el.innerHTML=Object.keys(DEFAULT_NOTAS_COT).map((k,i)=>{
    const n=i+1;
    return '<div class="cond-sec"><div class="cond-sec-tit"><span class="num">'+n+'</span>'+NOTAS_COT_TITULOS[k]+'<button class="cond-reset" onclick="resetNotaCot(\''+k+'\')">↻ Restablecer</button></div><textarea class="cond-textarea" onchange="notasCotData[\''+k+'\']=this.value">'+(notasCotData[k]||DEFAULT_NOTAS_COT[k])+'</textarea></div>';
  }).join("");
}
function resetNotaCot(k){notasCotData[k]=DEFAULT_NOTAS_COT[k];renderNotasCot()}
function resetAllNotasCot(){
  confirmModal({
    title:"Restablecer cláusulas",
    body:"¿Restablecer todas las cláusulas a sus valores por defecto?",
    okLabel:"Restablecer",
    tone:"warn",
    onOk:()=>{
      Object.keys(DEFAULT_NOTAS_COT).forEach(k=>notasCotData[k]=DEFAULT_NOTAS_COT[k]);
      renderNotasCot();
    }
  });
}

// ─── RENDER REVIEW ─────────────────────────────────────────
function renderR(){
  const cl=$("f-cli").value||"—",idStr=getIdStr(),att=$("f-att").value||cl,mail=$("f-mail").value,tel=$("f-tel").value,dir=$("f-dir").value,city=getCityName()||"—",deliv=getDelivStr();
  let info="";
  // v5.5.0: encontrar doc actual en cache para leer editHistory y status
  const qCurrent=currentQuoteNumber?(quotesCache||[]).find(x=>x.id===currentQuoteNumber&&x.kind==="quote"):null;
  const curStatus=(qCurrent&&qCurrent.status)||"enviada";
  const hayEditHistory=qCurrent&&Array.isArray(qCurrent.editHistory)&&qCurrent.editHistory.length>0;
  const lastSaved=window._lastSavedQuote&&window._lastSavedQuote.id===currentQuoteNumber?window._lastSavedQuote:null;
  // Letrero naranja: pedido en producción con cambios recientes
  if(currentQuoteNumber&&(curStatus==="en_produccion"||(lastSaved&&lastSaved.statusPrevio==="en_produccion"))&&lastSaved&&Array.isArray(lastSaved.cambios)&&lastSaved.cambios.length>0){
    info+='<div class="edit-alert-banner">⚠️ <strong>Pedido en producción con cambios</strong> — tener en cuenta. Avisa al equipo de producción.</div>';
  }
  // Botón 🕒 historial de cambios (solo si hay ediciones)
  if(currentQuoteNumber&&hayEditHistory){
    info+='<div style="margin-bottom:8px"><span class="qnum">'+currentQuoteNumber+'</span> <button class="eh-trigger" onclick="openEditHistoryModal(\''+currentQuoteNumber+'\',\'quote\')" title="Ver historial de cambios">🕒 '+qCurrent.editHistory.length+'</button></div>';
  }else if(currentQuoteNumber){
    info+='<div style="margin-bottom:8px"><span class="qnum">'+currentQuoteNumber+'</span></div>';
  }
  info+='<strong>Cliente:</strong> '+cl+(idStr?' — '+idStr:'')+'<br><strong>Atención:</strong> '+att+'<br>';
  if(tel)info+='<strong>Teléfono:</strong> '+tel+'<br>';
  if(mail)info+='<strong>Correo:</strong> '+mail+'<br>';
  if(dir)info+='<strong>Dirección:</strong> '+dir+'<br>';
  info+='<strong>Ciudad:</strong> '+city+'<br>';
  if(deliv)info+='<strong>Fecha de Entrega:</strong> '+deliv+'<br>';
  info+='<strong>Fecha cotización:</strong> '+dateStr();
  // v5.5.0: banner diferencia-anticipo si cambió total Y hay pagos
  if(lastSaved&&lastSaved.hayPagos&&lastSaved.totalAnterior!==lastSaved.totalNuevo){
    const diff=lastSaved.totalNuevo-lastSaved.totalAnterior;
    const diffTxt=diff>0?"a cobrar":"a devolver";
    info+='<div class="diff-anticipo-banner">💰 <strong>Diferencia detectada</strong>: Total anterior '+fm(lastSaved.totalAnterior)+' → Nuevo '+fm(lastSaved.totalNuevo)+'. Diferencia '+fm(Math.abs(diff))+' '+diffTxt+'. <em>(Gestión manual)</em></div>';
  }
  $("rev-info").innerHTML=info;
  const all=allIt(),tr=getTr(),tot=getTotal();
  if(!all.length){$("rev-content").innerHTML='<div class="empty"><div class="ic">📋</div><p>No hay productos</p><button class="btn bp" onclick="go(\'products\')">Agregar Productos</button></div>';return}
  let rows="";
  cart.forEach(i=>{
    const editedBadge=i.edited?' <span style="font-size:9px;background:var(--gb-gold-500);color:#fff;padding:1px 5px;border-radius:3px">AJUSTADO</span>':'';
    const priceInput='<input type="number" class="pinput'+(i.edited?' edited':'')+'" value="'+i.p+'" onchange="chgCartPrice('+i.id+',+this.value)" onfocus="this.select()">';
    rows+='<tr><td style="text-align:left"><strong>'+i.n+'</strong>'+editedBadge+(i.d?'<br><span style="font-size:10px;color:#999">'+i.d+'</span>':'')+'</td><td style="text-align:center"><div class="qc" style="justify-content:center"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCartR('+i.id+','+(i.qty-1)+')">−</button><input type="number" class="qn" value="'+i.qty+'" min="1" onchange="chgCartR('+i.id+',+this.value)" onfocus="this.select()" style="width:34px;font-size:12px"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCartR('+i.id+','+(i.qty+1)+')">+</button></div></td><td style="text-align:right">'+priceInput+'</td><td style="text-align:right;font-weight:600">'+fm(i.p*i.qty)+'</td><td><button style="background:none;border:none;color:var(--gb-danger-500);font-size:18px;cursor:pointer" onclick="remCart('+i.id+')">×</button></td></tr>';
  });
  cust.forEach(i=>{
    const priceInput='<input type="number" class="pinput" value="'+i.p+'" onchange="chgCustPrice(\''+i.id+'\',+this.value)" onfocus="this.select()">';
    rows+='<tr style="background:#FFFDE7"><td style="text-align:left"><strong>'+i.n+'</strong> <span style="font-size:9px;background:var(--gb-gold-500);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span>'+(i.d?'<br><span style="font-size:10px;color:#999">'+i.d+'</span>':'')+'</td><td style="text-align:center"><div class="qc" style="justify-content:center"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCustQ(\''+i.id+'\','+(i.qty-1)+')">−</button><input type="number" class="qn" value="'+i.qty+'" min="1" onchange="chgCustQ(\''+i.id+'\',+this.value)" onfocus="this.select()" style="width:34px;font-size:12px"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCustQ(\''+i.id+'\','+(i.qty+1)+')">+</button></div></td><td style="text-align:right">'+priceInput+'</td><td style="text-align:right;font-weight:600">'+fm(i.p*i.qty)+'</td><td><button style="background:none;border:none;color:var(--gb-danger-500);font-size:18px;cursor:pointer" onclick="remCust(\''+i.id+'\')">×</button></td></tr>';
  });
  if(tr)rows+='<tr style="background:var(--gb-cream)"><td style="text-align:left"><strong>'+tr.n+'</strong></td><td style="text-align:center">1</td><td style="text-align:right">'+fm(tr.p)+'</td><td style="text-align:right;font-weight:600">'+fm(tr.p)+'</td><td></td></tr>';
  const payBoxHtml='<div class="paybox"><div class="paytit">INSTRUCCIONES DE PAGO</div><div class="paybody">'+
    '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:var(--gb-gold-500);letter-spacing:.6px;margin-bottom:3px">PERSONAS NATURALES</div>'+
    '<strong>Nequi / Daviplata:</strong> 3176654635<br>'+
    '<strong>Bre-B (al banco):</strong> juanpandrade2005@gmail.com<br>'+
    '<strong>Titular:</strong> Juan Pablo Andrade</div>'+
    '<div style="margin-bottom:8px;padding-top:6px;border-top:1px dashed rgba(201,169,110,.3)"><div style="font-size:10px;font-weight:700;color:var(--gb-gold-500);letter-spacing:.6px;margin-bottom:3px">EMPRESAS (transferencia ACH)</div>'+
    '<strong>Banco Falabella:</strong> Cuenta de Ahorros No. 111820028616<br>'+
    '<strong>Titular:</strong> Juan Pablo Andrade Matuk — C.C. 1.032.876.662</div>'+
    '<div class="paynote">Envía el comprobante del pago por WhatsApp para procesar la confirmación del pedido. Mínimo 24 horas de anticipación a la entrega.</div>'+
    '</div></div>';
  const notasHtml='<div class="sec" style="margin-top:12px"><div class="stit" style="display:flex;justify-content:space-between;align-items:center">Condiciones del servicio <button class="cond-reset" style="font-size:10px" onclick="resetAllNotasCot()">↻ Restablecer todas</button></div><div id="notas-cot-list"></div></div>';
  // v5.5.0: botonera adaptativa según estado
  // - Nuevo doc o "enviada/pedido" normal: botones estándar
  // - Doc con cambios recientes que afectan cliente: "Regenerar PDF del cliente" destacado
  // - Todos los docs editables: botón "Cancelar edición" que recarga desde Firestore
  let actsHtml='<div class="acts">';
  actsHtml+='<button class="btn bd" onclick="go(\'products\')">+ Productos</button>';
  // Regenerar PDF destacado si hubo cambios que afectan cliente
  if(lastSaved&&lastSaved.afectaCliente){
    actsHtml+='<button class="btn bp" style="background:linear-gradient(135deg,#FF6F00,#E65100);animation:pulseHighlight 1.5s ease-in-out 3" onclick="genPDF()">📄 Regenerar PDF del cliente</button>';
  }else{
    actsHtml+='<button class="btn bp" onclick="genPDF()">📄 Generar PDF</button>';
  }
  actsHtml+='<button class="btn bg" onclick="saveCurrentQuote()">💾 Guardar</button>';
  // Cancelar edición: solo si hay un doc cargado (currentQuoteNumber existe)
  if(currentQuoteNumber){
    actsHtml+='<button class="btn" style="background:#B0BEC5;color:#fff" onclick="cancelEdicion()">↩️ Cancelar edición</button>';
  }
  actsHtml+='</div>';
  $("rev-content").innerHTML='<div class="rtbl-wrap"><table class="rtbl"><thead><tr><th style="text-align:left">Producto</th><th>Cant.</th><th style="text-align:right">V. Unit</th><th style="text-align:right">Subtotal</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="tbox"><div class="tl">Total</div><div class="ta">'+fm(tot)+'</div></div>'+payBoxHtml+notasHtml+actsHtml;
  renderNotasCot();
}

// v5.5.0: cancela la edición en curso recargando el doc desde Firestore
// v6.3.0 E3-3: confirms migrados a confirmModal()
async function cancelEdicion(){
  if(!currentQuoteNumber){
    // Sin doc cargado = borrador local → limpiar
    const ok=await confirmModal({
      title:"Descartar borrador",
      body:"¿Descartar esta cotización (borrador nuevo)?",
      okLabel:"Descartar",
      tone:"warn"
    });
    if(!ok)return;
    cart=[];cust=[];currentQuoteNumber=null;
    ["f-cli","f-idtype","f-idnum","f-att","f-mail","f-tel","f-dir","f-notas-internas"].forEach(id=>{const e=$(id);if(e)e.value=""});
    go("products");
    return;
  }
  const ok=await confirmModal({
    title:"Descartar cambios",
    body:"¿Descartar cambios y recargar <strong>"+h(currentQuoteNumber)+"</strong> desde la nube?",
    okLabel:"Descartar y recargar",
    tone:"warn"
  });
  if(!ok)return;
  try{
    showLoader("Recargando...");
    window._lastSavedQuote=null; // limpiar banner
    await loadQuote("quote",currentQuoteNumber);
    hideLoader();
    if(typeof toast==="function")toast("Cambios descartados","success");
  }catch(e){hideLoader();toast("Error al recargar: "+e.message,"error")}
}

function chgCartPrice(id,newP){newP=parseInt(newP)||0;if(newP<=0)return;const i=cart.find(x=>x.id===id);if(i){if(!i.origP)i.origP=i.p;i.p=newP;i.edited=newP!==i.origP}renderR();updUI()}
function chgCustPrice(id,newP){newP=parseInt(newP)||0;if(newP<=0)return;const i=cust.find(x=>x.id===id);if(i)i.p=newP;renderR();updUI()}

// ─── SAVE COTIZACIÓN ───────────────────────────────────────
async function saveCurrentQuote(silent){
  const cl=$("f-cli").value.trim()||"Sin nombre";
  const items=allIt();
  if(!items.length){if(!silent){if(typeof toast==="function")toast("Agrega productos primero","warn");else alert("Agrega productos primero")}return}
  if(!cloudOnline){if(!silent){if(typeof toast==="function")toast("Sin conexión. No se puede guardar.","error");else alert("Sin conexión. No se puede guardar.")}return}
  // v5.5.0: matriz de edición reemplaza el bloqueo duro v4.13.0
  let oldDoc=null; // snapshot previo para diff del audit trail
  let statusActual="enviada";
  if(currentQuoteNumber){
    try{
      const {db,doc,getDoc}=window.fb;
      const snap=await getDoc(doc(db,"quotes",currentQuoteNumber));
      if(snap.exists()){
        oldDoc=snap.data();
        statusActual=oldDoc.status||"enviada";
        // Status bloqueados por la matriz
        if(["anulada","convertida","superseded"].includes(statusActual)){
          if(!silent){
            const _lbl=(STATUS_META[statusActual]||{}).label||statusActual;
            toast("🔒 Cotización \""+_lbl+"\" ("+currentQuoteNumber+") no se puede modificar. Duplica (📋) y arranca una nueva.","warn",6000);
          }
          return;
        }
        // Status "entregado": solo notas internas. Avisamos pero permitimos (el usuario sabrá qué toca).
        if(statusActual==="entregado"&&!silent){
          const ok=await confirmModal({
            title:"Pedido ya entregado",
            body:"ℹ️ Este pedido ya fue entregado.<br><br>Solo deberías cambiar <strong>NOTAS INTERNAS</strong> (no afectan PDF del cliente).<br><br>¿Continuar guardando?",
            okLabel:"Continuar",
            tone:"warn"
          });
          if(!ok)return;
        }
      }
    }catch(e){console.warn("No se pudo verificar status previo:",e)}
  }
  try{
    if(!silent)showLoader("Generando consecutivo...");
    // v5.5.0: decidir si se genera versión hija con sufijo -1, -2
    // Solo aplica pre-confirmación: status "enviada" en cotizaciones.
    let qNum=currentQuoteNumber;
    let creatingChild=false;
    if(qNum&&oldDoc&&shouldVersionWithSuffix(oldDoc,"quote")){
      // Preguntar al usuario: ¿nueva versión (recotización) o sobreescribir?
      if(!silent){
        const ok=await confirmModal({
          title:"¿Guardar como versión nueva?",
          body:"Esta cotización está en estado <strong>\"Enviada\"</strong>.<br><br><strong>Continuar</strong> → Se crea <strong>"+h(buildChildNumber(qNum))+"</strong> (recotización) y la original queda archivada.<br><br><strong>Cancelar</strong> → Se sobreescribe "+h(qNum)+" (se pierde la versión anterior).",
          okLabel:"Crear versión nueva",
          cancelLabel:"Sobreescribir",
          tone:"primary"
        });
        if(ok){
          qNum=buildChildNumber(qNum);
          creatingChild=true;
        }
      }
    }
    if(!qNum)qNum=await getNextNumber("quote");
    await autoSaveClientFromCot();
    for(const cu of cust){try{await registerCustomProduct(cu.n,cu.d,cu.p,cu.u,cu.inCatalog)}catch(e){console.warn("custom register skipped:",e)}}
    let prevStatus="enviada",prevOrderData=null,prevPagos=null,prevEntregaData=null,prevComentarioCliente=null,prevProductionDate=null,prevProduced=null,prevEventDate=null,prevHoraEntrega=null,prevPdfHistorial=null,prevPdfRegenCount=null,prevEditHistory=null,prevOptionGroupId=null,prevFeData=null;
    if(currentQuoteNumber&&!creatingChild){
      // Guardando sobre el mismo doc: preservar campos operativos existentes
      if(oldDoc){
        if(oldDoc.status)prevStatus=oldDoc.status;
        if(oldDoc.orderData)prevOrderData=oldDoc.orderData;
        if(oldDoc.pagos)prevPagos=oldDoc.pagos;
        if(oldDoc.entregaData)prevEntregaData=oldDoc.entregaData;
        if(oldDoc.comentarioCliente)prevComentarioCliente=oldDoc.comentarioCliente;
        if(oldDoc.productionDate)prevProductionDate=oldDoc.productionDate;
        if(typeof oldDoc.produced!=="undefined")prevProduced=oldDoc.produced;
        if(oldDoc.eventDate)prevEventDate=oldDoc.eventDate;
        if(oldDoc.horaEntrega)prevHoraEntrega=oldDoc.horaEntrega;
        if(Array.isArray(oldDoc.pdfHistorial))prevPdfHistorial=oldDoc.pdfHistorial;
        if(typeof oldDoc.pdfRegenCount==="number")prevPdfRegenCount=oldDoc.pdfRegenCount;
        if(Array.isArray(oldDoc.editHistory))prevEditHistory=oldDoc.editHistory;
        if(oldDoc.optionGroupId)prevOptionGroupId=oldDoc.optionGroupId;
        if(oldDoc.feData)prevFeData=oldDoc.feData;
        if($("f-requiere-fe"))$("f-requiere-fe").checked=!!oldDoc.requiereFE;
      }
    }else if(creatingChild&&oldDoc){
      // Versión hija: copia estado pero reinicia audit trail (nuevo doc)
      // Status arranca como "enviada" para que el ciclo pre-confirmación continúe
      prevStatus="enviada";
      // No arrastramos orderData/pagos/etc — la hija es cotización limpia
    }
    const qObj={
      quoteNumber:qNum,type:"cot",year:APP_YEAR,
      dateISO:new Date().toISOString(),
      client:cl,idStr:getIdStr(),
      att:$("f-att").value,mail:$("f-mail").value,tel:$("f-tel").value,dir:$("f-dir").value,
      city:getCityName(),cityType:$("f-city").value,trCustom:$("f-tr-custom").value,
      deliv:getDelivStr(),
      momentosArr:(typeof getMomentos==="function"?getMomentos():[]),
      eventDate:($("f-date")?.value||""),
      cart:cart.map(i=>({id:i.id,n:i.n,d:i.d||"",u:i.u||"",p:i.p,origP:i.origP||i.p,qty:i.qty,edited:!!i.edited})),
      cust:cust.map(i=>({n:i.n,p:i.p,d:i.d||"",u:i.u||"",qty:i.qty})),
      total:getTotal(),status:prevStatus,
      notasCotData:{...notasCotData},firma:firmaCot,
      requiereFE:!!($("f-requiere-fe")&&$("f-requiere-fe").checked),
      // v7.7.4: notas internas para producción (no aparecen en PDF al cliente)
      notasInternas:($("f-notas-internas")?.value||"").trim()
    };
    // v7.0-α FIX-01-Q9: orderData se reconcilia más abajo, después de que qObj
    // tenga eventDate/horaEntrega/productionDate finales (del form o preservados).
    if(prevPagos)qObj.pagos=prevPagos;
    if(prevOptionGroupId)qObj.optionGroupId=prevOptionGroupId;
    if(prevFeData)qObj.feData=prevFeData;
    if(prevEntregaData)qObj.entregaData=prevEntregaData;
    if(prevComentarioCliente)qObj.comentarioCliente=prevComentarioCliente;
    if(prevProductionDate)qObj.productionDate=prevProductionDate;
    if(prevProduced!==null)qObj.produced=prevProduced;
    // v6.4.0 P2: NO sobreescribir eventDate/horaEntrega si el usuario los editó en el form.
    // Antes (v5.5.0-v6.3.0): siempre se restauraban los valores previos → era imposible
    // cambiar fecha/hora de entrega de un pedido sin anular y crear de cero.
    // Ahora: si el form tiene un valor distinto al guardado, se respeta el del form.
    // Aplica para status logísticos (pedido, aprobada, en_produccion, entregado).
    // v6.4.0 hallazgo-4: si el form viene vacío pero había valor previo, log defensivo
    // (window.__GB_DEBUG_EDIT=true) para que Luis pueda detectar borrados accidentales.
    const _formEventDate=$("f-date")?.value||"";
    const _formHora=($("f-hora-entrega")?.value)||"";
    if(_formEventDate){qObj.eventDate=_formEventDate}else if(prevEventDate){
      qObj.eventDate=prevEventDate;
      if(typeof window!=="undefined"&&window.__GB_DEBUG_EDIT)console.warn("[v6.4.0 P2] form sin eventDate → preservando previo",prevEventDate,"doc:",qNum);
    }
    if(_formHora){qObj.horaEntrega=_formHora}else if(prevHoraEntrega){
      qObj.horaEntrega=prevHoraEntrega;
      if(typeof window!=="undefined"&&window.__GB_DEBUG_EDIT)console.warn("[v6.4.0 P2] form sin horaEntrega → preservando previa",prevHoraEntrega,"doc:",qNum);
    }
    // v7.0-α FIX-01-Q9: reconciliar orderData con valores del form (única fuente de verdad).
    // Antes (v6.4.x): orderData se preservaba intacto → si el usuario editaba fecha/hora desde
    // el form, q.eventDate/q.horaEntrega se actualizaban pero q.orderData.* quedaba viejo.
    // Resultado: módulos que leen de orderData mostraban fecha desincronizada.
    if(prevOrderData){
      qObj.orderData={
        ...prevOrderData,
        fechaEntrega:qObj.eventDate||prevOrderData.fechaEntrega||"",
        horaEntrega:qObj.horaEntrega||prevOrderData.horaEntrega||"",
        productionDate:qObj.productionDate||prevOrderData.productionDate||""
      };
      if(typeof window!=="undefined"&&window.__GB_V7_DEBUG){
        console.log("[FIX-01-Q9] orderData reconciliado en save",{doc:qNum,orderData:qObj.orderData});
      }
    }
    // v5.5.0: preservar historial PDFs y audit trail en ediciones sobre mismo doc
    if(prevPdfHistorial)qObj.pdfHistorial=prevPdfHistorial;
    if(prevPdfRegenCount)qObj.pdfRegenCount=prevPdfRegenCount;
    // v5.5.0: construir nueva entrada de editHistory si hay cambios
    let nuevosHistory=prevEditHistory?[...prevEditHistory]:[];
    let cambiosDetectados=[];
    if(oldDoc&&!creatingChild&&!silent){
      cambiosDetectados=diffDocs(oldDoc,qObj);
      if(cambiosDetectados.length>0){
        // Pedir razón opcional
        const razon=prompt("Razón del cambio (opcional, máx 200 chars):","")||"";
        const entry=buildEditHistoryEntry(cambiosDetectados,razon);
        nuevosHistory.push(entry);
      }
    }
    if(nuevosHistory.length>0)qObj.editHistory=nuevosHistory;
    // v5.5.0: si es child, enlazar al padre
    if(creatingChild){
      qObj.parentQuote=currentQuoteNumber;
    }
    if(!silent)showLoader("Guardando en la nube...");
    // v6.3.0 E3-1: al crear versión hija, save-hijo + mark-padre-superseded deben ser ATÓMICOS.
    // Antes (v5.5.0-v6.2.0): dos operaciones separadas → race condition si cae red entre ellas.
    // Ahora: runTransaction que hace ambas o ninguna.
    // Fallback defensivo: si la transacción falla (p.ej. rules strictas, caso edge),
    // se cae al método legacy (2 operaciones separadas). Solo log en consola — Kathy/JP
    // no deben ver detalle técnico. Mantener fallback 1-2 versiones antes de eliminar.
    if(creatingChild){
      const {db,doc,runTransaction,setDoc,updateDoc,serverTimestamp}=window.fb;
      const parentRef=doc(db,"quotes",currentQuoteNumber);
      const childRef=doc(db,"quotes",qObj.quoteNumber);
      let usedFallback=false;
      try{
        await runTransaction(db,async(tx)=>{
          // Validar que el padre sigue existiendo y no fue supersedeado por alguien más (edge caso colaboración)
          const parentSnap=await tx.get(parentRef);
          if(!parentSnap.exists()){
            throw new Error("Padre "+currentQuoteNumber+" no existe");
          }
          tx.set(childRef,{...qObj,createdAt:serverTimestamp()});
          tx.update(parentRef,{
            status:"superseded",
            supersededBy:qNum,
            updatedAt:serverTimestamp()
          });
        });
      }catch(txErr){
        // Fallback defensivo: método legacy de v5.5.0-v6.2.0
        console.warn("[v6.3.0 E3-1] runTransaction falló en creatingChild; usando fallback legacy. Detalle:",txErr);
        usedFallback=true;
        await saveQuoteToCloud(qObj);
        try{
          await updateDoc(parentRef,{
            status:"superseded",
            supersededBy:qNum,
            updatedAt:serverTimestamp()
          });
        }catch(e){
          console.warn("[v6.3.0 E3-1] Fallback también falló al marcar padre:",e);
          if(!silent)toast&&toast("Versión creada, pero no se pudo archivar la anterior. Reintenta manualmente.","warn",6000);
        }
      }
      // Sync cache local para el padre (ambas rutas terminaron OK si llegamos acá sin toast de error)
      const padre=(quotesCache||[]).find(x=>x.id===currentQuoteNumber&&x.kind==="quote");
      if(padre){padre.status="superseded";padre.supersededBy=qNum}
      if(usedFallback)console.info("[v6.3.0 E3-1] Guardado exitoso en modo compatibilidad (fallback).");
    }else{
      // No es versión hija: guardado directo clásico
      await saveQuoteToCloud(qObj);
    }
    // v5.5.0 FIX #3: sincronizar quotesCache local inmediatamente tras save exitoso
    // Esto es lo que hace que el botón 🕒 aparezca al instante tras la primera edición.
    try{
      if(Array.isArray(quotesCache)){
        const idx=quotesCache.findIndex(x=>x.id===qNum&&x.kind==="quote");
        const cacheEntry={kind:"quote",id:qNum,...qObj};
        if(idx>=0)quotesCache[idx]={...quotesCache[idx],...cacheEntry};
        else quotesCache.unshift(cacheEntry);
      }
    }catch(e){console.warn("No se pudo sincronizar quotesCache:",e)}
    if(!creatingChild&&typeof linkPendingReplacement==="function"){try{await linkPendingReplacement(qNum,"quote",qObj.client)}catch(e){console.warn("linkPendingReplacement:",e)}}
    // v5.5.0: guardar referencias para el renderR post-guardado
    window._lastSavedQuote={
      id:qNum,
      cambios:cambiosDetectados,
      statusPrevio:statusActual,
      creatingChild:creatingChild,
      afectaCliente:cambiosAfectanCliente(cambiosDetectados),
      hayPagos:Array.isArray(prevPagos)&&prevPagos.length>0,
      totalAnterior:(oldDoc&&oldDoc.total)||0,
      totalNuevo:qObj.total
    };
    const padreNumeroParaMsg=currentQuoteNumber; // guardar ANTES de sobreescribir
    currentQuoteNumber=qNum;
    if(!silent){
      hideLoader();
      if(creatingChild){
        if(typeof toast==="function")toast("✅ Nueva versión creada: "+qNum+" · La anterior ("+padreNumeroParaMsg+") quedó archivada.","success",5000);
        else toast("✅ Nueva versión creada: "+qNum+". La anterior ("+padreNumeroParaMsg+") quedó archivada.","success",5000);
      }else if(cambiosDetectados.length>0&&statusActual==="en_produccion"){
        // Letrero aparece en renderR — aquí solo toast
        if(typeof toast==="function")toast("⚠️ Pedido en producción modificado. Aviso visible al equipo.","warn",5000);
      }else{
        if(typeof toast==="function")toast("✅ Guardado: "+qNum,"success");
        else toast("✅ Guardado: "+qNum,"success");
      }
    }
    if(curStep==="review")renderR();
  }catch(e){if(!silent)hideLoader();if(typeof toast==="function")toast("Error al guardar: "+e.message,"error",6000);else alert("Error al guardar: "+e.message);console.error(e)}
}

// ─── PDF COTIZACIÓN ────────────────────────────────────────
async function genPDF(){
  try{
    const all=allIt();
    if(!all.length){if(typeof toast==="function")toast("Agrega productos antes de generar el PDF","warn");else alert("Agrega productos antes de generar el PDF");return}
    if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión. Conecta a internet para generar el PDF con número de cotización.","error",5000);else alert("Sin conexión. Conecta a internet para generar el PDF con número de cotización.");return}
    showLoader("Guardando cotización...");
    await saveCurrentQuote(true);
    if(!currentQuoteNumber){hideLoader();return}
    hideLoader();
    const{jsPDF}=window.jspdf;const doc=new jsPDF("p","mm","letter");const W=215.9,H=279.4,mg=16;
    const cl=$("f-cli").value||"—",idStr=getIdStr(),att=$("f-att").value||cl,mail=$("f-mail").value,tel=$("f-tel").value,dir=$("f-dir").value,city=getCityName()||"—",deliv=getDelivStr();
    const tr=getTr(),tot=getTotal();
    try{const li=new Image();li.src=LOGO_IW;doc.addImage(li,"JPEG",(W-65)/2,4,65,65*(272/500))}catch(e){}
    let y=4+65*(272/500)+2;
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.4);doc.line(40,y,W-40,y);
    y+=5;doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(26,26,26);
    doc.text("COTIZACIÓN GOURMETBITES BY ANDRADE MATUK - "+dateStr(),W/2,y,{align:"center"});
    y+=5;doc.setFontSize(9);doc.setTextColor(201,169,110);
    doc.text(currentQuoteNumber,W/2,y,{align:"center"});
    doc.setTextColor(26,26,26);
    y+=6;doc.setFontSize(8.5);
    let cliLine="Cliente: "+cl;if(idStr)cliLine+=" - "+idStr;cliLine+="     Atención: "+att;
    doc.text(cliLine,W/2,y,{align:"center"});
    if(tel){y+=4;doc.setFont("helvetica","normal");doc.text("Teléfono: "+tel,W/2,y,{align:"center"})}
    if(mail){y+=4;doc.setFont("helvetica","normal");doc.text("Correo: "+mail,W/2,y,{align:"center"})}
    if(dir){y+=4;doc.setFont("helvetica","normal");doc.text("Dirección: "+dir,W/2,y,{align:"center"})}
    y+=4;doc.setFont("helvetica","bold");doc.text("Ciudad de Entrega: "+city,W/2,y,{align:"center"});
    if(deliv){y+=4;doc.text("Fecha de Entrega: "+deliv,W/2,y,{align:"center"})}
    y+=5;const td=[];all.forEach(i=>td.push([i.n+(i.d?"\n"+i.d:""),String(i.qty),fm(i.p),fm(i.p*i.qty)]));
    if(tr)td.push([tr.n,"1",fm(tr.p),fm(tr.p)]);
    const tw=W-mg*2;
    doc.autoTable({startY:y,margin:{left:mg,right:mg},head:[["Producto","Cant.","V. Unit","Subtotal"]],body:td,theme:"grid",headStyles:{fillColor:[26,26,26],textColor:255,fontStyle:"bold",fontSize:8,halign:"center"},columnStyles:{0:{halign:"left",cellWidth:tw*.50},1:{halign:"center",cellWidth:tw*.10},2:{halign:"right",cellWidth:tw*.20},3:{halign:"right",cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:3},alternateRowStyles:{fillColor:[250,250,248]},styles:{cellPadding:{top:4,bottom:4,left:6,right:6}},didParseCell:function(data){if(tr&&data.section==="body"&&data.row.index===td.length-1){data.cell.styles.fillColor=[240,240,238];data.cell.styles.fontStyle="bold"}}});
    y=doc.lastAutoTable.finalY+5;
    if(y+30>H){doc.addPage();y=20}
    const gw=80,gh=16,gx=(W-gw)/2;
    doc.setFillColor(76,175,80);doc.roundedRect(gx,y,gw,gh,2.5,2.5,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(9);
    doc.text("Total",W/2,y+5.5,{align:"center"});doc.setFontSize(18);doc.text(fm(tot),W/2,y+13,{align:"center"});
    y+=gh+6;const pw=tw,px=mg;
    const nt="Envía el comprobante de pago por WhatsApp para procesar la confirmación del pedido. Recuerda que necesitamos recibirlo con mínimo 24 horas de anticipación a la entrega. ¡Gracias por elegir Gourmet Bites!";
    const nl=doc.splitTextToSize(nt,pw-16);
    const ph=9+54+nl.length*3.8+8;
    if(y+ph>H-20){doc.addPage();y=20}
    doc.setDrawColor(220,220,220);doc.setLineWidth(0.4);doc.roundedRect(px,y,pw,ph,2,2,"S");
    doc.setFillColor(244,243,241);doc.rect(px,y,pw,9,"F");
    doc.setTextColor(26,26,26);doc.setFont("helvetica","bold");doc.setFontSize(10);
    doc.text("INSTRUCCIONES DE PAGO",W/2,y+6.5,{align:"center"});
    doc.setDrawColor(220,220,220);doc.line(px,y+9,px+pw,y+9);
    let py=y+14;
    doc.setFontSize(8.5);doc.setFont("helvetica","bold");doc.setTextColor(201,169,110);
    doc.text("PERSONAS NATURALES",px+8,py);
    py+=4;
    doc.setFontSize(8);doc.setTextColor(26,26,26);doc.setFont("helvetica","bold");
    doc.text("Nequi / Daviplata:",px+8,py);doc.setFont("helvetica","normal");doc.text("3176654635",px+42,py);
    py+=3.8;doc.setFont("helvetica","bold");doc.text("Bre-B (al banco):",px+8,py);doc.setFont("helvetica","normal");doc.text("juanpandrade2005@gmail.com",px+42,py);
    py+=3.8;doc.setFont("helvetica","bold");doc.text("Titular:",px+8,py);doc.setFont("helvetica","normal");doc.text("Juan Pablo Andrade",px+22,py);
    py+=6;
    doc.setFontSize(8.5);doc.setFont("helvetica","bold");doc.setTextColor(201,169,110);
    doc.text("EMPRESAS (transferencia ACH)",px+8,py);
    py+=4;
    doc.setFontSize(8);doc.setTextColor(26,26,26);doc.setFont("helvetica","bold");
    doc.text("Banco Falabella:",px+8,py);doc.setFont("helvetica","normal");doc.text("Cuenta de Ahorros No. 111820028616",px+36,py);
    py+=3.8;doc.setFont("helvetica","bold");doc.text("Titular:",px+8,py);doc.setFont("helvetica","normal");doc.text("Juan Pablo Andrade Matuk — C.C. 1.032.876.662",px+22,py);
    py+=6;doc.setFontSize(7.5);doc.setTextColor(100,100,100);doc.setFont("helvetica","italic");
    doc.text(nl,px+8,py);
    y=y+ph+6;
    initNotasCot();
    const notasOrder=["n1","n2","n3","n4"];
    const notasFontSize=7.8;
    doc.setFontSize(notasFontSize);doc.setFont("helvetica","normal");
    let notasEstimatedH=8;
    const notasLines=notasOrder.map(k=>{
      const titulo=NOTAS_COT_TITULOS[k];
      const texto=notasCotData[k]||DEFAULT_NOTAS_COT[k];
      const tituloLine=(notasOrder.indexOf(k)+1)+". "+titulo+".";
      const wrapped=doc.splitTextToSize(texto,pw-10);
      notasEstimatedH+=4.5+wrapped.length*3.3+2.5;
      return {tituloLine,wrapped};
    });
    if(y+notasEstimatedH>H-28){doc.addPage();y=20}
    doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(201,169,110);
    doc.text("CONDICIONES DEL SERVICIO",px,y);
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.3);doc.line(px,y+1.5,px+pw,y+1.5);
    doc.setTextColor(26,26,26);
    y+=6;
    notasLines.forEach(nl=>{
      doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(26,26,26);
      doc.text(nl.tituloLine,px,y);
      y+=3.5;
      doc.setFont("helvetica","normal");doc.setFontSize(notasFontSize);doc.setTextColor(70,70,70);
      const blockH=nl.wrapped.length*3.3+2.5;
      if(y+blockH>H-20){doc.addPage();y=20}
      doc.text(nl.wrapped,px,y);
      y+=nl.wrapped.length*3.3+3;
    });
    y+=2;
    const firmaCotH=35;
    if(y+firmaCotH>H-20){doc.addPage();y=20}
    doc.setFont("helvetica","italic");doc.setFontSize(9);doc.setTextColor(60,60,60);
    doc.text("Cordialmente,",mg,y);
    y+=4;
    const firmanteSelCot=FIRMANTES[firmaCot]||FIRMANTES.km;
    try{doc.addImage(firmanteSelCot.img,"PNG",mg,y,60,18)}catch(e){console.warn("No se pudo insertar firma:",e)}
    y+=19;
    doc.setDrawColor(100,100,100);doc.setLineWidth(0.3);doc.line(mg,y,mg+70,y);
    y+=4;doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(26,26,26);
    doc.text(firmanteSelCot.nombre,mg,y);
    y+=4;doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(80,80,80);
    doc.text(firmanteSelCot.cargo,mg,y);
    const pg=doc.getNumberOfPages();for(let i=1;i<=pg;i++){doc.setPage(i);doc.setDrawColor(201,169,110);doc.setLineWidth(0.3);doc.line(30,H-14,W-30,H-14);doc.setFontSize(14);doc.setTextColor(26,26,26);doc.text("WhatsApp +57 310 444 1588",mg,H-7);doc.text("@GourmetBitesbyAndradeMatuk",W-mg,H-7,{align:"right"})}
    // v4.12.2: usar Web Share API en iOS/Android para evitar fuga del blob URL en WhatsApp
    // v5.4.1 (Bloque B): usar savePdfConCopiaStorage para versionar + copia en Storage.
    // currentQuoteNumber es a la vez el docId en Firestore (confirmado: los
    // getDoc(doc(db,"quotes",currentQuoteNumber)) de saveCurrentQuote lo usan así).
    const baseName=currentQuoteNumber+"_"+cl.replace(/\s+/g,"_");
    await savePdfConCopiaStorage(doc,baseName,"quote",currentQuoteNumber);
  }catch(err){alert("Error generando PDF: "+err.message);console.error(err)}
}
