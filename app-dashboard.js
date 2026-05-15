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
  const todayIso=gbDateToIso(today);
  if(dashPeriod==="all")return{start:"0000-01-01",end:"9999-12-31",label:"Histórico completo"};
  // v7.0-α D1.1: período "Hoy" — start y end son el mismo día
  if(dashPeriod==="today")return{start:todayIso,end:todayIso,label:"Hoy ("+todayIso+")"};
  if(dashPeriod==="week"){const start=new Date(today);start.setDate(start.getDate()-6);return{start:gbDateToIso(start),end:todayIso,label:"Últimos 7 días ("+gbDateToIso(start)+" → "+todayIso+")"}}
  if(dashPeriod==="month"){const start=new Date(today.getFullYear(),today.getMonth(),1);return{start:gbDateToIso(start),end:todayIso,label:"Mes en curso ("+gbDateToIso(start).slice(0,7)+")"}}
  if(dashPeriod==="year"){const start=new Date(today.getFullYear(),0,1);return{start:gbDateToIso(start),end:todayIso,label:"Año en curso ("+today.getFullYear()+")"}}
  // v5.0.2: rango custom
  if(dashPeriod==="custom"&&dashCustomFrom&&dashCustomTo){
    return {start:dashCustomFrom,end:dashCustomTo,label:"Rango personalizado ("+dashCustomFrom+" → "+dashCustomTo+")"};
  }
  // Fallback si custom pero sin fechas: comportarse como mes
  const start=new Date(today.getFullYear(),today.getMonth(),1);
  return{start:gbDateToIso(start),end:todayIso,label:"Mes en curso ("+gbDateToIso(start).slice(0,7)+")"};
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
    start:gbDateToIso(prevStart),
    end:gbDateToIso(prevEnd),
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
// 2) Producir hoy — pedido/aprobada con fechaProduccion=hoy y !q.produced.
//    Modelo: producción se hace el día anterior a la entrega (v7.8.4),
//    así que "producir hoy" = entrega MAÑANA. Caso edge urgente: entrega
//    HOY pero todavía sin producir → también entra como urgency=0.5 (más
//    arriba que las producciones normales).
//    v7.8.11.1: corregir criterio (antes usaba fEnt=hoy = entrega hoy,
//    lo cual confundía con la rama 3 y dejaba sin mostrar las producciones
//    reales del día — entregas de mañana).
// 3) Entregar hoy — status=en_produccion CON fechaEntrega=hoy, O bien
//    status in [pedido,aprobada] + q.produced=true CON fechaEntrega=hoy.
//    v7.8.11.1: incluir produced=true sobre status=pedido/aprobada porque
//    desde v7.8.7 el flujo no cambia status al marcar producido — el flag
//    q.produced es independiente. Antes el widget no mostraba estos pedidos.
function computeTodayZone(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayIso=gbDateToIso(today);
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
    // 2) Producir hoy — v7.8.11.1: criterio corregido a fechaProduccion
    if(["pedido","aprobada"].includes(s)&&!q.produced){
      const fechaProd=_fechaProduccion(fEnt);
      const esProdHoy=fechaProd===todayIso;        // entrega mañana
      const esEntregaHoySinProd=fEnt===todayIso;   // edge urgente: entrega hoy sin producir
      if(esProdHoy||esEntregaHoySinProd){
        const hora=q.horaEntrega||"";
        items.push({
          urgency:esEntregaHoySinProd?0.5:1,
          q:q,
          when:esEntregaHoySinProd?"🚨 URGENTE":"PRODUCIR HOY",
          whenSub:esEntregaHoySinProd?"entrega HOY sin producir":(hora?"entrega mañana "+hora:"para mañana"),
          tag:"PRODUCCIÓN",
          title:(q.client||"—")+" · falta producir",
          sub:(q.id||"")+(hora?" · entrega "+hora:""),
          amount:getDocTotal(q),
          sortKey:hora||"99:99"
        });
      }
    }
    // 3) Entregar hoy — v7.8.11.1: aceptar también status=pedido/aprobada con produced=true
    if((s==="en_produccion"||(["pedido","aprobada"].includes(s)&&q.produced))&&fEnt===todayIso){
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
// v7.8.11.1: resumen agregado de la jornada (entregas + producciones).
// Cubre tanto pendientes como completadas para visibilidad de carga del día.
function _computeTodayCounts(){
  const today=new Date();today.setHours(0,0,0,0);
  const todayIso=gbDateToIso(today);
  let entregasHoy=0,produccionesHoy=0,produccionesHechas=0;
  (quotesCache||[]).forEach(q=>{
    if(q._wrongCollection)return;
    const s=q.status||"enviada";
    if(["anulada","superseded","convertida","entregado"].includes(s))return;
    const fEnt=q.fechaEntrega||q.eventDate;
    if(!fEnt)return;
    if(fEnt===todayIso)entregasHoy++;
    const fechaProd=_fechaProduccion(fEnt);
    if(fechaProd===todayIso&&["pedido","aprobada"].includes(s)){
      produccionesHoy++;
      if(q.produced)produccionesHechas++;
    }
  });
  return {entregasHoy,produccionesHoy,produccionesHechas};
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

  // v7.8.11.1: barra resumen de la jornada (siempre visible si hay actividad)
  const counts=_computeTodayCounts();
  const hayActividad=counts.entregasHoy>0||counts.produccionesHoy>0;
  let summaryHtml="";
  if(hayActividad){
    const parts=[];
    if(counts.entregasHoy>0){
      parts.push('📦 '+counts.entregasHoy+' entrega'+(counts.entregasHoy!==1?'s':'')+' hoy');
    }
    if(counts.produccionesHoy>0){
      const pendientes=counts.produccionesHoy-counts.produccionesHechas;
      let txt='🔪 '+counts.produccionesHoy+' producci'+(counts.produccionesHoy!==1?'ones':'ón')+' hoy';
      if(counts.produccionesHechas>0){
        if(pendientes===0)txt+=' (✅ todo listo)';
        else txt+=' (✅ '+counts.produccionesHechas+' lista'+(counts.produccionesHechas!==1?'s':'')+' / '+pendientes+' pendiente'+(pendientes!==1?'s':'')+')';
      }
      parts.push(txt);
    }
    summaryHtml='<div style="padding:8px 12px;background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;margin-bottom:10px;font-size:12.5px;color:#5D4037;font-weight:600;display:flex;flex-wrap:wrap;gap:14px;line-height:1.4">'+parts.map(p=>'<span>'+p+'</span>').join('')+'</div>';
  }

  if(!items.length){
    const emptyMsg=hayActividad?'Todo listo ✓':'Nada urgente hoy ✓';
    list.innerHTML=summaryHtml+'<div class="today-empty">'+emptyMsg+'</div>';
    return;
  }
  list.innerHTML=summaryHtml+items.map(it=>{
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
  // v7.9.4.4: fix typo en email de JP ("panadrade" → "pandrade") + agregado Emilio.
  const NOMBRE_POR_EMAIL={
    "juanpandrade2005@gmail.com":"Juan Pablo",
    "kathy.matuk@gmail.com":"Kathy",
    "luisrandrade@gmail.com":"Luis R",
    "eammv1997@gmail.com":"Emilio"
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
  // v7.7.5.1: garantizar que el botón de período activo esté marcado en el PRIMER
  // render (antes solo se actualizaba al hacer click → si Luis cargaba directo al
  // dashboard nunca veía cuál estaba activo).
  try{
    document.querySelectorAll(".dp-btn").forEach(b=>b.classList.toggle("act",b.dataset.p===dashPeriod));
  }catch{}
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
  _safe(renderBannerComprasPendientes,"banner-compras-pendientes");
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
    const todayIso2=gbTodayIso();
    const t14=new Date();t14.setDate(t14.getDate()+14);
    const t14Iso=gbDateToIso(t14);
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
  // v7.7.3: Bloque "Últimos comentarios" migrado a Clientes > Comentarios.
  //         La lógica completa de listado vive ahora en renderClientesComentarios.
  // D1.2: el anchor del banner novedades se congela al primer render (ver renderBannerNovedades)
  // y solo se persiste con saveLastVisit() en dismissNovedades(). NO guardar acá: rompería el delta.
}

// ─── MINI-DASHBOARD landing cotización ─────────────────────
async function renderMiniDash(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const dashEl=$("mini-dash");if(!dashEl)return;
  const today=new Date();
  const todayIso=gbDateToIso(today);
  const weekEnd=new Date(today);weekEnd.setDate(weekEnd.getDate()+7);
  const weekEndIso=gbDateToIso(weekEnd);
  const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowIso=gbDateToIso(tomorrow);
  const pasado=new Date(today);pasado.setDate(pasado.getDate()+2);
  const pasadoIso=gbDateToIso(pasado);
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
function weekToday(){weekAnchor=getMondayIso(gbTodayIso());renderWeek()}
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

// v7.6.5: deriva fecha de producción (productionDate o eventDate-1)
function _calProdDate(q){
  if(q.productionDate)return q.productionDate;
  if(!q.eventDate)return null;
  const d=isoToDate(q.eventDate);d.setDate(d.getDate()-1);
  return dateToIso(d);
}
// v7.6.5: ¿este doc requiere mostrar entrada 'producir' en agenda?
function _shouldShowProduccion(q){
  if(q.produced)return false;
  const s=q.status||"enviada";
  if(s==="entregado"||s==="anulada"||s==="superseded")return false;
  if(q.kind==="quote")return ["pedido","en_produccion"].includes(s);
  if(q.kind==="proposal")return ["aprobada","en_produccion"].includes(s);
  return false;
}
// v7.6.5: devuelve entries [{iso,tipo:'producir'|'entregar',q}] para agenda.
// Cada doc puede aportar 2: una en eventDate (entregar) y otra en prodDate (producir).
// Si prodDate==eventDate (mismo día) NO se duplica — la tarjeta de entrega ya muestra chip "Por producir hoy".
function eventsForCalendarEntries(){
  const out=[];
  eventsAllStatuses().forEach(q=>{
    if(q.eventDate)out.push({iso:q.eventDate,tipo:"entregar",q:q});
    const pd=_calProdDate(q);
    if(pd&&pd!==q.eventDate&&_shouldShowProduccion(q))out.push({iso:pd,tipo:"producir",q:q});
  });
  return out;
}
// v7.6.5: label corto de cuándo entrega ("hoy", "mañana", "DD MMM")
function _calEntregaLabel(iso){
  if(!iso)return "—";
  const todayIso=gbTodayIso();
  if(iso===todayIso)return "hoy";
  const t=new Date();t.setDate(t.getDate()+1);
  const tomorrowIso=t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");
  if(iso===tomorrowIso)return "mañana";
  const p=parseIsoDate(iso);if(!p)return iso;
  const mShort=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  return p.d+" "+mShort[p.m];
}
// v7.6.5: tarjeta CHICA de "producir" — Opción B confirmada con Luis.
// Una sola línea: cliente + cuándo entrega + monto. Click → abre doc.
function renderWeekProductionCard(q){
  const cli=(q.client||"—").replace(/[<>]/g,"");
  const total=fm(getDocTotal(q));
  const entStr=_calEntregaLabel(q.eventDate);
  const hora=q.horaEntrega?" "+q.horaEntrega:"";
  return '<div class="wd-ev-prod" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
    '<span class="wep-icon">🔥</span>'+
    '<span class="wep-label">Producir <strong>'+cli+'</strong></span>'+
    '<span class="wep-meta">entrega '+entStr+hora+' · '+total+'</span>'+
  '</div>';
}

function renderWeek(){
  if(!weekAnchor)weekAnchor=getMondayIso(gbTodayIso());
  const start=isoToDate(weekAnchor);
  const end=new Date(start);end.setDate(end.getDate()+6);
  const todayIso=gbTodayIso();
  const monthNames=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const mShort=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const dows=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const startStr=start.getDate()+" "+mShort[start.getMonth()];
  const endStr=end.getDate()+" "+mShort[end.getMonth()]+" "+end.getFullYear();
  $("week-title").textContent="Semana del "+startStr+" al "+endStr;
  // v7.6.5: ahora cada doc puede aportar 2 entries (producir + entregar)
  const entries=eventsForCalendarEntries();
  const byDay={};
  entries.forEach(e=>{(byDay[e.iso]=byDay[e.iso]||[]).push(e)});
  // Render 7 días
  let html="";
  for(let i=0;i<7;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const iso=dateToIso(d);
    const evs=(byDay[iso]||[]).sort((a,b)=>{
      // Producir primero (qué cocinar hoy), luego entregas ordenadas por hora
      if(a.tipo!==b.tipo)return a.tipo==="producir"?-1:1;
      return (a.q.horaEntrega||"").localeCompare(b.q.horaEntrega||"");
    });
    const isToday=iso===todayIso;
    const dayClass="week-day"+(isToday?" today":"")+(evs.length?"":" empty-day");
    const dateBox='<div class="wd-date"><div class="wd-dow">'+dows[i]+'</div><div class="wd-num">'+d.getDate()+'</div><div class="wd-mon">'+mShort[d.getMonth()]+'</div></div>';
    let evsHtml;
    if(!evs.length){evsHtml='<div class="wd-empty-msg">Sin eventos</div>'}
    else{
      evsHtml='<div class="wd-evs">'+evs.map(e=>{
        return e.tipo==="producir"?renderWeekProductionCard(e.q):renderWeekEventCard(e.q,iso,todayIso);
      }).join("")+'</div>';
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

// v7.6.5: entries del mes (producir + entregar) reusando eventsForCalendarEntries
function entriesForMonth(year,month){
  return eventsForCalendarEntries().filter(e=>{
    const p=parseIsoDate(e.iso);
    return p&&p.y===year&&p.m===month;
  }).sort((a,b)=>{
    if(a.iso!==b.iso)return a.iso.localeCompare(b.iso);
    // Mismo día: producir antes que entregar; entre entregas, por hora
    if(a.tipo!==b.tipo)return a.tipo==="producir"?-1:1;
    return (a.q.horaEntrega||"").localeCompare(b.q.horaEntrega||"");
  });
}

function renderMonth(){
  const monthNames=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  $("cal-title").textContent=monthNames[calMonth]+" "+calYear;
  const firstDay=new Date(calYear,calMonth,1);
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  let leadingBlanks=firstDay.getDay()-1;if(leadingBlanks<0)leadingBlanks=6;
  const monthEntries=entriesForMonth(calYear,calMonth);
  const byDay={};
  monthEntries.forEach(e=>{const p=parseIsoDate(e.iso);if(!p)return;if(!byDay[p.d])byDay[p.d]=[];byDay[p.d].push(e)});
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
      // v7.6.5: pastillas con prefijo según tipo (🔥 producir / 🚚 entregar)
      const pastillas=evs.slice(0,2).map(e=>{
        const lbl=(e.q.client||"—").split(/\s+/)[0].slice(0,7);
        const cls="cd-ev cd-ev-"+e.tipo+" "+(e.q.status||"");
        const ico=e.tipo==="producir"?"🔥":"🚚";
        return '<div class="'+cls+'" title="'+(e.tipo==="producir"?"Producir ":"Entregar ")+(e.q.client||"")+'">'+ico+' '+lbl+'</div>';
      }).join("");
      const extra=evs.length>2?'<div class="cd-ev cd-ev-more">+'+(evs.length-2)+'</div>':"";
      inner+='<div class="cd-evs">'+pastillas+extra+'</div>';
    }
    cells+='<div class="'+classes+'"'+onclick+'>'+inner+'</div>';
  }
  $("cal-grid").innerHTML=cells;
  // ──────────── Lista debajo (entries del mes ordenadas) ────────────
  const sumEl=$("cal-sum-list");
  if(!monthEntries.length){
    sumEl.innerHTML='<div class="cal-sum-empty">📅 Sin eventos este mes.</div>';
    $("cal-sum-title").textContent="Eventos del mes";
    return;
  }
  $("cal-sum-title").textContent="Eventos del mes ("+monthEntries.length+")";
  const mShort=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  sumEl.innerHTML=monthEntries.map(e=>{
    const q=e.q;
    const p=parseIsoDate(e.iso);
    const sMeta=STATUS_META[q.status]||STATUS_META.enviada;
    const isQuote=q.kind==="quote";
    const typeTag=isQuote?'<span class="hc-type cot" style="margin-left:4px">Pedido</span>':'<span class="hc-type prop" style="margin-left:4px">Evento</span>';
    const pax=q.pers?q.pers+" pax · ":"";
    const mom=q.momento?q.momento:"";
    const hora=q.horaEntrega?"⏰ "+q.horaEntrega:"";
    const meta=[pax+mom,hora].filter(Boolean).join(" · ");
    // v7.6.5: prefijo según tipo
    const accionPrefix=e.tipo==="producir"?'<span class="cal-ev-accion cal-ev-prod">🔥 Producir</span> ':'<span class="cal-ev-accion cal-ev-ent">🚚 Entregar</span> ';
    const card='<div class="cal-ev-card cal-ev-'+e.tipo+' '+q.status+'" id="cal-ev-'+p.d+'-'+e.tipo+'-'+q.id+'" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="cal-ev-date"><div class="d">'+p.d+'</div><div class="m">'+mShort[p.m]+'</div></div>'+
      '<div class="cal-ev-body">'+
        '<div class="cal-ev-cli">'+accionPrefix+(q.client||"—")+typeTag+' <span class="hc-status '+sMeta.cls+'" style="margin-left:4px">'+sMeta.label+'</span></div>'+
        '<div class="cal-ev-meta"><span>'+meta+'</span></div>'+
      '</div>'+
    '</div>';
    return card;
  }).join("");
  // v7.6.5 hook: cuando llegue v7.8 (módulo Compras), agregar acá un 3er tipo de entry:
  //   {iso, tipo:'comprar', q?} con prefijo "🛒 Compras por hacer" navegable al módulo Compras.
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
        // v7.6.1: text explícito para evitar blob URL parásito en iOS share
        await navigator.share({files:[file],text:"Agenda Gourmet Bites — "+filename.replace(/\.ics$/,"")});
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
          const todayIso=gbTodayIso();
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
      const todayIso=gbTodayIso();
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
  const hoyIso=gbTodayIso();
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
    const hoyIso=gbTodayIso();
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
  // v7.7.5.1: deprecated. Antes mostraba "X pedidos por sincronizar con Kathy y JP"
  // del flujo viejo (compartir .ics manual por WhatsApp). Con v7.7.5 el sync es
  // automático via Firebase Function suscribible — Kathy y JP ven los pedidos
  // sin que Luis tenga que mandar nada. Banner siempre oculto.
  const el=$("dash-banner-sync");
  if(el){el.classList.add("hidden");el.innerHTML=""}
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
    const hoyIso=gbTodayIso();
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
// ═══════════════════════════════════════════════════════════
// v7.7.5: SYNC AGENDA EXTERNA — panel UI para link suscribible
// ═══════════════════════════════════════════════════════════
// El backend (Firebase Function agendaIcs) ya está deployado en
// https://agendaics-zeuz3hinla-uc.a.run.app y requiere ?token=XXX.
// El TOKEN no se hardcodea acá (repo público) — Luis lo introduce
// una vez y queda en localStorage de su PC.
//
// v7.9.6 F3 (2026-05-11): trade-off Codex 6.4 documentado y aceptado.
// Token viaja en query string + localStorage. Filtración limitada por
// uso interno (3 personas). Proceso de rotación documentado en
// functions/index.js y _internos/Onboarding_infraestructura.json.
// Cambio a Bearer descartado: clientes .ics (Apple/Google Cal) no
// soportan Authorization headers en suscripciones.

const SYNC_AGENDA_URL_BASE = "https://agendaics-zeuz3hinla-uc.a.run.app";
const SYNC_AGENDA_TOKEN_KEY = "gb_sync_agenda_token";

function renderSyncAgendaPanel(){
  const el = $("sync-agenda-panel");
  if(!el) return;
  const token = (localStorage.getItem(SYNC_AGENDA_TOKEN_KEY)||"").trim();
  if(!token){
    el.innerHTML = ''+
      '<div style="background:#FFF3E0;border:1px solid #FFB300;border-left:4px solid #FB8C00;border-radius:10px;padding:14px 16px;font-size:13px;color:#5D4037">'+
        '<div style="font-weight:700;color:#E65100;margin-bottom:8px">🔐 Configurar token (1 sola vez)</div>'+
        '<div style="margin-bottom:10px;line-height:1.5">El token es un código privado que protege la URL. Lo tenés en <code style="background:#fff;padding:1px 5px;border-radius:3px">_internos/Sync_agenda_token_PRIVADO.md</code> de tu OneDrive. Pegalo abajo:</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<input id="sync-agenda-token-in" type="password" placeholder="Pegar token aquí" style="flex:1;min-width:200px;padding:8px 11px;border:1.5px solid #BDBDBD;border-radius:6px;font-size:13px;font-family:monospace">'+
          '<button onclick="saveSyncAgendaToken()" style="background:#1B5E20;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">Guardar</button>'+
        '</div>'+
      '</div>';
    return;
  }
  const url = SYNC_AGENDA_URL_BASE + "?token=" + encodeURIComponent(token);
  el.innerHTML = ''+
    '<div style="margin-bottom:12px">'+
      '<label style="font-size:11px;color:#757575;display:block;margin-bottom:4px;font-weight:700;text-transform:uppercase;letter-spacing:.3px">🔗 Link de suscripción para Kathy y JP</label>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<input id="sync-agenda-url" type="text" readonly value="'+h(url)+'" onclick="this.select()" style="flex:1;min-width:200px;padding:8px 11px;border:1.5px solid #BDBDBD;border-radius:6px;font-size:11.5px;font-family:monospace;background:#FAFAFA">'+
        '<button onclick="copySyncAgendaUrl()" style="background:#1B5E20;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">📋 Copiar</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+
      '<button onclick="shareSyncAgendaWA(\'kathy\')" style="background:#25D366;color:#fff;border:none;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">📲 Mandar a Kathy</button>'+
      '<button onclick="shareSyncAgendaWA(\'jp\')" style="background:#25D366;color:#fff;border:none;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">📲 Mandar a JP</button>'+
      '<button onclick="forgetSyncAgendaToken()" style="background:#fff;color:#C62828;border:1px solid #EF9A9A;padding:7px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:var(--gb-font-body)">🗑️ Borrar token guardado</button>'+
    '</div>'+
    '<details style="background:#F5F5F5;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#5D4037">'+
      '<summary style="cursor:pointer;font-weight:700">📱 Cómo se suscriben Kathy y JP (instrucciones para mandarles)</summary>'+
      '<div style="margin-top:10px;line-height:1.6">'+
        '<div style="font-weight:700;margin-bottom:4px;color:#01579B">Si usan iPhone (Apple Calendar):</div>'+
        '<ol style="margin:0 0 12px 18px;padding:0">'+
          '<li>Abrir <strong>Configuración</strong> del iPhone.</li>'+
          '<li>Calendario → Cuentas → Añadir cuenta.</li>'+
          '<li>Otra → Añadir calendario suscrito.</li>'+
          '<li>Pegar la URL y tocar "Siguiente" → "Guardar".</li>'+
        '</ol>'+
        '<div style="font-weight:700;margin-bottom:4px;color:#01579B">Si usan Google Calendar:</div>'+
        '<ol style="margin:0 0 8px 18px;padding:0">'+
          '<li>Entrar a <code style="background:#fff;padding:1px 5px;border-radius:3px">calendar.google.com</code> desde computador.</li>'+
          '<li>Lateral izq: <strong>+ Otros calendarios</strong> → "Por URL".</li>'+
          '<li>Pegar la URL y "Añadir calendario".</li>'+
        '</ol>'+
        '<div style="margin-top:10px;font-style:italic;color:#757575">El calendario se actualiza solo cada 1-3 horas. Los eventos aparecen como "🔥 Producir [cliente]" y "🚚 Entrega [cliente]".</div>'+
      '</div>'+
    '</details>';
}

function saveSyncAgendaToken(){
  const v = ($("sync-agenda-token-in")?.value||"").trim();
  if(!v){toast("Pegá el token primero","warn");return}
  localStorage.setItem(SYNC_AGENDA_TOKEN_KEY, v);
  toast("✅ Token guardado","success");
  renderSyncAgendaPanel();
}

function forgetSyncAgendaToken(){
  if(!confirm("¿Borrar el token guardado en este dispositivo? Vas a tener que pegarlo de nuevo si querés ver el link otra vez."))return;
  localStorage.removeItem(SYNC_AGENDA_TOKEN_KEY);
  toast("Token borrado","success");
  renderSyncAgendaPanel();
}

function copySyncAgendaUrl(){
  const inp = $("sync-agenda-url");
  if(!inp)return;
  inp.select();
  try{
    navigator.clipboard.writeText(inp.value).then(()=>toast("📋 Link copiado al portapapeles","success"));
  }catch(e){
    document.execCommand("copy");
    toast("📋 Link copiado","success");
  }
}

function shareSyncAgendaWA(quien){
  const url = $("sync-agenda-url")?.value;
  if(!url)return;
  const nombre = quien==="kathy"?"Kathy":"JP";
  const msg = "Hola "+nombre+"! Te paso el link para suscribir tu calendario y ver los pedidos de Gourmet Bites. Lo abrís y lo agregás a tu Apple Calendar / Google Calendar (instrucciones en el panel de la app, te paso aparte si necesitás). Link:\n\n"+url+"\n\n— Luis";
  const wa = "https://wa.me/?text="+encodeURIComponent(msg);
  window.open(wa,"_blank");
}

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
    // v7.6.1: backup es confidencial — solo descarga, sin Web Share.
    // No se comparte a apps externas; se guarda local (Downloads en desktop, Files en iPhone).
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
        const coll=getCollectionName(q.id,kind);
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
      const coll=getCollectionName(t.docId,t.kind);
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
      const coll=getCollectionName(q.id,q.kind);
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
  toast("✅ Normalización completa · OK: "+ok+" · Errores: "+err+". Los docs ahora aparecen en Pipeline, Vigentes y Seguimiento.","success",7000);
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
// v7.9.7.1 F6: expansión doc → despachos. Cada entrada es {q, despacho, idx, total, fechaIso, hora}.
// Para docs legacy (sin despachos[]), getDespachos devuelve 1 despacho derivado del eventDate.
// Para docs con N despachos explícitos, la propuesta aparece N veces ordenada por fechaHora.
function _expandirParaUrgent3d(qDocs){
  const out=[];
  qDocs.forEach(q=>{
    const ds=(typeof getDespachos==="function")?getDespachos(q):[];
    if(!ds.length){
      // Fallback ultra-defensivo: no debería ocurrir porque getDespachos devuelve al menos 1
      const fecha=q.eventDate||q.fechaEntrega||"";
      out.push({q,despacho:null,idx:0,total:1,fechaIso:fecha,hora:q.horaEntrega||""});
      return;
    }
    ds.forEach((d,i)=>{
      // fechaHora es "YYYY-MM-DDTHH:mm" en local Bogotá. Separar.
      const fh=(d.fechaHora||"").trim();
      let fechaIso="",hora="";
      if(fh){
        const t=fh.indexOf("T");
        if(t>0){fechaIso=fh.slice(0,t);hora=fh.slice(t+1,t+6)}
        else{fechaIso=fh.slice(0,10);hora=""}
      }else{
        fechaIso=q.eventDate||q.fechaEntrega||"";
        hora=q.horaEntrega||"";
      }
      out.push({q,despacho:d,idx:i,total:ds.length,fechaIso,hora});
    });
  });
  return out;
}

function renderUrgent3d(){
  const prodBody=$("dash-urgent-prod-body");
  const entBody=$("dash-urgent-ent-body");
  const prodCount=$("dash-urgent-prod-count");
  const entCount=$("dash-urgent-ent-count");
  if(!prodBody||!entBody)return;

  const todayIso=gbTodayIso();
  const t3=new Date();t3.setDate(t3.getDate()+3);
  const t3Iso=gbDateToIso(t3);

  // 1. Filtrar docs candidatos (mismo criterio que antes, sin la condición de fecha — esa
  //    pasa al nivel de despacho).
  const docsCandidatos=(quotesCache||[]).filter(q=>{
    if(q._wrongCollection)return false;
    const s=q.status||"enviada";
    if(["anulada","superseded","convertida","entregado"].includes(s))return false;
    return true;
  });

  // 2. Expandir a (doc, despacho) y filtrar por ventana 3 días sobre fechaHora del despacho.
  const entradas=_expandirParaUrgent3d(docsCandidatos)
    .filter(e=>e.fechaIso&&e.fechaIso>=todayIso&&e.fechaIso<=t3Iso);

  // 3. Clasificar en porProducir / porEntregar a nivel de DESPACHO.
  //    Lógica:
  //    - Si el despacho tiene status propio ('producido' o 'entregado') → porEntregar.
  //    - Si el doc completo está produced (legacy o agregado) → porEntregar.
  //    - Si status del doc es 'en_produccion' → porEntregar.
  //    - Si status del doc es 'pedido' o 'aprobada' y el despacho está pendiente → porProducir.
  const porProducir=[],porEntregar=[];
  entradas.forEach(e=>{
    const q=e.q;
    const s=q.status||"enviada";
    const dStatus=e.despacho?e.despacho.status:null;
    if(dStatus==="producido"||dStatus==="entregado"){
      porEntregar.push(e);
    }else if(q.produced){
      porEntregar.push(e);
    }else if(["pedido","aprobada"].includes(s)){
      porProducir.push(e);
    }else if(s==="en_produccion"){
      porEntregar.push(e);
    }
  });

  // 4. Ordenar por fechaHora del despacho ascendente.
  const sortFn=(a,b)=>{
    const ka=(a.fechaIso||"")+"T"+(a.hora||"99:99");
    const kb=(b.fechaIso||"")+"T"+(b.hora||"99:99");
    return ka.localeCompare(kb);
  };
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
// v7.9.7.1 F6: acepta entrada {q, despacho, idx, total, fechaIso, hora} en lugar de q directo.
// Retrocompat: si se llama con un q "viejo" (sin envoltorio), lo envuelve en una entrada legacy.
function urgentItemHtml(entrada){
  // Compat: si llega un doc directo (forma antigua), envolver
  if(entrada&&!entrada.q&&entrada.id){
    entrada={q:entrada,despacho:null,idx:0,total:1,fechaIso:(entrada.eventDate||entrada.fechaEntrega||""),hora:entrada.horaEntrega||""};
  }
  const q=entrada.q;
  const despacho=entrada.despacho;
  const fecha=entrada.fechaIso||(q.eventDate||q.fechaEntrega||"");
  const today=gbTodayIso();
  const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
  const tomorrowIso=gbDateToIso(tomorrow);
  const pasado=new Date();pasado.setDate(pasado.getDate()+2);
  const pasadoIso=gbDateToIso(pasado);
  let fechaLabel=fecha;
  let fechaCls="";
  if(fecha===today){fechaLabel="HOY "+fecha;fechaCls="urgent-d-today"}
  else if(fecha===tomorrowIso){fechaLabel="MAÑANA "+fecha;fechaCls="urgent-d-tomorrow"}
  else if(fecha===pasadoIso){fechaLabel="PASADO "+fecha}
  const hora=entrada.hora?' · ⏰ '+entrada.hora:(q.horaEntrega?' · ⏰ '+q.horaEntrega:'');
  const cli=(q.client||"—").replace(/[<>]/g,"");
  const total=fm(getDocTotal(q));
  // Etiqueta de despacho: solo si hay >1 despacho explícito
  const despachoLabel=(despacho&&entrada.total>1&&!despacho._legacy)
    ?'<span class="urgent-despacho-tag" style="display:inline-block;background:#FFF3E0;color:#E65100;font-size:11px;font-weight:600;padding:1px 6px;border-radius:8px;margin-right:6px">🚚 '+(entrada.idx+1)+'/'+entrada.total+'</span>'
    :"";
  // Chip estado: lógica progresiva por estado del despacho.
  //   - despacho.status === 'entregado' → ✓ Entregado (no hay action)
  //   - despacho.status === 'producido' (granular) → botón "📦 Entregar" → toggleEntregadoDespacho
  //   - q.produced && legacy → ✓ Producido (legacy, sin path granular a entregar acá)
  //   - default → botón "🔪 Marcar producido"
  const dStatus=despacho?despacho.status:null;
  let prodChip;
  if(dStatus==="entregado"){
    const ts=(despacho.entregadoEn||"")+"";
    prodChip='<span class="urgent-prod-done" title="Entregado '+ts.slice(0,10)+'">✓ Entregado</span>';
  }else if(dStatus==="producido"&&despacho&&!despacho._legacy){
    // v7.9.7.1 F7: despacho producido pero no entregado → botón entregar granular.
    prodChip='<button class="urgent-prod-chip" onclick="event.stopPropagation();toggleEntregadoDespacho(\''+q.id+'\',\''+despacho.id+'\',\''+q.kind+'\',event)" style="background:#1B5E20;color:#fff;border:none">📦 Marcar entregado</button>';
  }else if(!!q.produced&&(!despacho||despacho._legacy)){
    // Legacy producido sin granular: el flujo de entrega va por el doc, no acá.
    prodChip='<span class="urgent-prod-done" title="Producido '+((q.producedAt||"")+"").slice(0,10)+'">✓ Producido</span>';
  }else if(despacho&&!despacho._legacy){
    // Despacho explícito aún pendiente → marcar producido granular.
    prodChip='<button class="urgent-prod-chip" onclick="event.stopPropagation();toggleProducedDespacho(\''+q.id+'\',\''+despacho.id+'\',\''+q.kind+'\',event)">🔪 Marcar producido</button>';
  }else{
    // Legacy pendiente → marcar producido del doc entero.
    prodChip='<button class="urgent-prod-chip" onclick="event.stopPropagation();toggleProduced(\''+q.id+'\',\''+q.kind+'\',event)">🔪 Marcar producido</button>';
  }
  return '<div class="urgent-item" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
    '<div class="urgent-item-top">'+
      '<div class="urgent-item-txt">'+
        '<div class="urgent-cli">'+despachoLabel+cli+'</div>'+
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
  const todayIso=gbTodayIso();
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
  const todayIso=gbTodayIso();
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
// v7.8 F3: BANNER "COMPRAS POR HACER" en Dashboard
// Aparece si comprasCache tiene items con estado='pendiente'.
// Tap → cambia a Lista pendiente.
// ═══════════════════════════════════════════════════════════
function renderBannerComprasPendientes(){
  const el=$("dash-banner-compras-pend");
  if(!el)return;
  if(typeof comprasCache==="undefined"){el.classList.add("hidden");el.innerHTML="";return}
  const pendientes=comprasCache.filter(c=>c.estado==="pendiente");
  if(!pendientes.length){el.classList.add("hidden");el.innerHTML="";return}
  // Resumen: hasta 3 nombres de los items
  const nombres=[];
  pendientes.forEach(p=>{
    (p.items||[]).forEach(it=>{
      if(it.nombre&&nombres.length<3)nombres.push(it.nombre);
    });
  });
  const masItems=pendientes.length>3?" · +"+(pendientes.length-3)+" más":"";
  const resumen=nombres.length?nombres.slice(0,3).join(" · ")+masItems:"";
  el.classList.remove("hidden");
  el.innerHTML='<div class="dbf-ic">🛒</div>'+
    '<div class="dbf-txt"><strong>'+pendientes.length+' compra'+(pendientes.length===1?'':'s')+' por hacer</strong>'+
    (resumen?'<br><span style="font-size:11px;opacity:.85">'+escapeHtml(resumen)+'</span>':'')+
    '</div>'+
    '<button onclick="setMode(\'compras-pendientes\')">Ver lista</button>';
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
      '<div class="cr-label">⏳ Aún vigentes (sin cerrar)</div>'+
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
    // v7.8.8: escapeHtml completo en lugar de replace parcial (cubría < > pero no & " ').
    el.innerHTML='<div class="cli-view"><div class="cli-view-title">⚠️ Sin datos para "'+escapeHtml(cli)+'"</div></div>';
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

// v7.5.1 cleanup: openHojaEntregasModal + heQuickRange + closeHojaEntregasModal +
// confirmarGenerarHojaEntregas + generarHojaEntregas ELIMINADOS (modal viejo
// reemplazado por modulo Reportes > Hojas para imprimir en v7.3 commit f1b817a).
// Helpers preservados (usados por PDFs nuevos): hojaFormatFecha,
// hojaProductosCelda, hojaDireccionCelda, hojaNotasPago, hojaFiltrarDocs.
//
//   La funcion generarHojaEntregas se elimino en este punto.

// v7.5.1 cleanup: renderOps + setOpsTab eliminados (modulo Operaciones disuelto en v7.4 F4).
// Su funcionalidad migro al modulo Pedidos (Aprobados / En produccion / Producidos).

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
  const t=new Date();return gbDateToIso(new Date(t.getFullYear(),t.getMonth(),1));
}
function _hoy(){return gbTodayIso()}

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
  // v7.5.2: mostrar TODOS los metodos (incluso los que estan en $0) para
  // que Luis vea el panorama completo. Los $0 se ven en gris sin barra.
  const rows=metodos.map(m=>{
    const v=recaudoMet[m]||0;
    const pct=Math.round(v*100/maxMet);
    const pctTotal=total>0?Math.round(v*100/total):0;
    const isZero=v===0;
    const labelColor=isZero?"#aaa":"#333";
    const barBg=isZero?"#f5f5f5":"#E8F5E9";
    const barFill=isZero?"transparent":"#1B5E20";
    const valColor=isZero?"#aaa":"#1B5E20";
    const valWeight=isZero?"400":"600";
    return '<div style="display:grid;grid-template-columns:140px 1fr 130px;gap:10px;align-items:center;padding:6px 0;font-size:13px;border-bottom:1px solid #f0f0f0">'+
      '<div style="font-weight:'+(isZero?"500":"600")+';color:'+labelColor+'">'+m+'</div>'+
      '<div style="background:'+barBg+';border-radius:4px;height:16px;overflow:hidden"><div style="background:'+barFill+';height:100%;width:'+pct+'%;transition:width .3s"></div></div>'+
      '<div style="text-align:right;font-weight:'+valWeight+';color:'+valColor+'">'+fmt(v)+(isZero?'':' <span style="color:#888;font-weight:400;font-size:11px">('+pctTotal+'%)</span>')+'</div>'+
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

  // v7.9.4: banner de alerta si hay operaciones con error o intentos colgados en últimos 7d
  _checkAuditAlertBanner(listEl);

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
// v7.8.0.1: filtros separados por tab para evitar que el default mensual del
// tab Excel contamine al tab Imprimibles (que necesita default hoy/hoy).
let reportesFiltros={
  desde: "",
  hasta: "",
  estado: "pendientes" // todos | pendientes | entregados
};
let reportesFiltrosImpr={
  desde: "",
  hasta: "",
  estado: "pendientes"
};
let reportesResultado=null; // Cache del ultimo resultado generado

// v7.8.2: setReportesTab queda como no-op por compatibilidad (toggle eliminado).
// "Hojas para imprimir" se movió a Pedidos. Reportes solo tiene Excel.
function setReportesTab(t){/* no-op desde v7.8.2 */}

// Helpers fecha
function _reportesHoy(){return gbTodayIso()}
function _reportesHoyMas(d){const t=new Date();t.setDate(t.getDate()+d);return gbDateToIso(t)}
// v7.8.4: fin de mes actual (último día). Default del tab Excel — más útil que +30
// que cruza meses arbitrariamente.
function _reportesFinDeMes(){
  const t=new Date();
  // Día 0 del mes siguiente = último día del mes actual
  const last=new Date(t.getFullYear(),t.getMonth()+1,0);
  return gbDateToIso(last);
}

function _reportesGetFecha(q){
  return q.eventDate||(q.orderData||{}).fechaEntrega||(q.approvalData||{}).fechaEntrega||"";
}

// v7.8.4: día anterior a una fecha ISO (YYYY-MM-DD). La producción se hace
// el día antes de la entrega.
function _fechaProduccion(isoFecha){
  if(!isoFecha)return "";
  const d=new Date(isoFecha+"T12:00:00");
  if(isNaN(d.getTime()))return "";
  d.setDate(d.getDate()-1);
  const yyyy=d.getFullYear();
  const mm=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return yyyy+"-"+mm+"-"+dd;
}
// Formato corto DD/MM para encabezados
function _fechaCorta(iso){
  if(!iso)return "";
  const p=iso.split("-");
  if(p.length<3)return iso;
  return p[2]+"/"+p[1];
}

// v7.8.4: PRODUCTOS NO PRODUCIBLES — se excluyen de PDFs de Producción (A y B).
// Son items del pedido que NO se producen en cocina: personal, menaje, transporte, etc.
// Se detectan por palabra clave en el nombre del producto. Lista ampliable.
// (En v7.9 cada producto tendrá tipo: producido/comprado/servicio/contrato.)
const _NO_PRODUCIBLES_RX=/\b(mesero|meseros|menaje|alquiler|alquileres|transporte|domicilio|env[ií]o|auxiliar|auxiliares)\b/;
function _esProductoProducible(nombre){
  const txt=String(nombre||"").toLowerCase();
  return !_NO_PRODUCIBLES_RX.test(txt);
}

// v7.8.4: RECETAS INTERNAS — productos compuestos con cantidad por unidad.
// Cada componente: { n: "Nombre", q: cantidad por unidad del producto padre }.
// Si el producto se pide N veces, cocina ve: (N * q)x Nombre del componente.
// Ejemplo: 23 Plato Mixto × 2 Hojas de parra/plato = "46x Hojas de parra".
// Key = nombre del producto en LOWERCASE+TRIM. Para agregar receta: añadir entrada.
// (En v7.9 esto se reemplaza por BOM persistido editable desde UI.)
// v7.8.5: fallback hardcoded. En producción se usa recetasInternasCache (Firestore).
// Si recetasInternasCache===null (aún no cargado) se usa esto. Si está cargado, Firestore manda.
const RECETAS_INTERNAS_HARDCODED={
  "plato mixto libanés":[
    {n:"Arroz Reina",         q:1},
    {n:"Tabbule",              q:1},
    {n:"Hojas de parra",       q:2},
    {n:"Hojas de repollo",     q:2},
    {n:"Quibbe BBQ",           q:1},
    {n:"Tahinne",              q:1},
    {n:"Ghraybe",              q:1},
    // v7.8.10: 1/2 pan árabe por plato (1 pita se parte en 2 mitades)
    {n:"Pan árabe",            q:0.5, unidad:"und"}
  ],
  // v7.8.10: nuevo hardcoded para Vegetariano. Antes caía a heurística sobre desc
  // ("Tabbule, Falafel, Arroz lentejas, Berenjenas, Tahinne, Labne") que ignoraba el pan.
  "plato mixto vegetariano":[
    {n:"Tabbule",              q:1},
    {n:"Falafel",              q:1},
    {n:"Arroz lentejas",       q:1},
    {n:"Berenjenas",           q:1},
    {n:"Tahinne",              q:1},
    {n:"Labne",                q:1},
    {n:"Pan árabe",            q:1, unidad:"und"}
  ]
};

// v7.8.4: detecta componentes dentro de la descripción de un producto.
// Devuelve array de {n, q, unidad?} donde q = cantidad por unidad del producto padre.
// v7.9.2: si el producto tiene recetaKey + porciones en productosCache, aplica
// factor = porciones / receta.rendimiento para escalar ingredientes correctamente.

// v7.9.2: reverse lookup en productosCache por nombre (lowercase+trim).
function _findProductoByNombre(nombreKey){
  if(typeof productosCache==="undefined"||!productosCache)return null;
  return Object.values(productosCache).find(p=>
    p.activo!==false&&String(p.nombre||"").toLowerCase().trim()===nombreKey
  )||null;
}

function _explodeComponentes(nombre,desc){
  const key=String(nombre||"").toLowerCase().trim()
    .replace(/\s*\*\s*$/,"")
    .replace(/\s+custom(?:\s+custom)*$/,"");
  const fsCache=(typeof recetasInternasCache!=="undefined"&&recetasInternasCache!==null)?recetasInternasCache:null;

  // v7.9.2: intentar BOM vía productosCache (recetaKey + factor porciones/rendimiento)
  const producto=_findProductoByNombre(key);
  if(producto&&producto.recetaKey&&fsCache){
    const rKey=String(producto.recetaKey).toLowerCase().trim();
    const recetaBOM=fsCache[rKey];
    const ings=recetaBOM&&(Array.isArray(recetaBOM)?recetaBOM:recetaBOM.ingredientes);
    if(ings&&ings.length){
      const rendimiento=Number(recetaBOM.rendimiento)||0;
      const porciones=Number(producto.porciones)||1;
      const factor=(rendimiento>0)?porciones/rendimiento:1;
      if(rendimiento>0&&factor!==1){
        console.debug("[BOM] "+nombre+" → receta '"+rKey+"' rendimiento="+rendimiento+", porciones="+porciones+", factor="+factor.toFixed(3));
      }
      return ings.map(ing=>({
        n:ing.n,
        q:(Number(ing.q)||1)*factor,
        unidad:ing.unidad||""
      }));
    }
  }

  // Ruta clásica: match directo nombre → key en recetasInternasCache
  let receta=fsCache?fsCache[key]:null;
  if(receta){
    const ings=Array.isArray(receta)?receta:receta.ingredientes;
    if(ings&&ings.length){
      // v7.9.2: si la receta de Firestore tiene rendimiento Y encontramos el producto,
      // aplicar factor. Si no hay info de porciones, factor=1 (q ya es por-unidad legacy).
      const rendimiento=Number(receta.rendimiento)||0;
      const porciones=Number(producto&&producto.porciones)||1;
      const factor=(rendimiento>0)?porciones/rendimiento:1;
      return ings.map(ing=>({
        n:ing.n,
        q:(Number(ing.q)||1)*factor,
        unidad:ing.unidad||""
      }));
    }
  }

  // Fallback hardcoded (q ya está per-unit, no se escala)
  const hc=RECETAS_INTERNAS_HARDCODED[key];
  if(hc)return hc.slice();

  // Heurística "+" sobre descripción → componentes con q=1.
  // v7.9.2.1: eliminada heurística de comas — causaba que "Champiñones, espinacas, ricotta"
  // (ingredientes de receta) aparecieran como sub-ítems en la comanda en vez del nombre del producto.
  // Solo split por "+" queda activo (ej. "Pollo + Ensalada Delirio" → 2 ítems de lasagna).
  if(!desc)return [];
  const txt=String(desc).trim();
  if(!txt)return [];
  if(/\s\+\s|\+/.test(txt)){
    const p=txt.split(/\s*\+\s*/).map(s=>s.trim()).filter(Boolean);
    if(p.length>1)return p.map(s=>({n:s,q:1}));
  }
  return [];
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
  if(summaryEl)summaryEl.textContent="";
  // v7.8.2: solo Excel — "Hojas para imprimir" se movió a Pedidos.
  // v7.8.4: default = hoy a fin de mes actual (en lugar de hoy+30 que cruza meses).
  if(!reportesFiltros.desde)reportesFiltros.desde=_reportesHoy();
  if(!reportesFiltros.hasta)reportesFiltros.hasta=_reportesFinDeMes();
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
  setTimeout(()=>generarReporte(),50);
}

// v7.8.2: nueva vista — "Hojas para imprimir" bajo módulo Pedidos.
// Reusa toda la lógica de renderReportesImprimibles existente.
async function renderPedidosHojas(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const contentEl=$("pedidos-hojas-content");
  if(!contentEl)return;
  renderReportesImprimibles(contentEl);
}

// ─── F4: Tab Imprimibles ─────────────────────────────────────

// Flag para PDF D: si true, incluye entregados ademas de pendientes
let reportesIncluirEntregados=false;

function renderReportesImprimibles(contentEl){
  // v7.8.0.1: default SIEMPRE hoy/hoy al entrar al tab. Filtros separados de Excel.
  // Si el usuario ya cambió manualmente y vuelve, se respeta su selección (porque
  // los inputs guardan en reportesFiltrosImpr y no se resetean entre entradas
  // dentro de la misma sesión, solo en la primera carga del tab).
  if(!reportesFiltrosImpr.desde)reportesFiltrosImpr.desde=_reportesHoy();
  if(!reportesFiltrosImpr.hasta)reportesFiltrosImpr.hasta=_reportesHoy();

  contentEl.innerHTML=
    '<div style="background:#F5F5F5;border-radius:10px;padding:14px 16px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:13px;color:#0D47A1;margin-bottom:10px">Rango de fechas (entrega)</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div>'+
          '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha desde</label>'+
          '<input type="date" id="rep-imp-desde" value="'+reportesFiltrosImpr.desde+'" onchange="reportesFiltrosImpr.desde=this.value;renderReportesImprimiblesPreview()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
        '</div>'+
        '<div>'+
          '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px">Fecha hasta</label>'+
          '<input type="date" id="rep-imp-hasta" value="'+reportesFiltrosImpr.hasta+'" onchange="reportesFiltrosImpr.hasta=this.value;renderReportesImprimiblesPreview()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px">'+
        '</div>'+
      '</div>'+
      '<label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11.5px;color:#555;cursor:pointer">'+
        '<input type="checkbox" id="rep-imp-include-entregados"'+(reportesIncluirEntregados?' checked':'')+' onchange="reportesIncluirEntregados=this.checked;renderReportesImprimiblesPreview()">'+
        '<span><strong>Hoja de entregas (PDF D):</strong> incluir también pedidos ya entregados (útil para reimprimir)</span>'+
      '</label>'+
      '<div id="rep-imp-preview" style="margin-top:10px;font-size:12px;color:#555"></div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">'+
      _impCard("A","🍳","Orden de Producción - Comanda","1 hoja por cliente. Productos a producir, datos de entrega, espacio para notas y firma de quien lo hizo.","JP / cocina","generarPdfProduccionPorCliente()",false)+
      _impCard("B","👨‍🍳","Producción consolidada","Suma de cantidades por producto del rango. Permite planificar cocina sin abrir cliente por cliente.","JP / cocina","generarPdfProduccionConsolidada()",false)+
      _impCard("C","📦","Empaque con chequeo","1 hoja por cliente con casillas por cada item. Para verificar antes de despachar.","Empacador","generarPdfEmpaque()",false)+
      _impCard("D","🚚","Entregas con chequeo + firma","Ruta del día con casillas de salió/entregado/firma del receptor.","Conductor","generarPdfEntregas()",false)+
      _impCard("E","🛒","Lista de compras","Ingredientes necesarios para los pedidos del rango, calculados desde las recetas. Items sin receta aparecen tal cual. Excluye anticipados.","Kathy / compras","generarListaCompras()",false,"🛒 Ver lista")+
    '</div>';
  renderReportesImprimiblesPreview();
}

function _impCard(letra,emoji,titulo,descripcion,destinatario,onclick,soon,btnLabel){
  const label=btnLabel||(soon?'Pronto':'📥 Generar PDF');
  const btn=soon
    ?'<button disabled style="background:#eee;color:#999;border:none;padding:8px 14px;border-radius:6px;font-weight:600;font-size:12px;cursor:not-allowed">'+label+'</button>'
    :'<button onclick="'+onclick+'" style="background:#0D47A1;color:white;border:none;padding:8px 14px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer">'+label+'</button>';
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
  // v7.8.0.1: usa reportesFiltrosImpr (separado del tab Excel).
  const desde=reportesFiltrosImpr.desde, hasta=reportesFiltrosImpr.hasta;
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
  // v7.8.0.1: usa reportesFiltrosImpr
  if(!reportesFiltrosImpr.desde||!reportesFiltrosImpr.hasta){el.textContent="Elige rango de fechas para ver qué pedidos hay";return}
  const docs=_impGetDocsRango(false);
  const docsConEntregados=_impGetDocsRango(true);
  let txt="<strong>"+docs.length+"</strong> pedido"+(docs.length!==1?"s":"")+" pendiente"+(docs.length!==1?"s":"")+" en el rango "+reportesFiltrosImpr.desde+" → "+reportesFiltrosImpr.hasta;
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

// ─── v7.8.7: LISTA DE COMPRAS ────────────────────────────────────────────────
// Calcula ingredientes necesarios para el rango usando recetas internas.
// Items sin receta → aparecen tal cual. Items pre-producidos (itemsProducidos) → excluidos.
//
// v7.8.10:
//  - Preserva el campo `unidad` por ingrediente (g/ml/und/etc.) en lugar de mostrar "und" fijo.
//    Ante conflicto entre dos recetas que aportan al mismo ingrediente con unidades distintas,
//    prevalece la PRIMERA encontrada y se loggea console.warn. v7.9 BOM normaliza con insumos compartidos.
//  - Explosión recursiva: si un ingrediente del primer pase es a su vez una receta (caso típico:
//    hardcoded "Plato Mixto Libanés" lista "Arroz Reina" / "Tabbule" / etc. como componentes),
//    se expande en un segundo pase iterativo hasta MAX_DEPTH=5 (defensivo contra ciclos).
//  - Datos crudos de la lista quedan cacheados en _listaComprasUltima para que generarPdfListaCompras
//    no recalcule (mismo origen de datos = misma vista en PDF que en modal).
const _LISTA_COMPRAS_MAX_DEPTH=5;
let _listaComprasUltima=null; // {ingList, sinRecList, rango, nDocs}

function generarListaCompras(){
  const docs=_impGetDocsRango(false);
  if(!docs.length){toast("No hay pedidos en el rango seleccionado","warn");return}

  const ing={};  // {key: {nombre, qty, unidad}} — ingredientes desglosados desde recetas
  const sinRec={}; // {key: {nombre, qty, unit}} — productos finales sin receta

  // Helper local: agrega un componente al map ing[]. Resuelve unidad con first-wins.
  const _addIng=(comp,multQty)=>{
    const k=(comp.n||"").toLowerCase().trim();
    const u=comp.unidad||"";
    if(!ing[k]){
      ing[k]={nombre:comp.n,qty:0,unidad:u};
    }else if(u&&ing[k].unidad&&u!==ing[k].unidad){
      console.warn("[lista compras] conflicto de unidad para \""+comp.n+"\": \""+ing[k].unidad+"\" vs \""+u+"\". Mantengo \""+ing[k].unidad+"\".");
    }else if(u&&!ing[k].unidad){
      ing[k].unidad=u;
    }
    ing[k].qty+=multQty*(Number(comp.q)||1);
  };

  docs.forEach(q=>{
    const yaSet=new Set((q.itemsProducidos||[]).map(s=>(s||"").toLowerCase().trim()));
    const proc=(nombre,qty,desc,unit)=>{
      if(!nombre||!_esProductoProducible(nombre))return;
      if(yaSet.has((nombre||"").toLowerCase().trim()))return;
      const comps=_explodeComponentes(nombre,desc);
      if(comps&&comps.length){
        comps.forEach(c=>_addIng(c,parseInt(qty)||0));
      }else{
        const k=(nombre||"").toLowerCase().trim();
        if(!sinRec[k])sinRec[k]={nombre,qty:0,unit:unit||""};
        sinRec[k].qty+=parseInt(qty)||0;
      }
    };
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>proc(it.n,it.qty,it.d,it.u));
      (q.cust||[]).forEach(it=>proc(it.n,it.qty,it.d,it.u));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>proc(it.name,it.qty,it.desc,it.unit))));
    }
  });

  // v7.8.10: segundo pase — si un ingrediente del map ES a su vez una receta (productos-como-componente
  // dentro de un hardcoded recipe, ej. "Arroz Reina" en "Plato Mixto Libanés"), expandirlo a sus
  // ingredientes raw. Iterativo con depth limit defensivo.
  for(let depth=0;depth<_LISTA_COMPRAS_MAX_DEPTH;depth++){
    let changed=false;
    Object.keys(ing).forEach(k=>{
      const sub=_explodeComponentes(ing[k].nombre,"");
      if(sub&&sub.length){
        const qty=ing[k].qty;
        delete ing[k];
        sub.forEach(c=>_addIng(c,qty));
        changed=true;
      }
    });
    if(!changed)break;
    if(depth===_LISTA_COMPRAS_MAX_DEPTH-1){
      console.warn("[lista compras] depth limit ("+_LISTA_COMPRAS_MAX_DEPTH+") alcanzado en expansion recursiva — posible ciclo en recetas");
    }
  }

  const ingList=Object.values(ing).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const sinRecList=Object.values(sinRec).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const desde=reportesFiltrosImpr.desde||"?";
  const hasta=reportesFiltrosImpr.hasta||"?";
  const rango=desde===hasta?desde:desde+" → "+hasta;

  // v7.8.10: cachear resultado para que generarPdfListaCompras() use el mismo dataset
  _listaComprasUltima={ingList,sinRecList,rango,nDocs:docs.length};

  let html='<div style="font-size:13px;font-weight:700;color:#0D47A1;margin-bottom:10px">🛒 Lista de compras · '+escapeHtml(rango)+' · '+docs.length+' pedido(s)</div>';

  if(ingList.length){
    html+='<div style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Ingredientes (desde recetas)</div>';
    html+='<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px">';
    ingList.forEach(i=>{
      html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#F9FBE7;border:1px solid #E6EE9C;border-radius:6px">'+
        '<span style="font-size:13px;color:#1A1A1A">'+escapeHtml(i.nombre)+'</span>'+
        '<span style="font-size:13px;font-weight:700;color:#33691E">'+i.qty+' '+escapeHtml(i.unidad||'und')+'</span>'+
        '</div>';
    });
    html+='</div>';
  }

  if(sinRecList.length){
    // v7.8.8: aclarar que estos son productos finales del catálogo (no insumos), por eso van como
    // "comprar tal cual" o "producir directo". La cantidad es de unidades vendidas, no de insumos.
    html+='<div style="font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Productos finales sin receta</div>';
    html+='<div style="font-size:11px;color:#9E7A00;margin-bottom:6px;font-style:italic">Cantidades = unidades vendidas. Estos productos no tienen receta cargada en Herramientas → Recetas internas, por lo que aparecen como producto final (no se desglosan en ingredientes).</div>';
    html+='<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:14px">';
    sinRecList.forEach(i=>{
      html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#FFF8E1;border:1px solid #FFE082;border-radius:6px">'+
        '<span style="font-size:13px;color:#1A1A1A">'+escapeHtml(i.nombre)+'</span>'+
        '<span style="font-size:13px;font-weight:700;color:#E65100">'+i.qty+(i.unit?' '+escapeHtml(i.unit):'')+'</span>'+
        '</div>';
    });
    html+='</div>';
  }

  if(!ingList.length&&!sinRecList.length){
    html+='<div style="color:#9E9E9E;font-size:13px">No hay items a comprar en el rango (todos anticipados o sin pedidos).</div>';
  }

  const modal=$("lista-compras-modal");
  const body=$("lista-compras-body");
  if(body)body.innerHTML=html;
  if(modal)modal.classList.remove("hidden");
}

// v7.8.10 — PDF E: lista de compras imprimible/compartible.
// Usa el snapshot _listaComprasUltima generado por generarListaCompras() (ya con expansion recursiva
// y unidades resueltas). Si no hay snapshot, pedir al usuario que abra la lista primero.
function generarPdfListaCompras(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  if(!_listaComprasUltima){
    if(typeof toast==="function")toast("Generá la lista primero (botón 'Ver lista').","warn");
    return;
  }
  const {ingList,sinRecList,rango,nDocs}=_listaComprasUltima;
  if(!ingList.length&&!sinRecList.length){
    if(typeof toast==="function")toast("No hay items para exportar.","warn");
    return;
  }

  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  const W=210,H=297,M=14;

  // jsPDF + helvetica no renderiza glifos Unicode "→" (U+2192) ni "·" (U+00B7) consistentemente.
  // Sanitizamos solo el subtitle (no afecta el modal HTML).
  const rangoPdf=rango.replace(/\s*→\s*/g," a ");
  const subtitle=rangoPdf+"  -  "+nDocs+" pedido(s)";
  let y=_repPdfHeader(pdf,W,"LISTA DE COMPRAS",subtitle);

  // Sección 1: ingredientes desde recetas
  if(ingList.length){
    pdf.setFontSize(10);pdf.setFont("helvetica","bold");
    pdf.setTextColor(51,105,30);
    pdf.text("Ingredientes (desde recetas)",M,y);
    y+=2;
    pdf.autoTable({
      startY:y+1,
      head:[["Ingrediente","Cantidad","Unidad"]],
      body:ingList.map(i=>[i.nombre, i.qty, (i.unidad||"und")]),
      theme:"grid",
      headStyles:_REP_PDF_HEAD_STYLE,
      alternateRowStyles:_REP_PDF_ZEBRA,
      styles:{fontSize:9,cellPadding:2.5,valign:"middle"},
      columnStyles:{0:{cellWidth:"auto"},1:{cellWidth:25,halign:"right"},2:{cellWidth:22,halign:"center"}},
      margin:{left:M,right:M}
    });
    y=pdf.lastAutoTable.finalY+6;
  }

  // Sección 2: productos sin receta
  if(sinRecList.length){
    if(y>H-50){pdf.addPage();y=20}
    pdf.setFontSize(10);pdf.setFont("helvetica","bold");
    pdf.setTextColor(230,81,0);
    pdf.text("Productos finales sin receta",M,y);
    pdf.setFontSize(8);pdf.setFont("helvetica","italic");pdf.setTextColor(120,120,120);
    pdf.text("Cantidades = unidades vendidas. Sin receta cargada en Herramientas > Recetas internas.",M,y+5);
    y+=8;
    pdf.setTextColor(0,0,0);
    pdf.autoTable({
      startY:y,
      head:[["Producto","Cantidad","Unidad"]],
      body:sinRecList.map(i=>[i.nombre, i.qty, (i.unit||"und")]),
      theme:"grid",
      headStyles:_REP_PDF_HEAD_STYLE,
      alternateRowStyles:_REP_PDF_ZEBRA,
      styles:{fontSize:9,cellPadding:2.5,valign:"middle"},
      columnStyles:{0:{cellWidth:"auto"},1:{cellWidth:25,halign:"right"},2:{cellWidth:22,halign:"center"}},
      margin:{left:M,right:M}
    });
  }

  _repPdfFooter(pdf,W,H);

  const fname="ListaCompras_"+rango.replace(/[^\d-]/g,"_")+".pdf";
  pdf.save(fname);
}

function closeListaComprasModal(){
  const modal=$("lista-compras-modal");
  if(modal)modal.classList.add("hidden");
}

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

    // v7.8.4: la producción se hace el día ANTERIOR a la entrega.
    const fecha=_reportesGetFecha(q);
    const hora=q.horaEntrega||(q.orderData||{}).horaEntrega||"";
    const fechaProd=_fechaProduccion(fecha);

    // Header con logo + dorado. Subtitle ahora destaca FECHA DE PRODUCCIÓN.
    const subtitle="Hoja "+(idx+1)+"/"+docs.length+
      (fechaProd?"  ·  PRODUCIR "+_fechaCorta(fechaProd):"")+
      "  ·  "+(q.kind==="quote"?"Cotización":"Propuesta")+" "+(q.id||"");
    let y=_repPdfHeader(pdf,W,"ORDEN DE PRODUCCIÓN - COMANDA",subtitle);

    // Cliente / pedido datos
    pdf.setFontSize(14);pdf.setFont("helvetica","bold");
    pdf.text((q.client||"(sin cliente)").toUpperCase(),M,y+2);y+=8;
    // v7.8.4: línea destacada "PRODUCIR el [día anterior]" + entrega como referencia.
    // Sin emoji (jsPDF helvetica no soporta) — uso "►" que es ASCII extendido válido.
    if(fechaProd){
      pdf.setFontSize(11);pdf.setFont("helvetica","bold");
      pdf.setTextColor(198,40,40); // rojo destaque
      pdf.text(">> PRODUCIR EL: "+fechaProd,M,y);y+=5.5;
      pdf.setTextColor(0,0,0);
    }
    pdf.setFontSize(9.5);pdf.setFont("helvetica","normal");
    pdf.text("Para entrega: "+fecha+(hora?"  "+hora:""),M,y);y+=4.5;
    if(q.dir)pdf.text("Dirección: "+q.dir+(q.city?", "+q.city:""),M,y),y+=4.5;
    if(q.tel)pdf.text("Teléfono: "+q.tel,M,y),y+=4.5;
    if(q.att)pdf.text("Atención: "+q.att,M,y),y+=4.5;
    y+=3;

    // v7.8.4: Tabla con item padre + sub-filas por componente.
    // Cada item del pedido genera:
    //   1. Fila padre (5 cols) con casilla principal en col 0.
    //   2. Sub-filas (colSpan 5) con casilla pequeña al inicio, una por componente.
    const items=[];
    const addItem=(cant,nombre,desc,unidad,custom,nombreBase)=>{
      // v7.8.4: skip productos no producibles (mesero, menaje, transporte, etc.)
      if(!_esProductoProducible(nombre))return;
      const cantNum=cant||0;
      // v7.8.6/v7.8.7.1: detectar si el item fue pre-producido. Usa nombreBase (sin prefijo de
      // sección/opción) para que el match funcione también en proposals.
      const matchKey=((nombreBase||nombre)||"").toLowerCase().trim();
      const yaProducido=(q.itemsProducidos||[]).some(p=>p===matchKey);
      if(yaProducido){
        // v7.8.6: fila ya-producida en gris, sin casilla de check, sin sub-filas
        const gs={textColor:[160,160,160],fontStyle:"italic"};
        items.push([
          {content:"OK",styles:{...gs,halign:"center",fontSize:7}},
          {content:"--",styles:{...gs,halign:"center"}},
          {content:"[YA PROD.] "+(nombre||""),styles:gs},
          {content:desc||"",styles:gs},
          {content:unidad||"",styles:{...gs,halign:"center"}}
        ]);
        return;
      }
      const fullName=(nombre||"")+(custom?" *":"");
      // Fila padre + sub-filas de componentes.
      // v7.9.2.1: cuando NO hay componentes, imprimir el producto padre como fila standalone
      // (antes quedaba invisible si _explodeComponentes devolvía []).
      try{
        const comps=_explodeComponentes(nombre,desc);
        if(comps&&comps.length){
          comps.forEach(comp=>{
            const qPorUnidad=Number(comp.q)||1;
            const qtyTotal=cantNum*qPorUnidad;
            items.push([{
              content:"      "+qtyTotal+"x  "+comp.n,
              colSpan:5,
              styles:{
                halign:"left",
                fontSize:8.5,
                textColor:[80,80,80],
                fillColor:[252,252,248],
                cellPadding:{top:1.6,bottom:1.6,left:14,right:4}
              }
            }]);
          });
        }else{
          // Sin componentes: mostrar como ítem único con checkbox
          items.push([
            "",
            {content:cantNum+"x",styles:{halign:"center",fontStyle:"bold"}},
            fullName,
            desc||"",
            unidad||""
          ]);
        }
      }catch(e){console.warn("explodeComponentes A falló para",nombre,desc,e)}
    };
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>addItem(it.qty,it.n,it.d,it.u,false,it.n));
      (q.cust||[]).forEach(it=>addItem(it.qty,it.n,it.d,it.u,true,it.n));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
        const prefix=sec.name?"["+sec.name+(opt.label?" "+opt.label:"")+"] ":"";
        // v7.8.7.1: nombreBase = it.name sin prefijo, para match con itemsProducidos
        addItem(it.qty,prefix+(it.name||""),it.desc||"",it.unit||"",false,it.name||"");
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
        // Sin alternateRowStyles para no chocar con sub-filas
        columnStyles:{
          0:{halign:"center",cellWidth:tw*0.06},
          1:{halign:"center",cellWidth:tw*0.10,fontStyle:"bold"},
          2:{halign:"left",cellWidth:tw*0.36},
          3:{halign:"left",cellWidth:tw*0.34},
          4:{halign:"center",cellWidth:tw*0.14}
        },
        didDrawCell:function(data){
          if(data.section!=="body")return;
          // Sub-fila componente (colSpan>1): dibujar casilla pequeña al inicio
          if(data.cell.colSpan&&data.cell.colSpan>1){
            const cx=data.cell.x+5;
            const cy=data.cell.y+data.cell.height/2-2;
            pdf.setDrawColor(120);pdf.setLineWidth(0.25);
            pdf.rect(cx,cy,4,4);
            return;
          }
          // Fila padre: casilla normal en col 0
          if(data.column.index===0){
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

    // * Productos custom marker — relativo al final del contenido (no posición fija H-12)
    // v7.8.4: filtrar solo filas padre (array 5 elementos); las sub-filas son objetos con colSpan.
    if(items.some(r=>Array.isArray(r)&&r.length===5&&typeof r[2]==="string"&&r[2].endsWith(" *"))){
      // Posición segura: max entre "después del footer" y "H-12" (cualquiera sea más bajo en página)
      const yMarker=Math.min(y+18,H-12);
      pdf.setFontSize(7);pdf.setTextColor(120);
      pdf.text("* Producto custom (no del catálogo).",M,yMarker);
      pdf.setTextColor(0);
    }
  });

  _repPdfFooter(pdf,W,H);

  const fname="OrdenProduccion_"+reportesFiltrosImpr.desde+(reportesFiltrosImpr.desde===reportesFiltrosImpr.hasta?"":"_a_"+reportesFiltrosImpr.hasta)+".pdf";
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
      // v7.8.4: skip productos no producibles (mesero, menaje, transporte, etc.)
      if(!_esProductoProducible(name))return;
      // v7.8.6: skip items marcados como ya producidos anticipadamente
      if((q.itemsProducidos||[]).some(p=>p===(name||"").toLowerCase().trim()))return;
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
    // v7.8.4: subtitle muestra fecha de PRODUCCIÓN (día anterior) + entrega como referencia
    const fechaProd=_fechaProduccion(f);
    const subtitle=(fechaProd?"PRODUCIR "+hojaFormatFecha(fechaProd)+"  ·  Para entrega "+hojaFormatFecha(f):hojaFormatFecha(f))+
      "  ·  "+porDia[f].docs.length+" pedido(s)  ·  "+Object.keys(porDia[f].productos).length+" producto(s) distinto(s)  ·  "+totalUnidades+" unidades";
    let y=_repPdfHeader(pdf,W,"PRODUCCIÓN DEL DÍA",subtitle);

    // v7.8.4: Filas agregadas + sub-filas de componentes (mismo desglose que PDF A).
    const rowsAgg=Object.entries(porDia[f].productos)
      .sort((a,b)=>(a[1].name||"").localeCompare(b[1].name||"")||(a[1].desc||"").localeCompare(b[1].desc||""))
      .map(([key,g])=>({qty:g.qty,name:g.name,desc:g.desc,unit:g.unit,pedCount:g.pedidos.size,clientes:Array.from(g.pedidos).join(", ")}));
    const rows=[];
    rowsAgg.forEach(g=>{
      // Fila padre (6 columnas)
      rows.push([String(g.qty),g.name,g.desc,g.unit,String(g.pedCount),g.clientes]);
      // Sub-filas de componentes consolidados: cantTotal = qtyAgregada × qPorUnidad
      try{
        const comps=_explodeComponentes(g.name,g.desc);
        if(comps&&comps.length){
          comps.forEach(comp=>{
            const qPorUnidad=Number(comp.q)||1;
            const qtyTotal=g.qty*qPorUnidad;
            rows.push([{
              content:"      "+qtyTotal+"x  "+comp.n,
              colSpan:6,
              styles:{
                halign:"left",
                fontSize:8,
                textColor:[80,80,80],
                fillColor:[252,252,248],
                cellPadding:{top:1.5,bottom:1.5,left:14,right:4}
              }
            }]);
          });
        }
      }catch(e){console.warn("explodeComponentes B falló para",g.name,g.desc,e)}
    });

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
        // Sin alternateRowStyles para no chocar con sub-filas
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

  const fname="ProduccionConsolidada_"+reportesFiltrosImpr.desde+(reportesFiltrosImpr.desde===reportesFiltrosImpr.hasta?"":"_a_"+reportesFiltrosImpr.hasta)+".pdf";
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
    // v7.8.8: items pre-producidos (q.itemsProducidos) → fila en gris con "[YA PROD.]", sin casilla.
    // Coherente con PDF A (línea ~3787) — el empacador ve el item pero sabe que ya estaba listo.
    const items=[];
    const yaSet=new Set((q.itemsProducidos||[]).map(s=>(s||"").toLowerCase().trim()));
    const _gs={textColor:[160,160,160],fontStyle:"italic"};
    const _addItemC=(qty,nombre,desc,unidad,custom,nombreBase)=>{
      const matchKey=((nombreBase||nombre)||"").toLowerCase().trim();
      if(yaSet.has(matchKey)){
        items.push([
          {content:"OK",styles:{..._gs,halign:"center",fontSize:7}},
          {content:String(qty||0),styles:{..._gs,halign:"center"}},
          {content:"[YA PROD.] "+(nombre||"")+(custom?" *":""),styles:_gs},
          {content:desc||"",styles:_gs},
          {content:unidad||"",styles:{..._gs,halign:"center"}}
        ]);
        return;
      }
      // v7.9.2.2: explotar componentes en empaque — cada ítem físico tiene su propia fila y casilla.
      // "9x Plato Mixto" → 9x Arroz Reina, 18x Hojas de parra, etc.
      try{
        const comps=_explodeComponentes(nombre,desc);
        if(comps&&comps.length){
          comps.forEach(comp=>{
            const qPorUnidad=Number(comp.q)||1;
            const qtyTotal=Math.round((qty||0)*qPorUnidad*1000)/1000;
            items.push(["",String(qtyTotal),comp.n,"",comp.unidad||""]);
          });
        }else{
          items.push(["",String(qty||0),(nombre||"")+(custom?" *":""),desc||"",unidad||""]);
        }
      }catch(e){
        items.push(["",String(qty||0),(nombre||"")+(custom?" *":""),desc||"",unidad||""]);
      }
    };
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>_addItemC(it.qty,it.n,it.d,it.u,false,it.n));
      (q.cust||[]).forEach(it=>_addItemC(it.qty,it.n,it.d,it.u,true,it.n));
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
        const prefix=sec.name?"["+sec.name+(opt.label?" "+opt.label:"")+"] ":"";
        _addItemC(it.qty,prefix+(it.name||""),it.desc||"",it.unit||"",false,it.name||"");
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
            // v7.8.8: filas pre-producidas tienen content "OK" en col 0 → no dibujar casilla.
            const raw=data.cell.raw;
            if(raw&&typeof raw==="object"&&raw.content==="OK")return;
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

  const fname="Empaque_"+reportesFiltrosImpr.desde+(reportesFiltrosImpr.desde===reportesFiltrosImpr.hasta?"":"_a_"+reportesFiltrosImpr.hasta)+".pdf";
  pdf.save(fname);
  if(typeof toast==="function")toast("PDF generado: "+docs.length+" hoja(s) de empaque","success");
}

// ─── F8: PDF D — Entregas con chequeo + firma ───────────────
// v7.8.0.1 (2026-05-07): formato intermedio.
//   • Sub-fila de items resumidos por cliente (▸ ítem · ítem · ...)
//   • Columna A COBRAR reemplaza TOTAL + NOTAS PAGO. Si saldo=0 → "—".
//   • Footer: "Total a cobrar hoy" solo si hay saldos. Si todo pagado → "Todo cancelado".

// v7.8.0.1: modal selector de cobros para Hoja de Entregas.
// Devuelve Promise<Set<string> | null>. Set vacío = ningún cobro. null = canceló.
function _heModalSelectorCobros(docsConSaldo){
  return new Promise(resolve=>{
    // Crear overlay + modal dinámicamente
    const overlay=document.createElement("div");
    overlay.id="he-cobros-modal";
    overlay.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto";
    const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
    let html='<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;padding:18px 20px;box-shadow:0 8px 32px rgba(0,0,0,.3);font-family:var(--gb-font-body)">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:10px;border-bottom:1px solid #E0E0E0">';
    html+='<div style="font-size:17px;font-weight:700;color:#1A1A1A">¿Qué cobros incluir?</div>';
    html+='<button id="he-cob-x" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:#9E9E9E;padding:0 6px">×</button>';
    html+='</div>';
    html+='<div style="font-size:12.5px;color:#5D4037;margin-bottom:12px">Marcá los clientes que el repartidor va a cobrar en este viaje. Los desmarcados quedan sin valor en la hoja (aunque tengan saldo).</div>';
    html+='<div style="display:flex;gap:8px;margin-bottom:10px">';
    html+='<button id="he-cob-all" style="background:#fff;color:#1B5E20;border:1px solid #1B5E20;padding:5px 11px;border-radius:6px;font-size:11.5px;cursor:pointer">Marcar todos</button>';
    html+='<button id="he-cob-none" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:5px 11px;border-radius:6px;font-size:11.5px;cursor:pointer">Desmarcar todos</button>';
    html+='</div>';
    html+='<div id="he-cob-list" style="max-height:340px;overflow-y:auto;border:1px solid #EEE;border-radius:8px;padding:6px">';
    docsConSaldo.forEach(q=>{
      const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      const fecha=_reportesGetFecha(q)||"";
      html+='<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border-bottom:1px solid #F5F5F5" onmouseover="this.style.background=\'#FAFAFA\'" onmouseout="this.style.background=\'transparent\'">';
      html+='<input type="checkbox" checked data-id="'+q.id+'" style="width:18px;height:18px;cursor:pointer;accent-color:#1B5E20">';
      html+='<div style="flex:1;min-width:0">';
      html+='<div style="font-size:13.5px;font-weight:700;color:#1A1A1A">'+escapeHtml((q.client||"(sin cliente)").toUpperCase())+'</div>';
      html+='<div style="font-size:11px;color:#9E9E9E">'+fecha+(q.horaEntrega?" "+q.horaEntrega:"")+' · '+escapeHtml(q.id||"")+'</div>';
      html+='</div>';
      html+='<div style="font-size:14px;font-weight:700;color:#C62828">'+fmt(saldo)+'</div>';
      html+='</label>';
    });
    html+='</div>';
    html+='<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #E0E0E0">';
    html+='<button id="he-cob-cancel" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:9px 14px;border-radius:8px;font-size:13px;cursor:pointer">Cancelar</button>';
    html+='<button id="he-cob-ok" style="background:#1B5E20;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Generar PDF</button>';
    html+='</div>';
    html+='</div>';
    overlay.innerHTML=html;
    document.body.appendChild(overlay);

    const close=(result)=>{
      try{document.body.removeChild(overlay)}catch{}
      resolve(result);
    };
    document.getElementById("he-cob-x").onclick=()=>close(null);
    document.getElementById("he-cob-cancel").onclick=()=>close(null);
    document.getElementById("he-cob-all").onclick=()=>{
      overlay.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=true);
    };
    document.getElementById("he-cob-none").onclick=()=>{
      overlay.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.checked=false);
    };
    document.getElementById("he-cob-ok").onclick=()=>{
      const ids=new Set();
      overlay.querySelectorAll('input[type="checkbox"]:checked').forEach(cb=>ids.add(cb.dataset.id));
      close(ids);
    };
  });
}

// ═══════════════════════════════════════════════════════════
// v7.8.1: WIZARD HOJA DE ENTREGAS — multi-paso
// ═══════════════════════════════════════════════════════════
// 5 pasos secuenciales para imprimir hojas de un día complejo:
// (1) clasificar entrega vs recoge
// (2) cuántos carros + asignación
// (3) editar horas para orden de reparto
// (4) cobros (reusa _heModalSelectorCobros)
// (5) generar N PDFs (1 por carro + 1 recogidas)
// Estado solo en runtime — no se guarda en pedidos.

let _heWizardState=null;

// Detecta si un pedido tiene transporte cobrado (item con palabras clave en nombre)
function _heTieneTransporteCobrado(q){
  const isTransporte=(name)=>{
    const n=String(name||"").toLowerCase();
    return n.includes("transporte")||n.includes("domicilio")||n.includes("envío")||n.includes("envio")||n.includes("delivery");
  };
  if(q.kind==="quote"){
    if((q.cart||[]).some(it=>isTransporte(it.n)&&(Number(it.qty)*Number(it.p)||0)>0))return true;
    if((q.cust||[]).some(it=>isTransporte(it.n)&&(Number(it.qty)*Number(it.p)||0)>0))return true;
  }else{
    let tiene=false;
    (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
      if(isTransporte(it.name)&&(Number(it.qty)*Number(it.price)||0)>0)tiene=true;
    })));
    return tiene;
  }
  return false;
}

// Sugerencia automática de carros: agrupa por ciudad, si todos misma ciudad → split alfabético
function _heAutoAsignarCarros(entregas,numCarros){
  const asignacion=new Map();
  if(!entregas.length||numCarros<1)return asignacion;
  if(numCarros===1){entregas.forEach(q=>asignacion.set(q.id,1));return asignacion}
  // Agrupar por city
  const porCiudad=new Map();
  entregas.forEach(q=>{
    const c=(q.city||"sin").toLowerCase().trim();
    if(!porCiudad.has(c))porCiudad.set(c,[]);
    porCiudad.get(c).push(q);
  });
  const ciudades=Array.from(porCiudad.keys());
  if(ciudades.length>=numCarros){
    // Cada ciudad a un carro (round-robin si hay más ciudades que carros)
    ciudades.forEach((c,i)=>{
      const carro=(i%numCarros)+1;
      porCiudad.get(c).forEach(q=>asignacion.set(q.id,carro));
    });
  }else{
    // Misma ciudad mayoría → split alfabético balanceado
    const sorted=entregas.slice().sort((a,b)=>(a.client||"").localeCompare(b.client||""));
    const porCarro=Math.ceil(sorted.length/numCarros);
    sorted.forEach((q,i)=>{
      const carro=Math.min(Math.floor(i/porCarro)+1,numCarros);
      asignacion.set(q.id,carro);
    });
  }
  return asignacion;
}

// Punto de entrada del wizard. Reemplaza el flujo directo de generación.
async function _heWizardOpen(docs){
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos en el rango","warn");
    return;
  }
  // Inicializar estado
  _heWizardState={
    docs:docs.slice(),
    step:1,
    tipoDespacho:new Map(docs.map(q=>[q.id,"entrega"])),  // default: todos entrega
    numCarros:1,
    asignacionCarro:new Map(),
    horaOverride:new Map(),
    cobrosIncluidos:new Set(),
    incluirCobros:false
  };
  // Crear overlay
  const ov=document.createElement("div");
  ov.id="he-wizard";
  ov.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto";
  ov.innerHTML='<div id="he-wiz-card" style="background:#fff;border-radius:14px;max-width:680px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3);font-family:var(--gb-font-body);display:flex;flex-direction:column;max-height:calc(100vh - 40px)"></div>';
  document.body.appendChild(ov);
  _heWizardRender();
}

function _heWizardClose(){
  const ov=document.getElementById("he-wizard");
  if(ov)ov.remove();
  _heWizardState=null;
}

function _heWizardRender(){
  if(!_heWizardState)return;
  const card=document.getElementById("he-wiz-card");
  if(!card)return;
  const s=_heWizardState;
  const totalSteps=5;
  // Header con stepper
  let html='<div style="padding:16px 20px;border-bottom:1px solid #E0E0E0">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html+='<div style="font-size:16px;font-weight:700;color:#1A1A1A">Generar hojas del día</div>';
  html+='<button onclick="_heWizardClose()" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:#9E9E9E;padding:0 6px">×</button>';
  html+='</div>';
  // Stepper
  const stepLabels=["Despacho","Carros","Horas","Cobros","Generar"];
  html+='<div style="display:flex;gap:6px;font-size:11px">';
  for(let i=1;i<=totalSteps;i++){
    const active=i===s.step;
    const done=i<s.step;
    const bg=active?"#1B5E20":(done?"#A5D6A7":"#E0E0E0");
    const color=active||done?"#fff":"#757575";
    html+='<div style="flex:1;background:'+bg+';color:'+color+';padding:5px 8px;border-radius:4px;text-align:center;font-weight:'+(active?700:500)+'">'+i+'. '+stepLabels[i-1]+'</div>';
  }
  html+='</div>';
  html+='</div>';
  // Body
  html+='<div id="he-wiz-body" style="padding:18px 20px;overflow-y:auto;flex:1">';
  if(s.step===1)html+=_heWizardStep1HTML();
  else if(s.step===2)html+=_heWizardStep2HTML();
  else if(s.step===3)html+=_heWizardStep3HTML();
  else if(s.step===5)html+=_heWizardStep5HTML();
  html+='</div>';
  // Footer
  html+='<div style="padding:14px 20px;border-top:1px solid #E0E0E0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">';
  html+='<button onclick="_heWizardClose()" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:9px 14px;border-radius:8px;font-size:13px;cursor:pointer;font-family:var(--gb-font-body)">Cancelar</button>';
  html+='<div style="display:flex;gap:8px">';
  if(s.step>1)html+='<button onclick="_heWizardBack()" style="background:#fff;color:#1A237E;border:1px solid #1A237E;padding:9px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">← Atrás</button>';
  if(s.step<5){
    html+='<button onclick="_heWizardNext()" style="background:#1B5E20;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">Siguiente →</button>';
  }else{
    html+='<button onclick="_heWizardGenerate()" style="background:#1B5E20;color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">📥 Generar PDFs</button>';
  }
  html+='</div>';
  html+='</div>';
  card.innerHTML=html;
}

// ─── STEP 1: Clasificar despacho ─────────────────────────
function _heWizardStep1HTML(){
  const s=_heWizardState;
  let html='<div style="font-size:13px;color:#5D4037;margin-bottom:12px">¿Qué hace cada cliente? Por defecto se entrega; marcá los que vienen a recoger.</div>';
  s.docs.forEach(q=>{
    const tipo=s.tipoDespacho.get(q.id)||"entrega";
    const tieneTransp=_heTieneTransporteCobrado(q);
    const warn=(tipo==="recoge"&&tieneTransp)?'<div style="font-size:11px;color:#C62828;margin-top:3px">⚠️ Tiene transporte cobrado — verificar</div>':'';
    html+='<div style="background:#fff;border:1px solid #E0E0E0;border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
    html+='<div style="flex:1;min-width:160px">';
    html+='<div style="font-size:13px;font-weight:700;color:#1A1A1A">'+escapeHtml((q.client||"(sin)").toUpperCase())+'</div>';
    html+='<div style="font-size:11px;color:#9E9E9E">'+escapeHtml(q.id||"")+(q.city?' · '+escapeHtml(q.city):'')+(q.horaEntrega?' · '+q.horaEntrega:'')+'</div>';
    html+=warn;
    html+='</div>';
    html+='<select onchange="_heWizSetTipo(\''+q.id+'\',this.value)" style="padding:6px 9px;border:1.5px solid #BDBDBD;border-radius:6px;font-size:13px;font-family:var(--gb-font-body);background:#fff">';
    html+='<option value="entrega"'+(tipo==="entrega"?" selected":"")+'>📦 Entregar</option>';
    html+='<option value="recoge"'+(tipo==="recoge"?" selected":"")+'>🚶 Recoge cliente</option>';
    html+='</select>';
    html+='</div>';
  });
  return html;
}

function _heWizSetTipo(docId,tipo){
  if(!_heWizardState)return;
  _heWizardState.tipoDespacho.set(docId,tipo);
  _heWizardRender();
}

// ─── STEP 2: Carros + asignación ─────────────────────────
function _heWizardStep2HTML(){
  const s=_heWizardState;
  const entregas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega");
  let html='<div style="font-size:13px;color:#5D4037;margin-bottom:12px">¿Cuántos carros vas a usar para repartir las <strong>'+entregas.length+'</strong> entregas?</div>';
  // Selector cuántos carros
  html+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">';
  html+='<label style="font-size:12px;color:#5D4037;font-weight:600">Carros:</label>';
  for(let n=1;n<=Math.min(5,entregas.length);n++){
    const active=s.numCarros===n;
    html+='<button onclick="_heWizSetNumCarros('+n+')" style="background:'+(active?"#1B5E20":"#fff")+';color:'+(active?"#fff":"#1B5E20")+';border:1.5px solid #1B5E20;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">'+n+'</button>';
  }
  html+='<button onclick="_heWizReSuggestCarros()" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:6px 11px;border-radius:6px;font-size:11.5px;cursor:pointer;margin-left:auto">🔄 Re-sugerir auto</button>';
  html+='</div>';
  // UX hint: dejar claro que la asignación es editable
  html+='<div style="font-size:11.5px;color:#5D4037;margin-bottom:6px">👇 Podés cambiar cualquier asignación manualmente si la sugerencia no te convence.</div>';
  // Lista entregas con dropdown carro
  html+='<div style="background:#FAFAFA;border-radius:8px;padding:8px">';
  entregas.forEach(q=>{
    const carro=s.asignacionCarro.get(q.id)||1;
    html+='<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:#fff;border-radius:6px;margin-bottom:4px">';
    html+='<div style="flex:1;min-width:0">';
    html+='<div style="font-size:13px;font-weight:700">'+escapeHtml((q.client||"").toUpperCase())+'</div>';
    html+='<div style="font-size:11px;color:#9E9E9E">'+escapeHtml(q.city||"")+(q.horaEntrega?' · '+q.horaEntrega:'')+'</div>';
    html+='</div>';
    html+='<select onchange="_heWizSetCarro(\''+q.id+'\',Number(this.value))" style="padding:5px 8px;border:1.5px solid #BDBDBD;border-radius:5px;font-size:12.5px;font-family:var(--gb-font-body);background:#fff">';
    for(let n=1;n<=s.numCarros;n++){
      html+='<option value="'+n+'"'+(carro===n?" selected":"")+'>Carro '+n+'</option>';
    }
    html+='</select>';
    html+='</div>';
  });
  html+='</div>';
  // Validación: cada carro al menos 1
  const counts=new Map();
  entregas.forEach(q=>{const c=s.asignacionCarro.get(q.id)||1;counts.set(c,(counts.get(c)||0)+1)});
  const carrosVacios=[];
  for(let n=1;n<=s.numCarros;n++)if(!counts.has(n))carrosVacios.push(n);
  if(carrosVacios.length){
    html+='<div style="background:#FFEBEE;border:1px solid #EF9A9A;border-radius:6px;padding:8px 11px;margin-top:10px;font-size:12px;color:#B71C1C"><strong>⚠️ Carro(s) sin pedidos:</strong> '+carrosVacios.map(n=>"Carro "+n).join(", ")+'. Asigná al menos uno o reducí el número de carros.</div>';
  }
  return html;
}

function _heWizSetNumCarros(n){
  if(!_heWizardState)return;
  _heWizardState.numCarros=n;
  // Auto-resugerir
  const entregas=_heWizardState.docs.filter(q=>_heWizardState.tipoDespacho.get(q.id)==="entrega");
  _heWizardState.asignacionCarro=_heAutoAsignarCarros(entregas,n);
  _heWizardRender();
}
function _heWizReSuggestCarros(){
  if(!_heWizardState)return;
  const entregas=_heWizardState.docs.filter(q=>_heWizardState.tipoDespacho.get(q.id)==="entrega");
  _heWizardState.asignacionCarro=_heAutoAsignarCarros(entregas,_heWizardState.numCarros);
  _heWizardRender();
}
function _heWizSetCarro(docId,n){
  if(!_heWizardState)return;
  _heWizardState.asignacionCarro.set(docId,n);
  _heWizardRender();
}

// ─── STEP 3: Horas editables (+ permitir cambiar carro) ──
function _heWizardStep3HTML(){
  const s=_heWizardState;
  let html='<div style="font-size:13px;color:#5D4037;margin-bottom:6px">Editá las horas para definir el orden de reparto. También podés mover un pedido de carro si te das cuenta acá. Nada se guarda en el pedido.</div>';
  html+='<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button onclick="_heWizRestoreHoras()" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:5px 11px;border-radius:6px;font-size:11.5px;cursor:pointer">Restaurar todas las horas originales</button></div>';
  // Por carro
  for(let n=1;n<=s.numCarros;n++){
    const enCarro=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega"&&s.asignacionCarro.get(q.id)===n);
    if(!enCarro.length)continue;
    html+='<div style="margin-bottom:14px"><div style="font-size:12.5px;font-weight:700;color:#1A237E;margin-bottom:6px">🚐 Carro '+n+'</div>';
    html+=_heWizHoraRows(enCarro,{tipo:"entrega",numCarros:s.numCarros});
    html+='</div>';
  }
  // Recogidas
  const recogen=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="recoge");
  if(recogen.length){
    html+='<div style="margin-bottom:6px"><div style="font-size:12.5px;font-weight:700;color:#5D4037;margin-bottom:6px">🚶 Recogidas en la casa</div>';
    html+=_heWizHoraRows(recogen,{tipo:"recoge",numCarros:0});
    html+='</div>';
  }
  return html;
}
function _heWizHoraRows(arr,opts){
  // Ordenar por hora actual (override o original)
  const s=_heWizardState;
  const isEntrega=opts&&opts.tipo==="entrega";
  const numCarros=opts?(opts.numCarros||0):0;
  const sorted=arr.slice().sort((a,b)=>{
    const ha=s.horaOverride.get(a.id)||a.horaEntrega||"99:99";
    const hb=s.horaOverride.get(b.id)||b.horaEntrega||"99:99";
    return ha.localeCompare(hb);
  });
  let html='<div style="background:#FAFAFA;border-radius:6px;padding:6px">';
  sorted.forEach(q=>{
    const original=q.horaEntrega||"";
    const override=s.horaOverride.get(q.id)||"";
    const hora=override||original||"12:00";
    const modificada=override&&override!==original;
    html+='<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-radius:5px;margin-bottom:3px;flex-wrap:wrap">';
    // data-docid para captura defensiva al avanzar
    html+='<input type="time" data-docid="'+q.id+'" value="'+hora+'" oninput="_heWizSetHora(\''+q.id+'\',this.value)" onblur="_heWizSetHora(\''+q.id+'\',this.value)" style="padding:5px 8px;border:1.5px solid #BDBDBD;border-radius:5px;font-size:13px;font-family:var(--gb-font-body);width:110px">';
    html+='<div style="flex:1;min-width:140px">';
    html+='<div style="font-size:13px;font-weight:600">'+escapeHtml((q.client||"").toUpperCase())+(modificada?' <span style="font-size:10px;color:#F57F17;font-weight:700">📌 modificada</span>':'')+'</div>';
    html+='<div style="font-size:10.5px;color:#9E9E9E">'+escapeHtml(q.id||"")+(original?' · original '+original:'')+(q.city?' · '+escapeHtml(q.city):'')+'</div>';
    html+='</div>';
    // Selector de carro (solo entregas con >1 carro)
    if(isEntrega&&numCarros>1){
      const carro=s.asignacionCarro.get(q.id)||1;
      html+='<select onchange="_heWizMoveCarroFromStep3(\''+q.id+'\',Number(this.value))" title="Mover a otro carro" style="padding:5px 8px;border:1.5px solid #1A237E;border-radius:5px;font-size:12px;font-family:var(--gb-font-body);background:#fff;color:#1A237E;font-weight:600">';
      for(let n=1;n<=numCarros;n++){
        html+='<option value="'+n+'"'+(carro===n?" selected":"")+'>🚐 '+n+'</option>';
      }
      html+='</select>';
    }
    html+='</div>';
  });
  html+='</div>';
  return html;
}

// Mueve un pedido a otro carro desde step 3 (sin perder horas editadas)
function _heWizMoveCarroFromStep3(docId,nuevoCarro){
  if(!_heWizardState)return;
  // Capturar horas del DOM antes de re-renderizar (sino se pierden las editadas no blureadas)
  _heCommitHorasFromDOM();
  _heWizardState.asignacionCarro.set(docId,nuevoCarro);
  _heWizardRender();
}

// Captura defensiva: lee todos los inputs de hora del DOM y guarda en state.
// Se llama antes de avanzar de step 3, por si algún onchange/blur no disparó.
function _heCommitHorasFromDOM(){
  if(!_heWizardState)return;
  document.querySelectorAll('#he-wiz-body input[type="time"][data-docid]').forEach(inp=>{
    const id=inp.dataset.docid;
    const v=inp.value;
    if(id&&v)_heWizardState.horaOverride.set(id,v);
  });
}
function _heWizSetHora(docId,hora){
  if(!_heWizardState)return;
  _heWizardState.horaOverride.set(docId,hora);
  // No re-render (perdería el focus en el input). Solo actualiza el state.
}
function _heWizRestoreHoras(){
  if(!_heWizardState)return;
  _heWizardState.horaOverride.clear();
  _heWizardRender();
}

// ─── STEP 5: Resumen + Generar ────────────────────────────
function _heWizardStep5HTML(){
  const s=_heWizardState;
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  let html='<div style="font-size:13px;color:#5D4037;margin-bottom:12px">Vas a generar los siguientes documentos:</div>';
  html+='<div style="background:#F1F8E9;border:1px solid #A5D6A7;border-radius:10px;padding:14px 16px;margin-bottom:10px">';
  // Carros
  for(let n=1;n<=s.numCarros;n++){
    const enCarro=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega"&&s.asignacionCarro.get(q.id)===n);
    if(!enCarro.length)continue;
    const cobroCarro=enCarro.reduce((sum,q)=>{
      if(!s.cobrosIncluidos.has(q.id))return sum;
      return sum+((typeof saldoPendiente==="function")?saldoPendiente(q):0);
    },0);
    html+='<div style="margin-bottom:6px"><strong>🚐 Hoja Carro '+n+'</strong> — '+enCarro.length+' entrega'+(enCarro.length===1?'':'s');
    if(cobroCarro>0)html+=' · <span style="color:#C62828">cobrar '+fmt(cobroCarro)+'</span>';
    html+='</div>';
  }
  const recogen=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="recoge");
  if(recogen.length){
    const cobroRecog=recogen.reduce((sum,q)=>{
      if(!s.cobrosIncluidos.has(q.id))return sum;
      return sum+((typeof saldoPendiente==="function")?saldoPendiente(q):0);
    },0);
    html+='<div><strong>🚶 Hoja Recogidas</strong> — '+recogen.length+' recogida'+(recogen.length===1?'':'s');
    if(cobroRecog>0)html+=' · <span style="color:#C62828">cobrar '+fmt(cobroRecog)+'</span>';
    html+='</div>';
  }
  html+='</div>';
  // Validación: total docs
  const totalEnPdfs=s.docs.length;
  html+='<div style="font-size:11.5px;color:#1B5E20;margin-bottom:10px">✓ '+totalEnPdfs+' pedido'+(totalEnPdfs===1?'':'s')+' incluido'+(totalEnPdfs===1?'':'s')+' (ningún pedido queda afuera)</div>';
  // Alertas transporte
  const alertas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="recoge"&&_heTieneTransporteCobrado(q));
  if(alertas.length){
    html+='<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:8px;padding:10px 12px;font-size:12px;color:#5D4037"><strong>⚠️ Atención:</strong> '+alertas.length+' pedido'+(alertas.length===1?'':'s')+' marcado'+(alertas.length===1?'':'s')+' como recoge tienen transporte cobrado:<br>';
    html+=alertas.map(q=>'• '+escapeHtml(q.client||"")).join('<br>');
    html+='</div>';
  }
  return html;
}

// ─── Navegación ──────────────────────────────────────────
async function _heWizardNext(){
  if(!_heWizardState)return;
  const s=_heWizardState;
  if(s.step===1){
    // Calcular si hay entregas
    const entregas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega");
    if(entregas.length<=1){
      // Skip step 2 (1 carro implícito o ninguno)
      s.numCarros=entregas.length?1:0;
      entregas.forEach(q=>s.asignacionCarro.set(q.id,1));
      s.step=3;
    }else{
      // Inicializar asignación auto
      s.numCarros=Math.min(s.numCarros||2,entregas.length);
      s.asignacionCarro=_heAutoAsignarCarros(entregas,s.numCarros);
      s.step=2;
    }
    _heWizardRender();
  }else if(s.step===2){
    // Validar carros vacíos
    const entregas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega");
    const counts=new Map();
    entregas.forEach(q=>{const c=s.asignacionCarro.get(q.id)||1;counts.set(c,(counts.get(c)||0)+1)});
    for(let n=1;n<=s.numCarros;n++){
      if(!counts.has(n)){
        if(typeof toast==="function")toast("Carro "+n+" no tiene pedidos. Asigná al menos uno o reducí los carros.","warn");
        return;
      }
    }
    s.step=3;
    _heWizardRender();
  }else if(s.step===3){
    // v7.8.1: capturar horas del DOM antes de avanzar (defensivo).
    _heCommitHorasFromDOM();
    s.step=4;
    _heWizardRender();
    // Step 4: abrir modal de cobros (superpuesto). Si no hay docs con saldo, skip.
    const docsConSaldo=s.docs.filter(q=>{
      const sal=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      return sal>0;
    });
    if(!docsConSaldo.length){
      s.cobrosIncluidos=new Set();
      s.incluirCobros=false;
      s.step=5;
      _heWizardRender();
      return;
    }
    const sel=await _heModalSelectorCobros(docsConSaldo);
    if(sel===null){
      // Canceló cobros — interpretar como "no incluir cobros" y avanzar
      s.cobrosIncluidos=new Set();
      s.incluirCobros=false;
    }else{
      s.cobrosIncluidos=sel;
      s.incluirCobros=sel.size>0;
    }
    s.step=5;
    _heWizardRender();
  }
}
function _heWizardBack(){
  if(!_heWizardState)return;
  const s=_heWizardState;
  if(s.step===5)s.step=3;
  else if(s.step===3){
    const entregas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega");
    s.step=entregas.length>1?2:1;
  }else if(s.step>1)s.step--;
  _heWizardRender();
}

// ─── Generar UN solo PDF con todas las hojas como páginas ──
// v7.8.1 (revisión Luis): un único archivo. Click "imprimir" → todo sale junto,
// imposible olvidarse de imprimir alguno y dejar pedidos sin hoja.
async function _heWizardGenerate(){
  if(!_heWizardState)return;
  const s=_heWizardState;
  // Aserción crítica: contar pedidos incluidos
  const entregas=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="entrega");
  const recogen=s.docs.filter(q=>s.tipoDespacho.get(q.id)==="recoge");
  if(entregas.length+recogen.length!==s.docs.length){
    if(typeof toast==="function")toast("ERROR: pedidos sin clasificar","error");
    return;
  }
  if(!entregas.length&&!recogen.length){
    if(typeof toast==="function")toast("No hay pedidos para generar","warn");
    return;
  }
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("l","mm","letter");
  const W=279.4,H=215.9,M=10;
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  let primeraPagina=true;
  let hojasGeneradas=0;
  // Carros
  for(let n=1;n<=s.numCarros;n++){
    const enCarro=entregas.filter(q=>s.asignacionCarro.get(q.id)===n);
    if(!enCarro.length)continue;
    if(!primeraPagina)pdf.addPage();
    primeraPagina=false;
    _heRenderHojaCarro(pdf,enCarro,n,s,W,H,M,fmt);
    hojasGeneradas++;
  }
  // Recogidas
  if(recogen.length){
    if(!primeraPagina)pdf.addPage();
    primeraPagina=false;
    _heRenderHojaRecogidas(pdf,recogen,s,W,H,M,fmt);
    hojasGeneradas++;
  }
  // Footer en cada página (paginación)
  _repPdfFooter(pdf,W,H);
  // Guardar UN solo archivo
  const fecha=_reportesGetFecha(s.docs[0])||reportesFiltrosImpr.desde;
  pdf.save("HojasReparto_"+fecha+".pdf");
  if(typeof toast==="function")toast("✅ PDF generado con "+hojasGeneradas+" hoja"+(hojasGeneradas===1?"":"s"),"success");
  _heWizardClose();
}

// ─── Render hoja de carro (1 página del PDF) ──────────────
function _heRenderHojaCarro(pdf,docs,numCarro,state,W,H,M,fmt){
  const sorted=docs.slice().sort((a,b)=>{
    const ha=state.horaOverride.get(a.id)||a.horaEntrega||"99:99";
    const hb=state.horaOverride.get(b.id)||b.horaEntrega||"99:99";
    return ha.localeCompare(hb);
  });
  const fecha=_reportesGetFecha(sorted[0])||reportesFiltrosImpr.desde;
  const subtitle=hojaFormatFecha(fecha)+"  ·  Carro "+numCarro+"  ·  "+sorted.length+" entrega"+(sorted.length===1?"":"s");
  let y=_repPdfHeader(pdf,W,"HOJA DE ENTREGAS — CARRO "+numCarro,subtitle);
  _heRenderTablaPdf(pdf,sorted,state,W,M,y,false);
  _heRenderFooterPdf(pdf,sorted,state,W,M,fmt,"Conductor",numCarro);
}

// ─── Render hoja de recogidas (1 página del PDF) ──────────
function _heRenderHojaRecogidas(pdf,docs,state,W,H,M,fmt){
  const sorted=docs.slice().sort((a,b)=>{
    const ha=state.horaOverride.get(a.id)||a.horaEntrega||"99:99";
    const hb=state.horaOverride.get(b.id)||b.horaEntrega||"99:99";
    return ha.localeCompare(hb);
  });
  const fecha=_reportesGetFecha(sorted[0])||reportesFiltrosImpr.desde;
  const subtitle=hojaFormatFecha(fecha)+"  ·  "+sorted.length+" recogida"+(sorted.length===1?"":"s");
  let y=_repPdfHeader(pdf,W,"HOJA DE RECOGIDAS EN LA CASA",subtitle);
  _heRenderTablaPdf(pdf,sorted,state,W,M,y,true);
  _heRenderFooterPdf(pdf,sorted,state,W,M,fmt,"Empacador",null);
}

// Render compartido: tabla con sub-fila items, columna QUIEN RECIBE en lugar de SAL/ENT.
// esRecogida=true → omite columna DIRECCIÓN.
function _heRenderTablaPdf(pdf,docs,state,W,M,startY,esRecogida){
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  const incluirCobro=state.incluirCobros;
  const tw=W-M*2;
  // Construir filas
  const rows=[];
  docs.forEach(q=>{
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    const cobra=state.cobrosIncluidos.has(q.id);
    const dirCorta=esRecogida?"":((q.dir||"").substring(0,40)+((q.dir||"").length>40?"...":""));
    const hora=state.horaOverride.get(q.id)||q.horaEntrega||"—";
    const fila=[hora,(q.client||"—").toString().toUpperCase(),q.id||""];
    if(!esRecogida)fila.push(dirCorta+(q.city?"\n"+q.city:""));
    fila.push(q.tel||"");
    if(incluirCobro)fila.push((cobra&&saldo>0)?fmt(saldo):"—");
    fila.push("");  // QUIEN RECIBE
    fila.push("");  // FIRMA
    rows.push(fila);
    const itemsRes=_buildItemsResumenHE(q);
    if(itemsRes){
      const colSpan=fila.length;
      // v7.9.7.1: usar ASCII ">" en lugar de "▸" (U+25B8). jsPDF helvetica no soporta
      // Unicode multi-byte → el triángulo se renderizaba como "%¸" en el PDF.
      rows.push([{content:"> "+itemsRes,colSpan:colSpan,styles:{fontSize:7,fontStyle:"italic",textColor:[80,80,80],halign:"left",cellPadding:{top:1.5,bottom:2,left:6,right:4},fillColor:[252,252,248]}}]);
    }
  });
  // Heads y columnStyles dinámicos
  const head=[];
  const cs={};
  let i=0;
  head.push("HORA");cs[i++]={halign:"center",cellWidth:tw*0.07,fontStyle:"bold"};
  head.push("CLIENTE");cs[i++]={halign:"left",cellWidth:tw*(esRecogida?0.22:0.18),fontStyle:"bold"};
  head.push("DOC");cs[i++]={halign:"center",cellWidth:tw*0.10,fontSize:7};
  if(!esRecogida){head.push("DIRECCIÓN");cs[i++]={halign:"left",cellWidth:tw*0.22,fontSize:7.5}}
  head.push("TELÉFONO");cs[i++]={halign:"center",cellWidth:tw*0.10};
  if(incluirCobro){head.push("A COBRAR");cs[i++]={halign:"right",cellWidth:tw*0.10,fontStyle:"bold"}}
  head.push("QUIEN RECIBE");cs[i++]={halign:"center",cellWidth:tw*(esRecogida?0.20:0.13)};
  head.push("FIRMA");cs[i++]={halign:"center",cellWidth:tw*(esRecogida?0.21:0.10)};
  const idxACobrar=incluirCobro?(esRecogida?4:5):-1;
  const idxQuien=incluirCobro?(esRecogida?5:6):(esRecogida?4:5);
  const idxFirma=idxQuien+1;
  pdf.autoTable({
    startY:startY,
    margin:{left:M,right:M},
    head:[head],
    body:rows,
    theme:"grid",
    headStyles:_REP_PDF_HEAD_STYLE,
    bodyStyles:{fontSize:8,cellPadding:2,valign:"middle",minCellHeight:11},
    columnStyles:cs,
    didParseCell:function(data){
      if(data.section!=="body")return;
      if(idxACobrar>=0&&data.column.index===idxACobrar&&(!data.cell.colSpan||data.cell.colSpan===1)){
        const txt=(data.cell.raw||"").toString();
        if(txt&&txt!=="—"){data.cell.styles.textColor=[198,40,40]}
        else{data.cell.styles.textColor=[180,180,180];data.cell.styles.fontStyle="normal"}
      }
    },
    didDrawCell:function(data){
      if(data.section!=="body")return;
      if(data.cell.colSpan&&data.cell.colSpan>1)return;
      // Línea para QUIEN RECIBE y FIRMA
      if(data.column.index===idxQuien||data.column.index===idxFirma){
        const lx1=data.cell.x+2;
        const lx2=data.cell.x+data.cell.width-2;
        const ly=data.cell.y+data.cell.height-3;
        pdf.setDrawColor(150);pdf.setLineWidth(0.2);
        pdf.line(lx1,ly,lx2,ly);
      }
    }
  });
}

function _heRenderFooterPdf(pdf,docs,state,W,M,fmt,labelFirma,numCarro){
  let y=pdf.lastAutoTable.finalY+8;
  if(state.incluirCobros){
    const saldo=docs.reduce((s,q)=>{
      if(!state.cobrosIncluidos.has(q.id))return s;
      return s+((typeof saldoPendiente==="function")?saldoPendiente(q):0);
    },0);
    pdf.setFontSize(10);pdf.setFont("helvetica","bold");
    if(saldo>0){
      pdf.setTextColor(198,40,40);
      pdf.text("Total a cobrar"+(numCarro?" (Carro "+numCarro+")":" (recogidas)")+": "+fmt(saldo),M,y);
    }else{
      pdf.setTextColor(46,125,50);
      pdf.text("✓ Sin cobros pendientes",M,y);
    }
    pdf.setTextColor(26,26,26);
    y+=10;
  }
  pdf.setFontSize(10);pdf.setFont("helvetica","normal");
  pdf.text(labelFirma+":",M,y);
  pdf.line(M+25,y,M+100,y);
  pdf.text("Firma:",M+110,y);
  pdf.line(M+125,y,M+200,y);
}

// Helper: items compactos para sub-fila ("50 sándwich · 20 brownies · 30 jugos")
// v7.8.8: items pre-producidos (q.itemsProducidos) van con prefijo "[YA PROD.] " para que el
// conductor sepa que ese item no se cargó hoy desde cocina (ya estaba listo de antes).
function _buildItemsResumenHE(q){
  const yaSet=new Set((q.itemsProducidos||[]).map(s=>(s||"").toLowerCase().trim()));
  const _mark=(nombre)=>yaSet.has((nombre||"").toLowerCase().trim())?"[YA PROD.] ":"";
  const parts=[];
  if(q.kind==="quote"){
    (q.cart||[]).forEach(it=>{if(it.n)parts.push(_mark(it.n)+(it.qty||0)+" "+it.n)});
    (q.cust||[]).forEach(it=>{if(it.n)parts.push(_mark(it.n)+(it.qty||0)+" "+it.n+"*")});
  }else{
    (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
      if(it.name)parts.push(_mark(it.name)+(it.qty||0)+" "+it.name);
    })));
  }
  // v7.9.7.1 F8.5: quitar truncate de 220 chars. autoTable de jsPDF wrapea
  // nativamente texto largo en celdas colSpan. Antes Diana León GB-P-2026-0102
  // (13 items) perdía los últimos 5 en la hoja de reparto. Detalle:
  // _internos/Pendientes_hoja_reparto_truncate.md.
  return parts.join(" · ");
}

async function generarPdfEntregas(){
  if(!window.jspdf||!window.jspdf.jsPDF){
    if(typeof toast==="function")toast("Error: jsPDF no cargado","error");
    return;
  }
  const docs=_impGetDocsRango(reportesIncluirEntregados);
  if(!docs.length){
    if(typeof toast==="function")toast("No hay pedidos en el rango con los filtros aplicados","warn");
    return;
  }
  // v7.8.1: usa el wizard multi-paso. El wizard maneja todo (clasificar, carros, horas, cobros, generar N PDFs).
  return _heWizardOpen(docs);
}

// v7.8.0.1 (legado): generador directo single-PDF — DEPRECATED (queda como referencia, no se llama)
// El flujo actual va por el wizard. Si en algún momento queremos volver al directo, este código
// puede recuperarse. NO ELIMINAR sin confirmar reemplazo estable del wizard.
async function _generarPdfEntregasLegado(){
  const docs=_impGetDocsRango(reportesIncluirEntregados);
  if(!docs.length)return;
  const docsConSaldo=docs.filter(q=>{
    const s=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    return s>0;
  });
  let cobrosIncluidos=new Set();
  if(docsConSaldo.length){
    const seleccion=await _heModalSelectorCobros(docsConSaldo);
    if(seleccion===null)return;
    cobrosIncluidos=seleccion;
  }
  const incluirCobro=cobrosIncluidos.size>0;
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

    const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
    // numCols: 9 si incluirCobro, 8 si no
    const numCols=incluirCobro?9:8;
    // Construir filas. Sub-fila items con colSpan dinámico.
    const rows=[];
    porDia[f].forEach(q=>{
      const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
      const cobraEsteCliente=cobrosIncluidos.has(q.id);
      const dirCorta=(q.dir||"").substring(0,40)+((q.dir||"").length>40?"...":"");
      // Fila principal
      const fila=[
        (q.horaEntrega||"—"),
        (q.client||"—").toString().toUpperCase(),
        q.id||"",
        dirCorta+(q.city?"\n"+q.city:""),
        q.tel||""
      ];
      // A COBRAR: solo monto si el cliente está marcado para cobrar Y tiene saldo. Si no, "—".
      if(incluirCobro)fila.push((cobraEsteCliente&&saldo>0)?fmt(saldo):"—");
      fila.push("");  // SAL
      fila.push("");  // ENT
      fila.push("");  // FIRMA
      rows.push(fila);
      // Sub-fila items (colSpan dinámico)
      const itemsResumen=_buildItemsResumenHE(q);
      if(itemsResumen){
        rows.push([{
          content:"▸ "+itemsResumen,
          colSpan:numCols,
          styles:{
            fontSize:7,
            fontStyle:"italic",
            textColor:[80,80,80],
            halign:"left",
            cellPadding:{top:1.5,bottom:2,left:6,right:4},
            fillColor:[252,252,248]
          }
        }]);
      }
    });

    if(pdf.autoTable){
      const tw=W-M*2;
      const head=incluirCobro
        ? [["HORA","CLIENTE","DOC","DIRECCIÓN","TELÉFONO","A COBRAR","SAL","ENT","FIRMA CLIENTE"]]
        : [["HORA","CLIENTE","DOC","DIRECCIÓN","TELÉFONO","SAL","ENT","FIRMA CLIENTE"]];
      const columnStyles=incluirCobro
        ? {
            0:{halign:"center",cellWidth:tw*0.07,fontStyle:"bold"},
            1:{halign:"left",cellWidth:tw*0.18,fontStyle:"bold"},
            2:{halign:"center",cellWidth:tw*0.10,fontSize:7},
            3:{halign:"left",cellWidth:tw*0.24,fontSize:7.5},
            4:{halign:"center",cellWidth:tw*0.10},
            5:{halign:"right",cellWidth:tw*0.10,fontStyle:"bold"},
            6:{halign:"center",cellWidth:tw*0.05},
            7:{halign:"center",cellWidth:tw*0.05},
            8:{halign:"center",cellWidth:tw*0.11}
          }
        : {
            0:{halign:"center",cellWidth:tw*0.07,fontStyle:"bold"},
            1:{halign:"left",cellWidth:tw*0.20,fontStyle:"bold"},
            2:{halign:"center",cellWidth:tw*0.10,fontSize:7},
            3:{halign:"left",cellWidth:tw*0.27,fontSize:7.5},
            4:{halign:"center",cellWidth:tw*0.10},
            5:{halign:"center",cellWidth:tw*0.05},
            6:{halign:"center",cellWidth:tw*0.05},
            7:{halign:"center",cellWidth:tw*0.16}
          };
      // Posiciones de SAL/ENT/FIRMA según haya o no A COBRAR
      const idxSAL=incluirCobro?6:5;
      const idxENT=incluirCobro?7:6;
      const idxFIRMA=incluirCobro?8:7;
      pdf.autoTable({
        startY:y,
        margin:{left:M,right:M},
        head:head,
        body:rows,
        theme:"grid",
        headStyles:_REP_PDF_HEAD_STYLE,
        bodyStyles:{fontSize:8,cellPadding:2,valign:"middle",minCellHeight:11},
        columnStyles:columnStyles,
        didParseCell:function(data){
          if(data.section!=="body")return;
          // A COBRAR (col 5): solo si incluirCobro
          if(incluirCobro&&data.column.index===5&&(!data.cell.colSpan||data.cell.colSpan===1)){
            const txt=(data.cell.raw||"").toString();
            if(txt&&txt!=="—"){
              data.cell.styles.textColor=[198,40,40];
            }else{
              data.cell.styles.textColor=[180,180,180];
              data.cell.styles.fontStyle="normal";
            }
          }
        },
        didDrawCell:function(data){
          if(data.section!=="body")return;
          // Skip filas merged (sub-filas items)
          if(data.cell.colSpan&&data.cell.colSpan>1)return;
          if(data.column.index===idxSAL||data.column.index===idxENT){
            const cx=data.cell.x+data.cell.width/2-2.5;
            const cy=data.cell.y+data.cell.height/2-2.5;
            pdf.setDrawColor(80);pdf.setLineWidth(0.3);
            pdf.rect(cx,cy,5,5);
          }else if(data.column.index===idxFIRMA){
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

    // Footer: total a cobrar solo de los marcados (ya filtrado por incluirCobro y selección)
    if(incluirCobro){
      const saldoDia=porDia[f].reduce((s,q)=>{
        if(!cobrosIncluidos.has(q.id))return s;
        return s+((typeof saldoPendiente==="function")?saldoPendiente(q):0);
      },0);
      pdf.setFontSize(10);pdf.setFont("helvetica","bold");
      if(saldoDia>0){
        pdf.setTextColor(198,40,40);
        pdf.text("Total a cobrar hoy: "+fmt(saldoDia),M,y);
      }else{
        pdf.setTextColor(46,125,50);
        pdf.text("✓ Sin cobros pendientes",M,y);
      }
      pdf.setTextColor(26,26,26);
      y+=10;
    }

    pdf.setFontSize(10);pdf.setFont("helvetica","normal");
    pdf.text("Conductor:",M,y);
    pdf.line(M+25,y,M+100,y);
    pdf.text("Firma:",M+110,y);
    pdf.line(M+125,y,M+200,y);
  });

  _repPdfFooter(pdf,W,H);

  const fname="HojaEntregasPendientes_"+reportesFiltrosImpr.desde+(reportesFiltrosImpr.desde===reportesFiltrosImpr.hasta?"":"_a_"+reportesFiltrosImpr.hasta)+".pdf";
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

// ═══════════════════════════════════════════════════════════
// v7.6 — CARTERA > HISTÓRICO DE COBROS
// Vista de TODOS los pagos recibidos, con filtros por fecha/método/cliente.
// ═══════════════════════════════════════════════════════════

let _carteraHistFiltros={
  desde: "",
  hasta: "",
  metodo: "",   // "" = todos
  cliente: ""
};

function _getPagosEnRango(filtros){
  // Devuelve array de {pago, doc} con todos los pagos en el rango filtrado.
  const out=[];
  if(!Array.isArray(quotesCache))return out;
  const desde=filtros.desde, hasta=filtros.hasta;
  if(!desde||!hasta)return out;
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    const pagos=(typeof getPagos==="function")?getPagos(q):(q.pagos||[]);
    pagos.forEach(p=>{
      const fp=(p.fecha||"").slice(0,10);
      if(!fp||fp<desde||fp>hasta)return;
      // Filtro método
      if(filtros.metodo&&filtros.metodo!=="todos"){
        const pm=p.metodo||"Otro";
        if(pm!==filtros.metodo)return;
      }
      // Filtro cliente (substring case-insensitive)
      if(filtros.cliente){
        const cli=(q.client||"").toLowerCase();
        if(!cli.includes(filtros.cliente.toLowerCase()))return;
      }
      out.push({pago:p,doc:q});
    });
  });
  // Orden: fecha desc (más recientes arriba), tiebreak por monto desc
  out.sort((a,b)=>{
    const fa=(a.pago.fecha||"").localeCompare(b.pago.fecha||"");
    if(fa!==0)return -fa;
    return (parseInt(b.pago.monto)||0)-(parseInt(a.pago.monto)||0);
  });
  return out;
}

function _carteraHistDefaults(){
  if(!_carteraHistFiltros.desde){
    const t=new Date();
    _carteraHistFiltros.desde=gbDateToIso(new Date(t.getFullYear(),t.getMonth(),1));
  }
  if(!_carteraHistFiltros.hasta){
    _carteraHistFiltros.hasta=gbTodayIso();
  }
}

// ═══════════════════════════════════════════════════════════
// v7.7.1: MÓDULO CLIENTES — DIRECTORIO
// ═══════════════════════════════════════════════════════════
// Lista navegable de clientes con buscador local, banner de migración
// (primer ingreso si hay clientes en pedidos viejos no importados),
// click → abre modal editor para CRUD completo.

// Cuenta cuántos clientes únicos aparecen en quotesCache pero NO existen
// en clientsCache (case-insensitive por nombre normalizado).
function _cliDirCountPendingMigration(){
  if(!quotesCache.length)return 0;
  const seen=new Set(clientsCache.map(c=>(c.name||"").toLowerCase().trim()));
  const pending=new Set();
  quotesCache.forEach(q=>{
    const raw=(q.client||"").trim();
    if(!raw)return;
    const key=raw.toLowerCase();
    if(!seen.has(key))pending.add(key);
  });
  return pending.size;
}

async function renderClientesDirectorio(){
  if(!clientsCache.length){try{await loadClientsFromCloud()}catch{}}
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  // Banner migración (si hay pendientes Y no se rechazó antes)
  const skipped=localStorage.getItem("gb_clients_migration_skipped")==="1";
  const pending=_cliDirCountPendingMigration();
  const banner=$("cli-dir-migrate-banner");
  if(banner){
    if(pending>0&&!skipped){
      $("cli-dir-migrate-count").textContent=pending;
      banner.classList.remove("hidden");
    }else{
      banner.classList.add("hidden");
    }
  }
  // Buscador
  const term=($("cli-dir-search").value||"").toLowerCase().trim();
  // Conteo de docs por cliente (case-insensitive por nombre)
  const docsByCli={};
  quotesCache.forEach(q=>{
    const k=(q.client||"").toLowerCase().trim();
    if(!k)return;
    if(!docsByCli[k])docsByCli[k]={n:0,lastIso:""};
    docsByCli[k].n++;
    const iso=q.dateISO||q.eventDate||"";
    if(iso&&iso>docsByCli[k].lastIso)docsByCli[k].lastIso=iso;
  });
  // Filtro
  const list=clientsCache.filter(c=>{
    if(!term)return true;
    const hay=[c.name,c.razonSocial,c.idnum,c.tel,c.mail,c.att].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(term);
  });
  $("cli-dir-summary").textContent=list.length+" cliente"+(list.length!==1?"s":"")+(term?" (filtrado de "+clientsCache.length+")":"");
  const el=$("cli-dir-list");
  if(!list.length){
    el.innerHTML='<div style="text-align:center;padding:40px 20px;color:#9E9E9E;font-style:italic">'+
      (term?'🔍 Sin resultados para "'+h(term)+'"':'👥 No hay clientes todavía. Tocá <strong>+ Nuevo cliente</strong> para empezar.')+
      '</div>';
    return;
  }
  list.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  el.innerHTML=list.map(c=>{
    const k=(c.name||"").toLowerCase().trim();
    const stats=docsByCli[k]||{n:0,lastIso:""};
    const tipoIco=c.tipo==="empresa"?"🏢":"👤";
    const cat=c.categoria||"particular";
    const catCls={corporativo:"#01579B",particular:"#5D4037",recurrente:"#1B5E20"}[cat]||"#5D4037";
    const catBg={corporativo:"#E1F5FE",particular:"#EFEBE9",recurrente:"#E8F5E9"}[cat]||"#EFEBE9";
    const meta=[c.city,c.tel,c.mail].filter(Boolean).join(" · ");
    const lastStr=stats.lastIso?_cliDirFmtDate(stats.lastIso):"sin actividad";
    const idStr=c.idtype&&c.idnum?c.idtype+" "+c.idnum:"";
    return '<div class="cli-card" onclick="abrirFichaCliente(\''+c.id+'\')" style="background:#fff;border:1px solid #E0E0E0;border-left:4px solid '+catCls+';border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:transform .1s">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:4px">'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;font-size:14px;color:#1A1A1A">'+tipoIco+' '+h(c.name||"—")+
          (c.razonSocial?'<span style="font-weight:400;color:#757575;font-size:12px;margin-left:6px">('+h(c.razonSocial)+')</span>':'')+
          '</div>'+
          (idStr?'<div style="font-size:11px;color:#9E9E9E;margin-top:1px">'+h(idStr)+(c.nitDV?'-'+h(c.nitDV):'')+'</div>':'')+
        '</div>'+
        '<span style="background:'+catBg+';color:'+catCls+';font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.3px">'+cat+'</span>'+
      '</div>'+
      (meta?'<div style="font-size:11.5px;color:#607D8B;margin-bottom:3px">'+h(meta)+'</div>':'')+
      '<div style="display:flex;gap:12px;font-size:11px;color:#9E9E9E;margin-top:4px">'+
        '<span>📄 '+stats.n+' doc'+(stats.n!==1?'s':'')+'</span>'+
        '<span>· Última actividad: '+lastStr+'</span>'+
      '</div>'+
    '</div>';
  }).join("");
}

function _cliDirFmtDate(iso){
  const p=parseIsoDate(iso);if(!p)return iso;
  const m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return p.d+" "+m[p.m]+" "+p.y;
}

async function cliDirRunMigration(){
  showLoader("Importando clientes...");
  try{
    const r=await migrateClientsFromQuotes();
    hideLoader();
    toast("✅ "+r.creados+" cliente"+(r.creados!==1?"s":"")+" importado"+(r.creados!==1?"s":"")+(r.errores?" · "+r.errores+" error(es)":""),"success",5000);
    localStorage.setItem("gb_clients_migration_skipped","1"); // ya corrió, no preguntes más
    renderClientesDirectorio();
  }catch(e){
    hideLoader();
    toast("Error en migración: "+e.message,"error");
    console.error(e);
  }
}

function cliDirSkipMigration(){
  localStorage.setItem("gb_clients_migration_skipped","1");
  $("cli-dir-migrate-banner").classList.add("hidden");
}

// ─── Editor de cliente (modal) ─────────────────────────────
let _cliEditorId=null; // null = nuevo, id = editando
function openClienteEditor(id){
  _cliEditorId=id;
  const c=id?clientsCache.find(x=>x.id===id):null;
  const isNew=!c;
  // Default values
  const v={
    name:c?.name||"",
    tipo:c?.tipo||"persona",
    razonSocial:c?.razonSocial||"",
    categoria:c?.categoria||"particular",
    idtype:c?.idtype||"",
    idnum:c?.idnum||"",
    nitDV:c?.nitDV||"",
    att:c?.att||"",
    tel:c?.tel||"",
    mail:c?.mail||"",
    dir:c?.dir||"",
    city:c?.city||"",
    cityCustom:c?.cityCustom||"",
    notas:c?.notas||"",
    feRegimen:c?.fe?.regimen||"",
    feDirFiscal:c?.fe?.dirFiscal||""
  };
  $("cli-ed-title").textContent=isNew?"Nuevo cliente":"Editar cliente";
  $("cli-ed-name").value=v.name;
  $("cli-ed-tipo").value=v.tipo;
  $("cli-ed-razonSocial").value=v.razonSocial;
  $("cli-ed-categoria").value=v.categoria;
  $("cli-ed-idtype").value=v.idtype;
  $("cli-ed-idnum").value=v.idnum;
  $("cli-ed-nitDV").value=v.nitDV;
  $("cli-ed-att").value=v.att;
  $("cli-ed-tel").value=v.tel;
  $("cli-ed-mail").value=v.mail;
  $("cli-ed-dir").value=v.dir;
  $("cli-ed-city").value=v.city;
  $("cli-ed-cityCustom").value=v.cityCustom;
  $("cli-ed-notas").value=v.notas;
  $("cli-ed-feRegimen").value=v.feRegimen;
  $("cli-ed-feDirFiscal").value=v.feDirFiscal;
  $("cli-ed-del-btn").style.display=isNew?"none":"inline-block";
  cliEdToggleEmpresaFields();
  cliEdToggleCustomCity();
  $("cli-ed-modal").classList.remove("hidden");
}
function closeClienteEditor(){
  $("cli-ed-modal").classList.add("hidden");
  _cliEditorId=null;
}
function cliEdToggleEmpresaFields(){
  const isEmp=$("cli-ed-tipo").value==="empresa";
  $("cli-ed-razonSocial-wrap").classList.toggle("hidden",!isEmp);
}
function cliEdToggleCustomCity(){
  $("cli-ed-cityCustom-wrap").classList.toggle("hidden",$("cli-ed-city").value!=="Otra");
}
async function saveClienteEditor(){
  const name=$("cli-ed-name").value.trim();
  if(!name){toast("El nombre es obligatorio","warn");return}
  const obj={
    name:name,
    tipo:$("cli-ed-tipo").value||"persona",
    razonSocial:$("cli-ed-razonSocial").value.trim(),
    categoria:$("cli-ed-categoria").value||"particular",
    idtype:$("cli-ed-idtype").value,
    idnum:$("cli-ed-idnum").value.trim(),
    nitDV:$("cli-ed-nitDV").value.trim(),
    att:$("cli-ed-att").value.trim(),
    tel:$("cli-ed-tel").value.trim(),
    mail:$("cli-ed-mail").value.trim(),
    dir:$("cli-ed-dir").value.trim(),
    city:$("cli-ed-city").value,
    cityCustom:$("cli-ed-cityCustom").value.trim(),
    notas:$("cli-ed-notas").value.trim(),
    fe:{
      regimen:$("cli-ed-feRegimen").value||"",
      dirFiscal:$("cli-ed-feDirFiscal").value.trim()
    }
  };
  showLoader("Guardando...");
  try{
    await saveClientToCloud(obj,{fullUpdate:true});
    hideLoader();
    toast("✅ Cliente guardado","success");
    closeClienteEditor();
    renderClientesDirectorio();
    refreshCliSel();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
    console.error(e);
  }
}
async function delClienteEditor(){
  if(!_cliEditorId)return;
  const c=clientsCache.find(x=>x.id===_cliEditorId);
  if(!c)return;
  // Contar docs huérfanos que quedan tras borrar
  const k=(c.name||"").toLowerCase().trim();
  const huerfanos=quotesCache.filter(q=>(q.client||"").toLowerCase().trim()===k).length;
  const msg=huerfanos>0
    ? "¿Eliminar a "+c.name+"?\n\nQuedan "+huerfanos+" doc(s) con su nombre que ya no estarán vinculados al directorio (siguen visibles en pedidos/historial)."
    : "¿Eliminar a "+c.name+"?";
  if(!confirm(msg))return;
  showLoader("Eliminando...");
  try{
    await deleteClientFromCloud(_cliEditorId);
    hideLoader();
    toast("Cliente eliminado","success");
    closeClienteEditor();
    renderClientesDirectorio();
    refreshCliSel();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

// ═══════════════════════════════════════════════════════════
// v7.8 F1: PROVEEDORES — Directorio CRUD
// ═══════════════════════════════════════════════════════════
// Mismo patrón que Clientes (renderClientesDirectorio + openClienteEditor).
// Diferencias: campo "nombre" (no "name"), categoría con "Otro: ___" libre,
// borrar archiva si tiene compras vinculadas (deleteOrArchiveProveedor).

const PROV_CAT_LABELS={
  insumos:"🥬 Insumos",
  bebidas:"🥤 Bebidas",
  menaje:"🍽️ Menaje",
  empaques:"📦 Empaques",
  transporte:"🚛 Transporte",
  regalos:"🎁 Regalos",
  otro:"✏️ Otro"
};

function _provCatLabel(p){
  if(!p)return "—";
  if(p.categoria==="otro"&&p.categoriaPersonalizada)return "✏️ "+p.categoriaPersonalizada;
  return PROV_CAT_LABELS[p.categoria]||"—";
}

async function renderProveedoresDirectorio(){
  const list=$("prov-dir-list");
  if(!list)return;
  if(!proveedoresCache.length&&cloudOnline){
    try{await loadProveedoresFromCloud()}catch{}
  }
  const search=($("prov-dir-search")?.value||"").toLowerCase().trim();
  const filterCat=$("prov-dir-filter-cat")?.value||"";
  const items=proveedoresCache.filter(p=>{
    if(p.archivado)return false;
    if(filterCat&&p.categoria!==filterCat)return false;
    if(!search)return true;
    const hay=[p.nombre,p.idNum,p.tel,p.email,p.quienAtiende,p.categoriaPersonalizada].map(x=>(x||"").toLowerCase()).join(" ");
    return hay.includes(search);
  });
  // Summary
  const sumEl=$("prov-dir-summary");
  if(sumEl){
    const totalActivos=proveedoresCache.filter(p=>!p.archivado).length;
    sumEl.textContent=items.length===totalActivos
      ? totalActivos+" proveedores"
      : items.length+" de "+totalActivos+" mostrados";
  }
  if(!items.length){
    if(!proveedoresCache.length){
      list.innerHTML='<div style="text-align:center;padding:40px 20px;color:#757575"><div style="font-size:42px;margin-bottom:10px">🏪</div><div style="font-size:15px;font-weight:600;color:#5D4037;margin-bottom:6px">Aún no hay proveedores</div><div style="font-size:13px;margin-bottom:14px">Empezá creando el primero — solo el nombre es obligatorio.</div><button class="btn bg" onclick="openProveedorEditor(null)" style="background:#1B5E20;color:#fff">+ Nuevo proveedor</button></div>';
    }else{
      list.innerHTML='<div style="text-align:center;padding:30px 20px;color:#757575;font-size:13px">No hay proveedores que coincidan con el filtro.</div>';
    }
    return;
  }
  // Cards
  let html="";
  items.forEach(p=>{
    const cat=_provCatLabel(p);
    const compras=(typeof comprasCache!=="undefined")?comprasCache.filter(c=>c.proveedorId===p.id):[];
    const nCompras=compras.length;
    const totalComprado=compras.reduce((s,c)=>s+(Number(c.total)||0),0);
    const contactBits=[];
    if(p.tel)contactBits.push("📞 "+p.tel);
    if(p.email)contactBits.push("✉️ "+p.email);
    const contacto=contactBits.join(" · ")||'<span style="color:#BDBDBD">Sin contacto</span>';
    html+='<div onclick="openProveedorEditor(\''+p.id+'\')" style="background:#fff;border:1px solid #E0E0E0;border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.08)\'" onmouseout="this.style.boxShadow=\'none\'">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">';
    html+='<div style="flex:1;min-width:200px">';
    html+='<div style="font-size:14.5px;font-weight:700;color:#1A1A1A">'+escapeHtml(p.nombre||"(sin nombre)")+'</div>';
    html+='<div style="font-size:11.5px;color:#757575;margin-top:2px">'+cat+(p.idNum?' · '+(p.tipoId||"")+' '+escapeHtml(p.idNum):'')+'</div>';
    html+='<div style="font-size:12px;color:#5D4037;margin-top:4px">'+contacto+'</div>';
    if(p.quienAtiende)html+='<div style="font-size:11.5px;color:#9E6B3F;margin-top:3px">👤 '+escapeHtml(p.quienAtiende)+'</div>';
    html+='</div>';
    html+='<div style="text-align:right;font-size:11px;color:#757575;min-width:90px">';
    if(nCompras>0){
      html+='<div style="font-weight:700;color:#1B5E20">'+nCompras+' compra'+(nCompras===1?'':'s')+'</div>';
      html+='<div>'+fm(totalComprado)+'</div>';
    }else{
      html+='<div style="color:#BDBDBD">Sin compras</div>';
    }
    html+='</div>';
    html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
}

let _provEditorId=null;

function openProveedorEditor(id){
  _provEditorId=id;
  const p=id?proveedoresCache.find(x=>x.id===id):null;
  const isNew=!p;
  $("prov-ed-title").textContent=isNew?"Nuevo proveedor":"Editar proveedor";
  $("prov-ed-nombre").value=p?.nombre||"";
  $("prov-ed-categoria").value=p?.categoria||"";
  $("prov-ed-categoriaPersonalizada").value=p?.categoriaPersonalizada||"";
  $("prov-ed-tipoId").value=p?.tipoId||"";
  $("prov-ed-idNum").value=p?.idNum||"";
  $("prov-ed-tel").value=p?.tel||"";
  $("prov-ed-email").value=p?.email||"";
  $("prov-ed-direccion").value=p?.direccion||"";
  $("prov-ed-quienAtiende").value=p?.quienAtiende||"";
  $("prov-ed-notas").value=p?.notas||"";
  $("prov-ed-del-btn").style.display=isNew?"none":"inline-block";
  provEdToggleCatOtro();
  $("prov-ed-modal").classList.remove("hidden");
}

function closeProveedorEditor(){
  $("prov-ed-modal").classList.add("hidden");
  _provEditorId=null;
}

function provEdToggleCatOtro(){
  const isOtro=$("prov-ed-categoria").value==="otro";
  $("prov-ed-categoriaPersonalizada-wrap").classList.toggle("hidden",!isOtro);
}

async function saveProveedorEditor(){
  const nombre=$("prov-ed-nombre").value.trim();
  if(!nombre){toast("El nombre es obligatorio","warn");return}
  const cat=$("prov-ed-categoria").value;
  const obj={
    nombre:nombre,
    categoria:cat||"",
    categoriaPersonalizada:cat==="otro"?$("prov-ed-categoriaPersonalizada").value.trim():"",
    tipoId:$("prov-ed-tipoId").value||"",
    idNum:$("prov-ed-idNum").value.trim(),
    tel:$("prov-ed-tel").value.trim(),
    email:$("prov-ed-email").value.trim(),
    direccion:$("prov-ed-direccion").value.trim(),
    quienAtiende:$("prov-ed-quienAtiende").value.trim(),
    notas:$("prov-ed-notas").value.trim()
  };
  showLoader("Guardando...");
  try{
    await saveProveedorToCloud(obj,{fullUpdate:true,id:_provEditorId});
    hideLoader();
    toast("✅ Proveedor guardado","success");
    closeProveedorEditor();
    renderProveedoresDirectorio();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
    console.error(e);
  }
}

async function delProveedorEditor(){
  if(!_provEditorId)return;
  const p=proveedoresCache.find(x=>x.id===_provEditorId);
  if(!p)return;
  const vinculadas=(typeof comprasCache!=="undefined")?comprasCache.filter(c=>c.proveedorId===_provEditorId).length:0;
  const msg=vinculadas>0
    ? "Este proveedor tiene "+vinculadas+" compra(s) vinculada(s).\n\nNo se puede borrar (rompería el histórico).\n¿Querés ARCHIVARLO? Dejará de aparecer en dropdowns nuevos pero el histórico se mantiene."
    : "¿Eliminar a "+p.nombre+"?";
  if(!confirm(msg))return;
  showLoader(vinculadas>0?"Archivando...":"Eliminando...");
  try{
    const r=await deleteOrArchiveProveedor(_provEditorId);
    hideLoader();
    toast(r.modo==="archivado"?"📦 Proveedor archivado":"Proveedor eliminado","success");
    closeProveedorEditor();
    renderProveedoresDirectorio();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

// Helper: escape HTML para evitar XSS en nombres con < > & etc.
// Si ya existe en el archivo, este se ignora silenciosamente por hoisting de function declaration.
function escapeHtml(s){
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ═══════════════════════════════════════════════════════════
// v7.8 F2: COMPRAS — Modal CRUD (sin vistas todavía: F3/F4/F5)
// ═══════════════════════════════════════════════════════════
// Modal único reusable para Lista pendiente y Histórico. Estado pendiente|comprada
// determina default del flujo. Reusa _compressImageFile (app-historial.js) y
// uploadFotoFromBase64 (app-core.js) para comprobantes.

let _compraEditorId=null;
let _compraEdFotoB64=null;          // base64 mientras no se ha subido a Storage
let _compraEdFotoExisting=null;     // {url,path} de comprobante ya subido (si edición)
let _compraEdItemRowSeq=0;
let _compraEdLinkedPendientes=[];   // v7.8 F3 conciliación: IDs a borrar al guardar

function openCompraEditor(id,defaults){
  _compraEditorId=id;
  _compraEdFotoB64=null;
  _compraEdFotoExisting=null;
  _compraEdLinkedPendientes=Array.isArray(defaults?.linkedPendientes)?defaults.linkedPendientes.slice():[];
  const c=id?comprasCache.find(x=>x.id===id):null;
  const isNew=!c;
  $("compra-ed-title").textContent=isNew?"Nueva compra":"Editar compra";
  // Estado: si nuevo, default desde defaults?.estado o 'comprada'
  const estado=c?c.estado:(defaults?.estado||"comprada");
  $("compra-ed-estado-pendiente").checked=estado==="pendiente";
  $("compra-ed-estado-comprada").checked=estado==="comprada";
  // Proveedor: poblar dropdown desde proveedoresCache (no archivados)
  _compraEdRefreshProveedorOptions(c?.proveedorId||defaults?.proveedorId||"");
  // Fecha: si nuevo y comprada → hoy. Si pendiente → vacío.
  let fecha="";
  if(c&&c.fecha)fecha=c.fecha;
  else if(estado==="comprada")fecha=gbTodayIso?gbTodayIso():new Date().toISOString().slice(0,10);
  $("compra-ed-fecha").value=fecha;
  $("compra-ed-formaPago").value=c?.formaPago||"";
  $("compra-ed-nota").value=c?.nota||"";
  $("compra-ed-total").value=c?.total||"";
  // Items
  $("compra-ed-items-list").innerHTML="";
  _compraEdItemRowSeq=0;
  const items=(c?.items&&c.items.length)?c.items:(defaults?.items||[]);
  if(items.length){items.forEach(it=>compraEdAddItem(it))}
  else{compraEdAddItem()}
  _compraEdRefreshItemsDatalist();
  // Comprobante existente
  $("compra-ed-foto-input").value="";
  if(c&&c.comprobante&&c.comprobante.url){
    _compraEdFotoExisting={url:c.comprobante.url,path:c.comprobante.path||""};
    $("compra-ed-foto-preview").innerHTML='<div style="display:flex;gap:8px;align-items:flex-start"><img src="'+escapeHtml(c.comprobante.url)+'" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #ddd"><button type="button" onclick="compraEdRemoveFoto()" style="background:#fff;color:#C62828;border:1px solid #EF9A9A;padding:5px 10px;border-radius:5px;font-size:11px;cursor:pointer">Quitar</button></div>';
  }else{
    $("compra-ed-foto-preview").innerHTML="";
  }
  $("compra-ed-del-btn").style.display=isNew?"none":"inline-block";
  $("compra-ed-modal").classList.remove("hidden");
}

function closeCompraEditor(){
  $("compra-ed-modal").classList.add("hidden");
  _compraEditorId=null;
  _compraEdFotoB64=null;
  _compraEdFotoExisting=null;
  _compraEdLinkedPendientes=[];
}

function compraEdToggleEstado(){
  // Si pasa de pendiente → comprada y no hay fecha, set today
  const esComprada=$("compra-ed-estado-comprada").checked;
  if(esComprada&&!$("compra-ed-fecha").value){
    $("compra-ed-fecha").value=gbTodayIso?gbTodayIso():new Date().toISOString().slice(0,10);
  }
}

function _compraEdRefreshProveedorOptions(selectedId){
  const sel=$("compra-ed-proveedorId");
  if(!sel)return;
  const opts=['<option value="">— Seleccionar proveedor —</option>'];
  proveedoresCache
    .filter(p=>!p.archivado)
    .slice()
    .sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""))
    .forEach(p=>{
      const cat=p.categoria==="otro"?(p.categoriaPersonalizada||"otro"):(p.categoria||"");
      opts.push('<option value="'+p.id+'">'+escapeHtml(p.nombre||"")+(cat?" — "+escapeHtml(cat):"")+'</option>');
    });
  sel.innerHTML=opts.join("");
  if(selectedId)sel.value=selectedId;
}

// Datalist de nombres únicos de ítems comprados antes (autocomplete)
function _compraEdRefreshItemsDatalist(){
  const dl=$("compra-ed-items-datalist");
  if(!dl)return;
  const set=new Set();
  comprasCache.forEach(c=>{
    (c.items||[]).forEach(it=>{
      const n=(it.nombre||"").trim();
      if(n)set.add(n);
    });
  });
  dl.innerHTML=Array.from(set).sort().map(n=>'<option value="'+escapeHtml(n)+'">').join("");
}

function compraEdAddItem(item){
  const list=$("compra-ed-items-list");
  if(!list)return;
  const rowId="compra-ed-item-"+(_compraEdItemRowSeq++);
  const nombre=item?.nombre||"";
  const cant=item?.cantidad||"";
  const pu=item?.precioUnitario||"";
  const row=document.createElement("div");
  row.id=rowId;
  row.style.cssText="display:grid;grid-template-columns:1fr 70px 100px 24px;gap:6px;align-items:center";
  row.innerHTML=
    '<input type="text" class="ce-item-nombre" list="compra-ed-items-datalist" placeholder="Producto / descripción" value="'+escapeHtml(nombre)+'" oninput="compraEdRecalcTotal()" style="padding:7px 9px;border:1.5px solid #BDBDBD;border-radius:5px;font-size:13px;font-family:var(--gb-font-body)">'+
    '<input type="number" class="ce-item-cant" min="0" step="any" placeholder="Cant" value="'+cant+'" oninput="compraEdRecalcTotal()" style="padding:7px 9px;border:1.5px solid #BDBDBD;border-radius:5px;font-size:13px;font-family:var(--gb-font-body);text-align:right">'+
    '<input type="number" class="ce-item-pu" min="0" step="any" placeholder="$ unit" value="'+pu+'" oninput="compraEdRecalcTotal()" style="padding:7px 9px;border:1.5px solid #BDBDBD;border-radius:5px;font-size:13px;font-family:var(--gb-font-body);text-align:right">'+
    '<button onclick="compraEdRemoveItem(\''+rowId+'\')" type="button" style="background:transparent;border:none;color:#C62828;cursor:pointer;font-size:18px;padding:0">×</button>';
  list.appendChild(row);
}

function compraEdRemoveItem(rowId){
  const r=document.getElementById(rowId);
  if(r)r.remove();
  compraEdRecalcTotal();
}

function compraEdRecalcTotal(){
  const list=$("compra-ed-items-list");
  if(!list)return;
  let total=0;
  list.querySelectorAll(":scope > div").forEach(row=>{
    const cant=parseFloat(row.querySelector(".ce-item-cant")?.value||0)||0;
    const pu=parseFloat(row.querySelector(".ce-item-pu")?.value||0)||0;
    total+=cant*pu;
  });
  // Solo sobrescribe el total si el usuario no lo editó manualmente
  const totalEl=$("compra-ed-total");
  if(totalEl&&!totalEl.dataset.manual)totalEl.value=total||"";
}

// Si el usuario edita el total manualmente, marcar para no pisarlo
(function(){
  document.addEventListener("input",function(e){
    if(e.target&&e.target.id==="compra-ed-total")e.target.dataset.manual="1";
  });
})();

function compraEdPreviewFoto(ev){
  const file=ev.target.files[0];
  if(!file){_compraEdFotoB64=null;$("compra-ed-foto-preview").innerHTML="";return}
  if(typeof _compressImageFile!=="function"){
    toast("Helper de compresión no disponible","error");return;
  }
  _compressImageFile(file,b64=>{
    _compraEdFotoB64=b64;
    _compraEdFotoExisting=null; // si subo nueva, se descarta la anterior
    const sizeKB=Math.round(b64.length*0.75/1024);
    $("compra-ed-foto-preview").innerHTML='<div style="display:flex;gap:8px;align-items:flex-start"><img src="'+b64+'" style="max-width:120px;max-height:120px;border-radius:6px;border:1px solid #ddd"><div><div style="font-size:11px;color:#666">Comprimida: '+sizeKB+' KB</div><button type="button" onclick="compraEdRemoveFoto()" style="margin-top:4px;background:#fff;color:#C62828;border:1px solid #EF9A9A;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">Quitar</button></div></div>';
  });
}

function compraEdRemoveFoto(){
  _compraEdFotoB64=null;
  _compraEdFotoExisting=null;
  $("compra-ed-foto-input").value="";
  $("compra-ed-foto-preview").innerHTML="";
}

// Quick-create proveedor desde modal compra
let _provQuickReturnTo=null;
function compraEdQuickCreateProveedor(){
  _provQuickReturnTo="compra";
  $("prov-quick-nombre").value="";
  $("prov-quick-modal").classList.remove("hidden");
  setTimeout(()=>$("prov-quick-nombre").focus(),50);
}
function closeProvQuick(){
  $("prov-quick-modal").classList.add("hidden");
  _provQuickReturnTo=null;
}
async function saveProvQuick(){
  const nombre=$("prov-quick-nombre").value.trim();
  if(!nombre){toast("El nombre es obligatorio","warn");return}
  showLoader("Creando...");
  try{
    await saveProveedorToCloud({nombre:nombre},{fullUpdate:true});
    hideLoader();
    closeProvQuick();
    toast("✅ Proveedor creado","success");
    // Refrescar dropdown del modal compra y seleccionar el nuevo
    const nuevo=proveedoresCache.find(p=>(p.nombre||"").toLowerCase()===nombre.toLowerCase());
    _compraEdRefreshProveedorOptions(nuevo?.id||"");
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

async function saveCompraEditor(){
  const proveedorId=$("compra-ed-proveedorId").value;
  const estado=$("compra-ed-estado-pendiente").checked?"pendiente":"comprada";
  // Validación: si es comprada, proveedor obligatorio. Si es pendiente, se permite vacío (caso "anotar rápido" futuro F3).
  if(estado==="comprada"&&!proveedorId){
    toast("Para una compra realizada, elegí un proveedor","warn");return;
  }
  const proveedor=proveedoresCache.find(p=>p.id===proveedorId);
  // Recolectar items
  const itemRows=$("compra-ed-items-list").querySelectorAll(":scope > div");
  const items=[];
  itemRows.forEach(row=>{
    const nombre=(row.querySelector(".ce-item-nombre")?.value||"").trim();
    const cantidad=parseFloat(row.querySelector(".ce-item-cant")?.value||0)||0;
    const precioUnitario=parseFloat(row.querySelector(".ce-item-pu")?.value||0)||0;
    if(nombre||cantidad||precioUnitario){
      items.push({nombre,cantidad,precioUnitario,subtotal:cantidad*precioUnitario});
    }
  });
  const totalManual=parseFloat($("compra-ed-total").value||0)||0;
  const totalCalc=items.reduce((s,it)=>s+(it.subtotal||0),0);
  const total=totalManual||totalCalc;
  const obj={
    proveedorId:proveedorId||null,
    proveedorNombre:proveedor?.nombre||"",
    fecha:$("compra-ed-fecha").value||null,
    items:items,
    total:total,
    formaPago:$("compra-ed-formaPago").value||"",
    nota:$("compra-ed-nota").value.trim(),
    estado:estado
  };
  showLoader("Guardando...");
  try{
    // Guardar primero (para tener id si es nueva) y después subir foto si aplica
    const compraId=await saveCompraToCloud(obj,{id:_compraEditorId});
    // Manejar comprobante
    if(_compraEdFotoB64){
      try{
        const r=await uploadFotoFromBase64(_compraEdFotoB64,"compra",compraId,"comprobantes-compras");
        await saveCompraToCloud({...obj,comprobante:{url:r.url,path:r.path}},{id:compraId});
      }catch(e){
        console.warn("Error subiendo comprobante:",e);
        toast("⚠️ Compra guardada pero foto falló","warn");
      }
    }else if(_compraEdFotoExisting){
      // Mantener comprobante anterior
      await saveCompraToCloud({...obj,comprobante:_compraEdFotoExisting},{id:compraId});
    }else if(_compraEditorId){
      // Edición sin foto y sin existing → asegurar que el campo quede null
      await saveCompraToCloud({...obj,comprobante:null},{id:compraId});
    }
    // v7.8 F3: si la compra se guardó como 'comprada' y trae pendientes vinculados, descargarlos.
    let descargados=0;
    if(estado==="comprada"&&_compraEdLinkedPendientes&&_compraEdLinkedPendientes.length){
      const ids=_compraEdLinkedPendientes.slice();
      for(const pid of ids){
        try{await deleteCompraFromCloud(pid);descargados++}
        catch(err){console.warn("No se pudo descargar pendiente "+pid,err)}
      }
      // Limpiar selección global
      ids.forEach(pid=>_comprasPendSelected.delete(pid));
    }
    hideLoader();
    let msg=estado==="comprada"?"✅ Compra registrada":"📋 Pendiente anotada";
    if(descargados>0)msg+=" · "+descargados+" pendiente"+(descargados===1?"":"s")+" descargado"+(descargados===1?"":"s");
    toast(msg,"success");
    closeCompraEditor();
    // Refrescar vistas si están activas (F3, F4, F5 — guardas defensivas)
    if(typeof renderComprasPendientes==="function"&&curMode==="compras-pendientes")renderComprasPendientes();
    if(typeof renderComprasHistorico==="function"&&curMode==="compras-historico")renderComprasHistorico();
    if(typeof renderComprasCatalogo==="function"&&curMode==="compras-catalogo")renderComprasCatalogo();
    if(typeof renderProveedoresDirectorio==="function"&&curMode==="proveedores-directorio")renderProveedoresDirectorio();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
    console.error(e);
  }
}

async function delCompraEditor(){
  if(!_compraEditorId)return;
  const c=comprasCache.find(x=>x.id===_compraEditorId);
  if(!c)return;
  if(!confirm("¿Eliminar esta compra? No se puede deshacer."))return;
  showLoader("Eliminando...");
  try{
    await deleteCompraFromCloud(_compraEditorId);
    hideLoader();
    toast("Compra eliminada","success");
    closeCompraEditor();
    if(typeof renderComprasPendientes==="function"&&curMode==="compras-pendientes")renderComprasPendientes();
    if(typeof renderComprasHistorico==="function"&&curMode==="compras-historico")renderComprasHistorico();
    if(typeof renderComprasCatalogo==="function"&&curMode==="compras-catalogo")renderComprasCatalogo();
    if(typeof renderProveedoresDirectorio==="function"&&curMode==="proveedores-directorio")renderProveedoresDirectorio();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

// ═══════════════════════════════════════════════════════════
// v7.8 F3: COMPRAS — Lista pendiente
// ═══════════════════════════════════════════════════════════
// Caso de uso real: anotar rápido lo que hay que comprar (en cocina, calle, almacén).
// Sin proveedor ni precio. Después al marcar como comprada se completa.

// Estado UI: IDs de pendientes seleccionados para conciliación
const _comprasPendSelected=new Set();

async function renderComprasPendientes(){
  const list=$("compras-pend-list");
  if(!list)return;
  if(!comprasCache.length&&cloudOnline){
    try{await loadComprasFromCloud()}catch{}
  }
  const items=comprasCache
    .filter(c=>c.estado==="pendiente")
    .sort((a,b)=>{
      // Sin fecha primero, luego fecha asc (las más urgentes/viejas arriba)
      const fa=a.fecha||"";const fb=b.fecha||"";
      if(!fa&&fb)return -1;
      if(fa&&!fb)return 1;
      return fa.localeCompare(fb);
    });
  // Limpiar selección de IDs que ya no existen
  Array.from(_comprasPendSelected).forEach(id=>{
    if(!items.find(c=>c.id===id))_comprasPendSelected.delete(id);
  });
  const sumEl=$("compras-pend-summary");
  if(sumEl){sumEl.textContent=items.length?items.length+" pendiente"+(items.length===1?"":"s"):""}
  if(!items.length){
    list.innerHTML='<div style="text-align:center;padding:30px 20px;color:#757575"><div style="font-size:36px;margin-bottom:8px">✅</div><div style="font-size:14px;font-weight:600;color:#5D4037">Lista vacía</div><div style="font-size:12px;margin-top:4px">¡Todo al día!</div></div>';
    return;
  }
  // Banner pendientes viejos (>7 días) con createdAtIso
  const seteHaceMs=7*24*60*60*1000;
  const ahora=Date.now();
  const viejos=items.filter(c=>{
    if(!c.createdAtIso)return false;
    const t=Date.parse(c.createdAtIso);
    return t&&(ahora-t)>seteHaceMs;
  });
  let html="";
  if(viejos.length){
    html+='<div style="background:#FFF3E0;border:1px solid #FFB74D;border-left:4px solid #FB8C00;border-radius:10px;padding:11px 13px;margin-bottom:10px;font-size:13px;color:#5D4037">';
    html+='<strong style="color:#E65100">⏰ '+viejos.length+' pendiente'+(viejos.length===1?'':'s')+' anotado'+(viejos.length===1?'':'s')+' hace más de una semana.</strong> ';
    html+='Si ya los compraste, marcalos y registrá la compra para descargarlos.';
    html+='</div>';
  }
  // Toolbar conciliación (sticky-ish)
  const seleccionados=_comprasPendSelected.size;
  html+='<div id="compras-pend-toolbar" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 4px;margin-bottom:8px;border-bottom:1px solid #EEE">';
  html+='<div style="font-size:12px;color:#5D4037">';
  if(seleccionados){
    html+='<strong>'+seleccionados+'</strong> seleccionado'+(seleccionados===1?'':'s')+' · <a href="javascript:void(0)" onclick="comprasPendClearSelection()" style="color:#1B5E20;text-decoration:underline">limpiar</a>';
  }else{
    html+='Marcá los que ya compraste para registrarlos juntos →';
  }
  html+='</div>';
  if(seleccionados){
    html+='<button onclick="comprasPendRegistrarSeleccionados()" style="background:#1B5E20;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12.5px;font-weight:700;cursor:pointer">📦 Registrar compra de '+seleccionados+'</button>';
  }
  html+='</div>';
  // Cards
  items.forEach(c=>{
    const prov=c.proveedorNombre||(c.proveedorId?"":'<span style="color:#9E9E9E;font-style:italic">Sin proveedor</span>');
    const itemsResumen=(c.items||[])
      .filter(it=>it.nombre)
      .map(it=>{
        const cant=it.cantidad?(it.cantidad+" × "):"";
        return cant+escapeHtml(it.nombre);
      })
      .join(", ")||'<span style="color:#9E9E9E">Sin detalle</span>';
    const checked=_comprasPendSelected.has(c.id)?"checked":"";
    const cardBg=_comprasPendSelected.has(c.id)?"#F1F8E9":"#fff";
    const cardBorder=_comprasPendSelected.has(c.id)?"#1B5E20":"#E0E0E0";
    html+='<div style="background:'+cardBg+';border:1px solid '+cardBorder+';border-left:4px solid #FFB300;border-radius:10px;padding:10px 12px;margin-bottom:7px">';
    html+='<div style="display:flex;align-items:flex-start;gap:10px">';
    // Checkbox
    html+='<label style="cursor:pointer;padding-top:2px"><input type="checkbox" '+checked+' onchange="comprasPendToggleSel(\''+c.id+'\')" style="width:18px;height:18px;cursor:pointer;accent-color:#1B5E20"></label>';
    // Body
    html+='<div style="flex:1;min-width:0;cursor:pointer" onclick="openCompraEditor(\''+c.id+'\')">';
    html+='<div style="font-size:13.5px;color:#1A1A1A;line-height:1.4">'+itemsResumen+'</div>';
    html+='<div style="font-size:11.5px;color:#5D4037;margin-top:3px">'+prov+(c.fecha?' · 📅 '+c.fecha:'')+'</div>';
    html+='</div>';
    // × cancelar / borrar
    html+='<button onclick="comprasPendDel(\''+c.id+'\',event)" title="Quitar de la lista" style="background:#fff;color:#C62828;border:1px solid #EF9A9A;padding:5px 9px;border-radius:6px;font-size:13px;cursor:pointer;align-self:flex-start">×</button>';
    html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
}

function comprasPendToggleSel(id){
  if(_comprasPendSelected.has(id))_comprasPendSelected.delete(id);
  else _comprasPendSelected.add(id);
  renderComprasPendientes();
}

function comprasPendClearSelection(){
  _comprasPendSelected.clear();
  renderComprasPendientes();
}

// Registrar compra de los pendientes seleccionados:
// abre modal compra precargado con items + IDs vinculados para borrar al guardar.
function comprasPendRegistrarSeleccionados(){
  if(!_comprasPendSelected.size)return;
  const seleccionados=comprasCache.filter(c=>_comprasPendSelected.has(c.id));
  // Aplanar items de todos los pendientes seleccionados
  const items=[];
  seleccionados.forEach(p=>{
    (p.items||[]).forEach(it=>{
      if(it.nombre){
        items.push({
          nombre:it.nombre,
          cantidad:it.cantidad||"",
          precioUnitario:""
        });
      }
    });
  });
  const linkedIds=Array.from(_comprasPendSelected);
  openCompraEditor(null,{
    estado:"comprada",
    items:items,
    linkedPendientes:linkedIds
  });
}

async function comprasPendQuickAdd(){
  const nombre=$("compras-pend-quick-nombre").value.trim();
  if(!nombre){toast("Escribí qué hay que comprar","warn");return}
  const cantRaw=$("compras-pend-quick-cant").value.trim();
  const cantidad=cantRaw?(parseFloat(cantRaw)||1):1;
  const obj={
    proveedorId:null,
    proveedorNombre:"",
    fecha:null,
    items:[{nombre:nombre,cantidad:cantidad,precioUnitario:0,subtotal:0}],
    total:0,
    formaPago:"",
    nota:"",
    estado:"pendiente",
    comprobante:null
  };
  try{
    await saveCompraToCloud(obj);
    $("compras-pend-quick-nombre").value="";
    $("compras-pend-quick-cant").value="";
    $("compras-pend-quick-nombre").focus();
    renderComprasPendientes();
  }catch(e){
    toast("Error: "+e.message,"error");
  }
}

async function comprasPendDel(id,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!confirm("¿Borrar este pendiente?"))return;
  try{
    await deleteCompraFromCloud(id);
    renderComprasPendientes();
  }catch(e){
    toast("Error: "+e.message,"error");
  }
}

// ═══════════════════════════════════════════════════════════
// v7.8 F4: COMPRAS — Histórico con filtros
// ═══════════════════════════════════════════════════════════

const COMPRA_PAGO_LABEL={efectivo:"💵 Efectivo",transferencia:"🏦 Transferencia",credito:"📅 Crédito",otro:"Otro"};

// ═══════════════════════════════════════════════════════════
// v7.8 F5: COMPRAS — Catálogo de precios + entrada manual
// ═══════════════════════════════════════════════════════════
// Unifica items de compras (estado='comprada') + preciosCatalogo en una vista
// agrupada por nombre normalizado. Resalta el proveedor más barato.

function _normProducto(s){return String(s||"").toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g,"")}

async function renderComprasCatalogo(){
  const list=$("compras-cat-list");
  if(!list)return;
  if(!comprasCache.length&&cloudOnline){try{await loadComprasFromCloud()}catch{}}
  if(!preciosCatalogoCache.length&&cloudOnline){try{await loadPreciosCatalogoFromCloud()}catch{}}
  const search=_normProducto($("compras-cat-search")?.value||"");
  // Agrupar por producto normalizado: { normKey: { display, entries: [{proveedorNombre, proveedorId, precio, fecha, fuente, refId}] } }
  const grupos=new Map();
  const addEntry=(producto,entry)=>{
    const key=_normProducto(producto);
    if(!key)return;
    if(!grupos.has(key))grupos.set(key,{display:producto,entries:[]});
    grupos.get(key).entries.push(entry);
  };
  comprasCache.filter(c=>c.estado==="comprada").forEach(c=>{
    (c.items||[]).forEach(it=>{
      if(!it.nombre||!it.precioUnitario)return;
      addEntry(it.nombre,{
        proveedorNombre:c.proveedorNombre||"(sin proveedor)",
        proveedorId:c.proveedorId||"",
        precio:Number(it.precioUnitario)||0,
        fecha:c.fecha||"",
        fuente:"compra",
        refId:c.id
      });
    });
  });
  preciosCatalogoCache.forEach(e=>{
    addEntry(e.productoOriginal||e.producto||"",{
      proveedorNombre:e.proveedorNombre||"(sin proveedor)",
      proveedorId:e.proveedorId||"",
      precio:Number(e.precio)||0,
      fecha:e.fecha||"",
      fuente:"lista",
      refId:e.id
    });
  });
  // Filtrar por búsqueda
  let grupoArr=Array.from(grupos.entries())
    .filter(([key])=>!search||key.includes(search))
    .map(([key,g])=>({key,display:g.display,entries:g.entries}))
    .sort((a,b)=>a.display.localeCompare(b.display));
  const sumEl=$("compras-cat-summary");
  if(sumEl){
    const totalEntries=grupos.size;
    sumEl.textContent=grupoArr.length===totalEntries
      ? totalEntries+" producto"+(totalEntries===1?"":"s")
      : grupoArr.length+" de "+totalEntries+" mostrados";
  }
  if(!grupoArr.length){
    list.innerHTML='<div style="text-align:center;padding:30px 20px;color:#757575"><div style="font-size:36px;margin-bottom:8px">📊</div><div style="font-size:14px;font-weight:600;color:#1A237E">Catálogo vacío</div><div style="font-size:12px;margin-top:4px">Registrá compras o agregá precios de lista para empezar a comparar.</div></div>';
    return;
  }
  let html="";
  grupoArr.forEach(g=>{
    // Más barato
    const minPrecio=g.entries.reduce((m,e)=>Math.min(m,e.precio),Infinity);
    const maxPrecio=g.entries.reduce((m,e)=>Math.max(m,e.precio),0);
    const variacion=minPrecio>0?Math.round((maxPrecio-minPrecio)/minPrecio*100):0;
    // Sort entries: más reciente primero por proveedor, mostrar mejor entry por proveedor
    // Para simplificar v7.8: mostrar todas, ordenar por precio asc
    const entriesOrdenadas=g.entries.slice().sort((a,b)=>a.precio-b.precio);
    html+='<details style="background:#fff;border:1px solid #E0E0E0;border-radius:10px;margin-bottom:8px;overflow:hidden">';
    html+='<summary style="padding:11px 13px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;list-style:none">';
    html+='<div style="flex:1;min-width:180px">';
    html+='<div style="font-size:13.5px;font-weight:700;color:#1A1A1A">'+escapeHtml(g.display)+'</div>';
    html+='<div style="font-size:11.5px;color:#757575;margin-top:2px">'+g.entries.length+' precio'+(g.entries.length===1?'':'s')+(variacion>0?' · variación '+variacion+'%':'')+'</div>';
    html+='</div>';
    html+='<div style="text-align:right;font-size:11px;color:#1B5E20">';
    html+='<div style="font-weight:700;font-size:13px">desde '+fm(minPrecio)+'</div>';
    if(maxPrecio>minPrecio)html+='<div style="color:#9E9E9E">hasta '+fm(maxPrecio)+'</div>';
    html+='</div>';
    html+='</summary>';
    html+='<div style="padding:0 13px 12px">';
    html+='<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
    html+='<thead><tr style="color:#9E9E9E;font-size:10px;text-transform:uppercase;letter-spacing:.04em"><th style="text-align:left;padding:6px 4px;border-bottom:1px solid #EEE">Proveedor</th><th style="text-align:right;padding:6px 4px;border-bottom:1px solid #EEE">Precio</th><th style="text-align:right;padding:6px 4px;border-bottom:1px solid #EEE">Fecha</th><th style="text-align:right;padding:6px 4px;border-bottom:1px solid #EEE">Fuente</th></tr></thead>';
    html+='<tbody>';
    entriesOrdenadas.forEach(e=>{
      const esMejor=e.precio===minPrecio&&minPrecio>0;
      const bg=esMejor?'background:#F1F8E9;':'';
      const star=esMejor?'⭐ ':'';
      const fuenteIcon=e.fuente==="compra"?'🛒 compra':'📋 lista';
      const fuenteAction=e.fuente==="compra"
        ? 'onclick="event.stopPropagation();openCompraEditor(\''+e.refId+'\')"'
        : 'onclick="event.stopPropagation();openPrecioListaModal(\''+e.refId+'\')"';
      html+='<tr style="'+bg+'cursor:pointer" '+fuenteAction+'>';
      html+='<td style="padding:7px 4px;border-bottom:1px solid #F5F5F5">'+star+escapeHtml(e.proveedorNombre)+'</td>';
      html+='<td style="padding:7px 4px;border-bottom:1px solid #F5F5F5;text-align:right;font-weight:'+(esMejor?'700':'500')+';color:'+(esMejor?'#1B5E20':'#1A1A1A')+'">'+fm(e.precio)+'</td>';
      html+='<td style="padding:7px 4px;border-bottom:1px solid #F5F5F5;text-align:right;color:#9E9E9E;font-size:11px">'+(e.fecha||"—")+'</td>';
      html+='<td style="padding:7px 4px;border-bottom:1px solid #F5F5F5;text-align:right;color:#9E9E9E;font-size:11px">'+fuenteIcon+'</td>';
      html+='</tr>';
    });
    html+='</tbody></table>';
    html+='</div>';
    html+='</details>';
  });
  list.innerHTML=html;
}

let _precioListaEditId=null;

function openPrecioListaModal(id){
  _precioListaEditId=id||null;
  const e=id?preciosCatalogoCache.find(x=>x.id===id):null;
  const isNew=!e;
  $("precio-lista-title").textContent=isNew?"+ Precio de lista":"Editar precio de lista";
  $("precio-lista-producto").value=e?.productoOriginal||e?.producto||"";
  $("precio-lista-precio").value=e?.precio||"";
  $("precio-lista-fecha").value=e?.fecha||(gbTodayIso?gbTodayIso():new Date().toISOString().slice(0,10));
  $("precio-lista-nota").value=e?.nota||"";
  // Poblar dropdown proveedores
  const sel=$("precio-lista-proveedorId");
  const opts=['<option value="">— Seleccionar proveedor —</option>'];
  proveedoresCache.filter(p=>!p.archivado).slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""))
    .forEach(p=>opts.push('<option value="'+p.id+'">'+escapeHtml(p.nombre||"")+'</option>'));
  sel.innerHTML=opts.join("");
  if(e?.proveedorId)sel.value=e.proveedorId;
  $("precio-lista-del-btn").style.display=isNew?"none":"inline-block";
  $("precio-lista-modal").classList.remove("hidden");
}

function closePrecioListaModal(){
  $("precio-lista-modal").classList.add("hidden");
  _precioListaEditId=null;
}

async function savePrecioLista(){
  const productoOriginal=$("precio-lista-producto").value.trim();
  const proveedorId=$("precio-lista-proveedorId").value;
  const precio=parseFloat($("precio-lista-precio").value||0)||0;
  if(!productoOriginal){toast("El producto es obligatorio","warn");return}
  if(!proveedorId){toast("Elegí el proveedor","warn");return}
  if(!precio){toast("El precio debe ser mayor a 0","warn");return}
  const proveedor=proveedoresCache.find(p=>p.id===proveedorId);
  const obj={
    producto:_normProducto(productoOriginal),
    productoOriginal:productoOriginal,
    proveedorId:proveedorId,
    proveedorNombre:proveedor?.nombre||"",
    precio:precio,
    fecha:$("precio-lista-fecha").value||"",
    nota:$("precio-lista-nota").value.trim()
  };
  showLoader("Guardando...");
  try{
    await savePrecioCatalogoToCloud(obj,{id:_precioListaEditId});
    hideLoader();
    toast("✅ Precio guardado","success");
    closePrecioListaModal();
    if(curMode==="compras-catalogo")renderComprasCatalogo();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

async function delPrecioLista(){
  if(!_precioListaEditId)return;
  if(!confirm("¿Eliminar este precio de lista?"))return;
  showLoader("Eliminando...");
  try{
    await deletePrecioCatalogoFromCloud(_precioListaEditId);
    hideLoader();
    toast("Eliminado","success");
    closePrecioListaModal();
    if(curMode==="compras-catalogo")renderComprasCatalogo();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

async function renderComprasHistorico(){
  const list=$("compras-hist-list");
  if(!list)return;
  if(!comprasCache.length&&cloudOnline){try{await loadComprasFromCloud()}catch{}}
  // Refrescar dropdown de proveedores en filtro
  const provSel=$("compras-hist-prov");
  if(provSel&&!provSel.dataset.populated){
    const cur=provSel.value;
    const opts=['<option value="">Todos los proveedores</option>'];
    proveedoresCache.slice().sort((a,b)=>(a.nombre||"").localeCompare(b.nombre||""))
      .forEach(p=>opts.push('<option value="'+p.id+'">'+escapeHtml(p.nombre||"")+'</option>'));
    provSel.innerHTML=opts.join("");
    provSel.value=cur;
    provSel.dataset.populated="1";
  }
  const from=$("compras-hist-from")?.value||"";
  const to=$("compras-hist-to")?.value||"";
  const filterProv=$("compras-hist-prov")?.value||"";
  const filterPago=$("compras-hist-pago")?.value||"";
  const items=comprasCache
    .filter(c=>c.estado==="comprada")
    .filter(c=>{
      if(from&&(!c.fecha||c.fecha<from))return false;
      if(to&&(!c.fecha||c.fecha>to))return false;
      if(filterProv&&c.proveedorId!==filterProv)return false;
      if(filterPago&&c.formaPago!==filterPago)return false;
      return true;
    })
    .sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const totalPeriodo=items.reduce((s,c)=>s+(Number(c.total)||0),0);
  const sumEl=$("compras-hist-summary");
  if(sumEl){sumEl.textContent=items.length+" compra"+(items.length===1?"":"s")+" · "+fm(totalPeriodo)}
  if(!items.length){
    list.innerHTML='<div style="text-align:center;padding:30px 20px;color:#757575;font-size:13px">No hay compras que coincidan con los filtros.</div>';
    return;
  }
  let html="";
  items.forEach(c=>{
    const itemsResumen=(c.items||[])
      .filter(it=>it.nombre)
      .slice(0,3)
      .map(it=>escapeHtml(it.nombre))
      .join(", ");
    const masItems=(c.items||[]).filter(it=>it.nombre).length>3?" +"+((c.items||[]).filter(it=>it.nombre).length-3)+" más":"";
    const pago=c.formaPago?(COMPRA_PAGO_LABEL[c.formaPago]||c.formaPago):"";
    html+='<div onclick="openCompraEditor(\''+c.id+'\')" style="background:#fff;border:1px solid #E0E0E0;border-left:4px solid #1B5E20;border-radius:10px;padding:11px 13px;margin-bottom:8px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.08)\'" onmouseout="this.style.boxShadow=\'none\'">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">';
    html+='<div style="flex:1;min-width:200px">';
    html+='<div style="font-size:13.5px;font-weight:700;color:#1A1A1A">'+escapeHtml(c.proveedorNombre||"(sin proveedor)")+'</div>';
    html+='<div style="font-size:12px;color:#5D4037;margin-top:3px">'+(itemsResumen||'<span style="color:#9E9E9E">Sin detalle</span>')+masItems+'</div>';
    html+='<div style="font-size:11px;color:#9E9E9E;margin-top:3px">'+(c.fecha||"sin fecha")+(pago?' · '+pago:'')+(c.comprobante?.url?' · 📷':'')+'</div>';
    html+='</div>';
    html+='<div style="text-align:right;font-size:14px;font-weight:700;color:#1B5E20">'+fm(c.total||0)+'</div>';
    html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════
// v7.7.2: FICHA DEL CLIENTE — vista detalle full
// ═══════════════════════════════════════════════════════════
// Pantalla nueva (mode 'clientes-ficha') que muestra todo el detalle
// del cliente: header con identidad, estadísticas, notas privadas,
// historial cronológico filtrable, seguimientos consolidados.

let _currentClienteFichaId=null;
let _fichaHistFiltro="todos"; // todos | cotizacion | pedido | entrega | pago | comentario

function abrirFichaCliente(clienteId){
  _currentClienteFichaId=clienteId;
  _fichaHistFiltro="todos";
  setMode("clientes-ficha");
}

// Devuelve todos los docs del cliente (case-insensitive por nombre)
function getDocsByCliente(clienteName){
  const k=(clienteName||"").toLowerCase().trim();
  if(!k)return [];
  return quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(q.status==="superseded")return false;
    return (q.client||"").toLowerCase().trim()===k;
  });
}

// Calcula estadísticas agregadas del cliente
function getStatsCliente(docs){
  const stats={
    cotizado:0,
    vendido:0,
    entregado:0,
    cobrado:0,
    nDocs:docs.length,
    ticketProm:0,
    primerContacto:"",
    ultimoContacto:""
  };
  const statusVendido=["pedido","aprobada","en_produccion","entregado"];
  const statusEntregado=["entregado"];
  let sumVendido=0,countVendido=0;
  docs.forEach(q=>{
    const total=getDocTotal(q);
    stats.cotizado+=total;
    const s=q.status||"";
    if(statusVendido.includes(s)){stats.vendido+=total;sumVendido+=total;countVendido++}
    if(statusEntregado.includes(s))stats.entregado+=total;
    stats.cobrado+=(typeof totalCobrado==="function"?totalCobrado(q):0);
    const iso=q.dateISO||q.eventDate||"";
    if(iso){
      if(!stats.primerContacto||iso<stats.primerContacto)stats.primerContacto=iso;
      if(!stats.ultimoContacto||iso>stats.ultimoContacto)stats.ultimoContacto=iso;
    }
  });
  stats.ticketProm=countVendido?Math.round(sumVendido/countVendido):0;
  return stats;
}

// v7.9.6 F2: detecta sobrepagos NO aplicados (gap UX). Pago confirmado > total del doc
// en docs con status vendido = excedente que el cliente debe ver reflejado.
// Cálculo por doc (no agregado a nivel cliente) para no marcar como sobrepago lo que
// en realidad es anticipo de otra cotización.
function getSobrepagosCliente(docs){
  const statusFacturable=["pedido","aprobada","en_produccion","entregado"];
  const detalle=[];
  let total=0;
  (docs||[]).forEach(q=>{
    const s=q.status||"";
    if(!statusFacturable.includes(s))return;
    const dt=getDocTotal(q);
    const cob=typeof totalCobrado==="function"?totalCobrado(q):0;
    const ajustes=typeof totalAjustes==="function"?totalAjustes(q):0;
    // saldo "real" del doc = total - ajustes ya aplicados al saldo (perdón/descuento)
    const facturable=Math.max(0,dt-ajustes);
    const sobrepago=cob-facturable;
    if(sobrepago>=100){ // ignoramos centavos/redondeos < $100
      detalle.push({q,total:dt,cobrado:cob,sobrepago});
      total+=sobrepago;
    }
  });
  return {total,detalle};
}

// Construye lista cronológica de entries (cotización + pedido + entrega + pagos + comentario por doc)
function buildHistorialEntries(docs){
  const out=[];
  docs.forEach(q=>{
    const cli=q.client||"";
    const total=getDocTotal(q);
    // Cotización (siempre que haya dateISO)
    if(q.dateISO){
      out.push({
        tipo:"cotizacion",
        fecha:q.dateISO,
        descripcion:(q.kind==="proposal"?"Propuesta":"Cotización")+" "+(q.quoteNumber||q.id),
        monto:total,
        status:q.status,
        q:q
      });
    }
    // Pedido (si aprobada en algún momento)
    const fAprob=q.approvalData?.fechaAprobacion||q.orderData?.fechaAprobacion;
    const sAprob=q.status;
    if(fAprob&&["pedido","aprobada","en_produccion","entregado"].includes(sAprob)){
      out.push({
        tipo:"pedido",
        fecha:fAprob,
        descripcion:"Aprobado como pedido",
        monto:total,
        status:sAprob,
        q:q
      });
    }
    // Entrega
    if(q.status==="entregado"){
      const fEnt=q.entregaData?.fecha||q.fechaEntrega||q.eventDate;
      if(fEnt){
        out.push({
          tipo:"entrega",
          fecha:fEnt,
          descripcion:"Entrega cumplida",
          monto:total,
          status:"entregado",
          q:q
        });
      }
    }
    // Pagos
    const pagos=typeof getPagos==="function"?getPagos(q):(q.pagos||[]);
    pagos.forEach(p=>{
      if(!p.fecha)return;
      const esDevol=p.tipo==="devolucion"||(p.monto||0)<0;
      out.push({
        tipo:"pago",
        fecha:p.fecha,
        descripcion:(esDevol?"Devolución · ":"Pago "+(p.tipo||"")+" · ")+(p.metodo||"Sin método"),
        monto:p.monto,
        esDevolucion:esDevol,
        q:q
      });
    });
    // Comentario post-entrega (1 por doc)
    if(q.comentarioCliente&&(q.comentarioCliente.texto||q.comentarioCliente.fotoUrl||q.comentarioCliente.fotoBase64)){
      out.push({
        tipo:"comentario",
        fecha:q.comentarioCliente.fecha||q.entregaData?.fecha||q.eventDate||q.dateISO,
        descripcion:q.comentarioCliente.texto||"📷 Foto comentario",
        monto:0,
        q:q
      });
    }
  });
  // Sort cronológico desc
  out.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  return out;
}

// ═══════════════════════════════════════════════════════════
// v7.7.3: COMENTARIOS DE CLIENTES — vista dedicada
// ═══════════════════════════════════════════════════════════
// Migrado del Dashboard. Lista TODOS los comentarios post-entrega
// con buscador (cliente o texto). Click → abre modal del comentario
// para editarlo (reusa openComentModal existente).

async function renderClientesComentarios(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const term=($("cli-com-search").value||"").toLowerCase().trim();
  const all=quotesCache.filter(q=>{
    if(q._wrongCollection)return false;
    if(q.status==="superseded"||q.status==="anulada")return false;
    const c=q.comentarioCliente;
    return c&&(c.texto||c.fotoUrl||c.fotoBase64);
  }).map(q=>({q,c:q.comentarioCliente}));
  all.sort((a,b)=>(b.c.fecha||"").localeCompare(a.c.fecha||""));
  const filtered=term
    ? all.filter(({q,c})=>((q.client||"").toLowerCase().includes(term)||(c.texto||"").toLowerCase().includes(term)))
    : all;
  $("cli-com-summary").textContent=filtered.length+" comentario"+(filtered.length!==1?"s":"")+(term?" (filtrado de "+all.length+")":"");
  const el=$("cli-com-list");
  if(!filtered.length){
    el.innerHTML='<div style="text-align:center;padding:40px 20px;color:#9E9E9E;font-style:italic">'+
      (term?'🔍 Sin resultados para "'+h(term)+'"':'💬 Aún no hay comentarios registrados. Cuando entregues un pedido, podés registrar qué dijo el cliente.')+
      '</div>';
    return;
  }
  el.innerHTML=filtered.map(({q,c})=>{
    const fotoIcon=(c.fotoUrl||c.fotoBase64)?' 📷':'';
    const txt=h(c.texto||"(solo foto)");
    const docNum=q.quoteNumber||q.id;
    const tipoLbl=q.kind==="proposal"?"Propuesta":"Cotización";
    const fStr=c.fecha?_cliDirFmtDate(c.fecha):"sin fecha";
    return '<div onclick="openComentModal(\''+q.id+'\',\''+q.kind+'\')" style="background:#fff;border:1px solid #E0E0E0;border-left:3px solid #6A1B9A;border-radius:8px;padding:11px 13px;margin-bottom:8px;cursor:pointer">'+
      '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:5px">'+
        '<div style="font-weight:700;font-size:13px;color:#1A1A1A">'+h(q.client||"—")+fotoIcon+'</div>'+
        '<div style="font-size:11px;color:#9E9E9E">'+fStr+' · '+tipoLbl+' '+h(docNum)+'</div>'+
      '</div>'+
      '<div style="font-size:12.5px;color:#1A1A1A;font-style:italic;line-height:1.45">"'+txt+'"</div>'+
    '</div>';
  }).join("");
}

async function renderClienteFicha(){
  if(!_currentClienteFichaId){
    $("cli-ficha-content").innerHTML='<div style="padding:40px;text-align:center;color:#9E9E9E">Cliente no seleccionado.</div>';
    return;
  }
  if(!clientsCache.length){try{await loadClientsFromCloud()}catch{}}
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  const c=clientsCache.find(x=>x.id===_currentClienteFichaId);
  if(!c){
    $("cli-ficha-content").innerHTML='<div style="padding:40px;text-align:center;color:#C62828">Cliente no encontrado en el directorio.</div>';
    return;
  }
  const docs=getDocsByCliente(c.name);
  const stats=getStatsCliente(docs);
  const entries=buildHistorialEntries(docs);
  // v7.9.6 F2: combinar saldo a favor formal (nota crédito) + sobrepago virtual
  const sobreCli=typeof getSobrepagosCliente==="function"?getSobrepagosCliente(docs):{total:0,detalle:[]};
  const saldoFavTotal=(Number(c.saldoAFavor)||0)+sobreCli.total;

  // Header
  const tipoIco=c.tipo==="empresa"?"🏢":"👤";
  const cat=c.categoria||"particular";
  const catCls={corporativo:"#01579B",particular:"#5D4037",recurrente:"#1B5E20"}[cat]||"#5D4037";
  const catBg={corporativo:"#E1F5FE",particular:"#EFEBE9",recurrente:"#E8F5E9"}[cat]||"#EFEBE9";
  const idStr=c.idtype&&c.idnum?c.idtype+" "+c.idnum+(c.nitDV?"-"+c.nitDV:""):"";
  const contacto=[c.tel,c.mail,c.city].filter(Boolean).join(" · ");

  let html='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #E0E0E0">'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'+
      '<button onclick="setMode(\'clientes-directorio\')" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;font-family:var(--gb-font-body)">← Volver al directorio</button>'+
    '</div>'+
    '<button onclick="openClienteEditor(\''+c.id+'\')" style="background:#1B5E20;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--gb-font-body)">✏️ Editar</button>'+
  '</div>';

  html+='<div style="margin-bottom:18px">'+
    '<div style="font-size:22px;font-weight:800;color:#1A1A1A;margin-bottom:3px">'+tipoIco+' '+h(c.name||"—")+
    (c.razonSocial?'<span style="font-weight:400;color:#757575;font-size:14px;margin-left:8px">('+h(c.razonSocial)+')</span>':'')+
    '</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'+
      (idStr?'<span style="font-size:12px;color:#5D4037">'+h(idStr)+'</span>':'')+
      '<span style="background:'+catBg+';color:'+catCls+';font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:10px;text-transform:uppercase;letter-spacing:.3px">'+cat+'</span>'+
      // v7.9.6 F2: chip saldo a favor en cabecera (visible siempre que haya excedente o nota crédito)
      (saldoFavTotal>0?'<span title="Saldo a favor del cliente (notas crédito + sobrepagos)" style="background:#E8F5E9;color:#1B5E20;font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:10px;border:1px solid #66BB6A">💰 Saldo a favor '+fm(saldoFavTotal)+'</span>':'')+
    '</div>'+
    (contacto?'<div style="font-size:12.5px;color:#607D8B">'+h(contacto)+'</div>':'')+
    (c.att?'<div style="font-size:11.5px;color:#9E9E9E;margin-top:2px">Atención: '+h(c.att)+'</div>':'')+
  '</div>';

  // Stats cards
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px">'+
    _statCard("Cotizado",fm(stats.cotizado),"#5D4037","#EFEBE9")+
    _statCard("Vendido",fm(stats.vendido),"#1B5E20","#E8F5E9")+
    _statCard("Entregado",fm(stats.entregado),"#01579B","#E1F5FE")+
    _statCard("Cobrado",fm(stats.cobrado),"#33691E","#DCEDC8")+
    _statCard("# docs",stats.nDocs,"#5D4037","#FFF8E1")+
    _statCard("Ticket prom",fm(stats.ticketProm),"#5D4037","#F3E5F5")+
  '</div>';
  if(stats.primerContacto||stats.ultimoContacto){
    html+='<div style="font-size:11.5px;color:#9E9E9E;margin-bottom:18px">'+
      (stats.primerContacto?"Primer contacto: "+_cliDirFmtDate(stats.primerContacto):"")+
      (stats.primerContacto&&stats.ultimoContacto?" · ":"")+
      (stats.ultimoContacto?"Último contacto: "+_cliDirFmtDate(stats.ultimoContacto):"")+
    '</div>';
  }

  // Notas privadas (si hay)
  if((c.notas||"").trim()){
    html+='<div style="background:#FFF8E1;border:1px solid #FFCA28;border-left:4px solid #FB8C00;border-radius:10px;padding:11px 14px;margin-bottom:18px;font-size:13px;color:#5D4037;white-space:pre-wrap;line-height:1.5">'+
      '<div style="font-weight:700;color:#E65100;margin-bottom:4px;font-size:12px">🔒 Notas privadas</div>'+
      h(c.notas)+
    '</div>';
  }

  // v7.8.3: Sección "Ajustes y descuentos" + saldo a favor
  html+=_renderClienteAjustesSection(c);

  // Historial — chips de filtro + lista
  html+='<div style="margin-bottom:18px">'+
    '<div style="font-weight:700;font-size:14px;color:#1A1A1A;margin-bottom:8px">📜 Historial</div>'+
    '<div id="cli-ficha-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+_chipsHistorial()+'</div>'+
    '<div id="cli-ficha-historial">'+_renderHistorialList(entries)+'</div>'+
  '</div>';

  // Seguimientos consolidados
  html+='<div style="margin-bottom:14px">'+
    '<div style="font-weight:700;font-size:14px;color:#1A1A1A;margin-bottom:8px">🟢 Seguimientos abiertos</div>'+
    '<div id="cli-ficha-seguimientos">'+_renderSeguimientosCliente(docs)+'</div>'+
  '</div>';

  $("cli-ficha-content").innerHTML=html;
}

function _statCard(label,value,color,bg){
  return '<div style="background:'+bg+';border-radius:10px;padding:10px 12px;text-align:center">'+
    '<div style="font-size:10px;text-transform:uppercase;color:#9E9E9E;font-weight:700;letter-spacing:.3px;margin-bottom:3px">'+label+'</div>'+
    '<div style="font-size:18px;font-weight:800;color:'+color+';font-variant-numeric:tabular-nums">'+value+'</div>'+
  '</div>';
}

function _chipsHistorial(){
  const tipos=[
    {k:"todos",lbl:"Todos",ic:"📋"},
    {k:"cotizacion",lbl:"Cotizaciones",ic:"📄"},
    {k:"pedido",lbl:"Pedidos",ic:"🤝"},
    {k:"entrega",lbl:"Entregas",ic:"🚚"},
    {k:"pago",lbl:"Pagos",ic:"💰"},
    {k:"comentario",lbl:"Comentarios",ic:"💬"}
  ];
  return tipos.map(t=>{
    const act=_fichaHistFiltro===t.k;
    const bg=act?"#1B5E20":"#fff";
    const col=act?"#fff":"#5D4037";
    const bd=act?"#1B5E20":"#BDBDBD";
    return '<button onclick="cliFichaSetFiltro(\''+t.k+'\')" style="background:'+bg+';color:'+col+';border:1px solid '+bd+';padding:5px 11px;border-radius:14px;font-size:11.5px;font-weight:'+(act?"700":"500")+';cursor:pointer;font-family:var(--gb-font-body)">'+t.ic+' '+t.lbl+'</button>';
  }).join("");
}

function cliFichaSetFiltro(k){
  _fichaHistFiltro=k;
  // Re-render solo chips y lista
  const c=clientsCache.find(x=>x.id===_currentClienteFichaId);
  if(!c)return;
  const docs=getDocsByCliente(c.name);
  const entries=buildHistorialEntries(docs);
  $("cli-ficha-chips").innerHTML=_chipsHistorial();
  $("cli-ficha-historial").innerHTML=_renderHistorialList(entries);
}

function _renderHistorialList(entries){
  const filtered=_fichaHistFiltro==="todos"?entries:entries.filter(e=>e.tipo===_fichaHistFiltro);
  if(!filtered.length){
    return '<div style="padding:24px;text-align:center;color:#9E9E9E;font-style:italic;background:#FAFAFA;border-radius:8px">📭 Sin '+(_fichaHistFiltro==="todos"?"actividad":_fichaHistFiltro+"s")+' para este cliente.</div>';
  }
  const limit=100;
  const visible=filtered.slice(0,limit);
  const ico={cotizacion:"📄",pedido:"🤝",entrega:"🚚",pago:"💰",comentario:"💬"};
  const colorTipo={cotizacion:"#5D4037",pedido:"#01579B",entrega:"#1B5E20",pago:"#33691E",comentario:"#6A1B9A"};
  let html=visible.map(e=>{
    const c=colorTipo[e.tipo]||"#5D4037";
    const fStr=_cliDirFmtDate(e.fecha);
    const montoStr=e.monto?(e.esDevolucion?'<span style="color:#C62828;font-weight:700">'+fm(Math.abs(e.monto))+'</span>':'<span style="color:'+c+';font-weight:700">'+fm(e.monto)+'</span>'):'';
    const desc=h(e.descripcion||"").slice(0,120);
    return '<div onclick="openDocument(\''+e.q.kind+'\',\''+e.q.id+'\')" style="background:#fff;border:1px solid #E0E0E0;border-left:3px solid '+c+';border-radius:8px;padding:9px 12px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12.5px;color:#1A1A1A">'+ico[e.tipo]+' '+desc+'</div>'+
        '<div style="font-size:10.5px;color:#9E9E9E;margin-top:1px">'+fStr+' · '+(e.q.quoteNumber||e.q.id)+'</div>'+
      '</div>'+
      (montoStr?'<div style="font-size:13px;font-variant-numeric:tabular-nums">'+montoStr+'</div>':'')+
    '</div>';
  }).join("");
  if(filtered.length>limit){
    html+='<div style="text-align:center;padding:8px;font-size:11px;color:#9E9E9E">Mostrando '+limit+' de '+filtered.length+' entries.</div>';
  }
  return html;
}

function _renderSeguimientosCliente(docs){
  // Filtra docs con followUp activo (no perdida, no convertida)
  const abiertos=docs.filter(q=>{
    const s=q.status||"";
    if(["entregado","anulada","superseded"].includes(s))return false;
    const fu=typeof getFollowUp==="function"?getFollowUp(q):"";
    return fu&&fu!=="perdida";
  });
  if(!abiertos.length){
    return '<div style="padding:14px;text-align:center;color:#9E9E9E;font-size:12.5px;background:#F1F8E9;border-radius:8px">✓ No hay cotizaciones abiertas con seguimiento activo.</div>';
  }
  return abiertos.map(q=>{
    const fu=getFollowUp(q);
    const fuMeta={pendiente:{lbl:"Sin contactar",col:"#FB8C00",bg:"#FFF3E0"},contactado:{lbl:"Contactado",col:"#01579B",bg:"#E1F5FE"},activa:{lbl:"En negociación",col:"#1B5E20",bg:"#E8F5E9"}}[fu]||{lbl:fu,col:"#5D4037",bg:"#EFEBE9"};
    const total=getDocTotal(q);
    return '<div onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')" style="background:#fff;border:1px solid #E0E0E0;border-left:3px solid '+fuMeta.col+';border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12.5px;color:#1A1A1A;font-weight:700">'+(q.kind==="proposal"?"Propuesta":"Cotización")+' '+(q.quoteNumber||q.id)+'</div>'+
        '<div style="font-size:10.5px;color:#9E9E9E;margin-top:2px">'+_cliDirFmtDate(q.dateISO||"")+'</div>'+
      '</div>'+
      '<span style="background:'+fuMeta.bg+';color:'+fuMeta.col+';font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:10px">'+fuMeta.lbl+'</span>'+
      '<div style="font-size:13px;font-weight:700;color:#5D4037;font-variant-numeric:tabular-nums">'+fm(total)+'</div>'+
    '</div>';
  }).join("");
}

// v7.8.3: helper para sección ajustes + saldo a favor en ficha cliente
// v7.9.6 F2: agregado detección de sobrepagos virtuales (gap UX caso Gloria GB-2026-0150)
function _renderClienteAjustesSection(c){
  if(!c||!c.name)return "";
  const k=(c.name||"").toLowerCase().trim();
  const ajustes=(typeof ajustesLogCache!=="undefined"?ajustesLogCache:[])
    .filter(a=>!a.deletedAt&&(a.clienteName||"").toLowerCase().trim()===k);
  const saldoFav=Number(c.saldoAFavor)||0;
  const docs=typeof getDocsByCliente==="function"?getDocsByCliente(c.name):[];
  const sobre=typeof getSobrepagosCliente==="function"?getSobrepagosCliente(docs):{total:0,detalle:[]};
  if(!ajustes.length&&saldoFav<=0&&sobre.total<=0)return "";
  // Acumulados por tipo
  const totByTipo=new Map();
  let totalAjustes=0;
  ajustes.forEach(a=>{
    const m=parseFloat(a.monto)||0;
    totByTipo.set(a.tipo,(totByTipo.get(a.tipo)||0)+m);
    totalAjustes+=m;
  });
  let html='<div style="margin-bottom:18px"><div style="font-weight:700;font-size:14px;color:#1A1A1A;margin-bottom:8px">⚖️ Ajustes y descuentos</div>';
  // Cards de resumen
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
  if(saldoFav>0){
    html+='<div style="flex:1;min-width:160px;background:#E8F5E9;border:1px solid #66BB6A;border-radius:10px;padding:10px 12px"><div style="font-size:10.5px;color:#1B5E20;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Saldo a favor</div><div style="font-size:18px;font-weight:800;color:#1B5E20">'+fm(saldoFav)+'</div><div style="font-size:10.5px;color:#1B5E20;margin-top:2px">Aplicable a próximos cobros</div></div>';
  }
  if(totalAjustes>0){
    html+='<div style="flex:1;min-width:160px;background:#FFF3E0;border:1px solid #FB8C00;border-radius:10px;padding:10px 12px"><div style="font-size:10.5px;color:#E65100;font-weight:700;text-transform:uppercase;letter-spacing:.04em">Ajustes acumulados</div><div style="font-size:18px;font-weight:800;color:#E65100">'+fm(totalAjustes)+'</div><div style="font-size:10.5px;color:#E65100;margin-top:2px">'+ajustes.length+' operación'+(ajustes.length===1?"":"es")+'</div></div>';
  }
  // v7.9.6 F2: card de sobrepago virtual (no es nota crédito formal — es excedente detectado)
  if(sobre.total>0){
    html+='<div style="flex:1;min-width:200px;background:#FFFDE7;border:1px solid #F9A825;border-radius:10px;padding:10px 12px">'+
      '<div style="font-size:10.5px;color:#F57F17;font-weight:700;text-transform:uppercase;letter-spacing:.04em">⚠ Sobrepago detectado</div>'+
      '<div style="font-size:18px;font-weight:800;color:#F57F17">'+fm(sobre.total)+'</div>'+
      '<div style="font-size:10.5px;color:#F57F17;margin-top:2px">'+sobre.detalle.length+' doc'+(sobre.detalle.length===1?"":"s")+' con pago &gt; total. Revisar y convertir en nota crédito si corresponde.</div>'+
    '</div>';
  }
  html+='</div>';
  // v7.9.6 F2: detalle de sobrepagos (qué doc, cuánto)
  if(sobre.total>0){
    html+='<div style="background:#FFFDE7;border:1px solid #F9A825;border-radius:10px;padding:8px 12px;margin-bottom:10px">'+
      '<div style="font-size:12px;font-weight:700;color:#F57F17;margin-bottom:6px">Documentos con sobrepago</div>';
    sobre.detalle.forEach(d=>{
      const q=d.q;
      const num=q.quoteNumber||q.id;
      html+='<div onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')" style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #FFF59D;cursor:pointer;font-size:12px">'+
        '<div><strong>'+h(num)+'</strong> <span style="color:#9E9E9E;font-size:10.5px">'+(q.status||"")+'</span></div>'+
        '<div style="font-size:11px;color:#5D4037;font-variant-numeric:tabular-nums">Total '+fm(d.total)+' · Cobrado '+fm(d.cobrado)+'</div>'+
        '<div style="font-weight:700;color:#F57F17;font-variant-numeric:tabular-nums">+'+fm(d.sobrepago)+'</div>'+
      '</div>';
    });
    html+='</div>';
  }
  // Lista de ajustes (últimos 5)
  if(ajustes.length){
    const sorted=ajustes.slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).slice(0,5);
    html+='<div style="background:#fff;border:1px solid #E0E0E0;border-radius:10px;padding:6px">';
    sorted.forEach(a=>{
      const tipoLabel=AJUSTE_TIPO_LABEL[a.tipo]||a.tipo;
      const motLabel=AJUSTE_MOTIVO_LABEL[a.tipoMotivo]||"";
      html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:7px 10px;border-bottom:1px solid #F5F5F5;font-size:12.5px">';
      html+='<div style="flex:1;min-width:0">';
      html+='<div><strong>'+tipoLabel+'</strong>'+(motLabel?' · '+h(motLabel):'')+'</div>';
      if(a.motivo)html+='<div style="font-size:11px;color:#757575;font-style:italic;margin-top:2px">"'+h(a.motivo)+'"</div>';
      html+='<div style="font-size:10.5px;color:#9E9E9E;margin-top:2px">'+(a.fecha||"")+(a.docId?' · '+h(a.docId):'')+'</div>';
      html+='</div>';
      html+='<div style="font-weight:700;color:'+(a.tipo==="nota_credito"?"#1B5E20":"#E65100")+'">'+fm(a.monto||0)+'</div>';
      html+='</div>';
    });
    html+='</div>';
    if(ajustes.length>5){
      html+='<div style="font-size:11px;color:#9E9E9E;margin-top:4px">+ '+(ajustes.length-5)+' más en <a href="javascript:void(0)" onclick="setMode(\'cartera-ajustes-log\')" style="color:#0D47A1;text-decoration:underline">Log completo</a></div>';
    }
  }
  // Alerta de recurrencia
  if(totalAjustes>0&&typeof getStatsCliente==="function"){
    const docs=getDocsByCliente(c.name);
    const stats=getStatsCliente(docs);
    if(stats.cotizado>0){
      const pct=(totalAjustes/stats.cotizado)*100;
      if(pct>5){
        html+='<div style="background:#FFEBEE;border:1px solid #EF9A9A;border-radius:8px;padding:8px 11px;margin-top:8px;font-size:11.5px;color:#B71C1C"><strong>⚠️ Alerta recurrencia:</strong> los ajustes representan el '+pct.toFixed(1)+'% del total cotizado al cliente.</div>';
      }
    }
  }
  html+='</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
// v7.8.3: LOG DE AJUSTES (cartera/ajustes-log)
// ═══════════════════════════════════════════════════════════
const AJUSTE_TIPO_LABEL={
  ajuste_saldo:"📉 Perdón/descuento",
  nota_credito:"📈 Nota crédito",
  descuento_cotizacion:"🏷️ Descuento cotización",
  correccion:"🔧 Corrección"
};
const AJUSTE_MOTIVO_LABEL={
  consigno_menos:"Consignó menos",
  perdon_cliente_bueno:"Perdón cliente bueno",
  error_cobro:"Error de cobro",
  redondeo:"Redondeo",
  acuerdo_comercial:"Acuerdo comercial",
  otro:"Otro"
};

async function renderCarteraAjustesLog(){
  const list=$("ajustes-log-list");
  const stats=$("ajustes-log-stats");
  const sumEl=$("ajustes-log-summary");
  if(!list)return;
  if(!ajustesLogCache.length&&cloudOnline){try{await loadAjustesLogFromCloud()}catch{}}
  const search=($("ajl-search")?.value||"").toLowerCase().trim();
  const from=$("ajl-from")?.value||"";
  const to=$("ajl-to")?.value||"";
  const filterTipo=$("ajl-tipo")?.value||"";
  const items=ajustesLogCache.filter(a=>{
    if(a.deletedAt)return false;
    if(filterTipo&&a.tipo!==filterTipo)return false;
    const f=a.fecha||"";
    if(from&&f<from)return false;
    if(to&&f>to)return false;
    if(search){
      const hay=[a.clienteName,a.motivo,a.tipoMotivo].map(x=>(x||"").toLowerCase()).join(" ");
      if(!hay.includes(search))return false;
    }
    return true;
  }).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  // Stats
  const totalMonto=items.reduce((s,a)=>s+(parseFloat(a.monto)||0),0);
  if(sumEl)sumEl.textContent=items.length+" ajuste"+(items.length===1?"":"s")+" · "+fm(totalMonto);
  if(stats){
    if(items.length){
      // Top 5 clientes con más descuentos en el filtro actual
      const porCliente=new Map();
      items.forEach(a=>{
        const k=a.clienteName||"(sin)";
        porCliente.set(k,(porCliente.get(k)||0)+(parseFloat(a.monto)||0));
      });
      const top=Array.from(porCliente.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
      let html='<div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:10px;padding:10px 14px">';
      html+='<div style="font-size:12px;font-weight:700;color:#E65100;margin-bottom:6px">⚠️ Top clientes con más ajustes acumulados (en el filtro actual)</div>';
      html+='<div style="display:flex;gap:6px;flex-wrap:wrap">';
      top.forEach(([cli,monto])=>{
        html+='<div style="background:#fff;border:1px solid #FFB74D;border-radius:6px;padding:5px 10px;font-size:11.5px"><strong>'+escapeHtml(cli)+'</strong> · <span style="color:#C62828;font-weight:700">'+fm(monto)+'</span></div>';
      });
      html+='</div></div>';
      stats.innerHTML=html;
    }else{
      stats.innerHTML='';
    }
  }
  if(!items.length){
    list.innerHTML='<div style="text-align:center;padding:30px 20px;color:#757575"><div style="font-size:36px;margin-bottom:8px">⚖️</div><div style="font-size:14px;font-weight:600;color:#5D4037">Sin ajustes en el filtro</div><div style="font-size:12px;margin-top:4px">Cuando perdones un saldo o registres una nota crédito, aparece acá.</div></div>';
    return;
  }
  let html="";
  items.forEach(a=>{
    const tipoLabel=AJUSTE_TIPO_LABEL[a.tipo]||a.tipo;
    const motLabel=AJUSTE_MOTIVO_LABEL[a.tipoMotivo]||a.tipoMotivo||"";
    const borderColor=a.tipo==="nota_credito"?"#1B5E20":"#E65100";
    html+='<div style="background:#fff;border:1px solid #E0E0E0;border-left:4px solid '+borderColor+';border-radius:10px;padding:11px 14px;margin-bottom:8px">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">';
    html+='<div style="flex:1;min-width:180px">';
    html+='<div style="font-size:13.5px;font-weight:700;color:#1A1A1A">'+escapeHtml(a.clienteName||"(sin cliente)")+'</div>';
    html+='<div style="font-size:11.5px;color:#757575;margin-top:2px">'+tipoLabel+(motLabel?' · '+escapeHtml(motLabel):'')+' · '+(a.fecha||"sin fecha")+'</div>';
    if(a.motivo)html+='<div style="font-size:12px;color:#5D4037;margin-top:6px;font-style:italic;line-height:1.4">"'+escapeHtml(a.motivo)+'"</div>';
    if(a.docId)html+='<div style="font-size:10.5px;color:#9E9E9E;margin-top:4px">Doc: '+escapeHtml(a.docId)+'</div>';
    if(a.createdByEmail||a.updatedByEmail)html+='<div style="font-size:10.5px;color:#9E9E9E;margin-top:2px">Por: '+escapeHtml(a.createdByEmail||a.updatedByEmail||"")+'</div>';
    html+='</div>';
    html+='<div style="text-align:right">';
    html+='<div style="font-size:15px;font-weight:700;color:'+borderColor+'">'+fm(a.monto||0)+'</div>';
    html+='<button onclick="ajusteLogConfirmDelete(\''+a.id+'\')" style="margin-top:4px;background:#fff;color:#C62828;border:1px solid #EF9A9A;padding:3px 8px;border-radius:5px;font-size:10.5px;cursor:pointer">Eliminar</button>';
    html+='</div>';
    html+='</div>';
    html+='</div>';
  });
  list.innerHTML=html;
}

async function ajusteLogConfirmDelete(logId){
  const a=ajustesLogCache.find(x=>x.id===logId);
  if(!a)return;
  if(!confirm("¿Eliminar este ajuste?\n\nCliente: "+a.clienteName+"\nMonto: "+fm(a.monto)+"\nMotivo: "+(a.motivo||"")+"\n\nNota: queda marcado como eliminado en el log (auditoría forense), pero el saldo del documento vuelve al valor original."))return;
  showLoader("Eliminando ajuste...");
  try{
    // Buscar el id en q.ajustes[] (referenciado por logId) para deshacer
    const q=quotesCache.find(x=>x.id===a.docId);
    let ajusteIdInDoc=null;
    if(q&&Array.isArray(q.ajustes)){
      const found=q.ajustes.find(aj=>aj.logId===logId||aj.id===logId);
      if(found)ajusteIdInDoc=found.id;
    }
    await softDeleteAjuste(logId,a.docId,a.docKind,ajusteIdInDoc);
    hideLoader();
    toast("Ajuste eliminado","success");
    renderCarteraAjustesLog();
    if(typeof renderCartera==="function"&&curMode==="cartera")renderCartera();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
  }
}

async function renderCarteraHistorico(){
  if(!quotesCache.length){try{await loadAllHistory()}catch{}}
  _carteraHistDefaults();
  const filtersEl=$("cartera-historico-filters");
  const listEl=$("cartera-historico-list");
  const summaryEl=$("cartera-historico-summary");
  if(!listEl||!filtersEl)return;

  // Render filtros
  const metodos=(typeof METODOS_PAGO!=="undefined")?METODOS_PAGO:["Nequi","Daviplata","Banco Falabella","Efectivo","Transferencia","Otro"];
  filtersEl.innerHTML=
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'+
      '<div>'+
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px;font-weight:600">Desde</label>'+
        '<input type="date" id="ch-desde" value="'+_carteraHistFiltros.desde+'" onchange="_carteraHistFiltros.desde=this.value;renderCarteraHistorico()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box">'+
      '</div>'+
      '<div>'+
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px;font-weight:600">Hasta</label>'+
        '<input type="date" id="ch-hasta" value="'+_carteraHistFiltros.hasta+'" onchange="_carteraHistFiltros.hasta=this.value;renderCarteraHistorico()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box">'+
      '</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      '<div>'+
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px;font-weight:600">Método</label>'+
        '<select id="ch-metodo" onchange="_carteraHistFiltros.metodo=this.value;renderCarteraHistorico()" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box">'+
          '<option value="">Todos los métodos</option>'+
          metodos.map(m=>'<option value="'+m+'"'+(_carteraHistFiltros.metodo===m?' selected':'')+'>'+m+'</option>').join("")+
        '</select>'+
      '</div>'+
      '<div>'+
        '<label style="font-size:11px;color:#555;display:block;margin-bottom:3px;font-weight:600">Cliente</label>'+
        '<input type="text" id="ch-cliente" value="'+(_carteraHistFiltros.cliente||"")+'" placeholder="Filtrar por nombre..." oninput="_carteraHistFiltros.cliente=this.value;clearTimeout(window.__chTimer);window.__chTimer=setTimeout(renderCarteraHistorico,250)" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box">'+
      '</div>'+
    '</div>';

  // Calcular pagos
  const pagos=_getPagosEnRango(_carteraHistFiltros);
  const fmt=typeof fm==="function"?fm:(n=>"$"+(n||0).toLocaleString());
  const total=pagos.reduce((s,x)=>s+(parseInt(x.pago.monto)||0),0);

  // Desglose por método
  const porMetodo={};
  pagos.forEach(({pago})=>{
    const m=pago.metodo||"Otro";
    porMetodo[m]=(porMetodo[m]||0)+(parseInt(pago.monto)||0);
  });

  if(summaryEl)summaryEl.textContent=pagos.length?(pagos.length+" pagos · "+fmt(total)):"";

  if(!pagos.length){
    listEl.innerHTML='<div style="padding:48px 20px;text-align:center;color:#888;font-size:14px">'+
      '<div style="font-size:48px;margin-bottom:12px">📒</div>'+
      '<div style="font-weight:700;color:#555;margin-bottom:6px">Sin pagos en este rango</div>'+
      '<div style="font-size:12px">Probá ampliando las fechas o quitando filtros.</div>'+
      '</div>';
    return;
  }

  // Header con resumen + desglose mini por método
  let resumenHtml=
    '<div style="background:#E8F5E9;border-left:3px solid #1B5E20;padding:12px 14px;margin-bottom:14px;border-radius:6px">'+
      '<div style="font-size:14px;color:#1B5E20;font-weight:700;margin-bottom:6px">Total: '+fmt(total)+'  ·  '+pagos.length+' pago'+(pagos.length!==1?'s':'')+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#555">';
  Object.entries(porMetodo).sort((a,b)=>b[1]-a[1]).forEach(([m,v])=>{
    const pct=Math.round(v*100/total);
    resumenHtml+='<span style="background:white;border:1px solid #C8E6C9;border-radius:14px;padding:3px 10px"><strong>'+m+'</strong> '+fmt(v)+' <span style="color:#888">('+pct+'%)</span></span>';
  });
  resumenHtml+='</div></div>';

  // Cards de pagos (limitar a 200 inicial)
  const MAX=200;
  const limited=pagos.slice(0,MAX);
  const cardsHtml=limited.map(({pago,doc})=>{
    const fotoSrc=pago.fotoUrl||pago.foto;
    const fotoIcon=fotoSrc?'<span title="Tiene comprobante" style="margin-left:6px">📎</span>':'';
    const tipoLbl=(pago.tipo||"abono").charAt(0).toUpperCase()+(pago.tipo||"abono").slice(1);
    const notas=pago.notas?'<div style="font-size:11px;color:#666;margin-top:4px">📝 '+(typeof h==="function"?h(pago.notas):pago.notas)+'</div>':'';
    return '<div style="background:white;border:1px solid #e0e0e0;border-left:3px solid #1B5E20;border-radius:8px;padding:10px 14px;margin:0 4px 8px;cursor:pointer" onclick="openVerPagosModal(\''+doc.id+'\',\''+doc.kind+'\')">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">'+
        '<div style="flex:1;min-width:160px">'+
          '<div style="font-weight:700;font-size:14px;color:#212121">'+(typeof h==="function"?h(doc.client||"(sin cliente)"):(doc.client||"(sin cliente)"))+fotoIcon+'</div>'+
          '<div style="font-size:11px;color:#666;margin-top:2px">'+(doc.id||"")+' · '+(pago.fecha||"")+' · '+(pago.metodo||"Sin método")+'</div>'+
          notas+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-weight:700;font-size:15px;color:#1B5E20">'+fmt(pago.monto||0)+'</div>'+
          '<div style="font-size:10px;color:#888;background:#f5f5f5;padding:1px 6px;border-radius:4px;display:inline-block;margin-top:2px">'+tipoLbl+'</div>'+
        '</div>'+
      '</div>'+
      '</div>';
  }).join("");

  const moreHtml=pagos.length>MAX?'<div style="padding:14px;text-align:center;color:#888;font-size:12px;background:#FFF8E1;border-radius:6px;margin:0 4px">Mostrando primeros '+MAX+' pagos de '+pagos.length+'. Refiná los filtros para ver menos.</div>':'';

  listEl.innerHTML=resumenHtml+cardsHtml+moreHtml;
}

window.renderCarteraHistorico=renderCarteraHistorico;
window._carteraHistFiltros=_carteraHistFiltros;

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
      '<button class="btn" style="background:#FFF3E0;color:#E65100;border:1px solid #FB8C00" onclick="openAjusteModal(\''+id+'\',event)">⚖️ Ajustar saldo</button>'+
      (_pagos.length?'<button class="btn hc-btn-pagos-ver" onclick="openVerPagosModal(\''+id+'\',event)">📒 Ver pagos ('+_pagos.length+')</button>':'')+
    '</div>'+
    '</div>';
}

// ─── v7.8.6: PRODUCCIÓN ANTICIPADA — modal checklist ────────────────────────

function _getItemsProduciblesDeDoc(q){
  // v7.8.8: dedupe por nombre lowercase. En proposals, un mismo producto puede aparecer en
  // múltiples opciones (ej. "Tabbule" en Opt A y Opt B); el modal de anticipados debe mostrarlo
  // una sola vez sumando qty, porque q.itemsProducidos[] es un set por nombre, no por opción.
  const byKey=new Map();
  const _add=(nombre,qty,custom)=>{
    if(!_esProductoProducible(nombre||""))return;
    const key=(nombre||"").toLowerCase().trim();
    if(!key)return;
    const prev=byKey.get(key);
    if(prev){prev.qty+=Number(qty||0)}
    else byKey.set(key,{nombre:nombre||"",qty:Number(qty||0),custom:!!custom});
  };
  if(q.kind==="quote"){
    (q.cart||[]).forEach(it=>_add(it.n,it.qty,false));
    (q.cust||[]).forEach(it=>_add(it.n,it.qty,true));
  }else{
    (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
      _add(it.name,it.qty,false);
    })));
  }
  return Array.from(byKey.values());
}

let _itemsProdDocId=null,_itemsProdKind=null;

function openItemsProducidosModal(docId,kind,ev){
  if(ev)ev.stopPropagation();
  const q=(typeof quotesCache!=="undefined")?quotesCache.find(x=>x.id===docId):null;
  if(!q)return;
  _itemsProdDocId=docId;_itemsProdKind=kind;
  const titleEl=$("items-prod-titulo");
  if(titleEl)titleEl.textContent=(q.client||docId)+" · "+docId;
  const items=_getItemsProduciblesDeDoc(q);
  const yaSet=new Set((q.itemsProducidos||[]).map(s=>(s||"").toLowerCase().trim()));
  const wrap=$("items-prod-checklist");
  if(!wrap)return;
  if(!items.length){
    wrap.innerHTML='<div style="text-align:center;padding:20px;color:#9E9E9E;font-size:13px">Este pedido no tiene items producibles.</div>';
  }else{
    wrap.innerHTML=items.map(it=>{
      const key=(it.nombre||"").toLowerCase().trim();
      const chk=yaSet.has(key)?'checked':'';
      return '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:4px;background:#FAFAFA;border:1px solid #EEE">'+
        '<input type="checkbox" class="prod-ant-check" value="'+escapeHtml(it.nombre)+'" '+chk+' style="width:16px;height:16px;cursor:pointer;accent-color:#E65100">'+
        '<span style="flex:1;font-size:13px;color:#1A1A1A">'+escapeHtml(it.nombre)+'</span>'+
        '<span style="font-size:11px;color:#9E9E9E">'+it.qty+' und</span>'+
        '</label>';
    }).join('');
  }
  $("items-prod-modal").classList.remove("hidden");
}

function closeItemsProducidosModal(){
  $("items-prod-modal").classList.add("hidden");
  _itemsProdDocId=null;_itemsProdKind=null;
}

async function saveItemsProducidosModal(){
  if(!_itemsProdDocId)return;
  const checks=document.querySelectorAll('#items-prod-checklist .prod-ant-check:checked');
  const nombres=Array.from(checks).map(c=>(c.value||"").toLowerCase().trim()).filter(Boolean);
  showLoader("Guardando...");
  try{
    await saveItemsProducidosToCloud(_itemsProdDocId,_itemsProdKind,nombres);
    const q=(typeof quotesCache!=="undefined")?quotesCache.find(x=>x.id===_itemsProdDocId):null;
    if(q)q.itemsProducidos=nombres;
    hideLoader();
    const msg=nombres.length?nombres.length+" item(s) marcados como anticipados":"Sin items anticipados";
    toast("✅ "+msg,"success");
    closeItemsProducidosModal();
    if(typeof renderPedidosProduccion==="function")renderPedidosProduccion();
    if(typeof renderPedidosAprobados==="function")renderPedidosAprobados();
  }catch(e){
    hideLoader();toast("Error: "+e.message,"error");console.error(e);
  }
}

// ─── v7.8.5: RECETAS INTERNAS — CRUD UI ─────────────────────────────────────

async function renderRecetasInternas(){
  const wrap=$("recetas-int-list");
  if(!wrap)return;
  if(recetasInternasCache===null&&cloudOnline){
    try{await loadRecetasInternasFromCloud()}catch{}
  }
  // Fuente: Firestore si disponible, sino hardcoded (para mostrar aunque Firestore falle)
  const src=(recetasInternasCache!==null)?recetasInternasCache:RECETAS_INTERNAS_HARDCODED;
  const keys=Object.keys(src).sort((a,b)=>a.localeCompare(b));
  if(!keys.length){
    wrap.innerHTML='<div style="text-align:center;padding:40px 20px;color:#757575"><div style="font-size:38px;margin-bottom:10px">🍽️</div><div style="font-size:14px;font-weight:600;color:#5D4037;margin-bottom:8px">No hay recetas internas aún</div><div style="font-size:12px;margin-bottom:14px">Creá la primera para que aparezca en la hoja de producción.</div><button class="btn bg" onclick="openRecetaEditor(null)" style="background:#1B5E20;color:#fff">+ Nueva receta</button></div>';
    return;
  }
  let html='<div style="display:flex;flex-direction:column;gap:8px">';
  keys.forEach(k=>{
    const rec=src[k];
    const ings=Array.isArray(rec)?rec:(rec.ingredientes||[]);
    const id=(rec&&rec.id)||null;
    const resumen=ings.map(i=>(i.q>1?i.q+"× ":"")+i.n).join(", ")||'Sin ingredientes';
    const costo=rec&&!Array.isArray(rec)&&(rec.costoTotal||0)>0?fm(rec.costoTotal):null;
    html+='<div onclick="openRecetaEditor(\''+escapeHtml(k)+'\')" style="background:#fff;border:1px solid #E0E0E0;border-radius:10px;padding:12px 14px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.08)\'" onmouseout="this.style.boxShadow=\'none\'">';
    html+='<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">';
    html+='<div style="font-size:14px;font-weight:700;color:#1A1A1A;text-transform:capitalize">'+escapeHtml(k)+'</div>';
    html+=(costo?'<div style="font-size:12px;font-weight:700;color:#1B5E20;white-space:nowrap">'+costo+' / und</div>':'<div style="font-size:11px;color:#BDBDBD">Sin costos</div>');
    html+='</div>';
    html+='<div style="font-size:12px;color:#757575;margin-top:3px">'+ings.length+' ingrediente'+(ings.length===1?'':'s')+' · '+escapeHtml(resumen)+'</div>';
    if(recetasInternasCache===null){
      html+='<div style="font-size:10px;color:#FB8C00;margin-top:2px">⚡ Hardcoded — guardá para mover a Firestore</div>';
    }
    html+='</div>';
  });
  html+='</div>';
  wrap.innerHTML=html;
}

let _recetaEditorKey=null; // nombre (key) de la receta en edición

function openRecetaEditor(key){
  _recetaEditorKey=key;
  const src=(recetasInternasCache!==null)?recetasInternasCache:RECETAS_INTERNAS_HARDCODED;
  const rec=key?src[key]:null;
  const ings=rec?(Array.isArray(rec)?rec:(rec.ingredientes||[])):[];
  $("receta-ed-title").textContent=key?"Editar receta":"Nueva receta";
  $("receta-ed-nombre").value=key?key:"";
  _recetaEditorRenderIngredientes(ings);
  $("receta-ed-del-btn").style.display=(key&&recetasInternasCache!==null&&recetasInternasCache[key]?.id)?"inline-block":"none";
  $("receta-ed-modal").classList.remove("hidden");
}

function closeRecetaEditor(){
  $("receta-ed-modal").classList.add("hidden");
  _recetaEditorKey=null;
}

function _recetaEditorRenderIngredientes(ings){
  const wrap=$("receta-ed-ings");
  if(!wrap)return;
  let html='';
  ings.forEach(ing=>{
    html+=_recetaIngRow(ing.n,ing.q,ing.unidad,ing.costoUnit,ing.merma);
  });
  wrap.innerHTML=html;
  _recetaCalcularTotal();
}

// v7.8.5.1: unidades disponibles para ingredientes de receta
const RECETA_UNIDADES=["g","kg","ml","L","unidad","porción","taza","cucharada","manojo","paquete"];

function _recetaIngRow(nombre,q,unidad,costoUnit,merma){
  const opts=RECETA_UNIDADES.map(u=>'<option value="'+u+'"'+(u===(unidad||"unidad")?' selected':'')+'>'+u+'</option>').join('');
  return '<div class="receta-ing-row" style="border:1px solid #E8E8E8;border-radius:8px;padding:8px 10px;margin-bottom:6px;background:#FAFAFA">'+
    '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
      '<input type="text" class="ring-n" value="'+escapeHtml(nombre||'')+'" placeholder="Nombre ingrediente" style="flex:1;padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px" oninput="_recetaCalcularTotal()">'+
      '<input type="number" class="ring-q" value="'+(q||1)+'" min="0.01" step="0.01" style="width:60px;padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:13px;text-align:center" title="Cantidad por unidad del plato" oninput="_recetaCalcularTotal()">'+
      '<button onclick="_recetaIngEliminar(this)" style="background:none;border:none;cursor:pointer;color:#B71C1C;font-size:16px;padding:0 4px;flex-shrink:0" title="Quitar">✕</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">'+
      '<span style="font-size:11px;color:#9E9E9E">Unidad:</span>'+
      '<select class="ring-u" style="padding:3px 5px;border:1px solid #ddd;border-radius:5px;font-size:12px;color:#333" onchange="_recetaCalcularTotal()">'+opts+'</select>'+
      '<span style="font-size:11px;color:#9E9E9E">$/u:</span>'+
      '<input type="number" class="ring-c" value="'+(costoUnit>0?costoUnit:'')+'" min="0" step="100" placeholder="—" style="width:90px;padding:3px 6px;border:1px solid #ddd;border-radius:5px;font-size:12px;text-align:right" oninput="_recetaCalcularTotal()">'+
      '<span style="font-size:11px;color:#9E9E9E">Merma:</span>'+
      '<input type="number" class="ring-m" value="'+(merma>0?merma:'')+'" min="0" max="99" step="1" placeholder="0" style="width:46px;padding:3px 6px;border:1px solid #ddd;border-radius:5px;font-size:12px;text-align:center" oninput="_recetaCalcularTotal()">'+
      '<span style="font-size:11px;color:#9E9E9E">%</span>'+
      '<span class="ring-sub" style="font-size:11px;color:#2E7D32;margin-left:auto;font-weight:600"></span>'+
    '</div>'+
  '</div>';
}

function recetaIngAgregar(){
  const wrap=$("receta-ed-ings");
  if(!wrap)return;
  const div=document.createElement("div");
  div.innerHTML=_recetaIngRow("",1,"unidad",0,0);
  wrap.appendChild(div.firstChild);
  wrap.querySelector('.receta-ing-row:last-child .ring-n')?.focus();
  _recetaCalcularTotal();
}

function _recetaIngEliminar(btn){
  btn.closest('.receta-ing-row')?.remove();
  _recetaCalcularTotal();
}

function _recetaCalcularTotal(){
  const wrap=$("receta-ed-ings");
  const totalEl=$("receta-ed-total");
  if(!wrap)return 0;
  let total=0;
  wrap.querySelectorAll('.receta-ing-row').forEach(r=>{
    const q=parseFloat(r.querySelector('.ring-q')?.value||0)||0;
    const c=parseFloat(r.querySelector('.ring-c')?.value||0)||0;
    const m=parseFloat(r.querySelector('.ring-m')?.value||0)||0;
    const sub=q*c*(1+(m/100));
    const subEl=r.querySelector('.ring-sub');
    if(subEl)subEl.textContent=c>0?fm(sub):'';
    total+=sub;
  });
  if(totalEl)totalEl.textContent=total>0?('Costo estimado: '+fm(Math.round(total))+' / unidad'):'Sin precios cargados';
  return total;
}

function _recetaEditorCollectIngredientes(){
  const wrap=$("receta-ed-ings");
  if(!wrap)return[];
  const result=[];
  wrap.querySelectorAll('.receta-ing-row').forEach(r=>{
    const n=(r.querySelector('.ring-n')?.value||"").trim();
    const q=parseFloat(r.querySelector('.ring-q')?.value||"1")||1;
    const unidad=r.querySelector('.ring-u')?.value||"unidad";
    const costoUnit=parseFloat(r.querySelector('.ring-c')?.value||"0")||0;
    const merma=parseFloat(r.querySelector('.ring-m')?.value||"0")||0;
    if(n)result.push({n,q,unidad,costoUnit,merma});
  });
  return result;
}

// v7.8.11: rename transaccional (crear nuevo → si éxito → borrar viejo) + catch robusto
// con contexto de error explícito. Reemplaza el flujo viejo delete-then-create que destruía
// la receta original si el create fallaba (causa probable del bug Arroz Reina del 2026-05-07).
async function saveRecetaEditor(){
  const nombre=($("receta-ed-nombre").value||"").toLowerCase().trim();
  if(!nombre){toast("El nombre es obligatorio","warn");return}
  const ingredientes=_recetaEditorCollectIngredientes();
  if(!ingredientes.length){toast("Agrega al menos un ingrediente","warn");return}
  const costoTotal=Math.round(ingredientes.reduce((s,i)=>s+(i.q||0)*(i.costoUnit||0)*(1+((i.merma||0)/100)),0));
  const src=(recetasInternasCache!==null)?recetasInternasCache:{};
  const existingId=_recetaEditorKey&&src[_recetaEditorKey]?.id||null;
  const nombreCambio=_recetaEditorKey&&_recetaEditorKey!==nombre;
  const modo=nombreCambio&&existingId?"rename":(existingId?"update":"create");

  showLoader("Guardando...");

  // FASE 1: persistir en Firestore. Cualquier error aquí se reporta como error de save.
  let saveOk=false;
  let renameWarn=null; // si rename: éxito del create pero falla del delete del viejo
  try{
    if(modo==="rename"){
      // Crear el nuevo doc PRIMERO. Si falla → la receta vieja queda intacta (recuperable).
      await saveRecetaInternaToCloud(nombre,ingredientes,null,costoTotal);
      // Solo si el create tuvo éxito intentamos borrar el viejo.
      try{
        await deleteRecetaInternaFromCloud(existingId,_recetaEditorKey);
      }catch(eDel){
        // El nuevo ya existe — la receta nueva está OK. Pero quedó duplicado el viejo.
        renameWarn={oldId:existingId,oldKey:_recetaEditorKey,error:eDel?.message||String(eDel)};
        console.warn("[saveRecetaEditor] rename: create OK, delete del viejo falló",renameWarn);
      }
    }else{
      await saveRecetaInternaToCloud(nombre,ingredientes,existingId,costoTotal);
    }
    saveOk=true;
  }catch(e){
    hideLoader();
    const msg=e?.message||String(e)||"(sin detalle)";
    toast("Error guardando receta: "+msg,"error");
    console.error("[saveRecetaEditor] save falló",{modo,nombre,oldKey:_recetaEditorKey,existingId,error:e});
    return;
  }

  // FASE 2: efectos post-save (UI). Errores acá NO invalidan el save — solo se loguean.
  hideLoader();
  if(renameWarn){
    toast("⚠️ Receta guardada como '"+nombre+"' pero no se pudo borrar la versión vieja '"+renameWarn.oldKey+"'. Eliminala manualmente desde Herramientas.","warn",8000);
  }else{
    toast("✅ Receta guardada","success");
  }
  try{
    closeRecetaEditor();
    renderRecetasInternas();
  }catch(eUi){
    console.error("[saveRecetaEditor] render post-save falló (save sí persistió)",eUi);
  }
}

async function deleteRecetaEditor(){
  if(!_recetaEditorKey)return;
  const src=recetasInternasCache||{};
  const id=src[_recetaEditorKey]?.id;
  if(!id){toast("No se puede borrar: receta hardcoded. Guardá primero para que quede en Firestore.","warn");return}
  if(!confirm('¿Eliminar la receta "'+_recetaEditorKey+'"?'))return;
  showLoader("Eliminando...");
  try{
    await deleteRecetaInternaFromCloud(id,_recetaEditorKey);
    hideLoader();
    toast("Receta eliminada","success");
    closeRecetaEditor();
    renderRecetasInternas();
  }catch(e){
    hideLoader();
    toast("Error: "+e.message,"error");
    console.error(e);
  }
}

// ─── v7.9.0: CATÁLOGO DE PRODUCTOS (UI mínima — lectura) ───
// v7.9.5: removida toda lógica de migración. productosCache es source of truth.
async function renderCatalogoProductos(){
  const listEl=$("catalogo-list");
  if(!listEl)return;

  listEl.innerHTML='<div style="text-align:center;padding:30px;color:#9E9E9E;font-size:13px">Cargando…</div>';

  if(typeof productosCache!=="undefined"&&productosCache===null&&cloudOnline){
    try{await loadProductosFromCloud()}catch{}
  }
  if(typeof categoriasCache!=="undefined"&&categoriasCache===null&&cloudOnline){
    try{await loadCategoriasFromCloud()}catch{}
  }

  const prodsCount=(typeof productosCache!=="undefined"&&productosCache)?Object.keys(productosCache).length:0;

  if(prodsCount===0){
    listEl.innerHTML='<div style="padding:20px;background:#FFEBEE;border:1px solid #EF9A9A;border-radius:8px;color:#C62828;font-size:13px;text-align:center">Sin productos en Firestore. Verificar conexión o cargar productos desde Herramientas > Catálogo.</div>';
    return;
  }

  // Lista de categorías para dropdowns "mover producto"
  const allCats=Object.values(categoriasCache||{}).sort((a,b)=>(a.orden||999)-(b.orden||999));

  // Agrupar por categoría (incluye "sin-categoria" si hay productos huérfanos)
  const porCat={};
  Object.values(productosCache).forEach(p=>{
    const cid=p.categoriaId||"sin-categoria";
    if(!porCat[cid])porCat[cid]={nombre:(categoriasCache&&categoriasCache[cid]&&categoriasCache[cid].nombre)||"(sin categoría)",productos:[]};
    porCat[cid].productos.push(p);
  });

  // v7.9.0.1: barra de acciones arriba (crear categoría)
  let html='<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button onclick="crearCategoria()" style="background:#1B5E20;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer">+ Nueva categoría</button></div>';

  html+='<div style="display:flex;flex-direction:column;gap:12px">';
  Object.keys(porCat).sort((a,b)=>{
    const oa=(categoriasCache&&categoriasCache[a]&&categoriasCache[a].orden)||999;
    const ob=(categoriasCache&&categoriasCache[b]&&categoriasCache[b].orden)||999;
    return oa-ob;
  }).forEach(cid=>{
    const cat=porCat[cid];
    const esCategoriaReal=cid!=="sin-categoria"&&categoriasCache&&categoriasCache[cid];
    cat.productos.sort((a,b)=>(a.ordenDentroDeCategoria||999)-(b.ordenDentroDeCategoria||999));
    html+='<div style="border:1px solid #E0E0E0;border-radius:10px;overflow:hidden">';
    // Header con acciones de categoría
    html+='<div style="background:#F5F5F5;padding:8px 14px;font-size:12.5px;font-weight:700;color:#424242;display:flex;align-items:center;justify-content:space-between;gap:8px">';
    html+='<div>'+escapeHtml(cat.nombre)+' <span style="font-weight:400;color:#9E9E9E">('+cat.productos.length+')</span></div>';
    if(esCategoriaReal){
      html+='<div style="display:flex;gap:4px">'+
        '<button onclick="renombrarCategoria(\''+escapeHtml(cid)+'\')" title="Renombrar" style="background:none;border:1px solid #BDBDBD;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px;color:#424242">✏️ Renombrar</button>'+
        '<button onclick="eliminarCategoria(\''+escapeHtml(cid)+'\')" title="Eliminar" style="background:none;border:1px solid #EF9A9A;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px;color:#C62828">🗑️ Eliminar</button>'+
      '</div>';
    }
    html+='</div>';
    // Productos
    html+='<div style="display:flex;flex-direction:column">';
    cat.productos.forEach(p=>{
      const archivado=p.activo===false;
      const tipoBadge=p.tipo==="compuesto"?
        '<span style="background:#FFE0B2;color:#E65100;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:700;margin-left:6px">COMPUESTO</span>':
        '';
      const archivadoBadge=archivado?
        '<span style="background:#EEEEEE;color:#757575;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:700;margin-left:6px">ARCHIVADO</span>':
        '';
      const recetaBadge=(!archivado&&p.recetaKey)?
        '<span style="font-size:11px;color:#1B5E20;margin-left:6px">→ '+escapeHtml(p.recetaKey)+(p.porciones>1?' ×1/'+p.porciones:'')+'</span>':
        (!archivado&&p.tipo==="atomico"?'<span style="font-size:11px;color:#9E7A00;margin-left:6px">sin receta</span>':'');
      const visible=p.visibleEnListaPrecios!==false;
      const checked=visible?'checked':'';
      // Dropdown para mover a otra categoría
      let dropOpts='';
      allCats.forEach(c=>{
        if(c.categoriaId===p.categoriaId)return;
        dropOpts+='<option value="'+escapeHtml(c.categoriaId)+'">'+escapeHtml(c.nombre)+'</option>';
      });
      const rowBg=archivado?'background:#FAFAFA;opacity:0.7':'';
      html+='<div style="padding:8px 14px;border-top:1px solid #F0F0F0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;'+rowBg+'">';
      // Izquierda: checkbox + foto + nombre + badges
      html+='<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">';
      if(!archivado){
        html+='<label title="Visible en Lista de precios" style="display:flex;align-items:center;cursor:pointer;flex-shrink:0">'+
          '<input type="checkbox" '+checked+' onchange="toggleVisibleEnListaPrecios(\''+escapeHtml(p.productId)+'\',this.checked)" style="cursor:pointer">'+
        '</label>';
      }else{
        html+='<div style="width:16px;flex-shrink:0"></div>';
      }
      // v7.9.0.2: thumbnail de foto + botones subir/cambiar/borrar
      const tieneFoto=!!p.fotoUrl;
      const thumbHtml=(!archivado&&tieneFoto)?
        '<img src="'+escapeHtml(p.fotoUrl)+'" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid #E0E0E0;flex-shrink:0;cursor:pointer" onclick="subirFotoProducto(\''+escapeHtml(p.productId)+'\')" title="Cambiar foto">':
        (!archivado?'<button onclick="subirFotoProducto(\''+escapeHtml(p.productId)+'\')" title="Subir foto" style="width:36px;height:36px;border:1px dashed #BDBDBD;background:#FAFAFA;border-radius:6px;cursor:pointer;font-size:14px;color:#757575;flex-shrink:0;padding:0">📸</button>':
        '<div style="width:36px;height:36px;flex-shrink:0"></div>');
      html+=thumbHtml;
      html+='<div style="flex:1;min-width:0;overflow:hidden"><span style="font-weight:600;color:'+(archivado?'#9E9E9E':(visible?'#1A1A1A':'#9E9E9E'))+'">'+escapeHtml(p.nombre)+'</span>'+tipoBadge+archivadoBadge+recetaBadge+'</div>';
      html+='</div>';
      // Derecha: precio + unidad + acciones
      html+='<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">';
      if(!archivado){
        html+='<div style="font-size:11px;color:#757575;white-space:nowrap;text-align:right">'+(p.precio?fm(p.precio):'—')+'<br><span>'+escapeHtml(p.unidad||'')+'</span></div>';
        if(tieneFoto){
          html+='<button onclick="borrarFotoProducto(\''+escapeHtml(p.productId)+'\')" title="Borrar foto" style="background:none;border:1px solid #EF9A9A;border-radius:5px;padding:2px 6px;cursor:pointer;font-size:11px;color:#C62828">🗑️</button>';
        }
        if(dropOpts){
          html+='<select onchange="moverProductoACategoria(\''+escapeHtml(p.productId)+'\',this.value)" title="Mover a otra categoría" style="font-size:11px;padding:2px 4px;border:1px solid #E0E0E0;border-radius:5px;background:#fff;cursor:pointer;max-width:120px">'+
            '<option value="">→ Mover</option>'+dropOpts+
          '</select>';
        }
        html+='<button onclick="editarProducto(\''+escapeHtml(p.productId)+'\')" title="Editar producto" style="background:#E3F2FD;color:#0D47A1;border:1px solid #90CAF9;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap">✏️ Editar</button>';
        html+='<button onclick="archivarProducto(\''+escapeHtml(p.productId)+'\')" title="Archivar producto" style="background:none;border:1px solid #BDBDBD;border-radius:5px;padding:2px 6px;cursor:pointer;font-size:11px;color:#757575;white-space:nowrap">🗄️</button>';
      }else{
        html+='<button onclick="restaurarProducto(\''+escapeHtml(p.productId)+'\')" title="Restaurar producto" style="background:#E8F5E9;color:#1B5E20;border:1px solid #A5D6A7;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap">↩ Restaurar</button>';
      }
      html+='</div>';
      html+='</div>';
    });
    html+='</div></div>';
  });
  html+='</div>';
  listEl.innerHTML=html;
}

// v7.9.0.4: marcar todos los productos + categorías activos como visibleEnWeb=true.
// v7.9.7.3: catalogo.html público eliminado; flag queda como pre-requisito para la
// landing pública futura. No tiene efecto visible hoy.
async function hacerVisiblesEnWeb(){
  if(!productosCache||!Object.keys(productosCache).length){
    toast("Catálogo no migrado","warn");return;
  }
  const prodsCandidatos=Object.values(productosCache).filter(p=>p.activo!==false&&p.visibleEnWeb!==true);
  const catsCandidatas=Object.values(categoriasCache||{}).filter(c=>c.activo!==false&&c.visibleEnWeb!==true);
  if(!prodsCandidatos.length&&!catsCandidatas.length){
    toast("Todo el catálogo ya es visible en web","success");
    return;
  }
  if(!confirm("Vas a marcar "+prodsCandidatos.length+" productos + "+catsCandidatas.length+" categorías como visibleEnWeb=true.\n\nFlag para la landing pública futura. Hoy no tiene efecto visible (catalogo.html está deshabilitado).\n\n¿Continuar?"))return;

  showLoader("Actualizando…");
  const {db,doc,setDoc,serverTimestamp}=window.fb;
  let ok=0,fail=0;

  // 1. Categorías primero (más rápido, son menos)
  for(let i=0;i<catsCandidatas.length;i++){
    const c=catsCandidatas[i];
    showLoader("Categorías "+(i+1)+"/"+catsCandidatas.length+"… "+c.nombre);
    try{
      await setDoc(doc(db,"categorias",c.categoriaId),{
        visibleEnWeb:true,updatedAt:serverTimestamp(),...auditStamp(),
      },{merge:true});
      categoriasCache[c.categoriaId].visibleEnWeb=true;
      ok++;
    }catch(e){console.error("[hacerVisiblesEnWeb cat]",c.categoriaId,e);fail++}
  }

  // 2. Productos
  for(let i=0;i<prodsCandidatos.length;i++){
    const p=prodsCandidatos[i];
    showLoader("Productos "+(i+1)+"/"+prodsCandidatos.length+"… "+p.nombre);
    try{
      await setDoc(doc(db,"productos",p.productId),{
        visibleEnWeb:true,updatedAt:serverTimestamp(),...auditStamp(),
      },{merge:true});
      productosCache[p.productId].visibleEnWeb=true;
      ok++;
    }catch(e){console.error("[hacerVisiblesEnWeb prod]",p.productId,e);fail++}
  }

  localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
  localStorage.setItem("gb_categorias_cache",JSON.stringify(categoriasCache));
  hideLoader();
  toast((fail>0?"⚠ ":"✅ ")+ok+" marcados visibleEnWeb"+(fail>0?", "+fail+" fallaron":""),fail>0?"warn":"success",6000);
  renderCatalogoProductos();
}

// v7.9.0.2: archivar productos custom no-cliente (servicios, bebidas, regalos, basura)
async function archivarCustomsNoCliente(){
  if(!productosCache||!Object.keys(productosCache).length){
    toast("Catálogo no migrado","warn");return;
  }
  // Detectar candidatos a archivar
  const candidatos=[];
  Object.values(productosCache).forEach(p=>{
    if(p.activo===false)return;
    let razon=null;
    if(p.categoriaId==="servicios")razon="servicio";
    else if(p.categoriaId==="bebidas-e-insumos")razon="bebida/insumo";
    else if(p.nombre&&p.nombre.includes("CUSTOM CUSTOM"))razon="basura";
    else if(p.nombre&&/\(regalo\)/i.test(p.nombre))razon="regalo";
    if(razon)candidatos.push({pid:p.productId,nombre:p.nombre,razon});
  });

  if(!candidatos.length){
    toast("No hay productos custom no-cliente para archivar","warn");
    return;
  }

  let mensaje="Vas a archivar "+candidatos.length+" producto(s) (activo=false). Quedan en Firestore como histórico pero NO aparecen en lista de precios, web ni cotizador.\n\n";
  candidatos.forEach(c=>{mensaje+="  ["+c.razon+"] "+c.nombre+"\n"});
  mensaje+="\n¿Continuar?";
  if(!confirm(mensaje))return;

  showLoader("Archivando 0/"+candidatos.length+"…");
  const {db,doc,setDoc,serverTimestamp}=window.fb;
  let ok=0,fail=0;
  for(let i=0;i<candidatos.length;i++){
    const c=candidatos[i];
    showLoader("Archivando "+(i+1)+"/"+candidatos.length+"… "+c.nombre);
    try{
      await setDoc(doc(db,"productos",c.pid),{
        activo:false,
        updatedAt:serverTimestamp(),
        archivedAt:new Date().toISOString(),
        archivedReason:"no-vendible-cliente",
        ...auditStamp(),
      },{merge:true});
      productosCache[c.pid].activo=false;
      ok++;
    }catch(e){
      console.error("[archivar] falló",c.pid,e);
      fail++;
    }
  }
  localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
  hideLoader();
  toast((fail>0?"⚠ ":"✅ ")+ok+" archivados"+(fail>0?", "+fail+" fallaron":""),fail>0?"warn":"success",6000);
  renderCatalogoProductos();
}

// ─── v7.9.1: EDITOR DE PRODUCTO INDIVIDUAL ───────────────────────────────────

function editarProducto(productId){
  if(!productosCache||!productosCache[productId])return;
  const p=productosCache[productId];
  const overlay=document.createElement("div");
  overlay.id="edit-prod-overlay";
  overlay.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto";
  overlay.innerHTML=`
<div style="background:#fff;border-radius:14px;max-width:480px;width:100%;padding:20px 22px;box-shadow:0 8px 32px rgba(0,0,0,.3);font-family:var(--gb-font-body);margin:auto">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #E0E0E0">
    <div style="font-size:16px;font-weight:700;color:#1A1A1A">✏️ Editar producto</div>
    <button id="ep-close" style="background:transparent;border:none;font-size:22px;cursor:pointer;color:#9E9E9E;padding:0 4px;line-height:1">×</button>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div>
      <label style="display:block;font-size:11.5px;font-weight:600;color:#424242;margin-bottom:4px">Nombre *</label>
      <input id="ep-nombre" type="text" value="${escapeHtml(p.nombre||"")}" style="width:100%;box-sizing:border-box;border:1px solid #BDBDBD;border-radius:7px;padding:8px 10px;font-size:13px">
    </div>
    <div style="display:flex;gap:10px">
      <div style="flex:1">
        <label style="display:block;font-size:11.5px;font-weight:600;color:#424242;margin-bottom:4px">Precio ($)</label>
        <input id="ep-precio" type="number" min="0" step="100" value="${p.precio||""}" style="width:100%;box-sizing:border-box;border:1px solid #BDBDBD;border-radius:7px;padding:8px 10px;font-size:13px">
      </div>
      <div style="flex:1">
        <label style="display:block;font-size:11.5px;font-weight:600;color:#424242;margin-bottom:4px">Unidad</label>
        <input id="ep-unidad" type="text" placeholder="porción, unidad, kg…" value="${escapeHtml(p.unidad||"")}" style="width:100%;box-sizing:border-box;border:1px solid #BDBDBD;border-radius:7px;padding:8px 10px;font-size:13px">
      </div>
    </div>
    <div>
      <label style="display:block;font-size:11.5px;font-weight:600;color:#424242;margin-bottom:4px">Descripción interna</label>
      <textarea id="ep-desc" rows="2" style="width:100%;box-sizing:border-box;border:1px solid #BDBDBD;border-radius:7px;padding:8px 10px;font-size:12.5px;resize:vertical">${escapeHtml(p.descripcion||"")}</textarea>
    </div>
    <div>
      <label style="display:block;font-size:11.5px;font-weight:600;color:#424242;margin-bottom:4px">Descripción pública <span style="font-weight:400;color:#9E9E9E">(catálogo web)</span></label>
      <textarea id="ep-descweb" rows="2" style="width:100%;box-sizing:border-box;border:1px solid #BDBDBD;border-radius:7px;padding:8px 10px;font-size:12.5px;resize:vertical">${escapeHtml(p.descripcionWeb||"")}</textarea>
    </div>
    <div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;color:#424242">
        <input id="ep-visibleweb" type="checkbox" ${p.visibleEnWeb!==false?"checked":""} style="width:16px;height:16px;cursor:pointer;accent-color:#1B5E20">
        Visible en catálogo.html (web pública / Linktree)
      </label>
    </div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid #E0E0E0">
    <button id="ep-cancel" style="background:#fff;color:#5D4037;border:1px solid #BDBDBD;padding:9px 16px;border-radius:8px;font-size:13px;cursor:pointer">Cancelar</button>
    <button id="ep-save" style="background:#0D47A1;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Guardar</button>
  </div>
  <div style="font-size:10.5px;color:#9E9E9E;margin-top:8px;text-align:right">ID: ${escapeHtml(productId)}</div>
</div>`;
  document.body.appendChild(overlay);

  const close=()=>{try{document.body.removeChild(overlay)}catch{}};
  document.getElementById("ep-close").onclick=close;
  document.getElementById("ep-cancel").onclick=close;
  document.getElementById("ep-save").onclick=async()=>{
    const nombre=(document.getElementById("ep-nombre").value||"").trim();
    if(!nombre){toast("El nombre no puede quedar vacío","warn");return}
    const precio=parseFloat(document.getElementById("ep-precio").value)||null;
    const unidad=(document.getElementById("ep-unidad").value||"").trim()||null;
    const descripcion=(document.getElementById("ep-desc").value||"").trim()||null;
    const descripcionWeb=(document.getElementById("ep-descweb").value||"").trim()||null;
    const visibleEnWeb=document.getElementById("ep-visibleweb").checked;
    close();
    await _guardarEdicionProducto(productId,{nombre,precio,unidad,descripcion,descripcionWeb,visibleEnWeb});
  };
  overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
}

async function _guardarEdicionProducto(productId,data){
  if(!productosCache||!productosCache[productId])return;
  showLoader("Guardando…");
  try{
    const{db,doc,setDoc,serverTimestamp}=window.fb;
    const patch={...data,updatedAt:serverTimestamp(),...auditStamp()};
    Object.keys(patch).forEach(k=>{if(patch[k]===null)delete patch[k]});
    if(data.precio===null)patch.precio=null;
    await setDoc(doc(db,"productos",productId),patch,{merge:true});
    Object.assign(productosCache[productId],data);
    localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
    hideLoader();
    toast("✅ Producto actualizado","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error guardando: "+(e?.message||e),"error");
    console.error("[_guardarEdicionProducto]",e);
  }
}

async function archivarProducto(productId){
  if(!productosCache||!productosCache[productId])return;
  const p=productosCache[productId];
  if(!confirm("¿Archivar \""+p.nombre+"\"?\n\nEl producto quedará inactivo. Podés restaurarlo desde esta misma pantalla."))return;
  showLoader("Archivando…");
  try{
    const{db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"productos",productId),{
      activo:false,
      updatedAt:serverTimestamp(),
      archivedAt:new Date().toISOString(),
      archivedReason:"manual",
      ...auditStamp(),
    },{merge:true});
    productosCache[productId].activo=false;
    localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
    hideLoader();
    toast("✅ \""+p.nombre+"\" archivado","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[archivarProducto]",e);
  }
}

async function restaurarProducto(productId){
  if(!productosCache||!productosCache[productId])return;
  const p=productosCache[productId];
  showLoader("Restaurando…");
  try{
    const{db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"productos",productId),{
      activo:true,
      updatedAt:serverTimestamp(),
      archivedAt:null,
      archivedReason:null,
      ...auditStamp(),
    },{merge:true});
    productosCache[productId].activo=true;
    localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
    hideLoader();
    toast("✅ \""+p.nombre+"\" restaurado","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[restaurarProducto]",e);
  }
}


// ─── v7.9.0.1: VENTAS > LISTA DE PRECIOS ──────────────────────
// Lee productosCache + categoriasCache. Muestra TODOS los productos activos.
// Default visible = visibleEnListaPrecios !== false (lo configurado en Herramientas).
// Override temporal: Luis puede marcar/desmarcar PARA ESTE PDF (no persiste).
// El override vive en _lpOverrides hasta que se cambie de página o se resetee.

let _lpOverrides={}; // {productId: boolean} — override temporal de la sesión

async function renderListaPrecios(){
  const summaryEl=$("lp-summary");
  const listEl=$("lp-list");
  if(!summaryEl||!listEl)return;

  if(typeof productosCache!=="undefined"&&productosCache===null&&cloudOnline){
    try{await loadProductosFromCloud()}catch{}
  }
  if(typeof categoriasCache!=="undefined"&&categoriasCache===null&&cloudOnline){
    try{await loadCategoriasFromCloud()}catch{}
  }

  if(!productosCache||!Object.keys(productosCache).length){
    summaryEl.textContent="";
    listEl.innerHTML='<div style="padding:20px;background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;color:#9E7A00;font-size:13px;text-align:center">Catálogo no migrado a Firestore. Andá a Herramientas > Catálogo de productos y dispará la migración.</div>';
    return;
  }

  // Productos activos (no archivados). Default visible viene de Firestore. Override temporal opcional.
  const activos=Object.values(productosCache).filter(p=>p.activo!==false);
  if(!activos.length){
    listEl.innerHTML='<div style="padding:20px;background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;color:#9E7A00;font-size:13px;text-align:center">No hay productos activos en el catálogo.</div>';
    return;
  }

  // Calcular visibles ahora considerando override
  const _esVisible=(p)=>{
    if(Object.prototype.hasOwnProperty.call(_lpOverrides,p.productId))return _lpOverrides[p.productId];
    return p.visibleEnListaPrecios!==false;
  };
  const visiblesCount=activos.filter(_esVisible).length;
  const ocultos=activos.length-visiblesCount;
  const overrideCount=Object.keys(_lpOverrides).length;
  summaryEl.innerHTML='Visibles en este PDF: <strong>'+visiblesCount+'</strong> de '+activos.length+
    (overrideCount>0?' <span style="color:#E65100;font-weight:600">· '+overrideCount+' override'+(overrideCount!==1?'s':'')+' temporales</span> <a href="javascript:void(0)" onclick="_lpResetOverrides()" style="color:#0D47A1;font-size:11px;margin-left:6px">resetear</a>':'')+
    '<br><span style="font-size:11px;color:#9E9E9E">El cambio acá NO persiste — para ocultar permanente, usar Herramientas > Catálogo de productos.</span>';

  // Agrupar por categoría
  const porCat={};
  activos.forEach(p=>{
    const cid=p.categoriaId||"sin-categoria";
    if(!porCat[cid])porCat[cid]={nombre:(categoriasCache&&categoriasCache[cid]&&categoriasCache[cid].nombre)||cid,productos:[]};
    porCat[cid].productos.push(p);
  });

  let html='<div style="display:flex;flex-direction:column;gap:12px">';
  Object.keys(porCat).sort((a,b)=>{
    const oa=(categoriasCache&&categoriasCache[a]&&categoriasCache[a].orden)||999;
    const ob=(categoriasCache&&categoriasCache[b]&&categoriasCache[b].orden)||999;
    return oa-ob;
  }).forEach(cid=>{
    const cat=porCat[cid];
    cat.productos.sort((a,b)=>(a.ordenDentroDeCategoria||999)-(b.ordenDentroDeCategoria||999));
    html+='<div style="border:1px solid #E0E0E0;border-radius:10px;overflow:hidden">';
    html+='<div style="background:#F5F5F5;padding:8px 14px;font-size:12.5px;font-weight:700;color:#424242">'+escapeHtml(cat.nombre)+' <span style="font-weight:400;color:#9E9E9E">('+cat.productos.length+')</span></div>';
    html+='<div style="display:flex;flex-direction:column">';
    cat.productos.forEach(p=>{
      const visible=_esVisible(p);
      const checked=visible?'checked':'';
      const isOverride=Object.prototype.hasOwnProperty.call(_lpOverrides,p.productId);
      const overrideMark=isOverride?'<span title="Override temporal — no persiste" style="color:#E65100;font-size:10px;margin-left:4px">●</span>':'';
      html+='<div style="padding:8px 14px;border-top:1px solid #F0F0F0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px">';
      html+='<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">';
      html+='<label style="display:flex;align-items:center;cursor:pointer;flex-shrink:0"><input type="checkbox" '+checked+' onchange="_lpToggleOverride(\''+escapeHtml(p.productId)+'\',this.checked)" style="cursor:pointer"></label>';
      html+='<div style="flex:1;min-width:0;overflow:hidden"><span style="font-weight:600;color:'+(visible?'#1A1A1A':'#9E9E9E')+'">'+escapeHtml(p.nombre)+'</span>'+overrideMark+
            (p.descripcion?'<div style="font-size:11px;color:#757575;margin-top:1px">'+escapeHtml(p.descripcion)+'</div>':'')+'</div>';
      html+='</div>';
      html+='<div style="font-size:11px;color:#757575;white-space:nowrap;text-align:right">'+(p.precio?fm(p.precio):'—')+'<br><span style="color:#9E9E9E">'+escapeHtml(p.unidad||'')+'</span></div>';
      html+='</div>';
    });
    html+='</div></div>';
  });
  html+='</div>';
  listEl.innerHTML=html;
}

function _lpToggleOverride(productId,checked){
  if(!productosCache||!productosCache[productId])return;
  const persisted=productosCache[productId].visibleEnListaPrecios!==false;
  // Si el toggle vuelve al valor persistido, eliminar el override (no es necesario)
  if(checked===persisted){
    delete _lpOverrides[productId];
  }else{
    _lpOverrides[productId]=!!checked;
  }
  renderListaPrecios();
}

function _lpResetOverrides(){
  _lpOverrides={};
  renderListaPrecios();
}

function generarPdfListaPrecios(){
  if(!window.jspdf||!window.jspdf.jsPDF){toast("Error: jsPDF no cargado","error");return}
  if(!productosCache||!Object.keys(productosCache).length){toast("Catálogo no migrado","warn");return}

  const showPrices=$("lp-show-prices")?.checked!==false;
  const showAlergenos=$("lp-show-alergenos")?.checked===true;
  const cliente=($("lp-cliente")?.value||"").trim();

  // Aplicar override temporal sobre visibilidad persistida
  const _esVisible=(p)=>{
    if(Object.prototype.hasOwnProperty.call(_lpOverrides,p.productId))return _lpOverrides[p.productId];
    return p.visibleEnListaPrecios!==false;
  };
  const visibles=Object.values(productosCache).filter(p=>(p.activo!==false)&&_esVisible(p));
  if(!visibles.length){toast("No hay productos visibles para exportar","warn");return}

  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF("p","mm","a4");
  const W=210,H=297,M=14;

  const fechaIso=gbTodayIso();
  let subtitle=fechaIso;
  if(cliente)subtitle+="  -  Para: "+cliente;
  subtitle+=showPrices?"  -  Con precios":"  -  Sin precios";
  let y=_repPdfHeader(pdf,W,"LISTA DE PRECIOS",subtitle);

  // Agrupar por categoría
  const porCat={};
  visibles.forEach(p=>{
    const cid=p.categoriaId||"sin-categoria";
    if(!porCat[cid])porCat[cid]={nombre:(categoriasCache&&categoriasCache[cid]&&categoriasCache[cid].nombre)||cid,orden:(categoriasCache&&categoriasCache[cid]&&categoriasCache[cid].orden)||999,productos:[]};
    porCat[cid].productos.push(p);
  });

  // Construir filas: header de categoría + productos
  const headRow=["Producto","Descripción","Unidad"];
  if(showAlergenos)headRow.push("Alérgenos");
  if(showPrices)headRow.push("Precio");

  const cats=Object.keys(porCat).sort((a,b)=>porCat[a].orden-porCat[b].orden);
  const body=[];
  cats.forEach(cid=>{
    const cat=porCat[cid];
    cat.productos.sort((a,b)=>(a.ordenDentroDeCategoria||999)-(b.ordenDentroDeCategoria||999));
    // Fila header de categoría con colSpan
    body.push([{
      content:cat.nombre.toUpperCase()+"   ("+cat.productos.length+")",
      colSpan:headRow.length,
      styles:{fillColor:[230,230,230],textColor:[26,26,26],fontStyle:"bold",fontSize:9,halign:"left",cellPadding:{top:3,bottom:3,left:6}}
    }]);
    cat.productos.forEach(p=>{
      const row=[
        p.nombre||"",
        p.descripcion||"",
        p.unidad||""
      ];
      if(showAlergenos){
        const ale=Array.isArray(p.alergenos)?p.alergenos.join(", "):"";
        row.push(ale);
      }
      if(showPrices){
        row.push(p.precio?fm(p.precio):"");
      }
      body.push(row);
    });
  });

  // Columnas con anchos según qué columnas hay
  const colStyles={0:{cellWidth:55,fontStyle:"bold"},1:{cellWidth:"auto"},2:{cellWidth:24,halign:"center"}};
  let colIdx=3;
  if(showAlergenos){colStyles[colIdx]={cellWidth:32,halign:"left",fontSize:8};colIdx++}
  if(showPrices){colStyles[colIdx]={cellWidth:24,halign:"right",fontStyle:"bold"}}

  pdf.autoTable({
    startY:y+1,
    head:[headRow],
    body:body,
    theme:"grid",
    headStyles:_REP_PDF_HEAD_STYLE,
    alternateRowStyles:_REP_PDF_ZEBRA,
    styles:{fontSize:8.5,cellPadding:2,valign:"middle"},
    columnStyles:colStyles,
    margin:{left:M,right:M}
  });

  _repPdfFooter(pdf,W,H);

  const fname="ListaPrecios_"+fechaIso+(cliente?"_"+_slugify(cliente).slice(0,20):"")+(showPrices?"_con-precios":"_sin-precios")+".pdf";
  pdf.save(fname);
}

// ─── v7.9.0.1: TOGGLE visibleEnListaPrecios + MOVER PRODUCTO + CRUD CATEGORÍAS ───
async function toggleVisibleEnListaPrecios(productId,checked){
  if(!productosCache||!productosCache[productId])return;
  try{
    const {db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"productos",productId),{visibleEnListaPrecios:!!checked,updatedAt:serverTimestamp(),...auditStamp()},{merge:true});
    productosCache[productId].visibleEnListaPrecios=!!checked;
    localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
  }catch(e){
    toast("Error guardando: "+(e?.message||e),"error");
    console.error("[toggleVisibleEnListaPrecios]",e);
    renderCatalogoProductos(); // revertir UI
  }
}

async function moverProductoACategoria(productId,nuevaCategoriaId){
  if(!productosCache||!productosCache[productId])return;
  if(!nuevaCategoriaId||!categoriasCache||!categoriasCache[nuevaCategoriaId])return;
  showLoader("Moviendo...");
  try{
    const {db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"productos",productId),{categoriaId:nuevaCategoriaId,updatedAt:serverTimestamp(),...auditStamp()},{merge:true});
    productosCache[productId].categoriaId=nuevaCategoriaId;
    localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
    hideLoader();
    toast("✅ Producto movido","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[moverProductoACategoria]",e);
  }
}

async function renombrarCategoria(catId){
  if(!categoriasCache||!categoriasCache[catId])return;
  const nuevoNombre=prompt("Nuevo nombre de la categoría:",categoriasCache[catId].nombre);
  if(!nuevoNombre||nuevoNombre.trim()===categoriasCache[catId].nombre)return;
  showLoader("Guardando...");
  try{
    const {db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"categorias",catId),{nombre:nuevoNombre.trim(),updatedAt:serverTimestamp(),...auditStamp()},{merge:true});
    categoriasCache[catId].nombre=nuevoNombre.trim();
    localStorage.setItem("gb_categorias_cache",JSON.stringify(categoriasCache));
    hideLoader();
    toast("✅ Categoría renombrada","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[renombrarCategoria]",e);
  }
}

async function eliminarCategoria(catId){
  if(!categoriasCache||!categoriasCache[catId])return;
  const cat=categoriasCache[catId];
  // Buscar productos de esta categoría
  const prodsEnCat=Object.values(productosCache||{}).filter(p=>p.categoriaId===catId);

  if(prodsEnCat.length>0){
    // Pedir destino
    const otrasCats=Object.values(categoriasCache).filter(c=>c.categoriaId!==catId).sort((a,b)=>(a.orden||999)-(b.orden||999));
    if(!otrasCats.length){toast("No hay otras categorías para reasignar","warn");return}
    let opciones="¿A qué categoría mover los "+prodsEnCat.length+" productos antes de eliminar \""+cat.nombre+"\"?\n\n";
    otrasCats.forEach((c,i)=>{opciones+=(i+1)+". "+c.nombre+"\n"});
    opciones+="\n(número, o cancelar)";
    const sel=prompt(opciones,"1");
    if(!sel)return;
    const idx=parseInt(sel,10)-1;
    if(isNaN(idx)||idx<0||idx>=otrasCats.length){toast("Selección inválida","warn");return}
    const destinoId=otrasCats[idx].categoriaId;
    if(!confirm("Vas a mover "+prodsEnCat.length+" productos a \""+otrasCats[idx].nombre+"\" y eliminar \""+cat.nombre+"\". ¿Continuar?"))return;

    showLoader("Reasignando productos...");
    try{
      const {db,doc,setDoc,deleteDoc,serverTimestamp}=window.fb;
      for(const p of prodsEnCat){
        await setDoc(doc(db,"productos",p.productId),{categoriaId:destinoId,updatedAt:serverTimestamp(),...auditStamp()},{merge:true});
        productosCache[p.productId].categoriaId=destinoId;
      }
      await deleteDoc(doc(db,"categorias",catId));
      delete categoriasCache[catId];
      localStorage.setItem("gb_productos_cache",JSON.stringify(productosCache));
      localStorage.setItem("gb_categorias_cache",JSON.stringify(categoriasCache));
      hideLoader();
      toast("✅ "+prodsEnCat.length+" productos movidos · categoría eliminada","success");
      renderCatalogoProductos();
    }catch(e){
      hideLoader();
      toast("Error: "+(e?.message||e),"error");
      console.error("[eliminarCategoria con reasign]",e);
    }
  }else{
    if(!confirm("Eliminar categoría \""+cat.nombre+"\" (sin productos)?"))return;
    showLoader("Eliminando...");
    try{
      const {db,doc,deleteDoc}=window.fb;
      await deleteDoc(doc(db,"categorias",catId));
      delete categoriasCache[catId];
      localStorage.setItem("gb_categorias_cache",JSON.stringify(categoriasCache));
      hideLoader();
      toast("✅ Categoría eliminada","success");
      renderCatalogoProductos();
    }catch(e){
      hideLoader();
      toast("Error: "+(e?.message||e),"error");
      console.error("[eliminarCategoria]",e);
    }
  }
}

// ─── v7.9.0.2: SUBIR/BORRAR FOTO DE PRODUCTO ───
let _catalogoFotoActiveProductId=null;

function subirFotoProducto(productId){
  if(!productId)return;
  _catalogoFotoActiveProductId=productId;
  const inp=$("catalogo-foto-input");
  if(!inp){toast("Input de archivo no encontrado","error");return}
  inp.value=""; // permite re-seleccionar mismo archivo
  inp.click();
}

async function _onCatalogoFotoSelected(ev){
  const productId=_catalogoFotoActiveProductId;
  _catalogoFotoActiveProductId=null;
  const file=ev.target.files&&ev.target.files[0];
  if(!file||!productId)return;
  // Validar tipo
  if(!file.type.startsWith("image/")){
    toast("El archivo debe ser una imagen","warn");
    return;
  }
  showLoader("Subiendo foto…");
  try{
    await uploadFotoProductoToCloud(productId,file);
    hideLoader();
    toast("✅ Foto guardada","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error subiendo foto: "+(e?.message||e),"error");
    console.error("[subirFotoProducto] falló",{productId,error:e});
  }
}

// ─── v7.9.0.2.1: BATCH UPLOAD de fotos (productId desde filename) ───
function iniciarBatchUploadFotos(){
  const inp=$("catalogo-foto-batch-input");
  if(!inp){toast("Input de batch no encontrado","error");return}
  inp.value="";
  inp.click();
}

async function _onCatalogoFotoBatchSelected(ev){
  const files=Array.from(ev.target.files||[]);
  if(!files.length)return;
  if(!productosCache||!Object.keys(productosCache).length){
    toast("Catálogo no migrado — migrá primero","warn");
    return;
  }
  // Resolver productId de cada filename (sin extensión, lowercase)
  const items=files.map(f=>{
    const base=f.name.replace(/\.[^/.]+$/,"").toLowerCase().trim();
    const productExists=!!productosCache[base];
    return {file:f,productId:base,productExists,nombre:productExists?productosCache[base].nombre:""};
  });
  const validos=items.filter(i=>i.productExists);
  const invalidos=items.filter(i=>!i.productExists);

  if(!validos.length){
    toast("Ninguno de los "+files.length+" archivos coincide con un productId del catálogo","warn",8000);
    if(invalidos.length){
      console.warn("[batch fotos] archivos sin match:",invalidos.map(i=>i.file.name));
    }
    return;
  }

  let mensaje="Vas a subir "+validos.length+" foto(s) a Firestore.\n\n";
  if(invalidos.length){
    mensaje+="⚠ "+invalidos.length+" archivo(s) NO coinciden con productos y se saltarán:\n";
    mensaje+=invalidos.slice(0,5).map(i=>"  - "+i.file.name).join("\n");
    if(invalidos.length>5)mensaje+="\n  ... y "+(invalidos.length-5)+" más";
    mensaje+="\n\n";
  }
  mensaje+="¿Continuar?";
  if(!confirm(mensaje))return;

  showLoader("Subiendo 0/"+validos.length+"…");
  let ok=0,fail=0;
  const errores=[];
  for(let i=0;i<validos.length;i++){
    const it=validos[i];
    showLoader("Subiendo "+(i+1)+"/"+validos.length+"… "+it.nombre);
    try{
      await uploadFotoProductoToCloud(it.productId,it.file);
      ok++;
    }catch(e){
      fail++;
      errores.push({productId:it.productId,error:e?.message||String(e)});
      console.error("[batch fotos] falló "+it.productId,e);
    }
  }
  hideLoader();
  let resumen="Batch terminado: "+ok+" subidas";
  if(fail>0)resumen+=", "+fail+" fallidas";
  if(invalidos.length>0)resumen+=", "+invalidos.length+" saltadas";
  toast((fail>0?"⚠ ":"✅ ")+resumen,fail>0?"warn":"success",8000);
  if(errores.length)console.error("[batch fotos] errores:",errores);
  renderCatalogoProductos();
}

async function borrarFotoProducto(productId){
  if(!productId||!productosCache||!productosCache[productId])return;
  if(!confirm("¿Eliminar la foto del producto \""+productosCache[productId].nombre+"\"?"))return;
  showLoader("Eliminando foto…");
  try{
    await eliminarFotoProductoFromCloud(productId);
    hideLoader();
    toast("Foto eliminada","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[borrarFotoProducto] falló",{productId,error:e});
  }
}

async function crearCategoria(){
  const nombre=prompt("Nombre de la nueva categoría:");
  if(!nombre||!nombre.trim())return;
  const slug=_slugify(nombre);
  if(!slug){toast("Nombre inválido","warn");return}
  if(categoriasCache&&categoriasCache[slug]){toast("Ya existe una categoría con ese nombre","warn");return}
  // Calcular orden = máximo + 1
  const maxOrden=Object.values(categoriasCache||{}).reduce((mx,c)=>Math.max(mx,c.orden||0),0);
  showLoader("Creando...");
  try{
    const {db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"categorias",slug),{
      categoriaId:slug,
      nombre:nombre.trim(),
      orden:maxOrden+10,
      visibleEnWeb:false,
      descripcion:null,
      activo:true,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp(),
      createdVia:"manual:editor",
      ...auditStamp()
    });
    if(!categoriasCache)categoriasCache={};
    categoriasCache[slug]={categoriaId:slug,nombre:nombre.trim(),orden:maxOrden+10,visibleEnWeb:false,activo:true};
    localStorage.setItem("gb_categorias_cache",JSON.stringify(categoriasCache));
    hideLoader();
    toast("✅ Categoría creada","success");
    renderCatalogoProductos();
  }catch(e){
    hideLoader();
    toast("Error: "+(e?.message||e),"error");
    console.error("[crearCategoria]",e);
  }
}

// ─── v7.9.4: banner de alerta si hay operaciones con error/colgadas ────
let _auditAlertCheckedAt=0;
async function _checkAuditAlertBanner(carteraListEl){
  if(!cloudOnline)return;
  // Cache 5 min para no consultar Firestore en cada renderCartera
  if(Date.now()-_auditAlertCheckedAt<5*60*1000)return;
  _auditAlertCheckedAt=Date.now();
  try{
    await fbReady();
    const{db,collection,getDocs,query,orderBy,limit}=window.fb;
    const q=query(collection(db,"operacionesLog"),orderBy("timestamp","desc"),limit(100));
    const snap=await getDocs(q);
    const cutoff=Date.now()-7*24*60*60*1000;
    const ahora=Date.now();
    let errores=0,colgados=0;
    snap.forEach(d=>{
      const L=d.data();
      const ts=L.timestamp&&L.timestamp.seconds?L.timestamp.seconds*1000:0;
      if(!ts||ts<cutoff)return;
      if(L.resultado==="error")errores++;
      else if(L.resultado==="intento"&&ahora-ts>5*60*1000)colgados++;
    });
    const total=errores+colgados;
    // Buscar/crear banner
    let banner=document.getElementById("cartera-audit-banner");
    if(total===0){
      if(banner)banner.remove();
      return;
    }
    if(!banner){
      banner=document.createElement("div");
      banner.id="cartera-audit-banner";
      banner.style.cssText="background:#FFF3E0;border:1px solid #FFCC80;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#E65100;display:flex;align-items:center;gap:10px;cursor:pointer";
      banner.onclick=()=>{if(typeof setMode==="function")setMode("herr-auditoria")};
      // Insertar al inicio del contenedor de cartera
      if(carteraListEl&&carteraListEl.parentNode){
        carteraListEl.parentNode.insertBefore(banner,carteraListEl);
      }
    }
    banner.innerHTML='⚠ <strong>'+total+' operación'+(total!==1?"es":"")+' sin completar</strong> en los últimos 7 días'+
      (errores>0?' · '+errores+' error'+(errores!==1?"es":""):"")+
      (colgados>0?' · '+colgados+' colgada'+(colgados!==1?"s":""):"")+
      '<span style="margin-left:auto;font-size:11px;color:#5D4037;text-decoration:underline">Ver auditoría →</span>';
  }catch(e){
    console.warn("[_checkAuditAlertBanner] no se pudo consultar:",e&&e.message);
  }
}
window._checkAuditAlertBanner=_checkAuditAlertBanner;
