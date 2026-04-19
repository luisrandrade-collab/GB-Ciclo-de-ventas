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
function resetAllNotasCot(){if(!confirm("¿Restablecer todas las cláusulas a sus valores por defecto?"))return;Object.keys(DEFAULT_NOTAS_COT).forEach(k=>notasCotData[k]=DEFAULT_NOTAS_COT[k]);renderNotasCot()}

// ─── RENDER REVIEW ─────────────────────────────────────────
function renderR(){
  const cl=$("f-cli").value||"—",idStr=getIdStr(),att=$("f-att").value||cl,mail=$("f-mail").value,tel=$("f-tel").value,dir=$("f-dir").value,city=getCityName()||"—",deliv=getDelivStr();
  let info="";
  if(currentQuoteNumber)info+='<div style="margin-bottom:8px"><span class="qnum">'+currentQuoteNumber+'</span></div>';
  info+='<strong>Cliente:</strong> '+cl+(idStr?' — '+idStr:'')+'<br><strong>Atención:</strong> '+att+'<br>';
  if(tel)info+='<strong>Teléfono:</strong> '+tel+'<br>';
  if(mail)info+='<strong>Correo:</strong> '+mail+'<br>';
  if(dir)info+='<strong>Dirección:</strong> '+dir+'<br>';
  info+='<strong>Ciudad:</strong> '+city+'<br>';
  if(deliv)info+='<strong>Fecha de Entrega:</strong> '+deliv+'<br>';
  info+='<strong>Fecha cotización:</strong> '+dateStr();
  $("rev-info").innerHTML=info;
  const all=allIt(),tr=getTr(),tot=getTotal();
  if(!all.length){$("rev-content").innerHTML='<div class="empty"><div class="ic">📋</div><p>No hay productos</p><button class="btn bp" onclick="go(\'products\')">Agregar Productos</button></div>';return}
  let rows="";
  cart.forEach(i=>{
    const editedBadge=i.edited?' <span style="font-size:9px;background:var(--gd);color:#fff;padding:1px 5px;border-radius:3px">AJUSTADO</span>':'';
    const priceInput='<input type="number" class="pinput'+(i.edited?' edited':'')+'" value="'+i.p+'" onchange="chgCartPrice('+i.id+',+this.value)" onfocus="this.select()">';
    rows+='<tr><td style="text-align:left"><strong>'+i.n+'</strong>'+editedBadge+(i.d?'<br><span style="font-size:10px;color:#999">'+i.d+'</span>':'')+'</td><td style="text-align:center"><div class="qc" style="justify-content:center"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCartR('+i.id+','+(i.qty-1)+')">−</button><input type="number" class="qn" value="'+i.qty+'" min="1" onchange="chgCartR('+i.id+',+this.value)" onfocus="this.select()" style="width:34px;font-size:12px"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCartR('+i.id+','+(i.qty+1)+')">+</button></div></td><td style="text-align:right">'+priceInput+'</td><td style="text-align:right;font-weight:600">'+fm(i.p*i.qty)+'</td><td><button style="background:none;border:none;color:var(--rd);font-size:18px;cursor:pointer" onclick="remCart('+i.id+')">×</button></td></tr>';
  });
  cust.forEach(i=>{
    const priceInput='<input type="number" class="pinput" value="'+i.p+'" onchange="chgCustPrice(\''+i.id+'\',+this.value)" onfocus="this.select()">';
    rows+='<tr style="background:#FFFDE7"><td style="text-align:left"><strong>'+i.n+'</strong> <span style="font-size:9px;background:var(--gd);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span>'+(i.d?'<br><span style="font-size:10px;color:#999">'+i.d+'</span>':'')+'</td><td style="text-align:center"><div class="qc" style="justify-content:center"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCustQ(\''+i.id+'\','+(i.qty-1)+')">−</button><input type="number" class="qn" value="'+i.qty+'" min="1" onchange="chgCustQ(\''+i.id+'\',+this.value)" onfocus="this.select()" style="width:34px;font-size:12px"><button class="qb" style="width:24px;height:24px;font-size:14px" onclick="chgCustQ(\''+i.id+'\','+(i.qty+1)+')">+</button></div></td><td style="text-align:right">'+priceInput+'</td><td style="text-align:right;font-weight:600">'+fm(i.p*i.qty)+'</td><td><button style="background:none;border:none;color:var(--rd);font-size:18px;cursor:pointer" onclick="remCust(\''+i.id+'\')">×</button></td></tr>';
  });
  if(tr)rows+='<tr style="background:var(--cl)"><td style="text-align:left"><strong>'+tr.n+'</strong></td><td style="text-align:center">1</td><td style="text-align:right">'+fm(tr.p)+'</td><td style="text-align:right;font-weight:600">'+fm(tr.p)+'</td><td></td></tr>';
  const payBoxHtml='<div class="paybox"><div class="paytit">INSTRUCCIONES DE PAGO</div><div class="paybody">'+
    '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:var(--gd);letter-spacing:.6px;margin-bottom:3px">PERSONAS NATURALES</div>'+
    '<strong>Nequi / Daviplata:</strong> 3176654635<br>'+
    '<strong>Bre-B (al banco):</strong> juanpandrade2005@gmail.com<br>'+
    '<strong>Titular:</strong> Juan Pablo Andrade</div>'+
    '<div style="margin-bottom:8px;padding-top:6px;border-top:1px dashed rgba(201,169,110,.3)"><div style="font-size:10px;font-weight:700;color:var(--gd);letter-spacing:.6px;margin-bottom:3px">EMPRESAS (transferencia ACH)</div>'+
    '<strong>Banco Falabella:</strong> Cuenta de Ahorros No. 111820028616<br>'+
    '<strong>Titular:</strong> Juan Pablo Andrade Matuk — C.C. 1.032.876.662</div>'+
    '<div class="paynote">Envía el comprobante del pago por WhatsApp para procesar la confirmación del pedido. Mínimo 24 horas de anticipación a la entrega.</div>'+
    '</div></div>';
  const notasHtml='<div class="sec" style="margin-top:12px"><div class="stit" style="display:flex;justify-content:space-between;align-items:center">Condiciones del servicio <button class="cond-reset" style="font-size:10px" onclick="resetAllNotasCot()">↻ Restablecer todas</button></div><div id="notas-cot-list"></div></div>';
  $("rev-content").innerHTML='<table class="rtbl"><thead><tr><th style="text-align:left">Producto</th><th>Cant.</th><th style="text-align:right">V. Unit</th><th style="text-align:right">Subtotal</th><th></th></tr></thead><tbody>'+rows+'</tbody></table><div class="tbox"><div class="tl">Total</div><div class="ta">'+fm(tot)+'</div></div>'+payBoxHtml+notasHtml+'<div class="acts"><button class="btn bd" onclick="go(\'products\')">+ Productos</button><button class="btn bp" onclick="genPDF()">📄 Generar PDF</button><button class="btn bg" onclick="saveCurrentQuote()">💾 Guardar borrador</button></div>';
  renderNotasCot();
}

function chgCartPrice(id,newP){newP=parseInt(newP)||0;if(newP<=0)return;const i=cart.find(x=>x.id===id);if(i){if(!i.origP)i.origP=i.p;i.p=newP;i.edited=newP!==i.origP}renderR();updUI()}
function chgCustPrice(id,newP){newP=parseInt(newP)||0;if(newP<=0)return;const i=cust.find(x=>x.id===id);if(i)i.p=newP;renderR();updUI()}

// ─── SAVE COTIZACIÓN ───────────────────────────────────────
async function saveCurrentQuote(silent){
  const cl=$("f-cli").value.trim()||"Sin nombre";
  const items=allIt();
  if(!items.length){if(!silent)alert("Agrega productos primero");return}
  if(!cloudOnline){if(!silent)alert("Sin conexión. No se puede guardar.");return}
  try{
    if(!silent)showLoader("Generando consecutivo...");
    let qNum=currentQuoteNumber;
    if(!qNum)qNum=await getNextNumber("quote");
    await autoSaveClientFromCot();
    for(const cu of cust){try{await registerCustomProduct(cu.n,cu.d,cu.p,cu.u)}catch(e){console.warn("custom register skipped:",e)}}
    let prevStatus="enviada",prevOrderData=null,prevPagos=null,prevEntregaData=null,prevComentarioCliente=null,prevProductionDate=null,prevProduced=null,prevEventDate=null,prevHoraEntrega=null;
    if(currentQuoteNumber){
      try{
        const {db,doc,getDoc}=window.fb;
        const existing=await getDoc(doc(db,"quotes",currentQuoteNumber));
        if(existing.exists()){
          const d=existing.data();
          if(d.status)prevStatus=d.status;
          if(d.orderData)prevOrderData=d.orderData;
          if(d.pagos)prevPagos=d.pagos;
          if(d.entregaData)prevEntregaData=d.entregaData;
          if(d.comentarioCliente)prevComentarioCliente=d.comentarioCliente;
          if(d.productionDate)prevProductionDate=d.productionDate;
          if(typeof d.produced!=="undefined")prevProduced=d.produced;
          if(d.eventDate)prevEventDate=d.eventDate;
          if(d.horaEntrega)prevHoraEntrega=d.horaEntrega;
        }
      }catch(e){console.warn("No se pudo leer estado previo:",e)}
    }
    const qObj={
      quoteNumber:qNum,type:"cot",year:APP_YEAR,
      dateISO:new Date().toISOString(),
      client:cl,idStr:getIdStr(),
      att:$("f-att").value,mail:$("f-mail").value,tel:$("f-tel").value,dir:$("f-dir").value,
      city:getCityName(),cityType:$("f-city").value,trCustom:$("f-tr-custom").value,
      deliv:getDelivStr(),
      cart:cart.map(i=>({id:i.id,n:i.n,d:i.d||"",u:i.u||"",p:i.p,origP:i.origP||i.p,qty:i.qty,edited:!!i.edited})),
      cust:cust.map(i=>({n:i.n,p:i.p,d:i.d||"",u:i.u||"",qty:i.qty})),
      total:getTotal(),status:prevStatus,
      notasCotData:{...notasCotData},firma:firmaCot
    };
    if(prevOrderData)qObj.orderData=prevOrderData;
    if(prevPagos)qObj.pagos=prevPagos;
    if(prevEntregaData)qObj.entregaData=prevEntregaData;
    if(prevComentarioCliente)qObj.comentarioCliente=prevComentarioCliente;
    if(prevProductionDate)qObj.productionDate=prevProductionDate;
    if(prevProduced!==null)qObj.produced=prevProduced;
    if(prevEventDate)qObj.eventDate=prevEventDate;
    if(prevHoraEntrega)qObj.horaEntrega=prevHoraEntrega;
    if(!silent)showLoader("Guardando en la nube...");
    await saveQuoteToCloud(qObj);
    currentQuoteNumber=qNum;
    if(!silent){hideLoader();alert("✅ Borrador guardado: "+qNum)}
    if(curStep==="review")renderR();
  }catch(e){if(!silent)hideLoader();alert("Error al guardar: "+e.message);console.error(e)}
}

// ─── PDF COTIZACIÓN ────────────────────────────────────────
async function genPDF(){
  try{
    const all=allIt();
    if(!all.length){alert("Agrega productos antes de generar el PDF");return}
    if(!cloudOnline){alert("Sin conexión. Conecta a internet para generar el PDF con número de cotización.");return}
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
    await savePdf(doc,currentQuoteNumber+"_"+cl.replace(/\s+/g,"_")+".pdf");
  }catch(err){alert("Error generando PDF: "+err.message);console.error(err)}
}
