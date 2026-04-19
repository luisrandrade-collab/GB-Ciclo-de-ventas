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
const DEFAULT_MENAJE=["Platos","Cubiertos","Vasos","Copas / Cristalería","Mantelería","Servilletas","Bandejas","Charoles","Hielera","Jarras"];
let menajeItems=[];
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
function resetAllConditions(){if(!confirm("¿Restablecer todas las cláusulas a sus valores por defecto?"))return;Object.keys(DEFAULT_CONDICIONES).forEach(k=>condicionesData[k]=DEFAULT_CONDICIONES[k]);renderCondiciones()}

function renderReposicion(){
  const items=menajeItems.filter(m=>m.name&&(m.qty||m.price)).map(m=>m.name);
  const uniqueItems=[...new Set(items)];
  if(!uniqueItems.length){
    $("repo-list").innerHTML='<div style="font-size:11px;color:var(--soft);padding:8px;text-align:center;font-style:italic">Agrega items al menaje arriba para que aparezcan aquí con sus precios de reposición.</div>';
    return;
  }
  $("repo-list").innerHTML=uniqueItems.map(name=>{
    const curVal=reposicionData[name]||"";
    const sugVal=priceMemoryCache.reposicion[name]||"";
    const isSugg=!curVal&&sugVal;
    const displayVal=curVal||sugVal;
    return '<div class="repo-item"><span class="r-name">'+name+'</span><input type="number" class="r-input'+(isSugg?' sug':'')+'" placeholder="0" value="'+displayVal+'" onchange="updReposicion(\''+name.replace(/'/g,"\\'")+'\',this.value)">'+(isSugg?'<span class="repo-hint">↑ sugerido</span>':'')+'</div>';
  }).join("");
}
function updReposicion(name,val){reposicionData[name]=val;renderReposicion()}

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
    if(saved.meseros){Object.keys(saved.meseros).forEach(k=>{if(saved.meseros[k]&&!personalData.meseros[k])personalData.meseros[k]=saved.meseros[k]})}
    if(saved.auxiliares){Object.keys(saved.auxiliares).forEach(k=>{if(saved.auxiliares[k]&&!personalData.auxiliares[k])personalData.auxiliares[k]=saved.auxiliares[k]})}
  }catch(e){}
}
function savePersonalRates(){
  try{
    const toSave={
      meseros:{valor4h:personalData.meseros.valor4h,valorHoraExtra:personalData.meseros.valorHoraExtra},
      auxiliares:{valor4h:personalData.auxiliares.valor4h,valorHoraExtra:personalData.auxiliares.valorHoraExtra}
    };
    localStorage.setItem("gb_personal_rates",JSON.stringify(toSave));
  }catch(e){}
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
  if(!propSections.length&&!menajeItems.length){
    menajeItems=DEFAULT_MENAJE.map((n,i)=>({id:"m"+i,name:n,qty:"",price:""}));
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
  propSections.push({id:"ps"+Date.now(),name,options:[{id:"po"+Date.now(),label:"Opción A",items:[]}]});
  renderPropSections();
}

function renderPropSections(){
  const hasMulti=propSections.some(s=>s.options.length>1);
  const avisoHTML=hasMulti
    ?'<div class="prop-info-box"><div class="pib-title">Esta propuesta tiene varias opciones</div>Esta propuesta contiene varias opciones para que tu cliente escoja. Una vez el cliente confirme su selección en cada sección, genera una <strong>Propuesta Final</strong> con los ítems definitivos desde el Historial — ese será el documento que el cliente firma y aprueba formalmente para reservar la fecha.</div>'
    :'';
  $("prop-sections").innerHTML=avisoHTML+propSections.map((sec,si)=>{
    const optLetters="ABCDEFGH";
    return'<div class="prop-sec"><div class="sec-head"><span class="sec-title">'+sec.name+'</span><button class="del-btn" onclick="delPropSec('+si+')" title="Eliminar sección">×</button></div>'+
    sec.options.map((opt,oi)=>{
      const sub=opt.items.reduce((s,it)=>s+(it.price||0)*(it.qty||0),0);
      return'<div class="opt-card"><div class="opt-head"><span class="opt-label">'+opt.label+'</span><div><span class="opt-sub">'+fm(sub)+'</span><button class="del-btn" style="font-size:14px" onclick="delPropOpt('+si+','+oi+')">×</button></div></div>'+
      opt.items.map((it,ii)=>{
        const itSub=(it.price||0)*(it.qty||0);
        return '<div class="opt-item" style="flex-wrap:wrap"><div style="flex:1;min-width:120px"><div style="font-weight:600;font-size:12px">'+it.name+'</div>'+(it.desc?'<div style="font-size:10px;color:var(--soft)">'+it.desc+'</div>':'')+(it.unit?'<div style="font-size:9px;color:var(--mid);font-style:italic">'+it.unit+'</div>':'')+'</div><input type="number" step="0.1" min="0" style="width:50px;padding:3px 6px;border:1px solid var(--lt);border-radius:4px;text-align:center;font-size:12px" value="'+(it.qty||"")+'" title="Cantidad" onchange="updPropItem('+si+','+oi+','+ii+',\'qty\',+this.value)"><input type="number" style="width:75px;padding:3px 6px;border:1px solid var(--lt);border-radius:4px;text-align:right;font-size:11px" value="'+(it.price||0)+'" title="Precio unitario" onchange="updPropItem('+si+','+oi+','+ii+',\'price\',+this.value)"><span style="width:80px;text-align:right;font-size:12px;font-weight:700">'+fm(itSub)+'</span><button class="del-btn" style="font-size:14px" onclick="delPropItem('+si+','+oi+','+ii+')">×</button></div>';
      }).join("")+
      '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn bo" style="font-size:10px;padding:4px 10px" onclick="openPicker('+si+','+oi+')">+ Catálogo</button><button class="btn bo" style="font-size:10px;padding:4px 10px" onclick="addPropItemCustom('+si+','+oi+')">+ Custom</button></div></div>'
    }).join("")+
    '<button class="btn bo" style="font-size:11px;margin-top:8px" onclick="addPropOpt('+si+')">+ Opción '+(optLetters[sec.options.length]||sec.options.length+1)+'</button></div>'
  }).join("")
}

function delPropSec(si){if(confirm("¿Eliminar sección "+propSections[si].name+"?")){propSections.splice(si,1);renderPropSections()}}
function addPropOpt(si){const letters="ABCDEFGH";const sec=propSections[si];sec.options.push({id:"po"+Date.now(),label:"Opción "+(letters[sec.options.length]||sec.options.length+1),items:[]});renderPropSections()}
function delPropOpt(si,oi){propSections[si].options.splice(oi,1);renderPropSections()}

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
  $("pk-cats").innerHTML=catsList.map(c=>'<button class="cpill '+(c===pkCat?"act":"")+'" onclick="pkCat=\''+c.replace(/'/g,"\\'")+'\';renderPicker()">'+c+'</button>').join("");
  if(!catalogMatches.length&&!customMatches.length){$("pk-list").innerHTML='<div class="empty"><div class="ic">🔍</div><p>Sin resultados</p></div>';return}
  let html="";
  if(customMatches.length){
    html+='<div style="font-size:10px;font-weight:700;color:var(--gd);text-transform:uppercase;letter-spacing:.5px;padding:6px 4px;margin-top:4px">Productos Custom Guardados</div>';
    html+=customMatches.map(p=>'<div class="pcard" style="border-left:3px solid var(--gd)" onclick="pickCustomProduct(\''+p.id+'\')"><div class="pinfo"><div class="pname">'+p.n+' <span style="font-size:9px;background:var(--gd);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span>'+(p.promoted?' <span style="font-size:9px;background:#6A1B9A;color:#fff;padding:1px 5px;border-radius:3px">POPULAR</span>':"")+'</div>'+(p.d?'<div class="pdesc">'+p.d+'</div>':'')+(p.u?'<div class="punit">'+p.u+'</div>':"")+'<div class="pprice">'+fm(p.p||0)+'</div><div style="font-size:9px;color:var(--soft);margin-top:2px">'+(p.useCount||1)+' usos</div></div></div>').join("");
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

// ─── MENAJE ────────────────────────────────────────────────
function renderMenaje(){
  $("menaje-list").innerHTML=menajeItems.map((m,i)=>{
    const sugP=!m.price&&priceMemoryCache.menaje[m.name]?priceMemoryCache.menaje[m.name]:"";
    const priceClass=sugP?"mi-price sug":"mi-price";
    const priceTitle=sugP?'title="Sugerido de propuesta anterior"':"";
    return '<div class="menaje-item"><span style="flex:1;font-weight:600">'+m.name+'</span><input type="number" placeholder="Cant." style="width:55px;padding:4px 6px;border:1px solid var(--lt);border-radius:4px;text-align:center;font-size:12px" value="'+m.qty+'" onchange="menajeItems['+i+'].qty=this.value;renderMenaje();renderReposicion()"><input type="number" class="'+priceClass+'" placeholder="'+(sugP?sugP+" (sug)":"Precio")+'" value="'+m.price+'" '+priceTitle+' onchange="menajeItems['+i+'].price=this.value;renderMenaje();renderReposicion()"><button class="del-btn" style="font-size:14px" onclick="menajeItems.splice('+i+',1);renderMenaje();renderReposicion()">×</button></div>';
  }).join("");
  if($("repo-list"))renderReposicion();
}
function addMenajeItem(){const name=prompt("Nombre del ítem de menaje:");if(!name)return;menajeItems.push({id:"m"+Date.now(),name,qty:"",price:""});renderMenaje()}

// ─── SAVE / LOAD PROPUESTA ─────────────────────────────────
async function savePropQuote(silent){
  const cl=$("fp-cli").value.trim()||"Sin nombre";
  if(!cloudOnline){if(!silent)alert("Sin conexión. No se puede guardar.");return}
  try{
    if(!silent)showLoader("Generando consecutivo...");
    let pNum=currentPropNumber;
    if(!pNum)pNum=await getNextNumber("proposal");
    await autoSaveClientFromProp();
    propSections.forEach(sec=>sec.options.forEach(opt=>opt.items.forEach(it=>{if(!it.catId&&it.name){try{registerCustomProduct(it.name,it.desc||"",it.price||0,"")}catch(e){}}})));
    aperturaFrase=$("fp-apertura").value.trim()||aperturaFrase;
    fechaVencimiento=$("fp-fecha-venc").value||fechaVencimiento;
    let prevStatus="enviada",prevApprovalData=null,prevPropFinalRef=null,prevPagos=null,prevEntregaData=null,prevComentarioCliente=null,prevProductionDate=null,prevProduced=null,prevHoraEntrega=null;
    if(currentPropNumber){
      try{
        const {db,doc,getDoc}=window.fb;
        const existing=await getDoc(doc(db,"proposals",currentPropNumber));
        if(existing.exists()){
          const d=existing.data();
          if(d.status)prevStatus=d.status;
          if(d.approvalData)prevApprovalData=d.approvalData;
          if(d.propFinalRef)prevPropFinalRef=d.propFinalRef;
          if(d.pagos)prevPagos=d.pagos;
          if(d.entregaData)prevEntregaData=d.entregaData;
          if(d.comentarioCliente)prevComentarioCliente=d.comentarioCliente;
          if(d.productionDate)prevProductionDate=d.productionDate;
          if(typeof d.produced!=="undefined")prevProduced=d.produced;
          if(d.horaEntrega)prevHoraEntrega=d.horaEntrega;
        }
      }catch(e){console.warn("No se pudo leer estado previo:",e)}
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
      menaje:JSON.parse(JSON.stringify(menajeItems)),
      aperturaFrase:aperturaFrase,fechaVencimiento:fechaVencimiento,
      condicionesData:JSON.parse(JSON.stringify(condicionesData)),
      reposicionData:JSON.parse(JSON.stringify(reposicionData)),
      firma:firmaProp,status:prevStatus
    };
    if(prevApprovalData)pObj.approvalData=prevApprovalData;
    if(prevPropFinalRef)pObj.propFinalRef=prevPropFinalRef;
    if(prevPagos)pObj.pagos=prevPagos;
    if(prevEntregaData)pObj.entregaData=prevEntregaData;
    if(prevComentarioCliente)pObj.comentarioCliente=prevComentarioCliente;
    if(prevProductionDate)pObj.productionDate=prevProductionDate;
    if(prevProduced!==null)pObj.produced=prevProduced;
    if(prevHoraEntrega)pObj.horaEntrega=prevHoraEntrega;
    // v4.12.1: persistir el total real (mismo cálculo que el PDF) para que el dashboard sume bien
    pObj.total=computePropTotal(pObj);
    if(!silent)showLoader("Guardando en la nube...");
    await saveProposalToCloud(pObj);
    currentPropNumber=pNum;
    rememberPricesFromProposal();
    if(!silent){hideLoader();alert("✅ Borrador guardado: "+pNum)}
  }catch(e){if(!silent)hideLoader();alert("Error al guardar: "+e.message);console.error(e)}
}

function loadPropQuote(q){
  $("fp-cli").value=q.client||"";
  const idParts=(q.idStr||"").split(" ");
  if($("fp-idtype"))$("fp-idtype").value=idParts[0]||"";
  if($("fp-idnum"))$("fp-idnum").value=idParts.slice(1).join(" ")||"";
  $("fp-att").value=q.att||"";$("fp-mail").value=q.mail||"";$("fp-tel").value=q.tel||"";$("fp-dir").value=q.dir||"";
  $("fp-pers").value=q.pers||"";$("fp-momento").value=q.momento||"";$("fp-date").value=q.eventDate||"";
  if(q.city){
    const known=["La Calera","Bogotá","Chía","Cajicá"];
    if(q.cityType){$("fp-city").value=q.cityType;if(q.cityType==="Otra"){$("fp-city-custom").value=q.city||""}}
    else if(known.includes(q.city)){$("fp-city").value=q.city}
    else{$("fp-city").value="Otra";$("fp-city-custom").value=q.city}
    if($("fp-tr-custom"))$("fp-tr-custom").value=q.trCustom||"";
    updTrP();
  }
  propSections=q.sections||[];
  menajeItems=q.menaje||[];
  tipoServicio=q.tipoServicio||"";
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
  reposicionData=q.reposicionData?JSON.parse(JSON.stringify(q.reposicionData)):{};
  initCondiciones();
  if($("fp-apertura"))$("fp-apertura").value=aperturaFrase;
  if($("fp-fecha-venc")){if(fechaVencimiento){$("fp-fecha-venc").value=fechaVencimiento}else{setDefaultFechaVenc()}}
  firmaProp=q.firma||"jp";
  setFirma("prop",firmaProp);
  currentPropNumber=q.quoteNumber||null;
  showClientHistoryPanel(q.client||"","prop");
  renderPropSections();renderMenaje();renderPersonal();renderCondiciones();renderReposicion();
}

// ─── PROPUESTA FINAL ───────────────────────────────────────
async function openPropFinalFlow(propId,ev){
  if(ev){ev.stopPropagation();ev.preventDefault()}
  if(!cloudOnline){alert("Sin conexión. Necesitamos internet para cargar la propuesta.");return}
  try{
    showLoader("Cargando propuesta...");
    const {db,doc,getDoc}=window.fb;
    const snap=await getDoc(doc(db,"proposals",propId));
    hideLoader();
    if(!snap.exists()){alert("No se encontró la propuesta");return}
    propFinalSource={id:propId,...snap.data()};
    propFinalSelection={};
    (propFinalSource.sections||[]).forEach(sec=>{if(sec.options&&sec.options.length){propFinalSelection[sec.id]=sec.options[0].id}});
    renderPropFinalPicker();
    $("propfinal-modal").classList.remove("hidden");
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
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
  if(!cloudOnline){alert("Sin conexión.");return}
  const secs=propFinalSource.sections||[];
  const sinSeleccion=secs.filter(s=>(s.options||[]).length>0&&!propFinalSelection[s.id]);
  if(sinSeleccion.length){alert("Falta escoger opción en: "+sinSeleccion.map(s=>s.name).join(", "));return}
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
    menajeItems=JSON.parse(JSON.stringify(src.menaje||[]));
    personalData=JSON.parse(JSON.stringify(src.personalData||{meseros:{},auxiliares:{}}));
    tipoServicio=src.tipoServicio||"";
    condicionesData=JSON.parse(JSON.stringify(src.condicionesData||{}));
    reposicionData=JSON.parse(JSON.stringify(src.reposicionData||{}));
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
      sections:pfSections,menaje:menajeItems,
      aperturaFrase:aperturaFrase,fechaVencimiento:fechaVencimiento,
      condicionesData:condicionesData,reposicionData:reposicionData,
      firma:firmaProp,status:"propfinal",sourceProposal:src.id
    };
    // v4.12.1: persistir el total real para que el dashboard sume bien
    pfObj.total=computePropTotal(pfObj);
    const {db,doc,setDoc,updateDoc,serverTimestamp}=window.fb;
    await setDoc(doc(db,"propfinals",pfNum),{...pfObj,createdAt:serverTimestamp()});
    await updateDoc(doc(db,"proposals",src.id),{status:"convertida",propFinalRef:pfNum,updatedAt:serverTimestamp()});
    const localProp=quotesCache.find(x=>x.id===src.id&&x.kind==="proposal");
    if(localProp){localProp.status="convertida";localProp.propFinalRef=pfNum}
    quotesCache.unshift({kind:"proposal",id:pfNum,...pfObj,createdAt:{toDate:()=>new Date()}});
    currentPropNumber=pfNum;
    window.__pfMode=true;
    hideLoader();
    closePropFinalModal();
    await genPropPDF();
    window.__pfMode=false;
    renderHist();
  }catch(e){hideLoader();window.__pfMode=false;alert("Error generando Propuesta Final: "+e.message);console.error(e)}
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
    try{const li=new Image();li.src=LOGO_IW;doc.addImage(li,"JPEG",(W-65)/2,4,65,65*(272/500))}catch(e){}
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
    propSections.forEach(sec=>{
      sec.options.forEach(opt=>{
        const td=[];
        td.push([{content:sec.name.toUpperCase()+" — "+opt.label,colSpan:4,styles:{fillColor:[26,26,26],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
        opt.items.forEach(it=>{
          const qStr=it.qty%1===0?String(it.qty):it.qty.toFixed(1);
          const nameCol=it.name+(it.desc?"\n"+it.desc:"")+(it.unit?"\n("+it.unit+")":"");
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
    const usedMenaje=menajeItems.filter(m=>m.qty||m.price);
    if(usedMenaje.length){
      const mtd=[];
      mtd.push([{content:"MENAJE",colSpan:4,styles:{fillColor:[201,169,110],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
      usedMenaje.forEach(m=>{mtd.push([m.name,String(m.qty||""),m.price?fm(parseInt(m.price)):"—",m.qty&&m.price?fm(parseInt(m.qty)*parseInt(m.price)):"—"])});
      const mSub=usedMenaje.reduce((s,m)=>s+(parseInt(m.price)||0)*(parseInt(m.qty)||0),0);
      if(mSub)mtd.push([{content:"",colSpan:2},{content:"Subtotal",styles:{fontStyle:"bold",halign:"right",fontSize:8}},{content:fm(mSub),styles:{fontStyle:"bold",halign:"right",fontSize:8,textColor:[76,175,80]}}]);
      const est2=estH(usedMenaje.length);
      if(y+est2>H-footerH){doc.addPage();y=20}
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:mtd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.50},1:{halign:"center",cellWidth:tw*.10},2:{halign:"right",cellWidth:tw*.20},3:{halign:"right",cellWidth:tw*.20}},bodyStyles:{fontSize:8,cellPadding:{top:3.5,bottom:3.5,left:6,right:6},textColor:[60,60,60]},alternateRowStyles:{fillColor:[250,250,248]},styles:{cellPadding:{top:3.5,bottom:3.5,left:6,right:6}},didParseCell:function(data){if(data.row.index===mtd.length-1&&data.section==="body"){data.cell.styles.fillColor=[255,255,255]}}});
      y=doc.lastAutoTable.finalY+5;
    }
    let totMenu=0;let totCatering=0;
    propSections.forEach(sec=>{
      const isCateringSec=/servicio\s*de\s*catering|coordinaci[oó]n/i.test(sec.name||"");
      sec.options.forEach(opt=>{
        if(opt.label==="Opción A"||sec.options.length===1){
          opt.items.forEach(it=>{const val=(it.price||0)*(it.qty||0);if(isCateringSec)totCatering+=val;else totMenu+=val});
        }
      });
    });
    let totMenajeVal=0;
    menajeItems.forEach(m=>{const q=parseFloat(m.qty)||0,p=parseFloat(m.price)||0;totMenajeVal+=q*p});
    const totPersonal=persTotal;
    const trP=getTrP();const totTransp=trP?trP.p:0;
    const totalServicio=totMenu+totCatering+totMenajeVal+totPersonal+totTransp;
    const estR=estH(5)+14;
    if(y+estR>H-footerH){doc.addPage();y=20}
    const rtd=[];
    rtd.push([{content:"TOTAL DEL SERVICIO",colSpan:2,styles:{fillColor:[26,26,26],textColor:[255,255,255],fontStyle:"bold",fontSize:9.5,halign:"left"}}]);
    rtd.push(["Experiencia Gastronómica",fm(totMenu)]);
    if(totCatering>0)rtd.push(["Servicio de Catering",fm(totCatering)]);
    if(totMenajeVal>0)rtd.push(["Menaje",fm(totMenajeVal)]);
    if(totPersonal>0)rtd.push(["Personal de Servicio",fm(totPersonal)]);
    if(totTransp>0)rtd.push(["Transporte "+(trP?trP.n.replace("Transporte ",""):""),fm(totTransp)]);
    rtd.push([{content:"TOTAL",styles:{fontStyle:"bold",fontSize:10,fillColor:[244,243,241]}},{content:fm(totalServicio),styles:{fontStyle:"bold",halign:"right",fontSize:11,textColor:[201,169,110],fillColor:[244,243,241]}}]);
    doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:rtd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.60},1:{halign:"right",cellWidth:tw*.40}},bodyStyles:{fontSize:9,cellPadding:{top:4,bottom:4,left:8,right:8},textColor:[40,40,40]},styles:{cellPadding:{top:4,bottom:4,left:8,right:8}}});
    y=doc.lastAutoTable.finalY+3;
    const hasMultipleOptions=!isFinal&&propSections.some(sec=>sec.options.length>1);
    if(hasMultipleOptions){
      doc.setFont("helvetica","italic");doc.setFontSize(8);doc.setTextColor(100,100,100);
      const notaTotal="Nota: Este total corresponde a la selección de la Opción A en cada sección. El valor final variará según las opciones que usted escoja en cada sección.";
      const notaWrap=doc.splitTextToSize(notaTotal,tw-4);
      notaWrap.forEach(line=>{doc.text(line,mg+2,y);y+=3.5});
      doc.setTextColor(26,26,26);y+=3;
    }else{y+=3}
    const repoItems=[];
    menajeItems.filter(m=>m.name&&(m.qty||m.price)).forEach(m=>{if(reposicionData[m.name])repoItems.push({name:m.name,price:reposicionData[m.name]})});
    if(repoItems.length){
      const estRep=estH(repoItems.length)+14;
      if(y+estRep>H-footerH){doc.addPage();y=20}
      const reptd=[];
      reptd.push([{content:"VALORES DE REPOSICIÓN DE MENAJE",colSpan:2,styles:{fillColor:[211,47,47],textColor:[255,255,255],fontStyle:"bold",fontSize:8.5,halign:"left"}}]);
      reptd.push([{content:"En caso de daño, rotura o pérdida del menaje durante el evento, los siguientes valores corresponden al costo de reposición:",colSpan:2,styles:{fontSize:7.5,fontStyle:"italic",textColor:[100,100,100],fillColor:[254,248,248]}}]);
      repoItems.forEach(r=>{reptd.push([r.name,fm(parseInt(r.price)||0)])});
      doc.autoTable({startY:y,margin:{left:mg,right:mg,bottom:footerH},body:reptd,theme:"grid",columnStyles:{0:{halign:"left",cellWidth:tw*.70},1:{halign:"right",cellWidth:tw*.30}},bodyStyles:{fontSize:8,cellPadding:{top:3,bottom:3,left:6,right:6},textColor:[60,60,60]},styles:{cellPadding:{top:3,bottom:3,left:6,right:6}}});
      y=doc.lastAutoTable.finalY+6;
    }
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
    await savePdf(doc,currentPropNumber+"_"+cl.replace(/\s+/g,"_")+".pdf");
  }catch(err){alert("Error generando PDF: "+err.message);console.error(err)}
}
