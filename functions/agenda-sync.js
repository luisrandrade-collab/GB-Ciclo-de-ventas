// ════════════════════════════════════════════════════════════════
// GOURMET BITES — Sincronización Firestore → Google Calendar (v8.0.8)
// ════════════════════════════════════════════════════════════════
// Firestore es la fuente de verdad. Cada sincronización lee el estado ACTUAL
// del documento (no el del trigger), calcula los eventos deseados, lista los
// que ese documento tiene en el calendario (marca gbDoc) y aplica la
// diferencia. Convergencia final (C1): tras escribir, vuelve a leer el
// documento y a listar; si no coinciden, repite (máximo 3) y, si aún difiere,
// lo registra para la reconciliación diaria. Sólo escribe en Calendar, nunca
// en Firestore: no hay bucle de triggers.
// Dependencias inyectadas: {leerDoc(c,id) → doc|null, listarDocs(c) → [doc],
// cal (agenda-calendar.js), log}.

const {esAgendable,eventosDeDoc,bogotaAUtc,sumarDias}=require("./agenda-eventos.js");

const COLECCIONES=["quotes","proposals","propfinals"];
const INTENTOS=3;

// Evento del módulo → recurso de Calendar. Con hora: 1 h, en UTC y zona Bogotá; sin hora: día completo.
function aRecurso(ev){
  const r={
    id:ev.id,summary:ev.titulo,description:ev.descripcion,location:ev.lugar,status:"confirmed",
    extendedProperties:{private:{gbApp:"1",gbDoc:ev.gbDoc}}
  };
  if(ev.hora){
    const ini=bogotaAUtc(ev.fecha,ev.hora);
    r.start={dateTime:ini,timeZone:"America/Bogota"};
    r.end={dateTime:new Date(Date.parse(ini)+3600e3).toISOString(),timeZone:"America/Bogota"};
  }else{
    r.start={date:ev.fecha};
    r.end={date:sumarDias(ev.fecha,1)};
  }
  return r;
}

function deseadosDe(doc,coleccion){
  return doc&&esAgendable(doc,coleccion)?eventosDeDoc(doc,coleccion).map(aRecurso):[];
}

// Google devuelve dateTime con el desfase de la zona ("…-05:00"): se compara el instante, no el texto.
const momento=x=>!x?"":(x.date?"d"+x.date:"t"+Date.parse(x.dateTime));
function igual(d,a){
  return (d.summary||"")===(a.summary||"")&&(d.description||"")===(a.description||"")&&(d.location||"")===(a.location||"")
    &&momento(d.start)===momento(a.start)&&momento(d.end)===momento(a.end);
}
function coincide(deseados,actuales){
  if(deseados.length!==actuales.length)return false;
  const porId=new Map(actuales.map(e=>[e.id,e]));
  return deseados.every(d=>porId.has(d.id)&&igual(d,porId.get(d.id)));
}

async function aplicar(cal,deseados,actuales){
  const porId=new Map(actuales.map(e=>[e.id,e])),ids=new Set(deseados.map(d=>d.id));
  for(const d of deseados){
    const a=porId.get(d.id);
    if(!a)await cal.insertar(d);
    else if(!igual(d,a))await cal.actualizar(d.id,d);
  }
  for(const a of actuales)if(!ids.has(a.id))await cal.borrar(a.id);
}

// → {gbDoc, ok, escrituras}: escrituras = rondas de diferencia aplicadas (0 si ya coincidía).
async function sincronizarDoc({leerDoc,cal,log=console},coleccion,id){
  const gbDoc=coleccion+"/"+id;
  for(let ronda=0;;ronda++){
    const deseados=deseadosDe(await leerDoc(coleccion,id),coleccion);
    const actuales=await cal.listarDoc(gbDoc);
    if(coincide(deseados,actuales))return {gbDoc,ok:true,escrituras:ronda};
    if(ronda===INTENTOS){
      log.warn("agenda: "+gbDoc+" no convergió tras "+INTENTOS+" intentos; queda para la reconciliación diaria");
      return {gbDoc,ok:false,escrituras:ronda};
    }
    await aplicar(cal,deseados,actuales);
  }
}

// Reconciliación diaria (y carga inicial): (a) sincroniza cada documento cuyo calendario no
// coincide con lo deseado; (b) los eventos con gbApp=1 de documentos que ya no existen o no son
// agendables se borran (vía sincronizarDoc, que relee el documento); los de una colección ajena,
// directamente. Un documento que falla no detiene a los demás.
async function reconciliar(deps){
  const {cal,listarDocs,log=console}=deps;
  const res={documentos:0,sincronizados:0,sinConverger:0,errores:0};
  const porDoc=new Map();
  for(const e of await cal.listarTodos()){
    const g=(e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.gbDoc)||"";
    if(!porDoc.has(g))porDoc.set(g,[]);
    porDoc.get(g).push(e);
  }
  const sincronizar=async(c,id)=>{
    try{
      const r=await sincronizarDoc(deps,c,id);
      res.sincronizados++;if(!r.ok)res.sinConverger++;
    }catch(e){
      res.errores++;log.error("agenda: reconciliación de "+c+"/"+id+" falló: "+(e&&e.message));
    }
  };
  for(const c of COLECCIONES){
    for(const doc of await listarDocs(c)){
      const g=c+"/"+doc.id,actuales=porDoc.get(g)||[];
      porDoc.delete(g);res.documentos++;
      if(!coincide(deseadosDe(doc,c),actuales))await sincronizar(c,doc.id);
    }
  }
  for(const [g,eventos] of porDoc){ // eventos sin documento listado
    const i=g.indexOf("/"),c=g.slice(0,i),id=g.slice(i+1);
    if(i>0&&id&&COLECCIONES.includes(c)){await sincronizar(c,id);continue}
    for(const e of eventos){
      try{await cal.borrar(e.id)}catch(err){res.errores++;log.error("agenda: no se pudo borrar el evento "+e.id+": "+(err&&err.message))}
    }
  }
  return res;
}

module.exports={COLECCIONES,aRecurso,coincide,sincronizarDoc,reconciliar};
