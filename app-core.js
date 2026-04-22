// ═══════════════════════════════════════════════════════════
// app-core.js · v5.1.0 · 2026-04-21
// Firebase wrapper, Auth (v5.0), Storage (v5.0), state global,
// helpers, INIT, mode switching, search, transporte, cart,
// navegación, clientes, autoTransition, getNextNumber.
// v5.0.2: flag needsSync + helpers auto-sync + rango custom dashboard.
// v5.0.3: nuevo estado "anulada" + flujo de reversión/anulación.
// v5.0.4: helpers de follow-up comercial + modo 'seg' + getPipelineActivo.
// v5.0.5: binario VIVA/PERDIDA en superficie + reactivarPerdida + bloqueo
//         conversión perdida→pedido. Tags contactado/activa internos.
// v5.1.0: 4 sub-pestañas en Historial (Vivas/Pedidos/Perdidas/Anuladas) +
//         buscador por palabras + botones rápidos Viva/Perdida en tarjetas +
//         adjuntar comprobante después + fix capture cámara móvil.
// v5.2.0: Dashboard rediseñado (bento grid, fix render robusto con try-catch
//         por sección) + 3 reportes nuevos (conversión, pérdidas por motivo,
//         vista por cliente) + badge de novedades desde última visita +
//         mantenimiento colapsable bajo toggle.
// v5.2.1: HOTFIX — protección completa del render con try-catch en body principal,
//         fallbacks para $() null, logs detallados en consola para diagnóstico.
// v5.2.2: HOTFIX — remueve declaración huérfana `let histFilter` de app-core.js
//         que chocaba con `var histFilter` de app-historial.js → SyntaxError en
//         parseo → abortaba app-historial.js → Historial vacío + Dashboard KPIs
//         vacíos (METODOS_PAGO y renderHist no cargaban). Fix de 1 línea.
// v5.2.3: FIX operativo de docs legacy sin campo `status`. isFollowable y
//         getPipelineActivo tratan docs sin status como "enviada" → aparecen en
//         Pipeline/Historial Vivas/Seguimiento. setFollowUp auto-normaliza status
//         al etiquetar. Botones 🟢 Viva / ❌ Perdida inline en drill-down del
//         dashboard. Botón "🔧 Normalizar docs" en Mantenimiento para limpiar
//         bulk los docs legacy (idempotente, con preview y confirmación).
// v5.3.0: MINOR — rediseño dashboard con progressive disclosure. Siempre visible:
//         Pipeline + KPIs + Operación urgente 3d (Por producir / Por entregar lado
//         a lado). Colapsable: Análisis comercial (Conversión/Pérdidas/Cliente),
//         Otros operativos (Recaudo/Próximas 14d/Por cobrar/Comentarios), Opciones
//         avanzadas. Estado expandido persistido en localStorage. Drill-down usa
//         chips compactos (NO full-width) para Viva/Perdida/Reactivar + Pedido/Aprobar.
// v5.4.0: PARCIAL (Bloques A+C+E) — Instrucciones especiales del pedido se
//         propagan de cotización a modal de pedido (campo momentos/fecha entrega
//         ahora se guarda estructurado en `momentos` array + `eventDate`, no solo
//         como string `deliv`). Al convertir a pedido, `om-notas-prod` se pre-llena
//         con los momentos si existen → así la nota crítica ("sin nueces",
//         "es regalo para XXX") llega a producción y al .ics. Producción flexible:
//         `om-prod-fecha` ya no readonly; default sigue siendo entrega−1d pero se
//         puede editar. Si producción = entrega se pide confirmación. Backups con
//         timestamp (YYYY-MM-DD_HHhMM) para no sobrescribir.
//         Pendientes v5.4.1: Bloque B (versionado PDF + copia Storage),
//         Bloque D (botón 🔪 Producido inline en dashboard urgente).
// v5.4.1: Bloque D — chip 🔪 Producido inline en tarjetas de Operación
//         Urgente 3d (Por producir + Por entregar). Ahorra un tap para
//         marcar producido sin abrir el doc. toggleProduced ya existía.
//         Bloque B — PDF versionado con copia en Firebase Storage. Cada
//         regeneración de PDF incrementa pdfRegenCount, agrega una entrada
//         a pdfHistorial (version, url, fecha, generadoPor) y sube el blob
//         a pdfs/{kind}/{docId}/v{N}_{timestamp}.pdf. Nombre local mantiene
//         sin sufijo en v1; v2+ usan _v02, _v03. Botón 📎 Ver PDFs anteriores
//         en el detalle del historial. Upload es best-effort: si Storage falla,
//         el PDF local igual se entrega.
// v5.4.2: PATCH + 2 features pequeñas.
//         (1) FIX CSS: checkbox "Ya está producido" en modal Marcar-como-pedido
//         dejó de heredar el estilo uppercase/block/font-weight 700 de
//         `.mform .mf-field label`. Nueva clase `mf-check` + `mf-check-lbl`
//         aísla el label del genérico. Lógica JS intacta.
//         (2) UX-002 cerrado: loadQuote restaura q.eventDate → #f-date y
//         q.momentosArr → checkboxes de #f-moments (incluye fallback "Otro"
//         para momentos custom). Antes se guardaban bien pero reaparecían
//         vacíos al reabrir → UX frustrante.
//         (3) NUEVA: Botón 📤 Restaurar JSON en Mantenimiento (modo MERGE
//         aditivo). Parsea backup exportado, hace preview con conteos de
//         docs nuevos/ya-existen/clientes nuevos, confirmación doble antes
//         de escribir. NO sobrescribe docs existentes — solo agrega los
//         que faltan. Útil para recuperar docs borrados o consolidar
//         backups antiguos sin riesgo.
//         (4) NUEVA: Botón 📎 Todos los PDFs en header del Historial. Abre
//         modal con navegador global de todos los docs que tengan
//         pdfHistorial. Búsqueda en vivo por cliente/número, muestra
//         todas las versiones con link directo de descarga a Storage.
// v5.4.3: MINOR — 4 features operativas.
//         (1) AGENDA VISUAL con estados: renderWeek reescrito con card
//         enriquecida por evento. Chip de estado operativo (📄 enviada /
//         🟠 por producir / 🔥 por producir HOY / 🔪 en producción / ✅
//         producido / 🎉 entregado / ⚠️ atrasado / ↩️ anulada) + chip de
//         pago (💰 pagado / 💵 anticipo N% / ⚠️ sin anticipo) + hora
//         destacada estilo alarm-clock + resumen de primeros 2 productos
//         + botón 🔪 inline de acción rápida si aún no está producido y
//         es futuro. Helpers nuevos: _estadoOperativo(q,iso,todayIso),
//         _estadoPago(q), _diasDesdeEntrega(q).
//         (2) CARTERA POR COBRAR con días desde entrega: drill-down "cobrar"
//         ahora calcula días desde fechaEntrega/entregaData.fecha/eventDate
//         y muestra badge de color. Escala acordada: 0-1 neutro, 2-4 amarillo,
//         5-14 naranja, 15+ rojo. Ordenado por más vencidas arriba. Si el
//         doc aún no se entregó: "Entrega YYYY-MM-DD" (neutro si futura,
//         rojo si pasada sin cerrar).
//         (3) BADGE ⚠️ EN BOTÓN TODOS LOS PDFS: savePdfConCopiaStorage
//         ahora marca q.pdfUploadFailed=true si la subida a Storage falla,
//         y lo limpia (=false) si el siguiente intento va bien. El botón
//         📎 Todos los PDFs en header del historial muestra badge ⚠️N con
//         la cantidad de docs pendientes. Helper refreshAllPdfsBadge() se
//         llama tras renderHist. El modal global muestra sección destacada
//         "PDFs pendientes de subir" arriba con último error y botón
//         "Abrir y regenerar" para reintento manual.
//         (4) PLANTILLAS WHATSAPP en Seguimiento: el botón 📱 WhatsApp ya
//         no abre chat directo — abre modal selector con 4 plantillas default
//         editables (Primer contacto · Seguimiento 7+d · Recordatorio
//         anticipo · Recordatorio día antes). Placeholders soportados:
//         {cliente} {numero} {total} {fecha} {hora} {dias} — se reemplazan
//         en vivo. Editor integrado para personalizar textos. Persistencia
//         en localStorage (key: gb_wa_templates_v1). Botón "Restaurar
//         defaults" regresa a los 4 originales. El textarea de preview es
//         editable antes de enviar → máxima flexibilidad.
// ═══════════════════════════════════════════════════════════

// ─── BUILD METADATA ────────────────────────────────────────
const BUILD_VERSION="v5.4.3";
const BUILD_DATE="2026-04-22";
// v5.0: PIN reemplazado por Firebase Auth. Se deja referencia histórica para rollback.
// const PIN_CODE_LEGACY="8421";
const APP_YEAR=new Date().getFullYear();
// v5.0: estado del usuario autenticado — se actualiza en onAuthStateChanged
let currentUser=null;

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

// ─── v5.4.1 (Bloque B): PDF versionado + copia en Firebase Storage ─────
// Envuelve savePdf existente + sube una copia a Storage + actualiza el
// pdfHistorial del doc en Firestore para que Luis pueda recuperar PDFs
// previos si regeneró uno nuevo.
//
// Parámetros:
//   doc          · objeto jsPDF listo
//   baseName     · nombre base del archivo SIN extensión ni version
//                  (ej: "GB-2026-0110_Adriana_Pulido")
//   kind         · "quote" | "proposal" | "propfinal"
//   docId        · ID del doc en Firestore (ej: "GB-2026-0110")
//
// Flujo:
//   1. Calcula el próximo número de versión leyendo pdfRegenCount del q en cache
//   2. Nombre local: baseName.pdf (v1) o baseName_v02.pdf, _v03.pdf...
//   3. Sube blob a Storage en pdfs/{kind}/{docId}/v{N}_{timestamp}.pdf
//   4. Obtiene downloadURL
//   5. Actualiza Firestore: pdfRegenCount++, pdfHistorial push {version,url,fecha,generadoPor}
//   6. Llama savePdf local (share/descarga)
//
// Retrocompat: si algo de Storage falla, el PDF local igual se entrega al
// usuario. El Storage upload es best-effort, no bloqueante para el flujo.
async function savePdfConCopiaStorage(doc,baseName,kind,docId){
  if(!kind||!docId){
    // Fallback: si faltan datos, comportamiento igual que savePdf clásico
    console.warn("[savePdfConCopiaStorage] faltan kind/docId, uso savePdf simple");
    return savePdf(doc,baseName+".pdf");
  }
  // 1. Calcular próxima versión
  const coll=kind==="quote"?"quotes":(kind==="propfinal"?"propfinals":"proposals");
  const q=(quotesCache||[]).find(x=>x.id===docId);
  const prevCount=(q&&typeof q.pdfRegenCount==="number")?q.pdfRegenCount:0;
  const nextVersion=prevCount+1;
  // 2. Nombre local: v1 sin sufijo para no cambiar comportamiento esperado,
  //    v2+ con _v02, _v03 para que ordenen bien en descargas
  const versionSuffix=nextVersion===1?"":"_v"+String(nextVersion).padStart(2,"0");
  const localFilename=baseName+versionSuffix+".pdf";
  // Preparar blob una sola vez (reusar para Storage y para savePdf)
  let blob=null;
  try{blob=doc.output("blob")}
  catch(e){console.warn("[savePdfConCopiaStorage] output blob falló:",e)}
  // 3-5. Intentar subir a Storage y actualizar Firestore (best-effort)
  if(blob&&cloudOnline){
    try{
      await fbReady();
      const _p=n=>String(n).padStart(2,"0");
      const _now=new Date();
      const stamp=_now.getFullYear()+"-"+_p(_now.getMonth()+1)+"-"+_p(_now.getDate())+"_"+_p(_now.getHours())+"h"+_p(_now.getMinutes());
      const storagePath="pdfs/"+kind+"/"+docId+"/v"+String(nextVersion).padStart(2,"0")+"_"+stamp+".pdf";
      const url=await uploadToStorage(blob,storagePath);
      // Actualizar pdfHistorial y pdfRegenCount en Firestore
      const {db,doc:fsDoc,updateDoc,serverTimestamp}=window.fb;
      const entry={
        version:nextVersion,
        url:url,
        path:storagePath,
        fecha:_now.toISOString(),
        generadoPor:(currentUser&&(currentUser.displayName||currentUser.email))||"desconocido",
        filename:localFilename
      };
      const prevHist=(q&&Array.isArray(q.pdfHistorial))?q.pdfHistorial:[];
      const newHist=prevHist.concat([entry]);
      await updateDoc(fsDoc(db,coll,docId),{
        pdfRegenCount:nextVersion,
        pdfHistorial:newHist,
        pdfUploadFailed:false, // v5.4.3: limpiar flag si había uno previo
        updatedAt:serverTimestamp()
      });
      // Actualizar cache local
      if(q){q.pdfRegenCount=nextVersion;q.pdfHistorial=newHist;q.pdfUploadFailed=false}
      console.log("[savePdfConCopiaStorage] v"+nextVersion+" subida OK:",storagePath);
    }catch(e){
      // NO bloquear — el PDF local se entrega igual
      console.warn("[savePdfConCopiaStorage] subida a Storage falló (no bloqueante):",e);
      // v5.4.3: marcar flag para que UI pueda alertar y permitir reintento manual
      try{
        const {db,doc:fsDoc,updateDoc,serverTimestamp}=window.fb;
        await updateDoc(fsDoc(db,coll,docId),{
          pdfUploadFailed:true,
          pdfUploadLastError:String(e&&e.message||e).slice(0,200),
          pdfUploadLastAttempt:_now.toISOString(),
          updatedAt:serverTimestamp()
        });
        if(q){q.pdfUploadFailed=true;q.pdfUploadLastError=String(e&&e.message||e).slice(0,200)}
      }catch(e2){console.warn("[savePdfConCopiaStorage] no pude marcar flag:",e2)}
    }
  }else if(!cloudOnline){
    console.warn("[savePdfConCopiaStorage] offline — PDF solo local, sin copia Storage");
  }
  // 6. Entregar PDF local al usuario (share/descarga)
  return savePdf(doc,localFilename);
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
// v5.2.2: histFilter se declara SOLO en app-historial.js con patrón defensivo
// `if(typeof histFilter==="undefined")var histFilter="all"`. Tenerlo aquí como
// `let` causaba SyntaxError en el parseo de app-historial.js (colisión let+var),
// abortando todo el archivo y rompiendo Historial + Dashboard KPIs.
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
  convertida:   {label:"Convertida",      cls:"convertida",    desc:"Convertida a Propuesta Final"},
  superseded:   {label:"Reemplazada",     cls:"superseded",    desc:"PF reemplazada por una versión nueva"},
  anulada:      {label:"Anulada",         cls:"anulada",       desc:"Cancelada antes de entregar — registro histórico"}
};

// ─── v5.0: AUTHENTICATION (Firebase Auth, reemplaza al PIN de v4.x) ──
// No-ops para compatibilidad: los handlers del PIN ya no existen en HTML.
// Si algún código viejo los llama, no rompe.
function renderPinPad(){} function pinPress(){} function pinBack(){} function updatePinDots(){} function checkPin(){}

// v5.0: handler del submit del form de login (email + password)
async function submitLogin(ev){
  if(ev)ev.preventDefault();
  const email=($("login-email").value||"").trim();
  const password=$("login-password").value||"";
  const errEl=$("pin-err");
  const btn=$("login-submit");
  if(!email||!password){
    errEl.textContent="Email y contraseña son obligatorios";
    errEl.classList.add("show");
    return false;
  }
  errEl.classList.remove("show");
  btn.disabled=true;btn.textContent="Verificando...";
  try{
    await fbReady();
    const {auth,signInWithEmailAndPassword}=window.fb;
    await signInWithEmailAndPassword(auth,email,password);
    // onAuthStateChanged se encarga del resto (esconder overlay + initApp)
  }catch(e){
    console.warn("Login falló:",e);
    let msg="No se pudo iniciar sesión";
    if(e?.code==="auth/invalid-credential"||e?.code==="auth/wrong-password"||e?.code==="auth/user-not-found")msg="Email o contraseña incorrectos";
    else if(e?.code==="auth/too-many-requests")msg="Demasiados intentos. Espera unos minutos.";
    else if(e?.code==="auth/network-request-failed")msg="Sin conexión a internet";
    else if(e?.code==="auth/invalid-email")msg="Email mal escrito";
    errEl.textContent=msg;
    errEl.classList.add("show");
    btn.disabled=false;btn.textContent="Entrar";
  }
  return false;
}

// v5.0: "¿Olvidaste tu contraseña?" — manda email de reset
async function openForgotPassword(){
  const email=($("login-email").value||"").trim();
  if(!email){
    const errEl=$("pin-err");
    errEl.textContent="Escribe tu email arriba primero y luego toca ¿Olvidaste?";
    errEl.classList.add("show");
    return;
  }
  if(!confirm("Te enviaré un email a "+email+" con un link para restablecer tu contraseña.\n\n¿Continuar?"))return;
  try{
    await fbReady();
    const {auth,sendPasswordResetEmail}=window.fb;
    await sendPasswordResetEmail(auth,email);
    alert("📧 Email enviado a "+email+".\n\nRevisa tu bandeja de entrada (y spam). El link dura 1 hora.");
  }catch(e){
    console.warn("Reset password falló:",e);
    alert("No se pudo enviar el email: "+(e?.message||e));
  }
}

// v5.0: cerrar sesión (signOut de Firebase)
async function logoutSession(){
  if(!confirm("¿Cerrar sesión? Tendrás que volver a ingresar tu email y contraseña."))return;
  try{
    await fbReady();
    const {auth,signOut}=window.fb;
    await signOut(auth);
    // onAuthStateChanged se encarga — detecta null y recarga
    location.reload();
  }catch(e){
    alert("Error cerrando sesión: "+(e?.message||e));
  }
}

// v5.0.1: Toggle password visibility (icono ojo en el login)
function togglePasswordVisibility(){
  const inp=$("login-password");
  const btn=$("login-pw-toggle");
  if(!inp)return;
  if(inp.type==="password"){
    inp.type="text";
    if(btn)btn.textContent="🙈";
  }else{
    inp.type="password";
    if(btn)btn.textContent="👁️";
  }
}

// v5.0.1: Sign in con Google (popup — fallback a redirect en caso de bloqueo)
async function signInWithGoogle(){
  const errEl=$("pin-err");
  const gbtn=$("login-google-btn");
  if(errEl)errEl.classList.remove("show");
  if(gbtn){gbtn.disabled=true;gbtn.style.opacity=".6"}
  try{
    await fbReady();
    const {auth,googleProvider,signInWithPopup,signInWithRedirect}=window.fb;
    try{
      await signInWithPopup(auth,googleProvider);
      // onAuthStateChanged se encarga
    }catch(e){
      // Popup bloqueado → fallback a redirect
      if(e?.code==="auth/popup-blocked"||e?.code==="auth/popup-closed-by-user"||e?.code==="auth/cancelled-popup-request"){
        if(e.code==="auth/popup-closed-by-user"||e.code==="auth/cancelled-popup-request"){
          // Usuario canceló — no mostramos error
          if(gbtn){gbtn.disabled=false;gbtn.style.opacity="1"}
          return;
        }
        console.warn("Popup bloqueado, usando redirect");
        await signInWithRedirect(auth,googleProvider);
        return;
      }
      throw e;
    }
  }catch(e){
    console.warn("Google sign-in falló:",e);
    let msg="No se pudo iniciar sesión con Google";
    if(e?.code==="auth/account-exists-with-different-credential")msg="Este email ya existe con otro método. Usa email+contraseña.";
    else if(e?.code==="auth/network-request-failed")msg="Sin conexión a internet";
    else if(e?.code==="auth/user-disabled")msg="Esta cuenta está deshabilitada";
    else if(e?.code==="auth/unauthorized-domain")msg="Dominio no autorizado en Firebase Console";
    if(errEl){errEl.textContent=msg;errEl.classList.add("show")}
    if(gbtn){gbtn.disabled=false;gbtn.style.opacity="1"}
  }
}

// v5.0.1: Menú de cuenta del usuario (cambiar contraseña / cerrar sesión)
function openUserMenu(){
  if(!currentUser){logoutSession();return}
  const email=currentUser.email||"(sin email)";
  // Detectar provider: Google no tiene password, email/password sí
  const providerIds=(currentUser.providerData||[]).map(p=>p.providerId);
  const isGoogleOnly=providerIds.length===1&&providerIds[0]==="google.com";
  const opts=[
    "1 → Cambiar contraseña"+(isGoogleOnly?" (no disponible — cuenta Google)":""),
    "2 → Cerrar sesión",
    "3 → Cancelar"
  ].join("\n");
  const choice=prompt("👤 "+email+"\n\n"+opts+"\n\nEscribe 1, 2 o 3:");
  if(!choice)return;
  const c=choice.trim();
  if(c==="1"){
    if(isGoogleOnly){alert("Tu cuenta entra con Google. La contraseña se gestiona en tu cuenta de Google, no aquí.");return}
    openChangePassword();
  }else if(c==="2"){
    logoutSession();
  }
}

// v5.0.1: Cambiar contraseña (requiere re-autenticación con la actual)
async function openChangePassword(){
  if(!currentUser){alert("Debes estar autenticado");return}
  const email=currentUser.email;
  const current=prompt("🔐 Cambiar contraseña\n\nIngresa tu contraseña ACTUAL:");
  if(!current)return;
  const nueva=prompt("Ingresa la contraseña NUEVA (mínimo 6 caracteres):");
  if(!nueva)return;
  if(nueva.length<6){alert("La nueva contraseña debe tener al menos 6 caracteres.");return}
  const nueva2=prompt("Confirma la contraseña NUEVA:");
  if(nueva2!==nueva){alert("Las contraseñas no coinciden. Intenta de nuevo.");return}
  try{
    showLoader("Actualizando...");
    await fbReady();
    const {auth,EmailAuthProvider,reauthenticateWithCredential,updatePassword}=window.fb;
    const cred=EmailAuthProvider.credential(email,current);
    await reauthenticateWithCredential(auth.currentUser,cred);
    await updatePassword(auth.currentUser,nueva);
    hideLoader();
    alert("✅ Contraseña actualizada. Úsala en tu próximo inicio de sesión.");
  }catch(e){
    hideLoader();
    console.warn("Change password falló:",e);
    let msg="No se pudo cambiar la contraseña";
    if(e?.code==="auth/wrong-password"||e?.code==="auth/invalid-credential")msg="La contraseña actual es incorrecta";
    else if(e?.code==="auth/weak-password")msg="Contraseña nueva muy débil (mínimo 6 caracteres)";
    else if(e?.code==="auth/requires-recent-login")msg="Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña";
    else if(e?.code==="auth/too-many-requests")msg="Demasiados intentos. Espera unos minutos.";
    alert("❌ "+msg);
  }
}

// v5.0: Observador de auth. Llamado desde bootstrap.
// Si hay user → esconde overlay + initApp. Si no → muestra overlay.
function initAuthObserver(){
  const fn=()=>{
    if(!window.fb?.onAuthStateChanged)return setTimeout(fn,100);
    const {auth,onAuthStateChanged,getRedirectResult}=window.fb;
    // v5.0.1: procesar resultado de redirect de Google (si veníamos de un redirect login)
    if(getRedirectResult){
      getRedirectResult(auth).catch(e=>{
        if(e?.code&&e.code!=="auth/no-auth-event")console.warn("getRedirectResult:",e);
      });
    }
    onAuthStateChanged(auth,(user)=>{
      currentUser=user;
      const overlay=$("pin-overlay");
      if(user){
        // Autenticado → esconder overlay, arrancar app
        if(overlay)overlay.style.display="none";
        initApp();
      }else{
        // No autenticado → mostrar overlay con form login
        if(overlay){
          overlay.style.display="flex";
          // Reset del botón por si quedó en "Verificando..."
          const btn=$("login-submit");if(btn){btn.disabled=false;btn.textContent="Entrar"}
          // Focus al email
          setTimeout(()=>{const e=$("login-email");if(e)e.focus()},100);
        }
      }
    });
  };
  fn();
}

// ─── v5.0: STORAGE HELPERS ─────────────────────────────────
// Sube un blob/file a Firebase Storage y devuelve la URL de descarga.
// path: "pagos/GB-2026-0107-1234567.jpg" (único por archivo)
async function uploadToStorage(blob,path){
  await fbReady();
  const {storage,storageRef,uploadBytes,getDownloadURL}=window.fb;
  const ref=storageRef(storage,path);
  await uploadBytes(ref,blob,{contentType:blob.type||"image/jpeg"});
  return await getDownloadURL(ref);
}

// Convierte un dataURL base64 (ej. "data:image/jpeg;base64,...") a Blob
function dataURLToBlob(dataUrl){
  const arr=dataUrl.split(",");
  const mime=(arr[0].match(/:(.*?);/)||[])[1]||"image/jpeg";
  const bin=atob(arr[1]);
  const len=bin.length;
  const u8=new Uint8Array(len);
  for(let i=0;i<len;i++)u8[i]=bin.charCodeAt(i);
  return new Blob([u8],{type:mime});
}

// Sube foto desde un dataURL base64 (el formato que genera nuestro canvas compress).
// Devuelve {url, path}.
async function uploadFotoFromBase64(base64DataUrl,docType,docId,subType){
  const ts=Date.now();
  const ext=(base64DataUrl.match(/data:image\/(\w+);/)||[])[1]||"jpg";
  const safeId=(docId||"sin").replace(/[^a-zA-Z0-9-_]/g,"_");
  const path=(subType||"misc")+"/"+safeId+"-"+ts+"."+ext;
  const blob=dataURLToBlob(base64DataUrl);
  const url=await uploadToStorage(blob,path);
  return {url,path};
}

// v5.0: audit stamp — devuelve {updatedBy, updatedByEmail} para agregar a cualquier updateDoc
// Así queda trazabilidad de quién hizo cada cambio (consultable en Firestore).
function auditStamp(){
  if(!currentUser)return {};
  return {
    updatedBy:currentUser.uid,
    updatedByEmail:currentUser.email||"(sin email)",
    updatedAtLocal:new Date().toISOString()
  };
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
    // v4.12.7: marcar _wrongCollection si un GB-PF-* quedó guardado en proposals/
    // (pasa cuando alguien edita una PF directamente y le da "Guardar borrador")
    sP.forEach(d=>{
      const isWrong=d.id&&d.id.startsWith("GB-PF-");
      out.push({kind:"proposal",id:d.id,...d.data(),...(isWrong?{_wrongCollection:true}:{})});
    });
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

// ═══════════════════════════════════════════════════════════
// v5.0.2: AUTO-SYNC HELPERS
// Cada vez que un pedido entra a un estado "agendable" (pedido, aprobada)
// con fecha de entrega, se marca needsSync=true.
// Cuando Luis comparte la agenda incremental, esos docs pasan a
// needsSync=false + lastSyncAt=timestamp.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// v5.0.4: HELPERS DE FOLLOW-UP COMERCIAL
// Los docs con status "enviada" (cotización) o "propfinal" (propuesta)
// tienen un sub-estado comercial llamado followUp:
//   - pendiente    : recién enviada, sin contacto todavía
//   - contactado   : ya le escribiste/llamaste, esperando respuesta
//   - activa       : cliente confirmó interés, en negociación
//   - perdida      : cliente dijo que no → excluida de todos los KPIs
// Si followUp no existe, se interpreta como "pendiente" por default.
// Los 7 días se cuentan desde updatedAt (cualquier edición lo resetea).
// ═══════════════════════════════════════════════════════════

const FOLLOW_UP_META={
  pendiente: {label:"Pendiente",  cls:"pendiente",  desc:"Sin contacto todavía",       emoji:"⏳"},
  contactado:{label:"Contactado", cls:"contactado", desc:"Esperando respuesta",         emoji:"💬"},
  activa:    {label:"Activa",     cls:"activa",     desc:"En negociación",              emoji:"✅"},
  perdida:   {label:"Perdida",    cls:"perdida",    desc:"Cerrada sin venta",           emoji:"❌"}
};

// v5.0.5: Meta del estado comercial binario expuesto al usuario.
// pendiente/contactado/activa → VIVA. perdida → PERDIDA.
const ESTADO_COMERCIAL_META={
  viva:   {label:"Viva",    cls:"viva",    emoji:"🟢"},
  perdida:{label:"Perdida", cls:"perdida", emoji:"❌"}
};

const MOTIVOS_PERDIDA={
  precio:"Precio",
  competencia:"Competencia",
  no_respondio:"No respondió",
  cambio_planes:"Cambio de planes",
  tiempo:"Tiempo",
  otro:"Otro"
};

// ¿Este doc es susceptible de follow-up comercial?
// Solo cotizaciones "enviada" y propuestas "enviada" o "propfinal".
function isFollowable(q){
  if(!q||q._wrongCollection)return false;
  if(q.status==="anulada"||q.status==="superseded"||q.status==="convertida")return false;
  // v5.2.3: docs sin campo `status` (legacy pre-v5.0.3) se tratan como "enviada".
  // Antes de este fix quedaban invisibles al pipeline/historial/seguimiento aunque
  // sí aparecían en "Cotizado" del dashboard (inconsistencia reportada por Luis).
  const s=q.status||"enviada";
  if(q.kind==="quote"&&s==="enviada")return true;
  if(q.kind==="proposal"&&(s==="enviada"||s==="propfinal"))return true;
  return false;
}

// Status de follow-up efectivo (resuelve el default "pendiente" si falta el campo)
function getFollowUp(q){
  if(!q)return "pendiente";
  if(q.followUp&&FOLLOW_UP_META[q.followUp])return q.followUp;
  return "pendiente";
}

// v5.0.5: Estado comercial binario (viva | perdida) para docs followable.
// Regla: perdida solo si followUp === "perdida". Todo lo demás (pendiente,
// contactado, activa) → viva. Si el doc no es followable, devuelve null.
function estadoComercial(q){
  if(!isFollowable(q))return null;
  return getFollowUp(q)==="perdida"?"perdida":"viva";
}
function isViva(q){return estadoComercial(q)==="viva"}
function isPerdida(q){return estadoComercial(q)==="perdida"}

// Días desde la última actualización del doc (cualquier edición cuenta)
function daysSinceUpdate(q){
  if(!q)return 0;
  const refStr=q.updatedAt?._seconds
    ? new Date(q.updatedAt._seconds*1000).toISOString()
    : (q.updatedAt?.toDate ? q.updatedAt.toDate().toISOString() : (q.updatedAtIso||q.dateISO));
  if(!refStr)return 0;
  const ref=new Date(refStr);
  if(isNaN(ref.getTime()))return 0;
  const ms=Date.now()-ref.getTime();
  return Math.max(0,Math.floor(ms/(1000*60*60*24)));
}

// Pipeline activo (lo vivo hoy, sin filtro de fecha)
// Para el dashboard v5.0.4. Devuelve 3 buckets con total y count.
function getPipelineActivo(){
  const buckets={
    en_cotizacion:{count:0,total:0,docs:[]},
    pedidos_confirmados:{count:0,total:0,docs:[]},
    entregados_con_saldo:{count:0,total:0,docs:[]}
  };
  if(!Array.isArray(quotesCache))return buckets;
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    if(["superseded","convertida","anulada"].includes(q.status))return;
    // Excluir cotizaciones marcadas como perdidas
    if(getFollowUp(q)==="perdida")return;
    const total=q.total||0;
    // v5.2.3: normalizar status — docs sin campo `status` (legacy pre-v5.0.3) se
    // tratan como "enviada". Antes quedaban fuera del pipeline aunque sí sumaban
    // en el dashboard, causando discrepancias reportadas por Luis.
    const s=q.status||"enviada";
    // Bucket 1: en cotización viva (enviada/propfinal sin perdida)
    if(q.kind==="quote"&&s==="enviada"){
      buckets.en_cotizacion.count++;
      buckets.en_cotizacion.total+=total;
      buckets.en_cotizacion.docs.push(q);
    }else if(q.kind==="proposal"&&(s==="enviada"||s==="propfinal")){
      buckets.en_cotizacion.count++;
      buckets.en_cotizacion.total+=total;
      buckets.en_cotizacion.docs.push(q);
    }
    // Bucket 2: pedido confirmado (pedido/aprobada/en_produccion)
    else if(["pedido","aprobada","en_produccion"].includes(s)){
      buckets.pedidos_confirmados.count++;
      buckets.pedidos_confirmados.total+=total;
      buckets.pedidos_confirmados.docs.push(q);
    }
    // Bucket 3: entregado con saldo pendiente
    else if(s==="entregado"){
      const saldo=typeof saldoPendiente==="function"?saldoPendiente(q):0;
      if(saldo>0){
        buckets.entregados_con_saldo.count++;
        buckets.entregados_con_saldo.total+=saldo; // usamos saldo, no total
        buckets.entregados_con_saldo.docs.push(q);
      }
    }
  });
  return buckets;
}

// Marca un doc con un estado de follow-up y actualiza campos relacionados.
// accion: "contactado" | "activa" | "perdida" | "pendiente"
async function setFollowUp(docId,kind,nuevoEstado,extra){
  if(!FOLLOW_UP_META[nuevoEstado]){throw new Error("Estado followUp inválido: "+nuevoEstado)}
  if(!cloudOnline){alert("Sin conexión.");return false}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return false;
  const {db,doc,updateDoc,serverTimestamp}=window.fb;
  let coll;
  if(kind==="quote")coll="quotes";
  else if(docId&&docId.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  const patch={
    followUp:nuevoEstado,
    followUpUpdatedAt:new Date().toISOString(),
    updatedAt:serverTimestamp()
  };
  // v5.2.3: auto-normalización — si el doc no tiene `status` (legacy pre-v5.0.3),
  // al etiquetar followUp aprovechamos para escribirle también status="enviada"
  // (o "propfinal" si es una PF). Así los datos se auto-reparan con el uso normal.
  if(!q.status){
    const defaultStatus=(kind==="proposal"&&docId&&docId.startsWith("GB-PF-"))?"propfinal":"enviada";
    patch.status=defaultStatus;
  }
  if(typeof auditStamp==="function")Object.assign(patch,auditStamp());
  if(nuevoEstado==="perdida"&&extra){
    patch.perdidaData={
      fecha:new Date().toISOString(),
      motivo:extra.motivo||"otro",
      motivoLabel:extra.motivoLabel||MOTIVOS_PERDIDA[extra.motivo]||"Otro",
      notas:extra.notas||""
    };
  }
  try{
    await updateDoc(doc(db,coll,docId),patch);
    q.followUp=nuevoEstado;
    q.followUpUpdatedAt=patch.followUpUpdatedAt;
    if(patch.status)q.status=patch.status; // v5.2.3: reflejar normalización en cache
    if(patch.perdidaData)q.perdidaData=patch.perdidaData;
    return true;
  }catch(e){
    console.error("setFollowUp error",e);
    alert("Error actualizando seguimiento: "+(e.message||e));
    return false;
  }
}

// Agrega una nota de seguimiento al doc (al array notasSeguimiento[])
async function addNotaSeguimiento(docId,kind,texto){
  if(!texto||!texto.trim())return false;
  if(!cloudOnline){alert("Sin conexión.");return false}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return false;
  const {db,doc,updateDoc,serverTimestamp}=window.fb;
  let coll;
  if(kind==="quote")coll="quotes";
  else if(docId&&docId.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  const nuevaNota={
    fecha:new Date().toISOString(),
    texto:texto.trim(),
    usuario:(window.auth?.currentUser?.email||"Luis")
  };
  const notasExistentes=Array.isArray(q.notasSeguimiento)?q.notasSeguimiento:[];
  const notasNuevas=[...notasExistentes,nuevaNota];
  const patch={
    notasSeguimiento:notasNuevas,
    followUpUpdatedAt:new Date().toISOString(),
    updatedAt:serverTimestamp()
  };
  if(typeof auditStamp==="function")Object.assign(patch,auditStamp());
  try{
    await updateDoc(doc(db,coll,docId),patch);
    q.notasSeguimiento=notasNuevas;
    q.followUpUpdatedAt=patch.followUpUpdatedAt;
    return true;
  }catch(e){
    console.error("addNotaSeguimiento error",e);
    alert("Error guardando nota: "+(e.message||e));
    return false;
  }
}

// v5.0.5: Reactivar una perdida → vuelve a VIVA.
// destino: "pendiente" (vuelve a viva normal) | "activa" (viva caliente).
// Limpia perdidaData y deja traza en notasSeguimiento + reactivadaData.
async function reactivarPerdida(docId,kind,destino){
  if(destino!=="pendiente"&&destino!=="activa"){
    throw new Error("Destino inválido para reactivar: "+destino);
  }
  if(!cloudOnline){alert("Sin conexión.");return false}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return false;
  if(getFollowUp(q)!=="perdida"){alert("El documento no está marcado como perdida");return false}
  const {db,doc,updateDoc,serverTimestamp,deleteField}=window.fb;
  let coll;
  if(kind==="quote")coll="quotes";
  else if(docId&&docId.startsWith("GB-PF-"))coll="propfinals";
  else coll="proposals";
  const ahora=new Date().toISOString();
  const reactivadaData={
    fecha:ahora,
    destinoPrevio:q.perdidaData?.motivoLabel||q.perdidaData?.motivo||"—",
    destino,
    usuario:(window.auth?.currentUser?.email||"Luis")
  };
  const notaAuto={
    fecha:ahora,
    texto:"♻️ Reactivada desde perdida ("+(q.perdidaData?.motivoLabel||"sin motivo")+") → "+(destino==="activa"?"VIVA (activa)":"VIVA"),
    usuario:reactivadaData.usuario
  };
  const notasExistentes=Array.isArray(q.notasSeguimiento)?q.notasSeguimiento:[];
  const notasNuevas=[...notasExistentes,notaAuto];
  const patch={
    followUp:destino,
    perdidaData:deleteField?deleteField():null,
    reactivadaData,
    notasSeguimiento:notasNuevas,
    followUpUpdatedAt:ahora,
    updatedAt:serverTimestamp()
  };
  if(typeof auditStamp==="function")Object.assign(patch,auditStamp());
  try{
    await updateDoc(doc(db,coll,docId),patch);
    q.followUp=destino;
    q.perdidaData=null;
    q.reactivadaData=reactivadaData;
    q.notasSeguimiento=notasNuevas;
    q.followUpUpdatedAt=ahora;
    return true;
  }catch(e){
    console.error("reactivarPerdida error",e);
    alert("Error reactivando: "+(e.message||e));
    return false;
  }
}

// ¿Es un pedido con fecha de entrega futura en un estado agendable?
function isAgendable(q){
  if(!q||q._wrongCollection||q.status==="superseded"||q.status==="convertida"||q.status==="anulada")return false;
  if(!q.eventDate)return false;
  const hoy=new Date().toISOString().slice(0,10);
  if(q.eventDate<hoy)return false;
  const ok=(q.kind==="quote"&&["pedido","en_produccion"].includes(q.status))||(q.kind==="proposal"&&["aprobada","en_produccion"].includes(q.status));
  return ok;
}

// Marca un doc como needsSync=true al guardarlo (llamar tras marcar pedido/aprobada).
async function markAsNeedsSync(docId,kind){
  if(!cloudOnline)return;
  try{
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(docId&&docId.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";
    const payload={needsSync:true,updatedAt:serverTimestamp()};
    // audit stamp si está disponible (v5.0.0)
    if(typeof auditStamp==="function"){Object.assign(payload,auditStamp())}
    await updateDoc(doc(db,coll,docId),payload);
    const local=quotesCache.find(x=>x.id===docId&&x.kind===kind);
    if(local)local.needsSync=true;
  }catch(e){console.warn("markAsNeedsSync error",docId,e)}
}

// Marca varios docs como synced=true tras compartir el .ics.
async function markAsSynced(docs){
  if(!cloudOnline||!docs||!docs.length)return;
  try{
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    const now=new Date().toISOString();
    for(const q of docs){
      let coll;
      if(q.kind==="quote")coll="quotes";
      else if(q.id&&q.id.startsWith("GB-PF-"))coll="propfinals";
      else coll="proposals";
      const payload={needsSync:false,lastSyncAt:now,updatedAt:serverTimestamp()};
      if(typeof auditStamp==="function"){Object.assign(payload,auditStamp())}
      try{
        await updateDoc(doc(db,coll,q.id),payload);
        q.needsSync=false;
        q.lastSyncAt=now;
      }catch(e){console.warn("markAsSynced fail "+q.id,e)}
    }
  }catch(e){console.warn("markAsSynced error",e)}
}

// Mantenimiento: fuerza a que todos los agendables futuros queden needsSync=true.
// Útil si Luis cambia de teléfono o quiere re-sincronizar todo.
async function markAllUnsyncedAsPending(){
  if(!cloudOnline){alert("Sin conexión.");return}
  try{
    if(!quotesCache.length){await loadAllHistory()}
    const pendientes=quotesCache.filter(isAgendable);
    if(!pendientes.length){
      if(typeof toast==="function")toast("No hay pedidos futuros agendables — nada que marcar","info");
      else alert("No hay pedidos futuros agendables.");
      return;
    }
    if(!confirm("🔁 Marcar TODOS los "+pendientes.length+" pedidos futuros agendables como 'pendientes de sincronizar'.\n\nEl banner verde de sync aparecerá arriba del dashboard con un conteo de "+pendientes.length+".\n\n¿Continuar?"))return;
    showLoader("Marcando "+pendientes.length+" pedidos...");
    const {db,doc,updateDoc,serverTimestamp}=window.fb;
    let ok=0,fail=0;
    for(const q of pendientes){
      let coll;
      if(q.kind==="quote")coll="quotes";
      else if(q.id&&q.id.startsWith("GB-PF-"))coll="propfinals";
      else coll="proposals";
      const payload={needsSync:true,updatedAt:serverTimestamp()};
      if(typeof auditStamp==="function"){Object.assign(payload,auditStamp())}
      try{await updateDoc(doc(db,coll,q.id),payload);q.needsSync=true;ok++}
      catch(e){fail++;console.warn("fail mark "+q.id,e)}
    }
    hideLoader();
    if(typeof toast==="function")toast("🔁 "+ok+" pedido(s) marcados"+(fail?" · "+fail+" fallos":""),fail?"warn":"success");
    if(curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
    if(curMode==="hist"&&typeof renderHist==="function")renderHist();
  }catch(e){hideLoader();alert("Error: "+(e.message||e));console.error(e)}
}

// ═══════════════════════════════════════════════════════════
// v5.0.2: MODAL BACKUP INFO (abrir/cerrar)
// ═══════════════════════════════════════════════════════════
function openBackupInfoModal(){
  const m=$("backup-info-modal");
  if(m)m.classList.remove("hidden");
}
function closeBackupInfoModal(){
  const m=$("backup-info-modal");
  if(m)m.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════
// v5.0.2: MODAL RANGO CUSTOM
// ═══════════════════════════════════════════════════════════
function openCustomRangeModal(){
  const m=$("custom-range-modal");
  if(!m)return;
  // Pre-cargar con el rango actual si ya había custom activo
  if(typeof dashCustomFrom==="string"&&dashCustomFrom)$("cr-from").value=dashCustomFrom;
  if(typeof dashCustomTo==="string"&&dashCustomTo)$("cr-to").value=dashCustomTo;
  m.classList.remove("hidden");
}
function closeCustomRangeModal(){
  const m=$("custom-range-modal");
  if(m)m.classList.add("hidden");
}
function setCustomRangePreset(kind){
  const today=new Date();
  const toIso=d=>d.toISOString().slice(0,10);
  let from,to=toIso(today);
  if(kind==="last7"){const d=new Date(today);d.setDate(d.getDate()-6);from=toIso(d)}
  else if(kind==="last30"){const d=new Date(today);d.setDate(d.getDate()-29);from=toIso(d)}
  else if(kind==="last90"){const d=new Date(today);d.setDate(d.getDate()-89);from=toIso(d)}
  else if(kind==="ytd"){from=today.getFullYear()+"-01-01"}
  else if(kind==="q1"){from=today.getFullYear()+"-01-01";to=today.getFullYear()+"-03-31"}
  else if(kind==="prev-month"){
    const y=today.getFullYear(),m=today.getMonth();
    const firstPrev=new Date(y,m-1,1);
    const lastPrev=new Date(y,m,0);
    from=toIso(firstPrev);to=toIso(lastPrev);
  }
  if(from)$("cr-from").value=from;
  if(to)$("cr-to").value=to;
}
function applyCustomRange(){
  const f=($("cr-from").value||"").trim();
  const t=($("cr-to").value||"").trim();
  if(!f||!t){alert("Escoge ambas fechas.");return}
  if(f>t){alert("La fecha 'Desde' debe ser menor o igual a 'Hasta'.");return}
  if(typeof dashCustomFrom!=="undefined"){dashCustomFrom=f;dashCustomTo=t}
  else{window.dashCustomFrom=f;window.dashCustomTo=t}
  if(typeof dashPeriod!=="undefined")dashPeriod="custom";
  else window.dashPeriod="custom";
  closeCustomRangeModal();
  // Marcar botón custom como activo
  document.querySelectorAll(".dp-btn").forEach(b=>b.classList.toggle("act",b.dataset.p==="custom"));
  if(typeof renderDashboard==="function")renderDashboard();
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
  // v5.0.4: agregar 'seg' (seguimiento comercial) al switch de modos
  ["dash","cot","prop","search","hist","seg","cal"].forEach(x=>{
    const el=$("mode-"+x);
    if(el)el.classList.toggle("hidden",x!==m);
    document.querySelectorAll(".mode-btn.m-"+x).forEach(b=>b.classList.toggle("act",x===m));
  });
  if(m==="hist")renderHist();
  if(m==="prop")initProp();
  if(m==="cal")renderCalendar();
  if(m==="cot")renderMiniDash();
  if(m==="dash")renderDashboard();
  if(m==="seg"&&typeof renderSeguimiento==="function")renderSeguimiento();
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
// v5.0.1b: helper que encuentra la PF hija de una propuesta convertida.
// Devuelve el doc de la PF o null si no hay.
function findChildPF(propId){
  if(!propId)return null;
  return quotesCache.find(x=>x.kind==="proposal"&&x.sourceProposal===propId&&!x._wrongCollection&&x.status!=="superseded")||null;
}

// v5.0.1b: ¿la PF hija está en estado "seguro" para borrar en cascada?
// Segura = propfinal o aprobada SIN pagos registrados ni entrega registrada.
// NO segura = en_produccion, entregado, o con pagos/entrega registrada.
function isPFSafeToDelete(pf){
  if(!pf)return true;
  if(["en_produccion","entregado"].includes(pf.status||""))return false;
  const pagos=getPagos(pf);
  if(pagos&&pagos.length>0)return false;
  if(pf.entregaData)return false;
  return true;
}

async function delHistItem(kind,id,ev){
  ev.stopPropagation();
  // v5.0.1b: reglas de borrado más granulares con detección de cascada.
  //   Cotizaciones: solo se pueden borrar ENVIADAS.
  //   Propuestas: borrables excepto en_produccion/entregado, con cascada para "convertida".
  const q=quotesCache.find(x=>x.id===id&&x.kind===kind);
  const status=q?.status||"enviada";
  // v5.0.3: docs anulados son registro histórico financiero — no se borran
  const hardBlock=["en_produccion","entregado","anulada"];
  if(hardBlock.includes(status)){
    if(status==="anulada"){
      alert("⚠️ No se puede eliminar.\n\n"+id+" está anulada — es registro histórico del pedido cancelado (con motivo y pagos/devoluciones registradas).\n\nBorrarla perdería la trazabilidad financiera.\n\nSi necesitas sacarla del historial, usa el filtro 'Anuladas' que ya la tiene oculta por default.");
    }else{
      alert("⚠️ No se puede eliminar.\n\n"+id+" está en estado \""+(STATUS_META[status]?.label||status)+"\".\n\nDocumentos en producción o entregados son registro histórico financiero. No se borran — se anulan dejando los productos en 0 y notas del motivo.");
    }
    return;
  }
  // Cotizaciones: solo enviada (mantiene regla v4.12.3)
  if(kind==="quote"&&status!=="enviada"){
    alert("⚠️ No se puede eliminar.\n\n"+id+" ya está en estado \""+(STATUS_META[status]?.label||status)+"\".\n\nUna cotización confirmada como pedido queda como registro permanente. Para anularla ábrela y déjala con productos en 0 y notas del motivo.");
    return;
  }
  // v5.0.1b: CASO ESPECIAL — propuesta convertida con PF hija viva
  if(status==="convertida"){
    const pfHija=findChildPF(id);
    if(pfHija){
      openCascadeDelModal(q,pfHija);
      return;
    }
    // Convertida sin PF hija detectable (raro, PF fue borrada antes) → flujo normal
  }
  // Propuestas: confirmación reforzada según estado
  let confirmMsg;
  if(status==="enviada"){
    confirmMsg="¿Eliminar "+id+"? Esta propuesta está en estado ENVIADA — aún no se ha aprobado.";
  }else if(status==="propfinal"){
    confirmMsg="⚠️ "+id+" es una PROPUESTA FINAL.\n\n¿Estás seguro de eliminarla? Esta acción es permanente.\n\nSi solo quieres actualizarla, usa 🔄 Nueva versión desde la card.";
  }else if(status==="aprobada"){
    confirmMsg="⚠️⚠️ "+id+" está APROBADA (cliente firmó).\n\nEliminarla borra el registro del compromiso comercial. ¿Estás SEGURO?";
  }else if(status==="convertida"){
    confirmMsg="ℹ️ "+id+" fue CONVERTIDA a Propuesta Final pero la PF hija ya no existe.\n\nEs seguro eliminar esta propuesta base.\n\n¿Continuar?";
  }else if(status==="superseded"){
    confirmMsg="¿Eliminar "+id+"? Esta propuesta fue REEMPLAZADA por una versión nueva — se puede borrar sin afectar la versión vigente.";
  }else{
    confirmMsg="¿Eliminar "+id+" ("+(STATUS_META[status]?.label||status)+")?";
  }
  if(!confirm(confirmMsg))return;
  // Doble confirmación si es aprobada (más crítica)
  if(status==="aprobada"){
    const typed=prompt("Para confirmar, escribe exactamente:  BORRAR "+id);
    if(typed!=="BORRAR "+id){alert("No se eliminó — la confirmación no coincidió.");return}
  }
  try{showLoader("Eliminando...");await deleteHistoryItem(kind,id);hideLoader();renderHist();if(typeof toast==="function")toast("🗑️ "+id+" eliminado","success")}
  catch(e){hideLoader();alert("Error: "+e.message)}
}

// ═══════════════════════════════════════════════════════════
// v5.0.1b: MODAL DE BORRADO EN CASCADA
// Para propuestas convertidas que tienen PF hija viva.
// ═══════════════════════════════════════════════════════════
let _cascadeDelCtx=null;
function openCascadeDelModal(propBase,pfHija){
  _cascadeDelCtx={propBase,pfHija};
  const safe=isPFSafeToDelete(pfHija);
  const pfStatus=STATUS_META[pfHija.status||"propfinal"]?.label||pfHija.status;
  const pagos=getPagos(pfHija);
  const tieneEntrega=!!pfHija.entregaData;
  const motivosNoSeguro=[];
  if(pagos&&pagos.length>0)motivosNoSeguro.push("tiene "+pagos.length+" pago(s) registrado(s)");
  if(tieneEntrega)motivosNoSeguro.push("tiene entrega registrada");
  if(["en_produccion","entregado"].includes(pfHija.status))motivosNoSeguro.push("está en estado "+pfStatus);

  let html='<div style="font-size:13px;line-height:1.5;color:#333;margin-bottom:14px">';
  html+='<p style="margin:0 0 10px"><strong>'+propBase.id+'</strong> es la propuesta base que generó una Propuesta Final viva:</p>';
  html+='<div style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:12px">';
  html+='<div><strong style="color:#E65100">'+pfHija.id+'</strong> · '+(pfHija.client||"—")+'</div>';
  html+='<div style="color:#555;margin-top:4px">Estado: <strong>'+pfStatus+'</strong> · Total: '+fm(pfHija.total||0);
  if(pagos&&pagos.length>0)html+=' · 💵 '+pagos.length+' pago(s)';
  if(tieneEntrega)html+=' · 🎉 entregada';
  html+='</div></div>';
  html+='</div>';

  if(!safe){
    html+='<div style="background:#FFEBEE;border:1.5px solid #EF5350;border-radius:8px;padding:12px;margin:10px 0;color:#B71C1C;font-size:12.5px;line-height:1.5">';
    html+='<strong>🔒 Borrado en cascada NO DISPONIBLE</strong><br>';
    html+='La PF hija no se puede borrar porque '+motivosNoSeguro.join(", ")+'. Es registro histórico financiero.<br><br>';
    html+='Las únicas opciones son:';
    html+='</div>';
    html+='<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">';
    html+='<button class="btn bo" style="background:#ECEFF1;color:#455A64" onclick="closeCascadeDelModal()">Cancelar — no borrar nada</button>';
    html+='<button class="btn" style="background:linear-gradient(135deg,#FF9800,#E65100);color:#fff" onclick="executeDelProposalOnly()">⚠️ Borrar solo la propuesta base (PF quedará huérfana)</button>';
    html+='<div style="font-size:10.5px;color:#757575;text-align:center;margin-top:4px;line-height:1.4">Si borras solo la propuesta base, la PF seguirá existiendo<br>pero NO podrás usar 🔄 Nueva versión en ella.</div>';
    html+='</div>';
  }else{
    html+='<div style="background:#E8F5E9;border:1.5px solid #81C784;border-radius:8px;padding:12px;margin:10px 0;color:#1B5E20;font-size:12.5px;line-height:1.5">';
    html+='<strong>✅ Borrado en cascada disponible</strong><br>';
    html+='La PF hija está en estado <strong>'+pfStatus+'</strong> sin pagos ni entrega registrada — se puede eliminar junto con la propuesta base de forma segura.';
    html+='</div>';
    html+='<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">';
    html+='<button class="btn bo" style="background:#ECEFF1;color:#455A64" onclick="closeCascadeDelModal()">Cancelar — no borrar nada</button>';
    html+='<button class="btn" style="background:linear-gradient(135deg,#FF9800,#E65100);color:#fff" onclick="executeDelProposalOnly()">Borrar solo la propuesta base (PF queda huérfana)</button>';
    html+='<button class="btn" style="background:linear-gradient(135deg,#D32F2F,#B71C1C);color:#fff" onclick="executeDelCascade()">🗑️ Borrar en CASCADA (propuesta + PF) — triple confirmación</button>';
    html+='</div>';
  }
  $("cascade-del-body").innerHTML=html;
  $("cascade-del-modal").classList.remove("hidden");
}
function closeCascadeDelModal(){
  $("cascade-del-modal").classList.add("hidden");
  _cascadeDelCtx=null;
}
async function executeDelProposalOnly(){
  if(!_cascadeDelCtx)return;
  const {propBase,pfHija}=_cascadeDelCtx;
  if(!confirm("⚠️ Borrar solo "+propBase.id+"\n\nLa PF "+pfHija.id+" quedará HUÉRFANA — no podrás usar 🔄 Nueva versión sobre ella.\n\n¿Confirmar?"))return;
  closeCascadeDelModal();
  try{
    showLoader("Eliminando propuesta base...");
    await deleteHistoryItem("proposal",propBase.id);
    hideLoader();
    if(typeof toast==="function")toast("🗑️ "+propBase.id+" eliminado — la PF quedó huérfana","warn");
    renderHist();
    if(curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
  }catch(e){hideLoader();alert("Error: "+e.message);console.error(e)}
}
async function executeDelCascade(){
  if(!_cascadeDelCtx)return;
  const {propBase,pfHija}=_cascadeDelCtx;
  const phrase="BORRAR EN CASCADA "+propBase.id;
  const typed=prompt("🗑️ BORRADO EN CASCADA\n\nSe van a eliminar PERMANENTEMENTE:\n  • "+propBase.id+" (propuesta base)\n  • "+pfHija.id+" (Propuesta Final hija)\n\nPara confirmar, escribe exactamente:\n"+phrase);
  if(typed!==phrase){alert("No se eliminó — la confirmación no coincidió.");return}
  closeCascadeDelModal();
  try{
    showLoader("Eliminando en cascada...");
    // Primero borramos la PF hija (está en propfinals/)
    const {db,doc,deleteDoc}=window.fb;
    await deleteDoc(doc(db,"propfinals",pfHija.id));
    // Después la propuesta base (está en proposals/)
    await deleteDoc(doc(db,"proposals",propBase.id));
    // Limpiar cache local
    quotesCache=quotesCache.filter(x=>!(x.id===propBase.id||x.id===pfHija.id));
    hideLoader();
    if(typeof toast==="function")toast("🗑️ Eliminados "+propBase.id+" + "+pfHija.id,"success");
    renderHist();
    if(curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
  }catch(e){hideLoader();alert("Error en cascada: "+e.message);console.error(e)}
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
    // v4.13.0: bloqueo extendido — docs en producción/entregados/convertidos/reemplazados
    // son registro histórico. Se pueden VER pero no GUARDAR cambios encima.
    // savePropQuote/saveCurrentQuote ya bloquean el guardado, pero avisamos aquí al abrir.
    const _qStatus=q.status||"enviada";
    const _readonlyStatuses=["en_produccion","entregado","convertida","superseded"];
    if(_readonlyStatuses.includes(_qStatus)){
      const _stLabel=(STATUS_META[_qStatus]||{}).label||_qStatus;
      alert("🔒 Este documento está en estado \""+_stLabel+"\" ("+id+").\n\nPuedes verlo pero los cambios NO se guardan (es registro histórico).\n\nPara ajustes:\n• PF reemplazada → usa 🔄 Nueva versión\n• Pedido entregado → solo consulta\n• Si realmente necesitas editar → duplica (📋) y arranca uno nuevo");
    }
    if(kind==="proposal"){
      // v4.12.7: si es una Propuesta Final, avisar que no se puede editar directamente
      if(id&&id.startsWith("GB-PF-")&&_qStatus!=="superseded"){
        alert("ℹ️ Esta es una Propuesta Final firmada ("+id+").\n\nLas PF son registro formal — no se deben editar directamente.\n\nPara aplicar cambios que pidió el cliente:\n1. Cierra esta vista.\n2. Ve al historial → busca esta PF.\n3. Toca el botón 🔄 Nueva versión.\n\nEso abrirá la propuesta base editable y al generar creará una PF nueva (la anterior quedará marcada como reemplazada).");
      }
      setMode("prop");
      loadPropQuote({...q,quoteNumber:id});
      return;
    }
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
    // v5.4.2 (UX-002): restaurar fecha de entrega y momentos en el formulario.
    // Antes se guardaba en Firestore (q.eventDate + q.momentosArr desde v5.4.0)
    // y salía en el PDF, pero los campos del form aparecían vacíos al reabrir.
    try{
      const fDate=$("f-date");
      if(fDate)fDate.value=q.eventDate||"";
      // Reset todos los checkboxes de momentos
      document.querySelectorAll('#f-moments input[type=checkbox]').forEach(cb=>{cb.checked=false});
      const fOther=$("f-time-other");if(fOther)fOther.value="";
      const fOtherWrap=$("f-time-other-wrap");if(fOtherWrap)fOtherWrap.classList.add("hidden");
      const chkOtro=$("chk-otro");
      // Marcar los momentos guardados
      const moms=Array.isArray(q.momentosArr)?q.momentosArr:[];
      const fijos=["Desayuno","Refrigerio mañana","Almuerzo","Refrigerio tarde","Comida","Cóctel noche"];
      let customMom="";
      moms.forEach(m=>{
        if(fijos.includes(m)){
          const cb=document.querySelector('#f-moments input[type=checkbox][value="'+m.replace(/"/g,'\\"')+'"]');
          if(cb)cb.checked=true;
        }else{
          customMom=m; // cualquier cosa que no sea fija → va a "Otro"
        }
      });
      if(customMom&&chkOtro){
        chkOtro.checked=true;
        if(fOther)fOther.value=customMom;
        if(fOtherWrap)fOtherWrap.classList.remove("hidden");
      }
      // Refrescar estilos visuales de los labels (selected state) si existe togMom
      document.querySelectorAll('#f-moments input[type=checkbox]').forEach(cb=>{
        if(typeof togMom==="function")togMom(cb);
      });
    }catch(e){console.warn("[loadQuote] restaurar f-date/f-moments falló:",e)}
    if(q.notasCotData&&typeof q.notasCotData==="object"){notasCotData={...q.notasCotData}}
    else{notasCotData={...DEFAULT_NOTAS_COT}}
    if(q.firma)firmaCot=q.firma;
    setFirma("cot",firmaCot);
    showClientHistoryPanel(q.client||"","cot");
    go("review");
  }catch(e){hideLoader();alert("Error: "+e.message)}
}

// ═══════════════════════════════════════════════════════════
// v4.13.0: Toast no bloqueante (reemplaza alerts informativos)
// ═══════════════════════════════════════════════════════════
// Uso: toast("Guardado", "success") · toast("Sin conexión", "error") · toast("Aviso", "warn")
// Tipos: success | error | warn | info (default)
function toast(msg,type){
  const tp=type||"info";
  let wrap=$("toast-wrap");
  if(!wrap){
    wrap=document.createElement("div");
    wrap.id="toast-wrap";
    document.body.appendChild(wrap);
  }
  const el=document.createElement("div");
  el.className="toast toast-"+tp;
  el.textContent=msg;
  wrap.appendChild(el);
  // Auto-remove tras ~3.5s (un poco más para mensajes largos)
  const ms=Math.min(6000,2500+msg.length*30);
  setTimeout(()=>{el.classList.add("toast-out");setTimeout(()=>el.remove(),300)},ms);
}
