# Cómo deployar el board a tu cuenta de Netlify

No hace falta que sepas nada de Netlify Blobs de antemano — ya está todo armado. Blobs es la base de datos: se activa sola apenas el sitio queda deployado en Netlify, no hay que crear nada a mano ni tocar ningún botón extra.

## Opción recomendada: conectar el sitio a GitHub

Esto evita el tema de los tokens manuales por completo — un sitio conectado a Git recibe el acceso a Blobs automático, y de paso te queda con deploy automático para cuando quieras iterar esto más adelante (basta con hacer `git push`).

Como ya tenés un sitio creado (`magnificent-lokum-6c9266.netlify.app`), lo mejor es **conectarlo a un repo nuevo en vez de crear un sitio distinto**, así no perdés la URL que ya compartiste.

1. **Creá un repositorio nuevo en GitHub** (github.com → "New repository"). Nombre sugerido: `pitstop-webstore-retro`. Puede ser privado — no hace falta que sea público.

2. **Subí el código** (necesitás tener `git` instalado — si nunca lo usaste, avisame y lo hacemos por la vía sin terminal, más abajo). Descomprimí el `.zip` que te pasé, abrí una terminal en esa carpeta (`netlify-app`) y corré:
   ```
   git init
   git add .
   git commit -m "Board retro Pit Stop Webstore"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/pitstop-webstore-retro.git
   git push -u origin main
   ```
   (`node_modules` no se sube — ya está excluido por el `.gitignore` que incluí; no hace falta, porque al conectar por Git, Netlify corre `npm install` solo, como corresponde.)

   **Sin terminal / sin git instalado:** en la página del repo recién creado en GitHub, hay un link "uploading an existing file". Arrastrás ahí todos los archivos y carpetas de `netlify-app` **excepto** la carpeta `node_modules` (no hace falta subirla), y confirmás el commit desde la web.

3. **Conectá el repo a tu sitio existente**: en el dashboard de Netlify, entrá al sitio `magnificent-lokum-6c9266` → **Site configuration → Build & deploy → Continuous deployment → Link repository** (o "Link site to Git" si te aparece así). Elegís GitHub, autorizás si te lo pide, y seleccionás `pitstop-webstore-retro`.

4. Netlify va a detectar el `netlify.toml` solo (build command `npm install`, función en `netlify/functions`, publish en `public`) y va a lanzar un deploy nuevo. Esperá a que termine (pestaña **Deploys**) y probá la misma URL de siempre — debería sincronizar sin el error de Blobs, sin necesitar los `BLOBS_SITE_ID` / `BLOBS_TOKEN` manuales.

5. De ahora en más, cualquier cambio futuro es: editar el código, `git add . && git commit -m "..." && git push`, y Netlify redeploya solo.

## Opción rápida: arrastrando la carpeta (lo que ya usaste)

Como ya estás logueada en Netlify, esta es la vía más directa. Te dejé todo listo en `netlify-app.zip`, con las dependencias ya instaladas adentro (`node_modules`), así el arrastrar-y-soltar no depende de que Netlify corra ningún comando de build.

1. **Descomprimí `netlify-app.zip`** en tu computadora. Te va a quedar una carpeta `netlify-app` con todo adentro (`public/`, `netlify/functions/`, `node_modules/`, etc.).
2. Andá a **[app.netlify.com/drop](https://app.netlify.com/drop)** (o al final de la pestaña **Projects** de tu team, hay una zona para arrastrar). Confirmá que arriba a la izquierda diga el team/cuenta donde querés que quede el sitio.
3. **Arrastrá la carpeta `netlify-app` completa** (la carpeta, no el `.zip`) a la zona de drop.
4. Esperá unos segundos — Netlify va a crear el sitio, detectar la función `state.js` y publicar `public/index.html`. Te va a dar una URL tipo `https://algo-al-azar.netlify.app`.
5. Entrá a esa URL y fijate que el puntito de "Conectado" (arriba a la derecha) esté en verde. Si aparece un error de Blobs en la consola del navegador, mirá la sección "Si algo no funciona" más abajo — la alternativa de respaldo es la Netlify CLI (unos pasos más abajo en esta guía), que corre `npm install` y arma la función de forma explícita.
6. Opcional pero recomendado: una vez creado el sitio, en el dashboard de Netlify le podés poner un nombre más lindo en **Site settings → Change site name**, para tener una URL más fácil de compartir (por ejemplo `pitstop-webstore.netlify.app`).

Con esto ya tenés la URL para compartir con el equipo — no hace falta seguir leyendo, el resto de la guía (pasos con la CLI, botones de sesión, cómo reutilizar la plataforma) sigue aplicando igual.

## Qué es cada cosa en esta carpeta

- `public/index.html` — el board (lo que ve el equipo).
- `netlify/functions/state.js` — la función que guarda y devuelve el estado del board (la "API").
- `shared/reducer.js` — la lógica que aplica cada acción (agregar post-it, votar, etc.) al estado guardado.
- `netlify.toml` y `package.json` — la configuración para que Netlify sepa cómo armar todo esto.

No hace falta editar ninguno de estos archivos para deployar. Los textos de la retro (si algún día querés cambiarlos) están todos juntos arriba del todo en `public/index.html`, en el objeto `CONTENT`.

## Paso a paso (una sola vez, ~5 minutos)

1. **Instalá Node.js** si no lo tenés (con que tengas el que usás para React/Next ya alcanza).

2. **Instalá la Netlify CLI** (una sola vez, sirve para todos tus proyectos):
   ```
   npm install -g netlify-cli
   ```

3. **Logueate con tu cuenta de Netlify**:
   ```
   netlify login
   ```
   Esto abre el navegador para que autorices la CLI. Es la misma cuenta donde después vas a ver el sitio en tu dashboard.

4. **Entrá a esta carpeta** (`netlify-app`) desde la terminal:
   ```
   cd ruta/a/netlify-app
   ```

5. **Deployá a producción**:
   ```
   netlify deploy --prod
   ```
   La CLI te va a preguntar si querés crear un sitio nuevo — decís que sí, le ponés un nombre (por ejemplo `pitstop-webstore`), y esperás. Automáticamente:
   - corre `npm install` (instala `@netlify/blobs`),
   - arma la función `state.js`,
   - publica `public/index.html`.

6. Al terminar, la CLI te tira una URL tipo `https://pitstop-webstore.netlify.app`. **Esa es la URL que compartís con el equipo.**

Eso es todo — no hay ningún paso extra para "activar" la base de datos. Netlify Blobs queda disponible automáticamente para cualquier función corriendo en un sitio deployado.

## El día de la retro

- Compartí la URL por el canal del equipo o el invite de la reunión. Todos entran a la misma URL, en cualquier navegador, y ven el mismo board en vivo.
- Cada uno elige su nombre y casco al entrar (queda guardado en su navegador, no hace falta repetirlo si recarga la página).
- Los cambios de cada persona (post-its, votos, velocímetro, radio, podio) se sincronizan solos cada ~3 segundos para el resto del equipo. Lo que cada uno escribe se ve al toque en su propia pantalla; tarda hasta 3 segundos en aparecerle al resto.
- Arriba a la derecha del header hay un punto verde con la palabra "Conectado" — si en algún momento se pone rojo ("Sin conexión"), es que se cortó la conexión a internet de esa persona puntual; recargando la página vuelve a sincronizar.

## Botones de sesión (junto al título)

- **🔄 Reiniciar sesión**: borra notas, votos, radio y podio para *todo el equipo* y arranca de cero. Pide confirmación antes de borrar. Usalo solo si querés limpiar todo — no se puede deshacer.
- **⬇️ Exportar sesión**: descarga un archivo `.json` con una foto completa del estado actual (todos los post-its, votos, podio, etc.), para guardar como registro de la retro. Podés hacerlo en cualquier momento, no borra nada.

## Para reutilizar la plataforma en retros futuras

No hace falta volver a deployar nada. La misma URL admite un parámetro `?session=` para separar los datos de cada retro:

- `https://pitstop-webstore.netlify.app` → sesión llamada "default"
- `https://pitstop-webstore.netlify.app/?session=equipo-x-agosto` → una sesión totalmente aparte, con su propio board vacío

Cada nombre de sesión distinto arranca con su propio board en blanco (guarda solo letras, números, guiones y guiones bajos). Es la forma más simple de tener varias retros corriendo sin que se pisen los datos, sin tocar el código.

## Si algo no funciona

- **"No se pudo inicializar Netlify Blobs" / "The environment has not been configured to use Netlify Blobs" (error 500 en todas las acciones)**: esto pasa en algunos sitios creados por *drag and drop* — Netlify no les inyecta automáticamente el acceso a Blobs como sí hace con un deploy por Git o por CLI. Se arregla en 2 minutos, una sola vez, agregando dos variables de entorno:

  1. En el dashboard de Netlify, andá a tu sitio → **Site configuration → Environment variables → Add a variable**.
  2. Agregá `BLOBS_SITE_ID` con el valor del **Site ID** (lo encontrás en la misma sección **Site configuration → General → Site details**, es un código tipo `a1b2c3d4-...`).
  3. Agregá `BLOBS_TOKEN` con un **Personal Access Token**: arriba a la derecha, tu avatar → **User settings → Applications → Personal access tokens → New access token**. Le ponés un nombre (por ejemplo "pitstop-blobs"), lo generás, y copiás el token que te muestra (solo se ve una vez).
  4. Guardá las variables. No hace falta volver a arrastrar la carpeta ni redeployar: la función las toma en la próxima vez que alguien la use (puede tardar uno o dos minutos en propagarse). Recargá el board y probá de nuevo.

  Estas dos variables solo las necesitás si viste este error puntual. Si el board ya te funciona sin errores, no hace falta tocar nada de esto.
- **Alguien no ve los cambios de otro**: pedile que espere ~3 segundos (el intervalo de sincronización) o que recargue la página.
- **Querés volver a deployar cambios** (por ejemplo si edito algo en `index.html`): repetís el paso 5 (`netlify deploy --prod`) desde la misma carpeta. Netlify actualiza el mismo sitio, no crea uno nuevo.
