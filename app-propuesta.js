// ═══════════════════════════════════════════════════════════
// app-propuesta.js · v4.12.1 · 2026-04-19
// Modo Propuesta: state, condiciones, notas, reposición,
// personal, sections, picker, menaje, save/load propuesta,
// PDF propuesta, propfinal flow.
// v4.12.1: computePropTotal — total real (menú+catering+menaje+personal+transporte)
// ═══════════════════════════════════════════════════════════

// ─── COMPUTE TOTAL DE PROPUESTA (mismo cálculo que el PDF) ──
// Reproduce la lógica de "TOTAL DEL SERVICIO" para que cualquier
// vista (dashboard, historial) tenga el mismo número que el PDF.
// Para propuestas con varias opciones, usa Opción A (igual que PDF).
function computePropTotal(q){
  if(!q)return 0;
  let totMenu=0,totCatering=0;
  (q.sections||[]).forEach(sec=>{
    // v7.8.4.2: secciones marcadas como alternativas (incluirEnTotal===false) no se suman
    if(sec.incluirEnTotal===false)return;
    const isCateringSec=/servicio\s*de\s*catering|coordinaci[oó]n/i.test(sec.name||"");
    (sec.options||[]).forEach(opt=>{
      if(opt.label==="Opción A"||sec.options.length===1){
        (opt.items||[]).forEach(it=>{
          const val=(it.price||0)*(it.qty||0);
          if(isCateringSec)totCatering+=val;else totMenu+=val;
        });
      }
    });
  });
  let totMenajeVal=0;
  (q.menaje||[]).forEach(m=>{const qty=parseFloat(m.qty)||0,p=parseFloat(m.price)||0;totMenajeVal+=qty*p});
  const pd=q.personalData||{meseros:{},auxiliares:{}};
  const pm=pd.meseros||{},pa=pd.auxiliares||{};
  const mSub=(parseFloat(pm.cantidad)||0)*((parseFloat(pm.valor4h)||0)+(parseFloat(pm.horasExtra)||0)*(parseFloat(pm.valorHoraExtra)||0));
  const aSub=(parseFloat(pa.cantidad)||0)*((parseFloat(pa.valor4h)||0)+(parseFloat(pa.horasExtra)||0)*(parseFloat(pa.valorHoraExtra)||0));
  const totPersonal=mSub+aSub;
  let totTransp=0;
  if(q.cityType==="Otra")totTransp=parseInt(q.trCustom)||0;
  else if(q.cityType&&TR[q.cityType])totTransp=TR[q.cityType].p;
  return totMenu+totCatering+totMenajeVal+totPersonal+totTransp;
}

const PROP_SECTION_NAMES=["Entradas","Plato Fuerte","Acompañamientos","Postres","Bebidas","Logística"];
let propSections=[];
// v7.9.7 F2: lista de despachos del evento (vacía = modo legacy 1 entrega)
let currentDespachos=[];
const DEFAULT_MENAJE=["Platos","Cubiertos","Vasos","Copas / Cristalería","Mantelería","Servilletas","Bandejas","Charoles","Hielera","Jarras"];
// v7.9.8: menaje con opciones. menajeOptions es el array de opciones (A/B/...).
// menajeItems y reposicionData siguen siendo variables globales pero AHORA son
// ESPEJO de la opción activa: cuando se cambia de opción, ambas se reasignan
// con _syncActiveMenajeRefs() para que el resto del código (renderMenaje,
// addMenajeItem, updReposicion, computePropTotal, genPropPDF, etc.) siga
// funcionando sin tocar todos los sitios.
let menajeOptions=[]; // [{id, label, items:[{id,name,qty,price}]}]
let activeMenajeOptionId=null;
let reposicionByOption={}; // {opcionId: {name: precio}}
let menajeItems=[];     // espejo: items de la opción activa
let tipoServicio="";
let personalData={
  meseros:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""},
  auxiliares:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""}
};
let reposicionData={};
let condicionesData={};
let aperturaFrase="Una experiencia culinaria diseñada a medida para su evento.";
let fechaVencimiento="";
let firmaProp="jp";
let currentPropNumber=null;
let priceMemoryCache={reposicion:{},menaje:{},personal:{}};

const DEFAULT_CONDICIONES={
  c1:"Cancelaciones con 7 o más días calendario de anticipación al evento tendrán derecho a la devolución del 50% del anticipo pagado. Cancelaciones entre 3 y 6 días antes del evento implican la pérdida total del anticipo. Cancelaciones con 48 horas o menos de anticipación implican el pago del 100% del valor total del evento.",
  c2:"El cliente podrá modificar la cantidad de comensales hasta en un 10% (incremento o disminución) con máximo 48 horas antes del evento. La cantidad confirmada en esa fecha será la cantidad facturada, se consuma o no la totalidad de los alimentos.",
  c3:"Por normas de manipulación y seguridad alimentaria, todos los alimentos remanentes del evento quedan en las instalaciones del cliente al momento del retiro. Gourmet Bites no transporta alimentos preparados después del servicio.",
  c4:"Los tiempos de montaje se acuerdan directamente con el cliente según el tipo de evento. Para almuerzos de trabajo, el montaje típicamente se realiza con 2 horas de antelación al inicio del servicio, y el retiro se efectúa 1 hora después de finalizado el servicio.",
  c5:"El menaje entregado queda bajo responsabilidad del cliente durante el evento. Al iniciar el servicio se entregará inventario firmado. Los daños causados por el personal de servicio de Gourmet Bites (meseros y auxiliares) serán asumidos por Gourmet Bites. Los daños causados por los invitados o por terceros ajenos al personal de Gourmet Bites serán cobrados al cliente conforme a la tabla de reposición.",
  c6:"Para eventos de más de 100 personas, Gourmet Bites ofrece sin costo una prueba del menú seleccionado, una vez confirmado el evento y pagado el anticipo. Para eventos de menos de 100 personas, la prueba es opcional y tiene un costo equivalente al valor unitario del producto más el transporte, a coordinar con el cliente una vez confirmado el evento.",
  c7:"Gourmet Bites by Andrade Matuk opera bajo Juan Pablo Andrade Matuk — Persona Natural No Responsable de IVA (C.C. 1.032.876.662). Los valores cotizados no incluyen IVA. Se emite factura electrónica sin discriminación del impuesto conforme al régimen tributario aplicable. Para reservar la fecha se requiere el pago de un anticipo del 50% del valor total del servicio. El 50% restante deberá ser cancelado a más tardar 24 horas después de finalizado el evento."
};
const CONDICIONES_TITULOS={
  c1:"Política de Cancelación",c2:"Confirmación de Comensales",c3:"Manejo de Alimentos Remanentes",
  c4:"Montaje y Retiro",c5:"Responsabilidad por Menaje",c6:"Prueba de Comida",c7:"Responsable Tributario y Pagos"
};

function initCondiciones(){
  Object.keys(DEFAULT_CONDICIONES).forEach(k=>{if(!condicionesData[k])condicionesData[k]=DEFAULT_CONDICIONES[k]});
  Object.keys(condicionesData).forEach(k=>{
    if(typeof condicionesData[k]==="string"&&condicionesData[k].includes("1.032.876.667")){
      condicionesData[k]=condicionesData[k].replace(/1\.032\.876\.667/g,"1.032.876.662");
    }
  });
}
function renderCondiciones(){
  initCondiciones();
  $("cond-list").innerHTML=Object.keys(DEFAULT_CONDICIONES).map((k,i)=>{
    const n=i+1;
    return '<div class="cond-sec"><div class="cond-sec-tit"><span class="num">'+n+'</span>'+CONDICIONES_TITULOS[k]+'<button class="cond-reset" onclick="resetCondicion(\''+k+'\')">↻ Restablecer</button></div><textarea class="cond-textarea" onchange="condicionesData[\''+k+'\']=this.value">'+(condicionesData[k]||DEFAULT_CONDICIONES[k])+'</textarea></div>';
  }).join("");
}
function resetCondicion(k){condicionesData[k]=DEFAULT_CONDICIONES[k];renderCondiciones()}
function resetAllConditions(){
  confirmModal({
    title:"Restablecer cláusulas",
    body:"¿Restablecer todas las cláusulas a sus valores por defecto?",
    okLabel:"Restablecer",
    tone:"warn",
    onOk:()=>{
      Object.keys(DEFAULT_CONDICIONES).forEach(k=>condicionesData[k]=DEFAULT_CONDICIONES[k]);
      renderCondiciones();
    }
  });
}

function renderReposicion(){
  if(!$("repo-list"))return;
  const items=menajeItems.filter(m=>m.name&&(m.qty||m.price)).map(m=>m.name);
  const uniqueItems=[...new Set(items)];
  const opLabel=(menajeOptions.find(o=>o.id===activeMenajeOptionId)||{}).label||"";
  const header=menajeOptions.length>1
    ?'<div style="font-size:11px;color:var(--gb-gold-500);font-weight:600;padding:4px 8px;margin-bottom:4px">📋 Reposición — '+opLabel+'</div>'
    :"";
  if(!uniqueItems.length){
    $("repo-list").innerHTML=header+'<div style="font-size:11px;color:var(--gb-neutral-400);padding:8px;text-align:center;font-style:italic">Agrega items al menaje arriba para que aparezcan aquí con sus precios de reposición.</div>';
    return;
  }
  $("repo-list").innerHTML=header+uniqueItems.map(name=>{
    const curVal=reposicionData[name]||"";
    const sugVal=priceMemoryCache.reposicion[name]||"";
    const isSugg=!curVal&&sugVal;
    const displayVal=curVal||sugVal;
    return '<div class="repo-item"><span class="r-name">'+name+'</span><input type="number" class="r-input'+(isSugg?' sug':'')+'" placeholder="0" value="'+displayVal+'" onchange="updReposicion(\''+name.replace(/'/g,"\\'")+'\',this.value)">'+(isSugg?'<span class="repo-hint">↑ sugerido</span>':'')+'</div>';
  }).join("");
}
function updReposicion(name,val){
  reposicionData[name]=val;
  // v7.9.8: persistir también en reposicionByOption para la opción activa
  if(activeMenajeOptionId){
    if(!reposicionByOption[activeMenajeOptionId])reposicionByOption[activeMenajeOptionId]={};
    reposicionByOption[activeMenajeOptionId][name]=val;
  }
  renderReposicion();
}

// v7.9.8 helpers de gestión de opciones de menaje
function _syncActiveMenajeRefs(){
  // Asigna menajeItems y reposicionData para que apunten a la opción activa.
  // Las dos variables globales siguen siendo el "puntero corto" usado por
  // renderMenaje, addMenajeItem, computePropTotal, etc.
  const activeOp=menajeOptions.find(o=>o.id===activeMenajeOptionId);
  menajeItems=activeOp?activeOp.items:[];
  reposicionData=activeMenajeOptionId&&reposicionByOption[activeMenajeOptionId]
    ?reposicionByOption[activeMenajeOptionId]
    :{};
}

function addMenajeOption(){
  const letters="ABCDEFGH";
  const nextLabel="Opción "+(letters[menajeOptions.length]||menajeOptions.length+1);
  const newId="op"+(letters[menajeOptions.length]||menajeOptions.length+1)+"_"+Date.now();
  // Por defecto la nueva opción copia los nombres de items de la activa (sin cant/precio)
  // para facilitar comparar. Si Luis quiere otra cosa, edita.
  const baseItems=(menajeItems||[]).map((m,i)=>({id:"m"+i+"_"+Date.now(),name:m.name,qty:"",price:""}));
  menajeOptions.push({id:newId,label:nextLabel,items:baseItems});
  reposicionByOption[newId]={};
  activeMenajeOptionId=newId;
  _syncActiveMenajeRefs();
  renderMenaje();
}

function duplicateMenajeOption(opId){
  const op=menajeOptions.find(o=>o.id===opId);
  if(!op)return;
  const letters="ABCDEFGH";
  const newLabel="Opción "+(letters[menajeOptions.length]||menajeOptions.length+1);
  const newId="op"+(letters[menajeOptions.length]||menajeOptions.length+1)+"_"+Date.now();
  // Copia profunda de items (incluye cant y precio)
  const clonedItems=op.items.map((m,i)=>({id:"m"+i+"_"+Date.now(),name:m.name,qty:m.qty,price:m.price}));
  menajeOptions.push({id:newId,label:newLabel,items:clonedItems});
  // Copiar también los valores de reposición de la opción origen
  reposicionByOption[newId]={...(reposicionByOption[opId]||{})};
  activeMenajeOptionId=newId;
  _syncActiveMenajeRefs();
  renderMenaje();
}

function delMenajeOption(opId){
  if(menajeOptions.length<=1){
    if(typeof toast==="function")toast("Debe quedar al menos 1 opción de menaje","warn");
    return;
  }
  if(!confirm("¿Eliminar esta opción de menaje y todos sus items? (No se puede deshacer)"))return;
  menajeOptions=menajeOptions.filter(o=>o.id!==opId);
  delete reposicionByOption[opId];
  if(activeMenajeOptionId===opId){
    activeMenajeOptionId=menajeOptions[0].id;
  }
  _syncActiveMenajeRefs();
  renderMenaje();
}

function setActiveMenajeOption(opId){
  if(!menajeOptions.find(o=>o.id===opId))return;
  activeMenajeOptionId=opId;
  _syncActiveMenajeRefs();
  renderMenaje();
}

function updMenajeOptionLabel(opId,label){
  const op=menajeOptions.find(o=>o.id===opId);
  if(op)op.label=label;
  // No re-render para no romper el foco del input
}

function onFechaVencChange(){fechaVencimiento=$("fp-fecha-venc").value}
function setDefaultFechaVenc(){
  const d=new Date();d.setDate(d.getDate()+15);
  const iso=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  $("fp-fecha-venc").value=iso;fechaVencimiento=iso;
}

async function loadPriceMemory(){
  if(!cloudOnline)return;
  try{
    const {db,doc,getDoc}=window.fb;
    const snap=await getDoc(doc(db,"config","price_memory"));
    if(snap.exists()){const d=snap.data();priceMemoryCache={reposicion:d.reposicion||{},menaje:d.menaje||{},personal:d.personal||{}}}
  }catch(e){console.warn("loadPriceMemory failed",e)}
}
async function savePriceMemory(){
  if(!cloudOnline)return;
  try{
    const {db,doc,setDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"config","price_memory"),{...priceMemoryCache,updatedAt:serverTimestamp()});
  }catch(e){console.warn("savePriceMemory failed",e)}
}
function rememberPricesFromProposal(){
  menajeItems.forEach(m=>{if(m.name&&m.price)priceMemoryCache.menaje[m.name]=m.price});
  Object.keys(reposicionData).forEach(k=>{if(reposicionData[k])priceMemoryCache.reposicion[k]=reposicionData[k]});
  if(personalData.meseros.valor4h)priceMemoryCache.personal.mesero_4h=personalData.meseros.valor4h;
  if(personalData.meseros.valorHoraExtra)priceMemoryCache.personal.mesero_hx=personalData.meseros.valorHoraExtra;
  if(personalData.auxiliares.valor4h)priceMemoryCache.personal.auxiliar_4h=personalData.auxiliares.valor4h;
  if(personalData.auxiliares.valorHoraExtra)priceMemoryCache.personal.auxiliar_hx=personalData.auxiliares.valorHoraExtra;
  savePriceMemory();
}
function loadLastPersonalRates(){
  try{
    const saved=JSON.parse(localStorage.getItem("gb_personal_rates")||"{}");
    if(saved&&saved.meseros){Object.keys(saved.meseros).forEach(k=>{if(saved.meseros[k]&&!personalData.meseros[k])personalData.meseros[k]=saved.meseros[k]})}
    if(saved&&saved.auxiliares){Object.keys(saved.auxiliares).forEach(k=>{if(saved.auxiliares[k]&&!personalData.auxiliares[k])personalData.auxiliares[k]=saved.auxiliares[k]})}
  }catch(e){console.warn("[loadLastPersonalRates]",e)}
}
function savePersonalRates(){
  try{
    const toSave={
      meseros:{valor4h:personalData.meseros.valor4h,valorHoraExtra:personalData.meseros.valorHoraExtra},
      auxiliares:{valor4h:personalData.auxiliares.valor4h,valorHoraExtra:personalData.auxiliares.valorHoraExtra}
    };
    localStorage.setItem("gb_personal_rates",JSON.stringify(toSave));
  }catch(e){console.warn("[savePersonalRates]",e)}
}

function suggestMeseros(){
  const pax=parseInt($("fp-pers").value)||0;
  if(!pax||!tipoServicio)return 0;
  if(tipoServicio==="Bufé")return Math.ceil(pax/40);
  if(tipoServicio==="Emplatado")return Math.ceil(pax/22);
  if(tipoServicio==="Coctel")return Math.ceil(pax/30);
  return 0;
}
function setTipoServ(v){
  tipoServicio=v;
  document.querySelectorAll("#tipo-serv-sel .tipo-serv-opt").forEach(el=>el.classList.toggle("act",el.dataset.val===v));
  if(!personalData.meseros.cantidad){const sug=suggestMeseros();if(sug)personalData.meseros.cantidad=sug}
  renderPersonal();
}
function onPaxChange(){if(tipoServicio)renderPersonal()}

function renderPersonal(){
  const pax=parseInt($("fp-pers").value)||0;
  const sugM=suggestMeseros();
  const m=personalData.meseros,a=personalData.auxiliares;
  const mSub=(parseFloat(m.cantidad)||0)*((parseFloat(m.valor4h)||0)+(parseFloat(m.horasExtra)||0)*(parseFloat(m.valorHoraExtra)||0));
  const aSub=(parseFloat(a.cantidad)||0)*((parseFloat(a.valor4h)||0)+(parseFloat(a.horasExtra)||0)*(parseFloat(a.valorHoraExtra)||0));
  $("personal-content").innerHTML=`
    <div class="personal-row">
      <div class="personal-row-title"><span>👨‍💼 Meseros</span>${sugM&&tipoServicio?'<span class="sugg">sugerencia: '+sugM+'</span>':''}</div>
      <div class="pf-field"><label>Cantidad</label><input type="number" step="1" min="0" value="${m.cantidad}" onchange="updPersonal('meseros','cantidad',this.value)"></div>
      <div class="pf-field"><label>Valor 4 horas c/u</label><input type="number" value="${m.valor4h}" placeholder="80000" onchange="updPersonal('meseros','valor4h',this.value)"></div>
      <div class="pf-field"><label>Horas extra</label><input type="number" step="0.5" value="${m.horasExtra}" onchange="updPersonal('meseros','horasExtra',this.value)"></div>
      <div class="pf-field"><label>Valor hora extra c/u</label><input type="number" value="${m.valorHoraExtra}" onchange="updPersonal('meseros','valorHoraExtra',this.value)"></div>
      ${mSub?'<div class="pf-sub"><span>Subtotal meseros</span><span>'+fm(mSub)+'</span></div>':''}
    </div>
    <div class="personal-row">
      <div class="personal-row-title"><span>👷 Auxiliares</span></div>
      <div class="pf-field"><label>Cantidad</label><input type="number" step="1" min="0" value="${a.cantidad}" onchange="updPersonal('auxiliares','cantidad',this.value)"></div>
      <div class="pf-field"><label>Valor 4 horas c/u</label><input type="number" value="${a.valor4h}" onchange="updPersonal('auxiliares','valor4h',this.value)"></div>
      <div class="pf-field"><label>Horas extra</label><input type="number" step="0.5" value="${a.horasExtra}" onchange="updPersonal('auxiliares','horasExtra',this.value)"></div>
      <div class="pf-field"><label>Valor hora extra c/u</label><input type="number" value="${a.valorHoraExtra}" onchange="updPersonal('auxiliares','valorHoraExtra',this.value)"></div>
      ${aSub?'<div class="pf-sub"><span>Subtotal auxiliares</span><span>'+fm(aSub)+'</span></div>':''}
    </div>
  `;
}
function updPersonal(kind,field,val){
  personalData[kind][field]=val;
  if(field==="valor4h"||field==="valorHoraExtra")savePersonalRates();
  renderPersonal();
}

function suggestQty(unit,pax){
  if(!pax)return 1;
  const u=(unit||"").toLowerCase();
  if(/charol|bandeja|evento|jarra/.test(u))return 1;
  if(/^l$|^m$|^s$|42x26|33x22|15\.5x20/i.test(unit))return 1;
  if(/individual|porción|por plato|c\/u|1 unidad|1 pincho|2 pinchos/.test(u))return pax;
  const m10=u.match(/10\s*(personas|unidades|porciones|porc|uds)/);if(m10)return Math.round((pax/10)*10)/10;
  const m12=u.match(/12\s*(personas|unidades|porciones|porc|uds)/);if(m12)return Math.round((pax/12)*10)/10;
  const m15=u.match(/15\s*(personas|unidades|porciones|porc|uds)/);if(m15)return Math.round((pax/15)*10)/10;
  const m20=u.match(/20\s*(personas|unidades|porciones|porc|uds)/);if(m20)return Math.round((pax/20)*10)/10;
  const m30=u.match(/30\s*(personas|unidades|porciones|porc|uds)/);if(m30)return Math.round((pax/30)*10)/10;
  const m6=u.match(/6\s*(personas|unidades|porciones|porc|uds)/);if(m6)return Math.round((pax/6)*10)/10;
  const m8=u.match(/8\s*(personas|unidades|porciones|porc|uds)/);if(m8)return Math.round((pax/8)*10)/10;
  if(/libra|lb|kg|gr|media/.test(u))return 1;
  return pax;
}

function initProp(){
  if(!propSections.length&&!menajeOptions.length){
    // v7.9.8: inicializa con una única opción "Opción A" con los defaults
    const defaultItems=DEFAULT_MENAJE.map((n,i)=>({id:"m"+i,name:n,qty:"",price:""}));
    menajeOptions=[{id:"opA_"+Date.now(),label:"Opción A",items:defaultItems}];
    activeMenajeOptionId=menajeOptions[0].id;
    reposicionByOption={};
    reposicionByOption[activeMenajeOptionId]={};
    _syncActiveMenajeRefs();
    renderMenaje();
  }
  loadLastPersonalRates();
  renderPersonal();
  initCondiciones();
  renderCondiciones();
  renderReposicion();
  applyPriceMemorySuggestions();
  if(!$("fp-fecha-venc").value)setDefaultFechaVenc();
  if(!$("fp-apertura").value.trim())$("fp-apertura").value=aperturaFrase;
}

function applyPriceMemorySuggestions(){
  if(!personalData.meseros.valor4h&&priceMemoryCache.personal.mesero_4h)personalData.meseros.valor4h=priceMemoryCache.personal.mesero_4h;
  if(!personalData.meseros.valorHoraExtra&&priceMemoryCache.personal.mesero_hx)personalData.meseros.valorHoraExtra=priceMemoryCache.personal.mesero_hx;
  if(!personalData.auxiliares.valor4h&&priceMemoryCache.personal.auxiliar_4h)personalData.auxiliares.valor4h=priceMemoryCache.personal.auxiliar_4h;
  if(!personalData.auxiliares.valorHoraExtra&&priceMemoryCache.personal.auxiliar_hx)personalData.auxiliares.valorHoraExtra=priceMemoryCache.personal.auxiliar_hx;
  renderPersonal();
}

function addPropSection(){
  const name=prompt("Nombre de sección:\n(Ej: "+PROP_SECTION_NAMES.filter(n=>!propSections.find(s=>s.name===n)).join(", ")+")");
  if(!name)return;
  propSections.push({id:"ps"+Date.now(),name,incluirEnTotal:true,options:[{id:"po"+Date.now(),label:"Opción A",items:[]}]});
  renderPropSections();
}
// v7.8.4.2: toggle "Incluir en TOTAL del servicio" para marcar secciones alternativas
function togglePropSecIncluir(si){
  const sec=propSections[si];
  if(!sec)return;
  sec.incluirEnTotal=(sec.incluirEnTotal===false)?true:false;
  renderPropSections();
}

function renderPropSections(){
  const hasMulti=propSections.some(s=>s.options.length>1);
  const avisoHTML=hasMulti
    ?'<div class="prop-info-box"><div class="pib-title">Esta propuesta tiene varias opciones</div>Esta propuesta contiene varias opciones para que tu cliente escoja. Una vez el cliente confirme su selección en cada sección, genera una <strong>Propuesta Final</strong> con los ítems definitivos desde el Historial — ese será el documento que el cliente firma y aprueba formalmente para reservar la fecha.</div>'
    :'';
  $("prop-sections").innerHTML=avisoHTML+propSections.map((sec,si)=>{
    const optLetters="ABCDEFGH";
    // v7.8.4.2: toggle "Incluir en TOTAL" — secciones alternativas no se suman
    const incluir=(sec.incluirEnTotal!==false);
    const toggleHTML='<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:500;color:'+(incluir?"var(--gb-neutral-500)":"#b91c1c")+';cursor:pointer;user-select:none;margin-right:10px" title="Si se desmarca, esta sección NO se sumará al TOTAL DEL SERVICIO (queda como alternativa)"><input type="checkbox" '+(incluir?"checked":"")+' onchange="togglePropSecIncluir('+si+')" style="cursor:pointer">'+(incluir?"Incluir en TOTAL":"⚠️ NO suma al total")+'</label>';
    const altBadge=incluir?"":'<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:.5px;margin-left:8px">ALTERNATIVA</span>';
    const secStyle=incluir?"":'opacity:.75;border-left:3px solid #b91c1c';
    // v7.9.8.4: nota/descripción por sección (opcional). Se muestra en el PDF debajo del título de sección.
    const notaVal=(sec.nota||"");
    const notaHTML='<textarea placeholder="Nota o descripción de la sección (opcional) — se muestra en la propuesta debajo del título" style="width:100%;box-sizing:border-box;margin:0 0 8px;padding:6px 8px;border:1px solid var(--gb-neutral-200);border-radius:6px;font-size:11px;font-family:inherit;resize:vertical;min-height:34px;color:var(--gb-neutral-600)" onchange="updPropSecNota('+si+',this.value)">'+h(notaVal)+'</textarea>';
    return'<div class="prop-sec" style="'+secStyle+'"><div class="sec-head"><span class="sec-title">'+sec.name+altBadge+'</span><div style="display:flex;align-items:center">'+toggleHTML+'<button class="del-btn" onclick="delPropSec('+si+')" title="Eliminar sección">×</button></div></div>'+
    notaHTML+
    sec.options.map((opt,oi)=>{
      const sub=opt.items.reduce((s,it)=>s+(it.price||0)*(it.qty||0),0);
      return'<div class="opt-card"><div class="opt-head"><span class="opt-label">'+opt.label+'</span><div><span class="opt-sub">'+fm(sub)+'</span><button class="del-btn" style="font-size:14px" onclick="delPropOpt('+si+','+oi+')">×</button></div></div>'+
      opt.items.map((it,ii)=>{
        const itSub=(it.price||0)*(it.qty||0);
        // v7.9.7 F3: dropdown de asignación a despacho (solo visible si hay >=2 despachos)
        const despachosUI=(Array.isArray(currentDespachos)&&currentDespachos.length>=2)?(()=>{
          const cur=it.assignedTo||"all";
          let opts='<option value="all"'+(cur==="all"?" selected":"")+'>Todos</option>';
          currentDespachos.forEach((d,di)=>{
            const lbl=d.notas?("D"+(di+1)+" · "+d.notas.slice(0,18)):("Despacho "+(di+1));
            opts+='<option value="'+d.id+'"'+(cur===d.id?" selected":"")+'>'+lbl.replace(/"/g,"&quot;")+'</option>';
          });
          return '<select title="Asignar a despacho" style="font-size:10.5px;padding:2px 4px;border:1px solid #FFB300;border-radius:4px;background:#FFF8E1;max-width:130px" onchange="updPropItem('+si+','+oi+','+ii+',\'assignedTo\',this.value)">'+opts+'</select>';
        })():"";
        return '<div class="opt-item" style="flex-wrap:wrap"><div style="flex:1;min-width:120px"><div style="font-weight:600;font-size:12px">'+it.name+'</div>'+(it.desc?'<div style="font-size:10px;color:var(--gb-neutral-400)">'+it.desc+'</div>':'')+(it.unit?'<div style="font-size:9px;color:var(--gb-neutral-500);font-style:italic">'+it.unit+'</div>':'')+'</div><input type="number" step="0.1" min="0" style="width:50px;padding:3px 6px;border:1px solid var(--gb-neutral-200);border-radius:4px;text-align:center;font-size:12px" value="'+(it.qty||"")+'" title="Cantidad" onchange="updPropItem('+si+','+oi+','+ii+',\'qty\',+this.value)"><input type="number" style="width:75px;padding:3px 6px;border:1px solid var(--gb-neutral-200);border-radius:4px;text-align:right;font-size:11px" value="'+(it.price||0)+'" title="Precio unitario" onchange="updPropItem('+si+','+oi+','+ii+',\'price\',+this.value)"><span style="width:80px;text-align:right;font-size:12px;font-weight:700">'+fm(itSub)+'</span>'+despachosUI+'<button class="del-btn" style="font-size:14px" onclick="delPropItem('+si+','+oi+','+ii+')">×</button></div>';
      }).join("")+
      '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn bo" style="font-size:10px;padding:4px 10px" onclick="openPicker('+si+','+oi+')">+ Catálogo</button><button class="btn bo" style="font-size:10px;padding:4px 10px" onclick="addPropItemCustom('+si+','+oi+')">+ Custom</button></div></div>'
    }).join("")+
    '<button class="btn bo" style="font-size:11px;margin-top:8px" onclick="addPropOpt('+si+')">+ Opción '+(optLetters[sec.options.length]||sec.options.length+1)+'</button></div>'
  }).join("")
}

function delPropSec(si){
  const nombre=propSections[si]&&propSections[si].name||"";
  confirmModal({
    title:"Eliminar sección",
    body:"¿Eliminar sección <strong>"+h(nombre)+"</strong>?",
    okLabel:"Eliminar",
    tone:"warn",
    onOk:()=>{propSections.splice(si,1);renderPropSections()}
  });
}
// v7.9.8.4: actualiza nota/descripción de la sección (sin re-render: onchange dispara al perder foco)
function updPropSecNota(si,val){if(propSections[si])propSections[si].nota=val}
function addPropOpt(si){const letters="ABCDEFGH";const sec=propSections[si];sec.options.push({id:"po"+Date.now(),label:"Opción "+(letters[sec.options.length]||sec.options.length+1),items:[]});renderPropSections()}
function delPropOpt(si,oi){propSections[si].options.splice(oi,1);renderPropSections()}

// ─── v7.9.7 F2: DESPACHOS MÚLTIPLES ────────────────────────
// Cada despacho es un objeto {id, fechaHora, direccion?, transporteCosto, notas, status}.
// Si currentDespachos vacío → modo legacy (1 entrega derivada de fp-date + fp-hora-entrega).

function addDespacho(){
  // Default: hereda fecha+hora de "Datos del Evento" si están, sino vacío.
  const fechaBase=$("fp-date")?.value||"";
  const horaBase=$("fp-hora-entrega")?.value||"09:00";
  const fechaHora=fechaBase?(fechaBase+"T"+(horaBase||"09:00")):"";
  // Transporte: hereda del campo personalizado si existe
  const trBase=parseFloat($("fp-tr-custom")?.value||0)||0;
  currentDespachos.push({
    id:"desp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
    fechaHora,
    direccion:null, // null = hereda del evento (fp-dir)
    transporteCosto:trBase,
    notas:"",
    status:"pendiente"
  });
  renderDespachos();
  // v7.9.7 F3: refrescar dropdowns de asignación en items
  if(typeof renderPropSections==="function"&&propSections.length)renderPropSections();
}

function removeDespacho(id){
  const idx=currentDespachos.findIndex(d=>d.id===id);
  if(idx<0)return;
  if(currentDespachos[idx].status&&currentDespachos[idx].status!=="pendiente"){
    if(!confirm("Este despacho ya está en estado '"+currentDespachos[idx].status+"'. ¿Eliminar igual?"))return;
  }
  const removedId=currentDespachos[idx].id;
  currentDespachos.splice(idx,1);
  // v7.9.7 F3: si algún item estaba asignado a este despacho, reset a "all"
  if(propSections.length){
    propSections.forEach(sec=>sec.options.forEach(opt=>opt.items.forEach(it=>{
      if(it.assignedTo===removedId)it.assignedTo="all";
    })));
  }
  renderDespachos();
  if(typeof renderPropSections==="function"&&propSections.length)renderPropSections();
}

function updateDespachoField(id,field,value){
  const d=currentDespachos.find(x=>x.id===id);
  if(!d)return;
  if(field==="transporteCosto")d[field]=parseFloat(value)||0;
  else d[field]=value;
}

function toggleDespachoDireccion(id){
  const d=currentDespachos.find(x=>x.id===id);
  if(!d)return;
  if(d.direccion){
    d.direccion=null;
  }else{
    d.direccion={dir:"",city:"",cityType:"",trCustom:""};
  }
  renderDespachos();
}

function updateDespachoDireccionField(id,field,value){
  const d=currentDespachos.find(x=>x.id===id);
  if(!d||!d.direccion)return;
  d.direccion[field]=value;
}

function renderDespachos(){
  const listEl=$("fp-despachos-list");
  const emptyEl=$("fp-despachos-empty");
  if(!listEl)return;
  if(!currentDespachos.length){
    listEl.innerHTML="";
    if(emptyEl)emptyEl.style.display="block";
    return;
  }
  if(emptyEl)emptyEl.style.display="none";
  listEl.innerHTML=currentDespachos.map((d,i)=>{
    const num=i+1;
    const fhVal=d.fechaHora||"";
    const tieneDirPropia=!!d.direccion;
    return ''+
      '<div style="background:#fff;border:1px solid #FFB300;border-radius:8px;padding:10px 12px;margin-bottom:8px">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap">'+
          '<div style="font-weight:700;font-size:12.5px;color:#E65100">Despacho '+num+'</div>'+
          '<button type="button" onclick="removeDespacho(\''+d.id+'\')" style="background:transparent;border:1px solid #EF9A9A;color:#C62828;padding:3px 9px;font-size:11px;border-radius:5px;cursor:pointer;font-family:var(--gb-font-body)">🗑️ Eliminar</button>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'+
          '<div style="flex:1;min-width:180px">'+
            '<label class="flbl">Fecha y hora</label>'+
            '<input class="fin" type="datetime-local" value="'+h(fhVal)+'" onchange="updateDespachoField(\''+d.id+'\',\'fechaHora\',this.value)">'+
          '</div>'+
          '<div style="flex:0 0 130px">'+
            '<label class="flbl">Transporte $</label>'+
            '<input class="fin" type="number" min="0" value="'+(d.transporteCosto||0)+'" onchange="updateDespachoField(\''+d.id+'\',\'transporteCosto\',this.value)">'+
          '</div>'+
        '</div>'+
        '<div style="margin-bottom:8px">'+
          '<label class="flbl">Notas del despacho (opcional)</label>'+
          '<input class="fin" type="text" placeholder="Ej: Refrigerio AM · Día 1" value="'+h(d.notas||"")+'" onchange="updateDespachoField(\''+d.id+'\',\'notas\',this.value)">'+
        '</div>'+
        '<div style="margin-bottom:0">'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#5D4037;cursor:pointer">'+
            '<input type="checkbox" '+(tieneDirPropia?"checked":"")+' onchange="toggleDespachoDireccion(\''+d.id+'\')" style="accent-color:#FB8C00"> Dirección distinta a la del evento'+
          '</label>'+
          (tieneDirPropia?(
            '<div style="margin-top:8px;padding:8px;background:#FFF8E1;border-radius:6px">'+
              '<input class="fin" type="text" placeholder="Dirección de este despacho" value="'+h(d.direccion.dir||"")+'" onchange="updateDespachoDireccionField(\''+d.id+'\',\'dir\',this.value)">'+
            '</div>'
          ):"")+
        '</div>'+
      '</div>';
  }).join("");
}

// Llamada por savePropQuote (hook ya existente en F1).
// Devuelve currentDespachos si hay ≥1, sino undefined → modo legacy.
function readDespachosFromForm(){
  if(!Array.isArray(currentDespachos)||!currentDespachos.length)return undefined;
  // Validación mínima: cada despacho debe tener fechaHora
  return currentDespachos
    .filter(d=>d&&d.fechaHora)
    .map(d=>({
      id:d.id,
      fechaHora:d.fechaHora,
      direccion:d.direccion||null,
      transporteCosto:parseFloat(d.transporteCosto)||0,
      notas:(d.notas||"").slice(0,200),
      status:d.status||"pendiente"
    }));
}

// Cargar despachos al editar una propuesta existente.
function loadDespachosFromDoc(q){
  if(q&&Array.isArray(q.despachos)&&q.despachos.length){
    currentDespachos=q.despachos.map(d=>({...d}));
  }else{
    currentDespachos=[];
  }
  renderDespachos();
}

function resetDespachos(){
  currentDespachos=[];
  renderDespachos();
}

// ─── PRODUCT PICKER ────────────────────────────────────────
let pickerTarget=null;let pkCat="Todas";
function openPicker(si,oi){pickerTarget={si,oi};pkCat="Todas";$("pk-search").value="";$("picker-modal").classList.remove("hidden");renderPicker();$("pk-search").focus()}
function closePicker(){$("picker-modal").classList.add("hidden");pickerTarget=null}
function renderPicker(){
  const s=($("pk-search").value||"").toLowerCase();
  const showCustom=(pkCat==="Todas"||pkCat==="Custom guardados");
  const catalogMatches=C.filter(p=>(pkCat==="Todas"||p.c===pkCat)&&(!s||p.n.toLowerCase().includes(s)||p.d.toLowerCase().includes(s)));
  const customMatches=showCustom?customProductsCache.filter(p=>!s||p.n.toLowerCase().includes(s)||(p.d||"").toLowerCase().includes(s)):[];
  const catsList=["Todas",...new Set(C.map(x=>x.c))];
  if(customProductsCache.length)catsList.push("Custom guardados");
  // v7.8.8: dataset attribute en lugar de interpolación inline en onclick (escape parcial era frágil).
  // El handler lee dataset.cat — robusto frente a apóstrofes, backticks, HTML.
  const _esc=typeof escapeHtml==="function"?escapeHtml:(s=>String(s||""));
  $("pk-cats").innerHTML=catsList.map(c=>'<button class="cpill '+(c===pkCat?"act":"")+'" data-cat="'+_esc(c)+'" onclick="pkCat=this.dataset.cat;renderPicker()">'+_esc(c)+'</button>').join("");
  if(!catalogMatches.length&&!customMatches.length){$("pk-list").innerHTML='<div class="empty"><div class="ic">🔍</div><p>Sin resultados</p></div>';return}
  let html="";
  if(customMatches.length){
    html+='<div style="font-size:10px;font-weight:700;color:var(--gb-gold-500);text-transform:uppercase;letter-spacing:.5px;padding:6px 4px;margin-top:4px">Productos Custom Guardados</div>';
    html+=customMatches.map(p=>'<div class="pcard" style="border-left:3px solid var(--gb-gold-500)" onclick="pickCustomProduct(\''+p.id+'\')"><div class="pinfo"><div class="pname">'+p.n+' <span style="font-size:9px;background:var(--gb-gold-500);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span>'+(p.promoted?' <span style="font-size:9px;background:#6A1B9A;color:#fff;padding:1px 5px;border-radius:3px">POPULAR</span>':"")+'</div>'+(p.d?'<div class="pdesc">'+p.d+'</div>':'')+(p.u?'<div class="punit">'+p.u+'</div>':"")+'<div class="pprice">'+fm(p.p||0)+'</div><div style="font-size:9px;color:var(--gb-neutral-400);margin-top:2px">'+(p.useCount||1)+' usos</div></div></div>').join("");
  }
  if(catalogMatches.length){
    if(customMatches.length)html+='<div style="font-size:10px;font-weight:700;color:#6A1B9A;text-transform:uppercase;letter-spacing:.5px;padding:6px 4px;margin-top:12px">Catálogo Oficial</div>';
    html+=catalogMatches.map(p=>'<div class="pcard" onclick="pickProduct('+p.id+')"><div class="pinfo"><div class="pname">'+p.n+'</div>'+(p.d?'<div class="pdesc">'+p.d+'</div>':'')+'<div class="punit">'+p.u+'</div><div class="pprice">'+fm(p.p)+'</div></div></div>').join("");
  }
  $("pk-list").innerHTML=html;
}
function pickProduct(id){
  if(!pickerTarget)return;const p=C.find(x=>x.id===id);if(!p)return;
  const pers=parseInt($("fp-pers").value)||1;const qty=suggestQty(p.u,pers);
  propSections[pickerTarget.si].options[pickerTarget.oi].items.push({name:p.n,desc:p.d||"",unit:p.u||"",qty,price:p.p,catId:p.id});
  closePicker();renderPropSections();
}
function pickCustomProduct(id){
  if(!pickerTarget)return;const p=customProductsCache.find(x=>x.id===id);if(!p)return;
  const pers=parseInt($("fp-pers").value)||1;const qty=suggestQty(p.u||"",pers);
  propSections[pickerTarget.si].options[pickerTarget.oi].items.push({name:p.n,desc:p.d||"",unit:p.u||"",qty,price:p.p||0,customId:p.id});
  closePicker();renderPropSections();
}
function addPropItemCustom(si,oi){
  const name=prompt("Nombre del ítem:");if(!name)return;
  const desc=prompt("Descripción (opcional):")||"";
  const price=parseInt(prompt("Precio unitario:")||"0");
  const unit=prompt("Unidad (Individual, 10 personas, Evento, etc):")||"Individual";
  const pers=parseInt($("fp-pers").value)||1;const qty=suggestQty(unit,pers);
  propSections[si].options[oi].items.push({name,desc,unit,qty,price});renderPropSections();
}
function updPropItem(si,oi,ii,field,val){propSections[si].options[oi].items[ii][field]=val;renderPropSections()}
function delPropItem(si,oi,ii){propSections[si].options[oi].items.splice(ii,1);renderPropSections()}

// ─── MENAJE (v7.9.8: con opciones A/B/...) ─────────────────
function renderMenaje(){
  if(!$("menaje-list"))return;
  // Auto-bootstrap si está vacío (caso load propuesta legacy sin opciones)
  if(!menajeOptions.length){
    menajeOptions=[{id:"opA_"+Date.now(),label:"Opción A",items:[]}];
    activeMenajeOptionId=menajeOptions[0].id;
    if(!reposicionByOption[activeMenajeOptionId])reposicionByOption[activeMenajeOptionId]={};
    _syncActiveMenajeRefs();
  }
  if(!activeMenajeOptionId||!menajeOptions.find(o=>o.id===activeMenajeOptionId)){
    activeMenajeOptionId=menajeOptions[0].id;
    _syncActiveMenajeRefs();
  }
  // Header: tabs de opciones + botones de gestión
  let html="";
  if(menajeOptions.length>1){
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;padding:6px;background:#FAF8F4;border-radius:6px;border:1px solid #E5DFD3">';
    menajeOptions.forEach(op=>{
      const isActive=op.id===activeMenajeOptionId;
      const bg=isActive?"#1B5E20":"#fff";
      const color=isActive?"#fff":"#1B5E20";
      const border=isActive?"#1B5E20":"#A5D6A7";
      html+='<button onclick="setActiveMenajeOption(\''+op.id+'\')" style="background:'+bg+';color:'+color+';border:1px solid '+border+';border-radius:6px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer">'+(op.label||"Opción")+'</button>';
    });
    html+='<button onclick="addMenajeOption()" style="background:#fff;color:#1B5E20;border:1px dashed #A5D6A7;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer" title="Agregar nueva opción de menaje">+ Opción</button>';
    if(menajeOptions.length>1){
      html+='<button onclick="duplicateMenajeOption(activeMenajeOptionId)" style="background:#fff;color:#5E35B1;border:1px solid #B39DDB;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" title="Duplicar opción activa">⎘ Duplicar</button>';
      html+='<button onclick="delMenajeOption(activeMenajeOptionId)" style="background:#fff;color:#C62828;border:1px solid #EF9A9A;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer" title="Eliminar opción activa">× Eliminar opción</button>';
    }
    html+='</div>';
  }else{
    // 1 sola opción: botón discreto para agregar segunda
    html+='<div style="display:flex;gap:6px;margin-bottom:8px;align-items:center"><span style="font-size:11px;color:#888;font-style:italic">Una sola lista de menaje. </span><button onclick="addMenajeOption()" style="background:#fff;color:#1B5E20;border:1px dashed #A5D6A7;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer" title="Ofrecer alternativa de menaje (Opción B de otro proveedor)">+ Agregar Opción B</button></div>';
  }
  // Label editable de la opción activa (solo si hay >1)
  if(menajeOptions.length>1){
    const activeOp=menajeOptions.find(o=>o.id===activeMenajeOptionId);
    html+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><span style="font-size:11px;color:#888">Etiqueta:</span><input type="text" value="'+(activeOp?.label||"")+'" onchange="updMenajeOptionLabel(\''+activeMenajeOptionId+'\',this.value);renderMenaje()" style="flex:1;padding:3px 6px;border:1px solid var(--gb-neutral-200);border-radius:4px;font-size:12px"></div>';
  }
  // Items de la opción activa
  html+=menajeItems.map((m,i)=>{
    const sugP=!m.price&&priceMemoryCache.menaje[m.name]?priceMemoryCache.menaje[m.name]:"";
    const priceClass=sugP?"mi-price sug":"mi-price";
    const priceTitle=sugP?'title="Sugerido de propuesta anterior"':"";
    return '<div class="menaje-item"><span style="flex:1;font-weight:600">'+m.name+'</span><input type="number" placeholder="Cant." style="width:55px;padding:4px 6px;border:1px solid var(--gb-neutral-200);border-radius:4px;text-align:center;font-size:12px" value="'+m.qty+'" onchange="menajeItems['+i+'].qty=this.value;renderMenaje();renderReposicion()"><input type="number" class="'+priceClass+'" placeholder="'+(sugP?sugP+" (sug)":"Precio")+'" value="'+m.price+'" '+priceTitle+' onchange="menajeItems['+i+'].price=this.value;renderMenaje();renderReposicion()"><button class="del-btn" style="font-size:14px" onclick="menajeItems.splice('+i+',1);renderMenaje();renderReposicion()">×</button></div>';
  }).join("");
  $("menaje-list").innerHTML=html;
  if($("repo-list"))renderReposicion();
}
function addMenajeItem(){const name=prompt("Nombre del ítem de menaje:");if(!name)return;menajeItems.push({id:"m"+Date.now(),name,qty:"",price:""});renderMenaje()}

// ─── SAVE / LOAD PROPUESTA ─────────────────────────────────
async function savePropQuote(silent){
  const cl=$("fp-cli").value.trim()||"Sin nombre";
  if(!cloudOnline){if(!silent){if(typeof toast==="function")toast("Sin conexión. No se puede guardar.","error");else alert("Sin conexión. No se puede guardar.")}return}
  // v4.12.7: bloquear guardado como borrador si currentPropNumber es una PF.
  if(currentPropNumber&&currentPropNumber.startsWith("GB-PF-")){
    if(!silent)toast("🔒 PF ("+currentPropNumber+") es registro formal, no se guarda como borrador. Para cambios: historial → 🔄 Nueva versión.","warn",7000);
    return;
  }
  // v5.5.0: matriz de edición reemplaza el bloqueo duro v4.13.0
  let oldDoc=null;
  let statusActual="enviada";
  if(currentPropNumber){
    try{
      const {db,doc,getDoc}=window.fb;
      const snap=await getDoc(doc(db,"proposals",currentPropNumber));
      if(snap.exists()){
        oldDoc=snap.data();
        statusActual=oldDoc.status||"enviada";
        if(["anulada","convertida","superseded"].includes(statusActual)){
          if(!silent){
            const _lbl=(STATUS_META[statusActual]||{}).label||statusActual;
            toast("🔒 Propuesta \""+_lbl+"\" ("+currentPropNumber+") no se puede modificar. Duplica (📋) y arranca una nueva.","warn",6000);
          }
          return;
        }
        if(statusActual==="entregado"&&!silent){
          const ok=await confirmModal({
            title:"Evento ya ejecutado",
            body:"ℹ️ Este evento ya fue ejecutado.<br><br>Solo deberías cambiar <strong>NOTAS INTERNAS</strong>.<br><br>¿Continuar guardando?",
            okLabel:"Continuar",
            tone:"warn"
          });
          if(!ok)return;
        }
      }
    }catch(e){console.warn("No se pudo verificar status previo:",e)}
  }
  try{
    // v7.9.7.6: showLoader movido DESPUÉS del modal de versionado.
    // Antes aparecía "Generando consecutivo..." superpuesto con el modal
    // "¿Guardar como versión nueva?" mientras el usuario decidía. Bug visual.
    let pNum=currentPropNumber;
    let creatingChild=false;
    if(pNum&&oldDoc&&shouldVersionWithSuffix(oldDoc,"proposal")){
      if(!silent){
        const stLbl=(STATUS_META[statusActual]||{}).label||statusActual;
        const ok=await confirmModal({
          title:"¿Guardar como versión nueva?",
          body:"Esta propuesta está en estado <strong>\""+h(stLbl)+"\"</strong>.<br><br><strong>Continuar</strong> → Se crea <strong>"+h(buildChildNumber(pNum))+"</strong> y la original queda archivada.<br><br><strong>Cancelar</strong> → Se sobreescribe "+h(pNum)+".",
          okLabel:"Crear versión nueva",
          cancelLabel:"Sobreescribir",
          tone:"primary"
        });
        if(ok){
          pNum=buildChildNumber(pNum);
          creatingChild=true;
        }
      }
    }
    if(!silent)showLoader("Generando consecutivo...");
    if(!pNum)pNum=await getNextNumber("proposal");
    await autoSaveClientFromProp();
    propSections.forEach(sec=>sec.options.forEach(opt=>opt.items.forEach(it=>{if(!it.catId&&it.name){try{registerCustomProduct(it.name,it.desc||"",it.price||0,"")}catch(e){console.warn("[registerCustomProduct propuesta]",it.name,e)}}})));
    aperturaFrase=$("fp-apertura").value.trim()||aperturaFrase;
    fechaVencimiento=$("fp-fecha-venc").value||fechaVencimiento;
    let prevStatus="enviada",prevApprovalData=null,prevPropFinalRef=null,prevPagos=null,prevEntregaData=null,prevComentarioCliente=null,prevProductionDate=null,prevProduced=null,prevHoraEntrega=null,prevPdfHistorial=null,prevPdfRegenCount=null,prevEditHistory=null,prevOptionGroupId=null,prevFeData=null;
    if(currentPropNumber&&!creatingChild&&oldDoc){
      if(oldDoc.status)prevStatus=oldDoc.status;
      if(oldDoc.approvalData)prevApprovalData=oldDoc.approvalData;
      if(oldDoc.propFinalRef)prevPropFinalRef=oldDoc.propFinalRef;
      if(oldDoc.pagos)prevPagos=oldDoc.pagos;
      if(oldDoc.entregaData)prevEntregaData=oldDoc.entregaData;
      if(oldDoc.comentarioCliente)prevComentarioCliente=oldDoc.comentarioCliente;
      if(oldDoc.productionDate)prevProductionDate=oldDoc.productionDate;
      if(typeof oldDoc.produced!=="undefined")prevProduced=oldDoc.produced;
      if(oldDoc.horaEntrega)prevHoraEntrega=oldDoc.horaEntrega;
      if(Array.isArray(oldDoc.pdfHistorial))prevPdfHistorial=oldDoc.pdfHistorial;
      if(typeof oldDoc.pdfRegenCount==="number")prevPdfRegenCount=oldDoc.pdfRegenCount;
      if(Array.isArray(oldDoc.editHistory))prevEditHistory=oldDoc.editHistory;
      if(oldDoc.optionGroupId)prevOptionGroupId=oldDoc.optionGroupId;
      if(oldDoc.feData)prevFeData=oldDoc.feData;
      if($("fp-requiere-fe"))$("fp-requiere-fe").checked=!!oldDoc.requiereFE;
    }else if(creatingChild){
      prevStatus="enviada"; // hija siempre arranca limpia pre-confirmación
    }
    // v7.9.7 F1: leer despachos del form si existe el contenedor.
    // Defensivo: si el DOM aún no tiene UI de despachos (F2 pendiente), no setea el campo
    // → propuesta queda legacy (1 entrega derivada de eventDate/trCustom).
    let despachosForm=undefined;
    if(typeof readDespachosFromForm==="function"){
      try{despachosForm=readDespachosFromForm()}catch(e){console.warn("[savePropQuote] readDespachosFromForm error:",e)}
    }
    const pObj={
      quoteNumber:pNum,type:"prop",year:APP_YEAR,
      dateISO:new Date().toISOString(),
      client:cl,idStr:getPropIdStr(),
      att:$("fp-att").value,mail:$("fp-mail").value,tel:$("fp-tel").value,dir:$("fp-dir").value,
      city:getCityNameP(),cityType:$("fp-city").value,trCustom:$("fp-tr-custom").value,
      pers:$("fp-pers").value,momento:$("fp-momento").value,eventDate:$("fp-date").value,
      tipoServicio:tipoServicio||"",
      personalData:JSON.parse(JSON.stringify(personalData)),
      sections:JSON.parse(JSON.stringify(propSections)),
      // v7.9.8: persistir tanto menaje[] (legacy, items de la opción activa) como menajeOptions[] (nuevo, todas las opciones)
      menaje:JSON.parse(JSON.stringify(menajeItems)),
      menajeOptions:JSON.parse(JSON.stringify(menajeOptions)),
      aperturaFrase:aperturaFrase,fechaVencimiento:fechaVencimiento,
      condicionesData:JSON.parse(JSON.stringify(condicionesData)),
      // v7.9.8: persistir reposicionByOption (nuevo) además de reposicionData plano (legacy compat)
      reposicionByOption:JSON.parse(JSON.stringify(reposicionByOption)),
      reposicionData:JSON.parse(JSON.stringify(reposicionData)),
      firma:firmaProp,status:prevStatus,
      requiereFE:!!($("fp-requiere-fe")&&$("fp-requiere-fe").checked),
      // v7.7.4: notas internas para producción (no aparecen en PDF al cliente)
      notasInternas:($("fp-notas-internas")?.value||"").trim()
    };
    // v7.9.7 F1: si form devolvió despachos, persistirlos. Sincronizar eventDate
    // del doc con primer despacho para consistencia con KPIs/agenda legacy.
    if(Array.isArray(despachosForm)&&despachosForm.length){
      pObj.despachos=despachosForm;
      if(despachosForm[0]&&despachosForm[0].fechaHora){
        const isoDate=despachosForm[0].fechaHora.slice(0,10);
        const horaPart=despachosForm[0].fechaHora.slice(11,16);
        if(isoDate)pObj.eventDate=isoDate;
        if(horaPart)pObj.horaEntrega=horaPart;
      }
    }
    if(prevApprovalData)pObj.approvalData=prevApprovalData;
    if(prevPropFinalRef)pObj.propFinalRef=prevPropFinalRef;
    if(prevPagos)pObj.pagos=prevPagos;
    if(prevOptionGroupId)pObj.optionGroupId=prevOptionGroupId;
    if(prevFeData)pObj.feData=prevFeData;
    if(prevEntregaData)pObj.entregaData=prevEntregaData;
    if(prevComentarioCliente)pObj.comentarioCliente=prevComentarioCliente;
    if(prevProductionDate)pObj.productionDate=prevProductionDate;
    if(prevProduced!==null)pObj.produced=prevProduced;
    // v6.4.0 P2: NO sobreescribir horaEntrega si el usuario la editó en el form.
    // (eventDate ya se lee del form en pObj — fp-date.value)
    // v6.4.0 hallazgo-4: log defensivo si form viene vacío y se preserva el previo.
    const _formHoraP=($("fp-hora-entrega")?.value)||"";
    if(_formHoraP){pObj.horaEntrega=_formHoraP}else if(prevHoraEntrega){
      pObj.horaEntrega=prevHoraEntrega;
      if(typeof window!=="undefined"&&window.__GB_DEBUG_EDIT)console.warn("[v6.4.0 P2] form sin horaEntrega → preservando previa",prevHoraEntrega,"doc:",qNum);
    }
    // v5.5.0: preservar historial PDFs y audit trail
    if(prevPdfHistorial)pObj.pdfHistorial=prevPdfHistorial;
    if(prevPdfRegenCount)pObj.pdfRegenCount=prevPdfRegenCount;
    // v4.12.1: persistir el total real
    pObj.total=computePropTotal(pObj);
    // v5.5.0: construir editHistory entry
    let nuevosHistory=prevEditHistory?[...prevEditHistory]:[];
    let cambiosDetectados=[];
    if(oldDoc&&!creatingChild&&!silent){
      cambiosDetectados=diffDocs(oldDoc,pObj);
      if(cambiosDetectados.length>0){
        const razon=prompt("Razón del cambio (opcional, máx 200 chars):","")||"";
        const entry=buildEditHistoryEntry(cambiosDetectados,razon);
        nuevosHistory.push(entry);
      }
    }
    if(nuevosHistory.length>0)pObj.editHistory=nuevosHistory;
    if(creatingChild){
      pObj.parentQuote=currentPropNumber;
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
      const parentRef=doc(db,"proposals",currentPropNumber);
      const childRef=doc(db,"proposals",pObj.quoteNumber);
      let usedFallback=false;
      try{
        await runTransaction(db,async(tx)=>{
          const parentSnap=await tx.get(parentRef);
          if(!parentSnap.exists()){
            throw new Error("Padre "+currentPropNumber+" no existe");
          }
          tx.set(childRef,{...pObj,createdAt:serverTimestamp()});
          tx.update(parentRef,{
            status:"superseded",
            supersededBy:pNum,
            updatedAt:serverTimestamp()
          });
        });
      }catch(txErr){
        console.warn("[v6.3.0 E3-1] runTransaction falló en creatingChild (propuesta); usando fallback legacy. Detalle:",txErr);
        usedFallback=true;
        await saveProposalToCloud(pObj);
        try{
          await updateDoc(parentRef,{
            status:"superseded",
            supersededBy:pNum,
            updatedAt:serverTimestamp()
          });
        }catch(e){
          console.warn("[v6.3.0 E3-1] Fallback también falló al marcar padre propuesta:",e);
          if(!silent)toast&&toast("Versión creada, pero no se pudo archivar la anterior. Reintenta manualmente.","warn",6000);
        }
      }
      const padre=(quotesCache||[]).find(x=>x.id===currentPropNumber&&x.kind==="proposal");
      if(padre){padre.status="superseded";padre.supersededBy=pNum}
      if(usedFallback)console.info("[v6.3.0 E3-1] Guardado propuesta exitoso en modo compatibilidad (fallback).");
    }else{
      await saveProposalToCloud(pObj);
    }
    // v5.5.0 FIX #3: sincronizar quotesCache local
    try{
      if(Array.isArray(quotesCache)){
        const idx=quotesCache.findIndex(x=>x.id===pNum&&x.kind==="proposal");
        const cacheEntry={kind:"proposal",id:pNum,...pObj};
        if(idx>=0)quotesCache[idx]={...quotesCache[idx],...cacheEntry};
        else quotesCache.unshift(cacheEntry);
      }
    }catch(e){console.warn("No se pudo sincronizar quotesCache:",e)}
    if(!creatingChild&&typeof linkPendingReplacement==="function"){try{await linkPendingReplacement(pNum,"proposal",pObj.client)}catch(e){console.warn("linkPendingReplacement:",e)}}
    // Guardar referencias para UI post-guardado
    window._lastSavedProp={
      id:pNum,
      cambios:cambiosDetectados,
      statusPrevio:statusActual,
      creatingChild:creatingChild,
      afectaCliente:cambiosAfectanCliente(cambiosDetectados),
      hayPagos:Array.isArray(prevPagos)&&prevPagos.length>0,
      totalAnterior:(oldDoc&&oldDoc.total)||0,
      totalNuevo:pObj.total
    };
    const padreNumeroProp=currentPropNumber;
    currentPropNumber=pNum;
    rememberPricesFromProposal();
    if(!silent){
      hideLoader();
      if(creatingChild){
        if(typeof toast==="function")toast("✅ Nueva versión creada: "+pNum+" · La anterior ("+padreNumeroProp+") quedó archivada.","success",5000);
        else toast("✅ Nueva versión creada: "+pNum+". La anterior ("+padreNumeroProp+") quedó archivada.","success",5000);
      }else if(cambiosDetectados.length>0&&statusActual==="en_produccion"){
        if(typeof toast==="function")toast("⚠️ Propuesta en producción modificada. Aviso visible al equipo.","warn",5000);
      }else{
        if(typeof toast==="function")toast("✅ Guardado: "+pNum,"success");
        else toast("✅ Guardado: "+pNum,"success");
      }
    }
    // v5.5.0: refrescar banners tras guardar
    if(typeof renderPropEditBanners==="function")renderPropEditBanners();
  }catch(e){if(!silent)hideLoader();if(typeof toast==="function")toast("Error al guardar: "+e.message,"error",6000);else alert("Error al guardar: "+e.message);console.error(e)}
}

function loadPropQuote(q){
  $("fp-cli").value=q.client||"";
  const idParts=(q.idStr||"").split(" ");
  if($("fp-idtype"))$("fp-idtype").value=idParts[0]||"";
  if($("fp-idnum"))$("fp-idnum").value=idParts.slice(1).join(" ")||"";
  $("fp-att").value=q.att||"";$("fp-mail").value=q.mail||"";$("fp-tel").value=q.tel||"";$("fp-dir").value=q.dir||"";
  $("fp-pers").value=q.pers||"";$("fp-momento").value=q.momento||"";$("fp-date").value=q.eventDate||"";
  // v6.4.0 P2: cargar horaEntrega editable
  if($("fp-hora-entrega"))$("fp-hora-entrega").value=q.horaEntrega||"";
  if(q.city){
    const known=["La Calera","Bogotá","Chía","Cajicá"];
    if(q.cityType){$("fp-city").value=q.cityType;if(q.cityType==="Otra"){$("fp-city-custom").value=q.city||""}}
    else if(known.includes(q.city)){$("fp-city").value=q.city}
    else{$("fp-city").value="Otra";$("fp-city-custom").value=q.city}
    if($("fp-tr-custom"))$("fp-tr-custom").value=q.trCustom||"";
    updTrP();
  }
  propSections=q.sections||[];
  // v7.9.8: hidratar menajeOptions desde q.menajeOptions (nuevo) o derivar de q.menaje[] legacy
  if(Array.isArray(q.menajeOptions)&&q.menajeOptions.length){
    menajeOptions=JSON.parse(JSON.stringify(q.menajeOptions));
  }else{
    const legacyItems=Array.isArray(q.menaje)?JSON.parse(JSON.stringify(q.menaje)):[];
    menajeOptions=[{id:"opA_legacy_"+Date.now(),label:"Opción A",items:legacyItems}];
  }
  // Activa: respetar propFinalSelection.menaje si está, sino la primera
  const selOpId=q?.propFinalSelection?.menaje;
  activeMenajeOptionId=(selOpId&&menajeOptions.find(o=>o.id===selOpId))
    ?selOpId
    :menajeOptions[0].id;
  tipoServicio=q.tipoServicio||"";
  // v7.9.7 F2: cargar despachos al editar propuesta existente
  if(typeof loadDespachosFromDoc==="function")loadDespachosFromDoc(q);
  if(q.personalData){
    personalData={
      meseros:q.personalData.meseros||{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""},
      auxiliares:q.personalData.auxiliares||{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""}
    };
  }else{personalData={meseros:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""},auxiliares:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""}}}
  document.querySelectorAll("#tipo-serv-sel .tipo-serv-opt").forEach(el=>el.classList.toggle("act",el.dataset.val===tipoServicio));
  aperturaFrase=q.aperturaFrase||"Una experiencia culinaria diseñada a medida para su evento.";
  fechaVencimiento=q.fechaVencimiento||"";
  condicionesData=q.condicionesData?JSON.parse(JSON.stringify(q.condicionesData)):{};
  // v7.9.8: hidratar reposicionByOption (nuevo anidado) o derivar de reposicionData plano legacy
  if(q.reposicionByOption&&typeof q.reposicionByOption==="object"&&!Array.isArray(q.reposicionByOption)){
    reposicionByOption=JSON.parse(JSON.stringify(q.reposicionByOption));
  }else{
    reposicionByOption={};
  }
  // Si no había reposicionByOption pero sí reposicionData plano, asignarlo a la opción activa
  if(Object.keys(reposicionByOption).length===0&&q.reposicionData&&typeof q.reposicionData==="object"){
    reposicionByOption[activeMenajeOptionId]=JSON.parse(JSON.stringify(q.reposicionData));
  }
  // Asegurar que la opción activa tenga su objeto de reposición (vacío si nuevo)
  if(!reposicionByOption[activeMenajeOptionId])reposicionByOption[activeMenajeOptionId]={};
  _syncActiveMenajeRefs();
  initCondiciones();
  if($("fp-apertura"))$("fp-apertura").value=aperturaFrase;
  if($("fp-fecha-venc")){if(fechaVencimiento){$("fp-fecha-venc").value=fechaVencimiento}else{setDefaultFechaVenc()}}
  firmaProp=q.firma||"jp";
  setFirma("prop",firmaProp);
  // v7.7.4: cargar notas internas para producción (campo del doc, opcional)
  if($("fp-notas-internas"))$("fp-notas-internas").value=q.notasInternas||"";
  currentPropNumber=q.quoteNumber||null;
  window._lastSavedProp=null; // limpiar estado de última edición
  showClientHistoryPanel(q.client||"","prop");
  renderPropSections();renderMenaje();renderPersonal();renderCondiciones();renderReposicion();
  // v5.5.0: renderizar banners de edición (letrero, 🕒, diferencia-anticipo)
  if(typeof renderPropEditBanners==="function")renderPropEditBanners();
}

// ─── PROPUESTA FINAL ───────────────────────────────────────
async function openPropFinalFlow(propId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión. Necesitamos internet para cargar la propuesta.","error",5000);else alert("Sin conexión. Necesitamos internet para cargar la propuesta.");return}
  try{
    showLoader("Cargando propuesta...");
    const {db,doc,getDoc}=window.fb;
    const snap=await getDoc(doc(db,"proposals",propId));
    hideLoader();
    if(!snap.exists()){if(typeof toast==="function")toast("No se encontró la propuesta","error");else alert("No se encontró la propuesta");return}
    propFinalSource={id:propId,...snap.data()};
    propFinalSelection={};
    (propFinalSource.sections||[]).forEach(sec=>{if(sec.options&&sec.options.length){propFinalSelection[sec.id]=sec.options[0].id}});
    renderPropFinalPicker();
    $("propfinal-modal").classList.remove("hidden");
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
}
function closePropFinalModal(){$("propfinal-modal").classList.add("hidden");propFinalSource=null;propFinalSelection={}}
function pfSelectOption(sectionId,optionId){propFinalSelection[sectionId]=optionId;renderPropFinalPicker()}

function renderPropFinalPicker(){
  if(!propFinalSource)return;
  const secs=propFinalSource.sections||[];
  let html="";
  secs.forEach(sec=>{
    const opts=sec.options||[];
    html+='<div class="pf-section-card"><div class="pf-sec-name">'+sec.name+'</div>';
    opts.forEach(opt=>{
      const isSel=propFinalSelection[sec.id]===opt.id;
      const items=opt.items||[];
      const sub=items.reduce((s,it)=>s+(it.price||0)*(it.qty||0),0);
      const itemsText=items.length?items.map(it=>{const q=it.qty%1===0?String(it.qty):it.qty.toFixed(1);return q+" × "+it.name}).join(" · "):"<em>Sin ítems</em>";
      html+='<label class="pf-opt-radio '+(isSel?"sel":"")+'"><input type="radio" name="pf-sec-'+sec.id+'" '+(isSel?"checked":"")+' onchange="pfSelectOption(\''+sec.id+'\',\''+opt.id+'\')"><div class="pf-opt-body"><div class="pf-opt-label">'+opt.label+'</div><div class="pf-opt-items">'+itemsText+'</div><div class="pf-opt-sub">Subtotal: '+fm(sub)+'</div></div></label>';
    });
    html+='</div>';
  });
  $("pf-sections-list").innerHTML=html;
  let totalMenu=0,totalCatering=0;
  secs.forEach(sec=>{
    const optId=propFinalSelection[sec.id];
    const opt=(sec.options||[]).find(o=>o.id===optId);
    if(!opt)return;
    const isCat=/servicio\s*de\s*catering|coordinaci[oó]n/i.test(sec.name||"");
    const sub=(opt.items||[]).reduce((s,it)=>s+(it.price||0)*(it.qty||0),0);
    if(isCat)totalCatering+=sub;else totalMenu+=sub;
  });
  const menaje=(propFinalSource.menaje||[]).reduce((s,m)=>s+(parseInt(m.price)||0)*(parseInt(m.qty)||0),0);
  const pd=propFinalSource.personalData||{meseros:{},auxiliares:{}};
  const pm=pd.meseros,pa=pd.auxiliares;
  const mSub=(parseFloat(pm.cantidad)||0)*((parseFloat(pm.valor4h)||0)+(parseFloat(pm.horasExtra)||0)*(parseFloat(pm.valorHoraExtra)||0));
  const aSub=(parseFloat(pa.cantidad)||0)*((parseFloat(pa.valor4h)||0)+(parseFloat(pa.horasExtra)||0)*(parseFloat(pa.valorHoraExtra)||0));
  const personal=mSub+aSub;
  let transp=0;
  if(propFinalSource.cityType==="Otra")transp=parseInt(propFinalSource.trCustom)||0;
  else if(propFinalSource.cityType&&TR[propFinalSource.cityType])transp=TR[propFinalSource.cityType].p;
  const total=totalMenu+totalCatering+menaje+personal+transp;
  $("pf-total").textContent=fm(total);
}

async function generarPropuestaFinal(){
  if(!propFinalSource)return;
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión.","error");else alert("Sin conexión.");return}
  const secs=propFinalSource.sections||[];
  const sinSeleccion=secs.filter(s=>(s.options||[]).length>0&&!propFinalSelection[s.id]);
  if(sinSeleccion.length){if(typeof toast==="function")toast("Falta escoger opción en: "+sinSeleccion.map(s=>s.name).join(", "),"warn",5000);else alert("Falta escoger opción en: "+sinSeleccion.map(s=>s.name).join(", "));return}
  try{
    showLoader("Generando Propuesta Final...");
    const pfSections=secs.map(sec=>{
      const optId=propFinalSelection[sec.id];
      const keepOpt=(sec.options||[]).find(o=>o.id===optId);
      return {id:sec.id,name:sec.name,options:keepOpt?[JSON.parse(JSON.stringify(keepOpt))]:[]};
    }).filter(s=>s.options.length);
    const pfNum=await getNextNumber("propfinal");
    const src=propFinalSource;
    propSections=pfSections;
    // v7.9.8: cargar menajeOptions desde src (PropFinal source) preservando opciones + selección
    if(Array.isArray(src.menajeOptions)&&src.menajeOptions.length){
      menajeOptions=JSON.parse(JSON.stringify(src.menajeOptions));
    }else{
      const legacyItems=Array.isArray(src.menaje)?JSON.parse(JSON.stringify(src.menaje)):[];
      menajeOptions=[{id:"opA_legacy_"+Date.now(),label:"Opción A",items:legacyItems}];
    }
    const srcSelOpId=src?.propFinalSelection?.menaje;
    activeMenajeOptionId=(srcSelOpId&&menajeOptions.find(o=>o.id===srcSelOpId))
      ?srcSelOpId
      :menajeOptions[0].id;
    menajeItems=JSON.parse(JSON.stringify(src.menaje||[]));
    personalData=JSON.parse(JSON.stringify(src.personalData||{meseros:{},auxiliares:{}}));
    tipoServicio=src.tipoServicio||"";
    condicionesData=JSON.parse(JSON.stringify(src.condicionesData||{}));
    reposicionData=JSON.parse(JSON.stringify(src.reposicionData||{}));
    // v7.9.8: hidratar reposicionByOption del source o derivar legacy
    if(src.reposicionByOption&&typeof src.reposicionByOption==="object"&&!Array.isArray(src.reposicionByOption)){
      reposicionByOption=JSON.parse(JSON.stringify(src.reposicionByOption));
    }else{
      reposicionByOption={};
      if(src.reposicionData&&typeof src.reposicionData==="object"){
        reposicionByOption[activeMenajeOptionId]=JSON.parse(JSON.stringify(src.reposicionData));
      }
    }
    if(!reposicionByOption[activeMenajeOptionId])reposicionByOption[activeMenajeOptionId]={};
    _syncActiveMenajeRefs();
    firmaProp=src.firma||"jp";
    aperturaFrase="Confirmación final del servicio de catering acordado con las opciones seleccionadas por el cliente.";
    fechaVencimiento=src.fechaVencimiento||"";
    $("fp-cli").value=src.client||"";
    $("fp-att").value=src.att||"";
    $("fp-mail").value=src.mail||"";
    $("fp-tel").value=src.tel||"";
    $("fp-dir").value=src.dir||"";
    $("fp-pers").value=src.pers||"";
    $("fp-momento").value=src.momento||"";
    $("fp-date").value=src.eventDate||"";
    $("fp-city").value=src.cityType||"";
    $("fp-tr-custom").value=src.trCustom||"";
    $("fp-city-custom").value=src.city||"";
    $("fp-apertura").value=aperturaFrase;
    $("fp-fecha-venc").value=fechaVencimiento;
    if(src.idStr){const parts=src.idStr.split(" ");if(parts.length>=2){$("fp-idtype").value=parts[0];$("fp-idnum").value=parts.slice(1).join(" ")}}
    const pfObj={
      quoteNumber:pfNum,type:"propfinal",year:APP_YEAR,
      dateISO:new Date().toISOString(),
      client:src.client,idStr:src.idStr||"",
      att:src.att||"",mail:src.mail||"",tel:src.tel||"",dir:src.dir||"",
      city:src.city||"",cityType:src.cityType||"",trCustom:src.trCustom||"",
      pers:src.pers||"",momento:src.momento||"",eventDate:src.eventDate||"",
      tipoServicio:tipoServicio,personalData:personalData,
      // v7.9.8: PropFinal incluye TODAS las opciones de menaje preservadas + propFinalSelection.menaje marca la activa
      sections:pfSections,menaje:menajeItems,
      menajeOptions:JSON.parse(JSON.stringify(menajeOptions)),
      propFinalSelection:{menaje:activeMenajeOptionId},
      aperturaFrase:aperturaFrase,fechaVencimiento:fechaVencimiento,
      condicionesData:condicionesData,reposicionData:reposicionData,
      reposicionByOption:JSON.parse(JSON.stringify(reposicionByOption)),
      firma:firmaProp,status:"propfinal",sourceProposal:src.id
    };
    // v4.12.1: persistir el total real para que el dashboard sume bien
    pfObj.total=computePropTotal(pfObj);
    // v4.12.7: si venimos de regenerar una PF vieja, marcar esa como superseded
    if(window.__regenerating_pf){
      pfObj.supersedes=window.__regenerating_pf.oldPfId;
      pfObj.version=(window.__regenerating_pf.oldVersion||1)+1;
    }
    const {db,doc,setDoc,updateDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"propfinals",pfNum),{...pfObj,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"proposals",src.id),{status:"convertida",propFinalRef:pfNum,updatedAt:serverTimestamp()});
    const localProp=quotesCache.find(x=>x.id===src.id&&x.kind==="proposal");
    if(localProp){localProp.status="convertida";localProp.propFinalRef=pfNum}
    // v4.12.7: marcar la PF anterior como superseded (reemplazada por la nueva)
    if(window.__regenerating_pf){
      const oldId=window.__regenerating_pf.oldPfId;
      try{
        await updateDoc(doc(db,"propfinals",oldId),{
          status:"superseded",
          supersededBy:pfNum,
          supersededAt:new Date().toISOString(),
          updatedAt:serverTimestamp()
        });
        const oldLocal=quotesCache.find(x=>x.id===oldId);
        if(oldLocal){oldLocal.status="superseded";oldLocal.supersededBy=pfNum}
      }catch(e){console.warn("No se pudo marcar PF vieja como superseded:",e)}
      window.__regenerating_pf=null;
    }
    quotesCache.unshift({kind:"proposal",id:pfNum,...pfObj,createdAt:{toDate:()=>new Date()}});
    currentPropNumber=pfNum;
    window.__pfMode=true;
    hideLoader();
    closePropFinalModal();
    await genPropPDF();
    window.__pfMode=false;
    renderHist();
  }catch(e){hideLoader();window.__pfMode=false;window.__regenerating_pf=null;toast("Error generando Propuesta Final: "+e.message,"error");console.error(e)}
}

// v4.12.7: Regenerar una Propuesta Final con cambios (cliente pidió modificaciones).
// Abre directo el selector de opciones de la propuesta base. Al generar la nueva PF,
// marca la vieja como superseded (gracias al marker window.__regenerating_pf).
// Si el usuario necesita cambiar ítems/precios de la propuesta base antes de regenerar,
// debe cancelar esto y editar la propuesta base desde el historial primero.
async function regeneratePropFinal(pfId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){toast("Sin conexión.","error");return}
  try{
    showLoader("Cargando PF...");
    const {db,doc,getDoc}=window.fb;
    const snapPF=await getDoc(doc(db,"propfinals",pfId));
    if(!snapPF.exists()){hideLoader();toast("No se encontró la PF "+pfId,"error");return}
    const pfData=snapPF.data();
    const srcId=pfData.sourceProposal;
    if(!srcId){
      hideLoader();
      toast("⚠️ Esta PF no tiene referencia a su propuesta base. PF antigua (pre-v4.6): crea una propuesta nueva desde cero para regenerar.","warn",8000);
      return;
    }
    const snapSrc=await getDoc(doc(db,"proposals",srcId));
    if(!snapSrc.exists()){
      hideLoader();
      toast("⚠️ Propuesta base "+srcId+" no encontrada (probablemente eliminada). Créala de cero para regenerar.","warn",7000);
      return;
    }
    hideLoader();
    const ok=await confirmModal({
      title:"Regenerar Propuesta Final",
      body:"🔄 <strong>"+h(pfId)+"</strong><br><br>Voy a abrir el selector de opciones de la propuesta base <strong>"+h(srcId)+"</strong>. Escoges las opciones aprobadas por el cliente → generas la PF nueva:<br>• Nuevo consecutivo GB-PF-XXXX<br>• La PF actual ("+h(pfId)+") queda como REEMPLAZADA<br><br>⚠️ Si necesitas cambiar ítems/precios de la propuesta base, cancela y edita "+h(srcId)+" desde el historial primero.",
      okLabel:"Continuar",
      tone:"primary"
    });
    if(!ok)return;
    // Marcador para generarPropuestaFinal
    window.__regenerating_pf={
      oldPfId:pfId,
      oldVersion:pfData.version||1,
      sourceProposalId:srcId
    };
    // Abre directamente el selector de opciones de la propuesta source
    await openPropFinalFlow(srcId);
  }catch(e){
    hideLoader();
    window.__regenerating_pf=null;
    toast("Error: "+e.message,"error");
    console.error(e);
  }
}

// ─── PDF PROPUESTA ─────────────────────────────────────────
async function genPropPDF(){
  try{
    if(!cloudOnline){alert("Sin conexión.");return}
    const isFinal=!!window.__pfMode;
    if(!isFinal){
      showLoader("Guardando propuesta...");
      await savePropQuote(true);
      if(!currentPropNumber){hideLoader();return}
      hideLoader();
    }
    const{jsPDF}=window.jspdf;const doc=new jsPDF("p","mm","letter");const W=215.9,H=279.4,mg=16;
    const cl=$("fp-cli").value||"—",idStr=getPropIdStr(),att=$("fp-att").value||cl,mail=$("fp-mail").value,tel=$("fp-tel").value,dir=$("fp-dir").value,city=getCityNameP()||"",pers=$("fp-pers").value||"",momento=$("fp-momento").value||"",eventDate=$("fp-date").value;
    const tw=W-mg*2;const footerH=18;
    try{const li=new Image();li.src=LOGO_IW;doc.addImage(li,"JPEG",(W-65)/2,4,65,65*(272/500))}catch(e){console.warn("[PDF] logo no cargó:",e)}
    let y=4+65*(272/500)+2;
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.4);doc.line(40,y,W-40,y);
    y+=5;doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(26,26,26);
    doc.text(isFinal?"Propuesta Final de Catering":"Propuesta de Catering",W/2,y,{align:"center"});
    y+=5;doc.setFontSize(9);doc.setTextColor(201,169,110);doc.setFont("helvetica","bold");
    doc.text(currentPropNumber,W/2,y,{align:"center"});
    doc.setTextColor(26,26,26);
    y+=5;doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(80,80,80);
    let refLine=isFinal?"REF: Propuesta Final servicio catering":"REF: Propuesta servicio catering";
    if(eventDate){const p=eventDate.split("-");const ms=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];refLine+=" "+parseInt(p[2])+" de "+ms[parseInt(p[1])-1]+" de "+p[0]}
    if(cl&&cl!=="—")refLine+=", "+cl;
    doc.text(refLine,W/2,y,{align:"center"});
    doc.setTextColor(26,26,26);
    y+=6;doc.setFontSize(8.5);
    let cliLine="Cliente: "+cl;if(idStr)cliLine+=" - "+idStr;cliLine+="     Atención: "+att;
    doc.text(cliLine,W/2,y,{align:"center"});
    if(tel){y+=4;doc.setFont("helvetica","normal");doc.text("Teléfono: "+tel,W/2,y,{align:"center"})}
    if(mail){y+=4;doc.setFont("helvetica","normal");doc.text("Correo: "+mail,W/2,y,{align:"center"})}
    if(dir){y+=4;doc.setFont("helvetica","normal");doc.text("Lugar: "+dir,W/2,y,{align:"center"})}
    if(city){y+=4;doc.setFont("helvetica","bold");doc.text("Ciudad: "+city,W/2,y,{align:"center"})}
    y+=4;doc.setFont("helvetica","bold");
    let evLine="";if(pers)evLine+=pers+" personas";
    if(momento){if(evLine)evLine+=" — ";evLine+=momento}
    if(eventDate){const p=eventDate.split("-");const ms=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];if(evLine)evLine+=" — ";evLine+=parseInt(p[2])+" de "+ms[parseInt(p[1])-1]+" de "+p[0]}
    if(evLine)doc.text(evLine,W/2,y,{align:"center"});
    y+=4;doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text("Fecha propuesta: "+dateStr(),W/2,y,{align:"center"});
    if(fechaVencimiento){y+=4;doc.setTextColor(201,169,110);doc.setFont("helvetica","bold");const fv=fechaVencimiento.split("-");const msv=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];doc.text("Propuesta válida hasta: "+parseInt(fv[2])+" de "+msv[parseInt(fv[1])-1]+" de "+fv[0],W/2,y,{align:"center"});doc.setTextColor(26,26,26)}
    const aperturaTxt=$("fp-apertura").value.trim()||aperturaFrase;
    if(aperturaTxt){y+=7;doc.setFont("helvetica","italic");doc.setFontSize(9.5);doc.setTextColor(80,80,80);const wrapped=doc.splitTextToSize(aperturaTxt,W-mg*2-10);wrapped.forEach((line,idx)=>{doc.text(line,W/2,y+idx*4.5,{align:"center"})});y+=wrapped.length*4.5;doc.setTextColor(26,26,26)}
    y+=5;
    function estH(nItems){return 10+nItems*9+9}
    // v7.9.7 F4: bloque cronograma de despachos (solo si >=2 despachos)
    const _despachosArr=(typeof currentDespachos!=="undefined"&&Array.isArray(currentDespachos))?currentDespachos:[];
    if(_despachosArr.length>=2){
      const dtd=[];
      dtd.push([{content:"CRONOGRAMA DE DESPACHOS — "+_despachosArr.length+" MOMENTOS",colSpan:4,styles:{fillColor:[230,81,0],textColor:[255,255,255],fontStyle:"bold",fontSize:9,halign:"left"}}]);
      dtd.push([
        {content:"#",styles:{fontStyle:"bold",fontSize:8,halign:"center",fillColor:[255,243,224]}},
        {content:"Fecha y hora",styles:{fontStyle:"bold",fontSize:8,halign:"left",fillColor:[255,243,224]}},
        {content:"Detalle",styles:{fontStyle:"bold",fontSize:8,halign:"left",fillColor:[255,243,224]}},
        {content:"Transporte",styles:{fontStyle:"bold",fontSize:8,halign:"right",fillColor:[255,243,224]}}
      ]);
      _despachosArr.forEach((d,di)=>{
        const fh=d.fechaHora||"";
        let fhFmt="—";
        if(fh){
          const parts=fh.split("T");
          if(parts[0]){
            const ps=parts[0].split("-");
            const ms=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
            const dias=["dom","lun","mar","mié","jue","vie","sáb"];
            try{
              const dObj=new Date(ps[0]+"-"+ps[1]+"-"+ps[2]+"T00:00:00");
              const diaSemana=dias[dObj.getDay()]||"";
              fhFmt=diaSemana+" "+parseInt(ps[2])+"-"+ms[parseInt(ps[1])-1]+" "+(parts[1]||"");
            }catch(e){fhFmt=fh}
          }
        }
        const dirTxt=(d.direccion&&d.direccion.dir)?d.direccion.dir:"Dirección del evento";
        const detalle=(d.notas||"Despacho "+(di+1))+"\n"+dirTxt;
        dtd.push([
          {content:String(di+1),styles:{halign:"center",fontStyle:"bold"}},
          fhFmt,
          detalle,
          fm(d.transporteCosto||0)
        ]);
      });
      const sumTranspDesp=_despachosArr.reduce((s,d)=>s+(parseFloat(d.transporteCosto)||0),0);
      dtd.push([
        {content:"",colSpan:2},
        {content:"Total transporte despachos",styles:{fontStyle:"bold",halign:"right",fontSize:8}},
        {content:fm(sumTranspDesp),styles:{fontStyle:"bold",halign:"right",fontSize:8,textColor:[230,81,0]}}
      ]);
      const estD=estH(_despachosArr.length+2);
      if(y+estD>H-footerH){doc.addPage();y=20}
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:dtd,theme:"grid",columnStyles:{0:{cellWidth:tw*.06},1:{cellWidth:tw*.28},2:{cellWidth:tw*.46},3:{cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:{top:3.5,bottom:3.5,left:6,right:6},textColor:[60,60,60]},alternateRowStyles:{fillColor:[255,249,235]},styles:{cellPadding:{top:3.5,bottom:3.5,left:6,right:6}}});
      y=doc.lastAutoTable.finalY+5;
    }
    // v7.9.7 F4: helper para etiquetar items con su despacho asignado
    function _despachoLabel(assignedTo){
      if(!assignedTo||assignedTo==="all"||!_despachosArr.length)return "";
      const di=_despachosArr.findIndex(d=>d.id===assignedTo);
      if(di<0)return "";
      const d=_despachosArr[di];
      const lblExtra=d.notas?(" · "+d.notas):"";
      return "→ Despacho "+(di+1)+lblExtra;
    }
    propSections.forEach(sec=>{
      // v7.8.4.2: marca visual ALTERNATIVA si la sección no está incluida en el TOTAL
      const esAlternativa=(sec.incluirEnTotal===false);
      const altSuffix=esAlternativa?"  ·  ALTERNATIVA (no incluida en TOTAL)":"";
      const headerColor=esAlternativa?[185,28,28]:[26,26,26];
      // v7.9.8.4: nota/descripción de la sección (si existe) — italic gris, una vez antes de las opciones
      const _secNota=(sec.nota||"").trim();
      if(_secNota){
        doc.setFont("helvetica","italic");doc.setFontSize(8);doc.setTextColor(90,90,90);
        const _wrapNota=doc.splitTextToSize(_secNota,tw-4);
        const _notaH=_wrapNota.length*3.6+3;
        if(y+_notaH>H-footerH){doc.addPage();y=20}
        _wrapNota.forEach(line=>{doc.text(line,mg+2,y);y+=3.6});
        y+=2;doc.setTextColor(26,26,26);doc.setFont("helvetica","normal");
      }
      sec.options.forEach(opt=>{
        const td=[];
        td.push([{content:sec.name.toUpperCase()+" — "+opt.label+altSuffix,colSpan:4,styles:{fillColor:headerColor,textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
        opt.items.forEach(it=>{
          const qStr=it.qty%1===0?String(it.qty):it.qty.toFixed(1);
          // v7.9.7 F4: agregar etiqueta de despacho asignado al final del nameCol
          const dLbl=_despachoLabel(it.assignedTo);
          const nameCol=it.name+(it.desc?"\n"+it.desc:"")+(it.unit?"\n("+it.unit+")":"")+(dLbl?"\n"+dLbl:"");
          td.push([nameCol,qStr,fm(it.price||0),fm((it.price||0)*(it.qty||0))]);
        });
        const optSub=opt.items.reduce((s,it)=>s+(it.price||0)*(it.qty||0),0);
        td.push([{content:"",colSpan:2},{content:"Subtotal",styles:{fontStyle:"bold",halign:"right",fontSize:8}},{content:fm(optSub),styles:{fontStyle:"bold",halign:"right",fontSize:8,textColor:[76,175,80]}}]);
        const est=estH(opt.items.length);
        if(y+est>H-footerH){doc.addPage();y=20}
        doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:td,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.50},1:{halign:"center",cellWidth:tw*.10},2:{halign:"right",cellWidth:tw*.20},3:{halign:"right",cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:{top:3.5,bottom:3.5,left:6,right:6},textColor:[60,60,60]},alternateRowStyles:{fillColor:[250,250,248]},styles:{cellPadding:{top:3.5,bottom:3.5,left:6,right:6}},didParseCell:function(data){if(data.row.index===td.length-1&&data.section==="body"){data.cell.styles.fillColor=[255,255,255]}}});
        y=doc.lastAutoTable.finalY+4;
      });
      y+=2;
    });
    const pMes=personalData.meseros,pAux=personalData.auxiliares;
    const mCant=parseFloat(pMes.cantidad)||0,mV4=parseFloat(pMes.valor4h)||0,mHx=parseFloat(pMes.horasExtra)||0,mVhx=parseFloat(pMes.valorHoraExtra)||0;
    const aCant=parseFloat(pAux.cantidad)||0,aV4=parseFloat(pAux.valor4h)||0,aHx=parseFloat(pAux.horasExtra)||0,aVhx=parseFloat(pAux.valorHoraExtra)||0;
    const mSubTotal=mCant*(mV4+mHx*mVhx);
    const aSubTotal=aCant*(aV4+aHx*aVhx);
    const persTotal=mSubTotal+aSubTotal;
    if(mCant>0||aCant>0){
      const ptd=[];
      const headTxt="PERSONAL DE SERVICIO"+(tipoServicio?" — "+tipoServicio.toUpperCase():"");
      ptd.push([{content:headTxt,colSpan:4,styles:{fillColor:[106,27,154],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
      if(mCant>0){
        ptd.push([{content:"Meseros (servicio 4 horas)",colSpan:1},String(mCant),fm(mV4),fm(mCant*mV4)]);
        if(mHx>0&&mVhx>0)ptd.push([{content:"  Horas extra mesero ("+mHx+"h x "+mCant+" mesero"+(mCant>1?"s":"")+")",colSpan:1},String(mHx*mCant),fm(mVhx),fm(mCant*mHx*mVhx)]);
      }
      if(aCant>0){
        ptd.push([{content:"Auxiliares de servicio (4 horas)",colSpan:1},String(aCant),fm(aV4),fm(aCant*aV4)]);
        if(aHx>0&&aVhx>0)ptd.push([{content:"  Horas extra auxiliar ("+aHx+"h x "+aCant+" aux.)",colSpan:1},String(aHx*aCant),fm(aVhx),fm(aCant*aHx*aVhx)]);
      }
      ptd.push([{content:"",colSpan:2},{content:"Subtotal Personal",styles:{fontStyle:"bold",halign:"right",fontSize:8}},{content:fm(persTotal),styles:{fontStyle:"bold",halign:"right",fontSize:8,textColor:[76,175,80]}}]);
      const estP=estH(ptd.length);
      if(y+estP>H-footerH){doc.addPage();y=20}
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:ptd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.50},1:{halign:"center",cellWidth:tw*.10},2:{halign:"right",cellWidth:tw*.20},3:{halign:"right",cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:{top:3.5,bottom:3.5,left:6,right:6},textColor:[60,60,60]},alternateRowStyles:{fillColor:[250,245,250]},styles:{cellPadding:{top:3.5,bottom:3.5,left:6,right:6}},didParseCell:function(data){if(data.row.index===ptd.length-1&&data.section==="body"){data.cell.styles.fillColor=[255,255,255]}}});
      y=doc.lastAutoTable.finalY+4;
    }
    // v7.9.8: render MENAJE por opción (A/B/...) si hay >1; si solo 1, render tradicional.
    const _menajeOpcionesRender=Array.isArray(menajeOptions)&&menajeOptions.length
      ?menajeOptions
      :[{id:"_active",label:"",items:menajeItems}];
    const _multiOpciones=_menajeOpcionesRender.length>1;
    _menajeOpcionesRender.forEach(_op=>{
      const opItems=Array.isArray(_op.items)?_op.items:[];
      const usedMenaje=opItems.filter(m=>m.qty||m.price);
      if(!usedMenaje.length)return;
      const headerTxt=_multiOpciones?("MENAJE — "+(_op.label||"Opción")):"MENAJE";
      const mtd=[];
      mtd.push([{content:headerTxt,colSpan:4,styles:{fillColor:[201,169,110],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
      usedMenaje.forEach(m=>{mtd.push([m.name,String(m.qty||""),m.price?fm(parseInt(m.price)):"—",m.qty&&m.price?fm(parseInt(m.qty)*parseInt(m.price)):"—"])});
      const mSub=usedMenaje.reduce((s,m)=>s+(parseInt(m.price)||0)*(parseInt(m.qty)||0),0);
      if(mSub)mtd.push([{content:"",colSpan:2},{content:"Subtotal",styles:{fontStyle:"bold",halign:"right",fontSize:8}},{content:fm(mSub),styles:{fontStyle:"bold",halign:"right",fontSize:8,textColor:[76,175,80]}}]);
      const est2=estH(usedMenaje.length);
      if(y+est2>H-footerH){doc.addPage();y=20}
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:mtd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.50},1:{halign:"center",cellWidth:tw*.10},2:{halign:"right",cellWidth:tw*.20},3:{halign:"right",cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:{top:3.5,bottom:3.5,left:6,right:6},textColor:[60,60,60]},alternateRowStyles:{fillColor:[250,250,248]},styles:{cellPadding:{top:3.5,bottom:3.5,left:6,right:6}},didParseCell:function(data){if(data.row.index===mtd.length-1&&data.section==="body"){data.cell.styles.fillColor=[255,255,255]}}});
      y=doc.lastAutoTable.finalY+5;
    });
    // Si hay multi-opciones, agregar nota explicativa del total
    if(_multiOpciones){
      doc.setFont("helvetica","italic");doc.setFontSize(7.5);doc.setTextColor(100,100,100);
      const activaLabel=(menajeOptions.find(o=>o.id===activeMenajeOptionId)||{}).label||"primera opción";
      const notaMulti="El TOTAL DEL SERVICIO considera el menaje de "+activaLabel+". Al elegir otra opción, el total se ajusta.";
      const wrapNota=doc.splitTextToSize(notaMulti,tw-4);
      wrapNota.forEach(line=>{doc.text(line,mg+2,y);y+=3.5});
      doc.setTextColor(26,26,26);y+=2;
    }
    // v5.0: calcula MIN y MAX por sección (antes solo Opción A).
    // Así el cliente ve un RANGO realista, no un valor de Opción A que podría ser el más barato.
    // v7.8.4.2: secciones marcadas como alternativas (incluirEnTotal===false) no entran al TOTAL.
    let totMenuMin=0,totMenuMax=0,totCateringMin=0,totCateringMax=0;
    let hayExcluidas=false;
    propSections.forEach(sec=>{
      if(sec.incluirEnTotal===false){hayExcluidas=true;return}
      const isCateringSec=/servicio\s*de\s*catering|coordinaci[oó]n/i.test(sec.name||"");
      const opts=sec.options||[];
      if(!opts.length)return;
      const subs=opts.map(opt=>(opt.items||[]).reduce((s,it)=>s+(it.price||0)*(it.qty||0),0));
      const minS=Math.min.apply(null,subs);
      const maxS=Math.max.apply(null,subs);
      if(isCateringSec){totCateringMin+=minS;totCateringMax+=maxS}
      else{totMenuMin+=minS;totMenuMax+=maxS}
    });
    let totMenajeVal=0;
    menajeItems.forEach(m=>{const q=parseFloat(m.qty)||0,p=parseFloat(m.price)||0;totMenajeVal+=q*p});
    const totPersonal=persTotal;
    // v7.9.7 F4: si hay despachos múltiples, sumar transportes de cada uno (en vez de legacy único).
    const trP=getTrP();
    const _totTranspDespachos=_despachosArr.length>=2?_despachosArr.reduce((s,d)=>s+(parseFloat(d.transporteCosto)||0),0):0;
    const totTransp=_totTranspDespachos>0?_totTranspDespachos:(trP?trP.p:0);
    const _transpLabel=_totTranspDespachos>0?("Transporte ("+_despachosArr.length+" despachos)"):("Transporte "+(trP?trP.n.replace("Transporte ",""):""));
    // Total global: suma de min y suma de max
    const totalServicioMin=totMenuMin+totCateringMin+totMenajeVal+totPersonal+totTransp;
    const totalServicioMax=totMenuMax+totCateringMax+totMenajeVal+totPersonal+totTransp;
    // Helper: formato rango (solo muestra rango si min !== max)
    const fmRange=(mn,mx)=>(mn===mx)?fm(mn):(fm(mn)+" – "+fm(mx));
    const estR=estH(5)+14;
    if(y+estR>H-footerH){doc.addPage();y=20}
    const rtd=[];
    rtd.push([{content:"TOTAL DEL SERVICIO",colSpan:2,styles:{fillColor:[26,26,26],textColor:[255,255,255],fontStyle:"bold",fontSize:9.5,halign:"left"}}]);
    rtd.push(["Experiencia Gastronómica",fmRange(totMenuMin,totMenuMax)]);
    if(totCateringMax>0)rtd.push(["Servicio de Catering",fmRange(totCateringMin,totCateringMax)]);
    if(totMenajeVal>0)rtd.push(["Menaje",fm(totMenajeVal)]);
    if(totPersonal>0)rtd.push(["Personal de Servicio",fm(totPersonal)]);
    if(totTransp>0)rtd.push([_transpLabel,fm(totTransp)]);
    rtd.push([{content:"TOTAL",styles:{fontStyle:"bold",fontSize:10,fillColor:[244,243,241]}},{content:fmRange(totalServicioMin,totalServicioMax),styles:{fontStyle:"bold",halign:"right",fontSize:11,textColor:[201,169,110],fillColor:[244,243,241]}}]);
    doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:rtd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.60},1:{halign:"right",cellWidth:tw*.40}},bodyStyles:{fontSize:9,cellPadding:{top:4,bottom:4,left:8,right:8},textColor:[40,40,40]},styles:{cellPadding:{top:4,bottom:4,left:8,right:8}}});
    y=doc.lastAutoTable.finalY+3;
    const hasMultipleOptions=!isFinal&&propSections.some(sec=>sec.options.length>1);
    if(hasMultipleOptions){
      doc.setFont("helvetica","italic");doc.setFontSize(8);doc.setTextColor(100,100,100);
      // v5.0: nota actualizada explicando el rango
      const notaTotal="Nota: El rango refleja el valor mínimo y máximo según las combinaciones de opciones. Al confirmar su selección en cada sección generaremos la Propuesta Final con el valor exacto.";
      const notaWrap=doc.splitTextToSize(notaTotal,tw-4);
      notaWrap.forEach(line=>{doc.text(line,mg+2,y);y+=3.5});
      doc.setTextColor(26,26,26);y+=3;
    }else{y+=3}
    // v7.8.4.2: nota cuando hay secciones marcadas como alternativas (no incluidas en TOTAL)
    if(hayExcluidas){
      doc.setFont("helvetica","italic");doc.setFontSize(8);doc.setTextColor(185,28,28);
      const notaAlt="Las secciones marcadas como ALTERNATIVA son opciones adicionales para que el cliente elija. No están incluidas en el TOTAL DEL SERVICIO.";
      const altWrap=doc.splitTextToSize(notaAlt,tw-4);
      altWrap.forEach(line=>{doc.text(line,mg+2,y);y+=3.5});
      doc.setTextColor(26,26,26);y+=3;
    }
    // v7.9.7.2 F8.7: incluir cantidad por item + etiqueta "valores unitarios" + caja firma cliente.
    // Antes: 2 columnas [Item, Valor]. Ahora: 3 columnas [Cant, Item, Valor unitario].
    // Cantidad sale de q.menaje[].qty matchando por name (menajeItems es global del editor).
    // v7.9.8: render valores de reposición por opción si hay >1; sino tradicional.
    // F8.7 (firma cliente) también se renderiza por opción si >1, con texto específico.
    // v7.9.8.1: la sección VALORES DE REPOSICIÓN (+ caja firma cliente) SOLO se renderiza
    // en PropFinal (isFinal=true). En propuesta inicial NO se muestra — los valores de
    // reposición se aceptan cuando el cliente aprueba y firma la PropFinal.
    const _opcionesParaRepo=isFinal&&Array.isArray(menajeOptions)&&menajeOptions.length
      ?menajeOptions
      :(isFinal?[{id:"_active",label:"",items:menajeItems}]:[]);
    const _multiOpRepo=_opcionesParaRepo.length>1;
    _opcionesParaRepo.forEach(_op=>{
      const opItems=Array.isArray(_op.items)?_op.items:[];
      const opReposicion=_multiOpRepo
        ?(reposicionByOption[_op.id]||{})
        :reposicionData;
      const repoItems=[];
      opItems.filter(m=>m.name&&(m.qty||m.price)).forEach(m=>{
        if(opReposicion[m.name])repoItems.push({name:m.name,qty:parseInt(m.qty)||0,price:opReposicion[m.name]});
      });
      if(!repoItems.length)return;
      const estRep=estH(repoItems.length)+30; // +30 por caja de firma cliente
      if(y+estRep>H-footerH){doc.addPage();y=20}
      const reptd=[];
      const headerRepo=_multiOpRepo
        ?"VALORES DE REPOSICIÓN DE MENAJE — "+(_op.label||"Opción")+" (valores unitarios)"
        :"VALORES DE REPOSICIÓN DE MENAJE (valores unitarios)";
      reptd.push([{content:headerRepo,colSpan:3,styles:{fillColor:[211,47,47],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
      reptd.push([{content:"En caso de daño, rotura o pérdida del menaje durante el evento, los siguientes valores corresponden al costo de reposición. El costo a cobrar será cantidad afectada × valor unitario indicado abajo.",colSpan:3,styles:{fontSize:7.5,fontStyle:"italic",textColor:[100,100,100],fillColor:[254,248,248]}}]);
      reptd.push([{content:"Cant",styles:{fontStyle:"bold",fontSize:8,halign:"center",fillColor:[245,245,245]}},{content:"Item",styles:{fontStyle:"bold",fontSize:8,halign:"left",fillColor:[245,245,245]}},{content:"Valor unitario",styles:{fontStyle:"bold",fontSize:8,halign:"right",fillColor:[245,245,245]}}]);
      repoItems.forEach(r=>{reptd.push([{content:String(r.qty||"—"),styles:{halign:"center"}},r.name,{content:fm(parseInt(r.price)||0),styles:{halign:"right"}}])});
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:reptd,theme:"grid",columnStyles:{0:{cellWidth:tw*.12},1:{cellWidth:tw*.58},2:{cellWidth:tw*.30}},bodyStyles:{fontSize:8,cellPadding:{top:3,bottom:3,left:6,right:6},textColor:[60,60,60]},styles:{cellPadding:{top:3,bottom:3,left:6,right:6}}});
      y=doc.lastAutoTable.finalY+4;
      // Caja de aceptación del cliente (F8.7) — adapta texto si hay opciones múltiples
      const cajaH=22;
      if(y+cajaH>H-footerH){doc.addPage();y=20}
      doc.setDrawColor(211,47,47);doc.setLineWidth(0.4);doc.roundedRect(mg,y,tw,cajaH,1.5,1.5,"S");
      doc.setFontSize(8);doc.setFont("helvetica","bold");doc.setTextColor(60,60,60);
      const txtFirma=_multiOpRepo
        ?("Acepto la "+(_op.label||"Opción")+" y sus valores unitarios de reposición.")
        :"Acepto los valores unitarios de reposición indicados.";
      doc.text(txtFirma,mg+4,y+5);
      doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(100,100,100);
      // 4 campos en una fila: Nombre / C.C. / Firma / Fecha
      const colW=tw/4;
      const labelY=y+11;
      const lineY=y+18;
      ["Nombre:","C.C.:","Firma:","Fecha:"].forEach((lbl,i)=>{
        const cx=mg+colW*i+3;
        doc.text(lbl,cx,labelY);
        doc.setDrawColor(150,150,150);doc.setLineWidth(0.2);
        doc.line(cx+12,lineY,mg+colW*(i+1)-3,lineY);
      });
      doc.setTextColor(26,26,26);
      y=y+cajaH+4;
    });
    const pw=tw,px=mg;
    doc.setFont("helvetica","normal");doc.setFontSize(8);
    const nt="Para reservar la fecha del evento, se requiere el pago de un anticipo del 50% del valor total. El 50% restante deberá ser cancelado a más tardar 24 horas después de finalizado el evento. Por favor envía el comprobante de pago por WhatsApp para procesar la confirmación.";
    const nl=doc.splitTextToSize(nt,pw-16);
    const ph=9+54+nl.length*3.8+8;
    if(y+ph>H-footerH){doc.addPage();y=20}
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
    y=y+ph+5;
    doc.addPage();y=20;
    doc.setFont("helvetica","bold");doc.setFontSize(13);doc.setTextColor(26,26,26);
    doc.text("CONDICIONES COMERCIALES",W/2,y,{align:"center"});
    y+=5;doc.setFontSize(10);doc.setTextColor(201,169,110);
    doc.text("Y POLÍTICAS DEL SERVICIO",W/2,y,{align:"center"});
    y+=4;doc.setDrawColor(201,169,110);doc.setLineWidth(0.4);doc.line(60,y,W-60,y);
    y+=7;doc.setTextColor(26,26,26);
    const condOrder=["c1","c2","c3","c4","c5","c6","c7"];
    condOrder.forEach((k,i)=>{
      const titulo=CONDICIONES_TITULOS[k];
      const texto=condicionesData[k]||DEFAULT_CONDICIONES[k];
      const wrapped=doc.splitTextToSize(texto,W-mg*2-4);
      const blockH=6+wrapped.length*3.6+5;
      if(y+blockH>H-footerH){doc.addPage();y=20}
      doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(26,26,26);
      doc.text((i+1)+". "+titulo,mg,y);
      y+=5;
      doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(60,60,60);
      wrapped.forEach(line=>{doc.text(line,mg,y);y+=3.6});
      y+=4;
    });
    const firmaH=60;
    if(y+firmaH>H-footerH){doc.addPage();y=20}
    y+=6;
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(60,60,60);
    doc.text("Agradecemos su confianza en Gourmet Bites. Estamos listos para crear una experiencia culinaria memorable para usted y sus invitados.",mg,y,{maxWidth:W-mg*2});
    y+=10;
    doc.setFont("helvetica","italic");doc.setFontSize(9);doc.text("Cordialmente,",mg,y);
    y+=4;
    const firmanteSel=FIRMANTES[firmaProp]||FIRMANTES.jp;
    try{doc.addImage(firmanteSel.img,"PNG",mg,y,60,18)}catch(e){console.warn("No se pudo insertar firma:",e)}
    y+=19;
    doc.setDrawColor(100,100,100);doc.setLineWidth(0.3);doc.line(mg,y,mg+70,y);
    y+=4;doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(26,26,26);
    doc.text(firmanteSel.nombre,mg,y);
    y+=4;doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(80,80,80);
    doc.text(firmanteSel.cargo,mg,y);
    let ay=y-28;
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(26,26,26);
    doc.text("Aceptado por:",W-mg-70,ay);
    ay+=6;doc.setFont("helvetica","normal");doc.setFontSize(8);
    doc.text("Nombre:",W-mg-70,ay);doc.setDrawColor(100,100,100);doc.line(W-mg-55,ay+0.5,W-mg,ay+0.5);
    ay+=5;doc.text("Firma:",W-mg-70,ay);doc.line(W-mg-55,ay+0.5,W-mg,ay+0.5);
    ay+=5;doc.text("Fecha:",W-mg-70,ay);doc.line(W-mg-55,ay+0.5,W-mg,ay+0.5);
    const pg=doc.getNumberOfPages();for(let i=1;i<=pg;i++){doc.setPage(i);doc.setDrawColor(201,169,110);doc.setLineWidth(0.3);doc.line(30,H-14,W-30,H-14);doc.setFontSize(14);doc.setTextColor(26,26,26);doc.text("WhatsApp +57 310 444 1588",mg,H-7);doc.text("@GourmetBitesbyAndradeMatuk",W-mg,H-7,{align:"right"})}
    // v4.12.2: usar Web Share API en iOS/Android para evitar fuga del blob URL en WhatsApp
    // v5.4.1 (Bloque B): versionado + copia Storage. kind se infiere del prefijo:
    // "GB-PF-" → propfinal (colección propfinals), resto → proposal (colección proposals).
    // currentPropNumber es el docId en Firestore (mismo patrón que cotizaciones).
    // v7.9.7.1 F8.6: normalizar tildes/ñ a ASCII para evitar mojibake en filenames.
    // Storage / Content-Disposition / WhatsApp interpretaban UTF-8 como Latin-1
    // y "León" salía como "LeÃ³n". NFD descompone, regex quita diacríticos,
    // final reemplaza cualquier no-alfanumérico por "_".
    const clSafe=(cl||"sin").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-zA-Z0-9]/g,"_");
    const baseNameP=currentPropNumber+"_"+clSafe;
    const kindP=(currentPropNumber||"").startsWith("GB-PF-")?"propfinal":"proposal";
    await savePdfConCopiaStorage(doc,baseNameP,kindP,currentPropNumber);
  }catch(err){alert("Error generando PDF: "+err.message);console.error(err)}
}

// v5.5.0: render de banners dinámicos en vista de propuesta (letrero + diferencia + botón 🕒)
function renderPropEditBanners(){
  const el=$("prop-edit-banners");
  if(!el)return;
  const qCurrent=currentPropNumber?(quotesCache||[]).find(x=>x.id===currentPropNumber&&x.kind==="proposal"):null;
  const curStatus=(qCurrent&&qCurrent.status)||"enviada";
  const hayEditHistory=qCurrent&&Array.isArray(qCurrent.editHistory)&&qCurrent.editHistory.length>0;
  const lastSaved=window._lastSavedProp&&window._lastSavedProp.id===currentPropNumber?window._lastSavedProp:null;
  let html="";
  // Letrero naranja: propuesta en producción con cambios
  if(currentPropNumber&&(curStatus==="en_produccion"||(lastSaved&&lastSaved.statusPrevio==="en_produccion"))&&lastSaved&&Array.isArray(lastSaved.cambios)&&lastSaved.cambios.length>0){
    html+='<div class="edit-alert-banner">⚠️ <strong>Propuesta en producción con cambios</strong> — tener en cuenta. Avisa al equipo de producción.</div>';
  }
  // Botón 🕒 timeline
  if(currentPropNumber&&hayEditHistory){
    html+='<div style="margin:8px 0;text-align:right"><button class="eh-trigger" onclick="openEditHistoryModal(\''+currentPropNumber+'\',\'proposal\')" title="Historial de cambios">🕒 Historial ('+qCurrent.editHistory.length+')</button></div>';
  }
  // Banner diferencia-anticipo
  if(lastSaved&&lastSaved.hayPagos&&lastSaved.totalAnterior!==lastSaved.totalNuevo){
    const diff=lastSaved.totalNuevo-lastSaved.totalAnterior;
    const diffTxt=diff>0?"a cobrar":"a devolver";
    html+='<div class="diff-anticipo-banner">💰 <strong>Diferencia detectada</strong>: Total anterior '+fm(lastSaved.totalAnterior)+' → Nuevo '+fm(lastSaved.totalNuevo)+'. Diferencia '+fm(Math.abs(diff))+' '+diffTxt+'. <em>(Gestión manual)</em></div>';
  }
  el.innerHTML=html;
  // Botón PDF destacado si cambios afectan cliente
  const btnPdf=$("prop-btn-pdf");
  if(btnPdf){
    if(lastSaved&&lastSaved.afectaCliente){
      btnPdf.innerHTML="📄 Regenerar PDF del cliente";
      btnPdf.style.background="linear-gradient(135deg,#FF6F00,#E65100)";
      btnPdf.style.animation="pulseHighlight 1.5s ease-in-out 3";
    }else{
      btnPdf.innerHTML="📄 Generar PDF Propuesta";
      btnPdf.style.background="";
      btnPdf.style.animation="";
    }
  }
  // Botón cancelar: visible solo si hay propuesta cargada
  const btnCancel=$("prop-btn-cancel");
  if(btnCancel)btnCancel.style.display=currentPropNumber?"":"none";
}

// v5.5.0: cancelar edición de propuesta — recarga desde Firestore
// v6.3.0 E3-3: confirms migrados a confirmModal()
async function cancelEdicionProp(){
  if(!currentPropNumber){
    const ok=await confirmModal({
      title:"Descartar borrador",
      body:"¿Descartar esta propuesta (borrador nuevo)?",
      okLabel:"Descartar",
      tone:"warn"
    });
    if(!ok)return;
    propSections=[];menajeItems=[];personalData=[];currentPropNumber=null;
    window._lastSavedProp=null;
    go("dashboard");
    return;
  }
  const ok=await confirmModal({
    title:"Descartar cambios",
    body:"¿Descartar cambios y recargar <strong>"+h(currentPropNumber)+"</strong> desde la nube?",
    okLabel:"Descartar y recargar",
    tone:"warn"
  });
  if(!ok)return;
  try{
    showLoader("Recargando...");
    window._lastSavedProp=null;
    await loadQuote("proposal",currentPropNumber);
    hideLoader();
    if(typeof toast==="function")toast("Cambios descartados","success");
  }catch(e){hideLoader();toast("Error al recargar: "+e.message,"error")}
}

// ═══════════════════════════════════════════════════════════════════════════
// v7.9.7.2 F8.8: REMISIÓN DE ENTREGA POR DESPACHO
// ═══════════════════════════════════════════════════════════════════════════
// Genera un PDF firmable que Kathy/JP lleva al evento.
// Una remisión por despacho. Aplica con o sin menaje. El menaje (cuando lo
// hay) aparece SOLO en la remisión del primer despacho cronológico, porque
// operativamente el menaje se entrega una vez al setup, no por despacho.
//
// Items de comida por despacho (decisión D2 del plan):
//   - assignedTo === despacho.id  → va en ese despacho
//   - assignedTo === "all"/undefined → va en TODOS los despachos
//   - assignedTo apunta a otro id → NO va
//
// Persistencia de foto firmada: ver despacho.entregaData.actaFotoUrl (queda
// definido como convención; UI de subida es iteración futura).
async function genRemisionDespachoPDF(q,despachoIdx){
  if(!q){alert("Sin documento para remisión");return}
  if(!window.jspdf||!window.jspdf.jsPDF){alert("jsPDF no cargado");return}
  if(typeof getDespachos!=="function"){alert("getDespachos no disponible");return}
  try{
    if(typeof showLoader==="function")showLoader("Generando remisión...");
    const despachos=getDespachos(q);
    if(!despachos.length){if(typeof toast==="function")toast("Sin despachos","warn");if(typeof hideLoader==="function")hideLoader();return}
    const idx=Math.max(0,Math.min(despachoIdx||0,despachos.length-1));
    const despacho=despachos[idx];

    // Ordenar despachos cronológicamente para determinar cuál es "primero"
    const orden=despachos.map((d,i)=>({d,i,fh:d.fechaHora||""})).sort((a,b)=>(a.fh||"").localeCompare(b.fh||""));
    const esPrimeroCronologico=orden.length>0&&orden[0].i===idx;
    const totalDesp=despachos.length;

    // Filtrar items de comida según D2
    // v7.9.8.5: items con assignedTo a un despacho borrado (huérfanos) ya no se omiten en
    // silencio; se incluyen marcados, solo en la hoja cronológicamente primera (no duplicar).
    const _validDespIds=new Set(despachos.map(d=>d.id));
    const _huerfPrefix="[ASIGNACIÓN INVÁLIDA] ";
    const itemsParaRemision=[];
    if(q.kind==="quote"){
      (q.cart||[]).forEach(it=>{
        const tag=it.assignedTo;
        const va=!tag||tag==="all"||tag===despacho.id;
        const huerf=tag&&tag!=="all"&&!_validDespIds.has(tag);
        if((va||(huerf&&esPrimeroCronologico))&&it.n)itemsParaRemision.push({qty:it.qty||0,name:(huerf?_huerfPrefix:"")+it.n,desc:it.d||"",unidad:""});
      });
      (q.cust||[]).forEach(it=>{
        const tag=it.assignedTo;
        const va=!tag||tag==="all"||tag===despacho.id;
        const huerf=tag&&tag!=="all"&&!_validDespIds.has(tag);
        if((va||(huerf&&esPrimeroCronologico))&&it.n)itemsParaRemision.push({qty:it.qty||0,name:(huerf?_huerfPrefix:"")+it.n+"*",desc:it.d||"",unidad:it.u||""});
      });
    }else{
      (q.sections||[]).forEach(sec=>(sec.options||[]).forEach(opt=>(opt.items||[]).forEach(it=>{
        const tag=it.assignedTo;
        const va=!tag||tag==="all"||tag===despacho.id;
        const huerf=tag&&tag!=="all"&&!_validDespIds.has(tag);
        if((va||(huerf&&esPrimeroCronologico))&&it.name)itemsParaRemision.push({qty:it.qty||0,name:(huerf?_huerfPrefix:"")+it.name,desc:it.desc||"",unidad:it.unidad||""});
      })));
    }

    // Dirección efectiva del despacho
    let dirText="";
    if(typeof getDespachoDireccion==="function"){
      const dirObj=getDespachoDireccion(despacho,q);
      if(dirObj&&dirObj.dir){dirText=dirObj.dir+(dirObj.city?", "+dirObj.city:"")}
    }
    if(!dirText)dirText=(q.dir||"")+(q.city?", "+q.city:"");

    // Fecha y hora del despacho
    let fechaStr="",horaStr="";
    if(despacho.fechaHora){
      const t=despacho.fechaHora.indexOf("T");
      if(t>0){fechaStr=despacho.fechaHora.slice(0,t);horaStr=despacho.fechaHora.slice(t+1,t+6)}
      else{fechaStr=despacho.fechaHora.slice(0,10)}
    }
    if(!fechaStr)fechaStr=q.eventDate||q.fechaEntrega||"";
    if(!horaStr)horaStr=q.horaEntrega||"";

    // Crear PDF
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF("p","mm","letter");
    const W=215.9,H=279.4,mg=14;
    const tw=W-mg*2;
    let y=mg;

    // ── Header
    doc.setFont("helvetica","bold");doc.setFontSize(16);doc.setTextColor(27,94,32);
    doc.text("REMISIÓN DE ENTREGA",W/2,y+4,{align:"center"});
    y+=8;
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(100,100,100);
    doc.text("Gourmet Bites by Andrade Matuk · "+gbTodayIso(),W/2,y,{align:"center"});
    y+=6;
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.4);doc.line(mg,y,W-mg,y);
    y+=6;

    // ── Bloque cliente
    doc.setDrawColor(201,169,110);doc.setLineWidth(0.3);doc.roundedRect(mg,y,tw,28,1.5,1.5,"S");
    doc.setFontSize(8.5);doc.setTextColor(60,60,60);
    const labelX=mg+3,valueX=mg+3,colW2=tw/3;
    doc.setFont("helvetica","bold");doc.text("Cliente",labelX,y+5);
    doc.text("Doc",labelX+colW2,y+5);
    doc.text("Teléfono",labelX+colW2*2,y+5);
    doc.setFont("helvetica","normal");doc.setTextColor(26,26,26);
    doc.text((q.client||"—").toString().substring(0,40),valueX,y+10);
    doc.text((q.id||q.quoteNumber||"—").toString(),valueX+colW2,y+10);
    doc.text((q.tel||"—").toString(),valueX+colW2*2,y+10);
    doc.setFont("helvetica","bold");doc.setTextColor(60,60,60);
    doc.text("Fecha entrega",labelX,y+17);
    doc.text("Hora",labelX+colW2,y+17);
    doc.text("Dirección",labelX+colW2*2,y+17);
    doc.setFont("helvetica","normal");doc.setTextColor(26,26,26);
    doc.text(fechaStr||"—",valueX,y+22);
    doc.text(horaStr||"—",valueX+colW2,y+22);
    const dirShort=doc.splitTextToSize(dirText||"—",colW2-2);
    doc.text(dirShort.slice(0,2),valueX+colW2*2,y+22);
    y+=32;

    // ── Despacho N/M (solo si > 1 despacho)
    if(totalDesp>1){
      doc.setFillColor(255,243,224);doc.rect(mg,y,tw,8,"F");
      doc.setFontSize(10);doc.setFont("helvetica","bold");doc.setTextColor(230,81,0);
      const labelDesp="🚚 Despacho "+(idx+1)+" de "+totalDesp+(despacho.notas?" · "+despacho.notas:"");
      doc.text(labelDesp.replace("🚚","►"),mg+3,y+5.5);
      y+=10;
      doc.setTextColor(26,26,26);
    }

    // ── Tabla items comida
    if(itemsParaRemision.length){
      const itemsRows=[
        [{content:"ITEMS ENTREGADOS — COMIDA",colSpan:5,styles:{fillColor:[27,94,32],textColor:[255,255,255],fontStyle:"bold",fontSize:9,halign:"left"}}],
        [
          {content:"Cant",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}},
          {content:"Producto",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"left"}},
          {content:"Descripción",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"left"}},
          {content:"Unidad",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}},
          {content:"Recibido",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}}
        ]
      ];
      itemsParaRemision.forEach(it=>{
        itemsRows.push([
          {content:String(it.qty||"—"),styles:{halign:"center",fontStyle:"bold"}},
          it.name||"—",
          it.desc||"",
          {content:it.unidad||"",styles:{halign:"center",fontSize:7}},
          {content:"",styles:{halign:"center"}}
        ]);
      });
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:14},body:itemsRows,theme:"grid",
        columnStyles:{0:{cellWidth:tw*.10},1:{cellWidth:tw*.30},2:{cellWidth:tw*.34},3:{cellWidth:tw*.12},4:{cellWidth:tw*.14}},
        bodyStyles:{fontSize:8,cellPadding:{top:2.5,bottom:2.5,left:4,right:4},textColor:[60,60,60],minCellHeight:8},
        styles:{cellPadding:{top:2.5,bottom:2.5,left:4,right:4}}
      });
      y=doc.lastAutoTable.finalY+5;
    }

    // ── Tabla menaje (solo si primer despacho cronológico Y hay menaje cargado)
    // v7.9.8: usa la opción activa via helpers (getMenajeItemsActivos + getReposicionActivos)
    // con retrocompat al modelo legacy q.menaje[] plano.
    let menajeItemsLocal=[];
    let repoLocal={};
    if(typeof getMenajeItemsActivos==="function"){
      menajeItemsLocal=getMenajeItemsActivos(q);
      if(!menajeItemsLocal.length&&typeof menajeItems!=="undefined"){
        // Si q no tiene opciones cargadas (caso edición en memoria), cae a menajeItems global
        menajeItemsLocal=menajeItems;
      }
      if(typeof getReposicionActivos==="function"){
        repoLocal=getReposicionActivos(q);
        if(!repoLocal||Object.keys(repoLocal).length===0){
          repoLocal=(q.reposicionData&&typeof q.reposicionData==="object")?q.reposicionData:(typeof reposicionData!=="undefined"?reposicionData:{});
        }
      }
    }else{
      // Fallback ultra-defensivo (no debería ocurrir si app-core.js está cargado)
      menajeItemsLocal=Array.isArray(q.menaje)?q.menaje:(typeof menajeItems!=="undefined"?menajeItems:[]);
      repoLocal=(q.reposicionData&&typeof q.reposicionData==="object")?q.reposicionData:(typeof reposicionData!=="undefined"?reposicionData:{});
    }
    const tieneMenajeRender=esPrimeroCronologico&&menajeItemsLocal.length>0&&menajeItemsLocal.some(m=>m.name&&m.qty);
    if(tieneMenajeRender){
      // Saltar página si poco espacio
      if(y>H-90){doc.addPage();y=mg}
      const menajeRows=[
        [{content:"MENAJE ENTREGADO (valores unitarios)",colSpan:4,styles:{fillColor:[211,47,47],textColor:[255,255,255],fontStyle:"bold",fontSize:9,halign:"left"}}],
        [{content:"Los valores indicados son UNITARIOS. En caso de daño, rotura o pérdida: cantidad afectada × valor unitario indicado.",colSpan:4,styles:{fontSize:7.5,fontStyle:"italic",textColor:[100,100,100],fillColor:[254,248,248]}}],
        [
          {content:"Cant",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}},
          {content:"Item",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"left"}},
          {content:"Valor unitario reposición",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"right"}},
          {content:"Recibido",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}}
        ]
      ];
      menajeItemsLocal.filter(m=>m.name&&m.qty).forEach(m=>{
        const repo=repoLocal[m.name];
        menajeRows.push([
          {content:String(m.qty||"—"),styles:{halign:"center",fontStyle:"bold"}},
          m.name||"—",
          {content:repo?fm(parseInt(repo)||0):"—",styles:{halign:"right"}},
          {content:"",styles:{halign:"center"}}
        ]);
      });
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:14},body:menajeRows,theme:"grid",
        columnStyles:{0:{cellWidth:tw*.10},1:{cellWidth:tw*.50},2:{cellWidth:tw*.25},3:{cellWidth:tw*.15}},
        bodyStyles:{fontSize:8,cellPadding:{top:2.5,bottom:2.5,left:4,right:4},textColor:[60,60,60],minCellHeight:8}
      });
      y=doc.lastAutoTable.finalY+5;
    }

    // ── Sección "Recibo del cliente"
    if(y>H-55){doc.addPage();y=mg}
    doc.setFillColor(245,245,245);doc.rect(mg,y,tw,7,"F");
    doc.setFontSize(9.5);doc.setFont("helvetica","bold");doc.setTextColor(26,26,26);
    doc.text("RECIBO DEL CLIENTE — al entregar",mg+3,y+5);
    y+=10;
    doc.setFontSize(8.5);doc.setFont("helvetica","normal");doc.setTextColor(60,60,60);
    doc.setDrawColor(100,100,100);doc.setLineWidth(0.3);
    // Checkbox 1
    doc.rect(mg+2,y-3.5,4,4,"S");
    doc.text("Recibí conforme los items indicados arriba.",mg+8,y);
    y+=5;
    if(tieneMenajeRender){
      doc.rect(mg+2,y-3.5,4,4,"S");
      doc.text("Acepto los valores unitarios de reposición del menaje.",mg+8,y);
      y+=5;
    }
    y+=2;
    // 2 columnas de firma (cliente / entrega)
    const colF=tw/2;
    ["Firma del cliente","Entregado por (Gourmet Bites)"].forEach((titulo,i)=>{
      const cx=mg+colF*i;
      doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(60,60,60);
      doc.text(titulo,cx+2,y+4);
      doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(100,100,100);
      doc.setDrawColor(150,150,150);doc.setLineWidth(0.2);
      doc.text("Nombre:",cx+2,y+12);doc.line(cx+18,y+12.4,cx+colF-3,y+12.4);
      if(i===0){doc.text("C.C.:",cx+2,y+17);doc.line(cx+18,y+17.4,cx+colF-3,y+17.4)}
      doc.text("Fecha y hora:",cx+2,y+22);doc.line(cx+22,y+22.4,cx+colF-3,y+22.4);
    });
    y+=28;

    // ── Sección devolución del menaje (solo si tiene menaje en este despacho)
    if(tieneMenajeRender){
      if(y>H-60){doc.addPage();y=mg}
      doc.setFillColor(245,245,245);doc.rect(mg,y,tw,7,"F");
      doc.setFontSize(9.5);doc.setFont("helvetica","bold");doc.setTextColor(26,26,26);
      doc.text("DEVOLUCIÓN DEL MENAJE — al recoger después del evento",mg+3,y+5);
      y+=10;
      doc.setFontSize(8.5);doc.setFont("helvetica","normal");doc.setTextColor(60,60,60);
      doc.setDrawColor(100,100,100);doc.setLineWidth(0.3);
      doc.rect(mg+2,y-3.5,4,4,"S");
      doc.text("Devuelto conforme — sin daños ni pérdidas.",mg+8,y);
      y+=5;
      doc.rect(mg+2,y-3.5,4,4,"S");
      doc.text("Con daños o pérdidas — detalle abajo:",mg+8,y);
      y+=4;
      // Tabla vacía para llenar a mano
      const dañosRows=[
        [
          {content:"Item dañado/perdido",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"left"}},
          {content:"Cant",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"center"}},
          {content:"Valor unitario",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"right"}},
          {content:"Total a cobrar",styles:{fontStyle:"bold",fillColor:[245,245,245],halign:"right"}}
        ],
        ["","","",""],["","","",""],["","","",""],
        [{content:"TOTAL A COBRAR POR DAÑOS",colSpan:3,styles:{halign:"right",fontStyle:"bold"}},{content:"",styles:{halign:"right"}}]
      ];
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:14},body:dañosRows,theme:"grid",
        columnStyles:{0:{cellWidth:tw*.50},1:{cellWidth:tw*.12},2:{cellWidth:tw*.18},3:{cellWidth:tw*.20}},
        bodyStyles:{fontSize:8,cellPadding:{top:3,bottom:3,left:4,right:4},textColor:[60,60,60],minCellHeight:9}
      });
      y=doc.lastAutoTable.finalY+4;
      // Firmas devolución
      ["Firma del cliente (devolución)","Recogido por (Gourmet Bites)"].forEach((titulo,i)=>{
        const cx=mg+colF*i;
        doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(60,60,60);
        doc.text(titulo,cx+2,y+4);
        doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(100,100,100);
        doc.setDrawColor(150,150,150);doc.setLineWidth(0.2);
        doc.text("Nombre:",cx+2,y+12);doc.line(cx+18,y+12.4,cx+colF-3,y+12.4);
        doc.text("Fecha y hora:",cx+2,y+18);doc.line(cx+22,y+18.4,cx+colF-3,y+18.4);
      });
      y+=24;
    }

    // ── Footer en cada página
    const pg=doc.getNumberOfPages();
    for(let i=1;i<=pg;i++){
      doc.setPage(i);
      doc.setDrawColor(201,169,110);doc.setLineWidth(0.3);doc.line(mg,H-10,W-mg,H-10);
      doc.setFontSize(7.5);doc.setTextColor(100,100,100);doc.setFont("helvetica","normal");
      doc.text("Gourmet Bites by Andrade Matuk · WhatsApp +57 310 444 1588 · @GourmetBitesbyAndradeMatuk",mg,H-6);
      doc.text("Pág. "+i+" de "+pg,W-mg,H-6,{align:"right"});
    }

    // ── Guardar
    const clSafe=(q.client||"sin").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-zA-Z0-9]/g,"_");
    const fname="Remision_"+clSafe+"_"+(q.id||q.quoteNumber||"doc")+(totalDesp>1?"_d"+(idx+1):"")+"_"+(fechaStr||"sinFecha")+".pdf";
    doc.save(fname);
    if(typeof hideLoader==="function")hideLoader();
    if(typeof toast==="function")toast("📄 Remisión generada","success");
  }catch(e){
    if(typeof hideLoader==="function")hideLoader();
    console.error("[genRemisionDespachoPDF]",e);
    if(typeof toast==="function")toast("Error generando remisión: "+e.message,"error");
    else alert("Error: "+e.message);
  }
}
