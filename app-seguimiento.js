// ═══════════════════════════════════════════════════════════
// app-seguimiento.js · v5.0.5 · 2026-04-21
// Pestaña de seguimiento comercial de cotizaciones/propuestas vivas.
// Permite marcar estado de followUp, agregar notas, contactar cliente
// vía WhatsApp/teléfono/correo con un tap.
// v5.0.5: expone binario VIVA/PERDIDA en UI. Tags contactado/activa
//         quedan internos. Agrega modal ♻️ Reactivar para perdidas.
// ═══════════════════════════════════════════════════════════

// Filtro de la pestaña: 'todos' | 'alertas' (>7d) | 'pendiente' | 'contactado' | 'activa'
let segFilter="todos";

// ─── MAIN RENDER ───────────────────────────────────────────
function renderSeguimiento(){
  const list=$("seg-list");
  const bar=$("seg-filter-bar");
  if(!list||!bar)return;
  if(typeof isFollowable!=="function"){list.innerHTML='<div class="seg-empty">Función de seguimiento no disponible</div>';return}
  // Obtener todos los followables con su estado
  const allFoll=(quotesCache||[]).filter(q=>isFollowable(q));
  // Clasificar
  const buckets={pendiente:[],contactado:[],activa:[],alertas:[]};
  allFoll.forEach(q=>{
    const fu=getFollowUp(q);
    if(fu==="perdida")return; // perdidas no se muestran aquí, van al filtro "Perdidas" del historial
    if(!buckets[fu])buckets[fu]=[];
    buckets[fu].push(q);
    if((fu==="pendiente"||fu==="contactado")&&daysSinceUpdate(q)>=7)buckets.alertas.push(q);
  });
  // Ordenar cada grupo: más días sin actualizar primero (los urgentes arriba)
  Object.keys(buckets).forEach(k=>{
    buckets[k].sort((a,b)=>daysSinceUpdate(b)-daysSinceUpdate(a));
  });
  // Filter bar
  const mkF=(k,label,n)=>'<button class="seg-filter '+(segFilter===k?"act":"")+'" onclick="setSegFilter(\''+k+'\')">'+label+' <span class="cnt">'+n+'</span></button>';
  bar.innerHTML=
    mkF("todos","Todos",allFoll.filter(q=>getFollowUp(q)!=="perdida").length)+
    mkF("alertas","⚠️ Alertas >7d",buckets.alertas.length)+
    mkF("pendiente","⏳ Pendientes",buckets.pendiente.length)+
    mkF("contactado","💬 Contactados",buckets.contactado.length)+
    mkF("activa","✅ Activas",buckets.activa.length);
  // Lista según filtro
  if(segFilter==="alertas"){
    if(!buckets.alertas.length){list.innerHTML=emptyState("sin_alertas");return}
    list.innerHTML=renderSegGroup("alertas",buckets.alertas,"⚠️ Alertas — Más de 7 días sin seguimiento");
    return;
  }
  if(segFilter!=="todos"){
    if(!buckets[segFilter].length){list.innerHTML=emptyState(segFilter);return}
    list.innerHTML=renderSegGroup(segFilter,buckets[segFilter]);
    return;
  }
  // Todos: 3 secciones agrupadas (pendiente, contactado, activa)
  let html="";
  if(buckets.pendiente.length)html+=renderSegGroup("pendiente",buckets.pendiente);
  if(buckets.contactado.length)html+=renderSegGroup("contactado",buckets.contactado);
  if(buckets.activa.length)html+=renderSegGroup("activa",buckets.activa);
  if(!html){html=emptyState("vacio")}
  list.innerHTML=html;
}

// Render de un grupo (pendiente / contactado / activa / alertas)
// v5.0.5: prefijo 🟢 VIVAS en los títulos para reforzar que son todas vivas.
function renderSegGroup(kind,docs,customTitle){
  const meta=FOLLOW_UP_META[kind]||{label:kind,cls:kind,emoji:"📋"};
  const titulosV505={
    pendiente:"🟢 VIGENTES · Sin contactar todavía",
    contactado:"🟢 VIGENTES · Ya contactadas, esperando respuesta",
    activa:"🟢 VIGENTES · En negociación activa (calientes)"
  };
  const title=customTitle||titulosV505[kind]||(meta.emoji+" "+meta.label+" — "+meta.desc);
  const groupCls=kind==="alertas"?"pendiente":kind;
  return '<div class="seg-group">'+
    '<div class="seg-group-header '+groupCls+'">'+title+
      '<span class="seg-group-count">'+docs.length+'</span>'+
    '</div>'+
    docs.map(renderSegCard).join("")+
    '</div>';
}

// Render de una tarjeta individual
function renderSegCard(q){
  const dias=daysSinceUpdate(q);
  const alert=dias>=7;
  const cls="seg-card"+(alert?" alert":"");
  const total=q.total||0;
  const qNum=q.quoteNumber||q.id;
  const tipo=q.kind==="quote"?"Cotización":"Propuesta";
  // Productos resumen: primeros 3 items
  let prodResumen="";
  if(q.kind==="quote"&&Array.isArray(q.items)){
    prodResumen=q.items.slice(0,3).map(it=>(it.name||"")+(it.qty?" ×"+it.qty:"")).filter(Boolean).join(", ");
    if(q.items.length>3)prodResumen+="...";
  }else if(q.kind==="proposal"&&Array.isArray(q.sections)){
    const secs=q.sections.map(s=>s.title||"").filter(Boolean).slice(0,2);
    prodResumen=secs.join(" · ");
    if(q.sections.length>2)prodResumen+=" · +"+(q.sections.length-2)+" más";
  }
  if(!prodResumen)prodResumen='<span style="color:#999">Sin descripción</span>';
  // Datos de contacto
  // v5.4.4 BUG-011 fix: los docs reales guardan tel/mail en q.tel y q.mail (ver app-cotizar.js y app-propuesta.js).
  // Antes solo se leía q.clientPhone/q.custPhone — campos que no existen — por eso en producción nunca aparecía
  // el botón WhatsApp en Seguimiento a pesar de que el código del modal estaba implementado en v5.4.3.
  const cel=(q.tel||q.clientPhone||q.custPhone||"").replace(/\D/g,"");
  const mail=q.mail||q.clientEmail||q.custEmail||"";
  const contactBtns=[];
  if(cel){
    // v5.4.3: botón WhatsApp ya no abre chat directo — abre modal de plantillas
    contactBtns.push('<button class="seg-btn-contact seg-btn-wa" onclick="event.stopPropagation();openWhatsAppTemplatesModal(\''+q.id+'\',\''+q.kind+'\')" style="border:none;font-family:inherit;cursor:pointer">📱 WhatsApp</button>');
    contactBtns.push('<a class="seg-btn-contact seg-btn-tel" href="tel:+57'+cel+'" onclick="event.stopPropagation()">📞 Llamar</a>');
  }
  if(mail){
    const subj=encodeURIComponent("Seguimiento cotización "+(qNum||"")+" — Gourmet Bites");
    contactBtns.push('<a class="seg-btn-contact seg-btn-mail" href="mailto:'+mail+'?subject='+subj+'" onclick="event.stopPropagation()">✉️ Correo</a>');
  }
  if(!cel&&!mail){
    contactBtns.push('<span class="seg-btn-contact" style="opacity:.5">⚠️ Sin contacto</span>');
  }
  // Última nota
  let notaHtml="";
  if(Array.isArray(q.notasSeguimiento)&&q.notasSeguimiento.length){
    const ultima=q.notasSeguimiento[q.notasSeguimiento.length-1];
    const fNota=(ultima.fecha||"").slice(0,10);
    // v6.1.0: h() reemplaza .replace(/[<>]/g,"") con escape completo (defensivo)
    notaHtml='<div class="seg-card-nota"><span class="scn-date">📝 '+fNota+'</span>'+
      h(ultima.texto||"")+'</div>';
  }
  const nContacto=cel||"";
  return '<div class="'+cls+'" data-id="'+q.id+'" data-kind="'+q.kind+'">'+
    '<div class="seg-card-top">'+
      '<span class="seg-card-num">'+h(qNum)+'</span>'+
      '<span class="seg-card-cli">'+h(q.client||"—")+'</span>'+
      '<span class="seg-card-total">'+fm(total)+'</span>'+
    '</div>'+
    '<div class="seg-card-meta">'+
      '<span>📆 '+(q.dateISO||"—")+'</span>'+
      '<span class="scm-dias '+(alert?"alert":"")+'">⏱️ '+dias+' día'+(dias!==1?'s':'')+' sin toque</span>'+
      '<span style="font-size:10px;color:#999">· '+tipo+'</span>'+
    '</div>'+
    '<div class="seg-card-prods">'+prodResumen+'</div>'+
    '<div class="seg-card-contact">'+contactBtns.join("")+'</div>'+
    notaHtml+
    '<div class="seg-card-actions">'+
      '<button class="seg-btn-action seg-btn-contactado" onclick="markFollowUp(\''+q.id+'\',\''+q.kind+'\',\'contactado\')">💬 Contactado</button>'+
      '<button class="seg-btn-action seg-btn-activa" onclick="markFollowUp(\''+q.id+'\',\''+q.kind+'\',\'activa\')">✅ Activa</button>'+
      '<button class="seg-btn-action seg-btn-perdida" onclick="openPerdidaModal(\''+q.id+'\',\''+q.kind+'\')">❌ Perdida</button>'+
      '<button class="seg-btn-action seg-btn-nota" onclick="openNotaSegModal(\''+q.id+'\',\''+q.kind+'\')">📝 Nota</button>'+
      '<button class="seg-btn-action seg-btn-open" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">👁️ Abrir</button>'+
    '</div>'+
    '</div>';
}

// Estados vacíos según filtro
function emptyState(kind){
  const msgs={
    vacio:{ic:"🎉",title:"Todo al día",sub:"No hay cotizaciones ni propuestas vigentes en seguimiento."},
    sin_alertas:{ic:"✅",title:"Sin alertas",sub:"Nada lleva más de 7 días sin seguimiento. Buen trabajo."},
    pendiente:{ic:"⏳",title:"Nada pendiente",sub:"No hay cotizaciones esperando primer contacto."},
    contactado:{ic:"💬",title:"Sin contactados",sub:"Nadie en espera de respuesta."},
    activa:{ic:"✅",title:"Sin activas",sub:"No hay negociaciones en curso."}
  };
  const m=msgs[kind]||msgs.vacio;
  return '<div class="seg-empty"><span class="se-ic">'+m.ic+'</span><strong>'+m.title+'</strong><br><span style="font-size:12px">'+m.sub+'</span></div>';
}

// ─── ACCIONES RÁPIDAS ──────────────────────────────────────
async function markFollowUp(docId,kind,estado){
  if(typeof setFollowUp!=="function"){alert("Función no disponible");return}
  if(typeof showLoader==="function")showLoader("Actualizando...");
  const ok=await setFollowUp(docId,kind,estado);
  if(typeof hideLoader==="function")hideLoader();
  if(ok){
    const meta=FOLLOW_UP_META[estado];
    if(typeof toast==="function")toast(meta.emoji+" Marcada como "+meta.label.toLowerCase(),"success");
    renderSeguimiento();
    if(typeof renderDashboard==="function")renderDashboard();
    if(typeof renderHist==="function"&&curMode==="hist")renderHist();
  }
}

function setSegFilter(k){
  segFilter=k;
  renderSeguimiento();
}

// ─── MODAL "MARCAR PERDIDA" ────────────────────────────────
let _perdidaCtx=null;

function openPerdidaModal(docId,kind){
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No se encontró el documento");return}
  _perdidaCtx={docId,kind,q};
  $("pe-doc-id").textContent=q.quoteNumber||q.id;
  $("pe-doc-cli").textContent=q.client||"—";
  $("pe-doc-meta").textContent=(q.kind==="quote"?"Cotización":"Propuesta")+" · Total: "+fm(q.total||0)+" · Creada: "+(q.dateISO||"—");
  $("pe-motivo").value="";
  $("pe-notas").value="";
  $("perdida-modal").classList.remove("hidden");
}

function closePerdidaModal(){
  $("perdida-modal").classList.add("hidden");
  _perdidaCtx=null;
}

async function submitPerdida(){
  if(!_perdidaCtx){alert("Contexto perdido");return}
  const motivo=$("pe-motivo").value;
  if(!motivo){alert("Escoge un motivo");return}
  const notas=$("pe-notas").value.trim();
  const motivoLabel=MOTIVOS_PERDIDA[motivo]||"Otro";
  if(typeof showLoader==="function")showLoader("Guardando...");
  const ok=await setFollowUp(_perdidaCtx.docId,_perdidaCtx.kind,"perdida",{motivo,motivoLabel,notas});
  if(typeof hideLoader==="function")hideLoader();
  if(ok){
    if(typeof toast==="function")toast("❌ "+( _perdidaCtx.q.quoteNumber||_perdidaCtx.docId)+" marcada como perdida: "+motivoLabel,"success");
    closePerdidaModal();
    renderSeguimiento();
    if(typeof renderDashboard==="function")renderDashboard();
    if(typeof renderHist==="function"&&curMode==="hist")renderHist();
  }
}

// ─── MODAL "NOTA DE SEGUIMIENTO" ───────────────────────────
let _notaSegCtx=null;

function openNotaSegModal(docId,kind){
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No se encontró el documento");return}
  _notaSegCtx={docId,kind,q};
  $("ns-doc-id").textContent=q.quoteNumber||q.id;
  $("ns-doc-cli").textContent=q.client||"—";
  // Historial de notas
  const histEl=$("ns-history");
  if(histEl){
    if(Array.isArray(q.notasSeguimiento)&&q.notasSeguimiento.length){
      const list=[...q.notasSeguimiento].reverse(); // más reciente primero
      histEl.innerHTML='<div style="font-size:10.5px;font-weight:700;color:#666;margin-bottom:6px">Historial ('+list.length+')</div>'+
        list.map(n=>{
          const f=(n.fecha||"").slice(0,10);
          const h=(n.fecha||"").slice(11,16);
          return '<div style="padding:6px 8px;background:#F5F7FA;border-radius:6px;margin-bottom:4px;font-size:11px;line-height:1.3"><span style="font-size:9.5px;color:#999">'+f+' '+h+' · '+(n.usuario||"?")+'</span><br>'+(n.texto||"").replace(/[<>]/g,"")+'</div>';
        }).join("");
    }else{
      histEl.innerHTML='<div style="font-size:11px;color:#999;font-style:italic">Aún no hay notas de seguimiento</div>';
    }
  }
  $("ns-nota").value="";
  $("nota-seg-modal").classList.remove("hidden");
  setTimeout(()=>$("ns-nota")?.focus(),100);
}

function closeNotaSegModal(){
  $("nota-seg-modal").classList.add("hidden");
  _notaSegCtx=null;
}

async function submitNotaSeg(){
  if(!_notaSegCtx){alert("Contexto perdido");return}
  const texto=$("ns-nota").value.trim();
  if(!texto){alert("Escribe una nota");return}
  if(typeof showLoader==="function")showLoader("Guardando nota...");
  const ok=await addNotaSeguimiento(_notaSegCtx.docId,_notaSegCtx.kind,texto);
  if(typeof hideLoader==="function")hideLoader();
  if(ok){
    if(typeof toast==="function")toast("✅ Nota guardada","success");
    closeNotaSegModal();
    renderSeguimiento();
    if(typeof renderDashboard==="function")renderDashboard();
  }
}

// ─── v5.0.5 · MODAL "REACTIVAR PERDIDA" ───────────────────
let _reactivarCtx=null;

function openReactivarModal(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No se encontró el documento");return}
  if(typeof isPerdida==="function"&&!isPerdida(q)){alert("Este documento no está marcado como perdida");return}
  _reactivarCtx={docId,kind,q};
  const motivoPrev=q.perdidaData?.motivoLabel||q.perdidaData?.motivo||"sin motivo";
  $("rv-doc-id").textContent=q.quoteNumber||q.id;
  $("rv-doc-cli").textContent=q.client||"—";
  $("rv-doc-meta").textContent=(q.kind==="quote"?"Cotización":"Propuesta")+" · Total: "+fm(q.total||0)+" · Perdida por: "+motivoPrev;
  $("reactivar-modal").classList.remove("hidden");
}

function closeReactivarModal(){
  $("reactivar-modal").classList.add("hidden");
  _reactivarCtx=null;
}

async function submitReactivar(destino){
  if(!_reactivarCtx){alert("Contexto perdido");return}
  if(typeof reactivarPerdida!=="function"){alert("Función no disponible");return}
  if(typeof showLoader==="function")showLoader("Reactivando...");
  const ok=await reactivarPerdida(_reactivarCtx.docId,_reactivarCtx.kind,destino);
  if(typeof hideLoader==="function")hideLoader();
  if(ok){
    const label=destino==="activa"?"ACTIVA (caliente)":"VIVA";
    if(typeof toast==="function")toast("♻️ Reactivada como "+label,"success");
    closeReactivarModal();
    renderSeguimiento();
    if(typeof renderDashboard==="function")renderDashboard();
    if(typeof renderHist==="function"&&curMode==="hist")renderHist();
  }
}

// ═══════════════════════════════════════════════════════════
// v5.4.3: PLANTILLAS DE MENSAJE WHATSAPP
// ═══════════════════════════════════════════════════════════
// 4 plantillas default (editables) guardadas en localStorage.
// Placeholders soportados: {cliente}, {numero}, {total}, {fecha}, {hora}, {dias}
// El modal permite elegir, editar en vivo antes de enviar, y gestionar
// las plantillas (editar/restaurar defaults).

const WA_TEMPLATES_KEY="gb_wa_templates_v1";
const WA_TEMPLATES_DEFAULT=[
  {id:"primer",label:"👋 Primer contacto",texto:"Hola {cliente}, te saluda Gourmet Bites. Acabamos de enviarte la cotización {numero}. Quedamos atentos a cualquier duda y para confirmar si podemos apoyarte con el pedido. ¡Gracias!"},
  {id:"seg7",label:"⏳ Seguimiento (7+ días)",texto:"Hola {cliente}, ¿cómo estás? Te escribo de Gourmet Bites para saber si sigue en pie tu cotización {numero} por {total}. Si necesitas ajustar algo (cantidades, productos, fecha) con gusto te ayudamos. Quedo atento."},
  {id:"anticipo",label:"💳 Recordatorio anticipo",texto:"Hola {cliente}, quedamos a la orden para tu pedido {numero} ({total}). Recordándote que para confirmar la entrega necesitamos el 50% de anticipo mínimo 24h antes. Por favor envíanos el comprobante por aquí mismo. ¡Gracias!"},
  {id:"diaantes",label:"📅 Recordatorio día antes",texto:"Hola {cliente}, ¡todo listo para mañana! Confirmamos entrega del pedido {numero} el {fecha} a las {hora}. Por favor confirma dirección y persona que recibe. Gracias por tu confianza en Gourmet Bites."}
];

function getWaTemplates(){
  try{
    const raw=localStorage.getItem(WA_TEMPLATES_KEY);
    if(!raw)return JSON.parse(JSON.stringify(WA_TEMPLATES_DEFAULT));
    const arr=JSON.parse(raw);
    if(!Array.isArray(arr)||!arr.length)return JSON.parse(JSON.stringify(WA_TEMPLATES_DEFAULT));
    return arr;
  }catch(e){return JSON.parse(JSON.stringify(WA_TEMPLATES_DEFAULT))}
}

function saveWaTemplates(arr){
  try{localStorage.setItem(WA_TEMPLATES_KEY,JSON.stringify(arr))}
  catch(e){console.warn("[wa templates] save falló",e)}
}

function resetWaTemplates(){
  confirmModal({
    title:"Restaurar plantillas",
    body:"¿Restaurar las 4 plantillas originales? Esto borra las ediciones actuales.",
    okLabel:"Restaurar",
    tone:"warn",
    onOk:()=>{
      saveWaTemplates(JSON.parse(JSON.stringify(WA_TEMPLATES_DEFAULT)));
      if(typeof toast==="function")toast("♻️ Plantillas restauradas","success");
      // Si el modal está abierto, re-renderizar
      if(_waCtx&&!$("wa-templates-modal").classList.contains("hidden")){
        renderWaTemplatesList();
      }
    }
  });
}

// Reemplaza placeholders con valores del doc
function fillWaPlaceholders(texto,q){
  if(!texto)return"";
  const cliente=q.client||"";
  const numero=q.quoteNumber||q.id||"";
  const total=(typeof fm==="function")?fm(q.total||0):String(q.total||0);
  const fecha=q.eventDate||"—";
  const hora=q.horaEntrega||"—";
  const dias=(typeof daysSinceUpdate==="function")?daysSinceUpdate(q):"";
  return texto
    .replace(/\{cliente\}/g,cliente)
    .replace(/\{numero\}/g,numero)
    .replace(/\{total\}/g,total)
    .replace(/\{fecha\}/g,fecha)
    .replace(/\{hora\}/g,hora)
    .replace(/\{dias\}/g,dias);
}

let _waCtx=null; // {q, cel, selectedTplId}

function openWhatsAppTemplatesModal(docId,kind){
  const q=(quotesCache||[]).find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No se encontró el documento");return}
  const cel=(q.clientPhone||q.custPhone||"").replace(/\D/g,"");
  if(!cel){alert("Este doc no tiene teléfono de contacto");return}
  _waCtx={q,cel,selectedTplId:null};
  // Header
  $("wa-doc-cli").textContent=q.client||"—";
  $("wa-doc-num").textContent=q.quoteNumber||q.id;
  $("wa-doc-tel").textContent="+57 "+cel;
  // Render lista de plantillas y preview vacío
  renderWaTemplatesList();
  $("wa-preview-textarea").value="";
  $("wa-send-btn").disabled=true;
  $("wa-send-btn").style.opacity="0.5";
  $("wa-templates-modal").classList.remove("hidden");
}

function closeWhatsAppTemplatesModal(){
  $("wa-templates-modal").classList.add("hidden");
  _waCtx=null;
}

function renderWaTemplatesList(){
  const listEl=$("wa-tpl-list");
  if(!listEl||!_waCtx)return;
  const tpls=getWaTemplates();
  listEl.innerHTML=tpls.map(t=>{
    const sel=(_waCtx.selectedTplId===t.id)?' wa-tpl-item-sel':'';
    return '<div class="wa-tpl-item'+sel+'" onclick="selectWaTemplate(\''+t.id+'\')">'+
      '<div class="wa-tpl-label">'+t.label.replace(/[<>]/g,"")+'</div>'+
      '<div class="wa-tpl-preview">'+(t.texto||"").slice(0,80).replace(/[<>]/g,"")+(t.texto.length>80?'…':'')+'</div>'+
    '</div>';
  }).join("")+
  '<button class="wa-tpl-manage" onclick="openWaTemplatesEditor()">✏️ Editar plantillas</button>';
}

function selectWaTemplate(tplId){
  if(!_waCtx)return;
  const tpls=getWaTemplates();
  const t=tpls.find(x=>x.id===tplId);
  if(!t)return;
  _waCtx.selectedTplId=tplId;
  const txt=fillWaPlaceholders(t.texto,_waCtx.q);
  $("wa-preview-textarea").value=txt;
  $("wa-send-btn").disabled=false;
  $("wa-send-btn").style.opacity="1";
  renderWaTemplatesList();
}

function sendWaTemplate(){
  if(!_waCtx)return;
  const txt=$("wa-preview-textarea").value.trim();
  if(!txt){alert("El mensaje está vacío");return}
  const cel=_waCtx.cel;
  const waNum=cel.length===10?"57"+cel:cel;
  const url="https://wa.me/"+waNum+"?text="+encodeURIComponent(txt);
  window.open(url,"_blank");
  closeWhatsAppTemplatesModal();
}

// ─── Editor de plantillas ──────────────────────────────────
let _waEditBackup=null; // snapshot antes de editar, para cancelar

function openWaTemplatesEditor(){
  _waEditBackup=JSON.parse(JSON.stringify(getWaTemplates()));
  renderWaTemplatesEditor();
  $("wa-editor-modal").classList.remove("hidden");
}

function closeWaTemplatesEditor(savedOk){
  if(!savedOk&&_waEditBackup){
    // Restaurar snapshot (cancel)
    saveWaTemplates(_waEditBackup);
  }
  _waEditBackup=null;
  $("wa-editor-modal").classList.add("hidden");
  // Refrescar lista en el modal principal si está abierto
  if(_waCtx&&!$("wa-templates-modal").classList.contains("hidden")){
    renderWaTemplatesList();
  }
}

function renderWaTemplatesEditor(){
  const listEl=$("wa-editor-list");
  if(!listEl)return;
  const tpls=getWaTemplates();
  listEl.innerHTML=tpls.map((t,i)=>{
    return '<div class="wa-editor-item">'+
      '<input type="text" class="wa-editor-label-input" value="'+(t.label||"").replace(/"/g,"&quot;")+'" oninput="updateWaTemplate('+i+',\'label\',this.value)" placeholder="Etiqueta (ej: 👋 Primer contacto)">'+
      '<textarea class="wa-editor-texto" oninput="updateWaTemplate('+i+',\'texto\',this.value)" placeholder="Texto del mensaje. Placeholders: {cliente} {numero} {total} {fecha} {hora} {dias}">'+(t.texto||"").replace(/[<>]/g,"")+'</textarea>'+
    '</div>';
  }).join("");
}

function updateWaTemplate(idx,campo,valor){
  const tpls=getWaTemplates();
  if(!tpls[idx])return;
  tpls[idx][campo]=valor;
  saveWaTemplates(tpls);
}

function saveWaTemplatesAndClose(){
  // Las ediciones ya están en localStorage (updateWaTemplate las persiste en vivo)
  if(typeof toast==="function")toast("✅ Plantillas guardadas","success");
  closeWaTemplatesEditor(true);
}
