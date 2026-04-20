// ═══════════════════════════════════════════════════════════
// app-core.js · v4.12 · 2026-04-19
// Firebase wrapper, PIN (sessionStorage únicamente), state global,
// helpers, INIT, mode switching, search, transporte, cart,
// navegación, clientes, autoTransition, getNextNumber.
// ═══════════════════════════════════════════════════════════

// ─── BUILD METADATA ────────────────────────────────────────
const BUILD_VERSION="v4.12.5";
const BUILD_DATE="2026-04-19";
const PIN_CODE="8421";
const APP_YEAR=new Date().getFullYear();

// ─── PDF SHARE/DOWNLOAD (v4.12.2) ──────────────────────────
// Reemplaza doc.save() para evitar que en iPhone se filtre el blob URL al compartir.
// En móviles (iOS/Android) usa Web Share API nativa: el PDF va al share sheet
// directo como archivo, sin pegar el URL del sitio en WhatsApp.
// En desktop cae al doc.save() clásico (descarga directa).
async function savePdf(doc,filename){
  try{
    const blob=doc.output("blob");
    const file=new File([blob],filename,{type:"application/pdf"});
    // Si el navegador soporta compartir archivos, lo usamos (iOS/Android modernos)
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{
        await navigator.share({files:[file],title:filename});
        return;
      }catch(e){
        // Usuario canceló el share — no es un error, pero como no se compartió
        // ofrecemos la descarga clásica para que no se quede sin el PDF
        if(e&&e.name==="AbortError")return;
        console.warn("Web Share falló, descargando:",e);
      }
    }
  }catch(e){console.warn("savePdf blob falló, fallback a doc.save():",e)}
  // Fallback: descarga directa (desktop o navegadores sin Web Share)
  doc.save(filename);
}

// ─── CATÁLOGO DE PRODUCTOS ─────────────────────────────────
const MX=12;
const C=[
  {id:1,c:"Libanés - Mezza",n:"Hummus / Tahinne con Garbanzos",d:"Con aceite de oliva, ajo y limón",p:34000,u:"Porción 10 pers"},
  {id:2,c:"Libanés - Mezza",n:"Babaganush / Tahinne Berenjenas",d:"Puré de berenjenas asadas con tahinne",p:31000,u:"Porción 10 pers"},
  {id:3,c:"Libanés - Mezza",n:"Tahinne de Lentejas",d:"Puré de lentejas, aceite de oliva",p:34000,u:"Porción 10 pers"},
  {id:4,c:"Libanés - Mezza",n:"Falafel / Croquetas Garbanzos",d:"Fritas, con hierbas y especias",p:42000,u:"10 unidades"},
  {id:5,c:"Libanés - Mezza",n:"Labne / Yogurt",d:"Servido con aceite de oliva",p:19000,u:"Porción"},
  {id:6,c:"Libanés - Mezza",n:"Jiar Bi Laban / Ensalada Pepino",d:"Con labne, pepino y yerbabuena",p:40000,u:"Porción 12 pers"},
  {id:7,c:"Libanés - Mezza",n:"Quibbe Naye / Quibbe Crudo",d:"Para acompañar con pan pita",p:100000,u:"Bandeja 12 pers"},
  {id:8,c:"Libanés - Mezza",n:"Pan Pita",d:"5 panes grandes",p:12000,u:"5 panes"},
  {id:9,c:"Libanés - Principales",n:"Quibbe en Charol",d:"Relleno carne picada, especias árabes",p:250000,u:"Charol 15 porc"},
  {id:10,c:"Libanés - Principales",n:"Quibbe BBQ",d:"Asados al BBQ, condimento árabe",p:15000,u:"1 unidad"},
  {id:11,c:"Libanés - Principales",n:"Shawuarma Pollo (1 ud)",d:"Marinadas en labne, condimento árabe",p:39500,u:"1 unidad"},
  {id:12,c:"Libanés - Principales",n:"Shawuarma (10-24 uds)",d:"Precio por unidad",p:34000,u:"c/u"},
  {id:13,c:"Libanés - Principales",n:"Shawuarma (25+ uds)",d:"Precio por unidad",p:29500,u:"c/u"},
  {id:14,c:"Libanés - Principales",n:"Kaftas / Pinchos Carne",d:"Perejil, cebolla, condimento árabe",p:17000,u:"2 pinchos"},
  {id:15,c:"Libanés - Principales",n:"Shish Taouk / Pinchos Pollo",d:"Condimento árabe y Labneh",p:15000,u:"2 pinchos"},
  {id:16,c:"Libanés - Principales",n:"Arroz Reina (10 pers)",d:"Pollo, condimento árabe, almendras",p:162000,u:"10 personas"},
  {id:17,c:"Libanés - Principales",n:"Arroz Reina (individual)",d:"Pollo, condimento árabe, almendras",p:19000,u:"Individual"},
  {id:18,c:"Libanés - Principales",n:"Myádra / Arroz Lentejas (10p)",d:"Arroz con lentejas y cebollas fritas",p:112500,u:"10 personas"},
  {id:19,c:"Libanés - Principales",n:"Myádra / Arroz Lentejas (indiv)",d:"Arroz con lentejas y cebollas fritas",p:15000,u:"Individual"},
  {id:20,c:"Libanés - Principales",n:"Tabbule",d:"Ensalada trigo, perejil, tomate",p:85000,u:"10 personas"},
  {id:21,c:"Libanés - Principales",n:"Fattush",d:"Ensalada con pan pita tostado",p:85000,u:"10 personas"},
  {id:22,c:"Libanés - Principales",n:"Hojas de Parra (10 uds)",d:"Envueltos con carne y arroz",p:35000,u:"10 unidades"},
  {id:23,c:"Libanés - Principales",n:"Hojas de Parra (20 uds)",d:"Envueltos con carne y arroz",p:65000,u:"20 unidades"},
  {id:24,c:"Libanés - Principales",n:"Hojas de Repollo (10 uds)",d:"Envueltos con carne y arroz",p:35000,u:"10 unidades"},
  {id:25,c:"Libanés - Principales",n:"Hojas de Repollo (20 uds)",d:"Envueltos con carne y arroz",p:65000,u:"20 unidades"},
  {id:26,c:"Libanés - Platos Mixtos",n:"Plato Mixto Libanés",d:"Arroz Reina, Tabbule, Hojas, Quibbe BBQ, Tahinne, Ghraybe",p:56500,u:"por plato"},
  {id:27,c:"Libanés - Platos Mixtos",n:"Plato Mixto Vegetariano",d:"Tabbule, Falafel, Arroz lentejas, Berenjenas, Tahinne, Labne",p:45000,u:"por plato"},
  {id:28,c:"Libanés - Postres",n:"Arroz con Leche (10 pers)",d:"Pistachos y agua de azahar",p:70000,u:"10 personas"},
  {id:29,c:"Libanés - Postres",n:"Arroz con Leche (individual)",d:"Pistachos y agua de azahar",p:8000,u:"Individual"},
  {id:40,c:"Cocinas del Mundo",n:"Tortilla de Papa",d:"Clásico cocina Española",p:70000,u:"10 personas"},
  {id:41,c:"Cocinas del Mundo",n:"Pimentones Asados",d:"A la brasa, aceite y ajo",p:31500,u:"10 personas"},
  {id:42,c:"Cocinas del Mundo",n:"Zuchinis Marinados",d:"Aceite, hierbas provenzales, ajo",p:45000,u:"10 personas"},
  {id:43,c:"Cocinas del Mundo",n:"Chutney Durazno / Mango",d:"Sabor exótico afrutado",p:31500,u:"10 personas"},
  {id:44,c:"Cocinas del Mundo",n:"Mermelada Tomates Cherry",d:"Dulzura y acidez",p:32100,u:"10 personas"},
  {id:45,c:"Cocinas del Mundo",n:"Paella Gourmet Bites",d:"Mezcla de tierra y mar",p:58000,u:"Individual"},
  {id:46,c:"Cocinas del Mundo",n:"Arroz Costilla Encervezada",d:"Arroz, cerdo y cerveza",p:54000,u:"Individual"},
  {id:47,c:"Cocinas del Mundo",n:"Bondiola Marroquí",d:"Horno de leña, frutos secos",p:290000,u:"10 personas"},
  {id:48,c:"Cocinas del Mundo",n:"Lasagna Gourmet (10 pers)",d:"Carne res o cerdo, vino tinto",p:270000,u:"10 personas"},
  {id:50,c:"Cocinas del Mundo",n:"Sandwiches de Focaccia",d:"Jamones, quesos, rúgula + bebida y papas",p:37500,u:"Individual"},
  {id:51,c:"Cocinas del Mundo",n:"Papas Rostizadas al Horno",d:"Ajo, laurel, tomillo, orégano",p:70000,u:"10 personas"},
  {id:52,c:"Cocinas del Mundo",n:"Arroz Amarillo",d:"Laurel y cúrcuma",p:56500,u:"10 personas"},
  {id:53,c:"Cocinas del Mundo",n:"Arroz Verde",d:"Con cilantro",p:56500,u:"10 personas"},
  {id:54,c:"Cocinas del Mundo",n:"Arroz Basmati",d:"",p:60000,u:"10 personas"},
  {id:55,c:"Cocinas del Mundo",n:"Tomates Asados Balsámico y Miel",d:"Aceite de oliva",p:40000,u:"10 personas"},
  {id:56,c:"Cocinas del Mundo",n:"Ensalada Delirio Frutos Queso Cabra",d:"Lechugas, frutas, nueces",p:105000,u:"10 personas"},
  {id:57,c:"Cocinas del Mundo",n:"Ensalada Verde",d:"Lechugas, mango, dressing cilantro",p:75000,u:"10 personas"},
  {id:58,c:"Cocinas del Mundo",n:"Cogollos con Queso Azul",d:"Cremosa salsa queso azul",p:80000,u:"10 personas"},
  {id:59,c:"Cocinas del Mundo",n:"Paella Vegetariana",d:"Vegetales frescos, hongos porcini",p:56500,u:"Individual"},
  {id:60,c:"Cocinas del Mundo",n:"Lasagna Vegetariana (10p)",d:"Champiñones, espinacas, ricotta",p:270000,u:"10 personas"},
  {id:62,c:"Cocinas del Mundo",n:"Macarrones con Queso",d:"Salsa 5 quesos, gratinada",p:180000,u:"10 personas"},
  {id:70,c:"Pastelería",n:"Pan de Banano Sencillo",d:"",p:50000,u:"10 porciones"},
  {id:71,c:"Pastelería",n:"Pan de Banano Nueces",d:"",p:55000,u:"10 porciones"},
  {id:72,c:"Pastelería",n:"Pan de Banano Chips Chocolate",d:"",p:55000,u:"10 porciones"},
  {id:73,c:"Pastelería",n:"Pan de Banano Mixto",d:"",p:59000,u:"10 porciones"},
  {id:74,c:"Pastelería",n:"Pan de Banano Fit",d:"",p:64000,u:"10 porciones"},
  {id:80,c:"Pastelería",n:"Chocolate Fudge Cake",d:"",p:70000,u:"15 porciones"},
  {id:81,c:"Pastelería",n:"Double Fudge Chocolate Cake",d:"",p:130000,u:"30 porciones"},
  {id:82,c:"Pastelería",n:"Torta Almojabana (6p)",d:"",p:56000,u:"6 porciones"},
  {id:83,c:"Pastelería",n:"Torta Almojabana (10p)",d:"",p:100500,u:"10 porciones"},
  {id:84,c:"Pastelería",n:"Ponque Naranja Amapola (15p)",d:"",p:81500,u:"15 porciones"},
  {id:85,c:"Pastelería",n:"Ponque Naranja Amapola (30p)",d:"",p:150000,u:"30 porciones"},
  {id:86,c:"Pastelería",n:"Torta Zanahoria Nueces (8p)",d:"",p:60000,u:"8 porciones"},
  {id:87,c:"Pastelería",n:"Torta Zanahoria Nueces (15p)",d:"",p:110000,u:"15 porciones"},
  {id:88,c:"Pastelería",n:"Adición Betún",d:"Para torta zanahoria",p:25000,u:""},
  {id:89,c:"Pastelería",n:"Capricho de Avellana",d:"",p:130000,u:"12 porciones"},
  {id:90,c:"Pastelería",n:"Tiramisú de Pistacho",d:"",p:175000,u:"10 porciones"},
  {id:91,c:"Pastelería",n:"Peanut Butter Oreo Cheesecake",d:"",p:130000,u:"10 porciones"},
  {id:92,c:"Pastelería",n:"Tres Leches (6p)",d:"",p:60000,u:"6 porciones"},
  {id:93,c:"Pastelería",n:"Tres Leches (10p)",d:"",p:105000,u:"10 porciones"},
  {id:94,c:"Pastelería",n:"Torta de Coco (10p)",d:"",p:56500,u:"10 porciones"},
  {id:95,c:"Pastelería",n:"Torta de Coco (20p)",d:"",p:100000,u:"20 porciones"},
  {id:96,c:"Pastelería",n:"Knefe / Dulce de Queso",d:"",p:120000,u:"15 porciones"},
  {id:100,c:"Cupcakes & Ghraybes",n:"Cupcakes (unidad)",d:"Banano, Zanahoria o Chocolate",p:6500,u:"1 unidad"},
  {id:101,c:"Cupcakes & Ghraybes",n:"Cupcakes (caja x6)",d:"Banano, Zanahoria o Chocolate",p:31500,u:"6 unidades"},
  {id:102,c:"Cupcakes & Ghraybes",n:"Cupcakes (caja x12)",d:"Banano, Zanahoria o Chocolate",p:57500,u:"12 unidades"},
  {id:103,c:"Cupcakes & Ghraybes",n:"Ghraybes (unidad)",d:"Galleta árabe",p:2000,u:"1 unidad"},
  {id:104,c:"Cupcakes & Ghraybes",n:"Ghraybes (½ lb, caja x13)",d:"Galletas árabes",p:25000,u:"media libra"},
  {id:105,c:"Cupcakes & Ghraybes",n:"Ghraybes (1 lb, caja x26)",d:"Galletas árabes",p:41000,u:"1 libra"},
  {id:110,c:"Focaccias",n:"Focaccia Italiana - L",d:"Tomates cherry, aceitunas, orégano",p:52500,u:"42x26cm"},
  {id:111,c:"Focaccias",n:"Focaccia Italiana - M",d:"",p:37500,u:"33x22cm"},
  {id:112,c:"Focaccias",n:"Focaccia Italiana - S",d:"",p:14000,u:"15.5x20.5cm"},
  {id:113,c:"Focaccias",n:"Focaccia Mediterránea - L",d:"Zucchini, aceite oliva, hierbas",p:52500,u:"42x26cm"},
  {id:114,c:"Focaccias",n:"Focaccia Mediterránea - M",d:"",p:37500,u:"33x22cm"},
  {id:115,c:"Focaccias",n:"Focaccia Mediterránea - S",d:"",p:14000,u:"15.5x20.5cm"},
  {id:116,c:"Focaccias",n:"Focaccia Rosmarino - L",d:"Aceite oliva virgen, sal gruesa",p:52500,u:"42x26cm"},
  {id:117,c:"Focaccias",n:"Focaccia Rosmarino - M",d:"",p:37500,u:"33x22cm"},
  {id:118,c:"Focaccias",n:"Focaccia Rosmarino - S",d:"",p:14000,u:"15.5x20.5cm"},
  {id:119,c:"Focaccias",n:"Focaccia Cipolle/Aglio - L",d:"Cebollas caramelizadas o ajos",p:52500,u:"42x26cm"},
  {id:120,c:"Focaccias",n:"Focaccia Cipolle/Aglio - M",d:"",p:37500,u:"33x22cm"},
  {id:121,c:"Focaccias",n:"Focaccia Cipolle/Aglio - S",d:"",p:14000,u:"15.5x20.5cm"},
  {id:122,c:"Focaccias",n:"Apple Fritter Focaccia - L",d:"Manzana, canela, glaseado",p:62000,u:"42x26cm"},
  {id:123,c:"Focaccias",n:"Apple Fritter Focaccia - M",d:"",p:40000,u:"33x22cm"},
  {id:124,c:"Focaccias",n:"Apple Fritter Focaccia - S",d:"",p:22000,u:"15.5x20.5cm"},
  {id:130,c:"Congelados",n:"Mini quibbe bola 25g",d:"Congelado",p:2200,u:"1 unidad"},
  {id:131,c:"Congelados",n:"Mini quibbe canasta 25g",d:"Congelado",p:2500,u:"1 unidad"},
  {id:132,c:"Congelados",n:"Quibbe BBQ congelado",d:"",p:15000,u:"1 unidad"},
  {id:133,c:"Congelados",n:"Falafel congelado",d:"",p:42000,u:"10 unidades"},
  {id:134,c:"Congelados",n:"Hojas Parra cong (10)",d:"",p:35000,u:"10 unidades"},
  {id:135,c:"Congelados",n:"Hojas Parra cong (20)",d:"",p:65000,u:"20 unidades"},
  {id:136,c:"Congelados",n:"Hojas Repollo cong (10)",d:"",p:35000,u:"10 unidades"},
  {id:137,c:"Congelados",n:"Hojas Repollo cong (20)",d:"",p:65000,u:"20 unidades"},
  {id:138,c:"Congelados",n:"Kaftas congeladas",d:"2 pinchos carne",p:17000,u:"2 pinchos"},
  {id:139,c:"Congelados",n:"Shish Taouk congelados",d:"2 pinchos pollo",p:17000,u:"2 pinchos"},
  {id:141,c:"Congelados",n:"Lasagna de Res cong (indiv)",d:"Congelada, 400 gr",p:30000,u:"Individual"},
  {id:142,c:"Congelados",n:"Lasagna de Cerdo cong (indiv)",d:"Congelada, 400 gr",p:30000,u:"Individual"},
  {id:143,c:"Congelados",n:"Lasagna de Pollo cong (indiv)",d:"Congelada, 400 gr",p:30000,u:"Individual"},
  {id:145,c:"Congelados",n:"Lasagna Vegetariana cong (indiv)",d:"Congelada, 400 gr",p:30000,u:"Individual"},
  {id:160,c:"Congelados",n:"Sopa de Ahuyama",d:"Congelada",p:25000,u:"500 gr"},
  {id:161,c:"Congelados",n:"Sopa de Zanahoria con Jengibre",d:"Congelada",p:25000,u:"500 gr"},
  {id:162,c:"Congelados",n:"Sopa de Tomates Rostizados",d:"Congelada",p:25000,u:"500 gr"},
  {id:163,c:"Congelados",n:"Sopa de Espinaca",d:"Congelada",p:25000,u:"500 gr"},
  {id:164,c:"Congelados",n:"Sopa de Espinaca con Tahinne y Limón",d:"Congelada",p:25000,u:"500 gr"},
  {id:165,c:"Congelados",n:"Sopa de Lentejas con Chorizo",d:"Congelada",p:25000,u:"500 gr"}
];
const TR={"La Calera":{n:"Transporte La Calera",p:10000},"Bogotá":{n:"Transporte Bogotá",p:20000},"Chía":{n:"Transporte Chía / Cajicá",p:40000},"Cajicá":{n:"Transporte Chía / Cajicá",p:40000}};
const CATS=["Todas",...new Set(C.map(x=>x.c))];

// ─── HELPERS ───────────────────────────────────────────────
const fm=n=>"$"+n.toLocaleString("es-CO");
const $=id=>document.getElementById(id);

// ─── STATE GLOBAL ──────────────────────────────────────────
let cart=[],cust=[],selCat="Todas",curStep="info",curMode="dash";
let cloudOnline=false;
let clientsCache=[];
let customProductsCache=[];
let quotesCache=[];
let currentQuoteNumber=null;
let histFilter="all";
let propFinalSelection={};
let propFinalSource=null;

// ─── CICLO DE VIDA: estados ────────────────────────────────
const STATUS_META={
  enviada:      {label:"Enviada",         cls:"enviada",       desc:"Cotización enviada al cliente"},
  pedido:       {label:"Pedido",          cls:"pedido",        desc:"Cliente aprobó — pedido confirmado"},
  entregado:    {label:"Entregado",       cls:"entregado",     desc:"Pedido entregado / evento ejecutado"},
  propfinal:    {label:"Propuesta Final", cls:"propfinal",     desc:"Propuesta final lista para firma"},
  aprobada:     {label:"Aprobada",        cls:"aprobada",      desc:"Cliente firmó — evento reservado"},
  en_produccion:{label:"En producción",   cls:"en_produccion", desc:"Evento en curso — cocina en marcha"},
  convertida:   {label:"Convertida",      cls:"convertida",    desc:"Convertida a Propuesta Final"}
};

// ─── PIN LOCK (v4.12: SOLO sessionStorage) ────────────────
let pinBuffer="";
function renderPinPad(){
  const keys=["1","2","3","4","5","6","7","8","9","","0","⌫"];
  $("pin-pad").innerHTML=keys.map(k=>{
    if(!k)return '<button class="pin-key empty"></button>';
    if(k==="⌫")return '<button class="pin-key" onclick="pinBack()">⌫</button>';
    return '<button class="pin-key" onclick="pinPress(\''+k+'\')">'+k+'</button>';
  }).join("");
}
function pinPress(d){
  if(pinBuffer.length>=4)return;
  pinBuffer+=d;
  updatePinDots();
  if(pinBuffer.length===4)setTimeout(checkPin,150);
}
function pinBack(){pinBuffer=pinBuffer.slice(0,-1);updatePinDots()}
function updatePinDots(){
  const dots=$("pin-dots").children;
  for(let i=0;i<4;i++){
    dots[i].classList.remove("filled","error");
    if(i<pinBuffer.length)dots[i].classList.add("filled");
  }
  $("pin-err").classList.remove("show");
}
function checkPin(){
  if(pinBuffer===PIN_CODE){
    // v4.12: SOLO sessionStorage (cerrar pestaña/navegador → pide PIN de nuevo)
    sessionStorage.setItem("gb_unlocked","1");
    $("pin-overlay").style.display="none";
    initApp();
  }else{
    const dots=$("pin-dots").children;
    for(let i=0;i<4;i++)dots[i].classList.add("error");
    $("pin-err").classList.add("show");
    setTimeout(()=>{pinBuffer="";updatePinDots()},600);
  }
}
function logoutSession(){
  if(!confirm("¿Cerrar sesión? Tendrás que ingresar el PIN de nuevo."))return;
  sessionStorage.removeItem("gb_unlocked");
  // v4.12: borrar también el legacy localStorage si existe (limpieza de upgrade)
  try{localStorage.removeItem("gb_unlocked")}catch{}
  location.reload();
}

// ─── CLOUD INDICATOR ───────────────────────────────────────
function setCloudStatus(online){
  cloudOnline=online;
  const el=$("cloud-ind");
  if(online){el.className="cloud-ind on";el.textContent="☁ Nube conectada"}
  else{el.className="cloud-ind off";el.textContent="⚫ Sin conexión"}
}

// ─── FIRESTORE LAYER ───────────────────────────────────────
async function fbReady(){
  if(window.fbLoaded)return true;
  return new Promise(r=>window.addEventListener("fbready",()=>r(true),{once:true}));
}

async function loadClientsFromCloud(){
  try{
    const {db,collection,getDocs,query,orderBy}=window.fb;
    const q=query(collection(db,"clients"),orderBy("name"));
    const snap=await getDocs(q);
    clientsCache=[];
    snap.forEach(d=>clientsCache.push({id:d.id,...d.data()}));
    localStorage.setItem("gb_clients_cache",JSON.stringify(clientsCache));
    return clientsCache;
  }catch(e){
    console.error("loadClients error",e);
    try{clientsCache=JSON.parse(localStorage.getItem("gb_clients_cache")||"[]")}catch{}
    return clientsCache;
  }
}

async function saveClientToCloud(obj){
  const {db,collection,doc,addDoc,updateDoc,serverTimestamp}=window.fb;
  const existing=clientsCache.find(c=>c.name.toLowerCase()===obj.name.toLowerCase());
  if(existing&&existing.id){
    await updateDoc(doc(db,"clients",existing.id),{...obj,updatedAt:serverTimestamp()});
    Object.assign(existing,obj);
  }else{
    const ref=await addDoc(collection(db,"clients"),{...obj,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    clientsCache.push({id:ref.id,...obj});
    clientsCache.sort((a,b)=>a.name.localeCompare(b.name));
  }
  localStorage.setItem("gb_clients_cache",JSON.stringify(clientsCache));
}

async function deleteClientFromCloud(id){
  const {db,doc,deleteDoc}=window.fb;
  await deleteDoc(doc(db,"clients",id));
  clientsCache=clientsCache.filter(c=>c.id!==id);
  localStorage.setItem("gb_clients_cache",JSON.stringify(clientsCache));
}

async function loadCustomProducts(){
  try{
    const {db,collection,getDocs}=window.fb;
    const snap=await getDocs(collection(db,"custom_products"));
    customProductsCache=[];
    snap.forEach(d=>customProductsCache.push({id:d.id,...d.data()}));
    localStorage.setItem("gb_cprods_cache",JSON.stringify(customProductsCache));
    return customProductsCache;
  }catch(e){
    console.error("loadCustomProducts error",e);
    try{customProductsCache=JSON.parse(localStorage.getItem("gb_cprods_cache")||"[]")}catch{}
    return customProductsCache;
  }
}

async function registerCustomProduct(n,d,p,u){
  const {db,collection,doc,addDoc,updateDoc,serverTimestamp}=window.fb;
  const existing=customProductsCache.find(x=>x.n.toLowerCase()===n.toLowerCase());
  if(existing){
    const newCount=(existing.useCount||1)+1;
    const promoted=newCount>=3;
    await updateDoc(doc(db,"custom_products",existing.id),{useCount:newCount,promoted,lastUsed:serverTimestamp()});
    existing.useCount=newCount;
    existing.promoted=promoted;
  }else{
    const obj={n,d:d||"",p:parseInt(p)||0,u:u||"",useCount:1,promoted:false,createdAt:serverTimestamp(),lastUsed:serverTimestamp()};
    const ref=await addDoc(collection(db,"custom_products"),obj);
    customProductsCache.push({id:ref.id,...obj});
  }
  localStorage.setItem("gb_cprods_cache",JSON.stringify(customProductsCache));
}

async function getNextNumber(kind){
  const {db,doc,runTransaction}=window.fb;
  let docId;
  if(kind==="quote")docId="quotes-"+APP_YEAR;
  else if(kind==="proposal")docId="proposals-"+APP_YEAR;
  else if(kind==="propfinal")docId="propfinals-"+APP_YEAR;
  else throw new Error("Tipo de consecutivo inválido: "+kind);
  const ref=doc(db,"counters",docId);
  const next=await runTransaction(db,async(tx)=>{
    const snap=await tx.get(ref);
    if(!snap.exists()){
      if(kind==="propfinal"){tx.set(ref,{current:100});return 100}
      throw new Error("Contador no existe: "+docId);
    }
    const cur=snap.data().current||0;
    const nn=cur+1;
    tx.update(ref,{current:nn});
    return nn;
  });
  const padded=String(next).padStart(4,"0");
  let prefix;
  if(kind==="quote")prefix="GB-";
  else if(kind==="proposal")prefix="GB-P-";
  else prefix="GB-PF-";
  return prefix+APP_YEAR+"-"+padded;
}

async function saveQuoteToCloud(qObj){
  const {db,doc,setDoc,serverTimestamp}=window.fb;
  await setDoc(doc(db,"quotes",qObj.quoteNumber),{...qObj,createdAt:serverTimestamp()});
}
async function saveProposalToCloud(pObj){
  const {db,doc,setDoc,serverTimestamp}=window.fb;
  await setDoc(doc(db,"proposals",pObj.quoteNumber),{...pObj,createdAt:serverTimestamp()});
}

async function loadAllHistory(){
  try{
    const {db,collection,getDocs,query,orderBy,limit}=window.fb;
    const out=[];
    const qQ=query(collection(db,"quotes"),orderBy("createdAt","desc"),limit(50));
    const qP=query(collection(db,"proposals"),orderBy("createdAt","desc"),limit(50));
    const qPF=query(collection(db,"propfinals"),orderBy("createdAt","desc"),limit(50));
    const [sQ,sP,sPF]=await Promise.all([getDocs(qQ),getDocs(qP),getDocs(qPF).catch(()=>({forEach:()=>{}}))]);
    sQ.forEach(d=>out.push({kind:"quote",id:d.id,...d.data()}));
    sP.forEach(d=>out.push({kind:"proposal",id:d.id,...d.data()}));
    sPF.forEach(d=>out.push({kind:"proposal",id:d.id,...d.data(),_isPF:true}));
    out.sort((a,b)=>{const ta=a.createdAt?.toMillis?.()||0,tb=b.createdAt?.toMillis?.()||0;return tb-ta});
    quotesCache=out;
    localStorage.setItem("gb_quotes_cache",JSON.stringify(out.map(q=>({...q,createdAt:null}))));
    autoTransitionToEnProduccion(out);
    return out;
  }catch(e){
    console.error("loadAllHistory error",e);
    try{quotesCache=JSON.parse(localStorage.getItem("gb_quotes_cache")||"[]")}catch{}
    return quotesCache;
  }
}

async function autoTransitionToEnProduccion(list){
  if(!cloudOnline)return;
  const todayIso=new Date().toISOString().slice(0,10);
  const candidatos=list.filter(q=>{
    if(q.status==="aprobada" && q.eventDate && q.eventDate<=todayIso)return true;
    if(q.status==="pedido"){
      const fechaTrigger=q.productionDate||q.eventDate;
      if(fechaTrigger && fechaTrigger<=todayIso)return true;
    }
    return false;
  });
  if(!candidatos.length)return;
  try{
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    for(const q of candidatos){
      let coll;
      if(q.kind==="quote")coll="quotes";
      else if(q.id&&q.id.startsWith("GB-PF-"))coll="propfinals";
      else coll="proposals";
      try{
        await updateDoc(doc(db,coll,q.id),{status:"en_produccion",updatedAt:serverTimestamp()});
        q.status="en_produccion";
      }catch(innerE){console.warn("No se pudo transicionar "+q.id,innerE)}
    }
    if(curMode==="hist")renderHist();
    if(curMode==="cal")renderCalendar();
    if(curMode==="cot")renderMiniDash();
  }catch(e){console.warn("autoTransitionToEnProduccion error",e)}
}

async function deleteHistoryItem(kind,id){
  const {db,doc,deleteDoc}=window.fb;
  let coll;
  if(kind==="quote")coll="quotes";
  else if(id&&id.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  await deleteDoc(doc(db,coll,id));
  quotesCache=quotesCache.filter(q=>!(q.kind===kind&&q.id===id));
}

// ─── INIT ──────────────────────────────────────────────────
async function initApp(){
  showLoader("Conectando a la nube...");
  await fbReady();
  try{
    await loadClientsFromCloud();
    await loadCustomProducts();
    await loadPriceMemory();
    setCloudStatus(true);
    refreshCliSel();
    hideLoader();
    loadAllHistory().then(()=>{
      renderMiniDash();
      if(curMode==="dash")renderDashboard();
    }).catch(e=>console.warn("initApp dash error",e));
  }catch(e){
    console.error("initApp error",e);
    setCloudStatus(false);
    hideLoader();
    alert("No se pudo conectar a la nube. Verifica tu internet y recarga la página.");
  }
}

function showLoader(msg){
  let el=$("loader");
  if(!el){
    el=document.createElement("div");
    el.id="loader";el.className="loader-wrap";
    el.innerHTML='<div class="loader-box"><div class="spinner"></div><span id="loader-msg"></span></div>';
    document.body.appendChild(el);
  }
  $("loader-msg").textContent=msg||"Cargando...";
  el.style.display="flex";
}
function hideLoader(){const el=$("loader");if(el)el.style.display="none"}

// ─── MODE SWITCHING ────────────────────────────────────────
function setMode(m){
  curMode=m;
  ["dash","cot","prop","search","hist","cal"].forEach(x=>{
    const el=$("mode-"+x);
    if(el)el.classList.toggle("hidden",x!==m);
    document.querySelectorAll(".mode-btn.m-"+x).forEach(b=>b.classList.toggle("act",x===m));
  });
  if(m==="hist")renderHist();
  if(m==="prop")initProp();
  if(m==="cal")renderCalendar();
  if(m==="cot")renderMiniDash();
  if(m==="dash")renderDashboard();
  if(m==="search"){$("gsearch").focus();$("search-results").innerHTML=""}
  window.scrollTo(0,0);
}

function newQuote(){
  if(allIt().length&&!confirm("¿Empezar una nueva cotización? Se perderán los productos actuales."))return;
  cart=[];cust=[];currentQuoteNumber=null;
  ["f-cli","f-idnum","f-att","f-mail","f-tel","f-dir","f-city-custom","f-tr-custom"].forEach(id=>{const el=$(id);if(el)el.value=""});
  $("f-idtype").value="";$("f-city").value="";
  $("sel-cli").value="";
  notasCotData={...DEFAULT_NOTAS_COT};
  // v4.12: limpiar panel de historial cliente
  const ch=$("cli-hist-panel");if(ch)ch.classList.add("hidden");
  updTr();
  go("info");
}
function newProp(){
  if(!confirm("¿Empezar una nueva propuesta? Se perderán los datos actuales."))return;
  propSections=[];menajeItems=[];currentPropNumber=null;
  ["fp-cli","fp-idnum","fp-att","fp-mail","fp-tel","fp-dir","fp-pers","fp-momento","fp-date","fp-city-custom","fp-tr-custom"].forEach(id=>{const el=$(id);if(el)el.value=""});
  $("fp-idtype").value="";$("fp-city").value="";$("sel-cli-p").value="";
  updTrP();
  tipoServicio="";
  personalData={meseros:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""},auxiliares:{cantidad:"",valor4h:"",horasExtra:"",valorHoraExtra:""}};
  loadLastPersonalRates();
  document.querySelectorAll("#tipo-serv-sel .tipo-serv-opt").forEach(el=>el.classList.remove("act"));
  menajeItems=DEFAULT_MENAJE.map((n,i)=>({id:"m"+i,name:n,qty:"",price:""}));
  condicionesData={};initCondiciones();
  reposicionData={};
  aperturaFrase="Una experiencia culinaria diseñada a medida para su evento.";
  if($("fp-apertura"))$("fp-apertura").value=aperturaFrase;
  setDefaultFechaVenc();
  firmaProp="jp";
  setFirma("prop","jp");
  applyPriceMemorySuggestions();
  // v4.12: limpiar panel historial cliente prop
  const ch=$("cli-hist-panel-p");if(ch)ch.classList.add("hidden");
  renderMenaje();renderPropSections();renderPersonal();renderCondiciones();renderReposicion();
}

// ─── GLOBAL SEARCH ─────────────────────────────────────────
let searchTimer=null;
function runSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(doSearch,250)}
async function doSearch(){
  const qStr=($("gsearch").value||"").trim().toLowerCase();
  const el=$("search-results");
  if(qStr.length<2){el.innerHTML="";$("search-hint").textContent="Escribe al menos 2 caracteres.";return}
  $("search-hint").textContent="Buscando...";
  const results=[];
  const looksLikeNum=/^gb-/i.test(qStr);
  if(looksLikeNum&&cloudOnline){
    try{
      const {db,doc,getDoc}=window.fb;
      const upper=qStr.toUpperCase();
      const q1=await getDoc(doc(db,"quotes",upper));
      if(q1.exists())results.push({type:"cot",id:upper,data:q1.data()});
      const q2=await getDoc(doc(db,"proposals",upper));
      if(q2.exists())results.push({type:"prop",id:upper,data:q2.data()});
    }catch(e){console.warn("direct fetch fail",e)}
  }
  C.forEach(p=>{if(p.n.toLowerCase().includes(qStr)||(p.d||"").toLowerCase().includes(qStr))results.push({type:"prod",id:p.id,data:p})});
  customProductsCache.forEach(cp=>{if(cp.n.toLowerCase().includes(qStr)||(cp.d||"").toLowerCase().includes(qStr))results.push({type:"cprod",id:cp.id,data:cp})});
  clientsCache.forEach(c=>{if(c.name.toLowerCase().includes(qStr)||(c.idnum||"").includes(qStr)||(c.tel||"").includes(qStr))results.push({type:"cli",id:c.id,data:c})});
  if(!quotesCache.length&&cloudOnline){try{await loadAllHistory()}catch{}}
  quotesCache.forEach(q=>{
    const qn=(q.quoteNumber||q.id||"").toLowerCase();
    const cli=(q.client||"").toLowerCase();
    let match=qn.includes(qStr)||cli.includes(qStr);
    if(!match){const items=[...(q.cart||[]),...(q.cust||[])];match=items.some(it=>(it.n||"").toLowerCase().includes(qStr))}
    if(!match&&q.sections){match=q.sections.some(s=>s.options&&s.options.some(o=>o.items&&o.items.some(it=>(it.name||"").toLowerCase().includes(qStr))))}
    if(match)results.push({type:q.kind==="proposal"?"prop":"cot",id:q.id,data:q});
  });
  const seen=new Set();
  const dedup=results.filter(r=>{const k=r.type+":"+r.id;if(seen.has(k))return false;seen.add(k);return true});
  $("search-hint").textContent=dedup.length+" resultado(s)";
  if(!dedup.length){el.innerHTML='<div class="empty"><div class="ic">🔍</div><p>Sin resultados para "'+qStr+'"</p></div>';return}
  el.innerHTML=dedup.slice(0,30).map(r=>{
    if(r.type==="cot"||r.type==="prop"){
      const q=r.data;const qn=q.quoteNumber||r.id;
      return '<div class="search-result" onclick="loadQuote(\''+(r.type==="cot"?"quote":"proposal")+'\',\''+r.id+'\')"><div class="sr-top"><div><span class="qnum">'+qn+'</span> <strong>'+(q.client||"—")+'</strong></div><span class="sr-type t-'+r.type+'">'+(r.type==="cot"?"Cotización":"Propuesta")+'</span></div>'+(q.total?'<div style="font-size:13px;color:var(--gr);font-weight:700">'+fm(q.total)+'</div>':'')+'<div style="font-size:11px;color:var(--soft)">'+(q.dateISO?new Date(q.dateISO).toLocaleDateString("es-CO"):"")+'</div></div>';
    }
    if(r.type==="cli"){const c=r.data;return '<div class="search-result" onclick="pickClientFromSearch(\''+c.id+'\')"><div class="sr-top"><div><strong>'+c.name+'</strong>'+(c.idtype?' — '+c.idtype+' '+c.idnum:'')+'</div><span class="sr-type t-cli">Cliente</span></div><div style="font-size:11px;color:var(--mid)">'+(c.tel||"")+(c.mail?' · '+c.mail:'')+'</div></div>'}
    if(r.type==="prod"){const p=r.data;return '<div class="search-result" style="border-left-color:#6A1B9A"><div class="sr-top"><div><strong>'+p.n+'</strong></div><span class="sr-type t-prod">Catálogo</span></div>'+(p.d?'<div style="font-size:11px;color:var(--soft)">'+p.d+'</div>':'')+'<div style="font-size:13px;color:var(--gr);font-weight:700">'+fm(p.p)+' · '+p.u+'</div><div style="font-size:10px;color:var(--mid)">'+p.c+'</div></div>'}
    if(r.type==="cprod"){const p=r.data;return '<div class="search-result" style="border-left-color:var(--gd)"><div class="sr-top"><div><strong>'+p.n+'</strong> <span style="font-size:9px;background:var(--gd);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span></div><span class="sr-type t-prod">'+(p.useCount||1)+' usos'+(p.promoted?' ✓':"")+'</span></div>'+(p.d?'<div style="font-size:11px;color:var(--soft)">'+p.d+'</div>':'')+'<div style="font-size:13px;color:var(--gr);font-weight:700">'+fm(p.p||0)+(p.u?' · '+p.u:"")+'</div></div>'}
    return "";
  }).join("");
}
function pickClientFromSearch(id){setMode("cot");setTimeout(()=>{$("sel-cli").value=id;loadClient()},100)}

// ─── TRANSPORT ─────────────────────────────────────────────
function getTr(){const v=$("f-city").value;if(v==="Otra"){const p=parseInt($("f-tr-custom").value);if(p)return{n:"Transporte "+($("f-city-custom").value.trim()||"Otra ciudad"),p};return null}return TR[v]||null}
function getCityName(){const v=$("f-city").value;if(v==="Otra")return $("f-city-custom").value.trim()||"Otra ciudad";return v}
function updTr(){const v=$("f-city").value;$("custom-city-wrap").classList.toggle("hidden",v!=="Otra");const t=getTr(),e=$("tr-info");if(t){e.classList.remove("hidden");$("tr-text").innerHTML='<strong>'+t.n+'</strong> — '+fm(t.p)}else e.classList.add("hidden")}
function getTrP(){const v=$("fp-city").value;if(v==="Otra"){const p=parseInt($("fp-tr-custom").value);if(p)return{n:"Transporte "+($("fp-city-custom").value.trim()||"Otra ciudad"),p};return null}return TR[v]||null}
function getCityNameP(){const v=$("fp-city").value;if(v==="Otra")return $("fp-city-custom").value.trim()||"Otra ciudad";return v}
function updTrP(){const v=$("fp-city").value;$("custom-city-wrap-p").classList.toggle("hidden",v!=="Otra");const t=getTrP(),e=$("tr-info-p");if(t){e.classList.remove("hidden");$("tr-text-p").innerHTML='<strong>'+t.n+'</strong> — '+fm(t.p)}else e.classList.add("hidden")}
function getPropIdStr(){const tp=$("fp-idtype").value,nm=$("fp-idnum").value.trim();if(!tp||!nm)return"";return tp+" "+nm}

// ─── CART HELPERS ──────────────────────────────────────────
function allIt(){return[...cart,...cust]}
function totCnt(){return allIt().reduce((s,i)=>s+i.qty,0)}
function getTotal(){const t=getTr();return allIt().reduce((s,i)=>s+i.p*i.qty,0)+(t?t.p:0)}
function distIt(){return allIt().length}
function getIdStr(){const tp=$("f-idtype").value,nm=$("f-idnum").value.trim();if(!tp||!nm)return"";return tp+" "+nm}

// ─── NAVIGATION ────────────────────────────────────────────
function go(s){curStep=s;["info","products","review"].forEach(x=>{$("step-"+x).classList.toggle("hidden",x!==s);$("nav-"+x).classList.toggle("act",x===s)});if(s==="products")renderP();if(s==="review")renderR();updUI();window.scrollTo(0,0)}
function updUI(){const c=totCnt(),n=distIt();const b=$("cbadge"),bar=$("cbar");if(c>0){b.classList.remove("hidden");b.textContent=c}else b.classList.add("hidden");bar.classList.toggle("vis",c>0&&curStep==="products");$("bar-c").textContent=c+" producto"+(c!==1?"s":"");$("bar-t").textContent=fm(getTotal());$("limit-warn").classList.toggle("hidden",n<MX)}

// ─── CATEGORY/PRODUCT RENDER ───────────────────────────────
function renderCats(){$("cats").innerHTML=CATS.map(c=>`<button class="cpill ${c===selCat?'act':''}" onclick="selC('${c.replace(/'/g,"\\'")}')">${c==="Todas"?"Todas":c}</button>`).join("")}
function selC(c){selCat=c;renderCats();renderP()}
function renderP(){renderCats();const s=($("sbox").value||"").toLowerCase();const f=C.filter(p=>(selCat==="Todas"||p.c===selCat)&&(!s||p.n.toLowerCase().includes(s)||p.d.toLowerCase().includes(s)));const el=$("plist");const atMax=distIt()>=MX;
if(!f.length){el.innerHTML='<div class="empty"><div class="ic">🔍</div><p>No se encontraron productos</p><button class="btn bg" onclick="togCF()">+ Personalizado</button></div>';return}
el.innerHTML=f.map(p=>{const ic=cart.find(x=>x.id===p.id);const canAdd=!atMax||ic;return'<div class="pcard '+(ic?'inc':'')+'"><div class="pinfo"><div class="pname">'+p.n+'</div>'+(p.d?'<div class="pdesc">'+p.d+'</div>':'')+'<div class="punit">'+p.u+'</div><div class="pprice">'+fm(p.p)+'</div></div><div>'+(ic?'<div class="qc"><button class="qb" onclick="chgQ('+p.id+','+(ic.qty-1)+')">−</button><input type="number" class="qn" value="'+ic.qty+'" min="1" onchange="chgQ('+p.id+',+this.value)" onfocus="this.select()"><button class="qb" onclick="chgQ('+p.id+','+(ic.qty+1)+')">+</button></div>':canAdd?'<button class="abtn" onclick="addC('+p.id+')">Agregar</button>':'<span style="font-size:11px;color:var(--soft)">Máx</span>')+'</div></div>'}).join("");updUI()}
function addC(id){if(distIt()>=MX){alert("Máximo "+MX+" productos");return}const p=C.find(x=>x.id===id);if(!p)return;const e=cart.find(x=>x.id===id);if(e)e.qty++;else cart.push({...p,qty:1,origP:p.p,edited:false});renderP()}
function chgQ(id,q){q=parseInt(q)||0;if(q<=0)cart=cart.filter(x=>x.id!==id);else{const i=cart.find(x=>x.id===id);if(i)i.qty=q}renderP()}

// ─── CUSTOM PRODUCTS ───────────────────────────────────────
function togCF(){$("cform").classList.toggle("hidden")}
function addCust(){if(distIt()>=MX){alert("Máximo "+MX+" productos");return}const n=$("cf-n").value.trim(),p=parseInt($("cf-p").value);if(!n||!p){alert("Nombre y precio obligatorios");return}cust.push({id:"x"+Date.now(),n,p,d:$("cf-d").value.trim(),u:$("cf-u").value.trim(),qty:parseInt($("cf-q").value)||1,custom:true});$("cf-n").value="";$("cf-p").value="";$("cf-d").value="";$("cf-u").value="";$("cf-q").value="1";togCF();updUI();renderP()}
function remCust(id){cust=cust.filter(x=>x.id!==id);renderR();updUI()}
function chgCustQ(id,q){q=parseInt(q)||0;if(q<=0){remCust(id);return}const i=cust.find(x=>x.id===id);if(i)i.qty=q;renderR();updUI()}
function remCart(id){cart=cart.filter(x=>x.id!==id);renderR();updUI()}
function chgCartR(id,q){q=parseInt(q)||0;if(q<=0){remCart(id);return}const i=cart.find(x=>x.id===id);if(i)i.qty=q;renderR();updUI()}

// ─── DATE/MOMENT HELPERS ───────────────────────────────────
function dateStr(){const d=new Date(),m=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];return d.getDate()+" de "+m[d.getMonth()]+" de "+d.getFullYear()}
function togMom(el){el.parentElement.style.background=el.checked?'var(--grl)':'var(--wh)';el.parentElement.style.borderColor=el.checked?'#4CAF50':'var(--lt)'}
function togOtherTime(){$("f-time-other-wrap").classList.toggle("hidden",!$("chk-otro").checked)}
function getMomentos(){const cbs=document.querySelectorAll('#f-moments input[type=checkbox]:checked');const vals=[...cbs].map(c=>c.value).filter(v=>v!=="Otro");if($("chk-otro").checked&&$("f-time-other").value.trim())vals.push($("f-time-other").value.trim());return vals}
function getDelivStr(){const d=$("f-date").value,moms=getMomentos();if(!d&&!moms.length)return"";const parts=d?d.split("-"):null;let ds="";if(parts){const ms=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];ds=parseInt(parts[2])+" de "+ms[parseInt(parts[1])-1]+" de "+parts[0]}const momStr=moms.join(", ");if(ds&&momStr)return ds+" — "+momStr;return ds||momStr}

// ─── CLIENT MANAGEMENT ─────────────────────────────────────
function refreshCliSel(){
  const sel=$("sel-cli");
  if(sel)sel.innerHTML='<option value="">— Nuevo cliente —</option>'+clientsCache.map(c=>'<option value="'+c.id+'">'+c.name+(c.idtype?' — '+c.idtype+' '+c.idnum:'')+'</option>').join("");
  refreshCliSelP();
}
function refreshCliSelP(){
  const sel=$("sel-cli-p");
  if(!sel)return;
  sel.innerHTML='<option value="">— Nuevo cliente —</option>'+clientsCache.map(c=>'<option value="'+c.id+'">'+c.name+(c.idtype?' — '+c.idtype+' '+c.idnum:'')+'</option>').join("");
}
async function autoSaveClientFromCot(){
  const name=$("f-cli").value.trim();
  if(!name||!cloudOnline)return;
  const obj={name,idtype:$("f-idtype").value,idnum:$("f-idnum").value.trim(),att:$("f-att").value.trim(),mail:$("f-mail").value.trim(),tel:$("f-tel").value.trim(),dir:$("f-dir").value.trim(),city:$("f-city").value,cityCustom:$("f-city-custom").value.trim(),trCustom:$("f-tr-custom").value};
  try{await saveClientToCloud(obj);refreshCliSel()}catch(e){console.warn("autosave client failed",e)}
}
async function autoSaveClientFromProp(){
  const name=$("fp-cli").value.trim();
  if(!name||!cloudOnline)return;
  const obj={name,idtype:$("fp-idtype").value,idnum:$("fp-idnum").value.trim(),att:$("fp-att").value.trim(),mail:$("fp-mail").value.trim(),tel:$("fp-tel").value.trim(),dir:$("fp-dir").value.trim(),city:$("fp-city").value,cityCustom:$("fp-city-custom").value.trim(),trCustom:$("fp-tr-custom").value};
  try{await saveClientToCloud(obj);refreshCliSel()}catch(e){console.warn("autosave client failed",e)}
}
function loadClient(){
  const id=$("sel-cli").value;if(!id)return;
  const c=clientsCache.find(x=>x.id===id);if(!c)return;
  $("f-cli").value=c.name||"";$("f-idtype").value=c.idtype||"";$("f-idnum").value=c.idnum||"";$("f-att").value=c.att||"";$("f-mail").value=c.mail||"";$("f-tel").value=c.tel||"";$("f-dir").value=c.dir||"";$("f-city").value=c.city||"";
  if(c.city==="Otra"){$("f-city-custom").value=c.cityCustom||"";$("f-tr-custom").value=c.trCustom||""}
  updTr();
  // v4.12: refrescar panel historial cliente
  showClientHistoryPanel(c.name,"cot");
}
async function delClient(){
  const id=$("sel-cli").value;
  if(!id){alert("Selecciona un cliente primero");return}
  const c=clientsCache.find(x=>x.id===id);if(!c)return;
  if(!confirm("¿Eliminar a "+c.name+"? (esto afecta a todos los usuarios)"))return;
  try{showLoader("Eliminando...");await deleteClientFromCloud(id);refreshCliSel();hideLoader()}
  catch(e){hideLoader();alert("Error: "+e.message)}
}
function loadClientP(){
  const id=$("sel-cli-p").value;if(!id)return;
  const c=clientsCache.find(x=>x.id===id);if(!c)return;
  $("fp-cli").value=c.name||"";$("fp-idtype").value=c.idtype||"";$("fp-idnum").value=c.idnum||"";$("fp-att").value=c.att||"";$("fp-mail").value=c.mail||"";$("fp-tel").value=c.tel||"";$("fp-dir").value=c.dir||"";$("fp-city").value=c.city||"";
  if(c.city==="Otra"){$("fp-city-custom").value=c.cityCustom||"";$("fp-tr-custom").value=c.trCustom||""}
  updTrP();
  showClientHistoryPanel(c.name,"prop");
}

// v4.12: handlers de oninput cliente — buscan historial al escribir
let _cliPanelTimer=null,_cliPanelTimerP=null;
function onClientNameChange(){
  clearTimeout(_cliPanelTimer);
  _cliPanelTimer=setTimeout(()=>showClientHistoryPanel($("f-cli").value.trim(),"cot"),400);
}
function onClientNameChangeProp(){
  clearTimeout(_cliPanelTimerP);
  _cliPanelTimerP=setTimeout(()=>showClientHistoryPanel($("fp-cli").value.trim(),"prop"),400);
}

// v4.12: muestra panel con pedidos previos del cliente + comentarios
function showClientHistoryPanel(name,modo){
  const panelId=modo==="prop"?"cli-hist-panel-p":"cli-hist-panel";
  const listId=modo==="prop"?"chp-list-p":"chp-list";
  const panel=$(panelId);if(!panel)return;
  if(!name||name.length<3){panel.classList.add("hidden");return}
  const lower=name.toLowerCase();
  const matches=quotesCache.filter(q=>(q.client||"").toLowerCase()===lower).slice(0,5);
  if(!matches.length){panel.classList.add("hidden");return}
  panel.classList.remove("hidden");
  $(listId).innerHTML=matches.map(q=>{
    const sMeta=STATUS_META[q.status||"enviada"]||STATUS_META.enviada;
    const fecha=q.dateISO?new Date(q.dateISO).toLocaleDateString("es-CO"):"—";
    const total=q.total?fm(q.total):"";
    const coment=q.comentarioCliente?.texto;
    return '<div class="chp-item" onclick="loadQuote(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="chp-item-top"><span><span class="qnum" style="font-size:9px">'+(q.quoteNumber||q.id)+'</span> · '+fecha+(total?' · '+total:"")+'</span><span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span></div>'+
      (coment?'<div class="chp-item-coment">💬 '+coment.slice(0,140)+(coment.length>140?'...':'')+'</div>':'')+
    '</div>';
  }).join("")||'<div class="chp-empty">Sin pedidos previos.</div>';
}

// ─── DATA: load/save quote (cotización + propuesta) ────────
async function delHistItem(kind,id,ev){
  ev.stopPropagation();
  // v4.12.3: bloquear borrado si ya pasó de "enviada" — un pedido confirmado se modifica, no se borra
  const q=quotesCache.find(x=>x.id===id&&x.kind===kind);
  const status=q?.status||"enviada";
  if(status!=="enviada"){
    alert("⚠️ No se puede eliminar.\n\n"+id+" ya está en estado \""+(STATUS_META[status]?.label||status)+"\".\n\nUna vez una cotización se confirma como pedido (o se aprueba, produce, entrega) queda como registro permanente.\n\nPara anularla:\n1. Ábrela y déjala en blanco (productos en 0 / cliente en 0).\n2. Anota en las notas el motivo de anulación.");
    return;
  }
  if(!confirm("¿Eliminar "+id+"? Esta cotización está en estado ENVIADA — aún no se ha confirmado como pedido."))return;
  try{showLoader("Eliminando...");await deleteHistoryItem(kind,id);hideLoader();renderHist()}
  catch(e){hideLoader();alert("Error: "+e.message)}
}

async function loadQuote(kind,id){
  try{
    const {db,doc,getDoc}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(id&&id.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";
    showLoader("Cargando...");
    const snap=await getDoc(doc(db,coll,id));
    hideLoader();
    if(!snap.exists()){alert("No se encontró");return}
    const q=snap.data();
    if(kind==="proposal"){setMode("prop");loadPropQuote({...q,quoteNumber:id});return}
    setMode("cot");
    cart=[];cust=[];
    if(q.cart){q.cart.forEach(ci=>{const p=C.find(x=>x.id===ci.id);if(p)cart.push({...p,p:ci.p,origP:ci.origP||p.p,qty:ci.qty,edited:!!ci.edited});else cart.push({id:ci.id||Date.now()+Math.random(),n:ci.n,d:ci.d,u:ci.u,p:ci.p,origP:ci.origP||ci.p,qty:ci.qty,edited:!!ci.edited})})}
    if(q.cust)cust=q.cust.map((ci,ix)=>({id:"x"+Date.now()+ix,...ci,custom:true}));
    $("f-cli").value=q.client||"";
    $("f-idtype").value=(q.idStr||"").split(" ")[0]||"";
    $("f-idnum").value=(q.idStr||"").split(" ").slice(1).join(" ")||"";
    $("f-att").value=q.att||"";$("f-mail").value=q.mail||"";$("f-tel").value=q.tel||"";$("f-dir").value=q.dir||"";
    if(q.city){
      const known=["La Calera","Bogotá","Chía","Cajicá"];
      if(q.cityType){$("f-city").value=q.cityType;if(q.cityType==="Otra"){$("f-city-custom").value=q.city||""}}
      else if(known.includes(q.city)){$("f-city").value=q.city}
      else{$("f-city").value="Otra";$("f-city-custom").value=q.city}
      if($("f-tr-custom"))$("f-tr-custom").value=q.trCustom||"";
      updTr();
    }
    currentQuoteNumber=q.quoteNumber||id;
    if(q.notasCotData&&typeof q.notasCotData==="object"){notasCotData={...q.notasCotData}}
    else{notasCotData={...DEFAULT_NOTAS_COT}}
    if(q.firma)firmaCot=q.firma;
    setFirma("cot",firmaCot);
    showClientHistoryPanel(q.client||"","cot");
    go("review");
  }catch(e){hideLoader();alert("Error: "+e.message)}
}
