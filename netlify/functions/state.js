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
const { getStore, connectLambda } = require("@netlify/blobs");
const { initialState, applyOp } = require("../../shared/reducer.js");

function cleanSessionId(raw) {
  const v = (raw || "default").toString().trim();
  const safe = v.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe || "default";
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
    // Si por algún motivo no hay contexto para conectar, seguimos:
    // getStore() más abajo va a devolver un error claro igual.
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
