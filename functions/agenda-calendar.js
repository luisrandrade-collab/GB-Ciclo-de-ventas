// ════════════════════════════════════════════════════════════════
// GOURMET BITES — Cliente mínimo de la Google Calendar API (v8.0.8)
// ════════════════════════════════════════════════════════════════
// list (por marca privada gbApp/gbDoc, recorriendo nextPageToken), insert,
// patch y delete por id. Token del servidor de metadatos con la cuenta de
// servicio de la función (sin claves ni OAuth por usuario). fetch nativo de
// Node 22, inyectable para las pruebas.
// Registros: sólo acción, código HTTP y gbDoc o id de evento; nunca el
// contenido del evento ni el cuerpo de la respuesta (datos de clientes).

const API="https://www.googleapis.com/calendar/v3/calendars/";
const METADATA="http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=https://www.googleapis.com/auth/calendar.events";

function crearClienteCalendar({calendarId,fetch:f=globalThis.fetch,log=console,esperar=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!calendarId)throw new Error("agenda: falta GB_CALENDAR_ID");
  const raiz=API+encodeURIComponent(calendarId)+"/events";
  let token=null,vence=0;

  async function obtenerToken(){
    if(token&&Date.now()<vence)return token;
    const r=await f(METADATA,{headers:{"Metadata-Flavor":"Google"}});
    if(!r.ok)throw new Error("agenda: token del servidor de metadatos HTTP "+r.status);
    const j=await r.json();
    token=j.access_token;vence=Date.now()+Math.max(0,(j.expires_in||0)-60)*1000;
    return token;
  }

  // 5xx (y 429): un solo reintento.
  async function pedir(metodo,ruta,cuerpo,ref){
    for(let intento=1;;intento++){
      const headers={Authorization:"Bearer "+await obtenerToken()};
      if(cuerpo)headers["Content-Type"]="application/json";
      const r=await f(raiz+ruta,{method:metodo,headers,body:cuerpo?JSON.stringify(cuerpo):undefined});
      if(intento===1&&(r.status>=500||r.status===429)){
        log.warn("agenda: "+metodo+" HTTP "+r.status+" ("+ref+"); se reintenta una vez");
        await esperar(1000);continue;
      }
      return r;
    }
  }
  const falla=(accion,r,ref)=>new Error("agenda: "+accion+" HTTP "+r.status+" ("+ref+")");

  async function listar(filtros,ref){
    const out=[];let pagina="";
    do{
      const q=new URLSearchParams({maxResults:"2500",showDeleted:"false"});
      filtros.forEach(([k,v])=>q.append("privateExtendedProperty",k+"="+v));
      if(pagina)q.set("pageToken",pagina);
      const r=await pedir("GET","?"+q,null,ref);
      if(!r.ok)throw falla("listar",r,ref);
      const j=await r.json();
      out.push(...(j.items||[]));
      pagina=j.nextPageToken||"";
    }while(pagina);
    return out;
  }

  async function actualizar(id,recurso){
    const r=await pedir("PATCH","/"+encodeURIComponent(id),recurso,id);
    if(!r.ok)throw falla("actualizar",r,id);
  }
  // 409: el id ya existe (también si se borró antes: Calendar lo conserva cancelado) → patch, que lo deja confirmado.
  async function insertar(recurso){
    const r=await pedir("POST","",recurso,recurso.id);
    if(r.status===409)return actualizar(recurso.id,recurso);
    if(!r.ok)throw falla("insertar",r,recurso.id);
  }
  // 404 / 410: ya no está = hecho.
  async function borrar(id){
    const r=await pedir("DELETE","/"+encodeURIComponent(id),null,id);
    if(r.ok||r.status===404||r.status===410)return;
    throw falla("borrar",r,id);
  }

  return {
    listarDoc:gbDoc=>listar([["gbApp","1"],["gbDoc",gbDoc]],gbDoc),
    listarTodos:()=>listar([["gbApp","1"]],"gbApp=1"),
    insertar,actualizar,borrar
  };
}

module.exports={crearClienteCalendar};
