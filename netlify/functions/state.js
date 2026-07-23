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
   ============================================================ */
const { getStore } = require("@netlify/blobs");
const { initialState, applyOp } = require("../../shared/reducer.js");

function cleanSessionId(raw) {
  const v = (raw || "default").toString().trim();
  const safe = v.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe || "default";
}

exports.handler = async (event) => {
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
    // En sitios deployados por Git o por la Netlify CLI, Netlify inyecta
    // automáticamente el contexto de Blobs (siteID + token) en la función.
    // En algunos deploys manuales (arrastrar y soltar) esa inyección
    // automática no llega, y getStore() sin datos tira "The environment
    // has not been configured to use Netlify Blobs". Por eso, si existen
    // las variables de entorno BLOBS_SITE_ID / BLOBS_TOKEN (configuradas
    // a mano en Site configuration → Environment variables), las usamos
    // explícitamente como respaldo.
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
          "No se pudo inicializar Netlify Blobs. Si este sitio se deployó arrastrando la carpeta, configurá las variables de entorno BLOBS_SITE_ID y BLOBS_TOKEN en Site configuration → Environment variables (ver COMO_DEPLOYAR.md).",
        detail: String((err && err.message) || err),
      }),
    };
  }

  try {
    if (event.httpMethod === "GET") {
      let state = await store.get(key, { type: "json" });
      if (!state) {
        state = initialState(sessionId);
        await store.setJSON(key, state);
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

      let state = await store.get(key, { type: "json" });
      if (!state) state = initialState(sessionId);

      const ops = Array.isArray(payload.ops)
        ? payload.ops
        : payload.op
        ? [payload.op]
        : [];

      for (const op of ops) {
        state = applyOp(state, {
          type: op.type,
          payload: op.payload || {},
          userId: op.userId,
          ts: new Date().toISOString(),
        });
      }

      await store.setJSON(key, state);
      return { statusCode: 200, headers, body: JSON.stringify(state) };
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
