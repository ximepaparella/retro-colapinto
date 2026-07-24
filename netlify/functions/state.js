/* ============================================================
   Netlify Function: /api/state
   Guarda y devuelve el estado compartido del board en un
   Netlify Blob (una "sesión" = un blob JSON).

   GET  /api/state?session=xxx        -> devuelve el estado (lo crea si no existe)
   GET  /api/state?session=xxx&download=1 -> igual, pero fuerza descarga como archivo
   POST /api/state?session=xxx        -> body: { op: {...} } o { ops: [{...}, ...] }
                                          aplica la(s) operación(es) con el reducer
                                          y devuelve el estado ya actualizado.

   El nombre de la sesión viaja por query param para poder reutilizar
   la misma plataforma con distintas retros más adelante
   (?session=webstore-julio, ?session=equipo-x-agosto, etc).
   Si no se manda ?session=, se usa "default".

   CONCURRENCIA: con muchas personas escribiendo casi al mismo tiempo
   (post-its, votos, velocímetro), un simple "leer todo -> modificar ->
   guardar todo" puede perder cambios: si dos requests leen el mismo
   estado y después escriben cada uno por su lado, el segundo write pisa
   al primero y ese cambio desaparece. Para evitarlo, cada escritura es
   condicional al ETag que se leyó (onlyIfMatch / onlyIfNew). Si otra
   persona escribió justo en el medio, el guardado falla con
   modified:false y reintentamos automáticamente sobre el estado más
   nuevo, en vez de perder el cambio.
   ============================================================ */
const { getStore, connectLambda } = require("@netlify/blobs");
const { initialState, applyOp } = require("../../shared/reducer.js");

const MAX_RETRIES = 10;

function cleanSessionId(raw) {
  const v = (raw || "default").toString().trim();
  const safe = v.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe || "default";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lee el estado actual (con su ETag) y lo devuelve. Si no existe
 * todavía, no crea nada acá — eso lo maneja quien llama, para poder
 * usar onlyIfNew y evitar una carrera también en la creación inicial.
 */
async function readState(store, key, sessionId) {
  const existing = await store.getWithMetadata(key, { type: "json" });
  if (existing && existing.data) {
    return { state: existing.data, etag: existing.etag };
  }
  return { state: initialState(sessionId), etag: null };
}

/**
 * Aplica un mutator(state) -> nuevoState de forma segura ante
 * concurrencia: lee, muta, intenta guardar condicionado al ETag leído;
 * si alguien más escribió en el medio, vuelve a leer (ya con los
 * cambios de esa otra persona) y reintenta la mutación desde ahí.
 * Devuelve el estado final ya persistido.
 */
async function writeWithRetry(store, key, sessionId, mutator) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { state, etag } = await readState(store, key, sessionId);
    const nextState = mutator(state);
    const setOptions = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    try {
      const result = await store.setJSON(key, nextState, setOptions);
      if (result.modified) {
        return nextState;
      }
      // Alguien más escribió justo antes (o ya existía cuando esperábamos
      // que no existiera) -> reintentamos con el estado más nuevo.
    } catch (err) {
      lastErr = err;
    }
    // Backoff corto y con algo de aleatoriedad para que, si varias
    // personas chocan a la vez, no vuelvan a chocar todas juntas en el
    // mismo instante del reintento.
    await sleep(20 + Math.random() * 60 + attempt * 15);
  }
  throw (
    lastErr ||
    new Error(
      "No se pudo guardar el cambio: hubo demasiada actividad simultánea. Probá de nuevo."
    )
  );
}

exports.handler = async (event) => {
  // Esta función usa la firma clásica de Netlify Functions ("Lambda
  // compatibility mode"). En ese modo Netlify NO inyecta el contexto de
  // Blobs automáticamente por sí solo — hay que conectarlo a mano con
  // connectLambda(event), pasándole el mismo evento que recibe el handler,
  // ANTES de llamar a getStore(). Con esto no hace falta ningún token ni
  // variable de entorno manual, ni para deploys por Git ni por drag&drop.
  try {
    connectLambda(event);
  } catch (e) {
    // Si por algún motivo no hay contexto para conectar (por ejemplo,
    // corriendo fuera de Netlify), seguimos: getStore() más abajo va a
    // devolver un error claro igual, en vez de tirar acá sin explicación.
  }

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const params = event.queryStringParameters || {};
  const sessionId = cleanSessionId(params.session);
  const key = "session-" + sessionId;

  let store;
  try {
    // Respaldo manual por si connectLambda no alcanza en algún entorno
    // particular: si existen BLOBS_SITE_ID / BLOBS_TOKEN como variables
    // de entorno, se usan explícitamente.
    const storeOpts = { name: "pitstop-sessions" };
    if (process.env.BLOBS_SITE_ID && process.env.BLOBS_TOKEN) {
      storeOpts.siteID = process.env.BLOBS_SITE_ID;
      storeOpts.token = process.env.BLOBS_TOKEN;
    }
    store = getStore(storeOpts);
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          "No se pudo inicializar Netlify Blobs. Verificá que la función se haya redeployado con la última versión del código (connectLambda). Si el problema persiste, configurá BLOBS_SITE_ID y BLOBS_TOKEN en Site configuration → Environment variables (ver COMO_DEPLOYAR.md).",
        detail: String((err && err.message) || err),
      }),
    };
  }

  try {
    if (event.httpMethod === "GET") {
      const { state, etag } = await readState(store, key, sessionId);
      if (!etag) {
        // Todavía no existe el blob para esta sesión: lo creamos, pero
        // sin pisar a otra persona que esté creándolo en simultáneo.
        try {
          await store.setJSON(key, state, { onlyIfNew: true });
        } catch (e) {
          /* si falló porque ya lo creó otra persona, no pasa nada */
        }
      }
      if (params.download === "1") {
        headers["Content-Disposition"] =
          'attachment; filename="pitstop-' + sessionId + '.json"';
      }
      return { statusCode: 200, headers, body: JSON.stringify(state) };
    }

    if (event.httpMethod === "POST") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch (e) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "JSON inválido en el body" }),
        };
      }

      const ops = Array.isArray(payload.ops)
        ? payload.ops
        : payload.op
        ? [payload.op]
        : [];

      const finalState = await writeWithRetry(store, key, sessionId, (state) => {
        let next = state;
        for (const op of ops) {
          next = applyOp(next, {
            type: op.type,
            payload: op.payload || {},
            userId: op.userId,
            ts: new Date().toISOString(),
          });
        }
        return next;
      });

      return { statusCode: 200, headers, body: JSON.stringify(finalState) };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método no soportado" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String((err && err.message) || err) }),
    };
  }
};

// Exportado además del handler para poder testear la lógica de
// concurrencia (readState/writeWithRetry) de forma aislada, sin
// depender de la infraestructura real de Netlify.
exports._internal = { readState, writeWithRetry };
