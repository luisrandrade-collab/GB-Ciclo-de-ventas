// ════════════════════════════════════════════════════════════════
// GOURMET BITES — Cloud Functions (v7.7.5)
// ════════════════════════════════════════════════════════════════
//
// agendaIcs: HTTP endpoint que sirve los pedidos de Firestore como
// calendario .ics suscribible. Kathy y JP lo añaden como "calendar
// subscription URL" en su iPhone / Google Calendar y se les actualiza
// solo cada ~1-3h con los pedidos por entregar.
//
// Seguridad: requiere ?token=<TOKEN> en la URL. El token vive como
// secret de Firebase (firebase functions:secrets:set GB_AGENDA_TOKEN).
// Sin token o con token incorrecto → 401.
//
// Performance: cache HTTP de 1h (Cache-Control: public, max-age=3600).
// Las apps de calendario respetan el cache, evita golpear Firestore
// más de lo necesario.

const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// Secret: el token que valida acceso. Compartido entre Luis, Kathy y JP.
// Configurar con: firebase functions:secrets:set GB_AGENDA_TOKEN
const AGENDA_TOKEN = defineSecret("GB_AGENDA_TOKEN");

// ─── Helpers .ics ─────────────────────────────────────────────────

function icsEscape(s) {
  if (!s) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

// UID determinístico para idempotencia del calendar client
function uid(docId, tipo) {
  const safe = (docId || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `gb-${hashStr(docId + "-" + tipo)}-${safe}@gourmetbites`;
}

// Convierte ISO date (YYYY-MM-DD) a formato .ics DATE (YYYYMMDD)
function isoToIcsDate(iso) {
  return (iso || "").replace(/-/g, "");
}

// Convierte ISO date + hora (HH:MM) a .ics DATETIME UTC.
// Asume hora en zona Bogotá (-05:00 sin DST).
function isoToIcsDatetime(iso, hora) {
  if (!iso) return null;
  // Bogotá es UTC-5 fijo (sin DST)
  const [y, m, d] = iso.split("-").map(Number);
  let h = 0, min = 0;
  if (hora && /^\d{1,2}:\d{2}$/.test(hora)) {
    [h, min] = hora.split(":").map(Number);
  }
  // Convertir a UTC (sumar 5 horas)
  const local = new Date(Date.UTC(y, m - 1, d, h + 5, min, 0));
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mi = String(local.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}00Z`;
}

// Resta 1 día a un ISO date string
function isoMinusOne(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowIcsTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Construye eventos .ics para un doc (1 producción + 1 entrega)
function buildVeventsForDoc(q) {
  const out = [];
  const cliente = icsEscape(q.client || "Sin cliente");
  const numero = icsEscape(q.quoteNumber || q.id || "");
  const tipoLbl = q.kind === "proposal" ? "Propuesta" : "Pedido";
  const total = q.total || 0;
  const totalStr = total ? `$${total.toLocaleString("es-CO")}` : "";
  const dtstamp = nowIcsTimestamp();

  // v7.9.7 F5: lista unificada de entregas (1 por despacho o 1 legacy).
  // Cada entrega: {key, dateIso, hora, dir, city, notas, idx}
  const entregas = [];
  if (Array.isArray(q.despachos) && q.despachos.length) {
    q.despachos.forEach((d, idx) => {
      const fh = (d.fechaHora || "").split("T");
      const dateIso = fh[0] || q.eventDate || "";
      if (!dateIso) return;
      const horaRaw = fh[1] ? fh[1].slice(0, 5) : "";
      const dir = (d.direccion && d.direccion.dir) || q.dir || "";
      const city = (d.direccion && d.direccion.city) || q.city || "";
      entregas.push({
        key: `desp${idx + 1}`,
        dateIso,
        hora: horaRaw,
        dir,
        city,
        notas: d.notas || "",
        idx: idx + 1,
        totalDesp: q.despachos.length
      });
    });
  } else if (q.eventDate) {
    entregas.push({
      key: "ent",
      dateIso: q.eventDate,
      hora: q.horaEntrega || "",
      dir: q.dir || "",
      city: q.city || "",
      notas: "",
      idx: null,
      totalDesp: 1
    });
  }

  if (!entregas.length) return out;

  // Eventos de producción: agrupar por fecha única de entrega.
  // Cada día único genera 1 VEVENT de producción (día anterior).
  const fechasProduccionSet = new Set();
  entregas.forEach(e => {
    const prodDate = q.productionDate || isoMinusOne(e.dateIso);
    if (prodDate) fechasProduccionSet.add(prodDate);
  });
  Array.from(fechasProduccionSet).sort().forEach((prodDate, prodIdx) => {
    const dStart = isoToIcsDate(prodDate);
    const [y, m, d] = prodDate.split("-").map(Number);
    const dt2 = new Date(Date.UTC(y, m - 1, d));
    dt2.setUTCDate(dt2.getUTCDate() + 1);
    const dEnd = `${dt2.getUTCFullYear()}${String(dt2.getUTCMonth()+1).padStart(2,"0")}${String(dt2.getUTCDate()).padStart(2,"0")}`;

    // Entregas del día siguiente a esta fecha de producción
    const [py, pm, pd] = prodDate.split("-").map(Number);
    const prodPlusOne = new Date(Date.UTC(py, pm - 1, pd));
    prodPlusOne.setUTCDate(prodPlusOne.getUTCDate() + 1);
    const targetDate = `${prodPlusOne.getUTCFullYear()}-${String(prodPlusOne.getUTCMonth()+1).padStart(2,"0")}-${String(prodPlusOne.getUTCDate()).padStart(2,"0")}`;
    const entregasDia = entregas.filter(e => e.dateIso === targetDate);

    const sufijo = fechasProduccionSet.size > 1 ? ` (día ${prodIdx + 1}/${fechasProduccionSet.size})` : "";
    const summary = `🔥 Producir ${cliente} (${numero})${sufijo}`;
    const descParts = [`Producción para ${tipoLbl} ${numero}`];
    if (totalStr) descParts.push(`Total: ${totalStr}`);
    if (entregasDia.length > 1) {
      descParts.push(`${entregasDia.length} despachos este día:`);
      entregasDia.forEach(e => {
        descParts.push(`  • ${e.dateIso}${e.hora ? ' ' + e.hora : ''} — ${e.notas || 'Despacho ' + e.idx}`);
      });
    } else if (entregasDia.length === 1) {
      const e = entregasDia[0];
      descParts.push(`Entrega: ${e.dateIso}${e.hora ? ' a las ' + e.hora : ''}${e.notas ? ' — ' + e.notas : ''}`);
    }
    if (q.notasInternas) descParts.push(`Notas internas: ${q.notasInternas}`);

    out.push([
      "BEGIN:VEVENT",
      `UID:${uid(q.id, "prod" + prodIdx)}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dStart}`,
      `DTEND;VALUE=DATE:${dEnd}`,
      `SUMMARY:${icsEscape(summary)}`,
      `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
      `CATEGORIES:Gourmet Bites,Producción`,
      "END:VEVENT"
    ].join("\r\n"));
  });

  // Eventos de entrega: 1 VEVENT por entrega/despacho
  entregas.forEach(e => {
    const sufijo = e.idx ? ` · D${e.idx}/${e.totalDesp}${e.notas ? ' · ' + e.notas : ''}` : "";
    const summary = `🚚 Entrega ${cliente} (${numero})${sufijo}`;
    const descParts = [`Entrega de ${tipoLbl} ${numero}`];
    if (e.idx) descParts.push(`Despacho ${e.idx} de ${e.totalDesp}${e.notas ? ' — ' + e.notas : ''}`);
    if (totalStr) descParts.push(`Total propuesta: ${totalStr}`);
    if (e.dir) descParts.push(`Dirección: ${e.dir}${e.city ? ', ' + e.city : ''}`);
    if (q.tel) descParts.push(`Tel: ${q.tel}`);
    if (q.att) descParts.push(`Atención: ${q.att}`);
    if (q.notasInternas) descParts.push(`Notas: ${q.notasInternas}`);

    if (e.hora && /^\d{1,2}:\d{2}$/.test(e.hora)) {
      const dtStart = isoToIcsDatetime(e.dateIso, e.hora);
      const [y, m, d] = e.dateIso.split("-").map(Number);
      const [h, mi] = e.hora.split(":").map(Number);
      const endLocal = new Date(Date.UTC(y, m - 1, d, h + 5 + 1, mi, 0));
      const dtEnd = endLocal.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

      out.push([
        "BEGIN:VEVENT",
        `UID:${uid(q.id, e.key)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
        `LOCATION:${icsEscape((e.dir || "") + (e.city ? ", " + e.city : ""))}`,
        `CATEGORIES:Gourmet Bites,Entrega`,
        "END:VEVENT"
      ].join("\r\n"));
    } else {
      const dStart = isoToIcsDate(e.dateIso);
      const [y, m, d] = e.dateIso.split("-").map(Number);
      const dt2 = new Date(Date.UTC(y, m - 1, d));
      dt2.setUTCDate(dt2.getUTCDate() + 1);
      const dEnd = `${dt2.getUTCFullYear()}${String(dt2.getUTCMonth()+1).padStart(2,"0")}${String(dt2.getUTCDate()).padStart(2,"0")}`;

      out.push([
        "BEGIN:VEVENT",
        `UID:${uid(q.id, e.key)}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dStart}`,
        `DTEND;VALUE=DATE:${dEnd}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
        `LOCATION:${icsEscape((e.dir || "") + (e.city ? ", " + e.city : ""))}`,
        `CATEGORIES:Gourmet Bites,Entrega`,
        "END:VEVENT"
      ].join("\r\n"));
    }
  });

  return out;
}

// Filtros: docs agendables
function isAgendable(q) {
  if (q._wrongCollection) return false;
  if (q.status === "superseded") return false;
  if (q.status === "anulada") return false;
  if (!q.eventDate) return false;
  // Para quotes (cotizaciones): solo si es pedido confirmado en adelante
  if (q.kind === "quote") {
    return ["pedido", "en_produccion", "entregado"].includes(q.status);
  }
  // Para proposals: aprobada en adelante
  if (q.kind === "proposal") {
    return ["aprobada", "en_produccion", "entregado"].includes(q.status);
  }
  return false;
}

// ─── HTTP handler ─────────────────────────────────────────────────

// v7.9.6 F3 (2026-05-11): trade-off de seguridad documentado.
//
// HALLAZGO Codex (Auditoria_v2_codex_2026-05-09.md 6.4):
//   El endpoint usa ?token= query param. El token vive en localStorage de cada
//   usuario y se filtra en historial del navegador / proxies / capturas.
//
// DECISION (v7.9.6): aceptar el trade-off.
//   Razon tecnica: clientes de calendario (Apple Calendar, Google Calendar,
//   Outlook) NO soportan headers Authorization personalizados en suscripciones
//   .ics. Solo aceptan URL simple (o Basic Auth en URL). Cambiar a Bearer
//   romperia las suscripciones activas sin via de re-conexion automatica.
//
//   Razon operacional: uso interno de 3 personas (Luis, Kathy, JP). Token
//   actual rotable manualmente desde Firebase Console (secret AGENDA_TOKEN).
//
// PROCESO DE ROTACION (cuando se requiera):
//   1. Anunciar a los 3 usuarios que se rota el token.
//   2. Firebase Console > Functions > Secrets > AGENDA_TOKEN > update.
//   3. Re-deploy de la funcion para que tome el nuevo valor.
//   4. Cada usuario: Herramientas > Sync Agenda > "Borrar token guardado",
//      pegar nuevo token, re-suscribir en Apple/Google Calendar.
//
// MEJORA FUTURA (v8.x si la auditoria sigue marcandolo):
//   Opcion B': multiples tokens nombrados (token_luis, token_kathy, token_jp)
//   para revocacion granular. Misma debilidad URL filtrable.
//   Opcion C: Firebase Auth + Bearer en endpoint REST separado al .ics
//   (requiere puente: ej. App propia que renderiza el calendario, no
//   suscripcion .ics nativa).
//
// Ver tambien: _internos/Onboarding_infraestructura.json > agenda_ics_token

exports.agendaIcs = onRequest(
  {
    region: "us-central1",
    secrets: [AGENDA_TOKEN],
    cors: false,
    invoker: "public"
  },
  async (req, res) => {
    try {
      // Validar token
      const expected = AGENDA_TOKEN.value();
      const provided = (req.query.token || "").toString();
      if (!expected || provided !== expected) {
        res.status(401).set("Content-Type", "text/plain").send("Unauthorized: token inválido o no provisto.\nUsa ?token=TU_TOKEN en la URL.");
        return;
      }

      // Leer Firestore — quotes + proposals
      const [quotesSnap, proposalsSnap] = await Promise.all([
        db.collection("quotes").get(),
        db.collection("proposals").get()
      ]);

      const docs = [];
      quotesSnap.forEach(d => docs.push({...d.data(), id: d.id, kind: "quote"}));
      proposalsSnap.forEach(d => docs.push({...d.data(), id: d.id, kind: "proposal"}));

      const agendables = docs.filter(isAgendable);

      // Construir .ics
      const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Gourmet Bites//Cotizador v7.7.5//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Gourmet Bites — Pedidos",
        "X-WR-TIMEZONE:America/Bogota",
        "X-WR-CALDESC:Producciones y entregas de Gourmet Bites. Actualizado automáticamente."
      ];

      agendables.forEach(q => {
        buildVeventsForDoc(q).forEach(v => lines.push(v));
      });

      lines.push("END:VCALENDAR");

      const ics = lines.join("\r\n") + "\r\n";

      res.set("Content-Type", "text/calendar; charset=utf-8");
      res.set("Cache-Control", "public, max-age=3600"); // 1h cache
      res.set("Content-Disposition", `inline; filename="gourmet-bites-agenda.ics"`);
      res.status(200).send(ics);
    } catch (e) {
      console.error("agendaIcs error", e);
      res.status(500).set("Content-Type", "text/plain").send("Error generando calendario: " + e.message);
    }
  }
);
