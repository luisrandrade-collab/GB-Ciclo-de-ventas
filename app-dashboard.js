// ═══════════════════════════════════════════════════════════
// app-dashboard.js · v4.12.1 · 2026-04-19
// Dashboard + mini-dash + agenda mensual + agenda semanal
// scrollable + export .ics idempotente + comentarios recientes.
// v4.12.1: cards clickeables (drill-down) + total real de propuestas.
// Termina con BOOTSTRAP (renderCats, renderPinPad, sessionStorage check).
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
}
function dateOfCreation(q){
  if(q.dateISO)return q.dateISO.slice(0,10);
  if(q.createdAt?.toDate)try{return q.createdAt.toDate().toISOString().slice(0,10)}catch{}
  return null;
}
function dateOfSale(q){return q.orderData?.fechaAprobacion||q.approvalData?.fechaAprobacion||null}

async function renderDashboard(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const range=getDashRange();
  $("dash-period-info").textContent=range.label;
  const inRange=fecha=>fecha&&fecha>=range.start&&fecha<=range.end;
  let cotCount=0,cotMonto=0,cotClientes=new Set();
  let venCount=0,venMonto=0,venClientes=new Set();
  let entCount=0,entMonto=0;
  let porCobrarTotal=0,porCobrarN=0;
  const recaudoMet={};METODOS_PAGO.forEach(m=>recaudoMet[m]=0);
  quotesCache.forEach(q=>{
    const status=q.status||"enviada";
    const total=getDocTotal(q);
    const fCre=dateOfCreation(q);
    const fVen=dateOfSale(q);
    const fEnt=q.fechaEntrega||q.eventDate;
    if(inRange(fCre)&&status!=="convertida"){cotCount++;cotMonto+=total;if(q.client)cotClientes.add(q.client)}
    if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){venCount++;venMonto+=total;if(q.client)venClientes.add(q.client)}
    if(inRange(fEnt)&&status==="entregado"){entCount++;entMonto+=total}
    if(["pedido","aprobada","en_produccion","entregado"].includes(status)){const pend=saldoPendiente(q);if(pend>0){porCobrarTotal+=pend;porCobrarN++}}
    getPagos(q).forEach(p=>{if(inRange(p.fecha)){const m=METODOS_PAGO.includes(p.metodo)?p.metodo:"Otro";recaudoMet[m]+=parseInt(p.monto)||0}});
  });
  const totalRecaudo=Object.values(recaudoMet).reduce((s,v)=>s+v,0);
  // v4.12.1: cards clickeables → openDashDetail despliega lista
  const _hint='<div style="position:absolute;bottom:6px;right:8px;font-size:9px;color:var(--soft)">Toca para ver →</div>';
  $("dash-cards").innerHTML=
    '<div class="dash-card cot" style="cursor:pointer" onclick="openDashDetail(\'cotizado\')"><div class="dash-card-icon">🧾</div><div class="dash-card-lab">Cotizado</div><div class="dash-card-val">'+fm(cotMonto)+'</div><div class="dash-card-sub">'+cotCount+' doc · '+cotClientes.size+' cliente'+(cotClientes.size!==1?'s':'')+'</div>'+_hint+'</div>'+
    '<div class="dash-card vendido" style="cursor:pointer" onclick="openDashDetail(\'vendido\')"><div class="dash-card-icon">🤝</div><div class="dash-card-lab">Vendido</div><div class="dash-card-val">'+fm(venMonto)+'</div><div class="dash-card-sub">'+venCount+' pedido'+(venCount!==1?'s':'')+' · '+venClientes.size+' cliente'+(venClientes.size!==1?'s':'')+'</div>'+_hint+'</div>'+
    '<div class="dash-card entregado" style="cursor:pointer" onclick="openDashDetail(\'entregado\')"><div class="dash-card-icon">🎉</div><div class="dash-card-lab">Entregado</div><div class="dash-card-val">'+fm(entMonto)+'</div><div class="dash-card-sub">'+entCount+' entrega'+(entCount!==1?'s':'')+'</div>'+_hint+'</div>'+
    '<div class="dash-card recaudo" style="cursor:pointer" onclick="openDashDetail(\'recaudo\')"><div class="dash-card-icon">💵</div><div class="dash-card-lab">Recaudado</div><div class="dash-card-val">'+fm(totalRecaudo)+'</div><div class="dash-card-sub">en el período</div>'+_hint+'</div>'+
    '<div class="dash-card cobrar" style="cursor:pointer" onclick="openDashDetail(\'cobrar\')"><div class="dash-card-icon">⚠️</div><div class="dash-card-lab">Por cobrar</div><div class="dash-card-val">'+fm(porCobrarTotal)+'</div><div class="dash-card-sub">'+porCobrarN+' documento'+(porCobrarN!==1?'s':'')+' (todos los activos)</div>'+_hint+'</div>';
  const maxMet=Math.max(...Object.values(recaudoMet),1);
  const recRows=METODOS_PAGO.map(m=>{
    const v=recaudoMet[m];
    const pct=Math.round(v*100/maxMet);
    return '<div class="dash-met-row"><div class="dash-met-name">'+m+'</div><div class="dash-met-bar"><div class="dash-met-bar-fill" style="width:'+(v>0?pct:0)+'%"></div></div><div class="dash-met-val">'+fm(v)+'</div></div>';
  }).join("");
  $("dash-recaudo").innerHTML=totalRecaudo>0?recRows:'<div class="dash-met-empty">Sin pagos registrados en el período.</div>';
  // Próximas entregas (próximos 14 días, ignora período)
  const todayIso2=new Date().toISOString().slice(0,10);
  const t14=new Date();t14.setDate(t14.getDate()+14);
  const t14Iso=t14.toISOString().slice(0,10);
  const upcoming=[];
  quotesCache.forEach(q=>{
    const s=q.status||"enviada";
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
  // Pendientes por cobrar (top 8)
  const pendList=[];
  quotesCache.forEach(q=>{
    const s=q.status||"enviada";
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
  // v4.12: comentarios recientes (5 últimos)
  const coments=quotesCache.filter(q=>q.comentarioCliente?.texto||q.comentarioCliente?.fotoBase64).map(q=>({q,c:q.comentarioCliente}));
  coments.sort((a,b)=>(b.c.fecha||"").localeCompare(a.c.fecha||""));
  if(!coments.length){$("dash-coments").innerHTML='<div class="dash-met-empty">Aún no se han registrado comentarios. Cuando entregues, registra qué dijo el cliente.</div>'}
  else{
    $("dash-coments").innerHTML=coments.slice(0,5).map(({q,c})=>{
      const fotoIcon=c.fotoBase64?' 📷':'';
      const txt=(c.texto||"(solo foto)").slice(0,120)+((c.texto||"").length>120?'...':'');
      return '<div class="dash-up-item" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 0;border-bottom:1px solid var(--cl)" onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\')">'+
        '<div style="font-size:11px;color:var(--mid)"><strong>'+(q.client||"—")+'</strong> · '+(c.fecha||"—")+fotoIcon+'</div>'+
        '<div style="font-size:12.5px;color:var(--bk);font-style:italic">"'+txt+'"</div>'+
      '</div>';
    }).join("");
  }
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
    const s=q.status;
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
  const statusProp=["aprobada","en_produccion","entregado"];
  const statusQuote=["pedido","en_produccion","entregado"];
  return quotesCache.filter(q=>{
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

// v4.12.4: extrae listado de productos del doc para incluir en el .ics
// - Cotización: cart + custom
// - Propuesta: Opción A de cada sección + menaje (lo que se debe alistar/producir)
function _buildItemsList(q){
  const items=[];
  if(q.kind==="quote"){
    (q.cart||[]).forEach(i=>{const qty=i.qty||0;items.push(qty+" × "+(i.n||"—"))});
    (q.cust||[]).forEach(i=>{const qty=i.qty||0;items.push(qty+" × "+(i.n||"—")+" (custom)")});
  }else{
    // Propuesta — toma Opción A de cada sección (la que está aprobada / la única en propfinal)
    (q.sections||[]).forEach(sec=>{
      const opts=sec.options||[];
      const opt=opts.find(o=>o.label==="Opción A")||opts[0];
      if(!opt)return;
      const its=opt.items||[];
      if(!its.length)return;
      items.push("【"+(sec.name||"")+"】");
      its.forEach(it=>{
        const qStr=(it.qty%1===0)?String(it.qty):(it.qty||0).toFixed(1);
        items.push("  "+qStr+" × "+(it.name||"—"));
      });
    });
    // Menaje (lo que hay que llevar)
    const menUsado=(q.menaje||[]).filter(m=>m.qty);
    if(menUsado.length){
      items.push("【MENAJE】");
      menUsado.forEach(m=>items.push("  "+m.qty+" × "+(m.name||"—")));
    }
    // Personal
    const pm=q.personalData?.meseros||{},pa=q.personalData?.auxiliares||{};
    if(pm.cantidad||pa.cantidad){
      items.push("【PERSONAL】");
      if(pm.cantidad)items.push("  "+pm.cantidad+" mesero(s)");
      if(pa.cantidad)items.push("  "+pa.cantidad+" auxiliar(es)");
    }
  }
  return items;
}

// v4.12.5: descripciones MÍNIMAS y diferenciadas:
//   - Producción: solo cliente + productos (+ notas producción si existen)
//   - Entrega: cliente + dirección + productos (+ notas entrega si existen)
// Sin valores, sin doc#, sin tel, sin hora dentro del cuerpo.
function _buildVeventsForDoc(q){
  const lines=[];
  const dtStamp=_icsDateUtc(new Date());
  const productos=_buildItemsList(q);
  const summaryBase=(q.client||"—")+(q.kind==="proposal"?" (Evento)":"");

  // ─── PRODUCCIÓN ─── 8:00 AM (3 horas duración hasta 11 AM) + 1 alerta -1d
  if(q.productionDate){
    const notas=q.orderData?.notasProduccion||q.approvalData?.notasProduccion||"";
    // Descripción mínima: solo cliente + productos (+ notas producción)
    const descLines=[];
    descLines.push("Cliente: "+(q.client||"—"));
    if(productos.length){
      descLines.push("");
      descLines.push("🔪 A PRODUCIR:");
      productos.forEach(p=>descLines.push(p));
    }
    if(notas){
      descLines.push("");
      descLines.push("📝 NOTAS:");
      descLines.push(notas);
    }
    const desc=descLines.map(_icsEscape).join("\\n");
    const dateStr=q.productionDate.replace(/-/g,"");
    const startLocal=dateStr+"T080000";
    const endLocal=dateStr+"T110000";
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
    lines.push(_icsFold("DESCRIPTION:Mañana producción 8AM — "+_icsEscape(q.client||"—")));
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  // ─── ENTREGA ─── hora real (1 hora duración) + alertas -1d y -3h
  if(q.eventDate){
    const notas=q.entregaData?.notasEntrega||"";
    // Descripción mínima: cliente + dirección + productos (+ notas entrega)
    const descLines=[];
    descLines.push("Cliente: "+(q.client||"—"));
    if(q.dir)descLines.push("Dirección: "+q.dir);
    if(productos.length){
      descLines.push("");
      descLines.push("🎉 A ENTREGAR:");
      productos.forEach(p=>descLines.push(p));
    }
    if(notas){
      descLines.push("");
      descLines.push("📝 NOTAS:");
      descLines.push(notas);
    }
    const desc=descLines.map(_icsEscape).join("\\n");
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
    // Alerta 2: 3 horas antes (solo si tiene hora)
    if(q.horaEntrega){
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT3H");
      lines.push("ACTION:DISPLAY");
      lines.push(_icsFold("DESCRIPTION:Entrega en 3h ("+q.horaEntrega+") — "+_icsEscape(q.client||"—")));
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

function _downloadIcs(filename,lines){
  const ics=lines.join("\r\n");
  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a)},100);
}

// Export 1 pedido: 2 eventos (producción + entrega)
function exportPedidoIcs(docId,kind,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q){alert("No encontrado");return}
  if(!q.eventDate&&!q.productionDate){alert("Este pedido no tiene fechas de entrega ni producción asignadas.");return}
  const lines=[..._icsHeader(),..._buildVeventsForDoc(q),..._icsFooter()];
  const fname=(q.quoteNumber||q.id)+"_"+(q.client||"sin").replace(/\s+/g,"_")+".ics";
  _downloadIcs(fname,lines);
}

// Export agenda completa: todos los eventos próximos 60 días + último mes
function exportAgendaIcs(){
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
  _downloadIcs("gourmet-bites-agenda-"+dateToIso(today)+".ics",lines);
}

// ═══════════════════════════════════════════════════════════
// v4.12.1: DRILL-DOWN — modal con detalle de cada KPI del dashboard
// ═══════════════════════════════════════════════════════════
function openDashDetail(tipo){
  const range=getDashRange();
  const inRange=fecha=>fecha&&fecha>=range.start&&fecha<=range.end;
  let title="",rows=[],totalSum=0;
  // Helper para fila de doc
  const docRow=(q,monto,extra)=>{
    const fecha=dateOfCreation(q)||"—";
    const sMeta=STATUS_META[q.status||"enviada"]||STATUS_META.enviada;
    const tag=q.kind==="quote"?'<span class="ui-tag prod">Pedido</span>':'<span class="ui-tag ent">Evento</span>';
    return '<div class="dd-row" onclick="closeDashDetail();loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="dd-row-top"><div class="dd-row-cli">'+tag+(q.client||"—")+'</div><div class="dd-row-monto">'+fm(monto)+'</div></div>'+
      '<div class="dd-row-meta"><span class="qnum" style="font-size:9px">'+(q.quoteNumber||q.id)+'</span> · '+fecha+' · <span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span>'+(extra?' · '+extra:'')+'</div>'+
    '</div>';
  };
  if(tipo==="cotizado"){
    title="🧾 Cotizado · "+range.label;
    quotesCache.forEach(q=>{
      const status=q.status||"enviada";
      const fCre=dateOfCreation(q);
      if(inRange(fCre)&&status!=="convertida"){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t})}
    });
  }else if(tipo==="vendido"){
    title="🤝 Vendido · "+range.label;
    quotesCache.forEach(q=>{
      const status=q.status||"enviada";
      const fVen=dateOfSale(q);
      if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t,extra:"Vendido: "+fVen})}
    });
  }else if(tipo==="entregado"){
    title="🎉 Entregado · "+range.label;
    quotesCache.forEach(q=>{
      const status=q.status||"enviada";
      const fEnt=q.fechaEntrega||q.eventDate;
      if(inRange(fEnt)&&status==="entregado"){const t=getDocTotal(q);totalSum+=t;rows.push({q,monto:t,extra:"Entregado: "+fEnt})}
    });
  }else if(tipo==="cobrar"){
    title="⚠️ Por cobrar · todos los pedidos activos";
    quotesCache.forEach(q=>{
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
      const fotoIcon=p.foto?' 📷':'';
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
  // Render genérico para cotizado/vendido/entregado/cobrar
  rows.sort((a,b)=>b.monto-a.monto);
  const html=rows.length?rows.map(r=>docRow(r.q,r.monto,r.extra)).join(""):'<div class="dd-empty">Sin documentos en este corte.</div>';
  $("dd-title").textContent=title;
  $("dd-list").innerHTML='<div class="dd-summary">Total: <strong>'+fm(totalSum)+'</strong> · '+rows.length+' documento'+(rows.length!==1?'s':'')+'</div>'+html;
  $("dash-detail-modal").classList.remove("hidden");
}
function closeDashDetail(){$("dash-detail-modal").classList.add("hidden")}

// ═══════════════════════════════════════════════════════════
// BOOTSTRAP — corre cuando todos los scripts están cargados
// ═══════════════════════════════════════════════════════════
// Inyectar logo en header
(function injectLogo(){
  const el=$("hdr-logo");
  if(el&&typeof LOGO_IW!=="undefined")el.src=LOGO_IW;
})();

// Inicializar UI: catálogo + PIN pad + version markers
renderCats();
renderPinPad();
["hdr-ver","pin-ver"].forEach(id=>{const el=$(id);if(el)el.textContent=BUILD_VERSION});
["hdr-date","pin-date"].forEach(id=>{const el=$(id);if(el)el.textContent=BUILD_DATE});

// v4.12: SOLO sessionStorage (cerrar pestaña/navegador → pide PIN)
if(sessionStorage.getItem("gb_unlocked")==="1"){
  $("pin-overlay").style.display="none";
  window.addEventListener("load",()=>setTimeout(initApp,100));
}
// v4.12: limpieza one-shot del legacy localStorage de unlock (de versiones anteriores)
try{localStorage.removeItem("gb_unlocked")}catch{}
