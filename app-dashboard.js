// ═══════════════════════════════════════════════════════════
// app-dashboard.js · v5.2.1 · 2026-04-21
// Dashboard + mini-dash + agenda mensual + agenda semanal
// scrollable + export .ics idempotente + comentarios recientes.
// v5.0.1b: drill-down agrupado + banner HOY + sync agenda + excluir convertidas.
// v5.0.2: banner sync pendiente + syncPendingOnly + rango custom.
// v5.0.3: excluir anuladas en todos los KPIs.
// v5.0.4: Pipeline Activo (pipeline vivo sin filtro de fecha) + banner follow-up.
// v5.0.5: badge VIVA/PERDIDA en drill-down y pipeline detail.
// v5.2.1: Hotfix render robusto + logs detallados\n// v5.2.0: Dashboard rediseñado (bento grid, render robusto con try-catch por
//         sección) + 3 reportes nuevos (conversión/pérdidas motivo/vista cliente) +
//         badge novedades + mantenimiento colapsable + fix botones ancho-completo.
// ═══════════════════════════════════════════════════════════

// ─── HELPER: total real de cualquier doc ───────────────────
// Para propuestas usa computePropTotal (replica el "TOTAL DEL SERVICIO" del PDF).
// Para cotizaciones usa q.total (ya guardado correctamente).
// Si el doc tiene q.total persistido, lo usa directo (fast path).
function getDocTotal(q){
  if(!q)return 0;
  if(q.total)return q.total;
  if(q.kind==="proposal"&&typeof computePropTotal==="function")return computePropTotal(q);
  return q.totalReal||0;
}

// ─── DASHBOARD ─────────────────────────────────────────────
let dashPeriod="month";
// v5.0.2: rango custom de fechas (solo usado si dashPeriod === "custom")
let dashCustomFrom="";
let dashCustomTo="";
function setDashPeriod(p){
  dashPeriod=p;
  document.querySelectorAll(".dp-btn").forEach(b=>b.classList.toggle("act",b.dataset.p===p));
  renderDashboard();
}
function getDashRange(){
  const today=new Date();
  const todayIso=today.toISOString().slice(0,10);
  if(dashPeriod==="all")return{start:"0000-01-01",end:"9999-12-31",label:"Histórico completo"};
  if(dashPeriod==="week"){const start=new Date(today);start.setDate(start.getDate()-6);return{start:start.toISOString().slice(0,10),end:todayIso,label:"Últimos 7 días ("+start.toISOString().slice(0,10)+" → "+todayIso+")"}}
  if(dashPeriod==="month"){const start=new Date(today.getFullYear(),today.getMonth(),1);return{start:start.toISOString().slice(0,10),end:todayIso,label:"Mes en curso ("+start.toISOString().slice(0,10).slice(0,7)+")"}}
  if(dashPeriod==="year"){const start=new Date(today.getFullYear(),0,1);return{start:start.toISOString().slice(0,10),end:todayIso,label:"Año en curso ("+today.getFullYear()+")"}}
  // v5.0.2: rango custom
  if(dashPeriod==="custom"&&dashCustomFrom&&dashCustomTo){
    return {start:dashCustomFrom,end:dashCustomTo,label:"Rango personalizado ("+dashCustomFrom+" → "+dashCustomTo+")"};
  }
  // Fallback si custom pero sin fechas: comportarse como mes
  const start=new Date(today.getFullYear(),today.getMonth(),1);
  return{start:start.toISOString().slice(0,10),end:todayIso,label:"Mes en curso ("+start.toISOString().slice(0,10).slice(0,7)+")"};
}
function dateOfCreation(q){
  if(q.dateISO)return q.dateISO.slice(0,10);
  if(q.createdAt?.toDate)try{return q.createdAt.toDate().toISOString().slice(0,10)}catch{}
  return null;
}
function dateOfSale(q){return q.orderData?.fechaAprobacion||q.approvalData?.fechaAprobacion||null}

async function renderDashboard(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  // v5.2.1: cada sección se envuelve en try-catch para que un error en una
  // no impida que el resto del dashboard se renderice. Antes de v5.2 un error
  // en renderBannerFollowUp (por ejemplo) dejaba el dashboard en blanco.
  // v5.2.1: protegemos incluso el body principal (range, loop, etc) por si
  // quotesCache tiene datos corruptos.
  const _safe=(fn,name)=>{try{fn()}catch(e){console.warn("[Dashboard] sección '"+name+"' falló:",e);console.warn("  stack:",e?.stack)}};

  _safe(renderFantasmasBanner,"fantasmas-banner");
  _safe(renderBannerEntregasHoy,"banner-hoy");
  _safe(renderBannerConvertidasArchivables,"banner-convertidas");
  _safe(renderBannerSync,"banner-sync");
  _safe(renderCustomRangeInfo,"custom-range");
  _safe(renderPipelineActivo,"pipeline-activo");
  _safe(renderBannerFollowUp,"banner-followup");
  // v5.2.0: banner de novedades desde última visita (R5 simple)
  _safe(renderBannerNovedades,"banner-novedades");

  // v5.2.1: cálculo de métricas dentro de try-catch robusto
  let cotCount=0,cotMonto=0,cotClientes=new Set();
  let venCount=0,venMonto=0,venClientes=new Set();
  let entCount=0,entMonto=0;
  let porCobrarTotal=0,porCobrarN=0;
  const recaudoMet={};METODOS_PAGO.forEach(m=>recaudoMet[m]=0);
  let totalRecaudo=0;
  let range=null,inRange=null;
  _safe(()=>{
    range=getDashRange();
    const pInfoEl=$("dash-period-info");
    if(pInfoEl)pInfoEl.textContent=range.label;
    inRange=fecha=>fecha&&fecha>=range.start&&fecha<=range.end;
    quotesCache.forEach(q=>{
      try{
        if(q._wrongCollection)return;
        const status=q.status||"enviada";
        if(status==="superseded")return;
        if(status==="anulada")return;
        if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida"&&(status==="enviada"||status==="propfinal"))return;
        const total=getDocTotal(q);
        const fCre=dateOfCreation(q);
        const fVen=dateOfSale(q);
        const fEnt=q.fechaEntrega||q.eventDate;
        if(inRange(fCre)&&status!=="convertida"){cotCount++;cotMonto+=total;if(q.client)cotClientes.add(q.client)}
        if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){venCount++;venMonto+=total;if(q.client)venClientes.add(q.client)}
        if(inRange(fEnt)&&status==="entregado"){entCount++;entMonto+=total}
        if(["pedido","aprobada","en_produccion","entregado"].includes(status)){const pend=saldoPendiente(q);if(pend>0){porCobrarTotal+=pend;porCobrarN++}}
        getPagos(q).forEach(p=>{if(inRange(p.fecha)){const m=METODOS_PAGO.includes(p.metodo)?p.metodo:"Otro";recaudoMet[m]+=parseInt(p.monto)||0}});
      }catch(eDoc){
        console.warn("[Dashboard] doc con error en loop:",q?.id,q?.kind,eDoc);
      }
    });
    totalRecaudo=Object.values(recaudoMet).reduce((s,v)=>s+v,0);
  },"metricas-loop");
  const _hint='<div style="position:absolute;bottom:6px;right:8px;font-size:9px;color:var(--soft)">Toca para ver →</div>';
  // KPIs del período (bento)
  _safe(()=>{
    const el=$("dash-cards");
    if(!el){console.warn("[Dashboard] #dash-cards no existe en el DOM");return}
    el.innerHTML=
      '<div class="dash-card cot" style="cursor:pointer" onclick="openDashDetail(\'cotizado\')"><div class="dash-card-icon">🧾</div><div class="dash-card-lab">Cotizado</div><div class="dash-card-val">'+fm(cotMonto)+'</div><div class="dash-card-sub">'+cotCount+' doc · '+cotClientes.size+' cliente'+(cotClientes.size!==1?'s':'')+'</div>'+_hint+'</div>'+
      '<div class="dash-card vendido" style="cursor:pointer" onclick="openDashDetail(\'vendido\')"><div class="dash-card-icon">🤝</div><div class="dash-card-lab">Vendido</div><div class="dash-card-val">'+fm(venMonto)+'</div><div class="dash-card-sub">'+venCount+' pedido'+(venCount!==1?'s':'')+' · '+venClientes.size+' cliente'+(venClientes.size!==1?'s':'')+'</div>'+_hint+'</div>'+
      '<div class="dash-card entregado" style="cursor:pointer" onclick="openDashDetail(\'entregado\')"><div class="dash-card-icon">🎉</div><div class="dash-card-lab">Entregado</div><div class="dash-card-val">'+fm(entMonto)+'</div><div class="dash-card-sub">'+entCount+' entrega'+(entCount!==1?'s':'')+'</div>'+_hint+'</div>'+
      '<div class="dash-card recaudo" style="cursor:pointer" onclick="openDashDetail(\'recaudo\')"><div class="dash-card-icon">💵</div><div class="dash-card-lab">Recaudado</div><div class="dash-card-val">'+fm(totalRecaudo)+'</div><div class="dash-card-sub">en el período</div>'+_hint+'</div>'+
      '<div class="dash-card cobrar" style="cursor:pointer" onclick="openDashDetail(\'cobrar\')"><div class="dash-card-icon">⚠️</div><div class="dash-card-lab">Por cobrar</div><div class="dash-card-val">'+fm(porCobrarTotal)+'</div><div class="dash-card-sub">'+porCobrarN+' documento'+(porCobrarN!==1?'s':'')+' (todos los activos)</div>'+_hint+'</div>';
  },"kpis-cards");

  // v5.2.0: Reportes comerciales (solo si range/inRange se calcularon OK)
  if(range&&inRange){
    _safe(()=>renderReporteConversion(range,inRange),"reporte-conversion");
    _safe(()=>renderReportePerdidas(range,inRange),"reporte-perdidas");
  }
  // v5.2.0: Vista por cliente (re-renderiza si hay uno seleccionado)
  _safe(renderClienteView,"cliente-view");

  // v5.3.0: Operación urgente (por producir + por entregar en próximos 3 días)
  // SIEMPRE VISIBLE — lo más importante del día a día operativo
  _safe(renderUrgent3d,"urgent-3d");

  // v5.3.0: aplicar estado guardado de collapsibles (localStorage)
  _safe(applyDashCollapsedState,"collapsed-state");

  // Recaudo por método
  _safe(()=>{
    const el=$("dash-recaudo");
    if(!el)return;
    const maxMet=Math.max(...Object.values(recaudoMet),1);
    const recRows=METODOS_PAGO.map(m=>{
      const v=recaudoMet[m];
      const pct=Math.round(v*100/maxMet);
      return '<div class="dash-met-row"><div class="dash-met-name">'+m+'</div><div class="dash-met-bar"><div class="dash-met-bar-fill" style="width:'+(v>0?pct:0)+'%"></div></div><div class="dash-met-val">'+fm(v)+'</div></div>';
    }).join("");
    el.innerHTML=totalRecaudo>0?recRows:'<div class="dash-met-empty">Sin pagos registrados en el período.</div>';
  },"recaudo");
  // Próximas entregas (próximos 14 días, ignora período)
  _safe(()=>{
    const todayIso2=new Date().toISOString().slice(0,10);
    const t14=new Date();t14.setDate(t14.getDate()+14);
    const t14Iso=t14.toISOString().slice(0,10);
    const upcoming=[];
    quotesCache.forEach(q=>{
      if(q._wrongCollection)return;
      const s=q.status||"enviada";
      if(s==="superseded")return;
      const ok=(q.kind==="quote"&&["pedido","en_produccion"].includes(s))||(q.kind==="proposal"&&["aprobada","en_produccion"].includes(s));
      if(!ok||!q.eventDate)return;
      if(q.eventDate>=todayIso2&&q.eventDate<=t14Iso)upcoming.push(q);
    });
    upcoming.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
    if(!upcoming.length){$("dash-upcoming").innerHTML='<div class="dash-met-empty">No hay entregas en los próximos 14 días.</div>'}
    else{
      const byDay={};upcoming.forEach(q=>{(byDay[q.eventDate]=byDay[q.eventDate]||[]).push(q)});
      const dayLabel=iso=>{
        if(iso===todayIso2)return"HOY · "+iso;
        const t=new Date(todayIso2+"T00:00:00"),d=new Date(iso+"T00:00:00");
        const diff=Math.round((d-t)/86400000);
        if(diff===1)return"MAÑANA · "+iso;
        if(diff===2)return"PASADO · "+iso;
        return iso;
      };
      $("dash-upcoming").innerHTML=Object.keys(byDay).sort().map(d=>{
        const items=byDay[d].map(q=>{
          const tag=q.kind==="quote"?'<span class="ui-tag prod">Pedido</span>':'<span class="ui-tag ent">Evento</span>';
          const hora=q.horaEntrega?'⏰ '+q.horaEntrega:'';
          const total=fm(getDocTotal(q));
          return '<div class="dash-up-item" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')"><div class="ui-cli">'+tag+(q.client||"—")+'</div><div class="ui-meta">'+hora+' · '+total+'</div></div>';
        }).join("");
        return '<div class="dash-up-day"><div class="dash-up-day-label">'+dayLabel(d)+'</div>'+items+'</div>';
      }).join("");
    }
  },"upcoming");
  // Pendientes por cobrar (top 8)
  _safe(()=>{
    const pendList=[];
    quotesCache.forEach(q=>{
      if(q._wrongCollection)return;
      const s=q.status||"enviada";
      if(s==="superseded")return;
      if(!["pedido","aprobada","en_produccion","entregado"].includes(s))return;
      const pend=saldoPendiente(q);if(pend>0)pendList.push({q,pend});
    });
    pendList.sort((a,b)=>b.pend-a.pend);
    if(!pendList.length){$("dash-pendientes").innerHTML='<div class="dash-met-empty">🎉 No hay saldos pendientes.</div>'}
    else{
      $("dash-pendientes").innerHTML=pendList.slice(0,8).map(({q,pend})=>{
        const tag=q.kind==="quote"?'<span class="ui-tag prod">Pedido</span>':'<span class="ui-tag ent">Evento</span>';
        return '<div class="dash-up-item" onclick="openVerPagosModal(\''+q.id+'\',\''+q.kind+'\')"><div class="ui-cli">'+tag+(q.client||"—")+'</div><div class="ui-meta" style="color:#E65100;font-weight:700">'+fm(pend)+'</div></div>';
      }).join("")+(pendList.length>8?'<div class="dash-met-empty" style="padding:8px">+'+(pendList.length-8)+' más en Historial</div>':"");
    }
  },"pendientes");
  // Comentarios recientes
  _safe(()=>{
    const coments=quotesCache.filter(q=>!q._wrongCollection&&q.status!=="superseded"&&q.status!=="anulada"&&(q.comentarioCliente?.texto||q.comentarioCliente?.fotoUrl||q.comentarioCliente?.fotoBase64)).map(q=>({q,c:q.comentarioCliente}));
    coments.sort((a,b)=>(b.c.fecha||"").localeCompare(a.c.fecha||""));
    if(!coments.length){$("dash-coments").innerHTML='<div class="dash-met-empty">Aún no se han registrado comentarios. Cuando entregues, registra qué dijo el cliente.</div>'}
    else{
      $("dash-coments").innerHTML=coments.slice(0,5).map(({q,c})=>{
        const fotoIcon=(c.fotoUrl||c.fotoBase64)?' 📷':'';
        const txt=(c.texto||"(solo foto)").slice(0,120)+((c.texto||"").length>120?'...':'');
        return '<div class="dash-up-item" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 0;border-bottom:1px solid var(--cl)" onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\')">'+
          '<div style="font-size:11px;color:var(--mid)"><strong>'+(q.client||"—")+'</strong> · '+(c.fecha||"—")+fotoIcon+'</div>'+
          '<div style="font-size:12.5px;color:var(--bk);font-style:italic">"'+txt+'"</div>'+
        '</div>';
      }).join("");
    }
  },"comentarios");
  // v5.2.0: marcar visita actual para comparar en siguiente sesión (R5 simple)
  try{saveLastVisit()}catch(e){console.warn("saveLastVisit falló:",e)}
}

// ─── MINI-DASHBOARD landing cotización ─────────────────────
async function renderMiniDash(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const dashEl=$("mini-dash");if(!dashEl)return;
  const today=new Date();
  const todayIso=today.toISOString().slice(0,10);
  const weekEnd=new Date(today);weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndIso=weekEnd.toISOString().slice(0,10);
  const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowIso=tomorrow.toISOString().slice(0,10);
  const pasado=new Date(today);pasado.setDate(pasado.getDate()+2);
  const pasadoIso=pasado.toISOString().slice(0,10);
  const upcoming={hoy:[],mañana:[],pasado:[],semana:[]};
  let saldoP=0;
  const statusAgendados={proposal:["aprobada","en_produccion"],quote:["pedido","en_produccion"]};
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return; // v4.12.7
    const s=q.status;
    if(s==="superseded")return; // v4.12.7
    const statusOK=statusAgendados[q.kind]||[];
    if(statusOK.includes(s)&&q.eventDate){
      if(q.eventDate===todayIso)upcoming.hoy.push(q);
      else if(q.eventDate===tomorrowIso)upcoming.mañana.push(q);
      else if(q.eventDate===pasadoIso)upcoming.pasado.push(q);
      else if(q.eventDate>todayIso&&q.eventDate<=weekEndIso)upcoming.semana.push(q);
    }
    if(["pedido","aprobada","en_produccion","entregado"].includes(s)&&saldoPendiente(q)>0)saldoP++;
  });
  const hoyN=upcoming.hoy.length,mañanaN=upcoming.mañana.length,pasadoN=upcoming.pasado.length,semanaN=upcoming.semana.length;
  const total=hoyN+mañanaN+pasadoN+semanaN;
  if(total===0&&saldoP===0){dashEl.classList.add("hidden");dashEl.innerHTML="";return}
  const listify=arr=>arr.map(q=>(q.client||"—")+(q.horaEntrega?' '+q.horaEntrega:'')).join(" · ");
  const items=[];
  if(hoyN>0)items.push('<div class="mini-dash-item today" title="'+listify(upcoming.hoy)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+hoyN+'</div><div class="mini-dash-lab">🔥 Hoy</div></div>');
  if(mañanaN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.mañana)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+mañanaN+'</div><div class="mini-dash-lab">📅 Mañana</div></div>');
  if(pasadoN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.pasado)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+pasadoN+'</div><div class="mini-dash-lab">📆 Pasado<br>mañana</div></div>');
  if(semanaN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.semana)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+semanaN+'</div><div class="mini-dash-lab">🗓️ Resto<br>semana</div></div>');
  if(saldoP>0)items.push('<div class="mini-dash-item alert" onclick="setMode(\'hist\')"><div class="mini-dash-val">'+saldoP+'</div><div class="mini-dash-lab">💰 Saldo<br>por cobrar</div></div>');
  dashEl.innerHTML=items.join("");
  dashEl.classList.remove("hidden");
}

// ═══════════════════════════════════════════════════════════
// AGENDA — toggle Semana / Mes
// ═══════════════════════════════════════════════════════════
let calView="week"; // "week" | "month"
let calMonth=new Date().getMonth();
let calYear=new Date().getFullYear();
let weekAnchor=null; // ISO YYYY-MM-DD del lunes de la semana mostrada

function setCalView(v){
  calView=v;
  $("cal-view-week").classList.toggle("act",v==="week");
  $("cal-view-month").classList.toggle("act",v==="month");
  $("cal-week-view").classList.toggle("hidden",v!=="week");
  $("cal-month-view").classList.toggle("hidden",v!=="month");
  if(v==="week")renderWeek();
  else renderMonth();
}
async function renderCalendar(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  if(calView==="week")renderWeek();else renderMonth();
}

// ─── Helpers fecha ─────────────────────────────────────────
function parseIsoDate(s){
  if(!s||typeof s!=="string")return null;
  const p=s.split("-");
  if(p.length!==3)return null;
  const y=parseInt(p[0]),m=parseInt(p[1]),d=parseInt(p[2]);
  if(isNaN(y)||isNaN(m)||isNaN(d))return null;
  return {y,m:m-1,d};
}
function isoToDate(iso){const p=iso.split("-");return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]))}
function dateToIso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
// Lunes de la semana de la fecha dada (ISO)
function getMondayIso(iso){
  const d=isoToDate(iso);
  let day=d.getDay();if(day===0)day=7; // domingo→7
  d.setDate(d.getDate()-(day-1));
  return dateToIso(d);
}

// ─── VISTA SEMANA ──────────────────────────────────────────
function weekToday(){weekAnchor=getMondayIso(new Date().toISOString().slice(0,10));renderWeek()}
function weekPrev(){if(!weekAnchor)weekToday();const d=isoToDate(weekAnchor);d.setDate(d.getDate()-7);weekAnchor=dateToIso(d);renderWeek()}
function weekNext(){if(!weekAnchor)weekToday();const d=isoToDate(weekAnchor);d.setDate(d.getDate()+7);weekAnchor=dateToIso(d);renderWeek()}

function eventsAllStatuses(){
  // Eventos = docs con eventDate y status agendable (incluye entregados de la semana)
  // v4.12.7: excluye fantasmas y superseded
  const statusProp=["aprobada","en_produccion","entregado"];
  const statusQuote=["pedido","en_produccion","entregado"];
  return quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(q.status==="superseded")return false;
    if(q.status==="anulada")return false; // v5.0.3: anuladas no aparecen en agenda
    // v5.0.4: perdidas tampoco aparecen en agenda (aunque no deberían llegar aquí con esos estados)
    if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida")return false;
    const ok=q.kind==="quote"?statusQuote.includes(q.status):statusProp.includes(q.status);
    return ok&&q.eventDate;
  });
}

function renderWeek(){
  if(!weekAnchor)weekAnchor=getMondayIso(new Date().toISOString().slice(0,10));
  const start=isoToDate(weekAnchor);
  const end=new Date(start);end.setDate(end.getDate()+6);
  const todayIso=new Date().toISOString().slice(0,10);
  const monthNames=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const mShort=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const dows=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const startStr=start.getDate()+" "+mShort[start.getMonth()];
  const endStr=end.getDate()+" "+mShort[end.getMonth()]+" "+end.getFullYear();
  $("week-title").textContent="Semana del "+startStr+" al "+endStr;
  const events=eventsAllStatuses();
  // Agrupar por día
  const byDay={};
  events.forEach(q=>{(byDay[q.eventDate]=byDay[q.eventDate]||[]).push(q)});
  // Render 7 días
  let html="";
  for(let i=0;i<7;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const iso=dateToIso(d);
    const evs=(byDay[iso]||[]).sort((a,b)=>(a.horaEntrega||"").localeCompare(b.horaEntrega||""));
    const isToday=iso===todayIso;
    const dayClass="week-day"+(isToday?" today":"")+(evs.length?"":" empty-day");
    const dateBox='<div class="wd-date"><div class="wd-dow">'+dows[i]+'</div><div class="wd-num">'+d.getDate()+'</div><div class="wd-mon">'+mShort[d.getMonth()]+'</div></div>';
    let evsHtml;
    if(!evs.length){evsHtml='<div class="wd-empty-msg">Sin eventos</div>'}
    else{
      evsHtml='<div class="wd-evs">'+evs.map(q=>{
        const tag=q.kind==="quote"?'<span class="we-tag prod">Pedido</span>':'<span class="we-tag ent">Evento</span>';
        const hora=q.horaEntrega?'⏰ '+q.horaEntrega:'';
        const total=fm(getDocTotal(q));
        const sCls=q.status||"enviada";
        return '<div class="wd-ev '+sCls+'" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')"><span class="we-cli">'+tag+(q.client||"—")+'</span><span class="we-meta">'+hora+(hora&&total?' · ':'')+total+'</span></div>';
      }).join("")+'</div>';
    }
    html+='<div class="'+dayClass+'">'+dateBox+evsHtml+'</div>';
  }
  $("week-grid").innerHTML=html;
}

// ─── VISTA MES (preservada de v4.11) ──────────────────────
function calPrevMonth(){calMonth--;if(calMonth<0){calMonth=11;calYear--}renderMonth()}
function calNextMonth(){calMonth++;if(calMonth>11){calMonth=0;calYear++}renderMonth()}
function calGoToday(){const d=new Date();calMonth=d.getMonth();calYear=d.getFullYear();renderMonth()}

function eventsForMonth(year,month){
  return eventsAllStatuses().filter(q=>{
    const p=parseIsoDate(q.eventDate);
    return p&&p.y===year&&p.m===month;
  }).sort((a,b)=>a.eventDate.localeCompare(b.eventDate));
}

function renderMonth(){
  const monthNames=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  $("cal-title").textContent=monthNames[calMonth]+" "+calYear;
  const firstDay=new Date(calYear,calMonth,1);
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let leadingBlanks=firstDay.getDay()-1;if(leadingBlanks<0)leadingBlanks=6;
  const monthEvents=eventsForMonth(calYear,calMonth);
  const byDay={};
  monthEvents.forEach(q=>{const p=parseIsoDate(q.eventDate);if(!p)return;if(!byDay[p.d])byDay[p.d]=[];byDay[p.d].push(q)});
  const dowLabels=["L","M","M","J","V","S","D"];
  let cells=dowLabels.map(l=>'<div class="cal-dow">'+l+'</div>').join("");
  for(let i=0;i<leadingBlanks;i++)cells+='<div class="cal-cell empty"></div>';
  const today=new Date();
  const isCurrentMonth=today.getMonth()===calMonth&&today.getFullYear()===calYear;
  for(let d=1;d<=daysInMonth;d++){
    const evs=byDay[d]||[];
    const hasEv=evs.length>0;
    const isToday=isCurrentMonth&&today.getDate()===d;
    let classes="cal-cell";
    if(isToday)classes+=" today";
    if(hasEv)classes+=" has-ev";
    const onclick=hasEv?' onclick="calFocusDay('+d+')"':"";
    let inner='<div class="cd-num">'+d+'</div>';
    if(hasEv){
      const pastillas=evs.slice(0,2).map(q=>{const lbl=(q.client||"—").split(/\s+/)[0].slice(0,8);return '<div class="cd-ev '+q.status+'" title="'+(q.client||"")+'">'+lbl+'</div>'}).join("");
      const extra=evs.length>2?'<div class="cd-ev" style="background:#9E9E9E">+'+(evs.length-2)+'</div>':"";
      inner+='<div class="cd-evs">'+pastillas+extra+'</div>';
    }
    cells+='<div class="'+classes+'"'+onclick+'>'+inner+'</div>';
  }
  $("cal-grid").innerHTML=cells;
  const sumEl=$("cal-sum-list");
  if(!monthEvents.length){
    sumEl.innerHTML='<div class="cal-sum-empty">📅 Sin entregas este mes.</div>';
    $("cal-sum-title").textContent="Entregas del mes";
    return;
  }
  $("cal-sum-title").textContent="Entregas del mes ("+monthEvents.length+")";
  const mShort=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  sumEl.innerHTML=monthEvents.map(q=>{
    const p=parseIsoDate(q.eventDate);
    const sMeta=STATUS_META[q.status]||STATUS_META.enviada;
    const isQuote=q.kind==="quote";
    const typeTag=isQuote?'<span class="hc-type cot" style="margin-left:4px">Pedido</span>':'<span class="hc-type prop" style="margin-left:4px">Evento</span>';
    const pax=q.pers?q.pers+' pax · ':'';
    const mom=q.momento?q.momento:'';
    const hora=q.horaEntrega?'⏰ '+q.horaEntrega:'';
    const meta=[pax+mom,hora].filter(Boolean).join(' · ');
    return '<div class="cal-ev-card '+q.status+'" id="cal-ev-'+p.d+'-'+q.id+'" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')"><div class="cal-ev-date"><div class="d">'+p.d+'</div><div class="m">'+mShort[p.m]+'</div></div><div class="cal-ev-body"><div class="cal-ev-cli">'+(q.client||"—")+typeTag+' <span class="hc-status '+sMeta.cls+'" style="margin-left:4px">'+sMeta.label+'</span></div><div class="cal-ev-meta"><span>'+meta+'</span></div></div></div>';
  }).join("");
}
function calFocusDay(d){
  const cards=document.querySelectorAll('[id^="cal-ev-'+d+'-"]');
  if(!cards.length)return;
  cards[0].scrollIntoView({behavior:"smooth",block:"center"});
  cards[0].style.transition="background .3s";
  cards[0].style.background="#FFF9C4";
  setTimeout(()=>{cards[0].style.background=""},700);
}

// ═══════════════════════════════════════════════════════════
// EXPORT .ics (idempotente, 2 eventos por pedido)
// ═══════════════════════════════════════════════════════════

// Hash determinístico simple para UIDs (no cripto, suficiente para idempotencia)
function _hashStr(str){
  let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0}
  return Math.abs(h).toString(16).padStart(8,"0");
}
function _uid(docId,tipo){return "gb-"+_hashStr(docId+"-"+tipo)+"-"+docId.toLowerCase().replace(/[^a-z0-9]/g,"")+"@gourmetbites"}

// Escapa texto para .ics (RFC 5545)
function _icsEscape(s){if(!s)return"";return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n").replace(/\r/g,"")}
// Fold de líneas largas (>75 chars)
function _icsFold(line){
  if(line.length<=75)return line;
  const out=[];
  let i=0;
  out.push(line.slice(0,75));i=75;
  while(i<line.length){out.push(" "+line.slice(i,i+74));i+=74}
  return out.join("\r\n");
}
function _icsDateUtc(d){return d.toISOString().replace(/[-:]/g,"").split(".")[0]+"Z"}
function _icsDateOnly(iso){return iso.replace(/-/g,"")}

// v4.12.6: Lista de productos en formato compacto (una línea con separadores).
// - Cotización: "33× Hummus, 2× Babaganush, 1× Quibbe"
// - Propuesta: "ENTRADAS: 33× Hummus, 2× Babaganush — PLATO FUERTE: 33× Mixto — MENAJE: 35× Platos — PERSONAL: 2 meseros"
function _buildItemsInline(q){
  if(q.kind==="quote"){
    const parts=[];
    (q.cart||[]).forEach(i=>{const qty=i.qty||0;parts.push(qty+"× "+(i.n||"—"))});
    (q.cust||[]).forEach(i=>{const qty=i.qty||0;parts.push(qty+"× "+(i.n||"—"))});
    return parts.join(", ");
  }
  const sections=[];
  (q.sections||[]).forEach(sec=>{
    const opts=sec.options||[];
    const opt=opts.find(o=>o.label==="Opción A")||opts[0];
    if(!opt)return;
    const its=opt.items||[];
    if(!its.length)return;
    const items=its.map(it=>{
      const qStr=(it.qty%1===0)?String(it.qty):(it.qty||0).toFixed(1);
      return qStr+"× "+(it.name||"—");
    }).join(", ");
    sections.push((sec.name||"").toUpperCase()+": "+items);
  });
  const menUsado=(q.menaje||[]).filter(m=>m.qty);
  if(menUsado.length){
    sections.push("MENAJE: "+menUsado.map(m=>m.qty+"× "+(m.name||"—")).join(", "));
  }
  const pm=q.personalData?.meseros||{},pa=q.personalData?.auxiliares||{};
  const pers=[];
  if(pm.cantidad)pers.push(pm.cantidad+" meseros");
  if(pa.cantidad)pers.push(pa.cantidad+" auxiliares");
  if(pers.length)sections.push("PERSONAL: "+pers.join(", "));
  return sections.join(" — ");
}

// v4.12.6: Calcula el slot de producción de un pedido.
// Producción = entrega − 1 día (por definición). Si hay múltiples pedidos ese día,
// se organizan en slots consecutivos de 5 min desde 8:00 AM.
// Orden: por horaEntrega ascendente (quien sale más temprano se produce primero).
// Tiebreak: por quoteNumber.
function _getProdSlot(q){
  if(!q.eventDate&&!q.productionDate)return null;
  // Helper: derivar productionDate = eventDate - 1 si no existe
  const derivePD=x=>{
    if(x.productionDate)return x.productionDate;
    if(!x.eventDate)return null;
    const d=isoToDate(x.eventDate);d.setDate(d.getDate()-1);
    return dateToIso(d);
  };
  const prodDate=derivePD(q);
  if(!prodDate)return null;
  // Todos los pedidos/eventos que se producirán ese mismo día
  const sameDay=quotesCache.filter(x=>{
    if(!(x.eventDate||x.productionDate))return false;
    // Solo docs activos que van a producción (pedido/aprobada/en_produccion/entregado)
    const s=x.status||"enviada";
    const okStatus=(x.kind==="quote"&&["pedido","en_produccion","entregado"].includes(s))
                 ||(x.kind==="proposal"&&["aprobada","en_produccion","entregado"].includes(s));
    if(!okStatus)return false;
    return derivePD(x)===prodDate;
  });
  // Ordenar por horaEntrega, tiebreak por quoteNumber/id
  sameDay.sort((a,b)=>{
    const hA=a.horaEntrega||"99:99";
    const hB=b.horaEntrega||"99:99";
    if(hA!==hB)return hA.localeCompare(hB);
    return (a.quoteNumber||a.id||"").localeCompare(b.quoteNumber||b.id||"");
  });
  const idx=sameDay.findIndex(x=>x.id===q.id);
  const safeIdx=idx<0?0:idx;
  const startMin=8*60+safeIdx*5; // 08:00 + idx×5 min
  const endMin=startMin+5;       // duración 5 min
  return {
    prodDate,
    startH:Math.floor(startMin/60),startM:startMin%60,
    endH:Math.floor(endMin/60),endM:endMin%60,
    position:safeIdx+1,totalSameDay:sameDay.length
  };
}

// v4.12.6: DESCRIPTION compacto (una línea con separador " · ") + slots de producción 5 min.
//   - Producción: "Cliente · A PRODUCIR: 33× Hummus, 2× Babaganush · NOTAS: ..."
//     Horario: slot consecutivo de 5 min desde 8:00 AM, ordenado por hora de entrega del día sig.
//     1 alarma: 24h antes
//   - Entrega: "Cliente · Dirección · A ENTREGAR: ... · NOTAS: ..."
//     Horario: hora real, 1h duración.
//     2 alarmas: 24h antes + 2h antes
function _buildVeventsForDoc(q){
  const lines=[];
  const dtStamp=_icsDateUtc(new Date());
  const productos=_buildItemsInline(q);
  const summaryBase=(q.client||"—")+(q.kind==="proposal"?" (Evento)":"");

  // ─── PRODUCCIÓN ─── slot 5 min desde 8AM + 1 alerta -1d
  // Se activa si hay productionDate O si hay eventDate (derivamos prod = entrega-1)
  if(q.productionDate||q.eventDate){
    const slot=_getProdSlot(q);
    if(slot){
      const notas=q.orderData?.notasProduccion||q.approvalData?.notasProduccion||"";
      // Descripción compacta: cliente · productos · notas (una línea con ·)
      const descParts=[q.client||"—"];
      if(productos)descParts.push("A PRODUCIR: "+productos);
      if(notas)descParts.push("NOTAS: "+notas);
      const desc=descParts.map(_icsEscape).join(" · ");
      const dateStr=slot.prodDate.replace(/-/g,"");
      const hh=s=>String(s).padStart(2,"0");
      const startLocal=dateStr+"T"+hh(slot.startH)+hh(slot.startM)+"00";
      const endLocal=dateStr+"T"+hh(slot.endH)+hh(slot.endM)+"00";
      lines.push("BEGIN:VEVENT");
      lines.push(_icsFold("UID:"+_uid(q.id,"PRODUCCION")));
      lines.push("DTSTAMP:"+dtStamp);
      lines.push("DTSTART:"+startLocal);
      lines.push("DTEND:"+endLocal);
      lines.push(_icsFold("SUMMARY:🔪 Producción "+_icsEscape(summaryBase)));
      lines.push(_icsFold("DESCRIPTION:"+desc));
      lines.push("CATEGORIES:GOURMET-BITES,PRODUCCION");
      lines.push("STATUS:CONFIRMED");
      // Una sola alerta: 24 horas antes
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P1D");
      lines.push("ACTION:DISPLAY");
      lines.push(_icsFold("DESCRIPTION:Mañana producción "+hh(slot.startH)+":"+hh(slot.startM)+" — "+_icsEscape(q.client||"—")));
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    }
  }

  // ─── ENTREGA ─── hora real (1h duración) + alertas -1d y -2h
  if(q.eventDate){
    const notas=q.entregaData?.notasEntrega||"";
    // Descripción compacta: cliente · dirección · productos · notas (una línea con ·)
    const descParts=[q.client||"—"];
    if(q.dir)descParts.push(q.dir);
    if(productos)descParts.push("A ENTREGAR: "+productos);
    if(notas)descParts.push("NOTAS: "+notas);
    const desc=descParts.map(_icsEscape).join(" · ");
    lines.push("BEGIN:VEVENT");
    lines.push(_icsFold("UID:"+_uid(q.id,"ENTREGA")));
    lines.push("DTSTAMP:"+dtStamp);
    if(q.horaEntrega){
      const startLocal=q.eventDate.replace(/-/g,"")+"T"+q.horaEntrega.replace(":","")+"00";
      const [h,m]=q.horaEntrega.split(":").map(Number);
      let endH=h+1,endM=m;
      if(endH>=24){endH-=24}
      const endLocal=q.eventDate.replace(/-/g,"")+"T"+String(endH).padStart(2,"0")+String(endM).padStart(2,"0")+"00";
      lines.push("DTSTART:"+startLocal);
      lines.push("DTEND:"+endLocal);
    }else{
      lines.push("DTSTART;VALUE=DATE:"+_icsDateOnly(q.eventDate));
      const ed=isoToDate(q.eventDate);ed.setDate(ed.getDate()+1);
      lines.push("DTEND;VALUE=DATE:"+_icsDateOnly(dateToIso(ed)));
    }
    lines.push(_icsFold("SUMMARY:🎉 Entrega "+_icsEscape(summaryBase)+(q.horaEntrega?" "+q.horaEntrega:"")));
    lines.push(_icsFold("DESCRIPTION:"+desc));
    if(q.dir)lines.push(_icsFold("LOCATION:"+_icsEscape(q.dir)));
    lines.push("CATEGORIES:GOURMET-BITES,ENTREGA");
    lines.push("STATUS:CONFIRMED");
    // Alerta 1: 24 horas antes
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-P1D");
    lines.push("ACTION:DISPLAY");
    lines.push(_icsFold("DESCRIPTION:Mañana entrega"+(q.horaEntrega?" "+q.horaEntrega:"")+" — "+_icsEscape(q.client||"—")));
    lines.push("END:VALARM");
    // Alerta 2: 2 horas antes (v4.12.6: bajó de 3h → 2h)
    if(q.horaEntrega){
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT2H");
      lines.push("ACTION:DISPLAY");
      lines.push(_icsFold("DESCRIPTION:Entrega en 2h ("+q.horaEntrega+") — "+_icsEscape(q.client||"—")));
      lines.push("END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  return lines;
}

function _icsHeader(){
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gourmet Bites//Cotizador "+BUILD_VERSION+"//ES","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Gourmet Bites Agenda","X-WR-TIMEZONE:America/Bogota"];
}
function _icsFooter(){return ["END:VCALENDAR"]}

// v4.12.6: igual que savePdf pero para .ics — en iOS/Android usa Web Share API,
// en desktop/navegadores sin share cae al download clásico.
// Así el botón 📅 .ics funciona igual de fluido en ambas plataformas.
async function shareOrDownloadIcs(filename,lines){
  const ics=lines.join("\r\n");
  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
  try{
    const file=new File([blob],filename,{type:"text/calendar"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{
        await navigator.share({files:[file],title:filename});
        return;
      }catch(e){
        if(e&&e.name==="AbortError")return;
        console.warn("Web Share .ics falló, fallback a download:",e);
      }
    }
  }catch(e){console.warn("shareIcs blob creation falló, fallback:",e)}
  // Fallback: download clásico
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a)},100);
}

// Export 1 pedido: 2 eventos (producción + entrega)
async function exportPedidoIcs(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No encontrado");return}
  if(!q.eventDate&&!q.productionDate){alert("Este pedido no tiene fechas de entrega ni producción asignadas.");return}
  const lines=[..._icsHeader(),..._buildVeventsForDoc(q),..._icsFooter()];
  const fname=(q.quoteNumber||q.id)+"_"+(q.client||"sin").replace(/\s+/g,"_")+".ics";
  await shareOrDownloadIcs(fname,lines);
}

// Export agenda completa: todos los eventos próximos 60 días + último mes
async function exportAgendaIcs(){
  const today=new Date();
  const past=new Date(today);past.setDate(past.getDate()-30);
  const future=new Date(today);future.setDate(future.getDate()+60);
  const pastIso=dateToIso(past),futureIso=dateToIso(future);
  const docs=eventsAllStatuses().filter(q=>{
    const f=q.eventDate||q.productionDate;
    return f&&f>=pastIso&&f<=futureIso;
  });
  if(!docs.length){alert("No hay eventos en el rango (30 días atrás → 60 días adelante).");return}
  const lines=[..._icsHeader()];
  docs.forEach(q=>{lines.push(..._buildVeventsForDoc(q))});
  lines.push(..._icsFooter());
  await shareOrDownloadIcs("gourmet-bites-agenda-"+dateToIso(today)+".ics",lines);
}

// ═══════════════════════════════════════════════════════════
// v4.12.1: DRILL-DOWN — modal con detalle de cada KPI del dashboard
// ═══════════════════════════════════════════════════════════
function openDashDetail(tipo){
  // v5.2.3: guardar tipo actual para poder refrescar el drill-down
  // después de etiquetar Viva/Perdida desde las filas.
  _dashDetailTipoActual=tipo;
  const range=getDashRange();
  const inRange=fecha=>fecha&&fecha>=range.start&&fecha<=range.end;
  let title="",rows=[],totalSum=0;
  // v4.12.7: helper de filtro común — excluye fantasmas y superseded
  // v5.0.3: también excluye anuladas
  const _excluido=q=>q._wrongCollection||q.status==="superseded"||q.status==="anulada";
  // Helper para fila de doc
  const docRow=(q,monto,extra)=>{
    const fecha=dateOfCreation(q)||"—";
    const sMeta=STATUS_META[q.status||"enviada"]||STATUS_META.enviada;
    const tag=q.kind==="quote"?'<span class="ui-tag prod">Pedido</span>':'<span class="ui-tag ent">Evento</span>';
    // v5.0.5: badge VIVA/PERDIDA solo para followables
    let ecBadge="";
    if(typeof estadoComercial==="function"){
      const ec=estadoComercial(q);
      if(ec&&typeof ESTADO_COMERCIAL_META!=="undefined"&&ESTADO_COMERCIAL_META[ec]){
        const m=ESTADO_COMERCIAL_META[ec];
        ecBadge=' <span class="hc-estado-badge '+m.cls+'">'+m.emoji+' '+m.label+'</span>';
      }
    }
    // v5.3.0: chips compactos inline (no full-width). Botones según tipo/status:
    //   - Cotización enviada no perdida → 🟢/❌ + 🤝 Pedido (openOrderModal)
    //   - Propuesta enviada/propfinal no perdida → 🟢/❌ + ✓ Aprobar (openApproveModal)
    //   - Cualquier followable ya perdida → ♻️ Reactivar
    // Respeta la regla UX de Luis: "jamás full-width buttons"
    let quickBtns="";
    if(typeof isFollowable==="function"&&isFollowable(q)){
      const esPerdida=typeof isPerdida==="function"&&isPerdida(q);
      const s=q.status||"enviada";
      const chips=[];
      if(esPerdida){
        chips.push('<button class="dd-chip dd-chip-react" onclick="event.stopPropagation();openReactivarModal(\''+q.id+'\',\''+q.kind+'\',event)" title="Reactivar">♻️</button>');
      }else{
        chips.push('<button class="dd-chip dd-chip-viva" onclick="event.stopPropagation();ddQuickViva(\''+q.id+'\',\''+q.kind+'\',event)" title="Viva">🟢</button>');
        chips.push('<button class="dd-chip dd-chip-perdida" onclick="event.stopPropagation();openPerdidaModal(\''+q.id+'\',\''+q.kind+'\')" title="Perdida">❌</button>');
        // Botón convertir según tipo
        if(q.kind==="quote"&&s==="enviada"){
          chips.push('<button class="dd-chip dd-chip-convert" onclick="event.stopPropagation();closeDashDetail();openOrderModal(\''+q.id+'\',event)" title="Marcar como pedido">🤝 Pedido</button>');
        }else if(q.kind==="proposal"&&(s==="enviada"||s==="propfinal")){
          chips.push('<button class="dd-chip dd-chip-convert" onclick="event.stopPropagation();closeDashDetail();openApproveModal(\''+q.id+'\',\'proposal\',event)" title="Marcar como aprobada">✓ Aprobar</button>');
        }
      }
      quickBtns='<div class="dd-row-chips">'+chips.join("")+'</div>';
    }
    return '<div class="dd-row" onclick="closeDashDetail();loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="dd-row-top"><div class="dd-row-cli">'+tag+(q.client||"—")+'</div><div class="dd-row-monto">'+fm(monto)+'</div></div>'+
      '<div class="dd-row-meta"><span class="qnum" style="font-size:9px">'+(q.quoteNumber||q.id)+'</span> · '+fecha+' · <span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span>'+ecBadge+(extra?' · '+extra:'')+'</div>'+
      quickBtns+
    '</div>';
  };
  if(tipo==="cotizado"){
    title="🧾 Cotizado · "+range.label;
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      const status=q.status||"enviada";
      const fCre=dateOfCreation(q);
      if(inRange(fCre)&&status!=="convertida"){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t})}
    });
  }else if(tipo==="vendido"){
    title="🤝 Vendido · "+range.label;
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      const status=q.status||"enviada";
      const fVen=dateOfSale(q);
      if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t,extra:"Vendido: "+fVen})}
    });
  }else if(tipo==="entregado"){
    title="🎉 Entregado · "+range.label;
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      const status=q.status||"enviada";
      const fEnt=q.fechaEntrega||q.eventDate;
      if(inRange(fEnt)&&status==="entregado"){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t,extra:"Entregado: "+fEnt})}
    });
  }else if(tipo==="cobrar"){
    title="⚠️ Por cobrar · todos los pedidos activos";
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      const status=q.status||"enviada";
      if(!["pedido","aprobada","en_produccion","entregado"].includes(status))return;
      const pend=saldoPendiente(q);
      if(pend>0){totalSum+=pend;rows.push({q,monto:pend,extra:"Cobrado: "+fm(totalCobrado(q))+" / Total: "+fm(getDocTotal(q))})}
    });
  }else if(tipo==="recaudo"){
    title="💵 Recaudado · "+range.label;
    // Lista de PAGOS individuales (no docs) — agrupar por método al final como resumen
    const pagosLista=[];
    const porMetodo={};METODOS_PAGO.forEach(m=>porMetodo[m]=0);
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      getPagos(q).forEach(p=>{
        if(inRange(p.fecha)){
          const monto=parseInt(p.monto)||0;
          totalSum+=monto;
          const met=METODOS_PAGO.includes(p.metodo)?p.metodo:"Otro";
          porMetodo[met]+=monto;
          pagosLista.push({q,p,monto,met});
        }
      });
    });
    pagosLista.sort((a,b)=>(b.p.fecha||"").localeCompare(a.p.fecha||""));
    // Render especial para recaudo: resumen por método arriba + lista
    let resumen='<div class="dd-resumen">';
    METODOS_PAGO.forEach(m=>{
      if(porMetodo[m]>0)resumen+='<div class="dd-resumen-row"><span>'+m+'</span><strong>'+fm(porMetodo[m])+'</strong></div>';
    });
    resumen+='</div>';
    const pagosHtml=pagosLista.map(({q,p,monto,met})=>{
      const fotoIcon=(p.fotoUrl||p.foto)?' 📷':'';
      return '<div class="dd-row" onclick="closeDashDetail();openVerPagosModal(\''+q.id+'\',\''+q.kind+'\')">'+
        '<div class="dd-row-top"><div class="dd-row-cli">'+(q.client||"—")+fotoIcon+'</div><div class="dd-row-monto">'+fm(monto)+'</div></div>'+
        '<div class="dd-row-meta">'+p.fecha+' · '+met+' · '+(p.tipo||"pago")+(p.notas?' · '+p.notas.slice(0,40):'')+'</div>'+
      '</div>';
    }).join("");
    $("dd-title").textContent=title;
    $("dd-list").innerHTML=
      '<div class="dd-summary">Total: <strong>'+fm(totalSum)+'</strong> · '+pagosLista.length+' pago'+(pagosLista.length!==1?'s':'')+'</div>'+
      resumen+
      (pagosLista.length?pagosHtml:'<div class="dd-empty">Sin pagos en el período.</div>');
    $("dash-detail-modal").classList.remove("hidden");
    return;
  }
  // v5.0.1b: Render agrupado por cliente — ordenado por subtotal desc.
  // Clientes con 1 solo doc también se muestran pero sin subtotal redundante.
  const byClient={};
  rows.forEach(r=>{
    const cli=r.q.client||"(Sin cliente)";
    if(!byClient[cli])byClient[cli]={total:0,items:[]};
    byClient[cli].total+=r.monto;
    byClient[cli].items.push(r);
  });
  const clientes=Object.keys(byClient).map(cli=>({cli,total:byClient[cli].total,items:byClient[cli].items,count:byClient[cli].items.length}));
  clientes.sort((a,b)=>b.total-a.total);
  // Ordenar los docs de cada cliente por monto desc
  clientes.forEach(c=>c.items.sort((a,b)=>b.monto-a.monto));

  let html="";
  if(!rows.length){
    html='<div class="dd-empty">Sin documentos en este corte.</div>';
  }else{
    html=clientes.map(c=>{
      // Si el cliente tiene 1 doc, sin header separado (más limpio visualmente)
      if(c.count===1){
        return '<div class="dd-group">'+c.items.map(r=>docRow(r.q,r.monto,r.extra)).join("")+'</div>';
      }
      // Cliente con varios docs: header con subtotal
      const header='<div class="dd-group-header">'+
        '<div class="dgh-cli">'+c.cli+'</div>'+
        '<div class="dgh-meta">'+c.count+' docs</div>'+
        '<div class="dgh-total">'+fm(c.total)+'</div>'+
      '</div>';
      const items=c.items.map(r=>docRow(r.q,r.monto,r.extra)).join("");
      return '<div class="dd-group">'+header+items+'</div>';
    }).join("");
  }
  $("dd-title").textContent=title;
  const summary='<div class="dd-summary">Total: <strong>'+fm(totalSum)+'</strong> · '+rows.length+' documento'+(rows.length!==1?'s':'')+' · '+clientes.length+' cliente'+(clientes.length!==1?'s':'')+'</div>';
  $("dd-list").innerHTML=summary+html;
  $("dash-detail-modal").classList.remove("hidden");
}
function closeDashDetail(){$("dash-detail-modal").classList.add("hidden");_dashDetailTipoActual=null}

// v5.2.3: helpers para etiquetado rápido desde drill-down del dashboard
// Reusa quickMarkViva (historial) y openPerdidaModal (seguimiento) sin modificarlos.
// Tras etiquetar VIVA, refresca el drill-down automáticamente para reflejar el cambio.
// Para PERDIDA, el modal de motivo se abre superpuesto; al confirmar, submitPerdida
// ya refresca dashboard completo. El drill-down se refresca cuando el usuario
// cierre y reabra (no hacemos auto-refresh aquí para no invadir submitPerdida).
let _dashDetailTipoActual=null;

async function ddQuickViva(docId,kind,ev){
  if(typeof quickMarkViva!=="function"){alert("Función no disponible");return}
  await quickMarkViva(docId,kind,ev);
  // Si el drill-down sigue abierto, re-renderizar con datos frescos
  const modal=$("dash-detail-modal");
  if(modal&&!modal.classList.contains("hidden")&&_dashDetailTipoActual){
    openDashDetail(_dashDetailTipoActual);
  }
}

// ═══════════════════════════════════════════════════════════
// v4.13.0: Banner de advertencia por docs fantasmas en dashboard
// ═══════════════════════════════════════════════════════════
function renderFantasmasBanner(){
  const el=$("dash-warn-fantasmas");
  if(!el)return;
  const fantasmas=quotesCache.filter(q=>q._wrongCollection);
  if(!fantasmas.length){el.classList.add("hidden");el.innerHTML="";return}
  el.classList.remove("hidden");
  el.innerHTML='<div class="dbw-ic">⚠️</div>'+
    '<div class="dbw-txt">Se detectaron <strong>'+fantasmas.length+' doc(s) fantasma</strong> (PF mal guardados antes de v4.12.7). No suman al dashboard pero conviene limpiarlos.</div>'+
    '<button onclick="cleanupWrongDocs()">🧹 Limpiar ahora</button>';
}

// ═══════════════════════════════════════════════════════════
// v5.0.1b: BANNER ENTREGAS HOY — aparece si hay pedidos con eventDate = hoy
// Click en el banner lleva a la vista de Agenda.
// ═══════════════════════════════════════════════════════════
function renderBannerEntregasHoy(){
  const el=$("dash-banner-hoy");
  if(!el)return;
  const hoyIso=new Date().toISOString().slice(0,10);
  const entregasHoy=quotesCache.filter(q=>{
    if(q._wrongCollection||q.status==="superseded"||q.status==="convertida"||q.status==="anulada")return false;
    if(q.eventDate!==hoyIso)return false;
    if(q.status==="entregado")return false; // ya entregado no aparece
    const ok=(q.kind==="quote"&&["pedido","en_produccion"].includes(q.status))||(q.kind==="proposal"&&["aprobada","en_produccion"].includes(q.status));
    return ok;
  });
  if(!entregasHoy.length){el.classList.add("hidden");el.innerHTML="";return}
  el.classList.remove("hidden");
  entregasHoy.sort((a,b)=>(a.horaEntrega||"").localeCompare(b.horaEntrega||""));
  const clientesTxt=entregasHoy.slice(0,3).map(q=>(q.client||"—")+(q.horaEntrega?' '+q.horaEntrega:'')).join(" · ");
  const mas=entregasHoy.length>3?' · +'+(entregasHoy.length-3)+' más':'';
  el.innerHTML='<div class="dbh-ic">🔥</div>'+
    '<div class="dbh-txt"><strong>'+entregasHoy.length+' entrega'+(entregasHoy.length!==1?'s':'')+' HOY</strong> · '+clientesTxt+mas+'</div>'+
    '<div class="dbh-arrow">→</div>';
}

// ═══════════════════════════════════════════════════════════
// v5.0.1b: BANNER CONVERTIDAS ARCHIVABLES — aparece si hay 3+ convertidas viejas.
// Por ahora informativo (abrir filtro Convertidas del historial).
// En v5.1 podría agregar archivado real con flag _archived.
// ═══════════════════════════════════════════════════════════
function renderBannerConvertidasArchivables(){
  const el=$("dash-banner-convertidas");
  if(!el)return;
  const convertidas=quotesCache.filter(q=>!q._wrongCollection&&q.status==="convertida");
  if(convertidas.length<3){el.classList.add("hidden");el.innerHTML="";return}
  el.classList.remove("hidden");
  el.innerHTML='<div class="dbi-ic">ℹ️</div>'+
    '<div class="dbi-txt">Tienes <strong>'+convertidas.length+' propuestas convertidas</strong> en el histórico. Son el origen de Propuestas Finales ya firmadas — ocultas del historial por default.</div>'+
    '<button onclick="setMode(\'hist\');setTimeout(()=>setHistFilter(\'convertidas\'),100)">Ver filtro</button>';
}

// ═══════════════════════════════════════════════════════════
// v5.0.1b: SINCRONIZAR AGENDA CON KATHY Y JP
// Genera un único .ics con todos los pedidos FUTUROS (hoy en adelante),
// incluyendo eventos de Producción + Entrega con UIDs idempotentes.
// El share sheet permite mandarlo por WhatsApp a Kathy y JP.
// Cuando ellos abren el .ics, sus calendarios se ACTUALIZAN (no duplican).
// ═══════════════════════════════════════════════════════════
async function syncAgendaAllFuture(){
  try{
    if(!quotesCache.length){try{await loadAllHistory()}catch{}}
    const hoyIso=new Date().toISOString().slice(0,10);
    // Pedidos agendados vivos con fecha futura (incluye hoy)
    const futuros=quotesCache.filter(q=>{
      if(q._wrongCollection||q.status==="superseded"||q.status==="convertida"||q.status==="anulada")return false;
      if(!q.eventDate||q.eventDate<hoyIso)return false;
      const ok=(q.kind==="quote"&&["pedido","en_produccion"].includes(q.status))||(q.kind==="proposal"&&["aprobada","en_produccion"].includes(q.status));
      return ok;
    });
    if(!futuros.length){
      alert("📤 Sincronizar agenda\n\nNo hay pedidos agendados con fecha futura para compartir.\n\nLos pedidos se agendan cuando los marcas como \"pedido\" (cotización) o \"aprobada\" (propuesta), y les asignas fecha de entrega.");
      return;
    }
    futuros.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
    // Construir el .ics usando helpers existentes
    const lines=[..._icsHeader()];
    futuros.forEach(q=>{lines.push(..._buildVeventsForDoc(q))});
    lines.push(..._icsFooter());
    const filename="Gourmet-Bites-Agenda-"+hoyIso+".ics";
    const resumen=futuros.length+" pedido"+(futuros.length!==1?'s':'')+" · "+futuros.reduce((s,q)=>s+2,0)+" eventos (prod + entrega por pedido)";
    if(!confirm("📤 Sincronizar agenda con Kathy y JP\n\nSe va a generar un archivo .ics con:\n  "+resumen+"\n\nDespués de confirmar:\n  1. Se abre el menú compartir\n  2. Escoges WhatsApp\n  3. Mandas a Kathy y a JP\n  4. Ellos abren el archivo en su teléfono y se AGREGA/ACTUALIZA en sus calendarios (no duplica)\n\n¿Continuar?"))return;
    await shareOrDownloadIcs(filename,lines);
    if(typeof toast==="function")toast("✅ Agenda lista para compartir · "+futuros.length+" pedidos","success");
  }catch(e){
    console.error("syncAgendaAllFuture error",e);
    alert("Error generando agenda: "+(e.message||e));
  }
}

// ═══════════════════════════════════════════════════════════
// v5.0.2: BANNER SYNC PENDIENTE
// Aparece si hay pedidos agendables con needsSync:true.
// Un tap genera .ics incremental SOLO con los pendientes, los marca synced tras compartir.
// ═══════════════════════════════════════════════════════════
function renderBannerSync(){
  const el=$("dash-banner-sync");
  if(!el)return;
  // Solo docs agendables con needsSync explícitamente true
  const pendientes=quotesCache.filter(q=>(typeof isAgendable==="function"?isAgendable(q):true)&&q.needsSync===true);
  if(!pendientes.length){el.classList.add("hidden");el.innerHTML="";return}
  el.classList.remove("hidden");
  pendientes.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
  const primeros=pendientes.slice(0,3).map(q=>(q.client||"—")+" "+q.eventDate).join(" · ");
  const mas=pendientes.length>3?" · +"+(pendientes.length-3)+" más":"";
  el.innerHTML='<div class="dbs-ic">📤</div>'+
    '<div class="dbs-txt"><strong>'+pendientes.length+' pedido'+(pendientes.length!==1?'s':'')+' por sincronizar con Kathy y JP</strong><br><span style="font-size:11px;opacity:.85">'+primeros+mas+'</span></div>'+
    '<button onclick="syncPendingOnly()">Sincronizar ('+pendientes.length+')</button>';
}

// ═══════════════════════════════════════════════════════════
// v5.0.2: SINCRONIZAR SOLO PENDIENTES (INCREMENTAL)
// Genera un .ics más pequeño con solo los docs con needsSync:true.
// Tras compartir, marca todos como synced (needsSync:false, lastSyncAt:now).
// ═══════════════════════════════════════════════════════════
async function syncPendingOnly(){
  try{
    if(!quotesCache.length){await loadAllHistory()}
    const pendientes=quotesCache.filter(q=>(typeof isAgendable==="function"?isAgendable(q):true)&&q.needsSync===true);
    if(!pendientes.length){
      if(typeof toast==="function")toast("No hay pedidos pendientes de sincronizar","info");
      return;
    }
    pendientes.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
    const resumen=pendientes.length+" pedido"+(pendientes.length!==1?'s':'')+" nuevo"+(pendientes.length!==1?'s':'');
    if(!confirm("📤 Sincronizar pendientes con Kathy y JP\n\nSolo se incluyen los "+resumen+" que están pendientes.\n\nDespués de confirmar:\n  1. Se abre el menú compartir\n  2. Escoges WhatsApp → mandar a Kathy y a JP\n  3. Ellos abren el archivo → sus calendarios se actualizan\n\n¿Continuar?"))return;
    // Construir .ics solo con los pendientes
    const lines=[..._icsHeader()];
    pendientes.forEach(q=>{lines.push(..._buildVeventsForDoc(q))});
    lines.push(..._icsFooter());
    const hoyIso=new Date().toISOString().slice(0,10);
    const filename="GB-sync-"+hoyIso+".ics";
    await shareOrDownloadIcs(filename,lines);
    // Marcar como sincronizados
    if(typeof markAsSynced==="function"){
      await markAsSynced(pendientes);
    }
    if(typeof toast==="function")toast("✅ "+pendientes.length+" pedido(s) sincronizados","success");
    renderDashboard();
    if(curMode==="hist"&&typeof renderHist==="function")renderHist();
  }catch(e){
    console.error("syncPendingOnly error",e);
    alert("Error: "+(e.message||e));
  }
}

// ═══════════════════════════════════════════════════════════
// v5.0.2: Info del rango custom activo (banner gris arriba del dashboard)
// ═══════════════════════════════════════════════════════════
function renderCustomRangeInfo(){
  const el=$("dash-custom-range-info");
  if(!el)return;
  if(dashPeriod!=="custom"||!dashCustomFrom||!dashCustomTo){el.classList.add("hidden");el.innerHTML="";return}
  el.classList.remove("hidden");
  el.innerHTML='📆 Rango personalizado activo: <strong>'+dashCustomFrom+'</strong> → <strong>'+dashCustomTo+'</strong> <button onclick="openCustomRangeModal()">Cambiar</button> <button onclick="setDashPeriod(\'month\')">Volver a Mes</button>';
}

// ═══════════════════════════════════════════════════════════
// v4.13.0: Export JSON de todo el historial (backup manual)
// ═══════════════════════════════════════════════════════════
// Descarga un JSON con todo lo que hay en quotesCache + clientsCache.
// Permite al usuario tener respaldo antes de hacer cambios arriesgados
// o simplemente para archivar.
async function exportHistoryJson(){
  try{
    if(!quotesCache.length){try{await loadAllHistory()}catch{}}
    const payload={
      exportedAt:new Date().toISOString(),
      buildVersion:BUILD_VERSION,
      quotes:quotesCache.map(q=>{
        // Quitar campos internos que no aportan (createdAt es serverTimestamp no serializable)
        const {createdAt,..._q}=q;
        return _q;
      }),
      clients:clientsCache,
      stats:{
        totalDocs:quotesCache.length,
        cotizaciones:quotesCache.filter(q=>q.kind==="quote").length,
        propuestas:quotesCache.filter(q=>q.kind==="proposal"&&!q.id?.startsWith("GB-PF-")).length,
        propfinales:quotesCache.filter(q=>q._isPF).length,
        fantasmas:quotesCache.filter(q=>q._wrongCollection).length,
        superseded:quotesCache.filter(q=>q.status==="superseded").length,
        anuladas:quotesCache.filter(q=>q.status==="anulada").length,
        clientes:clientsCache.length
      }
    };
    const json=JSON.stringify(payload,null,2);
    // v5.4.0 (Bloque E): nombre con fecha Y hora para que múltiples backups del mismo
    // día no se sobrescriban. Formato YYYY-MM-DD_HHhMM (ej: 2026-04-22_14h32).
    // Ordena bien alfabéticamente y es legible → fácil identificar cuál es el más reciente.
    const _now=new Date();
    const _p=n=>String(n).padStart(2,"0");
    const stamp=_now.getFullYear()+"-"+_p(_now.getMonth()+1)+"-"+_p(_now.getDate())+"_"+_p(_now.getHours())+"h"+_p(_now.getMinutes());
    const filename="gourmet-bites-backup-"+stamp+".json";
    const blob=new Blob([json],{type:"application/json;charset=utf-8"});
    // Web Share API en móviles, download clásico en desktop
    try{
      const file=new File([blob],filename,{type:"application/json"});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:filename});
        toast("📥 Backup exportado","success");
        return;
      }
    }catch(e){if(e&&e.name==="AbortError")return;console.warn("Share backup falló, download:",e)}
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a)},100);
    toast("📥 Backup descargado ("+Math.round(json.length/1024)+" KB)","success");
  }catch(e){
    toast("Error exportando backup: "+e.message,"error");
    console.error(e);
  }
}

// ═══════════════════════════════════════════════════════════
// v5.4.2: RESTAURAR BACKUP JSON (modo merge)
// ═══════════════════════════════════════════════════════════
// Flujo:
//   1. Usuario toca 📤 Restaurar → abre <input type=file> oculto
//   2. Parse + validación de estructura
//   3. Preview: cuántos docs nuevos se agregarían, cuántos ya existen (skip), cuántos clientes
//   4. Confirmación doble en modal
//   5. Escritura a Firestore: solo docs con ID que NO existen ya (merge aditivo, NO sobrescribe)
//   6. Reload historial + toast resumen
let _restoreBackupData=null; // payload parseado en espera de confirmación

function triggerRestoreBackup(){
  // Crear input oculto
  let input=document.getElementById("__restore-backup-input");
  if(!input){
    input=document.createElement("input");
    input.type="file";
    input.accept=".json,application/json";
    input.id="__restore-backup-input";
    input.style.display="none";
    input.onchange=onRestoreBackupFile;
    document.body.appendChild(input);
  }
  input.value=""; // permite re-elegir mismo archivo
  input.click();
}

async function onRestoreBackupFile(ev){
  const file=ev.target.files&&ev.target.files[0];
  if(!file)return;
  try{
    showLoader("Leyendo backup...");
    const text=await file.text();
    const data=JSON.parse(text);
    hideLoader();
    // Validación básica
    if(!data||typeof data!=="object"){throw new Error("Archivo no es un JSON válido")}
    if(!Array.isArray(data.quotes)){throw new Error("No es un backup de Gourmet Bites (falta campo 'quotes')")}
    // Asegurar cache actual cargado para comparar
    if(!quotesCache.length){try{await loadAllHistory()}catch{}}
    // Calcular preview: qué se agregaría, qué se saltaría
    const idsEnCache=new Set(quotesCache.map(q=>q.id));
    const toAdd=[];
    const toSkip=[];
    data.quotes.forEach(q=>{
      if(!q||!q.id){toSkip.push({_noid:true});return}
      if(idsEnCache.has(q.id))toSkip.push(q);
      else toAdd.push(q);
    });
    const clientsArr=Array.isArray(data.clients)?data.clients:[];
    const idsClientesCache=new Set((clientsCache||[]).map(c=>c.id||c.name));
    const clientesNuevos=clientsArr.filter(c=>{
      const k=c.id||c.name;
      return k&&!idsClientesCache.has(k);
    });
    _restoreBackupData={data,toAdd,toSkip,clientesNuevos,filename:file.name};
    // Mostrar modal de preview
    openRestorePreviewModal();
  }catch(e){
    hideLoader();
    toast("Error leyendo backup: "+e.message,"error");
    console.error("[restore backup]",e);
  }
}

function openRestorePreviewModal(){
  if(!_restoreBackupData)return;
  const {data,toAdd,toSkip,clientesNuevos,filename}=_restoreBackupData;
  const meta=data.exportedAt?("📆 "+data.exportedAt.slice(0,10)+" · "+(data.buildVersion||"?")):"(sin metadata)";
  const totalQuotes=data.quotes.length;
  const html='<div style="font-size:12px;color:#455A64;margin-bottom:10px;line-height:1.5">'+
    '<strong style="font-size:13px;color:#1A1A1A">📂 '+filename.replace(/[<>]/g,"")+'</strong><br>'+
    '<span style="font-size:11px;color:#666">'+meta+'</span>'+
    '</div>'+
    '<div style="background:#E8F5E9;border-left:3px solid #388E3C;padding:10px 12px;border-radius:6px;margin-bottom:10px">'+
      '<div style="font-size:13px;font-weight:700;color:#1B5E20;margin-bottom:4px">✅ Se agregarán '+toAdd.length+' doc'+(toAdd.length!==1?'s':'')+' nuevo'+(toAdd.length!==1?'s':'')+'</div>'+
      '<div style="font-size:11px;color:#2E7D32">Cotizaciones/propuestas cuyo ID no existe actualmente en la nube.</div>'+
    '</div>'+
    '<div style="background:#FFF3E0;border-left:3px solid #FB8C00;padding:10px 12px;border-radius:6px;margin-bottom:10px">'+
      '<div style="font-size:13px;font-weight:700;color:#E65100;margin-bottom:4px">⏭️ Se saltarán '+toSkip.length+' doc'+(toSkip.length!==1?'s':'')+' (ya existen)</div>'+
      '<div style="font-size:11px;color:#BF360C">Modo MERGE: NO sobrescribe lo que ya tienes. Los docs con el mismo ID se quedan como están en la nube (tu dato más fresco gana).</div>'+
    '</div>'+
    (clientesNuevos.length?'<div style="background:#E3F2FD;border-left:3px solid #1976D2;padding:10px 12px;border-radius:6px;margin-bottom:10px">'+
      '<div style="font-size:13px;font-weight:700;color:#0D47A1">👥 '+clientesNuevos.length+' cliente'+(clientesNuevos.length!==1?'s':'')+' nuevo'+(clientesNuevos.length!==1?'s':'')+'</div>'+
    '</div>':'')+
    '<div style="font-size:10.5px;color:#888;margin-top:6px;line-height:1.4">'+
      'Total en archivo: '+totalQuotes+' doc'+(totalQuotes!==1?'s':'')+' · '+clientsArr_len(data)+' cliente'+(clientsArr_len(data)!==1?'s':'')+
    '</div>';
  $("rb-preview").innerHTML=html;
  // Botón confirmar habilitado solo si hay algo que agregar
  const btn=$("rb-confirm");
  if(btn){
    if(toAdd.length===0&&clientesNuevos.length===0){
      btn.disabled=true;
      btn.textContent="Nada que restaurar (todo ya existe)";
      btn.style.opacity="0.5";
      btn.style.cursor="not-allowed";
    }else{
      btn.disabled=false;
      btn.textContent="Restaurar "+toAdd.length+" doc"+(toAdd.length!==1?'s':'')+(clientesNuevos.length?" + "+clientesNuevos.length+" cliente"+(clientesNuevos.length!==1?'s':''):"");
      btn.style.opacity="1";
      btn.style.cursor="pointer";
    }
  }
  $("restore-backup-modal").classList.remove("hidden");
}

function clientsArr_len(data){return Array.isArray(data.clients)?data.clients.length:0}

function closeRestoreBackupModal(){
  $("restore-backup-modal").classList.add("hidden");
  _restoreBackupData=null;
}

async function confirmRestoreBackup(){
  if(!_restoreBackupData){return}
  const {toAdd,clientesNuevos}=_restoreBackupData;
  // Confirmación doble
  if(!confirm("⚠️ CONFIRMACIÓN FINAL\n\nVoy a escribir "+toAdd.length+" doc(s) + "+clientesNuevos.length+" cliente(s) nuevos a la nube.\n\nModo MERGE: NO sobrescribe lo existente.\n\n¿Continuar?")){return}
  if(!currentUser){alert("🔒 Debes estar autenticado");return}
  showLoader("Restaurando... 0/"+toAdd.length);
  let okQuotes=0,errQuotes=0,okClients=0,errClients=0;
  try{
    await fbReady();
    const {db,doc:fsDoc,setDoc,serverTimestamp}=window.fb;
    // Escribir quotes uno a uno (mejor visibilidad de errores que batch)
    for(let i=0;i<toAdd.length;i++){
      const q=toAdd[i];
      try{
        const kind=q.kind||"quote";
        let coll;
        if(kind==="quote")coll="quotes";
        else if(q.id&&q.id.startsWith("GB-PF-"))coll="propfinals";
        else coll="proposals";
        // Limpiar campos internos que no deben viajar
        const {_wrongCollection,_isPF,kind:_k,..._clean}=q;
        _clean.restoredAt=serverTimestamp();
        _clean.restoredBy=(currentUser.displayName||currentUser.email||"desconocido");
        await setDoc(fsDoc(db,coll,q.id),_clean,{merge:false}); // doc nuevo: escritura completa
        okQuotes++;
      }catch(e){
        console.warn("[restore] falló quote "+q.id,e);
        errQuotes++;
      }
      // Actualizar loader cada 5 docs
      if(i%5===0){showLoader("Restaurando... "+(i+1)+"/"+toAdd.length)}
    }
    // Clientes
    for(let i=0;i<clientesNuevos.length;i++){
      const c=clientesNuevos[i];
      try{
        const cid=c.id||c.name;
        if(!cid){errClients++;continue}
        await setDoc(fsDoc(db,"clients",cid),{...c,restoredAt:serverTimestamp()},{merge:false});
        okClients++;
      }catch(e){
        console.warn("[restore] falló cliente",c,e);
        errClients++;
      }
    }
    hideLoader();
    closeRestoreBackupModal();
    let msg="✅ Restaurados: "+okQuotes+" doc(s)";
    if(okClients)msg+=" + "+okClients+" cliente(s)";
    if(errQuotes||errClients)msg+=" · ⚠️ Errores: "+(errQuotes+errClients);
    toast(msg,errQuotes||errClients?"warn":"success");
    // Reload historial
    try{await loadAllHistory();renderDashboard()}catch{}
  }catch(e){
    hideLoader();
    toast("Error restaurando: "+e.message,"error");
    console.error("[restore]",e);
  }
}

// ═══════════════════════════════════════════════════════════
// v5.0: MIGRACIÓN one-shot de fotos base64 → Storage
// ═══════════════════════════════════════════════════════════
// Uso: abrir consola (F12) y ejecutar migrarFotosStorage()
// Recorre pagos, entregaData y comentarioCliente de todos los docs.
// Si tienen base64 inline, los sube a Storage y reemplaza por URL.
// Los docs nuevos (desde v5.0) ya nacen con URL, no requieren migración.
async function migrarFotosStorage(){
  if(!currentUser){alert("🔒 Debes estar autenticado para migrar fotos a Storage.");return}
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}

  // Detectar todos los docs con fotos base64
  const tareas=[];
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return; // saltamos fantasmas
    // Pagos
    (q.pagos||[]).forEach((p,idx)=>{
      if(p.foto&&typeof p.foto==="string"&&p.foto.startsWith("data:")){
        tareas.push({docId:q.id,kind:q.kind,tipo:"pago",idx,base64:p.foto,path:"pagos"});
      }
    });
    // Entrega
    if(q.entregaData?.fotoBase64&&q.entregaData.fotoBase64.startsWith("data:")){
      tareas.push({docId:q.id,kind:q.kind,tipo:"entrega",base64:q.entregaData.fotoBase64,path:"entregas"});
    }
    // Comentario
    if(q.comentarioCliente?.fotoBase64&&q.comentarioCliente.fotoBase64.startsWith("data:")){
      tareas.push({docId:q.id,kind:q.kind,tipo:"comentario",base64:q.comentarioCliente.fotoBase64,path:"comentarios"});
    }
  });
  if(!tareas.length){alert("🎉 No hay fotos base64 para migrar. Todo ya está en Storage.");return}
  if(!confirm("🔄 Migrar "+tareas.length+" fotos a Firebase Storage\n\nVoy a subir cada foto a Storage y reemplazar el base64 en Firestore por la URL de descarga.\n\n• Los docs quedarán mucho más livianos (dashboard cargará más rápido)\n• Operación segura: si falla una foto, se salta y continúa\n• Tiempo estimado: ~1 segundo por foto\n\n¿Continuar?"))return;

  showLoader("Migrando fotos a Storage · 0/"+tareas.length);
  const {db,doc,getDoc,updateDoc,serverTimestamp}=window.fb;
  let ok=0,skip=0,err=0;
  for(let i=0;i<tareas.length;i++){
    const t=tareas[i];
    $("loader-msg").textContent="Migrando fotos · "+(i+1)+"/"+tareas.length+" ("+t.tipo+")";
    try{
      // Subir foto a Storage
      const {url}=await uploadFotoFromBase64(t.base64,t.tipo,t.docId,t.path);
      // Recargar doc desde Firestore para tener data fresca
      const coll=t.kind==="quote"?"quotes":(t.docId.startsWith("GB-PF-")?"propfinals":"proposals");
      const snap=await getDoc(doc(db,coll,t.docId));
      if(!snap.exists()){skip++;continue}
      const d=snap.data();
      const patch={updatedAt:serverTimestamp(),...auditStamp()};
      if(t.tipo==="pago"){
        const pagos=(d.pagos||[]).map(p=>({...p}));
        if(pagos[t.idx]){
          pagos[t.idx].fotoUrl=url;
          delete pagos[t.idx].foto;
          patch.pagos=pagos;
        }
      }else if(t.tipo==="entrega"){
        patch.entregaData={...(d.entregaData||{}),fotoUrl:url};
        delete patch.entregaData.fotoBase64;
      }else if(t.tipo==="comentario"){
        patch.comentarioCliente={...(d.comentarioCliente||{}),fotoUrl:url};
        delete patch.comentarioCliente.fotoBase64;
      }
      await updateDoc(doc(db,coll,t.docId),patch);
      ok++;
    }catch(e){
      console.warn("Migración "+t.tipo+" de "+t.docId+" falló:",e);
      err++;
    }
  }
  hideLoader();
  // Recargar historial para ver cambios
  try{await loadAllHistory()}catch{}
  alert("✅ Migración completa\n\n• Migradas OK: "+ok+"\n• Saltadas: "+skip+"\n• Errores: "+err+"\n\nLos docs migrados ya tienen fotoUrl en lugar de base64. Recomendado: cerrar y abrir la app para ver el dashboard más ligero.");
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════
// v5.2.3: NORMALIZAR DOCS SIN `status` (legacy pre-v5.0.3)
// ═══════════════════════════════════════════════════════════
// Los docs creados antes de v5.0.3 no tenían campo `status`. Quedaban invisibles
// al Pipeline/Historial/Seguimiento aunque sí aparecían en el dashboard "Cotizado".
// Esta función los detecta y les asigna `status: "enviada"` (o "propfinal" para PFs).
// Idempotente: si no hay docs sin status, informa y sale.
async function normalizarDocsSinStatus(){
  if(!currentUser){alert("🔒 Debes estar autenticado para normalizar docs.");return}
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}

  // Detectar docs sin status (undefined, null o string vacío)
  const candidatos=quotesCache.filter(q=>!q.status&&!q._wrongCollection);
  if(!candidatos.length){
    alert("🎉 No hay docs pendientes de normalizar. Todos tienen status correcto.");
    return;
  }

  // Preview para Luis: mostrar qué docs se van a tocar y qué status va a recibir cada uno
  const preview=candidatos.map(q=>{
    const nuevoStatus=(q.kind==="proposal"&&q.id&&q.id.startsWith("GB-PF-"))?"propfinal":"enviada";
    return "• "+(q.quoteNumber||q.id)+" — "+(q.client||"sin cliente")+" → "+nuevoStatus;
  }).join("\n");

  if(!confirm("🔧 Normalizar "+candidatos.length+" doc"+(candidatos.length!==1?"s":"")+" sin status\n\nSe les va a asignar el status que les corresponde por tipo:\n\n"+preview+"\n\n• No se tocan los datos, solo se agrega el campo `status`\n• Operación segura: cada doc en su propia escritura\n• Después podrás etiquetarlos Viva/Perdida normalmente\n\n¿Continuar?"))return;

  showLoader("Normalizando docs · 0/"+candidatos.length);
  const {db,doc,updateDoc,serverTimestamp}=window.fb;
  let ok=0,err=0;
  for(let i=0;i<candidatos.length;i++){
    const q=candidatos[i];
    $("loader-msg").textContent="Normalizando · "+(i+1)+"/"+candidatos.length;
    try{
      const nuevoStatus=(q.kind==="proposal"&&q.id&&q.id.startsWith("GB-PF-"))?"propfinal":"enviada";
      let coll;
      if(q.kind==="quote")coll="quotes";
      else if(q.id&&q.id.startsWith("GB-PF-"))coll="propfinals";
      else coll="proposals";
      const patch={status:nuevoStatus,updatedAt:serverTimestamp()};
      if(typeof auditStamp==="function")Object.assign(patch,auditStamp());
      await updateDoc(doc(db,coll,q.id),patch);
      // Reflejar en cache
      q.status=nuevoStatus;
      ok++;
    }catch(e){
      console.error("Error normalizando "+q.id,e);
      err++;
    }
  }
  hideLoader();
  try{await loadAllHistory()}catch{}
  alert("✅ Normalización completa\n\n• Normalizados OK: "+ok+"\n• Errores: "+err+"\n\nLos docs ahora aparecerán correctamente en Pipeline, Historial Vivas y Seguimiento. Puedes etiquetarlos Viva/Perdida normalmente.");
  renderDashboard();
  if(typeof renderSeguimiento==="function"&&curMode==="seg")renderSeguimiento();
  if(typeof renderHist==="function"&&curMode==="hist")renderHist();
}

// ═══════════════════════════════════════════════════════════
// v5.3.0: OPERACIÓN URGENTE · PRÓXIMOS 3 DÍAS (lado a lado)
// ═══════════════════════════════════════════════════════════
// Renderiza 2 tarjetas SIEMPRE VISIBLES en el dashboard, partiendo la
// pantalla por la mitad:
//   🔥 Por producir  — pedidos/aprobadas con fechaEntrega/eventDate en
//                       los próximos 3 días que aún NO están en producción
//   📦 Por entregar  — pedidos en_produccion con fechaEntrega/eventDate
//                       en los próximos 3 días
// Cada item es tappable → abre el doc. Ordenados por fecha más cercana.
// Muestra "HOY", "MAÑANA", "PASADO" para las 3 fechas más urgentes.
function renderUrgent3d(){
  const prodBody=$("dash-urgent-prod-body");
  const entBody=$("dash-urgent-ent-body");
  const prodCount=$("dash-urgent-prod-count");
  const entCount=$("dash-urgent-ent-count");
  if(!prodBody||!entBody)return;

  const todayIso=new Date().toISOString().slice(0,10);
  const t3=new Date();t3.setDate(t3.getDate()+3);
  const t3Iso=t3.toISOString().slice(0,10);

  const porProducir=[],porEntregar=[];
  (quotesCache||[]).forEach(q=>{
    if(q._wrongCollection)return;
    const s=q.status||"enviada";
    if(["anulada","superseded","convertida","entregado"].includes(s))return;
    const fecha=q.eventDate||q.fechaEntrega;
    if(!fecha)return;
    if(fecha<todayIso||fecha>t3Iso)return; // fuera de ventana 3 días
    // Por producir: pedido/aprobada (aún no empezó producción)
    if(["pedido","aprobada"].includes(s))porProducir.push(q);
    // Por entregar: en_produccion (cocina en marcha)
    else if(s==="en_produccion")porEntregar.push(q);
  });

  // Ordenar por fecha ascendente (más cercano primero)
  const sortFn=(a,b)=>(a.eventDate||a.fechaEntrega||"").localeCompare(b.eventDate||b.fechaEntrega||"");
  porProducir.sort(sortFn);
  porEntregar.sort(sortFn);

  if(prodCount)prodCount.textContent=porProducir.length;
  if(entCount)entCount.textContent=porEntregar.length;

  prodBody.innerHTML=porProducir.length?porProducir.map(urgentItemHtml).join(""):
    '<div class="urgent-empty">Sin pedidos por producir<br>en los próximos 3 días</div>';
  entBody.innerHTML=porEntregar.length?porEntregar.map(urgentItemHtml).join(""):
    '<div class="urgent-empty">Sin entregas<br>en los próximos 3 días</div>';
}

// Helper: HTML de un item dentro de las tarjetas urgentes
// v5.4.1 (Bloque D): agrega chip 🔪 Producido inline para no tener que
// abrir el doc solo para marcarlo. Solo se muestra si !q.produced.
// toggleProduced ya existe en app-historial.js:989 y llama a
// renderDashboard() al terminar, así que el refresh es automático.
function urgentItemHtml(q){
  const fecha=q.eventDate||q.fechaEntrega;
  const today=new Date().toISOString().slice(0,10);
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowIso=tomorrow.toISOString().slice(0,10);
  const pasado=new Date();pasado.setDate(pasado.getDate()+2);
  const pasadoIso=pasado.toISOString().slice(0,10);
  let fechaLabel=fecha;
  let fechaCls="";
  if(fecha===today){fechaLabel="HOY "+fecha;fechaCls="urgent-d-today"}
  else if(fecha===tomorrowIso){fechaLabel="MAÑANA "+fecha;fechaCls="urgent-d-tomorrow"}
  else if(fecha===pasadoIso){fechaLabel="PASADO "+fecha}
  const hora=q.horaEntrega?' · ⏰ '+q.horaEntrega:'';
  const cli=(q.client||"—").replace(/[<>]/g,"");
  const total=fm(getDocTotal(q));
  // Chip "Producido" solo si aún no está producido. stopPropagation en el
  // onclick del chip para que NO dispare el loadQuote del contenedor.
  const prodChip=q.produced?
    '<span class="urgent-prod-done" title="Producido '+(q.producedAt||"").slice(0,10)+'">🔪 Producido</span>':
    '<button class="urgent-prod-chip" onclick="event.stopPropagation();toggleProduced(\''+q.id+'\',\''+q.kind+'\',event)">🔪 Producido</button>';
  return '<div class="urgent-item" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
    '<div class="urgent-item-top">'+
      '<div class="urgent-item-txt">'+
        '<div class="urgent-cli">'+cli+'</div>'+
        '<div class="urgent-meta"><span class="'+fechaCls+'">'+fechaLabel+'</span>'+hora+'</div>'+
        '<div class="urgent-val">'+total+'</div>'+
      '</div>'+
      '<div class="urgent-item-act">'+prodChip+'</div>'+
    '</div>'+
  '</div>';
}

// ═══════════════════════════════════════════════════════════
// v5.3.0: PROGRESSIVE DISCLOSURE · secciones colapsables
// ═══════════════════════════════════════════════════════════
// Toggle + estado persistido en localStorage. Si falla la lectura,
// cae a "todo colapsado" (defensivo).
const DASH_COLL_KEY="gb_dash_coll_v530";

function getDashCollState(){
  try{
    const raw=localStorage.getItem(DASH_COLL_KEY);
    if(!raw)return {};
    const parsed=JSON.parse(raw);
    return (parsed&&typeof parsed==="object")?parsed:{};
  }catch(e){
    console.warn("[Dashboard] no pude leer estado collapsed:",e);
    return {};
  }
}
function saveDashCollState(st){
  try{localStorage.setItem(DASH_COLL_KEY,JSON.stringify(st||{}))}
  catch(e){console.warn("[Dashboard] no pude guardar estado collapsed:",e)}
}
function applyDashCollapsedState(){
  const st=getDashCollState();
  document.querySelectorAll(".dash-collapsible").forEach(el=>{
    const key=el.dataset.key;
    if(!key)return;
    const body=$("body-"+key);
    const chev=$("chev-"+key);
    const isOpen=!!st[key];
    el.classList.toggle("open",isOpen);
    if(body)body.classList.toggle("hidden",!isOpen);
    if(chev)chev.textContent=isOpen?"▾":"▸";
  });
}
function toggleDashSection(key){
  if(!key)return;
  const wrap=document.querySelector('.dash-collapsible[data-key="'+key+'"]');
  const body=$("body-"+key);
  const chev=$("chev-"+key);
  if(!wrap||!body)return;
  const willOpen=body.classList.contains("hidden");
  wrap.classList.toggle("open",willOpen);
  body.classList.toggle("hidden",!willOpen);
  if(chev)chev.textContent=willOpen?"▾":"▸";
  const st=getDashCollState();
  st[key]=willOpen;
  saveDashCollState(st);
}

// ═══════════════════════════════════════════════════════════
// BOOTSTRAP — corre cuando todos los scripts están cargados
// ═══════════════════════════════════════════════════════════
// Inyectar logo en header
(function injectLogo(){
  const el=$("hdr-logo");
  if(el&&typeof LOGO_IW!=="undefined")el.src=LOGO_IW;
})();

// Inicializar UI: catálogo + version markers
renderCats();
["hdr-ver","pin-ver"].forEach(id=>{const el=$(id);if(el)el.textContent=BUILD_VERSION});
["hdr-date","pin-date"].forEach(id=>{const el=$(id);if(el)el.textContent=BUILD_DATE});

// v5.0: Firebase Auth reemplaza al PIN. initAuthObserver mira onAuthStateChanged:
// - Si hay user: esconde overlay + initApp
// - Si no: muestra overlay con form de login
window.addEventListener("load",()=>setTimeout(initAuthObserver,50));
// Limpieza one-shot de flags viejos (PIN de v4.x)
try{sessionStorage.removeItem("gb_unlocked");localStorage.removeItem("gb_unlocked")}catch{}

// v4.13.0: detectar cambios de conectividad (navigator.online) para actualizar el badge
// La persistencia IndexedDB sigue funcionando offline; esto es solo para UI.
window.addEventListener("online",()=>{
  if(typeof setCloudStatus==="function")setCloudStatus(true);
  if(typeof toast==="function")toast("📶 Conexión restaurada · sincronizando...","success");
});
window.addEventListener("offline",()=>{
  const el=$("cloud-ind");
  if(el){el.className="cloud-ind offline-cache";el.textContent="📴 Offline (caché local)"}
  if(typeof toast==="function")toast("📴 Sin conexión · trabajando con caché local","warn");
});

// ═══════════════════════════════════════════════════════════
// v5.0.4: PIPELINE ACTIVO (lo vivo hoy, sin filtro de período)
// 3 cards clickeables:
//   🧾 En cotización · 🤝 Pedidos confirmados · 🎉 Entregados con saldo
// ═══════════════════════════════════════════════════════════
function renderPipelineActivo(){
  const grid=$("pipeline-grid");
  if(!grid)return;
  if(typeof getPipelineActivo!=="function"){grid.innerHTML='<div style="color:#999;font-size:11px">Pipeline no disponible</div>';return}
  const p=getPipelineActivo();
  grid.innerHTML=
    '<div class="pipe-card pc-cot" onclick="openPipelineDetail(\'en_cotizacion\')">'+
      '<div class="pipe-card-lab">🧾 En cotización</div>'+
      '<div class="pipe-card-val">'+fm(p.en_cotizacion.total)+'</div>'+
      '<div class="pipe-card-sub">🟢 '+p.en_cotizacion.count+' viva'+(p.en_cotizacion.count!==1?'s':'')+'</div>'+
    '</div>'+
    '<div class="pipe-card pc-ped" onclick="openPipelineDetail(\'pedidos_confirmados\')">'+
      '<div class="pipe-card-lab">🤝 Pedidos confirmados</div>'+
      '<div class="pipe-card-val">'+fm(p.pedidos_confirmados.total)+'</div>'+
      '<div class="pipe-card-sub">'+p.pedidos_confirmados.count+' por entregar</div>'+
    '</div>'+
    '<div class="pipe-card pc-ent" onclick="openPipelineDetail(\'entregados_con_saldo\')">'+
      '<div class="pipe-card-lab">🎉 Entregados con saldo</div>'+
      '<div class="pipe-card-val">'+fm(p.entregados_con_saldo.total)+'</div>'+
      '<div class="pipe-card-sub">'+p.entregados_con_saldo.count+' por cobrar</div>'+
    '</div>';
}

// Drill-down de los buckets del Pipeline Activo (click en una pipe-card)
function openPipelineDetail(bucket){
  if(typeof getPipelineActivo!=="function")return;
  const p=getPipelineActivo();
  const b=p[bucket];
  if(!b)return;
  const titulos={
    en_cotizacion:"🧾 Documentos en cotización (vivos)",
    pedidos_confirmados:"🤝 Pedidos confirmados (por entregar)",
    entregados_con_saldo:"🎉 Entregados con saldo por cobrar"
  };
  const title=titulos[bucket]||"Pipeline";
  if(!b.docs.length){
    alert(title+"\n\nNo hay documentos en este momento.");
    return;
  }
  // Reutilizamos el modal de drill-down del dashboard existente
  const docs=[...b.docs].sort((a,b2)=>(b2.dateISO||"").localeCompare(a.dateISO||""));
  const useSaldo=(bucket==="entregados_con_saldo");
  let rows=docs.map(q=>{
    const monto=useSaldo?(typeof saldoPendiente==="function"?saldoPendiente(q):0):(q.total||0);
    const fecha=q.eventDate||q.dateISO||"—";
    const sMeta=STATUS_META[q.status||"enviada"]||STATUS_META.enviada;
    const tag=q.kind==="quote"?'<span class="ui-tag prod">Cotización</span>':'<span class="ui-tag ent">Propuesta</span>';
    // v5.0.5: badge VIVA/PERDIDA en estado (solo para followables)
    let ecBadge="";
    if(typeof estadoComercial==="function"){
      const ec=estadoComercial(q);
      if(ec&&typeof ESTADO_COMERCIAL_META!=="undefined"&&ESTADO_COMERCIAL_META[ec]){
        const m=ESTADO_COMERCIAL_META[ec];
        ecBadge=' <span class="hc-estado-badge '+m.cls+'">'+m.emoji+' '+m.label+'</span>';
      }
    }
    return '<tr onclick="closeDashDetail();setTimeout(function(){loadQuote(\''+q.kind+'\',\''+q.id+'\')},80)" style="cursor:pointer">'+
      '<td style="font-size:10px;color:#555">'+(q.quoteNumber||q.id)+'</td>'+
      '<td>'+tag+'</td>'+
      '<td>'+(q.client||"—")+'</td>'+
      '<td style="font-size:10px">'+fecha+'</td>'+
      '<td><span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span>'+ecBadge+'</td>'+
      '<td style="text-align:right;font-weight:700">'+fm(monto)+'</td>'+
      '</tr>';
  }).join("");
  const headCell='font-size:10px;text-transform:uppercase;color:#666;padding:6px 8px;border-bottom:1.5px solid #ddd';
  const html='<div style="padding:4px 0 10px"><h3 style="margin:0 0 4px;color:var(--gd);font-family:\'Cormorant Garamond\',serif">'+title+'</h3>'+
    '<div style="font-size:12px;color:#777">'+b.count+' documento'+(b.count!==1?'s':'')+' · Total: <strong>'+fm(b.total)+'</strong></div></div>'+
    '<div style="max-height:60vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'+
      '<th style="'+headCell+';text-align:left">Número</th>'+
      '<th style="'+headCell+';text-align:left">Tipo</th>'+
      '<th style="'+headCell+';text-align:left">Cliente</th>'+
      '<th style="'+headCell+';text-align:left">Fecha</th>'+
      '<th style="'+headCell+';text-align:left">Estado</th>'+
      '<th style="'+headCell+';text-align:right">'+(useSaldo?"Saldo":"Total")+'</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table></div>';
  const body=$("dash-detail-body");
  if(body){body.innerHTML=html;$("dash-detail-modal").classList.remove("hidden")}
}

// ═══════════════════════════════════════════════════════════
// v5.0.4: BANNER DE SEGUIMIENTO COMERCIAL PENDIENTE
// Rojo claro. Aparece si hay cotizaciones/propuestas vivas con
// followUp in [pendiente, contactado] y daysSinceUpdate > 7.
// Tap → cambia a pestaña Seguimiento.
// ═══════════════════════════════════════════════════════════
function renderBannerFollowUp(){
  const el=$("dash-banner-follow");
  if(!el)return;
  if(typeof isFollowable!=="function"||typeof getFollowUp!=="function"||typeof daysSinceUpdate!=="function"){
    el.classList.add("hidden");el.innerHTML="";return;
  }
  const urgentes=quotesCache.filter(q=>{
    if(!isFollowable(q))return false;
    const fu=getFollowUp(q);
    if(fu!=="pendiente"&&fu!=="contactado")return false;
    return daysSinceUpdate(q)>=7;
  });
  if(!urgentes.length){el.classList.add("hidden");el.innerHTML="";return}
  urgentes.sort((a,b)=>daysSinceUpdate(b)-daysSinceUpdate(a));
  const primeros=urgentes.slice(0,3).map(q=>(q.client||"—")+" ("+daysSinceUpdate(q)+"d)").join(" · ");
  const mas=urgentes.length>3?" · +"+(urgentes.length-3)+" más":"";
  el.classList.remove("hidden");
  el.innerHTML='<div class="dbf-ic">📞</div>'+
    '<div class="dbf-txt"><strong>'+urgentes.length+' cotizacion'+(urgentes.length!==1?'es':'')+' sin seguimiento hace más de 7 días</strong><br><span style="font-size:11px;opacity:.85">'+primeros+mas+'</span></div>'+
    '<button onclick="setMode(\'seg\')">Ver seguimiento</button>';
}

// ═══════════════════════════════════════════════════════════
// v5.2.0 · NUEVAS FEATURES
// ═══════════════════════════════════════════════════════════

// ─── R1: REPORTE DE CONVERSIÓN (embudo) ───────────────────
// Muestra cuántas cotizaciones del período llegaron a pedido / entregado / perdida.
// El denominador son las cotizaciones CREADAS en el período (fCre ∈ rango).
function renderReporteConversion(range,inRange){
  const el=$("dash-reporte-conversion");
  if(!el)return;
  if(!quotesCache.length){el.innerHTML='<div class="conv-empty">Sin datos todavía.</div>';return}
  // Universo: docs creados en el período (excluyendo fantasmas/superseded/anuladas/convertidas).
  // convertidas se excluyen porque son referencias a PFs (no cotizaciones independientes).
  let tot=0,totMonto=0;
  let ped=0,pedMonto=0;      // cualquier estado "vendido" (pedido/aprobada/en_produccion/entregado)
  let ent=0,entMonto=0;      // solo entregado
  let perd=0,perdMonto=0;    // followUp=perdida (enviada/propfinal)
  let pend=0,pendMonto=0;    // todavía viva sin cerrar
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    const s=q.status||"enviada";
    if(s==="superseded"||s==="anulada"||s==="convertida")return;
    const fCre=dateOfCreation(q);
    if(!inRange(fCre))return;
    const total=getDocTotal(q);
    const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
    tot++;totMonto+=total;
    if(fu==="perdida"&&(s==="enviada"||s==="propfinal")){perd++;perdMonto+=total;return}
    if(["pedido","aprobada","en_produccion","entregado"].includes(s)){ped++;pedMonto+=total}
    if(s==="entregado"){ent++;entMonto+=total}
    if((s==="enviada"||s==="propfinal")&&fu!=="perdida"){pend++;pendMonto+=total}
  });
  if(!tot){
    el.innerHTML='<div class="conv-empty">No hay cotizaciones creadas en este período.</div>';
    return;
  }
  const pct=(n)=>tot>0?Math.round(n*100/tot):0;
  const tasa=tot>0?Math.round(ped*100/tot):0;
  el.innerHTML='<div class="conv-embudo">'+
    '<div class="conv-row cotizadas">'+
      '<div class="cr-label">🧾 Cotizadas en el período</div>'+
      '<div class="cr-values"><span class="cr-count">'+tot+'</span><span class="cr-amount">('+fm(totMonto)+')</span></div>'+
    '</div>'+
    '<div class="conv-row pedidos">'+
      '<div class="cr-label">🤝 Se convirtieron en pedido</div>'+
      '<div class="cr-values"><span class="cr-count">'+ped+'</span><span class="cr-pct">'+pct(ped)+'%</span><span class="cr-amount">('+fm(pedMonto)+')</span></div>'+
    '</div>'+
    '<div class="conv-row entregadas">'+
      '<div class="cr-label">🎉 Ya fueron entregadas</div>'+
      '<div class="cr-values"><span class="cr-count">'+ent+'</span><span class="cr-pct">'+pct(ent)+'%</span><span class="cr-amount">('+fm(entMonto)+')</span></div>'+
    '</div>'+
    '<div class="conv-row perdidas">'+
      '<div class="cr-label">❌ Se perdieron</div>'+
      '<div class="cr-values"><span class="cr-count">'+perd+'</span><span class="cr-pct">'+pct(perd)+'%</span><span class="cr-amount">('+fm(perdMonto)+')</span></div>'+
    '</div>'+
    (pend>0?'<div class="conv-row" style="border-left-color:#FB8C00">'+
      '<div class="cr-label">⏳ Aún vivas (sin cerrar)</div>'+
      '<div class="cr-values"><span class="cr-count">'+pend+'</span><span class="cr-pct">'+pct(pend)+'%</span><span class="cr-amount">('+fm(pendMonto)+')</span></div>'+
    '</div>':'')+
  '</div>'+
  '<div class="conv-embudo-resumen">Tasa de conversión: <strong>'+tasa+'%</strong> · '+ped+' de '+tot+' cotizaciones llegaron a pedido</div>';
}

// ─── R3: REPORTE DE PÉRDIDAS POR MOTIVO ───────────────────
// Muestra distribución de motivos de pérdida en el período.
// Incluye docs con followUp=perdida cuyo perdidaData.fecha está en el rango,
// o su dateISO si no hay perdidaData.fecha.
function renderReportePerdidas(range,inRange){
  const el=$("dash-reporte-perdidas");
  if(!el)return;
  if(!quotesCache.length){el.innerHTML='<div class="conv-empty">Sin datos todavía.</div>';return}
  const motivosOrden=["precio","competencia","no_respondio","cambio_planes","tiempo","otro","sin_motivo"];
  const motivosLabel={
    precio:"Precio",
    competencia:"Competencia",
    no_respondio:"No respondió",
    cambio_planes:"Cambio de planes",
    tiempo:"Tiempo",
    otro:"Otro",
    sin_motivo:"Sin motivo registrado"
  };
  const cnt={};const monto={};
  motivosOrden.forEach(k=>{cnt[k]=0;monto[k]=0});
  let total=0,totalMonto=0;
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    if(typeof getFollowUp!=="function"||getFollowUp(q)!=="perdida")return;
    const s=q.status||"enviada";
    if(s!=="enviada"&&s!=="propfinal")return;
    const fechaRef=q.perdidaData?.fecha||q.dateISO||dateOfCreation(q);
    if(!inRange(fechaRef?.slice(0,10)))return;
    const motivo=q.perdidaData?.motivo||"sin_motivo";
    const key=motivosOrden.includes(motivo)?motivo:"sin_motivo";
    cnt[key]++;
    monto[key]+=getDocTotal(q);
    total++;
    totalMonto+=getDocTotal(q);
  });
  if(!total){
    el.innerHTML='<div class="conv-empty">🎉 Ninguna pérdida registrada en el período. Buena noticia.</div>';
    return;
  }
  const maxCnt=Math.max(...Object.values(cnt),1);
  const filas=motivosOrden.filter(k=>cnt[k]>0).map(k=>{
    const pctBar=Math.round(cnt[k]*100/maxCnt);
    const pctTot=Math.round(cnt[k]*100/total);
    return '<div class="perd-row">'+
      '<div class="pr-label">'+motivosLabel[k]+'</div>'+
      '<div class="pr-bar"><div class="pr-bar-fill" style="width:'+pctBar+'%"></div></div>'+
      '<div class="pr-count">'+cnt[k]+' · '+pctTot+'%</div>'+
    '</div>';
  }).join("");
  el.innerHTML='<div class="perd-motivos">'+filas+'</div>'+
    '<div class="perd-resumen">Total perdido en el período: <strong>'+fm(totalMonto)+'</strong> · '+total+' cotizacion'+(total!==1?'es':'')+'</div>';
}

// ─── R4: VISTA POR CLIENTE ────────────────────────────────
// Filtro en el dashboard que al escoger un cliente muestra todos sus docs
// con KPIs: total cotizado, vendido, entregado, pendiente de cobro, perdidas.
let _clienteFiltroActivo="";   // cliente seleccionado (string exacto)
let _clienteFiltroInput="";    // lo que está tipeando (para sugerencias)

function _normTxtDash(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}

function onClienteFilterInput(ev){
  const v=ev.target.value;
  _clienteFiltroInput=v;
  const clearBtn=$("dash-cliente-clear");
  if(clearBtn)clearBtn.style.display=v?"flex":"none";
  if(!v.trim()){
    _clienteFiltroActivo="";
    $("dash-cliente-suggestions").classList.add("hidden");
    renderClienteView();
    return;
  }
  // Buscar clientes que matcheen
  const norm=_normTxtDash(v);
  const clientesSet=new Set();
  const clientesCount={};
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    if(!q.client)return;
    const nc=_normTxtDash(q.client);
    if(nc.includes(norm)){
      clientesSet.add(q.client);
      clientesCount[q.client]=(clientesCount[q.client]||0)+1;
    }
  });
  const clientes=[...clientesSet].sort((a,b)=>(clientesCount[b]||0)-(clientesCount[a]||0)).slice(0,8);
  const sug=$("dash-cliente-suggestions");
  if(!clientes.length){
    sug.classList.add("hidden");
  }else{
    sug.classList.remove("hidden");
    sug.innerHTML=clientes.map(c=>{
      return '<div class="cs-item" onclick="selectClienteFilter('+JSON.stringify(c).replace(/"/g,"&quot;")+')">'+
        '<span>'+c.replace(/[<>]/g,"")+'</span>'+
        '<span class="cs-count">'+clientesCount[c]+' doc</span>'+
      '</div>';
    }).join("");
  }
}

function selectClienteFilter(clienteName){
  _clienteFiltroActivo=clienteName;
  $("dash-cliente-input").value=clienteName;
  $("dash-cliente-suggestions").classList.add("hidden");
  $("dash-cliente-clear").style.display="flex";
  renderClienteView();
}

function clearClienteFilter(){
  _clienteFiltroActivo="";
  _clienteFiltroInput="";
  const inp=$("dash-cliente-input");if(inp)inp.value="";
  const sug=$("dash-cliente-suggestions");if(sug)sug.classList.add("hidden");
  const clr=$("dash-cliente-clear");if(clr)clr.style.display="none";
  renderClienteView();
}

function renderClienteView(){
  const el=$("dash-cliente-resultado");
  if(!el)return;
  if(!_clienteFiltroActivo){el.innerHTML="";return}
  const cli=_clienteFiltroActivo;
  const docs=quotesCache.filter(q=>!q._wrongCollection&&q.client===cli);
  if(!docs.length){
    el.innerHTML='<div class="cli-view"><div class="cli-view-title">⚠️ Sin datos para "'+cli.replace(/[<>]/g,"")+'"</div></div>';
    return;
  }
  // Calcular métricas
  let totCot=0,totVen=0,totEnt=0,totPend=0,totPerd=0;
  let cntCot=0,cntVen=0,cntEnt=0,cntPerd=0;
  docs.forEach(q=>{
    const s=q.status||"enviada";
    if(s==="superseded"||s==="convertida")return;
    const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
    const total=getDocTotal(q);
    if(s==="anulada")return;
    if(fu==="perdida"&&(s==="enviada"||s==="propfinal")){totPerd+=total;cntPerd++;return}
    totCot+=total;cntCot++;
    if(["pedido","aprobada","en_produccion","entregado"].includes(s)){totVen+=total;cntVen++}
    if(s==="entregado"){totEnt+=total;cntEnt++}
    if(["pedido","aprobada","en_produccion","entregado"].includes(s)){
      const sp=saldoPendiente(q);if(sp>0)totPend+=sp;
    }
  });
  // Lista de docs (ordenada por fecha desc)
  const docsSorted=[...docs].sort((a,b)=>(b.dateISO||"").localeCompare(a.dateISO||""));
  const statusColor={
    enviada:"#90A4AE",propfinal:"#5C6BC0",pedido:"#43A047",aprobada:"#43A047",
    en_produccion:"#689F38",entregado:"#2E7D32",anulada:"#EF5350",convertida:"#9E9E9E",superseded:"#BDBDBD"
  };
  const listHtml=docsSorted.slice(0,20).map(q=>{
    const s=q.status||"enviada";
    const fu=typeof getFollowUp==="function"?getFollowUp(q):"pendiente";
    const statusLabel=fu==="perdida"&&(s==="enviada"||s==="propfinal")?"perdida":s;
    const bg=fu==="perdida"?"#C62828":(statusColor[s]||"#90A4AE");
    const num=q.quoteNumber||q.id;
    const total=getDocTotal(q);
    return '<div class="cli-view-doc" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
      '<span class="cvd-num">'+num+'</span>'+
      '<span class="cvd-status" style="background:'+bg+'22;color:'+bg+';border:1px solid '+bg+'55">'+statusLabel+'</span>'+
      '<span class="cvd-total">'+fm(total)+'</span>'+
    '</div>';
  }).join("");
  const masLabel=docsSorted.length>20?'<div class="dash-met-empty" style="padding:6px;font-size:10.5px">+'+(docsSorted.length-20)+' documentos más</div>':'';
  el.innerHTML='<div class="cli-view">'+
    '<div class="cli-view-title">👤 '+cli.replace(/[<>]/g,"")+'</div>'+
    '<div class="cli-view-metrics">'+
      '<div class="cli-view-met"><div class="cvm-lab">Cotizado</div><div class="cvm-val">'+fm(totCot)+'</div><div class="cvm-sub">'+cntCot+' doc</div></div>'+
      '<div class="cli-view-met"><div class="cvm-lab">Vendido</div><div class="cvm-val">'+fm(totVen)+'</div><div class="cvm-sub">'+cntVen+' pedido'+(cntVen!==1?'s':'')+'</div></div>'+
      '<div class="cli-view-met"><div class="cvm-lab">Entregado</div><div class="cvm-val">'+fm(totEnt)+'</div><div class="cvm-sub">'+cntEnt+' entrega'+(cntEnt!==1?'s':'')+'</div></div>'+
      '<div class="cli-view-met"><div class="cvm-lab" style="color:#E65100">Por cobrar</div><div class="cvm-val" style="color:#E65100">'+fm(totPend)+'</div><div class="cvm-sub">saldo</div></div>'+
      (cntPerd>0?'<div class="cli-view-met"><div class="cvm-lab" style="color:#C62828">Perdido</div><div class="cvm-val" style="color:#C62828">'+fm(totPerd)+'</div><div class="cvm-sub">'+cntPerd+' doc</div></div>':'')+
    '</div>'+
    '<div class="cli-view-docs">'+listHtml+masLabel+'</div>'+
  '</div>';
}

// ─── Mantenimiento colapsable ─────────────────────────────
let _mantOpen=false;
function toggleMantenimiento(){
  _mantOpen=!_mantOpen;
  const body=$("dash-mant-body");
  const chev=$("mant-chevron");
  if(body)body.classList.toggle("hidden",!_mantOpen);
  if(chev)chev.classList.toggle("open",_mantOpen);
}

// ─── R5 simple · Banner de novedades desde última visita ──
// Guarda en localStorage la fecha de última visita del usuario actual.
// Al entrar al dashboard, compara y muestra un banner si hay cambios relevantes.
function _lastVisitKey(){
  const uid=(typeof currentUser!=="undefined"&&currentUser?.uid)||"anon";
  return "gb_last_visit_"+uid;
}
function getLastVisit(){
  try{return localStorage.getItem(_lastVisitKey())}catch{return null}
}
function saveLastVisit(){
  try{localStorage.setItem(_lastVisitKey(),new Date().toISOString())}catch{}
}
function renderBannerNovedades(){
  const el=$("dash-banner-novedades");
  if(!el)return;
  el.classList.add("hidden");
  const last=getLastVisit();
  if(!last)return; // primera visita, no hay con qué comparar
  // Detectar cambios desde last:
  //   - Pedidos nuevos (status pedido/aprobada con createdAt o updatedAt > last)
  //   - Entregas registradas (status entregado con updatedAt > last)
  //   - Pagos recibidos (algún pago con fecha > last)
  let nuevosPedidos=0,nuevasEntregas=0,nuevosPagos=0;
  const lastTs=new Date(last).getTime();
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    const s=q.status||"enviada";
    if(s==="superseded"||s==="anulada")return;
    const upd=q.updatedAtLocal||q.updatedAtIso||(q.updatedAt?.toDate?q.updatedAt.toDate().toISOString():null);
    const updTs=upd?new Date(upd).getTime():0;
    if(updTs>lastTs){
      if(["pedido","aprobada","en_produccion"].includes(s))nuevosPedidos++;
      if(s==="entregado")nuevasEntregas++;
    }
    // pagos
    const pagos=typeof getPagos==="function"?getPagos(q):[];
    pagos.forEach(p=>{
      if(p.registradoEn){
        const pTs=new Date(p.registradoEn).getTime();
        if(pTs>lastTs)nuevosPagos++;
      }else if(p.fecha){
        const pTs=new Date(p.fecha).getTime();
        if(pTs>lastTs)nuevosPagos++;
      }
    });
  });
  const total=nuevosPedidos+nuevasEntregas+nuevosPagos;
  if(!total)return;
  const partes=[];
  if(nuevosPedidos)partes.push(nuevosPedidos+" pedido"+(nuevosPedidos!==1?"s":"")+" nuevo"+(nuevosPedidos!==1?"s":""));
  if(nuevasEntregas)partes.push(nuevasEntregas+" entrega"+(nuevasEntregas!==1?"s":"")+" registrada"+(nuevasEntregas!==1?"s":""));
  if(nuevosPagos)partes.push(nuevosPagos+" pago"+(nuevosPagos!==1?"s":"")+" recibido"+(nuevosPagos!==1?"s":""));
  const desde=new Date(last);
  const desdeStr=desde.toLocaleDateString("es-CO",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
  el.classList.remove("hidden");
  el.innerHTML='<div class="dbn-ic">🔔</div>'+
    '<div class="dbn-body">'+
      '<div class="dbn-title">Novedades desde tu última visita</div>'+
      '<div class="dbn-desc">'+partes.join(" · ")+' · desde '+desdeStr+'</div>'+
    '</div>'+
    '<button class="dbn-close" onclick="dismissNovedades(event)" title="Descartar">×</button>';
}
function dismissNovedades(ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  saveLastVisit();
  const el=$("dash-banner-novedades");if(el)el.classList.add("hidden");
}
