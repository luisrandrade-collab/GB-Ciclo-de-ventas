// ════════════════════════════════════════════════════════════════
// GOURMET BITES — Eventos de agenda (v8.0.8)
// ════════════════════════════════════════════════════════════════
// Fuente ÚNICA de la lista de eventos de un documento: la usan la app
// (descarga manual del .ics, como <script>: window.GBAgenda) y la Cloud
// Function que mantiene el calendario de Google (require).
// functions/agenda-eventos.js es una COPIA ÍNTEGRA de este archivo
// (functions/ se despliega aparte); scripts/check_drift.mjs exige que
// sean idénticos. Editar aquí y copiar.
//
// Funciones puras, sin red ni Firestore. Datos operativos sin total ni
// importes (D6 de Luis, 2026-10-06).
(function(raiz){
  "use strict";

  // Estados que van al calendario, por colección (como isAgendable del servidor v7.7.5).
  const ESTADOS_AGENDABLES={
    quotes:["pedido","en_produccion","entregado"],
    proposals:["aprobada","en_produccion","entregado"],
    propfinals:["aprobada","en_produccion","entregado"]
  };

  function esAgendable(q,coleccion){
    if(!q||q._wrongCollection)return false;
    const estados=ESTADOS_AGENDABLES[coleccion];
    if(!estados)return false;
    // PF fantasma guardada por error en proposals/ (v4.12.7): la real vive en propfinals/
    if(coleccion==="proposals"&&String(q.id||"").startsWith("GB-PF-"))return false;
    return estados.includes(q.status);
  }

  // ─── Fechas (Bogotá es UTC-5 fijo, sin horario de verano) ──────
  function sumarDias(fecha,n){
    const [y,m,d]=fecha.split("-").map(Number);
    return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
  }
  function fechaValida(f){return typeof f==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(f)&&sumarDias(f,0)===f}
  function horaValida(h){
    const m=/^(\d{1,2}):(\d{2})$/.exec(String(h||"").trim());
    if(!m||+m[1]>23||+m[2]>59)return "";
    return m[1].padStart(2,"0")+":"+m[2];
  }
  function bogotaAUtc(fecha,hora){
    const [y,m,d]=fecha.split("-").map(Number),[h,mi]=hora.split(":").map(Number);
    return new Date(Date.UTC(y,m-1,d,h+5,mi)).toISOString();
  }

  // SHA-256 síncrono (FIPS 180-4) en JS puro: el navegador y el servidor deben dar el mismo id
  // y crypto.subtle es asíncrono. scripts/test_agenda.mjs lo contrasta con node:crypto.
  const K256=("428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 "+
    "e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da 983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 "+
    "27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 "+
    "19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2").split(" ").map(h=>parseInt(h,16));
  function sha256(bytes){
    const n=bytes.length,total=((n+9+63)>>6)<<6,m=new Uint8Array(total);
    m.set(bytes);m[n]=0x80;
    const dv=new DataView(m.buffer);
    dv.setUint32(total-8,Math.floor(n/0x20000000));dv.setUint32(total-4,(n*8)>>>0);
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],W=new Array(64);
    const rot=(x,r)=>(x>>>r)|(x<<(32-r));
    for(let o=0;o<total;o+=64){
      for(let i=0;i<16;i++)W[i]=dv.getUint32(o+i*4);
      for(let i=16;i<64;i++){
        const s0=rot(W[i-15],7)^rot(W[i-15],18)^(W[i-15]>>>3),s1=rot(W[i-2],17)^rot(W[i-2],19)^(W[i-2]>>>10);
        W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){
        const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K256[i]+W[i])>>>0;
        const t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
    }
    const out=new Uint8Array(32),dvo=new DataView(out.buffer);
    H.forEach((v,i)=>dvo.setUint32(i*4,v));
    return out;
  }

  // Id de evento de Google Calendar: base32hex (0-9 a-v) del SHA-256 de "<gbDoc>/<tipo>/<clave>".
  // Determinista y de longitud fija (52), dentro de 5–1024 aunque el id del documento sea largo.
  function idEvento(gbDoc,tipo,clave){
    const ALFABETO="0123456789abcdefghijklmnopqrstuv";
    const bytes=sha256(new TextEncoder().encode(gbDoc+"/"+tipo+"/"+clave));
    let out="",acc=0,bits=0;
    for(const b of bytes){
      acc=(acc<<8)|b;bits+=8;
      while(bits>=5){out+=ALFABETO[(acc>>>(bits-5))&31];bits-=5}
      acc&=(1<<bits)-1;
    }
    if(bits)out+=ALFABETO[(acc<<(5-bits))&31];
    return out;
  }

  // Una entrega por despacho (clave = despachos[].id); legacy: desp_legacy, como getDespachos (app-core.js).
  // Fecha y hora salen de fechaHora ("YYYY-MM-DDTHH:mm", local Bogotá) o, si falta, de eventDate/horaEntrega.
  function entregasDe(q){
    const ds=Array.isArray(q.despachos)&&q.despachos.length?q.despachos:null;
    const lista=ds?ds.map((d,i)=>{
      const fh=String((d&&d.fechaHora)||"").trim(),t=fh.indexOf("T");
      const propia=d&&d.direccion&&d.direccion.dir?d.direccion:null; // como getDespachoDireccion
      return {
        clave:d&&d.id?String(d.id):"pos"+i,
        fecha:fh?(t>0?fh.slice(0,t):fh.slice(0,10)):(q.eventDate||""),
        hora:horaValida(fh?(t>0?fh.slice(t+1,t+6):""):q.horaEntrega),
        dir:propia?propia.dir:(q.dir||""),
        city:propia?(propia.city||""):(q.city||""),
        idx:i+1,total:ds.length
      };
    }):(q.eventDate?[{clave:"desp_legacy",fecha:q.eventDate,hora:horaValida(q.horaEntrega),dir:q.dir||"",city:q.city||"",idx:1,total:1}]:[]);
    // Un id de despacho repetido daría dos eventos con el mismo id (y nunca convergería): el repetido lleva su posición.
    const vistas=new Set();
    lista.forEach(e=>{if(vistas.has(e.clave))e.clave+="~"+e.idx;vistas.add(e.clave)});
    return lista.filter(e=>fechaValida(e.fecha));
  }

  // Documento → [{id, tipo, fecha, hora, titulo, descripcion, lugar, gbDoc}].
  // No filtra por estado: eso es esAgendable. hora "" = día completo.
  function eventosDeDoc(q,coleccion){
    const entregas=entregasDe(q||{});
    if(!entregas.length)return [];
    const gbDoc=coleccion+"/"+q.id;
    const cliente=q.client||"Sin cliente",numero=q.quoteNumber||q.id||"";
    const tipoLbl=coleccion==="quotes"?"Pedido":(coleccion==="propfinals"?"Propuesta final":"Propuesta");
    const comunes=[];
    if(q.tel)comunes.push("Tel: "+q.tel);
    if(q.att)comunes.push("Atención: "+q.att);
    if(q.notasInternas)comunes.push("Notas internas: "+q.notasInternas);
    const lugarDe=e=>e.dir+(e.city?(e.dir?", ":"")+e.city:"");
    const out=[];

    // Producción: un evento de día completo por fecha (productionDate explícita o el día anterior a cada entrega).
    const prodExplicita=fechaValida(q.productionDate)?q.productionDate:"";
    const fechasProd=[...new Set(entregas.map(e=>prodExplicita||sumarDias(e.fecha,-1)))].sort();
    fechasProd.forEach((fp,i)=>{
      const atiende=prodExplicita?entregas:entregas.filter(e=>sumarDias(e.fecha,-1)===fp);
      const desc=["Producción para "+tipoLbl+" "+numero];
      atiende.forEach(e=>desc.push("Entrega: "+e.fecha+(e.hora?" a las "+e.hora:"")+(e.total>1?" (despacho "+e.idx+" de "+e.total+")":"")));
      if(q.notasInternas)desc.push("Notas internas: "+q.notasInternas);
      out.push({
        id:idEvento(gbDoc,"produccion",fp),tipo:"produccion",fecha:fp,hora:"",
        titulo:"🔥 Producir "+cliente+" ("+numero+")"+(fechasProd.length>1?" (día "+(i+1)+"/"+fechasProd.length+")":""),
        descripcion:desc.join("\n"),lugar:"",gbDoc
      });
    });

    // Entregas: una por despacho.
    entregas.forEach(e=>{
      const desc=["Entrega de "+tipoLbl+" "+numero];
      if(e.total>1)desc.push("Despacho "+e.idx+" de "+e.total);
      if(e.dir||e.city)desc.push("Dirección: "+lugarDe(e));
      out.push({
        id:idEvento(gbDoc,"entrega",e.clave),tipo:"entrega",fecha:e.fecha,hora:e.hora,
        titulo:"🚚 Entrega "+cliente+" ("+numero+")"+(e.total>1?" · D"+e.idx+"/"+e.total:""),
        descripcion:desc.concat(comunes).join("\n"),lugar:lugarDe(e),gbDoc
      });
    });
    return out;
  }

  const GBAgenda={ESTADOS_AGENDABLES,esAgendable,eventosDeDoc,idEvento,bogotaAUtc,sumarDias};
  if(typeof module!=="undefined"&&module.exports)module.exports=GBAgenda;
  else raiz.GBAgenda=GBAgenda;
})(typeof window!=="undefined"?window:globalThis);
