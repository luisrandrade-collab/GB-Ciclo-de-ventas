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
const BUILD_VERSION="v7.7.5";
const BUILD_DATE="2026-04-24";
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
        // v7.6.1: pasar 'text' explícito para evitar que iOS autoinyecte el blob URL
        // del archivo en el mensaje (Telegram/WhatsApp lo pegaban como link parásito).
        // Quitamos 'title' porque no se renderiza consistente entre apps.
        await navigator.share({files:[file],text:"Cotización Gourmet Bites — "+filename.replace(/\.pdf$/,"")});
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
  // v5.4.4: _now y _p declarados AQUÍ (fuera del try) para que estén en scope del catch
  // BUG-010 fix: antes _now estaba dentro del try, y el catch intentaba usar _now.toISOString()
  // causando ReferenceError que impedía marcar pdfUploadFailed. Badge ⚠️ nunca se mostraba.
  const _p=n=>String(n).padStart(2,"0");
  const _now=new Date();
  // 3-5. Intentar subir a Storage y actualizar Firestore (best-effort)
  if(blob&&cloudOnline){
    try{
      await fbReady();
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
let CATS=["Todas",...new Set(C.map(x=>x.c))];
function refreshCats(){const hasCatCustom=customProductsCache.some(cp=>cp.inCatalog);const baseCats=["Todas",...new Set(C.map(x=>x.c))];CATS=hasCatCustom?[...baseCats,"Personalizados"]:baseCats}

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

// ═══════════════════════════════════════════════════════════
// v7.0-α FIX-05: MÁQUINA DE ESTADOS — grafo formal de transiciones
// ═══════════════════════════════════════════════════════════
// Define qué transiciones de status están permitidas. Modo de operación:
//   • Por defecto (audit): NO bloquea, solo loguea con window.__GB_V7_DEBUG
//   • Enforce: window.__GB_V7_ENFORCE_FSM = true bloquea con toast
//
// Estados terminales (no hay transición saliente): anulada, convertida, superseded.
// 'perdida' es reactivable a 'enviada' (legacy, raro pero existe en STATUS_META extendido).
// 'entregado → en_produccion' es la reversión introducida en FIX-03.
const STATE_TRANSITIONS={
  enviada:      ["pedido","aprobada","perdida","anulada","convertida","superseded"],
  propfinal:    ["aprobada","superseded","anulada"],
  aprobada:     ["en_produccion","entregado","anulada","enviada"],
  pedido:       ["en_produccion","entregado","anulada","enviada"],
  en_produccion:["entregado","anulada","enviada"],
  entregado:    ["en_produccion"],
  perdida:      ["enviada"],
  anulada:      [],
  convertida:   [],
  superseded:   []
};

// auditTransition(fromStatus, toStatus, context) → boolean
// Llamado desde los call sites principales antes de hacer updateDoc con un cambio de status.
// Retorna false SOLO si está en modo enforce y la transición no es válida.
// En audit puro: siempre retorna true, solo registra console.warn si la transición es sospechosa.
function auditTransition(fromStatus,toStatus,context){
  if(!fromStatus||!toStatus)return true; // sin info para auditar
  if(fromStatus===toStatus)return true;  // no es transición real
  const allowed=STATE_TRANSITIONS[fromStatus];
  if(!Array.isArray(allowed)){
    if(window.__GB_V7_DEBUG)console.warn("[FIX-05] estado desconocido en grafo",{from:fromStatus,to:toStatus,context:context||""});
    return true;
  }
  if(allowed.includes(toStatus)){
    if(window.__GB_V7_DEBUG)console.log("[FIX-05] transición OK",{from:fromStatus,to:toStatus,context:context||""});
    return true;
  }
  console.warn("[FIX-05] ⚠️ transición SOSPECHOSA (audit mode)",{from:fromStatus,to:toStatus,context:context||"",allowed});
  if(window.__GB_V7_ENFORCE_FSM){
    if(typeof toast==="function")toast("⚠️ Transición no permitida: "+fromStatus+" → "+toStatus+(context?" ("+context+")":""),"error",6000);
    return false;
  }
  return true; // audit mode: NO bloquea
}

// ═══════════════════════════════════════════════════════════
// v5.5.0: EDICIÓN DE PEDIDOS — Helpers de política de edición
// ═══════════════════════════════════════════════════════════
// Matriz aprobada 2026-04-23:
//   Cotizaciones:
//     enviada       → editable, sin fricción, genera versión -1, -2 (recotizado)
//     pedido        → editable, sin fricción, mismo número
//     en_produccion → editable, MODAL ADVERTENCIA, letrero post-guardado, mismo número
//     entregado     → editable SOLO notas internas, mismo número
//     anulada       → NO editable
//   Propuestas:
//     enviada       → editable, sin fricción, genera versión -1, -2
//     propfinal     → editable, sin fricción, genera versión -1, -2
//     aprobada      → editable, modal advertencia suave, mismo número
//     en_produccion → editable, MODAL ADVERTENCIA, letrero post-guardado, mismo número
//     entregado     → editable SOLO notas internas, mismo número
//     convertida    → NO editable
//     superseded    → NO editable
//     anulada       → NO editable

function canEdit(q){
  if(!q)return false;
  const st=q.status||"enviada";
  const blocked=["anulada","convertida","superseded"];
  return !blocked.includes(st);
}

// v6.4.0 P1: helpers centralizados de exclusión.
// Uso: en CUALQUIER cálculo que sume montos (KPIs, reportes, gráficos, exports),
// llamar primero a noSumaEnKpis(q) y hacer return si devuelve true.
// Si activas window.__GB_DEBUG_ANULADAS=true en consola, loguea cada anulada que
// se intentó sumar (ayuda a detectar lugares no migrados).
function isAnulada(q){
  if(!q)return false;
  if(q.status==="anulada")return true;
  // Defensa: también detectar docs con anuladaData pero status desincronizado
  if(q.anuladaData&&q.anuladaData.fecha&&q.status!=="superseded"&&q.status!=="convertida"){
    if(typeof window!=="undefined"&&window.__GB_DEBUG_ANULADAS){
      console.warn("[v6.4.0 P1] Doc con anuladaData pero status="+q.status,q.id||q.quoteNumber);
    }
    return true;
  }
  return false;
}

function noSumaEnKpis(q,contextLabel){
  if(!q)return true;
  if(q._wrongCollection)return true;
  if(q.status==="superseded")return true;
  if(q.status==="convertida")return true;
  if(isAnulada(q)){
    if(typeof window!=="undefined"&&window.__GB_DEBUG_ANULADAS){
      console.warn("[v6.4.0 P1] Anulada bloqueada en KPI"+(contextLabel?" ("+contextLabel+")":""),q.id||q.quoteNumber);
    }
    return true;
  }
  return false;
}

// BUG-E: builds a Set of doc IDs that should be excluded from KPI sums
// because they belong to an option group and are NOT the lowest-total sibling (conservative).
function buildOptionExclusions(docs){
  const excluded=new Set();
  const groups={};
  docs.forEach(q=>{
    if(!q.optionGroupId)return;
    if(!groups[q.optionGroupId])groups[q.optionGroupId]=[];
    groups[q.optionGroupId].push(q);
  });
  Object.values(groups).forEach(siblings=>{
    if(siblings.length<2)return;
    siblings.sort((a,b)=>(a.total||0)-(b.total||0));
    for(let i=1;i<siblings.length;i++)excluded.add(siblings[i].id);
  });
  return excluded;
}

// Returns option group info for a doc: {order, total} or null
function getOptionGroupInfo(q,allDocs){
  if(!q||!q.optionGroupId)return null;
  const siblings=allDocs.filter(d=>d.optionGroupId===q.optionGroupId);
  if(siblings.length<2)return null;
  siblings.sort((a,b)=>{
    const na=a.quoteNumber||a.id||"";
    const nb=b.quoteNumber||b.id||"";
    return na.localeCompare(nb);
  });
  const idx=siblings.findIndex(s=>s.id===q.id);
  return {order:idx+1,total:siblings.length,isPrimary:idx===0||(q.total||0)===Math.max(...siblings.map(s=>s.total||0))};
}

function requiresWarning(q){
  if(!q)return false;
  const st=q.status||"enviada";
  return st==="en_produccion"||st==="aprobada";
}

function warningSeverity(q){
  if(!q)return null;
  const st=q.status||"enviada";
  if(st==="en_produccion")return "fuerte";
  if(st==="aprobada")return "suave";
  return null;
}

function editOnlyNotes(q){
  if(!q)return false;
  return (q.status||"")==="entregado";
}

// ═══════════════════════════════════════════════════════════
// v6.0.0: VENTAS ANTERIORES — Helpers de pedidos cumplidos
// ═══════════════════════════════════════════════════════════
// Un pedido se considera "cumplido" cuando fue entregado Y está
// pagado por completo. Estos documentos se archivan en la pestaña
// "Ventas anteriores" para no sobrecargar el operativo diario.
//
// Reglas:
//   - status === "entregado" (requisito operativo)
//   - totalCobrado(q) >= getDocTotal(q) (requisito financiero)
//   - total > 0 (un doc sin total no se considera cumplido)
//
// Consecuencias:
//   - Aparece en archivo "ventas_anteriores" (pestaña nueva)
//   - Por defecto SALE de "Pedidos → Entregadas" (toggle para verlos)
//   - NO se puede anular (canAnular devuelve false)
// ═══════════════════════════════════════════════════════════

// v6.0.2: regla extendida para cortesías/muestras (total=0).
// Un pedido entregado con total=0 se considera cumplido automáticamente
// (no hay plata por cobrar). Así no queda varado en Pedidos→Entregadas
// de forma permanente. Se complementa con isCortesia() abajo para poder
// distinguirlo visualmente en el drill-down y en Ventas anteriores.
function isCumplido(q){
  if(!q)return false;
  if((q.status||"")!=="entregado")return false;
  const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||q.totalReal||0);
  // v6.0.2: total=0 (cortesía/muestra) entregado = cumplido automático
  if(!total||total<=0)return true;
  const cobrado=(typeof totalCobrado==="function")?totalCobrado(q):0;
  return cobrado>=total;
}

// v6.0.2: ¿es una cortesía/muestra?
// true si el doc tiene total=0 (cualquier status). Útil para badges visuales.
function isCortesia(q){
  if(!q)return false;
  const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||q.totalReal||0);
  return !total||total<=0;
}

// ¿Se puede anular este doc?
// Regla v6.0: NO si ya es cumplido (entregado + pagado completo) Y
// NO si status no está en lista reversible (pedido/aprobada/en_produccion).
// Antes de v6.0: solo status mandaba; ahora también cobro completo bloquea.
function canAnular(q){
  if(!q)return false;
  const st=q.status||"enviada";
  if(!["pedido","aprobada","en_produccion"].includes(st))return false;
  // v6.0: si ya está completamente pagado, bloquear anulación
  // (requiere devolución grande y operacionalmente ya no tiene sentido)
  const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||q.totalReal||0);
  if(total>0){
    const cobrado=(typeof totalCobrado==="function")?totalCobrado(q):0;
    if(cobrado>=total)return false;
  }
  return true;
}

// Versionado con sufijo -1, -2: solo pre-confirmación del cliente
function shouldVersionWithSuffix(q,kind){
  if(!q)return false;
  const st=q.status||"enviada";
  if(kind==="quote")return st==="enviada";
  if(kind==="proposal"||kind==="prop")return st==="enviada"||st==="propfinal";
  return false;
}

// GB-2026-0120 → GB-2026-0120-1 → GB-2026-0120-2 ...
// Heurística: el consecutivo original tiene 4 dígitos; el sufijo de versión tiene 1-3 dígitos.
function buildChildNumber(baseId){
  if(!baseId)return baseId;
  const m=baseId.match(/^(.+)-(\d+)$/);
  if(m){
    const head=m[1],tail=m[2];
    if(tail.length===4)return baseId+"-1";
    return head+"-"+(parseInt(tail,10)+1);
  }
  return baseId+"-1";
}

// Compara dos estados del doc y devuelve array {campo, antes, despues}
function diffDocs(oldQ,newQ){
  const cambios=[];
  if(!oldQ||!newQ)return cambios;
  const campos=[
    "client","idStr","att","mail","tel","dir","city","cityType","trCustom",
    "eventDate","horaEntrega","productionDate",
    "total","status","pers","momento","tipoServicio",
    "aperturaFrase","fechaVencimiento","optionGroupId","requiereFE"
  ];
  campos.forEach(k=>{
    const a=oldQ[k],b=newQ[k];
    if(_norm(a)!==_norm(b))cambios.push({campo:k,antes:a??"",despues:b??""});
  });
  if(oldQ.cart||newQ.cart){
    const ca=oldQ.cart||[],cb=newQ.cart||[];
    const ids=new Set([...ca.map(i=>i.id),...cb.map(i=>i.id)]);
    ids.forEach(id=>{
      const ia=ca.find(x=>x.id===id),ib=cb.find(x=>x.id===id);
      if(!ia&&ib)cambios.push({campo:"producto_agregado",antes:"",despues:(ib.n||"?")+" (x"+ib.qty+" @ $"+ib.p+")"});
      else if(ia&&!ib)cambios.push({campo:"producto_eliminado",antes:(ia.n||"?")+" (x"+ia.qty+" @ $"+ia.p+")",despues:""});
      else if(ia&&ib){
        if(ia.qty!==ib.qty)cambios.push({campo:"cantidad:"+(ib.n||"?"),antes:ia.qty,despues:ib.qty});
        if(ia.p!==ib.p)cambios.push({campo:"precio:"+(ib.n||"?"),antes:ia.p,despues:ib.p});
      }
    });
  }
  if(oldQ.cust||newQ.cust){
    const ca=oldQ.cust||[],cb=newQ.cust||[];
    const nombresA=ca.map(i=>i.n+"|"+i.qty+"|"+i.p).sort().join("§");
    const nombresB=cb.map(i=>i.n+"|"+i.qty+"|"+i.p).sort().join("§");
    if(nombresA!==nombresB){
      if(ca.length!==cb.length)cambios.push({campo:"items_custom",antes:ca.length+" items",despues:cb.length+" items"});
      else cambios.push({campo:"items_custom",antes:"modificados",despues:"ver detalle"});
    }
  }
  if(oldQ.sections||newQ.sections){
    const sa=JSON.stringify(oldQ.sections||[]),sb=JSON.stringify(newQ.sections||[]);
    if(sa!==sb)cambios.push({campo:"secciones_propuesta",antes:(oldQ.sections||[]).length+" secciones",despues:(newQ.sections||[]).length+" secciones"});
  }
  if(oldQ.notasCotData||newQ.notasCotData){
    const sa=JSON.stringify(oldQ.notasCotData||{}),sb=JSON.stringify(newQ.notasCotData||{});
    if(sa!==sb)cambios.push({campo:"notas_cotizacion",antes:"(modificadas)",despues:"(nueva versión)"});
  }
  return cambios;
}

function _norm(v){
  if(v===null||v===undefined)return "";
  if(typeof v==="string")return v.trim();
  return v;
}

function cambiosAfectanCliente(cambios){
  if(!Array.isArray(cambios)||!cambios.length)return false;
  const camposCliente=[
    "client","idStr","total","eventDate","horaEntrega",
    "productionDate","tipoServicio","pers","momento"
  ];
  return cambios.some(c=>{
    if(camposCliente.includes(c.campo))return true;
    if(c.campo.startsWith("producto_"))return true;
    if(c.campo.startsWith("cantidad:"))return true;
    if(c.campo.startsWith("precio:"))return true;
    if(c.campo==="items_custom")return true;
    if(c.campo==="secciones_propuesta")return true;
    return false;
  });
}

function buildEditHistoryEntry(cambios,razon){
  return {
    fecha:new Date().toISOString(),
    usuario:(currentUser&&currentUser.email)||"desconocido",
    usuarioDisplay:(currentUser&&(currentUser.displayName||(currentUser.email||"").split("@")[0]))||"Usuario",
    cambios:Array.isArray(cambios)?cambios:[],
    razon:(razon||"").slice(0,200)
  };
}

function pdfDesactualizado(q){
  if(!q||!Array.isArray(q.pdfHistorial)||!q.pdfHistorial.length)return false;
  if(!Array.isArray(q.editHistory)||!q.editHistory.length)return false;
  const lastPdf=q.pdfHistorial[q.pdfHistorial.length-1];
  const lastEdit=q.editHistory[q.editHistory.length-1];
  if(!lastPdf||!lastPdf.fecha||!lastEdit||!lastEdit.fecha)return false;
  return lastEdit.fecha>lastPdf.fecha;
}

function openEditHistoryModal(docId,kind){
  const q=(quotesCache||[]).find(x=>x.id===docId);
  if(!q||!Array.isArray(q.editHistory)||!q.editHistory.length){
    if(typeof toast==="function")toast("Este documento no tiene ediciones registradas","warn");
    else toast("Sin ediciones registradas","info");
    return;
  }
  const hist=q.editHistory.slice().reverse();
  const items=hist.map(e=>{
    const fecha=e.fecha?new Date(e.fecha).toLocaleString("es-CO"):"—";
    const usr=e.usuarioDisplay||e.usuario||"—";
    let cambiosHtml="";
    if(Array.isArray(e.cambios)&&e.cambios.length){
      cambiosHtml='<ul class="eh-chlist">'+e.cambios.map(c=>{
        const safeCampo=String(c.campo||"").replace(/</g,"&lt;");
        const safeA=String(c.antes===""||c.antes==null?"(vacío)":c.antes).replace(/</g,"&lt;");
        const safeD=String(c.despues===""||c.despues==null?"(vacío)":c.despues).replace(/</g,"&lt;");
        return '<li><strong>'+safeCampo+':</strong> <span class="eh-antes">'+safeA+'</span> → <span class="eh-despues">'+safeD+'</span></li>';
      }).join("")+'</ul>';
    }else{
      cambiosHtml='<div class="eh-nochange">(Sin cambios estructurales reportados)</div>';
    }
    const razonHtml=e.razon?'<div class="eh-razon"><strong>Razón:</strong> '+String(e.razon).replace(/</g,"&lt;")+'</div>':'';
    return '<div class="eh-card"><div class="eh-head"><span class="eh-fecha">🕒 '+fecha+'</span><span class="eh-user">'+usr+'</span></div>'+cambiosHtml+razonHtml+'</div>';
  }).join("");
  const body='<div class="eh-list">'+items+'</div>';
  const modal=$("edit-history-modal");
  if(!modal){toast("Modal de historial no disponible","error");return}
  $("eh-doc-id").textContent=docId;
  $("eh-body").innerHTML=body;
  modal.classList.remove("hidden");
}

function closeEditHistoryModal(){
  const m=$("edit-history-modal");
  if(m)m.classList.add("hidden");
}

// Modal advertencia para docs en producción o aprobados.
// Si el usuario confirma, ejecuta onProceed.
function openEditWarningModal(q,onProceed){
  const sev=warningSeverity(q);
  if(!sev){if(typeof onProceed==="function")onProceed();return}
  const modal=$("edit-warning-modal");
  if(!modal){
    const msg=sev==="fuerte"
      ?"⚠️ Este pedido ya está en producción. Kathy/JP pueden estar preparando estos productos ahora mismo. ¿Seguro que quieres editar?"
      :"ℹ️ Esta propuesta ya fue aprobada por el cliente. Los cambios requerirán reenviar el PDF. ¿Continuar?";
    if(confirm(msg)){if(typeof onProceed==="function")onProceed()}
    return;
  }
  $("ew-title").textContent=sev==="fuerte"?"⚠️ Pedido en producción":"ℹ️ Propuesta aprobada";
  const qNum=q.quoteNumber||q.id||"este documento";
  const body=sev==="fuerte"
    ?'<p>Este pedido (<strong>'+qNum+'</strong>) ya está en producción. Kathy/JP pueden estar preparando estos productos ahora mismo.</p><p><strong>Después de guardar aparecerá un letrero de aviso visible en el documento</strong> para que el equipo tenga en cuenta los cambios.</p>'
    :'<p>Esta propuesta (<strong>'+qNum+'</strong>) ya fue aprobada por el cliente.</p><p>Los cambios pueden requerir reenviar el PDF al cliente. Toma nota de qué cambias para comunicarlo.</p>';
  $("ew-body").innerHTML=body;
  window._editWarningProceed=function(){
    closeEditWarningModal();
    if(typeof onProceed==="function")onProceed();
  };
  modal.classList.remove("hidden");
}

function closeEditWarningModal(){
  const m=$("edit-warning-modal");
  if(m)m.classList.add("hidden");
  window._editWarningProceed=null;
}

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
  const okReset=await confirmModal({
    title:"Enviar email de restablecimiento",
    body:"Te enviaré un email a <strong>"+h(email)+"</strong> con un link para restablecer tu contraseña.",
    okLabel:"Enviar",
    tone:"primary"
  });
  if(!okReset)return;
  try{
    await fbReady();
    const {auth,sendPasswordResetEmail}=window.fb;
    await sendPasswordResetEmail(auth,email);
    toast("📧 Email enviado a "+email+". Revisa bandeja y spam. Link válido 1 hora.","success",6000);
  }catch(e){
    console.warn("Reset password falló:",e);
    toast("No se pudo enviar el email: "+(e?.message||e),"error");
  }
}

// v5.0: cerrar sesión (signOut de Firebase)
async function logoutSession(){
  const okLogout=await confirmModal({
    title:"Cerrar sesión",
    body:"¿Cerrar sesión? Tendrás que volver a ingresar tu email y contraseña.",
    okLabel:"Cerrar sesión",
    tone:"warn"
  });
  if(!okLogout)return;
  try{
    await fbReady();
    const {auth,signOut}=window.fb;
    await signOut(auth);
    // onAuthStateChanged se encarga — detecta null y recarga
    location.reload();
  }catch(e){
    toast("Error cerrando sesión: "+(e?.message||e),"error");
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
    if(isGoogleOnly){toast("Tu cuenta entra con Google. La contraseña se gestiona allá, no aquí.","info",5000);return}
    openChangePassword();
  }else if(c==="2"){
    logoutSession();
  }
}

// v5.0.1: Cambiar contraseña (requiere re-autenticación con la actual)
async function openChangePassword(){
  if(!currentUser){toast("Debes estar autenticado","error");return}
  const email=currentUser.email;
  const current=prompt("🔐 Cambiar contraseña\n\nIngresa tu contraseña ACTUAL:");
  if(!current)return;
  const nueva=prompt("Ingresa la contraseña NUEVA (mínimo 6 caracteres):");
  if(!nueva)return;
  if(nueva.length<6){toast("La nueva contraseña debe tener al menos 6 caracteres.","warn");return}
  const nueva2=prompt("Confirma la contraseña NUEVA:");
  if(nueva2!==nueva){toast("Las contraseñas no coinciden. Intenta de nuevo.","warn");return}
  try{
    showLoader("Actualizando...");
    await fbReady();
    const {auth,EmailAuthProvider,reauthenticateWithCredential,updatePassword}=window.fb;
    const cred=EmailAuthProvider.credential(email,current);
    await reauthenticateWithCredential(auth.currentUser,cred);
    await updatePassword(auth.currentUser,nueva);
    hideLoader();
    toast("✅ Contraseña actualizada. Úsala en tu próximo inicio de sesión.","success",6000);
  }catch(e){
    hideLoader();
    console.warn("Change password falló:",e);
    let msg="No se pudo cambiar la contraseña";
    if(e?.code==="auth/wrong-password"||e?.code==="auth/invalid-credential")msg="La contraseña actual es incorrecta";
    else if(e?.code==="auth/weak-password")msg="Contraseña nueva muy débil (mínimo 6 caracteres)";
    else if(e?.code==="auth/requires-recent-login")msg="Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña";
    else if(e?.code==="auth/too-many-requests")msg="Demasiados intentos. Espera unos minutos.";
    toast("❌ "+msg,"error",5000);
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

// v7.7.1: filtra strings vacíos del obj para no pisar campos existentes
// al hacer update desde autosave de cotización (que solo trae datos básicos).
// Mantiene los campos no-string (booleans, sub-objetos como fe, etc).
function _cleanClientObjForUpdate(obj){
  const out={};
  Object.keys(obj).forEach(k=>{
    const v=obj[k];
    if(typeof v==="string"){if(v.trim()!=="")out[k]=v}
    else if(v!==undefined&&v!==null)out[k]=v;
  });
  return out;
}
async function saveClientToCloud(obj,opts){
  const {db,collection,doc,addDoc,updateDoc,serverTimestamp}=window.fb;
  const existing=clientsCache.find(c=>c.name.toLowerCase()===obj.name.toLowerCase());
  // v7.7.1: opts.fullUpdate=true → guarda obj tal cual (uso desde modal edición).
  //         opts.fullUpdate=false (default) → filtra vacíos (uso desde autosave).
  const fullUpdate=opts&&opts.fullUpdate===true;
  if(existing&&existing.id){
    const updateObj=fullUpdate?obj:_cleanClientObjForUpdate(obj);
    await updateDoc(doc(db,"clients",existing.id),{...updateObj,updatedAt:serverTimestamp()});
    Object.assign(existing,updateObj);
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

// v7.7.1: extrae clientes únicos de quotesCache que NO existen en clientsCache.
// Crea cada uno como tipo='persona', categoria='particular' (defaults).
// Idempotente: skip si ya existe por nombre (case-insensitive + trim).
// Reusa saveClientToCloud (que es idempotente también).
// Devuelve {creados, skipeados, errores} para reporte.
async function migrateClientsFromQuotes(){
  if(!quotesCache.length)try{await loadAllHistory()}catch{}
  const seen=new Set(clientsCache.map(c=>(c.name||"").toLowerCase().trim()));
  const docsByName=new Map(); // nombre normalizado → mejor doc representativo (más reciente con más datos)
  quotesCache.forEach(q=>{
    const raw=(q.client||"").trim();
    if(!raw)return;
    const key=raw.toLowerCase();
    if(seen.has(key))return;
    const tel=q.tel||q.clientPhone||q.custPhone||"";
    const mail=q.mail||q.clientEmail||q.custEmail||"";
    const candidate={
      name:raw,
      idtype:q.idtype||"",
      idnum:q.idnum||"",
      att:q.att||"",
      mail:mail,
      tel:tel,
      dir:q.dir||"",
      city:q.city||"",
      cityCustom:q.cityCustom||"",
      tipo:"persona",
      categoria:"particular"
    };
    const prev=docsByName.get(key);
    if(!prev){docsByName.set(key,{candidate,score:_clientScore(candidate)});return}
    const score=_clientScore(candidate);
    if(score>prev.score)docsByName.set(key,{candidate,score});
  });
  let creados=0,errores=0;
  for(const [,{candidate}] of docsByName){
    try{await saveClientToCloud(candidate);creados++}
    catch(e){console.warn("migrate cliente falló:",candidate.name,e);errores++}
  }
  return {creados,skipeados:seen.size,errores,total:docsByName.size};
}
function _clientScore(c){
  // Prefiere docs con más campos llenos para crear el cliente más completo
  let s=0;
  ["idnum","mail","tel","dir","att","city"].forEach(k=>{if((c[k]||"").trim())s++});
  return s;
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

async function registerCustomProduct(n,d,p,u,inCatalog){
  const {db,collection,doc,addDoc,updateDoc,serverTimestamp}=window.fb;
  const existing=customProductsCache.find(x=>x.n.toLowerCase()===n.toLowerCase());
  if(existing){
    const newCount=(existing.useCount||1)+1;
    const promoted=newCount>=3;
    const upd={useCount:newCount,promoted,lastUsed:serverTimestamp()};
    if(inCatalog)upd.inCatalog=true;
    await updateDoc(doc(db,"custom_products",existing.id),upd);
    existing.useCount=newCount;
    existing.promoted=promoted;
    if(inCatalog)existing.inCatalog=true;
  }else{
    const obj={n,d:d||"",p:parseInt(p)||0,u:u||"",useCount:1,promoted:false,inCatalog:!!inCatalog,createdAt:serverTimestamp(),lastUsed:serverTimestamp()};
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
  // E1.1 (2026-04-26): solo 'aprobada' se auto-promueve (limbo de propuestas que llegaron al
  // día del evento sin cerrar wizard). 'pedido' → 'en_produccion' YA NO es automático: requiere
  // botón "🔥 Iniciar producción" explícito que dispara Kathy cuando realmente prende la cocina.
  const candidatos=list.filter(q=>q.status==="aprobada" && q.eventDate && q.eventDate<=todayIso);
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
  const _optExcl=buildOptionExclusions(quotesCache);
  quotesCache.forEach(q=>{
    if(q._wrongCollection)return;
    if(["superseded","convertida","anulada"].includes(q.status))return;
    if(getFollowUp(q)==="perdida")return;
    if(_optExcl.has(q.id))return;
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
  if(!cloudOnline){toast("Sin conexión.","error");return false}
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
    toast("Error actualizando seguimiento: "+(e.message||e),"error");
    return false;
  }
}

// Agrega una nota de seguimiento al doc (al array notasSeguimiento[])
async function addNotaSeguimiento(docId,kind,texto){
  if(!texto||!texto.trim())return false;
  if(!cloudOnline){toast("Sin conexión.","error");return false}
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
    toast("Error guardando nota: "+(e.message||e),"error");
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
  if(!cloudOnline){toast("Sin conexión.","error");return false}
  const q=quotesCache.find(x=>x.id===docId&&x.kind===kind);
  if(!q)return false;
  if(getFollowUp(q)!=="perdida"){toast("El documento no está marcado como perdida","warn");return false}
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
    toast("Error reactivando: "+(e.message||e),"error");
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
  if(!cloudOnline){toast("Sin conexión.","error");return}
  try{
    if(!quotesCache.length){await loadAllHistory()}
    const pendientes=quotesCache.filter(isAgendable);
    if(!pendientes.length){
      if(typeof toast==="function")toast("No hay pedidos futuros agendables — nada que marcar","info");
      else toast("No hay pedidos futuros agendables.","info");
      return;
    }
    const okMark=await confirmModal({
      title:"🔁 Marcar pedidos como pendientes de sincronizar",
      body:"Voy a marcar <strong>"+pendientes.length+"</strong> pedido(s) futuro(s) agendable(s) como pendientes.<br><br>El banner verde de sync aparecerá arriba del dashboard con un conteo de "+pendientes.length+".",
      okLabel:"Marcar todos",
      tone:"primary"
    });
    if(!okMark)return;
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
  }catch(e){hideLoader();toast("Error: "+(e.message||e),"error");console.error(e)}
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
  if(!f||!t){toast("Escoge ambas fechas.","warn");return}
  if(f>t){toast("La fecha 'Desde' debe ser menor o igual a 'Hasta'.","warn");return}
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
    toast("No se pudo conectar a la nube. Verifica tu internet y recarga la página.","error",8000);
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
  // v7.2: agregado 'cartera' (modulo de cobros / pagos pendientes)
  // v7.3: agregado 'reportes' (modulo de Excel + PDFs imprimibles)
  // v7.4 F1: agregados 'cotizaciones' y 'perdidas' (sub-modulos Ventas)
  // v7.4 F2: agregados 'pedidos-aprobados', 'pedidos-produccion', 'pedidos-producidos' (modulo Pedidos)
  // v7.4 F3: agregados 'entregar', 'entregadas' (modulo Entregas)
  // v7.4 F5: agregados 'archivo-busqueda', 'archivo-anuladas', 'archivo-convertidas' (modulo Archivo read-only)
  // v7.5 F6: agregado 'backup' (Herramientas > Mantenimiento y backups, migrado del Dashboard)
  // v7.5.1 cleanup: eliminado 'ops' del array (modulo Operaciones disuelto en v7.4 F4). 'hist' se mantiene
  // por compatibilidad aunque ya no aparece en sidebar (cubierto por modulo Archivo).
  // v7.6: agregado 'cartera-historico' (sub-item Cartera > Histórico de cobros)
  // v7.7.1: agregado 'clientes-directorio' (módulo Clientes CRM)
  // v7.7.2: agregado 'clientes-ficha' (vista detalle del cliente desde directorio)
  // v7.7.3: agregado 'clientes-comentarios' (migrado del Dashboard)
  ["dash","cot","prop","search","hist","seg","cal","ventas","cartera","cartera-historico","reportes","cotizaciones","perdidas","pedidos-aprobados","pedidos-produccion","pedidos-producidos","entregar","entregadas","archivo-busqueda","archivo-anuladas","archivo-convertidas","backup","clientes-directorio","clientes-ficha","clientes-comentarios"].forEach(x=>{
    const el=$("mode-"+x);
    if(el)el.classList.toggle("hidden",x!==m);
    document.querySelectorAll(".mode-btn.m-"+x).forEach(b=>b.classList.toggle("act",x===m));
  });
  if(m==="hist")renderHist();
  if(m==="prop")initProp();
  if(m==="cal")renderCalendar();
  // v7.2: mini-dash removido de mode-cot. Las llamadas a renderMiniDash desde
  // otros archivos quedan como no-op porque su guarda inicial no encuentra el div.
  if(m==="dash")renderDashboard();
  if(m==="seg"&&typeof renderSeguimiento==="function")renderSeguimiento();
  if(m==="cartera"&&typeof renderCartera==="function")renderCartera();
  if(m==="cartera-historico"&&typeof renderCarteraHistorico==="function")renderCarteraHistorico();
  if(m==="clientes-directorio"&&typeof renderClientesDirectorio==="function")renderClientesDirectorio();
  if(m==="clientes-ficha"&&typeof renderClienteFicha==="function")renderClienteFicha();
  if(m==="clientes-comentarios"&&typeof renderClientesComentarios==="function")renderClientesComentarios();
  if(m==="backup"&&typeof renderSyncAgendaPanel==="function")renderSyncAgendaPanel();
  if(m==="reportes"&&typeof renderReportes==="function")renderReportes();
  if(m==="cotizaciones"&&typeof renderCotizaciones==="function")renderCotizaciones();
  if(m==="perdidas"&&typeof renderPerdidas==="function")renderPerdidas();
  if(m==="pedidos-aprobados"&&typeof renderPedidosAprobados==="function")renderPedidosAprobados();
  if(m==="pedidos-produccion"&&typeof renderPedidosProduccion==="function")renderPedidosProduccion();
  if(m==="pedidos-producidos"&&typeof renderPedidosProducidos==="function")renderPedidosProducidos();
  if(m==="entregar"&&typeof renderEntregar==="function")renderEntregar();
  if(m==="entregadas"&&typeof renderEntregadas==="function")renderEntregadas();
  if(m==="archivo-busqueda"&&typeof renderArchivoBusqueda==="function")renderArchivoBusqueda();
  if(m==="archivo-anuladas"&&typeof renderArchivoAnuladas==="function")renderArchivoAnuladas();
  if(m==="archivo-convertidas"&&typeof renderArchivoConvertidas==="function")renderArchivoConvertidas();
  if(m==="search"){$("gsearch").focus();$("search-results").innerHTML=""}
  window.scrollTo(0,0);
}

async function newQuote(){
  if(allIt().length){
    const ok=await confirmModal({
      title:"Nueva cotización",
      body:"¿Empezar una nueva cotización? Se perderán los productos actuales.",
      okLabel:"Nueva cotización",
      tone:"warn"
    });
    if(!ok)return;
  }
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
async function newProp(){
  const ok=await confirmModal({
    title:"Nueva propuesta",
    body:"¿Empezar una nueva propuesta? Se perderán los datos actuales.",
    okLabel:"Nueva propuesta",
    tone:"warn"
  });
  if(!ok)return;
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
      return '<div class="search-result" onclick="openDocument(\''+(r.type==="cot"?"quote":"proposal")+'\',\''+r.id+'\')"><div class="sr-top"><div><span class="qnum">'+h(qn)+'</span> <strong>'+h(q.client||"—")+'</strong></div><span class="sr-type t-'+r.type+'">'+(r.type==="cot"?"Cotización":"Propuesta")+'</span></div>'+(q.total?'<div style="font-size:13px;color:var(--gb-success-500);font-weight:700">'+fm(q.total)+'</div>':'')+'<div style="font-size:11px;color:var(--gb-neutral-400)">'+(q.dateISO?new Date(q.dateISO).toLocaleDateString("es-CO"):"")+'</div></div>';
    }
    if(r.type==="cli"){const c=r.data;return '<div class="search-result" onclick="pickClientFromSearch(\''+c.id+'\')"><div class="sr-top"><div><strong>'+c.name+'</strong>'+(c.idtype?' — '+c.idtype+' '+c.idnum:'')+'</div><span class="sr-type t-cli">Cliente</span></div><div style="font-size:11px;color:var(--gb-neutral-500)">'+(c.tel||"")+(c.mail?' · '+c.mail:'')+'</div></div>'}
    if(r.type==="prod"){const p=r.data;return '<div class="search-result" style="border-left-color:#6A1B9A"><div class="sr-top"><div><strong>'+p.n+'</strong></div><span class="sr-type t-prod">Catálogo</span></div>'+(p.d?'<div style="font-size:11px;color:var(--gb-neutral-400)">'+p.d+'</div>':'')+'<div style="font-size:13px;color:var(--gb-success-500);font-weight:700">'+fm(p.p)+' · '+p.u+'</div><div style="font-size:10px;color:var(--gb-neutral-500)">'+p.c+'</div></div>'}
    if(r.type==="cprod"){const p=r.data;return '<div class="search-result" style="border-left-color:var(--gb-gold-500)"><div class="sr-top"><div><strong>'+p.n+'</strong> <span style="font-size:9px;background:var(--gb-gold-500);color:#fff;padding:1px 5px;border-radius:3px">CUSTOM</span></div><span class="sr-type t-prod">'+(p.useCount||1)+' usos'+(p.promoted?' ✓':"")+'</span></div>'+(p.d?'<div style="font-size:11px;color:var(--gb-neutral-400)">'+p.d+'</div>':'')+'<div style="font-size:13px;color:var(--gb-success-500);font-weight:700">'+fm(p.p||0)+(p.u?' · '+p.u:"")+'</div></div>'}
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
function renderP(){refreshCats();renderCats();const s=($("sbox").value||"").toLowerCase();const catProds=customProductsCache.filter(cp=>cp.inCatalog).map(cp=>({id:"cp_"+cp.id,c:"Personalizados",n:cp.n,d:cp.d||"",p:cp.p||0,u:cp.u||"",_cpId:cp.id}));const allProds=C.concat(catProds);const f=allProds.filter(p=>(selCat==="Todas"||p.c===selCat)&&(!s||p.n.toLowerCase().includes(s)||(p.d||"").toLowerCase().includes(s)));const el=$("plist");const atMax=distIt()>=MX;
if(!f.length){el.innerHTML='<div class="empty"><div class="ic">🔍</div><p>No se encontraron productos</p><button class="btn bg" onclick="togCF()">+ Personalizado</button></div>';return}
el.innerHTML=f.map(p=>{const ic=cart.find(x=>x.id===p.id);const canAdd=!atMax||ic;return'<div class="pcard '+(ic?'inc':'')+'"><div class="pinfo"><div class="pname">'+p.n+'</div>'+(p.d?'<div class="pdesc">'+p.d+'</div>':'')+'<div class="punit">'+p.u+'</div><div class="pprice">'+fm(p.p)+'</div></div><div>'+(ic?'<div class="qc"><button class="qb" onclick="chgQ('+p.id+','+(ic.qty-1)+')">−</button><input type="number" class="qn" value="'+ic.qty+'" min="1" onchange="chgQ('+p.id+',+this.value)" onfocus="this.select()"><button class="qb" onclick="chgQ('+p.id+','+(ic.qty+1)+')">+</button></div>':canAdd?'<button class="abtn" onclick="addC('+p.id+')">Agregar</button>':'<span style="font-size:11px;color:var(--gb-neutral-400)">Máx</span>')+'</div></div>'}).join("");updUI()}
function addC(id){if(distIt()>=MX){toast("Máximo "+MX+" productos","warn");return}const p=C.find(x=>x.id===id);if(!p)return;const e=cart.find(x=>x.id===id);if(e)e.qty++;else cart.push({...p,qty:1,origP:p.p,edited:false});renderP()}
function chgQ(id,q){q=parseInt(q)||0;if(q<=0)cart=cart.filter(x=>x.id!==id);else{const i=cart.find(x=>x.id===id);if(i)i.qty=q}renderP()}

// ─── CUSTOM PRODUCTS ───────────────────────────────────────
function togCF(){$("cform").classList.toggle("hidden")}
function addCust(){if(distIt()>=MX){toast("Máximo "+MX+" productos","warn");return}const n=$("cf-n").value.trim(),p=parseInt($("cf-p").value);if(!n||!p){toast("Nombre y precio obligatorios","warn");return}const saveCat=$("cf-catalog")&&$("cf-catalog").checked;cust.push({id:"x"+Date.now(),n,p,d:$("cf-d").value.trim(),u:$("cf-u").value.trim(),qty:parseInt($("cf-q").value)||1,custom:true,inCatalog:saveCat});$("cf-n").value="";$("cf-p").value="";$("cf-d").value="";$("cf-u").value="";$("cf-q").value="1";if($("cf-catalog"))$("cf-catalog").checked=false;togCF();updUI();renderP()}
function remCust(id){cust=cust.filter(x=>x.id!==id);renderR();updUI()}
function chgCustQ(id,q){q=parseInt(q)||0;if(q<=0){remCust(id);return}const i=cust.find(x=>x.id===id);if(i)i.qty=q;renderR();updUI()}
function remCart(id){cart=cart.filter(x=>x.id!==id);renderR();updUI()}
function chgCartR(id,q){q=parseInt(q)||0;if(q<=0){remCart(id);return}const i=cart.find(x=>x.id===id);if(i)i.qty=q;renderR();updUI()}

// ─── DATE/MOMENT HELPERS ───────────────────────────────────
function dateStr(){const d=new Date(),m=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];return d.getDate()+" de "+m[d.getMonth()]+" de "+d.getFullYear()}
function togMom(el){el.parentElement.style.background=el.checked?'var(--gb-success-50)':'var(--gb-neutral-0)';el.parentElement.style.borderColor=el.checked?'#4CAF50':'var(--gb-neutral-200)'}
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
  if(!id){toast("Selecciona un cliente primero","warn");return}
  const c=clientsCache.find(x=>x.id===id);if(!c)return;
  if(!confirm("¿Eliminar a "+c.name+"? (esto afecta a todos los usuarios)"))return;
  try{showLoader("Eliminando...");await deleteClientFromCloud(id);refreshCliSel();hideLoader()}
  catch(e){hideLoader();toast("Error: "+e.message,"error")}
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
    return '<div class="chp-item" onclick="openDocument(\''+q.kind+'\',\''+q.id+'\')">'+
      '<div class="chp-item-top"><span><span class="qnum" style="font-size:9px">'+h(q.quoteNumber||q.id)+'</span> · '+fecha+(total?' · '+total:"")+'</span><span class="hc-status '+sMeta.cls+'">'+sMeta.label+'</span></div>'+
      (coment?'<div class="chp-item-coment">💬 '+h(coment.slice(0,140))+(coment.length>140?'...':'')+'</div>':'')+
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
      toast("⚠️ No se puede eliminar "+id+". Está anulada — es registro histórico con pagos/devoluciones. Usa el filtro 'Anuladas' para ocultarla.","warn",8000);
    }else{
      toast("⚠️ No se puede eliminar "+id+" (estado: "+(STATUS_META[status]?.label||status)+"). Docs en producción/entregados son histórico financiero. Anúlalos dejando productos en 0.","warn",8000);
    }
    return;
  }
  // Cotizaciones: solo enviada (mantiene regla v4.12.3)
  if(kind==="quote"&&status!=="enviada"){
    toast("⚠️ No se puede eliminar "+id+" (estado: "+(STATUS_META[status]?.label||status)+"). Una cotización confirmada queda como registro permanente. Anúlala dejando productos en 0.","warn",8000);
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
  catch(e){hideLoader();toast("Error: "+e.message,"error")}
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
  }catch(e){hideLoader();toast("Error: "+e.message,"error");console.error(e)}
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
  }catch(e){hideLoader();toast("Error en cascada: "+e.message,"error");console.error(e)}
}

// ═══════════════════════════════════════════════════════════
// v6.1.0: HELPER h() · Escape HTML para defensa XSS + apóstrofes/angles
// ═══════════════════════════════════════════════════════════
// Aplicado defensivamente en los 5 renders expuestos donde q.client, q.att,
// q.id, q.quoteNumber, q.comentarioCliente y nombres de productos se
// inyectan vía innerHTML. Reemplaza los .replace(/[<>]/g,"") dispersos.
//
// Nota: devuelve string vacío para null/undefined para no imprimir literal
// "null" en la UI cuando un campo está ausente.
function h(s){
  if(s==null)return "";
  return String(s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

// ═══════════════════════════════════════════════════════════
// v7.0-α FIX-03: REVERTIR ENTREGA · revertDelivery(id,kind,opts)
// ═══════════════════════════════════════════════════════════
// Deshace una transición a 'entregado'. Vuelve status → 'en_produccion',
// borra entregaData, agrega entrada en auditTrail tipo 'reverted_delivery'.
// Guard rail: si hay un cobro con fecha == entregaData.fechaEntrega,
// abort (revertir cobros está fuera de scope).
// Atómico vía runTransaction: relee el doc dentro de la transacción para
// validar status y pagos contra estado fresco.
// q.fechaEntrega del raíz NO se borra: en v6.4.0 se usa también como
// fecha del evento programado (ver app-historial.js:202).
async function revertDelivery(quoteId,kind,opts){
  opts=opts||{};
  if(!cloudOnline){if(typeof toast==="function")toast("Sin conexión","error");return false}
  try{
    const {db,doc,runTransaction,serverTimestamp,deleteField}=window.fb;
    let coll;
    if(kind==="quote")coll="quotes";
    else if(quoteId&&quoteId.startsWith("GB-PF-"))coll="propfinals";
    else coll="proposals";
    const ref=doc(db,coll,quoteId);
    const reasonClean=(opts.reason||"").trim();
    const result=await runTransaction(db,async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists())return {ok:false,reason:"not_found"};
      const q=snap.data();
      if((q.status||"")!=="entregado")return {ok:false,reason:"not_delivered",status:q.status||"(sin status)"};
      // v7.0-α FIX-05: audit FSM dentro de la transacción (entregado → en_produccion)
      if(typeof auditTransition==="function"&&!auditTransition("entregado","en_produccion","revertDelivery "+quoteId))return {ok:false,reason:"fsm_blocked"};
      const ed=q.entregaData||{};
      const fechaEntrega=ed.fechaEntrega||q.fechaEntrega||"";
      const pagos=Array.isArray(q.pagos)?q.pagos:[];
      const pagoMismaFecha=pagos.find(p=>(p.fecha||"")===fechaEntrega&&fechaEntrega);
      if(pagoMismaFecha)return {ok:false,reason:"pago_mismo_dia",fecha:fechaEntrega,pago:pagoMismaFecha};
      const auditTrail=Array.isArray(q.auditTrail)?q.auditTrail.slice():[];
      const entry={
        type:"reverted_delivery",
        ts:new Date().toISOString(),
        user:currentUser?(currentUser.email||currentUser.uid):"(desconocido)",
        prevFechaEntrega:fechaEntrega||null,
        reason:reasonClean||null
      };
      auditTrail.push(entry);
      const patch={
        status:"en_produccion",
        entregaData:deleteField(),
        auditTrail:auditTrail,
        updatedAt:serverTimestamp()
      };
      if(typeof auditStamp==="function")Object.assign(patch,auditStamp());
      tx.update(ref,patch);
      return {ok:true,entry:entry};
    });
    if(!result.ok){
      if(result.reason==="not_found")toast("Pedido no encontrado","error");
      else if(result.reason==="not_delivered")toast("El pedido ya no está marcado como entregado (estado actual: "+result.status+")","warn",6000);
      else if(result.reason==="pago_mismo_dia")toast("⚠️ No se puede revertir: hay un cobro registrado el mismo día de la entrega ("+result.fecha+", "+(result.pago.tipo||"pago")+" $"+(result.pago.monto||0)+"). Borra ese cobro primero.","error",9000);
      else if(result.reason==="fsm_blocked")return false; // toast ya emitido por auditTransition
      return false;
    }
    // Sync cache local (mismo patrón que submitDelivery)
    const cached=(quotesCache||[]).find(x=>x.id===quoteId&&x.kind===kind);
    if(cached){
      cached.status="en_produccion";
      delete cached.entregaData;
      cached.auditTrail=Array.isArray(cached.auditTrail)?cached.auditTrail:[];
      cached.auditTrail.push(result.entry);
    }
    if(window.__GB_V7_DEBUG)console.log("[FIX-03] revertDelivery OK",{quoteId,kind,reason:reasonClean,entry:result.entry});
    return true;
  }catch(e){
    console.error("[revertDelivery]",e);
    if(typeof toast==="function")toast("Error al revertir: "+e.message,"error");
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// v6.1.0: MODAL PREVIEW UNIFICADO · openDocument(kind,id)
// ═══════════════════════════════════════════════════════════
// Bug UX-1: 12 sitios (historial, dashboard, seguimiento, búsqueda) hacían
// click → loadQuote → abrir formulario de edición directamente. Con 86%
// de docs sin pdfHistorial, el flujo correcto es VER primero, editar sólo
// si se decide hacerlo explícitamente.
//
// Diseño aprobado: SIEMPRE abrir modal uniforme. NO branch
// "PDF si existe / formulario si no" porque sería UX inconsistente.
//
// Botones contextuales:
//   👁️ Ver PDF      — solo si q.pdfHistorial tiene entradas (abre última versión)
//   💬 WhatsApp     — solo si saldo pendiente > 0 (reusa openSaldoWhatsAppModal)
//   ✏️ Editar       — siempre si canEdit(q) (respeta requiresWarning → requestEdit)
//   📄 Generar PDF  — siempre (llama loadQuote y salta a vista genPDF/genPropPDF)
let _docPreviewCtx=null; // {kind,id,q}

async function openDocument(kind,id){
  try{
    // 1. Localizar doc en cache (rápido, sin lectura Firestore extra)
    let q=(quotesCache||[]).find(x=>x.id===id&&x.kind===kind);
    // Si no está en cache (ej. búsqueda desde fuera del historial), leer Firestore
    if(!q){
      const {db,doc,getDoc}=window.fb;
      let coll;
      if(kind==="quote")coll="quotes";
      else if(id&&id.startsWith("GB-PF-"))coll="propfinals";
      else coll="proposals";
      showLoader("Cargando...");
      const snap=await getDoc(doc(db,coll,id));
      hideLoader();
      if(!snap.exists()){
        if(typeof toast==="function")toast("No se encontró el documento","error");
        else toast("No se encontró el documento","error");
        return;
      }
      q={...snap.data(),id,kind};
    }
    _docPreviewCtx={kind,id,q};
    // 2. Poblar header, body y footer del modal
    _docPreviewRender(q,kind,id);
    // 3. Mostrar modal
    const m=$("doc-preview-modal");
    if(m)m.classList.remove("hidden");
  }catch(e){
    hideLoader();
    if(typeof toast==="function")toast("Error al abrir: "+e.message,"error");
    else toast("Error al abrir: "+e.message,"error");
    console.error("[openDocument]",e);
  }
}

function _docPreviewRender(q,kind,id){
  // HEADER: # + cliente + fecha + status badge
  const qNum=q.quoteNumber||id;
  const isProp=(kind==="proposal");
  const isPF=(id&&id.startsWith("GB-PF-"));
  const tipoLbl=isPF?"Propuesta Final":(isProp?"Propuesta":"Cotización");
  const st=q.status||"enviada";
  const sMeta=(typeof STATUS_META!=="undefined"&&STATUS_META[st])||{label:st,cls:st};
  const fecha=(q.dateISO||"").slice(0,10)||"—";
  const titleEl=$("dp-title");
  if(titleEl)titleEl.textContent=qNum;
  const subEl=$("dp-subtitle");
  if(subEl){
    subEl.innerHTML='<strong>'+h(q.client||"—")+'</strong> · '+h(tipoLbl)+
      ' · '+h(fecha)+
      ' · <span class="hc-status '+h(sMeta.cls)+'">'+h(sMeta.label)+'</span>';
  }
  // BODY: resumen del doc + (si hay PDF) aviso de que puedes verlo con botón
  const bodyEl=$("dp-body");
  if(bodyEl){
    const hasPdf=Array.isArray(q.pdfHistorial)&&q.pdfHistorial.length>0;
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const fmt=(typeof fm==="function")?fm:(n=>"$"+n);
    const cobrado=(typeof totalCobrado==="function")?totalCobrado(q):0;
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):Math.max(0,total-cobrado);
    const numProductos=((q.cart||[]).length+(q.cust||[]).length);
    const productosRes=isProp
      ?((q.sections||[]).length+" sección"+((q.sections||[]).length!==1?"es":"")+" · "+(q.pers||"?")+" personas")
      :(numProductos+" producto"+(numProductos!==1?"s":""));
    const eventD=q.eventDate?('<div class="dp-row"><span class="dp-k">📅 Entrega</span><span class="dp-v">'+h(q.eventDate)+(q.horaEntrega?' a las '+h(q.horaEntrega):'')+'</span></div>'):"";
    const dirD=q.dir?('<div class="dp-row"><span class="dp-k">📍 Dirección</span><span class="dp-v">'+h(q.dir)+(q.city?', '+h(q.city):'')+'</span></div>'):"";
    const telD=q.tel?('<div class="dp-row"><span class="dp-k">📞 Teléfono</span><span class="dp-v">'+h(q.tel)+'</span></div>'):"";
    const comentD=q.comentarioCliente?.texto?('<div class="dp-row"><span class="dp-k">💬 Comentario</span><span class="dp-v" style="font-style:italic">'+h(q.comentarioCliente.texto)+'</span></div>'):"";
    const pdfNotice=hasPdf
      ?'<div class="dp-notice dp-notice-ok">📎 Hay '+q.pdfHistorial.length+' PDF'+(q.pdfHistorial.length!==1?'s':'')+' guardado'+(q.pdfHistorial.length!==1?'s':'')+' en la nube. Toca «Ver PDF» para abrir la última versión.</div>'
      :'<div class="dp-notice dp-notice-warn">⚠️ Este documento no tiene PDF en la nube. Puedes generarlo ahora con «Generar PDF» o solo verlo/editarlo.</div>';
    bodyEl.innerHTML=
      pdfNotice+
      '<div class="dp-summary">'+
        '<div class="dp-row"><span class="dp-k">Contenido</span><span class="dp-v">'+h(productosRes)+'</span></div>'+
        (!isProp?('<div class="dp-row"><span class="dp-k">Total</span><span class="dp-v" style="font-weight:700;color:#2E7D32">'+h(fmt(total))+'</span></div>'):"")+
        ((!isProp&&cobrado>0)?('<div class="dp-row"><span class="dp-k">Cobrado</span><span class="dp-v">'+h(fmt(cobrado))+(saldo>0?' · <span style="color:#E65100">Saldo '+h(fmt(saldo))+'</span>':' · ✅ Pagado 100%')+'</span></div>'):"")+
        eventD+dirD+telD+comentD+
      '</div>';
  }
  // FOOTER: botones contextuales
  const footerEl=$("dp-footer");
  if(footerEl){
    const btns=[];
    const hasPdf=Array.isArray(q.pdfHistorial)&&q.pdfHistorial.length>0;
    if(hasPdf){
      btns.push('<button class="btn dp-btn-verpdf" onclick="docPreviewVerPdf()">👁️ Ver PDF</button>');
    }
    const total=(typeof getDocTotal==="function")?getDocTotal(q):(q.total||0);
    const saldo=(typeof saldoPendiente==="function")?saldoPendiente(q):0;
    // WhatsApp solo si hay saldo pendiente (reusa openSaldoWhatsAppModal existente)
    if(saldo>0&&total>0&&typeof openSaldoWhatsAppModal==="function"){
      btns.push('<button class="btn dp-btn-wa" onclick="docPreviewWhatsApp()">💬 WhatsApp saldo</button>');
    }
    // Editar si la matriz lo permite
    const editable=(typeof canEdit==="function")?canEdit(q):true;
    if(editable){
      btns.push('<button class="btn dp-btn-edit" onclick="docPreviewEdit()">✏️ Editar</button>');
    }else if(isPF&&st!=="superseded"){
      btns.push('<button class="btn dp-btn-edit" onclick="docPreviewEdit()">🔄 Nueva versión</button>');
    }
    // Generar PDF: siempre (si no hay PDF, primero; si hay, regenerar)
    btns.push('<button class="btn dp-btn-genpdf" onclick="docPreviewGenerarPdf()">📄 '+(hasPdf?"Regenerar":"Generar")+' PDF</button>');
    // v7.0-α FIX-03: Revertir entrega (solo si está entregado). Estilo destructivo inline
    // para no tocar CSS files. Confirma con sub-modal "escribe REVERTIR".
    if(st==="entregado"){
      btns.push('<button class="btn dp-btn-revert" style="background:#FFF3E0;color:#BF360C;border-color:#FFAB91" onclick="docPreviewRevertDelivery()">↩️ Revertir entrega</button>');
    }
    footerEl.innerHTML=btns.join("");
  }
}

function closeDocPreviewModal(){
  const m=$("doc-preview-modal");
  if(m)m.classList.add("hidden");
  _docPreviewCtx=null;
}

function docPreviewVerPdf(){
  if(!_docPreviewCtx)return;
  const q=_docPreviewCtx.q;
  if(!Array.isArray(q.pdfHistorial)||!q.pdfHistorial.length){
    if(typeof toast==="function")toast("No hay PDF guardado","warn");
    return;
  }
  // Última versión (mayor version)
  const sorted=[...q.pdfHistorial].sort((a,b)=>(b.version||0)-(a.version||0));
  const url=sorted[0]?.url;
  if(!url){
    if(typeof toast==="function")toast("URL del PDF no disponible","error");
    return;
  }
  window.open(url,"_blank","noopener");
}

function docPreviewWhatsApp(){
  if(!_docPreviewCtx)return;
  const {kind,id}=_docPreviewCtx;
  if(typeof openSaldoWhatsAppModal==="function"){
    closeDocPreviewModal();
    openSaldoWhatsAppModal(id,kind);
  }
}

function docPreviewEdit(){
  if(!_docPreviewCtx)return;
  const {kind,id,q}=_docPreviewCtx;
  closeDocPreviewModal();
  // Respetar la lógica de matriz de edición del botón ✏️ existente:
  // si requiere advertencia, usar requestEdit (modal de advertencia); sino loadQuote directo.
  const needsWarn=(typeof requiresWarning==="function"&&requiresWarning(q));
  if(needsWarn&&typeof requestEdit==="function"){
    requestEdit(kind,id);
  }else if(typeof loadQuote==="function"){
    loadQuote(kind,id);
  }
}

async function docPreviewGenerarPdf(){
  // Flujo: cerrar modal → cargar el doc en el formulario (loadQuote) → llevar al usuario
  // hasta la vista donde puede pulsar 📄 Generar PDF. Mantener simple: NO autodisparar
  // genPDF() porque puede pedir validaciones, y el usuario ya sabe el flujo del botón.
  if(!_docPreviewCtx)return;
  const {kind,id}=_docPreviewCtx;
  closeDocPreviewModal();
  if(typeof toast==="function")toast("Cargando para generar PDF…","info",2000);
  if(typeof loadQuote==="function")await loadQuote(kind,id);
}

// v7.0-α FIX-03: handler del botón "↩️ Revertir entrega" del modal preview.
// Abre sub-modal dinámico (DOM-injected) con confirmación tipo "escribe REVERTIR".
function docPreviewRevertDelivery(){
  if(!_docPreviewCtx)return;
  const {kind,id,q}=_docPreviewCtx;
  if((q.status||"")!=="entregado"){
    if(typeof toast==="function")toast("Este pedido no está entregado","warn");
    return;
  }
  _openRevertDeliveryConfirmModal({
    qNum:q.quoteNumber||id,
    cliente:q.client||"—",
    fechaEntrega:q.entregaData?.fechaEntrega||q.fechaEntrega||"—",
    onConfirm:async (reason)=>{
      const ok=await revertDelivery(id,kind,{reason});
      if(ok){
        if(typeof toast==="function")toast("↩️ Entrega revertida — pedido vuelve a 'En producción'","success",4000);
        closeDocPreviewModal();
        if(typeof renderHist==="function")renderHist();
        if(typeof curMode!=="undefined"&&curMode==="dash"&&typeof renderDashboard==="function")renderDashboard();
      }
    }
  });
}

// v7.0-α FIX-03: sub-modal dinámico de confirmación destructiva.
// Aislado con prefijo .gb-revert-modal-* (cero colisiones con cascarón A o legacy).
// Construido en JS — no toca index.html ni CSS files. Se autodestruye al cerrar.
function _openRevertDeliveryConfirmModal(opts){
  // Idempotente: si ya hay uno abierto, lo cierra primero
  const prev=document.getElementById("gb-revert-modal-bk");
  if(prev)prev.remove();
  const bk=document.createElement("div");
  bk.id="gb-revert-modal-bk";
  bk.setAttribute("style","position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit");
  bk.innerHTML=
    '<div class="gb-revert-modal-box" style="background:#fff;border-radius:10px;max-width:460px;width:100%;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-size:14px;color:#263238">'+
      '<div style="font-size:17px;font-weight:700;margin-bottom:10px;color:#BF360C">↩️ Revertir entrega</div>'+
      '<div style="background:#FFF3E0;border:1px solid #FFAB91;border-radius:6px;padding:10px 12px;margin-bottom:14px;line-height:1.45;font-size:12.5px;color:#5D4037">'+
        '<strong>Esta acción es destructiva.</strong> El pedido vuelve al estado <strong>«En producción»</strong> y se borran los datos de entrega registrados (fecha, fotos, receptor, notas).<br>'+
        'Solo úsala si la entrega se marcó por error.'+
      '</div>'+
      '<div style="background:#FAFAFA;border:1px solid #E0E0E0;border-radius:6px;padding:9px 12px;margin-bottom:14px;font-size:12.5px;line-height:1.5">'+
        '<div><strong>Pedido:</strong> '+h(opts.qNum)+'</div>'+
        '<div><strong>Cliente:</strong> '+h(opts.cliente)+'</div>'+
        '<div><strong>Fecha entrega registrada:</strong> '+h(opts.fechaEntrega)+'</div>'+
      '</div>'+
      '<label style="display:block;font-size:12.5px;margin-bottom:5px;font-weight:600">Para confirmar, escribe <span style="color:#BF360C;font-family:monospace">REVERTIR</span>:</label>'+
      '<input id="gb-revert-modal-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #CFD8DC;border-radius:6px;font-size:14px;font-family:monospace;margin-bottom:12px">'+
      '<label style="display:block;font-size:12.5px;margin-bottom:5px;font-weight:600">Razón (opcional):</label>'+
      '<textarea id="gb-revert-modal-reason" rows="2" placeholder="Ej: pedido cruzado con GB-2026-0122" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #CFD8DC;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;margin-bottom:14px"></textarea>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end">'+
        '<button id="gb-revert-modal-cancel" type="button" style="padding:8px 16px;border:1px solid #B0BEC5;background:#fff;color:#37474F;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit">Cancelar</button>'+
        '<button id="gb-revert-modal-confirm" type="button" disabled style="padding:8px 16px;border:1px solid #BF360C;background:#BF360C;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;opacity:.45">Revertir entrega</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(bk);
  const input=document.getElementById("gb-revert-modal-input");
  const reasonEl=document.getElementById("gb-revert-modal-reason");
  const btnConfirm=document.getElementById("gb-revert-modal-confirm");
  const btnCancel=document.getElementById("gb-revert-modal-cancel");
  const close=()=>{bk.remove()};
  input.focus();
  input.addEventListener("input",()=>{
    const ok=input.value.trim().toUpperCase()==="REVERTIR";
    btnConfirm.disabled=!ok;
    btnConfirm.style.opacity=ok?"1":".45";
    btnConfirm.style.cursor=ok?"pointer":"not-allowed";
  });
  btnCancel.addEventListener("click",close);
  bk.addEventListener("click",e=>{if(e.target===bk)close()});
  btnConfirm.addEventListener("click",async ()=>{
    if(btnConfirm.disabled)return;
    btnConfirm.disabled=true;btnConfirm.textContent="Revirtiendo…";btnConfirm.style.opacity=".6";
    const reason=reasonEl.value.trim();
    close();
    try{await opts.onConfirm(reason)}catch(e){console.error("[revert onConfirm]",e)}
  });
  // ESC cierra
  const onKey=(e)=>{if(e.key==="Escape"){close();document.removeEventListener("keydown",onKey)}};
  document.addEventListener("keydown",onKey);
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
    // v7.0-α FIX-01-Q9: migración silenciosa en lectura — reconcilia orderData
    // con valores del raíz si están desincronizados. Solo agrega campos faltantes,
    // nunca sobrescribe. Ocurre solo en memoria; la próxima edición lo persiste.
    if(q.orderData&&typeof q.orderData==="object"){
      let _migrated=false;
      if(!q.orderData.fechaEntrega&&q.eventDate){q.orderData.fechaEntrega=q.eventDate;_migrated=true}
      if(!q.orderData.horaEntrega&&q.horaEntrega){q.orderData.horaEntrega=q.horaEntrega;_migrated=true}
      if(!q.orderData.productionDate&&q.productionDate){q.orderData.productionDate=q.productionDate;_migrated=true}
      if(_migrated&&window.__GB_V7_DEBUG)console.log("[FIX-01-Q9] orderData reconciliado en load (migración silenciosa)",{id,orderData:q.orderData});
    }
    // v5.5.0: ya no bloqueamos la apertura de docs en producción/entregados/etc.
    // La matriz de edición se evalúa al momento de guardar (canEdit/requiresWarning).
    // Solo avisamos con toast informativo al abrir PFs directas.
    const _qStatus=q.status||"enviada";
    if(kind==="proposal"){
      if(id&&id.startsWith("GB-PF-")&&_qStatus!=="superseded"){
        if(typeof toast==="function")toast("PF firmada: para cambios, usa 🔄 Nueva versión desde historial","warn",5000);
        else toast("ℹ️ PF firmada ("+id+"). Para cambios: vuelve al historial y toca 🔄 Nueva versión.","info",6000);
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
    // v5.5.0 FIX #4: limpiar estado de última edición para evitar banners stale entre docs
    window._lastSavedQuote=null;
    // v5.4.2 (UX-002): restaurar fecha de entrega y momentos en el formulario.
    // Antes se guardaba en Firestore (q.eventDate + q.momentosArr desde v5.4.0)
    // y salía en el PDF, pero los campos del form aparecían vacíos al reabrir.
    try{
      const fDate=$("f-date");
      if(fDate)fDate.value=q.eventDate||"";
      // v6.4.0 P2: cargar horaEntrega en el nuevo input editable
      const fHora=$("f-hora-entrega");
      if(fHora)fHora.value=q.horaEntrega||"";
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
    // v7.7.4: cargar notas internas para producción (campo del doc, opcional)
    if($("f-notas-internas"))$("f-notas-internas").value=q.notasInternas||"";
    showClientHistoryPanel(q.client||"","cot");
    go("review");
  }catch(e){hideLoader();toast("Error: "+e.message,"error")}
}

// ═══════════════════════════════════════════════════════════
// v4.13.0: Toast no bloqueante (reemplaza alerts informativos)
// v6.1.0: Tercer parámetro opcional `duration` (ms) para mensajes que
//         requieran más/menos tiempo en pantalla que el auto-cálculo.
// ═══════════════════════════════════════════════════════════
// Uso: toast("Guardado", "success") · toast("Sin conexión", "error")
//      toast("Aviso largo", "warn", 7000) // duración custom
// Tipos: success | error | warn | info (default)
function toast(msg,type,duration){
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
  // v6.1.0: si llega duration explícita úsala; sino auto-calcular (~3.5s base)
  const ms=(typeof duration==="number"&&duration>0)
    ?duration
    :Math.min(6000,2500+msg.length*30);
  setTimeout(()=>{el.classList.add("toast-out");setTimeout(()=>el.remove(),300)},ms);
}

// ═══════════════════════════════════════════════════════════
// v6.3.0 E3-3: Modal de confirmación genérico (reemplaza confirm() nativos no destructivos)
// ═══════════════════════════════════════════════════════════
// Uso:
//   confirmModal({title, body, okLabel, cancelLabel, tone, onOk, onCancel})
//   - title: string (default: "¿Confirmar?")
//   - body: string o HTML (ya escapado desde el llamador si hace falta)
//   - okLabel: string (default "Continuar")
//   - cancelLabel: string (default "Cancelar")
//   - tone: "primary"|"warn"|"danger" (afecta color del botón OK; default "primary")
//   - onOk: callback si acepta
//   - onCancel: callback opcional si cancela
// Retorna Promise<boolean> también — así se puede usar como `if(await confirmModal({...}))`.
// Compatible con callbacks (onOk/onCancel) O con await, lo que convenga al llamador.
function confirmModal(opts){
  opts=opts||{};
  const title=opts.title||"¿Confirmar?";
  const body=opts.body||"";
  const okLabel=opts.okLabel||"Continuar";
  const cancelLabel=opts.cancelLabel||"Cancelar";
  const tone=opts.tone||"primary";
  const onOk=typeof opts.onOk==="function"?opts.onOk:null;
  const onCancel=typeof opts.onCancel==="function"?opts.onCancel:null;
  const btnColors={
    primary:"linear-gradient(135deg,#0B6EFB,#0046C2)",
    warn:"linear-gradient(135deg,#FB8C00,#E65100)",
    danger:"linear-gradient(135deg,#E53935,#B71C1C)"
  };
  const btnBg=btnColors[tone]||btnColors.primary;
  return new Promise(resolve=>{
    let modal=$("confirm-modal");
    if(!modal){
      // Fallback extremo: si por alguna razón el HTML no tiene el modal, degradar a confirm()
      console.warn("[confirmModal] #confirm-modal no existe en HTML; usando confirm() nativo");
      const ok=confirm((title?title+"\n\n":"")+(body.replace(/<[^>]+>/g,"")));
      if(ok&&onOk)onOk();
      if(!ok&&onCancel)onCancel();
      resolve(ok);
      return;
    }
    $("cm-title").textContent=title;
    $("cm-body").innerHTML=body;
    const okBtn=$("cm-ok");
    const cancelBtn=$("cm-cancel");
    okBtn.textContent=okLabel;
    cancelBtn.textContent=cancelLabel;
    okBtn.style.background=btnBg;
    // Limpiar listeners previos clonando
    const newOk=okBtn.cloneNode(true);
    const newCancel=cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk,okBtn);
    cancelBtn.parentNode.replaceChild(newCancel,cancelBtn);
    const close=()=>{modal.classList.add("hidden")};
    newOk.addEventListener("click",()=>{close();if(onOk)onOk();resolve(true)});
    newCancel.addEventListener("click",()=>{close();if(onCancel)onCancel();resolve(false)});
    // Cerrar clic fuera = cancelar
    window._confirmModalClose=()=>{close();if(onCancel)onCancel();resolve(false)};
    modal.classList.remove("hidden");
  });
}

function closeConfirmModal(){
  const m=$("confirm-modal");
  if(m)m.classList.add("hidden");
  if(typeof window._confirmModalClose==="function"){
    const fn=window._confirmModalClose;
    window._confirmModalClose=null;
    fn();
  }
}
