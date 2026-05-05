// ═══════════════════════════════════════════════════════════
// app-dashboard.js · v6.2.0 · 2026-04-24
// Dashboard + mini-dash + agenda mensual + agenda semanal
// scrollable + export .ics idempotente + comentarios recientes.
// v5.0.1b: drill-down agrupado + banner HOY + sync agenda + excluir convertidas.
// v5.0.2: banner sync pendiente + syncPendingOnly + rango custom.
// v5.0.3: excluir anuladas en todos los KPIs.
// v5.0.4: Pipeline Activo (pipeline vivo sin filtro de fecha) + banner follow-up.
// v5.0.5: badge VIVA/PERDIDA en drill-down y pipeline detail.
// v5.2.0/v5.2.1: Dashboard rediseñado (bento grid, render robusto con try-catch por
//         sección) + 3 reportes nuevos (conversión/pérdidas motivo/vista cliente) +
//         badge novedades + mantenimiento colapsable + fix botones ancho-completo.
// v6.0.0: KPI Entregado desglosa cumplidas (pagadas 100%) vs con saldo.
//         Drill-down muestra badges Cumplida/Saldo. La cifra grande no cambia.
// v6.0.1: HOTFIX — BUG-014 Pipeline Activo no abría drill-down al hacer clic en
//         las 3 pipe-cards. openPipelineDetail escribía en $("dash-detail-body"),
//         un ID que no existe en el DOM (el modal usa dd-title/dd-list). Ahora
//         usa los IDs reales, sigue el mismo patrón visual que openDashDetail
//         (agrupado por cliente + chips rápidos Viva/Perdida/Pedido/Aprobar en
//         docs followables) y el empty state se muestra inline (no alert).
// v6.2.0: Hoja de Entregas del Día (E2-1).
//         · Nueva función generarHojaEntregas(fromDate, toDate, soloPendientes)
//           que produce PDF físico firmable para Kathy/JP en las entregas.
//         · Abre modal selector (rango fechas + toggle "Solo pendientes")
//           desde botón 🖨️ en bloque "Operación urgente 3d".
//         · Tabla con 7 columnas del formato físico aprobado: FECHA, CLIENTE,
//           PRODUCTOS, DIRECCIÓN, RECIBE, NOTAS PAGO, FIRMA.
//         · Orden por horaEntrega, fallback alfabético por cliente.
//         · Reusa LOGO_IW, savePdf, isCumplido, totalCobrado, saldoPendiente.
//         · Sin cambio Firestore schema.
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
  // v7.0-α D1.1: período "Hoy" — start y end son el mismo día
  if(dashPeriod==="today")return{start:todayIso,end:todayIso,label:"Hoy ("+todayIso+")"};
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
// v7.0-α D1.4: período anterior con misma duración que el actual, para Δ%.
// 'all' no tiene anterior → null. Custom usa misma duración del rango.
function getDashRangePrev(){
  if(dashPeriod==="all")return null;
  const r=getDashRange();
  if(!r||!r.start||!r.end)return null;
  const startD=new Date(r.start+"T00:00:00");
  const endD=new Date(r.end+"T00:00:00");
  if(isNaN(startD)||isNaN(endD))return null;
  const days=Math.round((endD-startD)/86400000)+1;
  const prevEnd=new Date(startD);prevEnd.setDate(prevEnd.getDate()-1);
  const prevStart=new Date(prevEnd);prevStart.setDate(prevStart.getDate()-(days-1));
  const labelMap={
    "today":"vs ayer",
    "week":"vs semana anterior",
    "month":"vs mes anterior",
    "year":"vs año anterior",
    "custom":"vs rango anterior"
  };
  return {
    start:prevStart.toISOString().slice(0,10),
    end:prevEnd.toISOString().slice(0,10),
    label:labelMap[dashPeriod]||"vs período anterior"
  };
}
// v7.0-α D1.4: span Δ% honesto. previo=0 → "—" (placeholder honesto, sin engañar).
function _deltaSpan(actual,previo,label){
  if(previo===null||previo===undefined||!isFinite(previo)||previo===0){
    return '<span class="dash-card-delta is-flat" title="Sin datos en '+(label||"período anterior")+'">— '+(label||"")+'</span>';
  }
  const pct=Math.round(((actual-previo)/previo)*100);
  let cls="is-flat",arrow="→";
  if(pct>0){cls="is-up";arrow="↑"}
  else if(pct<0){cls="is-down";arrow="↓"}
  const sign=pct>0?"+":"";
  return '<span class="dash-card-delta '+cls+'">'+arrow+' '+sign+pct+'% '+(label||"")+'</span>';
}
function dateOfCreation(q){
  if(q.dateISO)return q.dateISO.slice(0,10);
  if(q.createdAt?.toDate)try{return q.createdAt.toDate().toISOString().slice(0,10)}catch{}
  return null;
}

// ─── v7.0-α D1.5 · Tendencia 6 meses (cot/ven/rec) ─────────
// Q3: placeholder honesto. Mes sin datos en NINGUNA serie → no se dibuja punto.
// La polilínea conecta solo los meses con datos. 1 mes con datos → solo dot.
function computeTrend6m(){
  const today=new Date();
  const meses=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const out=[];
  for(let i=5;i>=0;i--){
    const d=new Date(today.getFullYear(),today.getMonth()-i,1);
    const ymKey=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
    const isCurrent=(i===0);
    out.push({key:ymKey,year:d.getFullYear(),month:d.getMonth(),label:meses[d.getMonth()],labelFull:meses[d.getMonth()]+" "+d.getFullYear(),cot:0,ven:0,rec:0,isCurrent:isCurrent,hasData:false});
  }
  const idxByKey={};out.forEach((m,i)=>{idxByKey[m.key]=i});
  quotesCache.forEach(q=>{
    try{
      if(typeof noSumaEnKpis==="function"){if(noSumaEnKpis(q,"dash-trend"))return}
      else{if(q._wrongCollection)return;const _st=q.status||"enviada";if(_st==="superseded"||_st==="anulada"||_st==="convertida")return}
      const status=q.status||"enviada";
      if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida"&&(status==="enviada"||status==="propfinal"))return;
      const total=getDocTotal(q);
      const fCre=dateOfCreation(q);const fVen=dateOfSale(q);
      if(fCre&&status!=="convertida"){const k=fCre.slice(0,7);if(idxByKey[k]!==undefined)out[idxByKey[k]].cot+=total}
      if(fVen&&["pedido","aprobada","en_produccion","entregado"].includes(status)){const k=fVen.slice(0,7);if(idxByKey[k]!==undefined)out[idxByKey[k]].ven+=total}
      getPagos(q).forEach(p=>{if(p.fecha){const k=String(p.fecha).slice(0,7);if(idxByKey[k]!==undefined)out[idxByKey[k]].rec+=parseInt(p.monto)||0}});
    }catch{}
  });
  out.forEach(m=>{m.hasData=(m.cot+m.ven+m.rec)>0});
  return out;
}
function _trendFmt(n){if(n===0)return"$0";return"$"+(n/1e6).toFixed(2)+"M"}
function _trendNiceCeil(max){
  if(max<=0)return 1e6;
  const exp=Math.pow(10,Math.floor(Math.log10(max)));
  const m=max/exp;
  let nice;
  if(m<=1)nice=1;else if(m<=2)nice=2;else if(m<=5)nice=5;else nice=10;
  return nice*exp;
}
function renderTrend6m(){
  const el=$("dash-trend-6m");if(!el)return;
  const data=computeTrend6m();
  const dataValid=data.filter(m=>m.hasData);
  const W=600,H=200,padL=58,padR=18,padT=18,padB=30;
  const innerW=W-padL-padR,innerH=H-padT-padB;
  const xStep=innerW/5;
  const xOf=i=>padL+i*xStep;
  // Y scale
  let maxV=0;data.forEach(m=>{if(m.cot>maxV)maxV=m.cot;if(m.ven>maxV)maxV=m.ven;if(m.rec>maxV)maxV=m.rec});
  const yMax=_trendNiceCeil(maxV||1);
  const yOf=v=>padT+innerH*(1-(v/yMax));
  // Header
  const subRange=data[0].label.toUpperCase()+" "+data[0].year+" — "+data[5].label.toUpperCase()+" "+data[5].year;
  // Build SVG
  const grid=[0,.25,.5,.75,1].map(t=>{
    const y=padT+innerH*t;
    return '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="#eceef2" stroke-width="1"/>';
  }).join("");
  const ylab=[0,.25,.5,.75,1].map(t=>{
    const y=padT+innerH*t+3;
    const v=yMax*(1-t);
    return '<text x="'+(padL-8)+'" y="'+y+'" text-anchor="end" font-family="ui-monospace,monospace" font-size="10" fill="#9aa3b3">'+_trendFmt(v)+'</text>';
  }).join("");
  const xlab=data.map((m,i)=>{
    const fill=m.isCurrent?"#21252f":"#6b7384";
    const fw=m.isCurrent?"600":"400";
    return '<text x="'+xOf(i)+'" y="'+(H-10)+'" text-anchor="middle" font-family="ui-monospace,monospace" font-size="10" fill="'+fill+'" font-weight="'+fw+'">'+m.label.toUpperCase()+'</text>';
  }).join("");
  // Polilíneas: solo puntos con hasData; serie cot/ven/rec usa su valor (puede ser 0 aún con hasData=true en otra serie)
  const seriesPoly=(key,color,strokeW)=>{
    const pts=data.map((m,i)=>m.hasData?(xOf(i)+","+yOf(m[key])):null).filter(Boolean);
    if(pts.length<2)return"";
    return '<polyline points="'+pts.join(" ")+'" fill="none" stroke="'+color+'" stroke-width="'+strokeW+'" stroke-linejoin="round" stroke-linecap="round"/>';
  };
  const seriesDots=(key,color,r)=>{
    return data.map((m,i)=>{
      if(!m.hasData)return"";
      const cur=m.isCurrent;
      const rr=cur?r+0.5:r;
      const stroke=cur?' stroke="white" stroke-width="2"':"";
      return '<circle cx="'+xOf(i)+'" cy="'+yOf(m[key])+'" r="'+rr+'" fill="'+color+'"'+stroke+'/>';
    }).join("");
  };
  // Línea vertical mes actual
  const curIdx=data.findIndex(m=>m.isCurrent);
  const curLine=curIdx>=0?'<line x1="'+xOf(curIdx)+'" y1="'+padT+'" x2="'+xOf(curIdx)+'" y2="'+(H-padB)+'" stroke="#dde1e8" stroke-width="1" stroke-dasharray="2 3"/>':"";
  // Empty state si NO hay ningún mes con datos
  if(dataValid.length===0){
    el.innerHTML='<div class="trend-empty">Sin datos en los últimos 6 meses</div>';
    return;
  }
  // Mensaje meses sin datos (placeholder honesto)
  const mesesSinDatos=data.filter(m=>!m.hasData).length;
  const footMsg=mesesSinDatos>0
    ? '<div class="trend-foot">'+mesesSinDatos+' mes'+(mesesSinDatos!==1?'es':'')+' sin datos (piloto reciente)</div>'
    : '';
  el.innerHTML=
    '<div class="trend-header"><div class="trend-title">Tendencia · 6 meses</div><div class="trend-sub">'+subRange+'</div></div>'+
    '<div class="trend-legend">'+
      '<span class="trend-legend__item"><span class="trend-legend__swatch" style="background:#9aa3b3"></span>Cotizado</span>'+
      '<span class="trend-legend__item"><span class="trend-legend__swatch" style="background:#4853d4"></span>Vendido</span>'+
      '<span class="trend-legend__item"><span class="trend-legend__swatch" style="background:#15a34a"></span>Recaudado</span>'+
    '</div>'+
    '<svg class="trend-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">'+
      grid+ylab+curLine+
      seriesPoly("cot","#9aa3b3",2)+
      seriesPoly("ven","#4853d4",2.5)+
      seriesPoly("rec","#15a34a",2)+
      seriesDots("cot","#9aa3b3",3)+
      seriesDots("ven","#4853d4",3.5)+
      seriesDots("rec","#15a34a",3)+
      xlab+
    '</svg>'+
    footMsg;
}
function dateOfSale(q){return q.orderData?.fechaAprobacion||q.approvalData?.fechaAprobacion||null}

// ─── v7.0-α D1.3 · Zona "Lo que pasa hoy" ──────────────────
// 3 categorías reales (tareas → v7.1, no aplica). Orden por urgencia:
// 1) Cobros vencidos (saldo>0 + entregado hace >7 días, mayor antigüedad primero)
// 2) Producir hoy (pedido/aprobada con fechaEntrega=hoy, sin q.produced)
// 3) Entregar hoy (en_produccion con fechaEntrega=hoy)
function computeTodayZone(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayIso=today.toISOString().slice(0,10);
  const items=[];
  (quotesCache||[]).forEach(q=>{
    if(q._wrongCollection)return;
    const s=q.status||"enviada";
    if(["anulada","superseded","convertida"].includes(s))return;
    const fEnt=q.fechaEntrega||q.eventDate;
    if(!fEnt)return;
    // 1) Cobros vencidos: status entregado con saldo>0, hace >7 días
    if(s==="entregado"){
      const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      if(saldo>0){
        const dias=Math.round((today-new Date(fEnt+"T00:00:00"))/86400000);
        if(dias>7){
          items.push({
            urgency:0,q:q,
            when:"VENCIDO",whenSub:"hace "+dias+" día"+(dias!==1?"s":""),
            tag:"COBRO",
            title:(q.client||"—")+" · saldo sin pagar",
            sub:(q.id||"")+" · entregado "+fEnt,
            amount:saldo,
            sortKey:dias // mayor = más urgente dentro de vencidos
          });
        }
      }
      return;
    }
    // 2) Producir hoy
    if(["pedido","aprobada"].includes(s)&&fEnt===todayIso&&!q.produced){
      const hora=q.horaEntrega||"";
      items.push({
        urgency:1,q:q,
        when:"HOY"+(hora?" "+hora:""),whenSub:"falta producir",
        tag:"PRODUCCIÓN",
        title:(q.client||"—")+" · falta producir",
        sub:(q.id||"")+(hora?" · entrega "+hora:""),
        amount:getDocTotal(q),
        sortKey:hora||"99:99"
      });
    }
    // 3) Entregar hoy
    if(s==="en_produccion"&&fEnt===todayIso){
      const hora=q.horaEntrega||"";
      const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      items.push({
        urgency:2,q:q,
        when:"HOY"+(hora?" "+hora:""),whenSub:"entregar",
        tag:"ENTREGA",
        title:(q.client||"—")+" · entrega",
        sub:(q.id||"")+(saldo>0?" · saldo "+fm(saldo)+" al recibir":" · pagado"),
        amount:getDocTotal(q),
        sortKey:hora||"99:99"
      });
    }
  });
  items.sort((a,b)=>{
    if(a.urgency!==b.urgency)return a.urgency-b.urgency;
    if(a.urgency===0)return b.sortKey-a.sortKey;
    return String(a.sortKey).localeCompare(String(b.sortKey));
  });
  return items;
}
function renderTodayZone(){
  const list=$("dash-today-zone-list");
  const countEl=$("dash-today-zone-count");
  if(!list)return;
  const items=computeTodayZone();
  const total=items.length;
  const vencidos=items.filter(i=>i.urgency===0).length;
  if(countEl){
    let txt=total+" item"+(total!==1?"s":"");
    if(vencidos>0)txt+=" · "+vencidos+" vencido"+(vencidos!==1?"s":"");
    countEl.textContent=txt;
  }
  if(!items.length){
    list.innerHTML='<div class="today-empty">Nada urgente hoy ✓</div>';
    return;
  }
  list.innerHTML=items.map(it=>{
    const variantCls=it.urgency===0?"today-item--vencido":"today-item--hoy";
    const amount=it.amount?fm(it.amount):"—";
    const cli=String(it.title).replace(/[<>]/g,"");
    const sub=String(it.sub).replace(/[<>]/g,"");
    return '<div class="today-item '+variantCls+'" onclick="openDocument(\''+it.q.kind+'\',\''+it.q.id+'\')">'+
      '<div class="today-item__bar"></div>'+
      '<div class="today-item__when">'+it.when+(it.whenSub?'<small>'+it.whenSub+'</small>':'')+'</div>'+
      '<div class="today-item__main">'+
        '<div class="today-item__title">'+cli+' <span class="today-item__type-tag">'+it.tag+'</span></div>'+
        '<div class="today-item__sub">'+sub+'</div>'+
      '</div>'+
      '<div class="today-item__action">'+
        '<span class="today-item__amount">'+amount+'</span>'+
        '<svg class="today-item__chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>'+
      '</div>'+
    '</div>';
  }).join("");
}

// v7.0-α D1.1 — saludo dinámico + sub fecha/semana en dash-head
function renderDashHead(){
  const today=new Date();
  const dias=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const meses=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  // ISO week number (lunes-domingo)
  const _isoWeek=d=>{const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/86400000+1)/7)};
  const subText=dias[today.getDay()]+" "+today.getDate()+" de "+meses[today.getMonth()]+", "+today.getFullYear()+" · semana "+_isoWeek(today);
  const h=today.getHours();
  let saludo="Buenos días";
  if(h>=12&&h<19)saludo="Buenas tardes";
  else if(h>=19||h<5)saludo="Buenas noches";
  // Nombre del usuario: override por email del equipo, fallback displayName, fallback email split
  const NOMBRE_POR_EMAIL={
    "juanpanadrade2005@gmail.com":"Juan Pablo",
    "kathy.matuk@gmail.com":"Kathy",
    "luisrandrade@gmail.com":"Luis R"
  };
  let nombre="";
  try{
    const u=window.currentUser||window.fbUser||(window.fb&&window.fb.auth&&window.fb.auth.currentUser);
    if(u){
      const email=(u.email||"").toLowerCase();
      if(NOMBRE_POR_EMAIL[email])nombre=NOMBRE_POR_EMAIL[email];
      else nombre=(u.displayName||"").split(" ")[0]||email.split("@")[0]||"";
    }
  }catch{}
  // Si vino del map, no capitalizar (ya está como debe ser); si vino del fallback, capitalizar primera letra
  const nombreFinal=NOMBRE_POR_EMAIL[(window.currentUser?.email||"").toLowerCase()]
    ?nombre
    :(nombre?nombre.charAt(0).toUpperCase()+nombre.slice(1):"");
  const greetText=saludo+(nombreFinal?", "+nombreFinal:"")+".";
  const subEl=document.getElementById("dash-head-sub");
  const grEl=document.getElementById("dash-head-greeting");
  if(subEl)subEl.textContent=subText;
  if(grEl)grEl.textContent=greetText;
}

async function renderDashboard(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  // v5.2.1: cada sección se envuelve en try-catch para que un error en una
  // no impida que el resto del dashboard se renderice. Antes de v5.2 un error
  // en renderBannerFollowUp (por ejemplo) dejaba el dashboard en blanco.
  // v5.2.1: protegemos incluso el body principal (range, loop, etc) por si
  // quotesCache tiene datos corruptos.
  const _safe=(fn,name)=>{try{fn()}catch(e){console.warn("[Dashboard] sección '"+name+"' falló:",e);console.warn("  stack:",e?.stack)}};

  _safe(renderDashHead,"dash-head"); // v7.0-α D1.1
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
  // v6.0: desglose de entregas en cumplidas (pagadas 100%) vs con saldo pendiente.
  // No cambia la cifra principal (entMonto/entCount) pero añade contexto visual.
  let entCumplidasN=0,entConSaldoN=0;
  let porCobrarTotal=0,porCobrarN=0;
  const recaudoMet={};METODOS_PAGO.forEach(m=>recaudoMet[m]=0);
  let totalRecaudo=0;
  // v7.0-α D1.4: acumuladores del período anterior para Δ%
  let cotMontoPrev=0,venMontoPrev=0,entMontoPrev=0,recaudoPrev=0;
  let range=null,inRange=null,rangePrev=null,inRangePrev=null;
  _safe(()=>{
    range=getDashRange();
    const pInfoEl=$("dash-period-info");
    if(pInfoEl)pInfoEl.textContent=range.label;
    inRange=fecha=>fecha&&fecha>=range.start&&fecha<=range.end;
    rangePrev=getDashRangePrev();
    inRangePrev=rangePrev?(fecha=>fecha&&fecha>=rangePrev.start&&fecha<=rangePrev.end):()=>false;
    const _optExcl=typeof buildOptionExclusions==="function"?buildOptionExclusions(quotesCache):new Set();
    quotesCache.forEach(q=>{
      try{
        // v6.4.0 P1: defensa centralizada — excluye fantasmas/superseded/anuladas/convertidas
        if(typeof noSumaEnKpis==="function"){
          if(noSumaEnKpis(q,"dash-kpis"))return;
        }else{
          if(q._wrongCollection)return;
          const _st=q.status||"enviada";
          if(_st==="superseded"||_st==="anulada"||_st==="convertida")return;
        }
        const status=q.status||"enviada";
        if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida"&&(status==="enviada"||status==="propfinal"))return;
        const total=getDocTotal(q);
        const fCre=dateOfCreation(q);
        const fVen=dateOfSale(q);
        const fEnt=q.fechaEntrega||q.eventDate;
        const _isOptExcl=_optExcl.has(q.id);
        if(inRange(fCre)&&status!=="convertida"&&!_isOptExcl){cotCount++;cotMonto+=total;if(q.client)cotClientes.add(q.client)}
        if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){venCount++;venMonto+=total;if(q.client)venClientes.add(q.client)}
        if(inRange(fEnt)&&status==="entregado"){
          entCount++;entMonto+=total;
          // v6.0: clasificar entre cumplida (pagada 100%) y con saldo
          if(typeof isCumplido==="function"&&isCumplido(q))entCumplidasN++;
          else entConSaldoN++;
        }
        if(["pedido","aprobada","en_produccion","entregado"].includes(status)){const pend=saldoPendiente(q);if(pend>0){porCobrarTotal+=pend;porCobrarN++}}
        getPagos(q).forEach(p=>{if(inRange(p.fecha)){const m=METODOS_PAGO.includes(p.metodo)?p.metodo:"Otro";recaudoMet[m]+=parseInt(p.monto)||0}});
        // v7.0-α D1.4: misma lógica para período anterior (acumula solo montos para Δ%)
        if(rangePrev){
          if(inRangePrev(fCre)&&status!=="convertida"&&!_isOptExcl)cotMontoPrev+=total;
          if(inRangePrev(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status))venMontoPrev+=total;
          if(inRangePrev(fEnt)&&status==="entregado")entMontoPrev+=total;
          getPagos(q).forEach(p=>{if(inRangePrev(p.fecha))recaudoPrev+=parseInt(p.monto)||0});
        }
      }catch(eDoc){
        console.warn("[Dashboard] doc con error en loop:",q?.id,q?.kind,eDoc);
      }
    });
    totalRecaudo=Object.values(recaudoMet).reduce((s,v)=>s+v,0);
  },"metricas-loop");
  const _hint='<div style="position:absolute;bottom:6px;right:8px;font-size:9px;color:var(--gb-neutral-400)">Toca para ver →</div>';
  // v7.0-α D1.4: span Δ% (solo si hay rangePrev; "Histórico completo" no tiene anterior)
  const _prevLabel=rangePrev?rangePrev.label:"";
  const _dCot=rangePrev?_deltaSpan(cotMonto,cotMontoPrev,_prevLabel):"";
  const _dVen=rangePrev?_deltaSpan(venMonto,venMontoPrev,_prevLabel):"";
  const _dEnt=rangePrev?_deltaSpan(entMonto,entMontoPrev,_prevLabel):"";
  const _dRec=rangePrev?_deltaSpan(totalRecaudo,recaudoPrev,_prevLabel):"";
  // KPIs del período (bento)
  _safe(()=>{
    const el=$("dash-cards");
    if(!el){console.warn("[Dashboard] #dash-cards no existe en el DOM");return}
    el.innerHTML=
      '<div class="dash-card cot" style="cursor:pointer" onclick="openDashDetail(\'cotizado\')"><div class="dash-card-icon">🧾</div><div class="dash-card-lab">Cotizado</div><div class="dash-card-val">'+fm(cotMonto)+'</div><div class="dash-card-sub">'+cotCount+' doc · '+cotClientes.size+' cliente'+(cotClientes.size!==1?'s':'')+'</div>'+_dCot+_hint+'</div>'+
      '<div class="dash-card vendido" style="cursor:pointer" onclick="openDashDetail(\'vendido\')"><div class="dash-card-icon">🤝</div><div class="dash-card-lab">Vendido</div><div class="dash-card-val">'+fm(venMonto)+'</div><div class="dash-card-sub">'+venCount+' pedido'+(venCount!==1?'s':'')+' · '+venClientes.size+' cliente'+(venClientes.size!==1?'s':'')+'</div>'+_dVen+_hint+'</div>'+
      '<div class="dash-card entregado" style="cursor:pointer" onclick="openDashDetail(\'entregado\')"><div class="dash-card-icon">🎉</div><div class="dash-card-lab">Entregado</div><div class="dash-card-val">'+fm(entMonto)+'</div><div class="dash-card-sub">'+entCount+' entrega'+(entCount!==1?'s':'')+(entCount>0?' · '+entCumplidasN+' cumplida'+(entCumplidasN!==1?'s':'')+' · '+entConSaldoN+' con saldo':'')+'</div>'+_dEnt+_hint+'</div>'+
      '<div class="dash-card recaudo" style="cursor:pointer" onclick="openDashDetail(\'recaudo\')"><div class="dash-card-icon">💵</div><div class="dash-card-lab">Recaudado</div><div class="dash-card-val">'+fm(totalRecaudo)+'</div><div class="dash-card-sub">en el período</div>'+_dRec+_hint+'</div>'+
      '<div class="dash-card cobrar" style="cursor:pointer" onclick="openDashDetail(\'cobrar\')"><div class="dash-card-icon">⚠️</div><div class="dash-card-lab">Por cobrar</div><div class="dash-card-val">'+fm(porCobrarTotal)+'</div><div class="dash-card-sub">'+porCobrarN+' documento'+(porCobrarN!==1?'s':'')+' (todos los activos)</div>'+_hint+'</div>';
  },"kpis-cards");

  // v5.2.0: Reportes comerciales (solo si range/inRange se calcularon OK)
  // v7.5: renderReportePerdidas movido a Ventas > Perdidas. renderClienteView
  // eliminado (cubierto por sidebar > Archivo > Buscar todo).
  if(range&&inRange){
    _safe(renderTrend6m,"trend-6m"); // v7.0-α D1.5
    _safe(()=>renderReporteConversion(range,inRange),"reporte-conversion");
  }

  // v5.3.0: Operación urgente (por producir + por entregar en próximos 3 días)
  // SIEMPRE VISIBLE — lo más importante del día a día operativo
  _safe(renderTodayZone,"today-zone"); // v7.0-α D1.3
  _safe(renderUrgent3d,"urgent-3d");

  // v5.3.0: aplicar estado guardado de collapsibles (localStorage)
  _safe(applyDashCollapsedState,"collapsed-state");

  // v7.5: Recaudo por método movido a Cartera (boton modal openRecaudoMetodoModal).
  // Próximas entregas (próximos 14 días, ignora período)
  _safe(()=>{
    const todayIso2=new Date().toISOString().slice(0,10);
    const t14=new Date();t14.setDate(t14.getDate()+14);
    const t14Iso=t14.toISOString().slice(0,10);
    const upcoming=[];
    const sinFecha=[];
    quotesCache.forEach(q=>{
      if(q._wrongCollection)return;
      const s=q.status||"enviada";
      if(s==="superseded")return;
      const ok=(q.kind==="quote"&&["pedido","en_produccion"].includes(s))||(q.kind==="proposal"&&["aprobada","en_produccion"].includes(s));
      if(!ok)return;
      if(!q.eventDate){sinFecha.push(q);return}
      if(q.eventDate>=todayIso2&&q.eventDate<=t14Iso)upcoming.push(q);
    });
    upcoming.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
    const sinFechaHtml=sinFecha.length?'<div class="dash-met-empty" style="background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:8px;padding:10px 14px;margin-top:8px;cursor:pointer" onclick="if(typeof switchSection===\'function\')switchSection(\'ventas\')">⚠️ '+sinFecha.length+' pedido'+(sinFecha.length>1?'s':'')+' sin fecha de entrega: '+sinFecha.map(q=>(q.client||q.id)).join(", ")+'</div>':"";
    if(!upcoming.length){$("dash-upcoming").innerHTML='<div class="dash-met-empty">No hay entregas en los próximos 14 días.</div>'+sinFechaHtml}
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
          return '<div class="dash-up-item" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')"><div class="ui-cli">'+tag+(q.client||"—")+'</div><div class="ui-meta">'+hora+' · '+total+'</div></div>';
        }).join("");
        return '<div class="dash-up-day"><div class="dash-up-day-label">'+dayLabel(d)+'</div>'+items+'</div>';
      }).join("")+sinFechaHtml;
    }
  },"upcoming");
  // v7.5: Pendientes por cobrar eliminado del Dashboard (cubierto por sidebar > Cartera).
  // Comentarios recientes
  _safe(()=>{
    const coments=quotesCache.filter(q=>!q._wrongCollection&&q.status!=="superseded"&&q.status!=="anulada"&&(q.comentarioCliente?.texto||q.comentarioCliente?.fotoUrl||q.comentarioCliente?.fotoBase64)).map(q=>({q,c:q.comentarioCliente}));
    coments.sort((a,b)=>(b.c.fecha||"").localeCompare(a.c.fecha||""));
    if(!coments.length){$("dash-coments").innerHTML='<div class="dash-met-empty">Aún no se han registrado comentarios. Cuando entregues, registra qué dijo el cliente.</div>'}
    else{
      $("dash-coments").innerHTML=coments.slice(0,5).map(({q,c})=>{
        const fotoIcon=(c.fotoUrl||c.fotoBase64)?' 📷':'';
        const txt=(c.texto||"(solo foto)").slice(0,120)+((c.texto||"").length>120?'...':'');
        return '<div class="dash-up-item" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 0;border-bottom:1px solid var(--gb-cream)" onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\')">'+
          '<div style="font-size:11px;color:var(--gb-neutral-500)"><strong>'+(q.client||"—")+'</strong> · '+(c.fecha||"—")+fotoIcon+'</div>'+
          '<div style="font-size:12.5px;color:var(--gb-neutral-900);font-style:italic">"'+txt+'"</div>'+
        '</div>';
      }).join("");
    }
  },"comentarios");
  // D1.2: el anchor del banner novedades se congela al primer render (ver renderBannerNovedades)
  // y solo se persiste con saveLastVisit() en dismissNovedades(). NO guardar acá: rompería el delta.
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
  const convertibles_count=quotesCache.filter(q=>q.kind==="quote"&&q.status==="enviada"&&!q._wrongCollection&&!(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida")).length;
  if(total===0&&saldoP===0&&convertibles_count===0){dashEl.classList.add("hidden");dashEl.innerHTML="";return}
  const listify=arr=>arr.map(q=>(q.client||"—")+(q.horaEntrega?' '+q.horaEntrega:'')).join(" · ");
  const items=[];
  if(hoyN>0)items.push('<div class="mini-dash-item today" title="'+listify(upcoming.hoy)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+hoyN+'</div><div class="mini-dash-lab">🔥 Hoy</div></div>');
  if(mañanaN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.mañana)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+mañanaN+'</div><div class="mini-dash-lab">📅 Mañana</div></div>');
  if(pasadoN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.pasado)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+pasadoN+'</div><div class="mini-dash-lab">📆 Pasado<br>mañana</div></div>');
  if(semanaN>0)items.push('<div class="mini-dash-item" title="'+listify(upcoming.semana)+'" onclick="setMode(\'cal\')"><div class="mini-dash-val">'+semanaN+'</div><div class="mini-dash-lab">🗓️ Resto<br>semana</div></div>');
  if(saldoP>0)items.push('<div class="mini-dash-item alert" onclick="setMode(\'hist\')"><div class="mini-dash-val">'+saldoP+'</div><div class="mini-dash-lab">💰 Saldo<br>por cobrar</div></div>');
  // B3: cotizaciones convertibles a pedido
  const convertibles=quotesCache.filter(q=>q.kind==="quote"&&q.status==="enviada"&&!q._wrongCollection&&!(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida"));
  let convHtml="";
  if(convertibles.length){
    const rows=convertibles.map(q=>{
      const cli=q.client||"—";
      const tot=typeof fm==="function"?fm(q.total||0):"$"+(q.total||0);
      const fecha=q.dateISO?q.dateISO.slice(0,10):"";
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f0f0f0">'+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+h(cli)+'</div><div style="font-size:11px;color:#888">'+(q.quoteNumber||q.id)+' · '+tot+(fecha?' · '+fecha:'')+'</div></div>'+
        '<button class="btn hc-btn-order" style="margin-left:8px;font-size:12px;padding:4px 10px;white-space:nowrap" onclick="event.stopPropagation();openOrderModal(\''+q.id+'\',event)">✅ Pedido</button>'+
        '</div>';
    }).join("");
    convHtml='<div style="margin-top:10px;background:white;border-radius:10px;border:1px solid #e0e0e0;overflow:hidden">'+
      '<div style="padding:8px 12px;background:#F5F5F5;font-weight:700;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.3px">📋 Cotizaciones pendientes ('+convertibles.length+')</div>'+rows+'</div>';
  }
  dashEl.innerHTML=items.join("")+convHtml;
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
      // v5.4.3: agenda visual con estados operativos + chip pago + resumen productos
      evsHtml='<div class="wd-evs">'+evs.map(q=>renderWeekEventCard(q,iso,todayIso)).join("")+'</div>';
    }
    html+='<div class="'+dayClass+'">'+dateBox+evsHtml+'</div>';
  }
  $("week-grid").innerHTML=html;
}

// ─── v5.4.3: Tarjeta de evento enriquecida para agenda semanal ──
// Muestra chip de estado operativo (por producir / en producción /
// producido / entregado), chip de pago (pagado / anticipo / sin
// anticipo), hora destacada y resumen de productos clave.
function renderWeekEventCard(q,iso,todayIso){
  const tag=q.kind==="quote"?'<span class="we-tag prod">Pedido</span>':'<span class="we-tag ent">Evento</span>';
  const hora=q.horaEntrega||"";
  const total=fm(getDocTotal(q));
  const sCls=q.status||"enviada";
  // Estado operativo (chip principal)
  const opEstado=_estadoOperativo(q,iso,todayIso);
  const opChip=opEstado?'<span class="we-op-chip we-op-'+opEstado.cls+'">'+opEstado.emoji+' '+opEstado.label+'</span>':'';
  // Estado de pago (chip secundario)
  const pagoEstado=_estadoPago(q);
  const pagoChip=pagoEstado?'<span class="we-pago-chip we-pago-'+pagoEstado.cls+'">'+pagoEstado.emoji+' '+pagoEstado.label+'</span>':'';
  // Resumen productos (primeros 2 items, max 40 chars)
  let prodResumen="";
  if(q.kind==="quote"&&Array.isArray(q.items)){
    prodResumen=q.items.slice(0,2).map(it=>(it.name||it.n||"").trim()).filter(Boolean).join(" · ");
    if(q.items.length>2)prodResumen+=" · +"+(q.items.length-2);
  }else if(q.kind==="proposal"&&Array.isArray(q.sections)){
    prodResumen=q.sections.slice(0,2).map(s=>(s.title||"").trim()).filter(Boolean).join(" · ");
    if(q.sections.length>2)prodResumen+=" · +"+(q.sections.length-2);
  }
  if(prodResumen.length>55)prodResumen=prodResumen.slice(0,52)+"…";
  const prodHtml=prodResumen?'<div class="we-prods">📋 '+prodResumen.replace(/[<>]/g,"")+'</div>':'';
  // Chip 🔪 acción rápida: solo si es pedido en un día próximo sin producir aún
  let accionChip="";
  if(q.kind==="quote"&&["pedido","en_produccion"].includes(sCls)&&!q.produced&&iso>=todayIso){
    accionChip='<button class="we-accion-chip" onclick="event.stopPropagation();toggleProduced(\''+q.id+'\',event)" title="Marcar como producido">🔪 Marcar producido</button>';
  }
  return '<div class="wd-ev '+sCls+(opEstado?' op-'+opEstado.cls:'')+'" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
    '<div class="we-row-top">'+
      '<span class="we-cli">'+tag+(q.client||"—").replace(/[<>]/g,"")+'</span>'+
      (hora?'<span class="we-hora-big">⏰ '+hora+'</span>':'')+
    '</div>'+
    '<div class="we-chips-row">'+opChip+pagoChip+'<span class="we-total">'+total+'</span></div>'+
    prodHtml+
    (accionChip?'<div class="we-accion-row">'+accionChip+'</div>':'')+
  '</div>';
}

// Determina estado operativo del pedido según status + produced + fecha
function _estadoOperativo(q,iso,todayIso){
  const s=q.status||"enviada";
  // Cotización sin aprobar: solo etiqueta simple
  if(s==="enviada")return {cls:"enviada",emoji:"📄",label:"Cotización enviada"};
  if(s==="propfinal")return {cls:"propfinal",emoji:"📋",label:"PF enviada"};
  if(s==="aprobada")return {cls:"aprobada",emoji:"✓",label:"Aprobada"};
  if(s==="entregado")return {cls:"entregado",emoji:"🎉",label:"Entregado"};
  if(s==="anulada")return {cls:"anulada",emoji:"↩️",label:"Anulada"};
  if(s==="convertida"||s==="superseded")return {cls:"convertida",emoji:"🔄",label:"Reemplazada"};
  // Pedido / en_produccion: cruza con produced + fechas
  if(["pedido","en_produccion"].includes(s)){
    if(q.produced){
      if(iso===todayIso)return {cls:"producido-hoy",emoji:"✅",label:"Producido · entrega HOY"};
      return {cls:"producido",emoji:"✅",label:"Producido"};
    }
    const prodDate=q.productionDate||"";
    if(prodDate&&prodDate<=todayIso&&iso>=todayIso){
      return {cls:"en-produccion",emoji:"🔪",label:"En producción"};
    }
    if(iso===todayIso)return {cls:"por-producir-hoy",emoji:"🔥",label:"Por producir · entrega HOY"};
    if(iso<todayIso)return {cls:"atrasado",emoji:"⚠️",label:"Atrasado"};
    return {cls:"por-producir",emoji:"🟠",label:"Por producir"};
  }
  return null;
}

// Determina estado de pago según monto abonado vs total
function _estadoPago(q){
  const s=q.status||"enviada";
  // Solo aplica a pedidos/aprobadas/entregados
  if(!["pedido","aprobada","en_produccion","entregado"].includes(s))return null;
  const total=getDocTotal(q);
  if(total<=0)return null;
  const cobrado=typeof totalCobrado==="function"?totalCobrado(q):0;
  const pend=Math.max(0,total-cobrado);
  if(pend===0)return {cls:"pagado",emoji:"💰",label:"Pagado"};
  if(cobrado>0){
    const pct=Math.round((cobrado/total)*100);
    return {cls:"anticipo",emoji:"💵",label:"Anticipo "+pct+"%"};
  }
  return {cls:"sin-anticipo",emoji:"⚠️",label:"Sin anticipo"};
}

// v5.4.3: días desde fecha de entrega (solo si status==entregado).
// Escala de color acordada con Luis:
//   0-1 días → sin color (neutro)
//   2-4 días → amarillo
//   5-14 días → naranja
//   15+ días → rojo
function _diasDesdeEntrega(q){
  if(q.status!=="entregado")return null;
  const fEnt=q.fechaEntrega||q.entregaData?.fecha||q.eventDate;
  if(!fEnt)return null;
  try{
    const hoy=new Date();hoy.setHours(0,0,0,0);
    const ent=new Date(fEnt+"T00:00:00");
    if(isNaN(ent.getTime()))return null;
    const dias=Math.max(0,Math.floor((hoy-ent)/86400000));
    let cls="";
    if(dias<=1)cls="neutro";
    else if(dias<=4)cls="amarillo";
    else if(dias<=14)cls="naranja";
    else cls="rojo";
    return {dias,cls};
  }catch(e){return null}
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
    return '<div class="cal-ev-card '+q.status+'" id="cal-ev-'+p.d+'-'+q.id+'" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')"><div class="cal-ev-date"><div class="d">'+p.d+'</div><div class="m">'+mShort[p.m]+'</div></div><div class="cal-ev-body"><div class="cal-ev-cli">'+(q.client||"—")+typeTag+' <span class="hc-status '+sMeta.cls+'" style="margin-left:4px">'+sMeta.label+'</span></div><div class="cal-ev-meta"><span>'+meta+'</span></div></div></div>';
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
// v6.0.2 · Item 4 — HELPERS UNIFICADOS PARA DRILL-DOWN
// openDashDetail (KPIs del período) y openPipelineDetail (Pipeline Activo)
// comparten ahora el mismo render de filas y el mismo modal. Estos helpers
// eliminan duplicación y garantizan que cualquier mejora futura (item 7
// sort configurable, item 8 badges, etc) se aplique uniformemente a los dos.
// ═══════════════════════════════════════════════════════════

// Helper de fila para el drill-down. tagStyle: 'kpi' (Pedido/Evento) o 'pipe' (Cotización/Propuesta).
// extra: cadena opcional que se concatena al final del meta-row.
function _buildDashDocRow(q,monto,extra,tagStyle){
  const fecha=dateOfCreation(q)||"—";
  const sMeta=STATUS_META[q.status||"enviada"]||STATUS_META.enviada;
  let tag;
  if(tagStyle==="pipe"){
    tag=q.kind==="quote"?'<span class="ui-tag prod">Cotización</span>':'<span class="ui-tag ent">Propuesta</span>';
  }else{
    tag=q.kind==="quote"?'<span class="ui-tag prod">Pedido</span>':'<span class="ui-tag ent">Evento</span>';
  }
  let ecBadge="";
  if(typeof estadoComercial==="function"){
    const ec=estadoComercial(q);
    if(ec&&typeof ESTADO_COMERCIAL_META!=="undefined"&&ESTADO_COMERCIAL_META[ec]){
      const m=ESTADO_COMERCIAL_META[ec];
      ecBadge=' <span class="hc-estado-badge '+m.cls+'">'+m.emoji+' '+m.label+'</span>';
    }
  }
  // Chips rápidos para followables (Viva/Perdida/convertir). Igual que en v6.0.1.
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
      if(q.kind==="quote"&&s==="enviada"){
        chips.push('<button class="dd-chip dd-chip-convert" onclick="event.stopPropagation();closeDashDetail();openOrderModal(\''+q.id+'\',event)" title="Marcar como pedido">🤝 Pedido</button>');
      }else if(q.kind==="proposal"&&(s==="enviada"||s==="propfinal")){
        chips.push('<button class="dd-chip dd-chip-convert" onclick="event.stopPropagation();closeDashDetail();openApproveModal(\''+q.id+'\',\'proposal\',event)" title="Marcar como aprobada">✓ Aprobar</button>');
      }
    }
    quickBtns='<div class="dd-row-chips">'+chips.join("")+'</div>';
  }
  return '<div class="dd-row" onclick="closeDashDetail();openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
    '<div class="dd-row-top"><div class="dd-row-cli">'+tag+h(q.client||"—")+'</div><div class="dd-row-monto">'+fm(monto)+'</div></div>'+
    '<div class="dd-row-meta"><span class="qnum" style="font-size:9px">'+h(q.quoteNumber||q.id)+'</span> · '+fecha+' · <span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span>'+ecBadge+(extra?' · '+extra:'')+'</div>'+
    quickBtns+
  '</div>';
}

// v6.0.2 Item 7: modo de ordenamiento del drill-down. 'monto' (default) o 'antiguedad'.
// Por bucket (key = tipo de drill-down) para que cada uno recuerde su preferencia.
if(typeof _dashDetailSortMode==="undefined")var _dashDetailSortMode={};

function _dashDocDate(q, bucketKey){
  // v6.0.2: para bucket "entregados_con_saldo" usamos fechaEntrega (más viejo = más urgente).
  // Para los demás usamos dateISO (fecha de creación).
  if(bucketKey&&bucketKey.indexOf("pipeline:entregados_con_saldo")===0){
    return q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||q.dateISO||"";
  }
  if(bucketKey==="cobrar"){
    // Misma lógica: por antigüedad de entrega (que es lo que usa el KPI cobrar)
    return q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||q.dateISO||"";
  }
  return q.dateISO||q.createdAtLocal||"";
}

// Cambia el modo de sort y vuelve a renderizar el drill-down actual.
function setDashDetailSort(mode){
  if(!_dashDetailTipoActual)return;
  _dashDetailSortMode[_dashDetailTipoActual]=mode;
  // Re-renderizar el drill-down activo
  if(_dashDetailTipoActual.indexOf("pipeline:")===0){
    openPipelineDetail(_dashDetailTipoActual.slice(9));
  }else{
    openDashDetail(_dashDetailTipoActual);
  }
}

// Renderizador unificado del modal agrupado por cliente.
// opts: {title, rows:[{q,monto,extra}], summaryBuilder, emptyMsg, showSortChip, tipoKey}
// summaryBuilder: función opcional (rows, clientes) => string HTML del resumen custom.
// showSortChip: boolean. Si true, renderiza chip para alternar monto/antigüedad.
// tipoKey: clave del tipo actual para recordar modo de sort (default: _dashDetailTipoActual).
function _renderDashGroupedList(opts){
  const {title, rows, summaryBuilder, emptyMsg, showSortChip, tipoKey}=opts;
  const ttlEl=$("dd-title"),listEl=$("dd-list"),modal=$("dash-detail-modal");
  if(!ttlEl||!listEl||!modal){console.warn("[DashDetail] modal incompleto en DOM");return}
  const keySort=tipoKey||_dashDetailTipoActual||"default";
  const sortMode=_dashDetailSortMode[keySort]||"monto";

  if(!rows.length){
    ttlEl.textContent=title;
    listEl.innerHTML='<div class="dd-summary">0 documentos</div><div class="dd-empty">'+(emptyMsg||"Sin documentos en este corte.")+'</div>';
    modal.classList.remove("hidden");
    return;
  }

  // Agrupar por cliente
  const byClient={};
  rows.forEach(r=>{
    const cli=r.q.client||"(Sin cliente)";
    if(!byClient[cli])byClient[cli]={total:0,items:[]};
    byClient[cli].total+=r.monto;
    byClient[cli].items.push(r);
  });
  const clientes=Object.keys(byClient).map(cli=>({cli,total:byClient[cli].total,items:byClient[cli].items,count:byClient[cli].items.length}));

  // Ordenar clientes y items internamente según modo
  if(sortMode==="antiguedad"){
    // Clientes: por fecha más antigua dentro de ellos (más viejo primero)
    clientes.forEach(c=>{
      c._oldest=c.items.reduce((min,r)=>{
        const d=_dashDocDate(r.q,keySort);
        return (!min||(d&&d<min))?d:min;
      },"");
    });
    clientes.sort((a,b)=>{
      if(!a._oldest&&!b._oldest)return 0;
      if(!a._oldest)return 1;
      if(!b._oldest)return -1;
      return a._oldest.localeCompare(b._oldest);
    });
    clientes.forEach(c=>c.items.sort((a,b)=>{
      const da=_dashDocDate(a.q,keySort),db=_dashDocDate(b.q,keySort);
      if(!da&&!db)return 0;
      if(!da)return 1;
      if(!db)return -1;
      return da.localeCompare(db);
    }));
  }else{
    // monto desc (default)
    clientes.sort((a,b)=>b.total-a.total);
    clientes.forEach(c=>c.items.sort((a,b)=>b.monto-a.monto));
  }

  const html=clientes.map(c=>{
    if(c.count===1){
      return '<div class="dd-group">'+c.items.map(r=>_buildDashDocRow(r.q,r.monto,r.extra,opts.tagStyle||"kpi")).join("")+'</div>';
    }
    const header='<div class="dd-group-header">'+
      '<div class="dgh-cli">'+c.cli+'</div>'+
      '<div class="dgh-meta">'+c.count+' docs</div>'+
      '<div class="dgh-total">'+fm(c.total)+'</div>'+
    '</div>';
    const items=c.items.map(r=>_buildDashDocRow(r.q,r.monto,r.extra,opts.tagStyle||"kpi")).join("");
    return '<div class="dd-group">'+header+items+'</div>';
  }).join("");

  // Summary
  let summary;
  if(typeof summaryBuilder==="function"){
    summary=summaryBuilder(rows,clientes,sortMode);
  }else{
    const totalSum=rows.reduce((s,r)=>s+r.monto,0);
    summary='<div class="dd-summary">Total: <strong>'+fm(totalSum)+'</strong> · '+rows.length+' documento'+(rows.length!==1?'s':'')+' · '+clientes.length+' cliente'+(clientes.length!==1?'s':'')+'</div>';
  }

  // Chip de ordenamiento (item 7)
  let sortChip="";
  if(showSortChip){
    const isAnt=sortMode==="antiguedad";
    sortChip='<div class="dd-sort-bar">'+
      '<button class="dd-sort-chip'+(isAnt?"":" act")+'" onclick="setDashDetailSort(\'monto\')">$ Monto</button>'+
      '<button class="dd-sort-chip'+(isAnt?" act":"")+'" onclick="setDashDetailSort(\'antiguedad\')">⏱ Antigüedad</button>'+
    '</div>';
  }

  ttlEl.textContent=title;
  listEl.innerHTML=summary+sortChip+html;
  modal.classList.remove("hidden");
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
  // v6.0.2: docRow local eliminado. Ahora usamos _buildDashDocRow global (con tagStyle='kpi').
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
      if(inRange(fEnt)&&status==="entregado"){
        const t=getDocTotal(q);totalSum+=t;
        // v6.0: distinguir cumplidas (pagado 100%) vs con saldo
        // v6.0.2: distinguir también cortesías (total=0) con badge propio
        const _cumplido=(typeof isCumplido==="function")&&isCumplido(q);
        const _cortesia=(typeof isCortesia==="function")&&isCortesia(q);
        const _saldoPend=saldoPendiente(q);
        let extraTxt="Entregado: "+fEnt;
        if(_cortesia)extraTxt='<span class="dd-badge-cortesia">🎁 Cortesía</span> · '+extraTxt;
        else if(_cumplido)extraTxt='<span class="dd-badge-cumplido">✅ Cumplida</span> · '+extraTxt;
        else if(_saldoPend>0)extraTxt='<span class="dd-badge-saldo">💰 Saldo '+fm(_saldoPend)+'</span> · '+extraTxt;
        rows.push({q,monto:t,extra:extraTxt});
      }
    });
  }else if(tipo==="cobrar"){
    title="⚠️ Por cobrar · todos los pedidos activos";
    quotesCache.forEach(q=>{
      if(_excluido(q))return;
      const status=q.status||"enviada";
      if(!["pedido","aprobada","en_produccion","entregado"].includes(status))return;
      const pend=saldoPendiente(q);
      if(pend>0){
        totalSum+=pend;
        // v5.4.3: calcular días desde entrega (si ya fue entregado)
        const diasData=_diasDesdeEntrega(q);
        let extraTxt="Cobrado: "+fm(totalCobrado(q))+" / Total: "+fm(getDocTotal(q));
        if(diasData){
          const colorTag=diasData.cls?'<span class="dd-dias-tag '+diasData.cls+'">'+diasData.dias+'d</span>':'<span class="dd-dias-tag neutro">'+diasData.dias+'d</span>';
          extraTxt=colorTag+' desde entrega · '+extraTxt;
        }else if(q.eventDate){
          // No entregado aún: días hasta entrega (si futura) o "entrega vencida" (si pasada sin marcar)
          const todayIso=new Date().toISOString().slice(0,10);
          if(q.eventDate>=todayIso)extraTxt='<span class="dd-dias-tag neutro">Entrega '+q.eventDate+'</span> · '+extraTxt;
          else extraTxt='<span class="dd-dias-tag rojo">⚠️ Entrega '+q.eventDate+' sin cerrar</span> · '+extraTxt;
        }
        rows.push({q,monto:pend,extra:extraTxt,_diasOrden:(diasData?diasData.dias:-1)});
      }
    });
    // v5.4.3: ordenar por días desde entrega desc (más vencidas arriba)
    rows.sort((a,b)=>(b._diasOrden||-9999)-(a._diasOrden||-9999));
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
  // v6.0.2 Item 4: delegamos el render al helper unificado _renderDashGroupedList.
  // Para el tipo "cobrar" pasamos un summaryBuilder custom que incluye el desglose
  // de antigüedad de saldo (item 8). Para los demás tipos usamos el summary default.
  // showSortChip=true para bucket "cobrar" y "entregado" donde el orden por antigüedad aporta.
  const showSortChip=(tipo==="cobrar"||tipo==="entregado");

  let summaryBuilder=null;
  if(tipo==="cobrar"){
    // v6.0.2 Item 8: desglose de antigüedad de saldo
    summaryBuilder=(rows)=>{
      const todayIso=new Date().toISOString().slice(0,10);
      let s1=0,s2=0,s3=0; // 1-3d, 4-14d, +15d (y al día)
      rows.forEach(r=>{
        const q=r.q;
        const fEnt=q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||"";
        if(!fEnt)return;
        const dias=Math.max(0,Math.floor((new Date(todayIso)-new Date(fEnt))/86400000));
        if(dias<=3)s1+=r.monto;
        else if(dias<=14)s2+=r.monto;
        else s3+=r.monto;
      });
      const totalSum=rows.reduce((s,r)=>s+r.monto,0);
      let desglose="";
      if(totalSum>0){
        const parts=[];
        if(s1>0)parts.push('<span class="dd-aging dd-aging-nuevo">0–3d '+fm(s1)+'</span>');
        if(s2>0)parts.push('<span class="dd-aging dd-aging-medio">4–14d '+fm(s2)+'</span>');
        if(s3>0)parts.push('<span class="dd-aging dd-aging-viejo">+15d '+fm(s3)+'</span>');
        if(parts.length)desglose='<div class="dd-aging-bar">'+parts.join(' · ')+'</div>';
      }
      return '<div class="dd-summary">Total: <strong>'+fm(totalSum)+'</strong> · '+rows.length+' documento'+(rows.length!==1?'s':'')+'</div>'+desglose;
    };
  }

  _renderDashGroupedList({
    title,
    rows,
    summaryBuilder,
    emptyMsg:"Sin documentos en este corte.",
    showSortChip,
    tipoKey:tipo,
    tagStyle:"kpi"
  });
}
function closeDashDetail(){$("dash-detail-modal").classList.add("hidden");_dashDetailTipoActual=null}

// ═══════════════════════════════════════════════════════════
// v6.0.2 Item 9: Modal WhatsApp — recordatorio amigable de saldo pendiente
// Se invoca desde el chip 💬 en el drill-down del Pipeline (entregados_con_saldo).
// El mensaje usa tono cercano/tú con saldo y número de pedido, siempre editable
// antes de enviar. Al confirmar, abre wa.me con el mensaje URL-encoded.
// ═══════════════════════════════════════════════════════════
let _waSaldoDoc=null; // {id,kind,q}

function openSaldoWhatsAppModal(docId,kind){
  const q=(typeof quotesCache!=="undefined")?quotesCache.find(x=>x.id===docId&&x.kind===kind):null;
  if(!q){alert("No se encontró el documento.");return}
  const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
  const num=q.quoteNumber||q.id;
  const cli=q.client||"";
  // Template cercano/tú (decidido en v6.0.2):
  const tpl="Hola "+cli+", ¡esperamos estés muy bien! Te escribimos de Gourmet Bites. "+
    "Quedó un saldito de "+fm(saldo)+" pendiente del pedido "+num+". "+
    "¿Nos cuentas cuándo lo podemos coordinar? 🙏";
  _waSaldoDoc={id:docId,kind,q};
  // Prefill — intentar teléfono desde múltiples campos posibles
  const tel=(q.clientPhone||q.tel||q.orderData?.tel||q.approvalData?.tel||"").replace(/\D/g,"");
  const tEl=$("wa-saldo-tel");if(tEl)tEl.value=tel;
  const cEl=$("wa-saldo-cli");if(cEl)cEl.value=cli;
  const mEl=$("wa-saldo-msg");if(mEl)mEl.value=tpl;
  $("wa-saldo-modal").classList.remove("hidden");
}

function closeSaldoWhatsAppModal(){
  $("wa-saldo-modal").classList.add("hidden");
  _waSaldoDoc=null;
}

function sendSaldoWhatsApp(){
  const telRaw=($("wa-saldo-tel").value||"").replace(/\D/g,"");
  const msg=($("wa-saldo-msg").value||"").trim();
  if(!msg){alert("El mensaje no puede estar vacío.");return}
  if(!telRaw){alert("Falta el teléfono del cliente.");return}
  // Normalizar teléfono: si no tiene código de país, asumir Colombia (57)
  let tel=telRaw;
  if(tel.length===10&&!tel.startsWith("57"))tel="57"+tel;
  const url="https://wa.me/"+tel+"?text="+encodeURIComponent(msg);
  window.open(url,"_blank");
  closeSaldoWhatsAppModal();
}

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
      toast("📤 No hay pedidos agendados con fecha futura para compartir. Se agendan al marcar como \"pedido\"/\"aprobada\" y asignar fecha de entrega.","info",7000);
      return;
    }
    futuros.sort((a,b)=>(a.eventDate+(a.horaEntrega||"")).localeCompare(b.eventDate+(b.horaEntrega||"")));
    // Construir el .ics usando helpers existentes
    const lines=[..._icsHeader()];
    futuros.forEach(q=>{lines.push(..._buildVeventsForDoc(q))});
    lines.push(..._icsFooter());
    const filename="Gourmet-Bites-Agenda-"+hoyIso+".ics";
    const resumen=futuros.length+" pedido"+(futuros.length!==1?'s':'')+" · "+futuros.reduce((s,q)=>s+2,0)+" eventos (prod + entrega por pedido)";
    const ok=await confirmModal({
      title:"📤 Sincronizar agenda con Kathy y JP",
      body:"Se va a generar un archivo <strong>.ics</strong> con:<br><strong>"+h(resumen)+"</strong><br><br>Al confirmar:<br>1. Se abre el menú compartir<br>2. Escoges WhatsApp<br>3. Mandas a Kathy y JP<br>4. Abren el archivo → sus calendarios se actualizan (no duplica)",
      okLabel:"Continuar",
      tone:"primary"
    });
    if(!ok)return;
    await shareOrDownloadIcs(filename,lines);
    if(typeof toast==="function")toast("✅ Agenda lista para compartir · "+futuros.length+" pedidos","success");
  }catch(e){
    console.error("syncAgendaAllFuture error",e);
    toast("Error generando agenda: "+(e.message||e),"error");
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
    const ok=await confirmModal({
      title:"📤 Sincronizar pendientes",
      body:"Solo se incluyen los <strong>"+h(resumen)+"</strong> que están pendientes.<br><br>Al confirmar:<br>1. Se abre el menú compartir<br>2. Escoges WhatsApp → mandar a Kathy y JP<br>3. Ellos abren el archivo → calendarios se actualizan",
      okLabel:"Continuar",
      tone:"primary"
    });
    if(!ok)return;
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
    toast("Error: "+(e.message||e),"error");
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
  if(!tareas.length){toast("🎉 No hay fotos base64 para migrar. Todo ya está en Storage.","success",5000);return}
  const ok2=await confirmModal({
    title:"🔄 Migrar fotos a Firebase Storage",
    body:"Voy a subir <strong>"+tareas.length+"</strong> foto(s) a Storage y reemplazar el base64 en Firestore por la URL de descarga.<br><br>• Los docs quedarán mucho más livianos (dashboard más rápido)<br>• Operación segura: si falla una, se salta y continúa<br>• Tiempo estimado: ~1 segundo por foto",
    okLabel:"Continuar",
    tone:"primary"
  });
  if(!ok2)return;

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
  toast("✅ Migración completa · OK: "+ok+" · Saltadas: "+skip+" · Errores: "+err+". Recarga la app para ver dashboard más ligero.","success",8000);
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
  if(!currentUser){toast("🔒 Debes estar autenticado para normalizar docs.","error");return}
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}

  // Detectar docs sin status (undefined, null o string vacío)
  const candidatos=quotesCache.filter(q=>!q.status&&!q._wrongCollection);
  if(!candidatos.length){
    toast("🎉 No hay docs pendientes de normalizar. Todos tienen status correcto.","success",5000);
    return;
  }

  // Preview para Luis: mostrar qué docs se van a tocar y qué status va a recibir cada uno
  const previewHtml=candidatos.map(q=>{
    const nuevoStatus=(q.kind==="proposal"&&q.id&&q.id.startsWith("GB-PF-"))?"propfinal":"enviada";
    return "• "+h(q.quoteNumber||q.id)+" — "+h(q.client||"sin cliente")+" → "+h(nuevoStatus);
  }).join("<br>");

  const ok3=await confirmModal({
    title:"🔧 Normalizar docs sin status",
    body:"Se va a asignar status por tipo a <strong>"+candidatos.length+" doc"+(candidatos.length!==1?"s":"")+"</strong>:<br><br>"+previewHtml+"<br><br>• No se tocan los datos, solo se agrega el campo <code>status</code><br>• Operación segura: cada doc en su propia escritura<br>• Después podrás etiquetarlos Viva/Perdida normalmente",
    okLabel:"Continuar",
    tone:"primary"
  });
  if(!ok3)return;

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
  toast("✅ Normalización completa · OK: "+ok+" · Errores: "+err+". Los docs ahora aparecen en Pipeline, Vivas y Seguimiento.","success",7000);
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
    '<span class="urgent-prod-done" title="Producido '+(q.producedAt||"").slice(0,10)+'">✓ Producido</span>':
    '<button class="urgent-prod-chip" onclick="event.stopPropagation();toggleProduced(\''+q.id+'\',\''+q.kind+'\',event)">🔪 Marcar producido</button>';
  return '<div class="urgent-item" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
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
// v6.0.2:
//   - Item 5: badge de urgencia (puntito rojo) si hay docs >= 7 días sin mover.
//   - Item 6: sub-línea adicional con clientes únicos.
// ═══════════════════════════════════════════════════════════
function renderPipelineActivo(){
  const grid=$("pipeline-grid");
  if(!grid)return;
  if(typeof getPipelineActivo!=="function"){grid.innerHTML='<div style="color:#999;font-size:11px">Pipeline no disponible</div>';return}
  const p=getPipelineActivo();

  // v6.0.2 Item 5 + 6: calcular urgencia y clientes únicos por bucket
  const todayIso=new Date().toISOString().slice(0,10);
  const stats=(bucketDocs,useEntrega)=>{
    const clientes=new Set();
    let urgentes=0,oldestDias=0;
    bucketDocs.forEach(q=>{
      if(q.client)clientes.add(q.client);
      // Para urgencia: cotización y pedidos usan updatedAt, entregados usan fechaEntrega
      let refDate;
      if(useEntrega){
        refDate=q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||"";
      }else{
        refDate=q.updatedAtLocal||q.updatedAtIso||q.dateISO||"";
        if(q.updatedAt?.toDate){try{refDate=q.updatedAt.toDate().toISOString().slice(0,10)}catch(_){}}
        if(refDate&&refDate.length>10)refDate=refDate.slice(0,10);
      }
      if(!refDate)return;
      const dias=Math.max(0,Math.floor((new Date(todayIso)-new Date(refDate))/86400000));
      if(dias>oldestDias)oldestDias=dias;
      if(dias>=7)urgentes++;
    });
    return {cli:clientes.size,urgentes,oldestDias};
  };
  const st1=stats(p.en_cotizacion.docs,false);
  const st2=stats(p.pedidos_confirmados.docs,false);
  const st3=stats(p.entregados_con_saldo.docs,true);

  const urgentBadge=(n,dias)=>n>0?'<span class="pipe-urgent-badge" title="'+n+' doc(s) con más de 7 días · el más viejo: '+dias+'d">🔴 '+n+'</span>':'';
  const cliSub=(n)=>n>0?' · '+n+' cliente'+(n!==1?'s':''):"";

  grid.innerHTML=
    '<div class="pipe-card pc-cot" onclick="openPipelineDetail(\'en_cotizacion\')">'+
      urgentBadge(st1.urgentes,st1.oldestDias)+
      '<div class="pipe-card-lab">🧾 En cotización</div>'+
      '<div class="pipe-card-val">'+fm(p.en_cotizacion.total)+'</div>'+
      '<div class="pipe-card-sub">🟢 '+p.en_cotizacion.count+' viva'+(p.en_cotizacion.count!==1?'s':'')+cliSub(st1.cli)+'</div>'+
    '</div>'+
    '<div class="pipe-card pc-ped" onclick="openPipelineDetail(\'pedidos_confirmados\')">'+
      urgentBadge(st2.urgentes,st2.oldestDias)+
      '<div class="pipe-card-lab">🤝 Pedidos confirmados</div>'+
      '<div class="pipe-card-val">'+fm(p.pedidos_confirmados.total)+'</div>'+
      '<div class="pipe-card-sub">'+p.pedidos_confirmados.count+' por entregar'+cliSub(st2.cli)+'</div>'+
    '</div>'+
    '<div class="pipe-card pc-ent" onclick="openPipelineDetail(\'entregados_con_saldo\')">'+
      urgentBadge(st3.urgentes,st3.oldestDias)+
      '<div class="pipe-card-lab">🎉 Entregados con saldo</div>'+
      '<div class="pipe-card-val">'+fm(p.entregados_con_saldo.total)+'</div>'+
      '<div class="pipe-card-sub">'+p.entregados_con_saldo.count+' por cobrar'+cliSub(st3.cli)+'</div>'+
    '</div>';
}

// Drill-down de los buckets del Pipeline Activo (click en una pipe-card)
// v6.0.1: BUG-014 FIX — antes escribía en $("dash-detail-body") (ID inexistente).
// v6.0.2: Item 4 — delega el render al helper unificado _renderDashGroupedList
// (ya no duplica la lógica de docRow/agrupado/summary con openDashDetail).
// v6.0.2: Item 8 — bucket "entregados_con_saldo" muestra desglose de antigüedad.
// v6.0.2: Item 9 — botón 💬 WhatsApp en cada fila del bucket "entregados_con_saldo".
// v6.0.2: Item 10 — bucket "entregados_con_saldo" ordena por antigüedad por defecto.
function openPipelineDetail(bucket){
  if(typeof getPipelineActivo!=="function")return;
  const p=getPipelineActivo();
  const b=p[bucket];
  if(!b)return;
  const titulos={
    en_cotizacion:"🧾 En cotización (vivos)",
    pedidos_confirmados:"🤝 Pedidos confirmados (por entregar)",
    entregados_con_saldo:"🎉 Entregados con saldo por cobrar"
  };
  const title=titulos[bucket]||"Pipeline";
  const useSaldo=(bucket==="entregados_con_saldo");
  const tipoKey="pipeline:"+bucket;
  _dashDetailTipoActual=tipoKey;

  // v6.0.2 Item 10: bucket "entregados_con_saldo" se inicializa por antigüedad la primera vez
  if(useSaldo&&!_dashDetailSortMode[tipoKey]){
    _dashDetailSortMode[tipoKey]="antiguedad";
  }

  // Construir rows. Para "entregados_con_saldo" agregamos:
  //   - monto = saldo pendiente (no total)
  //   - extra con días desde entrega y chip WhatsApp (item 9)
  //   - _dashDocDate usa fechaEntrega para ordenar (más viejo primero)
  const todayIso=new Date().toISOString().slice(0,10);
  const rows=b.docs.map(q=>{
    const monto=useSaldo?(typeof saldoPendiente==="function"?saldoPendiente(q):0):(getDocTotal(q));
    let extra=null;
    if(useSaldo){
      const cobr=typeof totalCobrado==="function"?totalCobrado(q):0;
      // v6.0.2 Item 8: mostrar días desde entrega con badge de color
      const fEnt=q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||"";
      let diasTag="";
      if(fEnt){
        const dias=Math.max(0,Math.floor((new Date(todayIso)-new Date(fEnt))/86400000));
        let cls="nuevo";
        if(dias>14)cls="viejo";
        else if(dias>3)cls="medio";
        diasTag='<span class="dd-dias-tag '+cls+'">'+dias+'d</span> ';
      }
      // v6.0.2 Item 9: chip WhatsApp
      const waChip=' <span class="dd-inline-wa" onclick="event.stopPropagation();openSaldoWhatsAppModal(\''+q.id+'\',\''+q.kind+'\')" title="Enviar recordatorio por WhatsApp">💬 WhatsApp</span>';
      extra=diasTag+"Cobrado "+fm(cobr)+" / Total "+fm(getDocTotal(q))+waChip;
    }else if(q.eventDate){
      extra="Evento: "+q.eventDate;
    }
    return {q,monto,extra};
  });

  // Summary custom para cada bucket
  const summaryBuilder=(rowsArg,clientes)=>{
    // Bucket 3: entregados_con_saldo → incluir desglose por antigüedad (item 8)
    if(useSaldo){
      let s1=0,s2=0,s3=0;
      rowsArg.forEach(r=>{
        const q=r.q;
        const fEnt=q.fechaEntrega||q.entregaData?.fechaEntrega||q.eventDate||"";
        if(!fEnt)return;
        const dias=Math.max(0,Math.floor((new Date(todayIso)-new Date(fEnt))/86400000));
        if(dias<=3)s1+=r.monto;
        else if(dias<=14)s2+=r.monto;
        else s3+=r.monto;
      });
      let desglose="";
      const parts=[];
      if(s1>0)parts.push('<span class="dd-aging dd-aging-nuevo">0–3d '+fm(s1)+'</span>');
      if(s2>0)parts.push('<span class="dd-aging dd-aging-medio">4–14d '+fm(s2)+'</span>');
      if(s3>0)parts.push('<span class="dd-aging dd-aging-viejo">+15d '+fm(s3)+'</span>');
      if(parts.length)desglose='<div class="dd-aging-bar">'+parts.join(' · ')+'</div>';
      return '<div class="dd-summary">Saldo por cobrar: <strong>'+fm(b.total)+'</strong> · '+b.count+' documento'+(b.count!==1?'s':'')+' · '+clientes.length+' cliente'+(clientes.length!==1?'s':'')+'</div>'+desglose;
    }
    // Otros buckets: summary simple con total
    const montoLbl="Total";
    return '<div class="dd-summary">'+montoLbl+': <strong>'+fm(b.total)+'</strong> · '+b.count+' documento'+(b.count!==1?'s':'')+' · '+clientes.length+' cliente'+(clientes.length!==1?'s':'')+'</div>';
  };

  _renderDashGroupedList({
    title,
    rows,
    summaryBuilder,
    emptyMsg:"No hay documentos en este bucket.",
    showSortChip:true,
    tipoKey,
    tagStyle:"pipe"
  });
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
    return '<div class="cli-view-doc" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
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

// ─── D1.2 · Banner novedades — delta real desde última visita acuse-recibido ──
// Anchor congelado por sesión-dash: se captura UNA vez con getLastVisit() al primer
// render y persiste hasta dismiss explícito. saveLastVisit() solo se llama en dismiss
// (Q1.A confirmado por Luis: "lo nuevo desde la última vez que ack'easte, no desde
// el render anterior"). Si renderDashboard re-corre durante la sesión, el banner
// sigue mostrando el mismo delta acumulado vs el anchor.
let _dashVisitAnchor=null;
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
  if(_dashVisitAnchor===null)_dashVisitAnchor=getLastVisit();
  const last=_dashVisitAnchor;
  if(!last)return; // primera visita, no hay con qué comparar
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
  const desdeStr=desde.toLocaleString("es-CO",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
  el.classList.remove("hidden");
  el.innerHTML=
    '<svg class="news-banner__icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
      '<path d="M14 6a5 5 0 00-10 0v3l-1.5 3h13L14 9V6z"/>'+
      '<path d="M7 14a2 2 0 004 0"/>'+
    '</svg>'+
    '<div class="news-banner__body">'+
      '<strong>'+partes.join(" · ")+'</strong>'+
      '<span class="since">desde tu última visita el '+desdeStr+'</span>'+
    '</div>'+
    '<button class="news-banner__close" onclick="dismissNovedades(event)" aria-label="Descartar">'+
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8"/></svg>'+
    '</button>';
}
function dismissNovedades(ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  const el=$("dash-banner-novedades");
  saveLastVisit();
  _dashVisitAnchor=null; // próximo render releerá el nuevo anchor (=ahora) → sin novedades
  if(!el){return}
  el.style.transition="opacity 200ms, transform 200ms, max-height 300ms 200ms, margin 300ms 200ms, padding 300ms 200ms, border 300ms 200ms";
  el.style.opacity="0";
  el.style.transform="translateY(-4px)";
  setTimeout(()=>{
    el.style.maxHeight="0";
    el.style.margin="0";
    el.style.padding="0";
    el.style.border="none";
    setTimeout(()=>{
      el.classList.add("hidden");
      el.removeAttribute("style"); // limpia para próximo render
    },320);
  },200);
}

// ═══════════════════════════════════════════════════════════════════
// v6.2.0 · HOJA DE ENTREGAS DEL DÍA (E2-1)
// ═══════════════════════════════════════════════════════════════════
// Genera un PDF físico firmable que reemplaza la hoja Word manual que
// Kathy/JP usan hoy cuando entregan. El cliente firma directo sobre el
// papel. Si entrega tercero, Luis imprime doble (OK con savePdf → share).
//
// Flujo:
//   1. Usuario pulsa 🖨️ "Imprimir hoja del día" en dashboard
//   2. Se abre modal selector: rango fechas (default hoy-hoy) + toggle
//      "Solo pendientes" (default ON)
//   3. Al confirmar → genera PDF con tabla de 7 columnas + 5 filas vacías
//      al final para entregas no planificadas del día
//   4. savePdf dispara share sheet (móvil) o descarga (desktop)
//
// Campos usados (todos ya en schema actual):
//   q.eventDate/q.fechaEntrega · q.horaEntrega · q.client · q.dir · q.city
//   q.cart · q.cust · q.status · helpers isCumplido/totalCobrado/saldoPendiente
// ═══════════════════════════════════════════════════════════════════

// Helper: formatea fecha ISO "2026-04-24" → "24 ABR 2026" (formato hoja física)
function hojaFormatFecha(iso){
  if(!iso)return "—";
  const parts=iso.slice(0,10).split("-");
  if(parts.length!==3)return iso;
  const meses=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const m=parseInt(parts[1],10);
  if(isNaN(m)||m<1||m>12)return iso;
  return parts[2]+" "+meses[m-1]+" "+parts[0];
}

// Helper: construye la celda "PRODUCTOS A ENTREGAR" con bullets
// Combina q.cart (catálogo) + q.cust (custom). Máx. ~120 chars por línea
// para que autoTable no se vuelva loco con celdas gigantes.
function hojaProductosCelda(q){
  const items=[];
  (q.cart||[]).forEach(i=>{
    const qty=i.qty||1;
    const name=(i.n||i.name||"—").trim();
    const detail=i.d?" ("+i.d.trim()+")":"";
    items.push("• "+qty+" "+name+detail);
  });
  (q.cust||[]).forEach(i=>{
    const qty=i.qty||1;
    const name=(i.n||i.name||"—").trim();
    const detail=i.d?" ("+i.d.trim()+")":"";
    items.push("• "+qty+" "+name+detail);
  });
  return items.length?items.join("\n"):"—";
}

// Helper: construye la celda "NOTAS PAGO"
// CANCELADO si está cumplido (pagado 100% o cortesía con total=0)
// Sino "SALDO $XXX" con el saldo pendiente formateado
function hojaNotasPago(q){
  if(typeof isCumplido==="function"&&isCumplido(q))return "CANCELADO";
  const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||q.totalReal||0);
  const cobrado=(typeof totalCobrado==="function")?totalCobrado(q):0;
  if(total>0&&cobrado>=total)return "CANCELADO";
  const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):Math.max(0,total-cobrado);
  if(saldo<=0&&total===0)return "CORTESÍA";
  return "SALDO "+fm(saldo);
}

// Helper: construye la celda "DIRECCIÓN" combinando dir + city
function hojaDireccionCelda(q){
  const dir=(q.dir||"").trim();
  const city=(q.city||"").trim();
  if(dir&&city)return dir+"\n"+city;
  if(dir)return dir;
  if(city)return city;
  return "—";
}

// Filtro principal: selecciona docs según rango y toggle
function hojaFiltrarDocs(fromDate,toDate,soloPendientes){
  const docs=[];
  (quotesCache||[]).forEach(q=>{
    if(q._wrongCollection)return;
    const fecha=q.eventDate||q.fechaEntrega;
    if(!fecha)return;
    const fIso=fecha.slice(0,10);
    if(fIso<fromDate||fIso>toDate)return;
    const st=q.status||"enviada";
    // Excluir siempre: anulada/superseded/convertida (no entregables)
    if(["anulada","superseded","convertida"].includes(st))return;
    if(soloPendientes){
      // Solo pendientes de entrega: pedido, aprobada, en_produccion
      if(!["pedido","aprobada","en_produccion"].includes(st))return;
    }else{
      // Incluye también entregados del rango (para reimprimir si se perdió)
      if(!["pedido","aprobada","en_produccion","entregado"].includes(st))return;
    }
    docs.push(q);
  });
  // Orden: por horaEntrega asc, fallback alfabético por cliente
  docs.sort((a,b)=>{
    const ha=(a.horaEntrega||"zz").toString();
    const hb=(b.horaEntrega||"zz").toString();
    if(ha!==hb)return ha.localeCompare(hb);
    const ca=(a.client||"").toString().toLowerCase();
    const cb=(b.client||"").toString().toLowerCase();
    return ca.localeCompare(cb);
  });
  return docs;
}

// Abre el modal selector desde el botón del dashboard
function openHojaEntregasModal(){
  const modal=$("hoja-entregas-modal");
  if(!modal){if(typeof toast==="function")toast("Error: modal no disponible","error");return}
  // Defaults: hoy-hoy, toggle ON
  const hoy=new Date().toISOString().slice(0,10);
  const fromInput=$("he-from");
  const toInput=$("he-to");
  const soloInput=$("he-solo-pendientes");
  if(fromInput)fromInput.value=hoy;
  if(toInput)toInput.value=hoy;
  if(soloInput)soloInput.checked=true;
  // v6.4.0 P5: arranca con "Hoy" activo y campos colapsados
  if(typeof heQuickRange==="function")heQuickRange("hoy",true);
  modal.classList.remove("hidden");
}

// v6.4.0 P5: aplica un preset rápido al rango de fechas.
// Modos: 'hoy' | 'manana' | '3dias' | 'rango'.
// 'rango' = revela los inputs Desde/Hasta para edición manual.
// Los demás modos los rellenan automáticamente y los ocultan visualmente
// (siguen accesibles, solo se reduce el ruido visual en móvil).
function heQuickRange(modo,silent){
  const hoy=new Date();
  const isoOf=(d)=>{
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
    return y+"-"+m+"-"+dd;
  };
  const addDays=(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r};
  const fromInput=$("he-from"),toInput=$("he-to");
  if(!fromInput||!toInput)return;
  let f=isoOf(hoy),t=isoOf(hoy);
  if(modo==="hoy"){f=isoOf(hoy);t=isoOf(hoy)}
  else if(modo==="manana"){const m=addDays(hoy,1);f=isoOf(m);t=isoOf(m)}
  else if(modo==="3dias"){f=isoOf(hoy);t=isoOf(addDays(hoy,3))}
  else if(modo==="rango"){/* mantener valores actuales */}
  if(modo!=="rango"){fromInput.value=f;toInput.value=t}
  // Estilo visual del botón activo
  document.querySelectorAll(".he-quick-btn").forEach(b=>{
    const activo=b.dataset.heRange===modo;
    b.style.background=activo?"#455A64":"#fff";
    b.style.color=activo?"#fff":"#455A64";
  });
  // Mostrar/ocultar inputs Desde/Hasta. En modo rango se revelan; en otros, se compactan.
  const fromWrap=fromInput.closest(".mf-field");
  const toWrap=toInput.closest(".mf-field");
  if(fromWrap)fromWrap.style.display=(modo==="rango")?"":"none";
  if(toWrap)toWrap.style.display=(modo==="rango")?"":"none";
  if(!silent&&typeof toast==="function"){
    const lbl=modo==="hoy"?"📅 Hoy":modo==="manana"?"🌅 Mañana":modo==="3dias"?"📆 Próximos 3 días":"⚙️ Rango personalizado";
    toast(lbl+" · "+f+(f!==t?" → "+t:""),"info",2200);
  }
}

function closeHojaEntregasModal(){
  const modal=$("hoja-entregas-modal");
  if(modal)modal.classList.add("hidden");
}

// Handler del botón "Generar" del modal
async function confirmarGenerarHojaEntregas(){
  const from=($("he-from")||{}).value||"";
  const to=($("he-to")||{}).value||"";
  const solo=($("he-solo-pendientes")||{}).checked;
  if(!from||!to){
    if(typeof toast==="function")toast("Selecciona ambas fechas","warn");
    else toast("Selecciona ambas fechas","warn");
    return;
  }
  if(from>to){
    if(typeof toast==="function")toast("La fecha 'desde' debe ser anterior o igual a 'hasta'","warn");
    else toast("La fecha 'desde' debe ser anterior o igual a 'hasta'","warn");
    return;
  }
  closeHojaEntregasModal();
  await generarHojaEntregas(from,to,solo);
}

// Función principal: genera el PDF
async function generarHojaEntregas(fromDate,toDate,soloPendientes){
  // Verifica jsPDF disponible
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    else toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=hojaFiltrarDocs(fromDate,toDate,soloPendientes);
  if(!docs.length){
    const msg=soloPendientes?
      "Sin entregas pendientes en el rango seleccionado":
      "Sin entregas en el rango seleccionado";
    if(typeof toast==="function")toast(msg,"warn",4000);
    else toast(msg,"info",5000);
    return;
  }

  if(typeof showLoader==="function")showLoader("Generando hoja...");

  try{
    const {jsPDF}=window.jspdf;
    // Landscape (horizontal) carta: más ancho para 7 columnas
    const doc=new jsPDF("l","mm","letter");
    const W=279.4,H=215.9,mg=10;

    // ─── Header: logo centrado ───
    try{
      const li=new Image();li.src=LOGO_IW;
      // Logo más pequeño en landscape para dejar sitio a la tabla
      doc.addImage(li,"JPEG",(W-50)/2,4,50,50*(272/500));
    }catch(e){console.warn("Logo no agregado:",e)}

    let y=4+50*(272/500)+2;
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.4);
    doc.line(mg+20,y,W-mg-20,y);

    // Título
    y+=5;
    doc.setFont("helvetica","bold");doc.setFontSize(12);
    doc.setTextColor(26,26,26);
    const rangoTxt=(fromDate===toDate)?
      hojaFormatFecha(fromDate):
      hojaFormatFecha(fromDate)+" → "+hojaFormatFecha(toDate);
    doc.text("HOJA DE ENTREGAS — "+rangoTxt,W/2,y,{align:"center"});

    // Subtítulo con conteo + filtro aplicado
    y+=5;
    doc.setFontSize(8.5);doc.setFont("helvetica","normal");
    doc.setTextColor(100,100,100);
    const filtroTxt=soloPendientes?"Solo pendientes":"Pendientes + entregados";
    doc.text(docs.length+" entrega"+(docs.length!==1?"s":"")+" · "+filtroTxt,W/2,y,{align:"center"});
    doc.setTextColor(26,26,26);

    y+=4;

    // ─── Construcción del body de la tabla ───
    const body=docs.map(q=>[
      hojaFormatFecha(q.eventDate||q.fechaEntrega)+(q.horaEntrega?"\n"+q.horaEntrega:""),
      (q.client||"—").toString().toUpperCase(),
      hojaProductosCelda(q),
      hojaDireccionCelda(q),
      "",  // RECIBE — vacío para que firmen
      hojaNotasPago(q),
      ""   // FIRMA — vacío para firma del cliente
    ]);

    // 5 filas vacías al final para entregas no planificadas del día
    for(let i=0;i<5;i++){
      body.push(["","","","","","",""]);
    }

    // ─── Tabla ───
    const tw=W-mg*2;
    // Anchos relativos de las 7 columnas (suman 100)
    // FECHA: 10 · CLIENTE: 15 · PRODUCTOS: 27 · DIRECCIÓN: 17 · RECIBE: 10 · NOTAS: 11 · FIRMA: 10
    doc.autoTable({
      startY:y,
      margin:{left:mg,right:mg},
      head:[["FECHA","CLIENTE","PRODUCTOS A ENTREGAR","DIRECCIÓN","RECIBE","NOTAS PAGO","FIRMA"]],
      body:body,
      theme:"grid",
      headStyles:{
        fillColor:[26,26,26],textColor:255,fontStyle:"bold",
        fontSize:8,halign:"center",valign:"middle",cellPadding:2.5
      },
      bodyStyles:{
        fontSize:7.5,cellPadding:2,valign:"top",
        minCellHeight:16 // altura mínima cómoda para firmar
      },
      alternateRowStyles:{fillColor:[250,250,248]},
      columnStyles:{
        0:{halign:"center",cellWidth:tw*0.10,fontStyle:"bold"},
        1:{halign:"left",cellWidth:tw*0.15,fontStyle:"bold"},
        2:{halign:"left",cellWidth:tw*0.27},
        3:{halign:"left",cellWidth:tw*0.17},
        4:{halign:"center",cellWidth:tw*0.10},
        5:{halign:"center",cellWidth:tw*0.11,fontStyle:"bold"},
        6:{halign:"center",cellWidth:tw*0.10}
      },
      didParseCell:function(data){
        // Colorea celda NOTAS PAGO según contenido
        if(data.section==="body"&&data.column.index===5){
          const txt=(data.cell.raw||"").toString();
          if(txt==="CANCELADO"||txt==="CORTESÍA"){
            data.cell.styles.textColor=[46,125,50]; // verde
          }else if(txt.indexOf("SALDO")===0){
            data.cell.styles.textColor=[198,40,40]; // rojo
          }
        }
      }
    });

    // Footer con página
    const pageCount=doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      doc.setFontSize(7);doc.setTextColor(120,120,120);
      doc.text("Gourmet Bites by Andrade Matuk · Generado "+new Date().toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"})+" · Página "+i+" de "+pageCount,
        W/2,H-5,{align:"center"});
    }

    // Nombre del archivo
    const filename="HojaEntregas_"+fromDate+(fromDate===toDate?"":"_a_"+toDate)+".pdf";

    if(typeof hideLoader==="function")hideLoader();

    // Reusa savePdf (Web Share API en móvil, doc.save en desktop)
    await savePdf(doc,filename);

    if(typeof toast==="function")toast("Hoja generada ("+docs.length+" entrega"+(docs.length!==1?"s":"")+")","ok",3500);
  }catch(e){
    console.error("[generarHojaEntregas] error:",e);
    if(typeof hideLoader==="function")hideLoader();
    if(typeof toast==="function")toast("Error al generar la hoja: "+(e.message||e),"error",5000);
    else toast("Error al generar la hoja: "+(e.message||e),"error");
  }
}

// ═══════════════════════════════════════════════════════════
// OPERACIONES — Vista lifecycle (v7.1 B1)
// ═══════════════════════════════════════════════════════════
let opsTab="por_producir";
function setOpsTab(t){opsTab=t;renderOps()}

async function renderOps(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const el=$("ops-list");if(!el)return;
  const statusOps={quote:["pedido","en_produccion"],proposal:["aprobada","en_produccion"]};
  const live=quotesCache.filter(q=>{
    if(q._wrongCollection||q.status==="superseded"||q.status==="anulada")return false;
    if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida")return false;
    const ok=(statusOps[q.kind]||[]).includes(q.status);
    return ok;
  });
  const porProducir=live.filter(q=>!q.produced&&q.status!=="en_produccion");
  const enProduccion=live.filter(q=>q.status==="en_produccion"&&!q.produced);
  const listos=live.filter(q=>q.produced&&q.status!=="entregado");

  ["por_producir","en_produccion","listos","todos"].forEach(t=>{
    const tab=$("ops-tab-"+t);if(tab)tab.classList.toggle("act",t===opsTab);
  });

  let docs;
  if(opsTab==="por_producir")docs=porProducir;
  else if(opsTab==="en_produccion")docs=enProduccion;
  else if(opsTab==="listos")docs=listos;
  else docs=live;

  $("ops-count").textContent=docs.length+" documento"+(docs.length!==1?"s":"");

  if(!docs.length){
    el.innerHTML='<div style="text-align:center;padding:40px 20px;color:#aaa"><div style="font-size:32px;margin-bottom:8px">'+(opsTab==="listos"?"📦":"🍳")+'</div>No hay documentos en este estado</div>';
    return;
  }

  docs.sort((a,b)=>(a.eventDate||"9").localeCompare(b.eventDate||"9"));
  const todayIso=new Date().toISOString().slice(0,10);

  el.innerHTML=docs.map(q=>{
    const cli=q.client||"—";
    const num=q.quoteNumber||q.id;
    const tot=typeof fm==="function"?fm(q.total||0):"$"+(q.total||0);
    const fecha=q.eventDate||"Sin fecha";
    const hora=q.horaEntrega?" "+q.horaEntrega:"";
    const prod=q.productionDate||"";
    const isUrgent=q.eventDate&&q.eventDate<=todayIso;
    const urgBorder=isUrgent?"border-left:4px solid #C62828;":"";
    const statusLabel=STATUS_META[q.status]?.label||q.status;
    const kindLabel=q.kind==="quote"?"Cotización":"Propuesta";
    const prodBadge=q.produced?'<span style="background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;border-radius:6px;padding:1px 6px;font-size:10px">✅ Producido</span>':'<span style="background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:6px;padding:1px 6px;font-size:10px">⚠️ Sin producir</span>';

    let actions='';
    if(!q.produced&&q.status!=="en_produccion")actions+='<button class="btn" style="font-size:11px;padding:3px 8px;background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:6px" onclick="event.stopPropagation();markAsInProduction(\''+q.id+'\',\''+q.kind+'\',event)">🔥 Iniciar</button>';
    if(!q.produced)actions+='<button class="btn" style="font-size:11px;padding:3px 8px;background:white;border:1px solid #ccc;border-radius:6px" onclick="event.stopPropagation();toggleProduced(\''+q.id+'\',\''+q.kind+'\',event)">🔪 Producido</button>';
    if(q.produced)actions+='<button class="btn" style="font-size:11px;padding:3px 8px;background:#E3F2FD;color:#1565C0;border:1px solid #90CAF9;border-radius:6px" onclick="event.stopPropagation();openDeliveryModal(\''+q.id+'\',\''+q.kind+'\',event)">🎉 Entregar</button>';

    return '<div style="background:white;border:1px solid #e0e0e0;border-radius:10px;padding:12px;margin-bottom:8px;cursor:pointer;'+urgBorder+'" onclick="openPreview(\''+q.id+'\',\''+q.kind+'\')">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">'+
        '<div style="font-weight:700;font-size:14px">'+h(cli)+'</div>'+
        '<div style="font-size:11px;color:#888">'+kindLabel+' · '+num+'</div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">'+
        '<span style="font-size:12px">📅 '+fecha+hora+'</span>'+
        (prod?'<span style="font-size:11px;color:#888">🏭 Prod: '+prod+'</span>':'')+
        '<span style="font-size:12px;font-weight:600">'+tot+'</span>'+
        prodBadge+
        '<span style="font-size:10px;background:#f5f5f5;padding:1px 6px;border-radius:4px">'+statusLabel+'</span>'+
      '</div>'+
      (actions?'<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'+actions+'</div>':'')+
    '</div>';
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// CARTERA — Cobros / pagos pendientes (v7.2)
// F2-F4: filtrado por saldo + agrupación por urgencia + modal pago
// ═══════════════════════════════════════════════════════════

// Mapeo de status validos por kind (mismos que habilitan boton "Registrar pago"
// en Historico — coherencia con app-historial.js:479).
const CARTERA_VALID_STATUS = {
  quote:    ["pedido","en_produccion","entregado"],
  proposal: ["aprobada","en_produccion","entregado"]
};

function carteraGetFecha(q){
  return q.eventDate || (q.orderData||{}).fechaEntrega || (q.approvalData||{}).fechaEntrega || "";
}

function carteraUrgencia(q,today,weekEnd){
  const fecha=carteraGetFecha(q);
  if(!fecha)return "sin_fecha";
  // Vencido si: status entregado con saldo, O fecha pasada
  const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
  if(q.status==="entregado"&&saldo>0)return "vencido";
  const f=new Date(fecha+"T00:00:00");
  if(isNaN(f))return "sin_fecha";
  if(f<today)return "vencido";
  if(f<=weekEnd)return "esta_semana";
  return "proximas";
}

// ─── v7.5: Modal "Recaudo por metodo" en Cartera ────────────
// Migrado del Dashboard. Ahora vive como boton en el header de Cartera.

function _carteraCalcularRecaudo(desde,hasta){
  // Devuelve {recaudoMet, total} para pagos en el rango.
  const recaudoMet={};
  if(typeof METODOS_PAGO!=="undefined")METODOS_PAGO.forEach(m=>recaudoMet[m]=0);
  let total=0;
  if(!Array.isArray(quotesCache))return {recaudoMet,total};
  const inRange=f=>f&&f>=desde&&f<=hasta;
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    const pagos=(typeof getPagos==="function")?getPagos(q):(q.pagos||[]);
    pagos.forEach(p=>{
      if(!inRange(p.fecha))return;
      const m=(typeof METODOS_PAGO!=="undefined"&&METODOS_PAGO.includes(p.metodo))?p.metodo:"Otro";
      const monto=parseInt(p.monto)||0;
      if(recaudoMet[m]===undefined)recaudoMet[m]=0;
      recaudoMet[m]+=monto;
      total+=monto;
    });
  });
  return {recaudoMet,total};
}

function _primeroDelMes(){
  const t=new Date();return new Date(t.getFullYear(),t.getMonth(),1).toISOString().slice(0,10);
}
function _hoy(){return new Date().toISOString().slice(0,10)}

function openRecaudoMetodoModal(){
  const m=$("recaudo-metodo-modal");
  if(!m)return;
  // Defaults: primero del mes actual hasta hoy
  const desdeEl=$("rec-met-desde"),hastaEl=$("rec-met-hasta");
  if(desdeEl&&!desdeEl.value)desdeEl.value=_primeroDelMes();
  if(hastaEl&&!hastaEl.value)hastaEl.value=_hoy();
  m.classList.remove("hidden");
  renderRecaudoMetodoModalContent();
}
function closeRecaudoMetodoModal(){
  const m=$("recaudo-metodo-modal");
  if(m)m.classList.add("hidden");
}

function renderRecaudoMetodoModalContent(){
  const desde=$("rec-met-desde")?.value;
  const hasta=$("rec-met-hasta")?.value;
  const el=$("rec-met-content");
  if(!el)return;
  if(!desde||!hasta){el.innerHTML='<div class="dash-met-empty">Elegí rango de fechas</div>';return}
  if(desde>hasta){el.innerHTML='<div class="dash-met-empty" style="color:#C62828">Fecha desde es posterior a hasta</div>';return}

  const {recaudoMet,total}=_carteraCalcularRecaudo(desde,hasta);
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  if(total===0){
    el.innerHTML='<div style="padding:20px;text-align:center;color:#888;font-size:13px;background:#FAFAFA;border-radius:6px">Sin pagos registrados en el rango '+desde+' → '+hasta+'.</div>';
    return;
  }
  const maxMet=Math.max(...Object.values(recaudoMet),1);
  const metodos=(typeof METODOS_PAGO!=="undefined")?METODOS_PAGO:Object.keys(recaudoMet);
  // Filtrar solo metodos con monto > 0 para no mostrar filas vacias
  const metodosConMonto=metodos.filter(m=>(recaudoMet[m]||0)>0);
  const rows=metodosConMonto.map(m=>{
    const v=recaudoMet[m]||0;
    const pct=Math.round(v*100/maxMet);
    const pctTotal=total>0?Math.round(v*100/total):0;
    return '<div style="display:grid;grid-template-columns:140px 1fr 130px;gap:10px;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid #f0f0f0">'+
      '<div style="font-weight:600;color:#333">'+m+'</div>'+
      '<div style="background:#E8F5E9;border-radius:4px;height:16px;overflow:hidden"><div style="background:#1B5E20;height:100%;width:'+pct+'%;transition:width .3s"></div></div>'+
      '<div style="text-align:right;font-weight:600;color:#1B5E20">'+fmt(v)+' <span style="color:#888;font-weight:400;font-size:11px">('+pctTotal+'%)</span></div>'+
    '</div>';
  }).join("");
  el.innerHTML=
    '<div style="background:#E8F5E9;border-left:3px solid #1B5E20;padding:10px 14px;margin-bottom:14px;border-radius:6px;font-size:13px">'+
      '<strong>Total recaudado:</strong> '+fmt(total)+'  ·  '+desde+' → '+hasta+
    '</div>'+
    '<div style="background:white;border:1px solid #e0e0e0;border-radius:6px;padding:8px 14px">'+rows+'</div>';
}

window.openRecaudoMetodoModal=openRecaudoMetodoModal;
window.closeRecaudoMetodoModal=closeRecaudoMetodoModal;
window.renderRecaudoMetodoModalContent=renderRecaudoMetodoModalContent;

async function renderCartera(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const summaryEl=$("cartera-summary");
  const listEl=$("cartera-list");
  if(!listEl)return;

  // F2: filtrar docs con saldo > 0 en estados validos
  const docs=quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida")return false;
    if(!(CARTERA_VALID_STATUS[q.kind]||[]).includes(q.status))return false;
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    return saldo>0;
  });

  // F3: agrupar por urgencia
  const today=new Date();today.setHours(0,0,0,0);
  const weekEnd=new Date(today);weekEnd.setDate(weekEnd.getDate()+7);
  const grupos={vencido:[],esta_semana:[],proximas:[],sin_fecha:[]};
  docs.forEach(q=>grupos[carteraUrgencia(q,today,weekEnd)].push(q));
  // Ordenar dentro de cada grupo: fecha vieja primero, vacios al final
  Object.values(grupos).forEach(arr=>arr.sort((a,b)=>{
    const fa=carteraGetFecha(a),fb=carteraGetFecha(b);
    if(!fa&&!fb)return 0;
    if(!fa)return 1;
    if(!fb)return -1;
    return fa.localeCompare(fb);
  }));

  // Resumen header
  const totalSaldo=docs.reduce((s,q)=>s+saldoPendiente(q),0);
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  if(summaryEl){
    summaryEl.textContent=docs.length?(docs.length+" docs · saldo "+fmt(totalSaldo)):"";
  }

  // Estado vacio
  if(!docs.length){
    listEl.innerHTML='<div style="padding:48px 20px;text-align:center;color:#888;font-size:14px">'+
      '<div style="font-size:48px;margin-bottom:12px">✨</div>'+
      '<div style="font-weight:700;color:#555;margin-bottom:6px">Sin saldos pendientes</div>'+
      '<div style="font-size:12px">Todos los docs vivos estan cobrados al dia.</div>'+
      '</div>';
    return;
  }

  // Render por grupo
  const labels={vencido:"🔴 Vencidos",esta_semana:"🟡 Esta semana",proximas:"🟢 Proximas",sin_fecha:"⚪ Sin fecha asignada"};
  const colors={vencido:"#C62828",esta_semana:"#E65100",proximas:"#1B5E20",sin_fecha:"#757575"};
  let html="";
  ["vencido","esta_semana","proximas","sin_fecha"].forEach(g=>{
    const arr=grupos[g];
    if(!arr.length)return;
    const subtotal=arr.reduce((s,q)=>s+saldoPendiente(q),0);
    html+='<div style="margin-bottom:18px">'+
      '<div style="font-weight:700;font-size:13px;color:'+colors[g]+';margin:8px 4px 6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'+
        '<span>'+labels[g]+' ('+arr.length+')</span>'+
        '<span style="font-size:11px;font-weight:600">'+fmt(subtotal)+'</span>'+
      '</div>'+
      arr.map(q=>renderCarteraCard(q,g)).join("")+
      '</div>';
  });
  listEl.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════
// REPORTES — Excel + PDFs imprimibles (v7.3)
// F2: selector de fecha + filtros + preview de docs en pantalla.
// F3 generara Excel con SheetJS desde el mismo dataset.
// ═══════════════════════════════════════════════════════════

let reportesTab="excel";
let reportesFiltros={
  desde: "",
  hasta: "",
  estado: "pendientes" // todos | pendientes | entregados
};
let reportesResultado=null; // Cache del ultimo resultado generado

function setReportesTab(t){
  if(t!=="excel"&&t!=="imprimibles")return;
  reportesTab=t;
  renderReportes();
}

// Helpers fecha
function _reportesHoy(){return new Date().toISOString().slice(0,10)}
function _reportesHoyMas(d){const t=new Date();t.setDate(t.getDate()+d);return t.toISOString().slice(0,10)}

function _reportesGetFecha(q){
  return q.eventDate||(q.orderData||{}).fechaEntrega||(q.approvalData||{}).fechaEntrega||"";
}

// Estados validos para "vendido" (compromiso real)
const REPORTES_VENDIDO_STATUS={
  quote:    ["pedido","en_produccion","entregado"],
  proposal: ["aprobada","en_produccion","entregado"]
};

async function renderReportes(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const summaryEl=$("reportes-summary");
  const contentEl=$("reportes-content");
  if(!contentEl)return;

  ["excel","imprimibles"].forEach(t=>{
    const tab=$("reportes-tab-"+t);
    if(tab)tab.classList.toggle("act",t===reportesTab);
  });

  if(summaryEl)summaryEl.textContent="";

  if(reportesTab==="excel"){
    // Defaults: hoy → +30 dias, pendientes
    if(!reportesFiltros.desde)reportesFiltros.desde=_reportesHoy();
    if(!reportesFiltros.hasta)reportesFiltros.hasta=_reportesHoyMas(30);

    contentEl.innerHTML=
      '<div style="background:#F5F5F5;border-radius:10px;padding:14px 16px;margin-bottom:14px">'+
        '<div style="font-weight:700;font-size:13px;color:#0D47A1;margin-bottom:10px">Filtros (cambian aplican automáticamente)</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'+
          '<div>'+
            '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha desde</label>'+
            '<input type="date" id="rep-desde" value="'+reportesFiltros.desde+'" onchange="generarReporte()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
          '</div>'+
          '<div>'+
            '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha hasta</label>'+
            '<input type="date" id="rep-hasta" value="'+reportesFiltros.hasta+'" onchange="generarReporte()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
          '</div>'+
        '</div>'+
        '<div style="margin-bottom:12px">'+
          '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Estado</label>'+
          '<select id="rep-estado" onchange="generarReporte()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
            '<option value="todos"'+(reportesFiltros.estado==="todos"?" selected":"")+'>Todos (vendidos)</option>'+
            '<option value="pendientes"'+(reportesFiltros.estado==="pendientes"?" selected":"")+'>Solo pendientes de entregar</option>'+
            '<option value="entregados"'+(reportesFiltros.estado==="entregados"?" selected":"")+'>Solo entregados</option>'+
          '</select>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button class="btn" style="background:#1B5E20;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px" onclick="descargarExcel()" id="rep-btn-excel" disabled style="opacity:.5">📥 Descargar Excel</button>'+
        '</div>'+
      '</div>'+
      '<div id="rep-resultado"></div>';

    // Auto-generar al entrar
    setTimeout(()=>generarReporte(),50);
  }else if(reportesTab==="imprimibles"){
    renderReportesImprimibles(contentEl);
  }
}

// ─── F4: Tab Imprimibles ─────────────────────────────────────

// Flag para PDF D: si true, incluye entregados ademas de pendientes
let reportesIncluirEntregados=false;

function renderReportesImprimibles(contentEl){
  if(!reportesFiltros.desde)reportesFiltros.desde=_reportesHoy();
  if(!reportesFiltros.hasta)reportesFiltros.hasta=_reportesHoyMas(7);

  contentEl.innerHTML=
    '<div style="background:#F5F5F5;border-radius:10px;padding:14px 16px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:13px;color:#0D47A1;margin-bottom:10px">Rango de fechas (entrega)</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div>'+
          '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha desde</label>'+
          '<input type="date" id="rep-imp-desde" value="'+reportesFiltros.desde+'" onchange="reportesFiltros.desde=this.value;renderReportesImprimiblesPreview()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
        '</div>'+
        '<div>'+
          '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha hasta</label>'+
          '<input type="date" id="rep-imp-hasta" value="'+reportesFiltros.hasta+'" onchange="reportesFiltros.hasta=this.value;renderReportesImprimiblesPreview()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
        '</div>'+
      '</div>'+
      '<label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11.5px;color:#555;cursor:pointer">'+
        '<input type="checkbox" id="rep-imp-include-entregados"'+(reportesIncluirEntregados?' checked':'')+' onchange="reportesIncluirEntregados=this.checked;renderReportesImprimiblesPreview()">'+
        '<span><strong>Hoja de entregas (PDF D):</strong> incluir también pedidos ya entregados (útil para reimprimir)</span>'+
      '</label>'+
      '<div id="rep-imp-preview" style="margin-top:10px;font-size:12px;color:#555"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">'+
      _impCard("A","🍳","Orden de producción","1 hoja por cliente. Productos a producir, datos de entrega, espacio para notas y firma de quien lo hizo.","JP / cocina","generarPdfProduccionPorCliente()",false)+
      _impCard("B","👨‍🍳","Producción consolidada","Suma de cantidades por producto del rango. Permite planificar cocina sin abrir cliente por cliente.","JP / cocina","generarPdfProduccionConsolidada()",false)+
      _impCard("C","📦","Empaque con chequeo","1 hoja por cliente con casillas por cada item. Para verificar antes de despachar.","Empacador","generarPdfEmpaque()",false)+
      _impCard("D","🚚","Entregas con chequeo + firma","Ruta del día con casillas de salió/entregado/firma del receptor.","Conductor","generarPdfEntregas()",false)+
    '</div>';
  renderReportesImprimiblesPreview();
}

function _impCard(letra,emoji,titulo,descripcion,destinatario,onclick,soon){
  const btn=soon
    ?'<button disabled style="background:#eee;color:#999;border:none;padding:8px 14px;border-radius:6px;font-weight:600;font-size:12px;cursor:not-allowed">Pronto</button>'
    :'<button onclick="'+onclick+'" style="background:#0D47A1;color:white;border:none;padding:8px 14px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer">📥 Generar PDF</button>';
  return '<div style="background:white;border:1px solid #ddd;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px">'+
    '<div style="display:flex;align-items:center;gap:8px">'+
      '<div style="font-size:32px">'+emoji+'</div>'+
      '<div>'+
        '<div style="font-size:10px;color:#888;font-weight:600">PDF '+letra+(soon?' · Próximamente':'')+'</div>'+
        '<div style="font-weight:700;font-size:14px;color:#212121">'+titulo+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="font-size:12px;color:#555;line-height:1.4">'+descripcion+'</div>'+
    '<div style="font-size:11px;color:#888"><strong>Destinatario:</strong> '+destinatario+'</div>'+
    '<div>'+btn+'</div>'+
    '</div>';
}

function _impGetDocsRango(includeEntregados){
  // Por defecto: solo pendientes (status pedido/aprobada/en_produccion).
  // Si includeEntregados=true: también entregado (para reimprimir hoja de entregas).
  const desde=reportesFiltros.desde, hasta=reportesFiltros.hasta;
  if(!desde||!hasta)return [];
  const validStatus=includeEntregados
    ?{quote:["pedido","en_produccion","entregado"],proposal:["aprobada","en_produccion","entregado"]}
    :{quote:["pedido","en_produccion"],proposal:["aprobada","en_produccion"]};
  return quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida")return false;
    if(!(validStatus[q.kind]||[]).includes(q.status))return false;
    const f=_reportesGetFecha(q);
    return f&&f>=desde&&f<=hasta;
  }).sort((a,b)=>{
    const fa=_reportesGetFecha(a),fb=_reportesGetFecha(b);
    if(fa!==fb)return fa.localeCompare(fb);
    return (a.client||"").localeCompare(b.client||"");
  });
}

function renderReportesImprimiblesPreview(){
  const el=$("rep-imp-preview");
  if(!el)return;
  if(!reportesFiltros.desde||!reportesFiltros.hasta){el.textContent="Elige rango de fechas para ver qué pedidos hay";return}
  const docs=_impGetDocsRango(false);
  const docsConEntregados=_impGetDocsRango(true);
  let txt="<strong>"+docs.length+"</strong> pedido"+(docs.length!==1?"s":"")+" pendiente"+(docs.length!==1?"s":"")+" en el rango "+reportesFiltros.desde+" → "+reportesFiltros.hasta;
  if(reportesIncluirEntregados){
    const entregados=docsConEntregados.length-docs.length;
    txt+=". PDF D incluirá también <strong>"+entregados+"</strong> entregado"+(entregados!==1?"s":"")+" del rango (total "+docsConEntregados.length+")";
  }
  if(docs.length===0&&!reportesIncluirEntregados)txt+=" — los PDFs vendrán vacíos";
  el.innerHTML=txt;
}

// ─── Helpers comunes para los 4 PDFs (look & feel HojaEntregas) ──

// Pinta header con logo dorado centrado + linea + titulo + subtitulo
function _repPdfHeader(pdf,W,title,subtitle){
  let y=4;
  // Logo (50mm ancho, ratio 272/500)
  try{
    if(typeof LOGO_IW!=="undefined"){
      const li=new Image();li.src=LOGO_IW;
      pdf.addImage(li,"JPEG",(W-50)/2,y,50,50*(272/500));
    }
  }catch(e){console.warn("Logo no agregado:",e)}
  y+=50*(272/500)+2;

  // Linea dorada decorativa
  pdf.setDrawColor(201,169,110);pdf.setLineWidth(0.4);
  pdf.line(20,y,W-20,y);

  // Titulo
  y+=5;
  pdf.setFont("helvetica","bold");pdf.setFontSize(12);
  pdf.setTextColor(26,26,26);
  pdf.text(title,W/2,y,{align:"center"});

  // Subtitulo
  if(subtitle){
    y+=5;
    pdf.setFontSize(8.5);pdf.setFont("helvetica","normal");
    pdf.setTextColor(100,100,100);
    pdf.text(subtitle,W/2,y,{align:"center"});
    pdf.setTextColor(26,26,26);
  }
  return y+4;
}

function _repPdfFooter(pdf,W,H){
  const pageCount=pdf.internal.getNumberOfPages();
  const ts=new Date().toLocaleString("es-CO",{dateStyle:"short",timeStyle:"short"});
  for(let i=1;i<=pageCount;i++){
    pdf.setPage(i);
    pdf.setFontSize(7);pdf.setTextColor(120,120,120);
    pdf.text("Gourmet Bites by Andrade Matuk · Generado "+ts+" · Página "+i+" de "+pageCount,
      W/2,H-5,{align:"center"});
  }
}

// Estilos comunes para autoTable (tema HojaEntregas: head negro, zebra crema)
const _REP_PDF_HEAD_STYLE={fillColor:[26,26,26],textColor:255,fontStyle:"bold",fontSize:8,halign:"center",valign:"middle",cellPadding:2.5};
const _REP_PDF_ZEBRA={fillColor:[250,250,248]};

// ─── F5: PDF A — Orden de producción por cliente ────────────

function generarPdfProduccionPorCliente(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=_impGetDocsRango();
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos pendientes en el rango","warn");
    return;
  }
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  const W=210,H=297,M=14;

  docs.forEach((q,idx)=>{
    if(idx>0)pdf.addPage();

    // Header con logo + dorado (look HojaEntregas)
    const subtitle="Hoja "+(idx+1)+"/"+docs.length+"  ·  "+(q.kind==="quote"?"Cotización":"Propuesta")+" "+(q.id||"");
    let y=_repPdfHeader(pdf,W,"ORDEN DE PRODUCCIÓN",subtitle);

    // Cliente / pedido datos
    pdf.setFontSize(14);pdf.setFont("helvetica","bold");
    pdf.text((q.client||"(sin cliente)").toUpperCase(),M,y+2);y+=8;
    pdf.setFontSize(9.5);pdf.setFont("helvetica","normal");
    const fecha=_reportesGetFecha(q);
    const hora=q.horaEntrega||(q.orderData||{}).horaEntrega||"";
    pdf.text("Entrega: "+fecha+(hora?"  "+hora:""),M,y);y+=4.5;
    if(q.dir)pdf.text("Dirección: "+q.dir+(q.city?", "+q.city:""),M,y),y+=4.5;
    if(q.tel)pdf.text("Teléfono: "+q.tel,M,y),y+=4.5;
    if(q.att)pdf.text("Atención: "+q.att,M,y),y+=4.5;
    y+=3;

    // Tabla productos con checkbox por item (col 0)
    const items=[];
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>items.push(["",String(it.qty||0),it.n||"",it.d||"",it.u||""]));
      (q.cust||[]).forEach(it=>items.push(["",String(it.qty||0),(it.n||"")+" *",it.d||"",it.u||""]));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
        const prefix=sec.name?"["+sec.name+(opt.label?" "+opt.label:"")+"] ":"";
        items.push(["",String(it.qty||0),prefix+(it.name||""),it.desc||"",it.unit||""]);
      })));
    }

    if(pdf.autoTable){
      const tw=W-M*2;
      pdf.autoTable({
        startY:y,
        margin:{left:M,right:M},
        head:[["","CANT","PRODUCTO","DESCRIPCIÓN","UNIDAD"]],
        body:items,
        theme:"grid",
        headStyles:_REP_PDF_HEAD_STYLE,
        bodyStyles:{fontSize:9,cellPadding:2.5,valign:"middle",minCellHeight:9},
        alternateRowStyles:_REP_PDF_ZEBRA,
        columnStyles:{
          0:{halign:"center",cellWidth:tw*0.06},
          1:{halign:"center",cellWidth:tw*0.10,fontStyle:"bold"},
          2:{halign:"left",cellWidth:tw*0.36},
          3:{halign:"left",cellWidth:tw*0.34},
          4:{halign:"center",cellWidth:tw*0.14}
        },
        didDrawCell:function(data){
          if(data.section==="body"&&data.column.index===0){
            const cx=data.cell.x+data.cell.width/2-2.5;
            const cy=data.cell.y+data.cell.height/2-2.5;
            pdf.setDrawColor(80);pdf.setLineWidth(0.3);
            pdf.rect(cx,cy,5,5);
          }
        }
      });
      y=pdf.lastAutoTable.finalY+8;
    }

    // Notas internas del pedido (si existen)
    const notas=(q.notasCotData||{}).publicas||(q.orderData||{}).notas||"";
    if(notas){
      pdf.setFontSize(9);pdf.setFont("helvetica","bold");
      pdf.text("Notas del pedido:",M,y);y+=4;
      pdf.setFont("helvetica","normal");
      const lines=pdf.splitTextToSize(notas,W-2*M);
      pdf.text(lines,M,y);y+=lines.length*4+4;
    }

    // Espacio notas cocina
    pdf.setFontSize(9);pdf.setFont("helvetica","bold");
    pdf.text("Notas cocina:",M,y);y+=2;
    pdf.setDrawColor(180);
    for(let i=0;i<3;i++){pdf.line(M,y+5,W-M,y+5);y+=7}
    y+=4;

    // Footer: producido + firma
    pdf.setFontSize(10);pdf.setFont("helvetica","bold");
    pdf.setDrawColor(80);
    pdf.rect(M,y,5,5);
    pdf.text("Producido",M+8,y+4);
    pdf.line(W-M-60,y+5,W-M,y+5);
    pdf.setFont("helvetica","normal");pdf.setFontSize(8);
    pdf.text("Firma de quien produjo",W-M-30,y+9,{align:"center"});

    // * Productos custom marker (al pie de pagina)
    if(items.some(r=>r[2].endsWith(" *"))){
      pdf.setFontSize(7);pdf.setTextColor(120);
      pdf.text("* Producto custom (no del catálogo).",M,H-12);
      pdf.setTextColor(0);
    }
  });

  _repPdfFooter(pdf,W,H);

  const fname="OrdenProduccion_"+reportesFiltros.desde+(reportesFiltros.desde===reportesFiltros.hasta?"":"_a_"+reportesFiltros.hasta)+".pdf";
  pdf.save(fname);
  if(typeof toast==="function")toast("PDF generado: "+docs.length+" hoja(s)","success");
}

// ─── F6: PDF B — Producción consolidada ─────────────────────

function generarPdfProduccionConsolidada(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=_impGetDocsRango();
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos pendientes en el rango","warn");
    return;
  }
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  const W=210, M=14;

  // Agrupar por día. Key compuesto = nombre + descripcion para no
  // mezclar variantes (ej: Lasagna Pollo vs Lasagna Cerdo vs Lasagna Res).
  const porDia={};
  docs.forEach(q=>{
    const f=_reportesGetFecha(q)||"(sin fecha)";
    if(!porDia[f])porDia[f]={docs:[],productos:{}};
    porDia[f].docs.push(q);
    const procItem=(name,qty,desc,unit)=>{
      if(!name)return;
      const key=name+"|"+(desc||"");
      if(!porDia[f].productos[key])porDia[f].productos[key]={name:name,qty:0,desc:desc||"",unit:unit||"",pedidos:new Set()};
      porDia[f].productos[key].qty+=qty;
      porDia[f].productos[key].pedidos.add(q.client||q.id);
    };
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>procItem(it.n,parseInt(it.qty)||0,it.d,it.u));
      (q.cust||[]).forEach(it=>procItem(it.n,parseInt(it.qty)||0,it.d,it.u));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>procItem(it.name,parseInt(it.qty)||0,it.desc,it.unit))));
    }
  });

  const dias=Object.keys(porDia).sort();
  const Hp=297;
  dias.forEach((f,idx)=>{
    if(idx>0)pdf.addPage();

    const totalUnidades=Object.values(porDia[f].productos).reduce((s,g)=>s+g.qty,0);
    const subtitle=hojaFormatFecha(f)+"  ·  "+porDia[f].docs.length+" pedido(s)  ·  "+Object.keys(porDia[f].productos).length+" producto(s) distinto(s)  ·  "+totalUnidades+" unidades";
    let y=_repPdfHeader(pdf,W,"PRODUCCIÓN DEL DÍA",subtitle);

    // Tabla agregada ordenada alfabeticamente por nombre+descripcion
    const rows=Object.entries(porDia[f].productos)
      .sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||"")||(a[1].desc||"").localeCompare(b[1].desc||""))
      .map(([key,g])=>[String(g.qty),g.name,g.desc,g.unit,String(g.pedidos.size),Array.from(g.pedidos).join(", ")]);

    if(pdf.autoTable){
      const tw=W-M*2;
      pdf.autoTable({
        startY:y,
        margin:{left:M,right:M},
        head:[["CANT","PRODUCTO","DESCRIPCIÓN","UNIDAD","# PED","CLIENTES"]],
        body:rows,
        theme:"grid",
        headStyles:_REP_PDF_HEAD_STYLE,
        bodyStyles:{fontSize:8.5,cellPadding:2.5,valign:"top",minCellHeight:8},
        alternateRowStyles:_REP_PDF_ZEBRA,
        columnStyles:{
          0:{halign:"center",cellWidth:tw*0.08,fontStyle:"bold"},
          1:{halign:"left",cellWidth:tw*0.27,fontStyle:"bold"},
          2:{halign:"left",cellWidth:tw*0.30},
          3:{halign:"center",cellWidth:tw*0.12},
          4:{halign:"center",cellWidth:tw*0.07},
          5:{halign:"left",cellWidth:tw*0.16,fontSize:7.5}
        }
      });
      y=pdf.lastAutoTable.finalY+8;
    }

    // Total al pie
    pdf.setFontSize(11);pdf.setFont("helvetica","bold");
    pdf.setTextColor(26,26,26);
    pdf.text("TOTAL: "+totalUnidades+" unidades a producir",M,y);
  });

  _repPdfFooter(pdf,W,Hp);

  const fname="ProduccionConsolidada_"+reportesFiltros.desde+(reportesFiltros.desde===reportesFiltros.hasta?"":"_a_"+reportesFiltros.hasta)+".pdf";
  pdf.save(fname);
  if(typeof toast==="function")toast("PDF generado: "+dias.length+" día(s)","success");
}

// ─── F7: PDF C — Empaque con chequeo por item ───────────────

function generarPdfEmpaque(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=_impGetDocsRango();
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos pendientes en el rango","warn");
    return;
  }
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  const W=210,H=297,M=14;

  docs.forEach((q,idx)=>{
    if(idx>0)pdf.addPage();

    const subtitle="Hoja "+(idx+1)+"/"+docs.length+"  ·  "+(q.kind==="quote"?"Cotización":"Propuesta")+" "+(q.id||"");
    let y=_repPdfHeader(pdf,W,"EMPAQUE / DESPACHO",subtitle);

    // Cliente / pedido datos
    pdf.setFontSize(14);pdf.setFont("helvetica","bold");
    pdf.text((q.client||"(sin cliente)").toUpperCase(),M,y+2);y+=8;
    pdf.setFontSize(9.5);pdf.setFont("helvetica","normal");
    const fecha=_reportesGetFecha(q);
    const hora=q.horaEntrega||(q.orderData||{}).horaEntrega||"";
    pdf.text("Entrega: "+fecha+(hora?"  "+hora:""),M,y);y+=4.5;
    if(q.dir)pdf.text("Dirección: "+q.dir+(q.city?", "+q.city:""),M,y),y+=4.5;
    if(q.tel)pdf.text("Teléfono: "+q.tel,M,y),y+=4.5;
    y+=3;

    // Items con casilla en col 0
    const items=[];
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>items.push(["",String(it.qty||0),it.n||"",it.d||"",it.u||""]));
      (q.cust||[]).forEach(it=>items.push(["",String(it.qty||0),(it.n||"")+" *",it.d||"",it.u||""]));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
        const prefix=sec.name?"["+sec.name+(opt.label?" "+opt.label:"")+"] ":"";
        items.push(["",String(it.qty||0),prefix+(it.name||""),it.desc||"",it.unit||""]);
      })));
    }

    if(pdf.autoTable){
      const tw=W-M*2;
      pdf.autoTable({
        startY:y,
        margin:{left:M,right:M},
        head:[["","CANT","PRODUCTO","DESCRIPCIÓN","UNIDAD"]],
        body:items,
        theme:"grid",
        headStyles:_REP_PDF_HEAD_STYLE,
        bodyStyles:{fontSize:9,cellPadding:2.5,valign:"middle",minCellHeight:9},
        alternateRowStyles:_REP_PDF_ZEBRA,
        columnStyles:{
          0:{halign:"center",cellWidth:tw*0.06},
          1:{halign:"center",cellWidth:tw*0.10,fontStyle:"bold"},
          2:{halign:"left",cellWidth:tw*0.36},
          3:{halign:"left",cellWidth:tw*0.34},
          4:{halign:"center",cellWidth:tw*0.14}
        },
        didDrawCell:function(data){
          if(data.section==="body"&&data.column.index===0){
            const cx=data.cell.x+data.cell.width/2-2.5;
            const cy=data.cell.y+data.cell.height/2-2.5;
            pdf.setDrawColor(80);pdf.setLineWidth(0.3);
            pdf.rect(cx,cy,5,5);
          }
        }
      });
      y=pdf.lastAutoTable.finalY+8;
    }

    // Footer: casilla "Listo para despachar" + linea "Empacado por"
    pdf.setDrawColor(80);pdf.setLineWidth(0.3);
    pdf.rect(M,y,5,5);
    pdf.setFontSize(11);pdf.setFont("helvetica","bold");
    pdf.text("LISTO PARA DESPACHAR",M+8,y+4);
    y+=12;

    pdf.setFontSize(10);pdf.setFont("helvetica","normal");
    pdf.text("Empacado por:",M,y+5);
    pdf.line(M+30,y+5,W-M,y+5);

    // * Productos custom marker
    if(items.some(r=>r[2].endsWith(" *"))){
      pdf.setFontSize(7);pdf.setTextColor(120);
      pdf.text("* Producto custom (no del catálogo).",M,H-12);
      pdf.setTextColor(0);
    }
  });

  _repPdfFooter(pdf,W,H);

  const fname="Empaque_"+reportesFiltros.desde+(reportesFiltros.desde===reportesFiltros.hasta?"":"_a_"+reportesFiltros.hasta)+".pdf";
  pdf.save(fname);
  if(typeof toast==="function")toast("PDF generado: "+docs.length+" hoja(s) de empaque","success");
}

// ─── F8: PDF D — Entregas con chequeo + firma ───────────────

function generarPdfEntregas(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=_impGetDocsRango(reportesIncluirEntregados);
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos en el rango con los filtros aplicados","warn");
    return;
  }
  const {jsPDF}=window.jspdf;
  // Landscape letter (mismo formato que la hoja existente del sistema)
  const pdf=new jsPDF("l","mm","letter");
  const W=279.4,H=215.9,M=10;

  // Agrupar por dia para tener una hoja por dia
  const porDia={};
  docs.forEach(q=>{
    const f=_reportesGetFecha(q)||"(sin fecha)";
    if(!porDia[f])porDia[f]=[];
    porDia[f].push(q);
  });
  // Ordenar pedidos dentro de cada dia por hora
  Object.values(porDia).forEach(arr=>arr.sort((a,b)=>{
    const ha=a.horaEntrega||"99:99",hb=b.horaEntrega||"99:99";
    return ha.localeCompare(hb);
  }));

  const dias=Object.keys(porDia).sort();
  dias.forEach((f,idx)=>{
    if(idx>0)pdf.addPage();

    const subtitle=hojaFormatFecha(f)+"  ·  "+porDia[f].length+" entrega"+(porDia[f].length!==1?"s":"");
    let y=_repPdfHeader(pdf,W,"HOJA DE ENTREGAS",subtitle);

    // Tabla con casillas + firma. Look HojaEntregas existente.
    const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
    const rows=porDia[f].map(q=>{
      const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
      const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      const dirCorta=(q.dir||"").substring(0,40)+((q.dir||"").length>40?"...":"");
      return [
        (q.horaEntrega||"—"),
        (q.client||"—").toString().toUpperCase(),
        q.id||"",
        dirCorta+(q.city?"\n"+q.city:""),
        q.tel||"",
        fmt(total),
        saldo>0?"SALDO "+fmt(saldo):"CANCELADO",
        "","",
        ""
      ];
    });

    if(pdf.autoTable){
      const tw=W-M*2;
      pdf.autoTable({
        startY:y,
        margin:{left:M,right:M},
        head:[["HORA","CLIENTE","DOC","DIRECCIÓN","TELÉFONO","TOTAL","NOTAS PAGO","SAL","ENT","FIRMA CLIENTE"]],
        body:rows,
        theme:"grid",
        headStyles:_REP_PDF_HEAD_STYLE,
        bodyStyles:{fontSize:7.5,cellPadding:2,valign:"middle",minCellHeight:14},
        alternateRowStyles:_REP_PDF_ZEBRA,
        columnStyles:{
          0:{halign:"center",cellWidth:tw*0.07,fontStyle:"bold"},
          1:{halign:"left",cellWidth:tw*0.16,fontStyle:"bold"},
          2:{halign:"center",cellWidth:tw*0.09,fontSize:7},
          3:{halign:"left",cellWidth:tw*0.22,fontSize:7.5},
          4:{halign:"center",cellWidth:tw*0.09},
          5:{halign:"right",cellWidth:tw*0.08},
          6:{halign:"center",cellWidth:tw*0.09,fontStyle:"bold"},
          7:{halign:"center",cellWidth:tw*0.05},
          8:{halign:"center",cellWidth:tw*0.05},
          9:{halign:"center",cellWidth:tw*0.10}
        },
        didParseCell:function(data){
          // Color verde/rojo en NOTAS PAGO igual que HojaEntregas
          if(data.section==="body"&&data.column.index===6){
            const txt=(data.cell.raw||"").toString();
            if(txt==="CANCELADO"||txt==="CORTESÍA")data.cell.styles.textColor=[46,125,50];
            else if(txt.indexOf("SALDO")===0)data.cell.styles.textColor=[198,40,40];
          }
        },
        didDrawCell:function(data){
          if(data.section!=="body")return;
          if(data.column.index===7||data.column.index===8){
            const cx=data.cell.x+data.cell.width/2-2.5;
            const cy=data.cell.y+data.cell.height/2-2.5;
            pdf.setDrawColor(80);pdf.setLineWidth(0.3);
            pdf.rect(cx,cy,5,5);
          }else if(data.column.index===9){
            const lx1=data.cell.x+2;
            const lx2=data.cell.x+data.cell.width-2;
            const ly=data.cell.y+data.cell.height-3;
            pdf.setDrawColor(150);pdf.setLineWidth(0.2);
            pdf.line(lx1,ly,lx2,ly);
          }
        }
      });
      y=pdf.lastAutoTable.finalY+8;
    }

    // Totales del dia + firma del conductor
    const totalDia=porDia[f].reduce((s,q)=>s+((typeof getDocTotal==="function")?getDocTotal(q):(q.total||0)),0);
    const saldoDia=porDia[f].reduce((s,q)=>s+((typeof saldoPendiente==="function")?saldoPendiente(q):0),0);
    pdf.setFontSize(10);pdf.setFont("helvetica","bold");
    pdf.setTextColor(26,26,26);
    pdf.text("TOTAL DÍA: "+fmt(totalDia)+(saldoDia>0?"   ·   Saldo a cobrar: "+fmt(saldoDia):""),M,y);

    y+=10;
    pdf.setFontSize(10);pdf.setFont("helvetica","normal");
    pdf.text("Conductor:",M,y);
    pdf.line(M+25,y,M+100,y);
    pdf.text("Firma:",M+110,y);
    pdf.line(M+125,y,M+200,y);
  });

  _repPdfFooter(pdf,W,H);

  const fname="HojaEntregasPendientes_"+reportesFiltros.desde+(reportesFiltros.desde===reportesFiltros.hasta?"":"_a_"+reportesFiltros.hasta)+".pdf";
  pdf.save(fname);
  if(typeof toast==="function")toast("PDF generado: "+dias.length+" día(s) de entregas","success");
}

function generarReporte(){
  // Capturar valores actuales del form
  const desde=$("rep-desde")?.value||"";
  const hasta=$("rep-hasta")?.value||"";
  const estado=$("rep-estado")?.value||"todos";
  reportesFiltros={desde,hasta,estado};

  if(!desde||!hasta){
    if(typeof toast==="function")toast("Elige fecha desde y hasta","warn");
    return;
  }
  if(desde>hasta){
    if(typeof toast==="function")toast("La fecha 'desde' es posterior a 'hasta'","warn");
    return;
  }

  // Filtrar docs vendidos en el rango
  let docs=quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(!(REPORTES_VENDIDO_STATUS[q.kind]||[]).includes(q.status))return false;
    if(estado==="pendientes"&&q.status==="entregado")return false;
    if(estado==="entregados"&&q.status!=="entregado")return false;
    const f=_reportesGetFecha(q);
    if(!f)return false;
    return f>=desde&&f<=hasta;
  });

  // Ordenar por fecha asc, luego cliente
  docs.sort((a,b)=>{
    const fa=_reportesGetFecha(a),fb=_reportesGetFecha(b);
    if(fa!==fb)return fa.localeCompare(fb);
    return (a.client||"").localeCompare(b.client||"");
  });

  reportesResultado={docs,filtros:{...reportesFiltros}};

  // Habilitar boton Excel si hay resultados
  const btnExcel=$("rep-btn-excel");
  if(btnExcel){
    btnExcel.disabled=docs.length===0;
    btnExcel.style.opacity=docs.length===0?".5":"1";
    btnExcel.style.cursor=docs.length===0?"not-allowed":"pointer";
  }

  // Render preview
  renderReportePreview(docs);
}

function renderReportePreview(docs){
  const el=$("rep-resultado");
  if(!el)return;
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  const escape=typeof h==="function"?h:(s=>String(s||""));

  if(!docs.length){
    el.innerHTML='<div style="padding:40px 20px;text-align:center;color:#888;font-size:13px">'+
      '<div style="font-size:48px;margin-bottom:12px">📭</div>'+
      '<div style="font-weight:700;color:#555;margin-bottom:6px">Sin resultados</div>'+
      '<div style="font-size:12px">No hay docs vendidos en ese rango con los filtros aplicados.</div>'+
      '</div>';
    return;
  }

  // Resumen
  const totalDocs=docs.length;
  const totalMonto=docs.reduce((s,q)=>s+((typeof getDocTotal==="function")?getDocTotal(q):(q.total||0)),0);
  const clientes=new Set(docs.map(q=>q.client||"")).size;

  let html=
    '<div style="background:#E3F2FD;border-left:3px solid #0D47A1;padding:10px 14px;margin-bottom:12px;border-radius:6px;font-size:13px">'+
      '<strong>'+totalDocs+' doc'+(totalDocs!==1?'s':'')+'</strong> · '+clientes+' cliente'+(clientes!==1?'s':'')+' · Total <strong>'+fmt(totalMonto)+'</strong>'+
    '</div>';

  // Tabla compacta
  html+='<div style="overflow-x:auto;border:1px solid #ddd;border-radius:6px">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<thead style="background:#F5F5F5">'+
        '<tr>'+
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Fecha</th>'+
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Cliente</th>'+
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Doc</th>'+
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #ddd">Estado</th>'+
          '<th style="text-align:right;padding:8px 10px;border-bottom:2px solid #ddd">Productos</th>'+
          '<th style="text-align:right;padding:8px 10px;border-bottom:2px solid #ddd">Total</th>'+
        '</tr>'+
      '</thead>'+
      '<tbody>';

  docs.forEach((q,idx)=>{
    const f=_reportesGetFecha(q);
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const nProd=(q.cart||[]).length+(q.cust||[]).length+(q.sections||[]).reduce((s,sec)=>s+(sec.options||[]).reduce((s2,o)=>s2+(o.items||[]).length,0),0);
    const stLbl=(typeof STATUS_META!=="undefined"&&STATUS_META[q.status]?.label)||q.status||"";
    const bg=idx%2===0?"#fff":"#FAFAFA";
    html+='<tr style="background:'+bg+'">'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee">'+escape(f)+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600">'+escape(q.client||"")+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px">'+escape(q.id||"")+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee">'+escape(stLbl)+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">'+nProd+'</td>'+
      '<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">'+fmt(total)+'</td>'+
      '</tr>';
  });

  html+='</tbody></table></div>';
  el.innerHTML=html;
}

// ─── F3: Generación Excel con SheetJS ───────────────────────

function _repCalcularKPIs(filtros){
  // Calcula los KPIs del Dashboard restringidos al rango filtros.desde/hasta.
  // Replica logica de renderDashboard pero independiente.
  const desde=filtros.desde, hasta=filtros.hasta;
  const inRange=f=>f&&f>=desde&&f<=hasta;

  let cotMonto=0,cotCount=0,cotClis=new Set();
  let venMonto=0,venCount=0,venClis=new Set();
  let entMonto=0,entCount=0,entCumplidas=0,entConSaldo=0;
  let recaudo=0;
  let porCobrarMonto=0,porCobrarN=0;
  // Pipeline (independiente del rango — estado actual)
  let pipCotMonto=0,pipCotN=0;
  let pipPedMonto=0,pipPedN=0;
  let pipEntSaldoMonto=0,pipEntSaldoN=0;

  const _optExcl=(typeof buildOptionExclusions==="function")?buildOptionExclusions(quotesCache):new Set();

  quotesCache.forEach(q=>{
    if(typeof noSumaEnKpis==="function"){if(noSumaEnKpis(q,"reportes-kpis"))return}
    else{
      if(q._wrongCollection)return;
      const _st=q.status||"enviada";
      if(_st==="superseded"||_st==="anulada"||_st==="convertida")return;
    }
    const status=q.status||"enviada";
    if(typeof getFollowUp==="function"&&getFollowUp(q)==="perdida"&&(status==="enviada"||status==="propfinal"))return;
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const fCre=(typeof dateOfCreation==="function")?dateOfCreation(q):(q.dateISO||"").slice(0,10);
    const fVen=(typeof dateOfSale==="function")?dateOfSale(q):"";
    const fEnt=q.fechaEntrega||q.eventDate||"";
    const _isOptExcl=_optExcl.has(q.id);

    // KPIs del rango
    if(inRange(fCre)&&status!=="convertida"&&!_isOptExcl){cotMonto+=total;cotCount++;if(q.client)cotClis.add(q.client)}
    if(inRange(fVen)&&["pedido","aprobada","en_produccion","entregado"].includes(status)){venMonto+=total;venCount++;if(q.client)venClis.add(q.client)}
    if(inRange(fEnt)&&status==="entregado"){
      entMonto+=total;entCount++;
      if(typeof isCumplido==="function"&&isCumplido(q))entCumplidas++; else entConSaldo++;
    }
    if(["pedido","aprobada","en_produccion","entregado"].includes(status)){
      const pend=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      if(pend>0){porCobrarMonto+=pend;porCobrarN++}
    }
    (q.pagos||[]).forEach(p=>{if(inRange(p.fecha))recaudo+=parseInt(p.monto)||0});

    // Pipeline activo (estado actual, sin rango)
    if(status==="enviada"&&!_isOptExcl){pipCotMonto+=total;pipCotN++}
    if(["pedido","aprobada","en_produccion"].includes(status)){pipPedMonto+=total;pipPedN++}
    if(status==="entregado"){
      const pend=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      if(pend>0){pipEntSaldoMonto+=pend;pipEntSaldoN++}
    }
  });

  return {
    cotMonto,cotCount,cotClis:cotClis.size,
    venMonto,venCount,venClis:venClis.size,
    entMonto,entCount,entCumplidas,entConSaldo,
    recaudo,porCobrarMonto,porCobrarN,
    pipCotMonto,pipCotN,
    pipPedMonto,pipPedN,
    pipEntSaldoMonto,pipEntSaldoN
  };
}

// ─── Estilos (replican el formato maquetado por Luis) ────────
const _REP_FONT_BASE={name:"Calibri",sz:11,color:{rgb:"333333"}};
const _REP_FONT_HEADER={name:"Calibri",sz:11,color:{rgb:"FFFFFF"},bold:true};
const _REP_FONT_TITLE={name:"Calibri",sz:16,color:{rgb:"1F3864"},bold:true};
const _REP_FONT_SECTION={name:"Calibri",sz:12,color:{rgb:"1F3864"},bold:true};
const _REP_FILL_HEADER={patternType:"solid",fgColor:{rgb:"2F5496"}};
const _REP_FILL_ZEBRA={patternType:"solid",fgColor:{rgb:"F2F6FC"}};
const _REP_FILL_WHITE={patternType:"solid",fgColor:{rgb:"FFFFFF"}};
const _REP_FILL_TITLE={patternType:"solid",fgColor:{rgb:"D6E4F0"}};
const _REP_BORDER_THIN={style:"thin",color:{rgb:"DDDDDD"}};
const _REP_BORDER_FULL={top:_REP_BORDER_THIN,bottom:_REP_BORDER_THIN,left:_REP_BORDER_THIN,right:_REP_BORDER_THIN};
const _REP_FMT_PESOS='"$"#,##0';

// Aplica estilo a una celda (creandola si falta)
function _repSetCell(ws,addr,value,style){
  ws[addr]=ws[addr]||{v:value,t:typeof value==="number"?"n":"s"};
  if(value!==undefined)ws[addr].v=value;
  if(typeof value==="number")ws[addr].t="n";
  else if(typeof value==="string")ws[addr].t="s";
  if(style)ws[addr].s=style;
}

// Aplica formato de tabla estandar (header azul + zebra striping)
// cols: array con info de cada col: {align: 'center'|'right'|'left', pesos: bool}
function _repFormatearTabla(ws,nRows,cols){
  const A=c=>String.fromCharCode(65+c); // 0->A, 1->B...
  // Header (fila 1)
  cols.forEach((col,idx)=>{
    const addr=A(idx)+"1";
    if(!ws[addr])ws[addr]={v:"",t:"s"};
    ws[addr].s={
      font:_REP_FONT_HEADER,
      fill:_REP_FILL_HEADER,
      alignment:{horizontal:"center",vertical:"center"},
      border:_REP_BORDER_FULL
    };
  });
  if(!ws["!rows"])ws["!rows"]=[];
  ws["!rows"][0]={hpt:26.1};

  // Cuerpo (filas 2..nRows+1)
  for(let r=2;r<=nRows+1;r++){
    const fill=(r%2===0)?_REP_FILL_ZEBRA:_REP_FILL_WHITE;
    cols.forEach((col,idx)=>{
      const addr=A(idx)+r;
      if(!ws[addr])ws[addr]={v:"",t:"s"};
      const align={horizontal:col.align||undefined};
      const styleObj={
        font:_REP_FONT_BASE,
        fill:fill,
        alignment:align,
        border:_REP_BORDER_FULL
      };
      if(col.pesos)styleObj.numFmt=_REP_FMT_PESOS;
      ws[addr].s=styleObj;
    });
  }
}

function descargarExcel(){
  if(!reportesResultado||!reportesResultado.docs.length){
    if(typeof toast==="function")toast("No hay datos para exportar","warn");
    return;
  }
  if(typeof XLSX==="undefined"){
    if(typeof toast==="function")toast("Biblioteca Excel aún cargando. Reintentá en 2s.","warn");
    return;
  }

  const docs=reportesResultado.docs;
  const filtros=reportesResultado.filtros;
  const ahora=new Date().toISOString().slice(0,16).replace("T"," ");
  const wb=XLSX.utils.book_new();

  // ═══ HOJA 1: Resumen Dashboard ═══════════════════════════
  const k=_repCalcularKPIs(filtros);
  const aoa1=[
    ["GOURMET BITES — REPORTE EJECUTIVO","","",""],
    ["","","",""],
    ["Período:", filtros.desde+" a "+filtros.hasta,"",""],
    ["Estado filtro:", filtros.estado,"",""],
    ["Generado:", ahora,"",""],
    ["","","",""],
    ["MÉTRICAS DEL PERÍODO","","",""],
    ["KPI","Monto","# Docs","# Clientes"],
    ["Cotizado",k.cotMonto,k.cotCount,k.cotClis],
    ["Vendido",k.venMonto,k.venCount,k.venClis],
    ["Entregado",k.entMonto,k.entCount,"-"],
    ["  · cumplidas (pagadas 100%)","",k.entCumplidas,""],
    ["  · con saldo pendiente","",k.entConSaldo,""],
    ["Recaudado",k.recaudo,"-","-"],
    ["Por cobrar (todos los activos)",k.porCobrarMonto,k.porCobrarN,"-"],
    ["","","",""],
    ["PIPELINE ACTIVO (estado actual, independiente del rango)","","",""],
    ["KPI","Monto","# Docs",""],
    ["En cotización",k.pipCotMonto,k.pipCotN,""],
    ["Pedidos confirmados (por entregar)",k.pipPedMonto,k.pipPedN,""],
    ["Entregados con saldo",k.pipEntSaldoMonto,k.pipEntSaldoN,""]
  ];
  const ws1=XLSX.utils.aoa_to_sheet(aoa1);
  ws1["!cols"]=[{wch:46},{wch:23},{wch:13},{wch:15}];
  ws1["!merges"]=[
    {s:{r:0,c:0},e:{r:0,c:3}},   // A1:D1 título
    {s:{r:6,c:0},e:{r:6,c:3}},   // A7:D7 sección métricas
    {s:{r:16,c:0},e:{r:16,c:3}}  // A17:D17 sección pipeline
  ];
  // Estilo título A1:D1
  const styleTitle={font:_REP_FONT_TITLE,fill:_REP_FILL_TITLE,alignment:{horizontal:"center",vertical:"center"}};
  ["A1","B1","C1","D1"].forEach(a=>{if(ws1[a])ws1[a].s=styleTitle});
  // Estilos secciones
  const styleSection={font:_REP_FONT_SECTION,fill:_REP_FILL_TITLE,alignment:{horizontal:"center",vertical:"center"}};
  ["A7","B7","C7","D7","A17","B17","C17","D17"].forEach(a=>{if(ws1[a])ws1[a].s=styleSection});
  // Labels filas 3-5 (col A bold)
  const styleLabel={font:{name:"Calibri",sz:11,color:{rgb:"333333"},bold:true}};
  const styleValue={font:_REP_FONT_BASE};
  for(let r=3;r<=5;r++){if(ws1["A"+r])ws1["A"+r].s=styleLabel;if(ws1["B"+r])ws1["B"+r].s=styleValue}
  // Headers de tabla en filas 8 y 18
  const styleTblHeader={font:_REP_FONT_HEADER,fill:_REP_FILL_HEADER,alignment:{horizontal:"center",vertical:"center"},border:_REP_BORDER_FULL};
  ["A8","B8","C8","D8","A18","B18","C18","D18"].forEach(a=>{if(ws1[a])ws1[a].s=styleTblHeader});
  // Filas de datos KPI: zebra
  const _zebraRows=[9,10,11,12,13,14,15,19,20,21];
  _zebraRows.forEach(r=>{
    const fill=(r%2===0)?_REP_FILL_ZEBRA:_REP_FILL_WHITE;
    ["A","B","C","D"].forEach((c,i)=>{
      const addr=c+r;
      if(!ws1[addr])return;
      const isPesos=(c==="B"&&typeof ws1[addr].v==="number");
      ws1[addr].s={
        font:_REP_FONT_BASE,
        fill:fill,
        alignment:{horizontal:i===0?undefined:(i===1?"right":"center")},
        border:_REP_BORDER_FULL,
        ...(isPesos?{numFmt:_REP_FMT_PESOS}:{})
      };
    });
  });
  // Alturas
  ws1["!rows"]=[
    {hpt:36},{hpt:8.1},{hpt:15.75},{hpt:15.75},{hpt:15.75},
    {hpt:8.1},{hpt:27.95},{hpt:24},
    {hpt:15.75},{hpt:15.75},{hpt:15.75},{hpt:15.75},{hpt:15.75},{hpt:15.75},{hpt:15.75},
    {hpt:8.1},{hpt:27.95},{hpt:24},
    {hpt:15.75},{hpt:15.75},{hpt:15.75}
  ];
  XLSX.utils.book_append_sheet(wb,ws1,"Resumen");

  // ═══ HOJA 2: Pedidos detallados ═══════════════════════════
  const aoa2=[["Fecha entrega","Hora","Cliente","Doc","Tipo","Estado","Producido","# Productos","Total","Cobrado","Saldo","Teléfono","Dirección","Ciudad"]];
  docs.forEach(q=>{
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    const cobrado=total-saldo;
    const nProd=(q.cart||[]).length+(q.cust||[]).length+(q.sections||[]).reduce((s,sec)=>s+(sec.options||[]).reduce((s2,o)=>s2+(o.items||[]).length,0),0);
    aoa2.push([
      _reportesGetFecha(q),
      q.horaEntrega||(q.orderData||{}).horaEntrega||"",
      q.client||"",q.id||"",
      q.kind==="quote"?"Cotización":"Propuesta",
      (typeof STATUS_META!=="undefined"&&STATUS_META[q.status]?.label)||q.status||"",
      q.produced?"Sí":"",nProd,total,cobrado,saldo,
      q.tel||"",q.dir||"",q.city||""
    ]);
  });
  const ws2=XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!cols"]=[{wch:15.875},{wch:9.125},{wch:26.625},{wch:20},{wch:14.125},{wch:13.375},{wch:11.625},{wch:13.375},{wch:15.875},{wch:13},{wch:12.5},{wch:13},{wch:41.625},{wch:15}];
  ws2["!freeze"]={xSplit:0,ySplit:1};
  _repFormatearTabla(ws2,docs.length,[
    {align:"center"},{align:"center"},{},{align:"center"},{align:"center"},{align:"center"},
    {align:"center"},{align:"center"},
    {align:"right",pesos:true},{align:"right",pesos:true},{align:"right",pesos:true},
    {},{},{}
  ]);
  XLSX.utils.book_append_sheet(wb,ws2,"Pedidos");

  // ═══ HOJA 3: Productos por pedido ═════════════════════════
  const aoa3=[["Fecha","Hora","Cliente","Doc","Sección","Opción","Producto","Descripción","Unidad","Cantidad","P.Unit","Subtotal","Custom"]];
  docs.forEach(q=>{
    const base=[_reportesGetFecha(q),q.horaEntrega||"",q.client||"",q.id||""];
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>{const qty=parseInt(it.qty)||0,p=parseInt(it.p)||0;aoa3.push([...base,"","",it.n||"",it.d||"",it.u||"",qty,p,qty*p,""])});
      (q.cust||[]).forEach(it=>{const qty=parseInt(it.qty)||0,p=parseInt(it.p)||0;aoa3.push([...base,"","",it.n||"",it.d||"",it.u||"",qty,p,qty*p,"Sí"])});
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{const qty=parseInt(it.qty)||0,p=parseInt(it.price)||0;aoa3.push([...base,sec.name||"",opt.label||"",it.name||"",it.desc||"",it.unit||"",qty,p,qty*p,it.customId?"Sí":""])})));
    }
  });
  const ws3=XLSX.utils.aoa_to_sheet(aoa3);
  ws3["!cols"]=[{wch:15.875},{wch:9.125},{wch:26.625},{wch:20},{wch:12.5},{wch:9},{wch:38.375},{wch:30},{wch:16.625},{wch:10.875},{wch:14.125},{wch:13},{wch:10}];
  ws3["!freeze"]={xSplit:0,ySplit:1};
  _repFormatearTabla(ws3,aoa3.length-1,[
    {align:"center"},{align:"center"},{},{align:"center"},{align:"center"},{align:"center"},
    {},{},{align:"center"},{align:"center"},
    {align:"right",pesos:true},{align:"right",pesos:true},
    {align:"center"}
  ]);
  XLSX.utils.book_append_sheet(wb,ws3,"Productos");

  // ═══ HOJA 4: Resumen por día ══════════════════════════════
  const porDia={};
  docs.forEach(q=>{
    const f=_reportesGetFecha(q)||"(sin fecha)";
    if(!porDia[f])porDia[f]={count:0,total:0,cobrado:0,saldo:0,clientes:new Set()};
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    porDia[f].count++;porDia[f].total+=total;porDia[f].cobrado+=(total-saldo);porDia[f].saldo+=saldo;
    if(q.client)porDia[f].clientes.add(q.client);
  });
  const aoa4=[["Fecha entrega","# Docs","Total","Cobrado","Saldo","Clientes"]];
  Object.keys(porDia).sort().forEach(f=>{
    const g=porDia[f];
    aoa4.push([f,g.count,g.total,g.cobrado,g.saldo,Array.from(g.clientes).sort().join(", ")]);
  });
  const ws4=XLSX.utils.aoa_to_sheet(aoa4);
  ws4["!cols"]=[{wch:16.625},{wch:10},{wch:17.5},{wch:13.375},{wch:13.375},{wch:50}];
  ws4["!freeze"]={xSplit:0,ySplit:1};
  _repFormatearTabla(ws4,Object.keys(porDia).length,[
    {align:"center"},{align:"center"},
    {align:"right",pesos:true},{align:"right",pesos:true},{align:"right",pesos:true},
    {}
  ]);
  XLSX.utils.book_append_sheet(wb,ws4,"Por dia");

  // ═══ HOJA 5: Producción agregada ══════════════════════════
  // Key compuesto = nombre + descripcion para no mezclar variantes
  // (ej: Lasagna Cerdo vs Lasagna Pollo vs Lasagna Res). Cocina
  // necesita las cantidades por variante exacta.
  const porProd={};
  docs.forEach(q=>{
    const procItem=(name,desc,qty,subtotal)=>{
      if(!name)return;
      const key=name+"|"+(desc||"");
      if(!porProd[key])porProd[key]={name:name,desc:desc||"",qty:0,pedidos:new Set(),subtotal:0};
      porProd[key].qty+=qty;porProd[key].pedidos.add(q.id);porProd[key].subtotal+=subtotal;
    };
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>procItem(it.n,it.d,parseInt(it.qty)||0,(parseInt(it.qty)||0)*(parseInt(it.p)||0)));
      (q.cust||[]).forEach(it=>procItem(it.n,it.d,parseInt(it.qty)||0,(parseInt(it.qty)||0)*(parseInt(it.p)||0)));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>procItem(it.name,it.desc,parseInt(it.qty)||0,(parseInt(it.qty)||0)*(parseInt(it.price)||0)))));
    }
  });
  const aoa5=[["Producto","Descripción / Variante","Cantidad total","# Pedidos","Subtotal"]];
  Object.keys(porProd).sort().forEach(k=>{
    const g=porProd[k];
    aoa5.push([g.name,g.desc,g.qty,g.pedidos.size,g.subtotal]);
  });
  const ws5=XLSX.utils.aoa_to_sheet(aoa5);
  ws5["!cols"]=[{wch:36},{wch:32},{wch:14},{wch:11},{wch:14}];
  ws5["!freeze"]={xSplit:0,ySplit:1};
  _repFormatearTabla(ws5,Object.keys(porProd).length,[
    {},{},
    {align:"center"},{align:"center"},
    {align:"right",pesos:true}
  ]);
  XLSX.utils.book_append_sheet(wb,ws5,"Produccion");

  // Descargar
  const fname="gourmet-bites-reporte-"+filtros.desde+"-a-"+filtros.hasta+".xlsx";
  XLSX.writeFile(wb,fname);
  if(typeof toast==="function")toast("📥 Excel descargado: "+fname,"success");
}

function renderCarteraCard(q,urgencia){
  const cli=q.client||"(sin cliente)";
  const id=q.id||"";
  const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
  const saldo=saldoPendiente(q);
  const cobrado=total-saldo;
  const fecha=carteraGetFecha(q);
  const hora=q.horaEntrega||(q.orderData||{}).horaEntrega||"";
  const statusLbl=(typeof STATUS_META!=="undefined"&&STATUS_META[q.status]?.label)||q.status||"";
  const _pagos=(typeof getPagos==="function")?getPagos(q):[];
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  const escape=typeof h==="function"?h:(s=>String(s||""));
  const borderColor={vencido:"#C62828",esta_semana:"#E65100",proximas:"#1B5E20",sin_fecha:"#999"}[urgencia];

  return '<div style="background:#fff;border-left:3px solid '+borderColor+';border-radius:6px;padding:10px 12px;margin:0 4px 6px;box-shadow:0 1px 3px rgba(0,0,0,.06)">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:160px">'+
        '<div style="font-weight:700;font-size:14px;color:#212121">'+escape(cli)+'</div>'+
        '<div style="font-size:11px;color:#666;margin-top:2px">'+escape(id)+' · '+escape(statusLbl)+(fecha?(' · 📅 '+escape(fecha)+(hora?' '+escape(hora):'')):'')+'</div>'+
      '</div>'+
      '<div style="text-align:right;font-size:11px;color:#888;line-height:1.5">'+
        '<div>Total '+fmt(total)+'</div>'+
        '<div>Cobrado '+fmt(cobrado)+'</div>'+
        '<div style="font-weight:700;font-size:14px;color:'+borderColor+';margin-top:2px">Saldo '+fmt(saldo)+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'+
      '<button class="btn hc-btn-pago" onclick="openPagoModal(\''+id+'\',event)">💵 Cobrar</button>'+
      (_pagos.length?'<button class="btn hc-btn-pagos-ver" onclick="openVerPagosModal(\''+id+'\',event)">📒 Ver pagos ('+_pagos.length+')</button>':'')+
    '</div>'+
    '</div>';
}
