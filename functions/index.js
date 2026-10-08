// ════════════════════════════════════════════════════════════════
// GOURMET BITES — Cloud Functions (v8.0.8)
// ════════════════════════════════════════════════════════════════
//
// Agenda con Google Calendar API: el calendario de Google «Gourmet Bites —
// Pedidos» (compartido con Kathy y JP como calendario normal, no como
// suscripción) se mantiene al día desde Firestore.
//   · agendaQuotes / agendaProposals / agendaPropfinals: trigger en cada
//     escritura (incluido el borrado) que sincroniza ESE documento
//     (functions/agenda-sync.js).
//   · agendaReconciliar: todos los días a las 03:00 (Bogotá) revisa todo y
//     borra los eventos huérfanos. Sirve también de carga inicial.
// Corren con una cuenta de servicio dedicada (parámetro GB_AGENDA_SA, D4):
// lectura de Firestore y «Hacer cambios en eventos» en ese calendario. Sólo
// escriben en Calendar, nunca en Firestore.
//
// v8.0.8 (D3 de Luis, 2026-10-06): se retiró agendaIcs (el .ics suscribible
// con ?token=) y su secreto GB_AGENDA_TOKEN. La descarga manual del .ics desde
// la app se mantiene. Pasos de despliegue: DEPLOY.md, v8.0.8.

const {onDocumentWritten}=require("firebase-functions/v2/firestore");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const {defineString}=require("firebase-functions/params");
const logger=require("firebase-functions/logger");
const {initializeApp}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {crearClienteCalendar}=require("./agenda-calendar.js");
const {sincronizarDoc,reconciliar}=require("./agenda-sync.js");

initializeApp();
const db=getFirestore();

// Parámetros (no son secretos). Se fijan en F0 (DEPLOY.md, v8.0.8).
const CALENDAR_ID=defineString("GB_CALENDAR_ID",{description:"Id del calendario de Google «Gourmet Bites — Pedidos» (Configuración del calendario → Integrar el calendario)."});
const AGENDA_SA=defineString("GB_AGENDA_SA",{description:"Correo de la cuenta de servicio dedicada de la agenda (p. ej. gb-agenda@<proyecto>.iam.gserviceaccount.com)."});

const OPCIONES={region:"us-central1",serviceAccount:AGENDA_SA};

let cal=null;
function deps(){
  if(!cal)cal=crearClienteCalendar({calendarId:CALENDAR_ID.value(),log:logger});
  return {
    cal,log:logger,
    leerDoc:async(c,id)=>{const s=await db.collection(c).doc(id).get();return s.exists?{...s.data(),id:s.id}:null},
    listarDocs:async c=>(await db.collection(c).get()).docs.map(d=>({...d.data(),id:d.id}))
  };
}

// Un error no se reintenta aquí: lo corrige la reconciliación diaria. El registro no lleva datos del cliente.
function triggerAgenda(coleccion){
  return onDocumentWritten({...OPCIONES,document:coleccion+"/{id}"},async event=>{
    try{
      const r=await sincronizarDoc(deps(),coleccion,event.params.id);
      if(r.escrituras)logger.info("agenda: "+r.gbDoc+" sincronizado ("+r.escrituras+" ronda(s))");
    }catch(e){
      logger.error("agenda: falló la sincronización de "+coleccion+"/"+event.params.id+": "+(e&&e.message));
    }
  });
}

exports.agendaQuotes=triggerAgenda("quotes");
exports.agendaProposals=triggerAgenda("proposals");
exports.agendaPropfinals=triggerAgenda("propfinals");

exports.agendaReconciliar=onSchedule({...OPCIONES,schedule:"0 3 * * *",timeZone:"America/Bogota",timeoutSeconds:540},async()=>{
  const r=await reconciliar(deps());
  logger.info("agenda: reconciliación",r);
});
