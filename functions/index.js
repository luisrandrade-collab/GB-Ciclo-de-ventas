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

  // Evento producción (todo el día anterior a la entrega)
  if (q.eventDate) {
    const prodDate = q.productionDate || isoMinusOne(q.eventDate);
    if (prodDate) {
      const dStart = isoToIcsDate(prodDate);
      // DTEND es exclusivo en VEVENT all-day → sumar 1 día sería el siguiente.
      // Para evento de 1 día, DTEND = DTSTART + 1 día, pero formato ALL-DAY pide solo fecha.
      const [y, m, d] = prodDate.split("-").map(Number);
      const dt2 = new Date(Date.UTC(y, m - 1, d));
      dt2.setUTCDate(dt2.getUTCDate() + 1);
      const dEnd = `${dt2.getUTCFullYear()}${String(dt2.getUTCMonth()+1).padStart(2,"0")}${String(dt2.getUTCDate()).padStart(2,"0")}`;

      const summary = `🔥 Producir ${cliente} (${numero})`;
      const descParts = [`Producción para ${tipoLbl} ${numero}`];
      if (totalStr) descParts.push(`Total: ${totalStr}`);
      if (q.eventDate) descParts.push(`Entrega: ${q.eventDate}${q.horaEntrega ? ' a las ' + q.horaEntrega : ''}`);
      if (q.notasInternas) descParts.push(`Notas internas: ${q.notasInternas}`);

      out.push([
        "BEGIN:VEVENT",
        `UID:${uid(q.id, "prod")}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dStart}`,
        `DTEND;VALUE=DATE:${dEnd}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
        `CATEGORIES:Gourmet Bites,Producción`,
        "END:VEVENT"
      ].join("\r\n"));
    }
  }

  // Evento entrega (con hora si está)
  if (q.eventDate) {
    const summary = `🚚 Entrega ${cliente} (${numero})`;
    const descParts = [`Entrega de ${tipoLbl} ${numero}`];
    if (totalStr) descParts.push(`Total: ${totalStr}`);
    if (q.dir) descParts.push(`Dirección: ${q.dir}${q.city ? ', ' + q.city : ''}`);
    if (q.tel) descParts.push(`Tel: ${q.tel}`);
    if (q.att) descParts.push(`Atención: ${q.att}`);
    if (q.notasInternas) descParts.push(`Notas: ${q.notasInternas}`);

    if (q.horaEntrega && /^\d{1,2}:\d{2}$/.test(q.horaEntrega)) {
      // Evento con hora: 1 hora de duración por defecto
      const dtStart = isoToIcsDatetime(q.eventDate, q.horaEntrega);
      const [y, m, d] = q.eventDate.split("-").map(Number);
      const [h, mi] = q.horaEntrega.split(":").map(Number);
      const endLocal = new Date(Date.UTC(y, m - 1, d, h + 5 + 1, mi, 0));
      const dtEnd = endLocal.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

      out.push([
        "BEGIN:VEVENT",
        `UID:${uid(q.id, "ent")}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
        `LOCATION:${icsEscape((q.dir || "") + (q.city ? ", " + q.city : ""))}`,
        `CATEGORIES:Gourmet Bites,Entrega`,
        "END:VEVENT"
      ].join("\r\n"));
    } else {
      // Sin hora: evento all-day
      const dStart = isoToIcsDate(q.eventDate);
      const [y, m, d] = q.eventDate.split("-").map(Number);
      const dt2 = new Date(Date.UTC(y, m - 1, d));
      dt2.setUTCDate(dt2.getUTCDate() + 1);
      const dEnd = `${dt2.getUTCFullYear()}${String(dt2.getUTCMonth()+1).padStart(2,"0")}${String(dt2.getUTCDate()).padStart(2,"0")}`;

      out.push([
        "BEGIN:VEVENT",
        `UID:${uid(q.id, "ent")}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${dStart}`,
        `DTEND;VALUE=DATE:${dEnd}`,
        `SUMMARY:${icsEscape(summary)}`,
        `DESCRIPTION:${icsEscape(descParts.join("\n"))}`,
        `LOCATION:${icsEscape((q.dir || "") + (q.city ? ", " + q.city : ""))}`,
        `CATEGORIES:Gourmet Bites,Entrega`,
        "END:VEVENT"
      ].join("\r\n"));
    }
  }

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
