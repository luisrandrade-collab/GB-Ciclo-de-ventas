// ═══════════════════════════════════════════════════════════
// app-seguimiento.js · v5.0.4 · 2026-04-20
// Pestaña de seguimiento comercial de cotizaciones/propuestas vivas.
// Permite marcar estado de followUp, agregar notas, contactar cliente
// vía WhatsApp/teléfono/correo con un tap.
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
function renderSegGroup(kind,docs,customTitle){
  const meta=FOLLOW_UP_META[kind]||{label:kind,cls:kind,emoji:"📋"};
  const title=customTitle||(meta.emoji+" "+meta.label+" — "+meta.desc);
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
  const cel=(q.clientPhone||q.custPhone||"").replace(/\D/g,"");
  const mail=q.clientEmail||q.custEmail||"";
  const contactBtns=[];
  if(cel){
    const waNum=cel.length===10?"57"+cel:cel;
    const msgWa=encodeURIComponent("Hola "+(q.client||"")+", te saludo de Gourmet Bites. Te quería confirmar si sigue en pie tu cotización "+(qNum||"")+". Quedo atento.");
    contactBtns.push('<a class="seg-btn-contact seg-btn-wa" href="https://wa.me/'+waNum+'?text='+msgWa+'" target="_blank" onclick="event.stopPropagation()">📱 WhatsApp</a>');
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
    notaHtml='<div class="seg-card-nota"><span class="scn-date">📝 '+fNota+'</span>'+
      (ultima.texto||"").replace(/[<>]/g,"")+'</div>';
  }
  const nContacto=cel||"";
  return '<div class="'+cls+'" data-id="'+q.id+'" data-kind="'+q.kind+'">'+
    '<div class="seg-card-top">'+
      '<span class="seg-card-num">'+qNum+'</span>'+
      '<span class="seg-card-cli">'+(q.client||"—")+'</span>'+
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
      '<button class="seg-btn-action seg-btn-open" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')">👁️ Abrir</button>'+
    '</div>'+
    '</div>';
}

// Estados vacíos según filtro
function emptyState(kind){
  const msgs={
    vacio:{ic:"🎉",title:"Todo al día",sub:"No hay cotizaciones ni propuestas vivas en seguimiento."},
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
