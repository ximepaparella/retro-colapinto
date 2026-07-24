/* ============================================================
   REDUCER — estado compartido del board "Pit Stop Webstore".
   Módulo puro, sin dependencias de Netlify ni del DOM: se puede
   testear con Node directo y se usa tal cual desde la Netlify
   Function (netlify/functions/state.js).

   Patrón: applyOp(state, op) -> nuevo estado.
   Nunca lanza excepción por datos inesperados: si un op llega
   con un id que ya no existe (por ejemplo, dos personas
   confirman el podio casi al mismo tiempo) simplemente no hace
   nada, para que nunca se caiga la función.
   ============================================================ */

const SCHEMA_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function initialState(sessionId) {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    sessionId: sessionId || "default",
    epoch: 0,
    revision: 0,
    createdAt: ts,
    updatedAt: ts,
    // zone0 — velocímetro: 1 marca por usuario
    gauge: {
      // [userId]: { name, color, value, ts }
    },
    // zone1 (telemetría) y zone2 (parada en boxes): post-its
    notes: {
      zone1: [], // { id, col, text, read, order, ts }
      zone2: [], // { id, col, text, read, tagIdx, order, ts }
    },
    // zone3 — radio al box
    radio: [
      // { id, n, para, mensaje, de, ts }
    ],
    // zone4 — repaso de ingenieros
    telem: [
      // { id, firma, text, votes: { confirm, deny, nuance }, ts }
    ],
    // zone5 — estrategia
    zone5: {
      gallery: [], // { id, text, votes, ts }
      confirmed: false,
      podium: [], // { galleryId, text, votes, cuando, responsable, ganancia }
    },
    // quiénes están (o estuvieron) conectados al board
    presence: {
      // [userId]: { name, color, lastSeen }
    },
    // timers sincronizados por etapa/zona
    timers: {
      // [zoneId]: { endsAt, durationSec }
    },
  };
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function findIndex(arr, id) {
  return arr.findIndex((x) => x.id === id);
}

/* Reordena/mueve una nota dentro de notes[zone]:
   la saca de donde esté y la vuelve a insertar en `col`,
   antes de `beforeId` (o al final de la columna si no viene). */
function moveNote(list, id, col, beforeId) {
  const idx = findIndex(list, id);
  if (idx === -1) return list;
  const [item] = list.splice(idx, 1);
  item.col = col;
  if (beforeId) {
    const beforeIdx = findIndex(list, beforeId);
    if (beforeIdx === -1) list.push(item);
    else list.splice(beforeIdx, 0, item);
  } else {
    list.push(item);
  }
  return list;
}

/**
 * applyOp(state, op) -> estado nuevo
 * op = { type, payload, userId, ts }
 */
function applyOp(state, op) {
  if (!op || typeof op.type !== "string") return state;
  const s = clone(state);
  // Migración defensiva: estados guardados antes de agregar presencia/
  // timers no van a tener estas claves. Las inicializamos acá para que
  // cualquier op (no solo las nuevas) funcione sobre estados viejos.
  if (!s.presence) s.presence = {};
  if (!s.timers) s.timers = {};
  const p = op.payload || {};
  const ts = op.ts || nowIso();

  switch (op.type) {
    /* ---------- presencia: quién está conectado ---------- */
    case "presence_ping": {
      if (!p.userId) break;
      s.presence[p.userId] = {
        name: p.name || "Piloto",
        color: p.color || "#ff3e9a",
        lastSeen: ts,
      };
      break;
    }

    /* ---------- timers sincronizados por etapa ---------- */
    case "timer_start": {
      if (!p.zoneId) break;
      const durationSec =
        typeof p.durationSec === "number" && p.durationSec > 0
          ? p.durationSec
          : 300;
      s.timers[p.zoneId] = {
        endsAt: new Date(new Date(ts).getTime() + durationSec * 1000).toISOString(),
        durationSec,
      };
      break;
    }
    case "timer_reset": {
      if (!p.zoneId) break;
      delete s.timers[p.zoneId];
      break;
    }
    /* ---------- zone0: velocímetro ---------- */
    case "gauge_set": {
      if (!p.userId) break;
      s.gauge[p.userId] = {
        name: p.name || "Piloto",
        color: p.color || "#ff3e9a",
        value: typeof p.value === "number" ? p.value : 0,
        ts,
      };
      break;
    }

    /* ---------- zone1 / zone2: post-its ---------- */
    case "note_add": {
      const zone = p.zone;
      if (zone !== "zone1" && zone !== "zone2") break;
      if (!p.id) break;
      const list = s.notes[zone];
      if (findIndex(list, p.id) !== -1) break; // ya existe, evita duplicar
      const note = {
        id: p.id,
        col: typeof p.col === "number" ? p.col : 0,
        text: p.text || "",
        read: false,
        ts,
      };
      if (zone === "zone2") note.tagIdx = 0;
      list.push(note);
      break;
    }
    case "note_edit_text": {
      const list = s.notes[p.zone];
      if (!list) break;
      const n = list.find((x) => x.id === p.id);
      if (n) {
        n.text = p.text || "";
        n.ts = ts;
      }
      break;
    }
    case "note_cycle_tag": {
      const list = s.notes.zone2;
      const n = list.find((x) => x.id === p.id);
      if (n) {
        const total = typeof p.tagCount === "number" && p.tagCount > 0 ? p.tagCount : 4;
        n.tagIdx = ((n.tagIdx || 0) + 1) % total;
      }
      break;
    }
    case "note_toggle_read": {
      const list = s.notes[p.zone];
      if (!list) break;
      const n = list.find((x) => x.id === p.id);
      if (n) n.read = !n.read;
      break;
    }
    case "note_move": {
      const list = s.notes[p.zone];
      if (!list) break;
      s.notes[p.zone] = moveNote(list, p.id, p.col, p.beforeId || null);
      break;
    }

    /* ---------- zone3: radio al box ---------- */
    case "radio_add": {
      if (!p.id) break;
      if (findIndex(s.radio, p.id) !== -1) break;
      s.radio.push({
        id: p.id,
        n: p.n || s.radio.length + 1,
        para: p.para || "",
        mensaje: p.mensaje || "",
        de: p.de || "",
        ts,
      });
      break;
    }
    case "radio_edit": {
      const r = s.radio.find((x) => x.id === p.id);
      if (r && ["para", "mensaje", "de"].includes(p.field)) {
        r[p.field] = p.text || "";
        r.ts = ts;
      }
      break;
    }

    /* ---------- zone4: repaso de ingenieros ---------- */
    case "telem_add": {
      if (!p.id) break;
      if (findIndex(s.telem, p.id) !== -1) break;
      s.telem.push({
        id: p.id,
        firma: p.firma || "equipo",
        text: p.text || "",
        votes: { confirm: 0, deny: 0, nuance: 0 },
        ts,
      });
      break;
    }
    case "telem_edit_text": {
      const t = s.telem.find((x) => x.id === p.id);
      if (t) {
        t.text = p.text || "";
        t.ts = ts;
      }
      break;
    }
    case "telem_edit_firma": {
      const t = s.telem.find((x) => x.id === p.id);
      if (t) {
        t.firma = p.text || "equipo";
        t.ts = ts;
      }
      break;
    }
    case "telem_vote": {
      const t = s.telem.find((x) => x.id === p.id);
      if (t && ["confirm", "deny", "nuance"].includes(p.kind)) {
        t.votes[p.kind] = (t.votes[p.kind] || 0) + 1;
      }
      break;
    }

    /* ---------- zone5: estrategia ---------- */
    case "gallery_add": {
      if (!p.id || !p.text) break;
      if (findIndex(s.zone5.gallery, p.id) !== -1) break;
      s.zone5.gallery.push({ id: p.id, text: p.text, votes: 0, ts });
      break;
    }
    case "gallery_vote": {
      const g = s.zone5.gallery.find((x) => x.id === p.id);
      if (g) g.votes = (g.votes || 0) + 1;
      break;
    }
    case "podium_confirm": {
      const sorted = clone(s.zone5.gallery).sort((a, b) => b.votes - a.votes);
      const top3 = sorted.slice(0, 3);
      s.zone5.podium = top3.map((g) => {
        const prev = s.zone5.podium.find((x) => x.galleryId === g.id);
        return {
          galleryId: g.id,
          text: g.text,
          votes: g.votes,
          cuando: prev ? prev.cuando : "",
          responsable: prev ? prev.responsable : "",
          ganancia: prev ? prev.ganancia : "",
        };
      });
      s.zone5.confirmed = true;
      break;
    }
    case "podium_edit_field": {
      const item = s.zone5.podium.find((x) => x.galleryId === p.galleryId);
      if (item && ["cuando", "responsable", "ganancia"].includes(p.key)) {
        item[p.key] = p.text || "";
      }
      break;
    }

    /* ---------- sesión ---------- */
    case "reset_session": {
      const fresh = initialState(s.sessionId);
      fresh.createdAt = s.createdAt;
      fresh.epoch = (s.epoch || 0) + 1;
      // La gente sigue conectada aunque se reinicie el contenido: no
      // tiene sentido que desaparezcan de la lista de presencia.
      fresh.presence = s.presence;
      return { ...fresh, updatedAt: ts };
    }

    default:
      break;
  }

  s.updatedAt = ts;
  return s;
}

module.exports = { initialState, applyOp, SCHEMA_VERSION };
