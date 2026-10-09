# Deploy y rollback — Gourmet Bites APP

Procedimiento operativo para deploy de la app, las rules de Firebase, y los rollbacks correspondientes.

**Mantener este archivo actualizado al cambiar infraestructura.** Última revisión: 2026-10-07 (estado de producción v8.0.6). Anterior: 2026-10-07 (v8.0.5).

---

## Arquitectura de deploy

| Componente | Ruta | Mecanismo de deploy | Tiempo de propagación |
|---|---|---|---|
| **Frontend (HTML/JS/CSS)** | `index.html`, `app-*.js` | GitHub Pages auto-deploy desde `origin/main` | 1-2 min |
| **Firestore rules** | `firestore.rules` | `firebase deploy --only firestore:rules` | <30 s |
| **Storage rules** | `storage.rules` | `firebase deploy --only storage:rules` | <30 s |
| **Cloud Functions** | `functions/index.js` (+ `agenda-*.js` desde v8.0.8) | `firebase deploy --only functions` | 2-5 min |
| **DNS / SSL** | Cloudflare | manual via panel Cloudflare | variable |

**Punto crítico:** un push a `main` solo despliega frontend. Las rules y functions requieren deploy explícito por CLI. Es posible quedar half-deployed (caso v7.9.4 → v7.9.4.1).

---

## Pre-requisitos

- `firebase` CLI instalado: `npm install -g firebase-tools`
- Login: `firebase login`
- Proyecto activo: `firebase use gourmet-bites-cotizador` (o usar `--project gourmet-bites-cotizador` en cada comando)
- Repo limpio: `git status` en `main` sin cambios fuera del lote (sólo quedan sin seguimiento `AGENTS.md` y `_IA/`, que nunca se suben)
- Revisión independiente con veredicto apto y recorrido en el emulador de lo que cambió
- **Frase canónica de Luis** escrita textual: `APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>`. «ok», «sí» o «adelante» no autorizan commit, push ni despliegue
- Gancho local `.git/hooks/pre-push` (no versionado; el central de la canónica): bloquea todo push salvo que `.git/push_autorizado` contenga esa frase textual. Es de un solo uso: `con_cuenta.sh` y el gancho borran el archivo tras cualquier intento de push; para reintentar hace falta una frase nueva. Nunca usar `--no-verify`
- Cuenta de GitHub: el push va siempre por `bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push origin main`, que usa el token de `luisrandrade-collab` (la cuenta de `.git/cuenta_github`) sólo dentro de ese proceso; no se cambia la cuenta activa de `gh`. Si dice que la cuenta no tiene sesión en `gh`, la inicia Luis (`AGENTS.md`, «Publicación en GitHub»)
- Si el push lo hace Claude Code, la sesión debe estar en modo manual (en modo Auto el clasificador lo bloquea aunque exista la frase)

---

## Deploy completo de versión nueva

Orden recomendado:

### 1. Verificar pre-condiciones

```bash
git status                          # debe estar clean
git log --oneline -3                # confirmar commit a desplegar
firebase use                        # confirmar gourmet-bites-cotizador activo
```

### 2. Snapshot legacy (si hay cambios sustantivos)

```powershell
$ver = "v7.X.Y.Z"
New-Item -ItemType Directory -Path "_legacy/$ver" -Force | Out-Null
Copy-Item app-core.js, app-historial.js, app-dashboard.js, index.html, firestore.rules, storage.rules "_legacy/$ver/" -Force
```

### 3. Bump version

- `app-core.js`: `BUILD_VERSION="v7.X.Y.Z"` (línea ~112)
- `index.html`: cambiar todos los `?v=...` en los `<script src>`

Verificar que no quedó ninguno sin actualizar:

```bash
grep -n '?v=' index.html
```

### 4. Commit, respaldo y push (frontend)

Orden obligatorio: **local → Google Drive al día (paso 7) → GitHub**.

```bash
# Añadir los archivos del lote uno por uno (nunca git add . ni -A: el repositorio es público)
git add app-core.js
git add index.html
git commit -m "feat(v7.X.Y.Z): <resumen>"
# Google Drive sin subidas pendientes del proyecto (paso 7) ANTES del push
# Autorizar el push con la frase canónica textual (un solo uso)
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/push_autorizado
bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push origin main
```

GitHub Pages auto-despliega en 1-2 min. Verificar con:
```bash
curl -s https://app.gourmetbites.com.co/app-core.js | grep BUILD_VERSION
```

### 5. Deploy de rules (si cambiaron)

```bash
# Antes, la frase de Luis que nombre este despliegue (Pre-requisitos): APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>
firebase deploy --only firestore:rules --project gourmet-bites-cotizador
firebase deploy --only storage:rules --project gourmet-bites-cotizador
```

**Importante:** las rules **no se sirven por Pages**. Olvidar este paso = código nuevo + rules viejas = potencial half-deploy con bugs silenciosos. Caso v7.9.4 lo demostró.

### 6. Smoke test post-deploy

Manual:
1. Hard reload (`Ctrl+Shift+R`) en `app.gourmetbites.com.co`
2. Confirmar header muestra la nueva BUILD_VERSION
3. Login → registrar pago de prueba → verificar entrada en Herramientas > Auditoría
4. Si la versión tocó alguna operación crítica, validar el flujo específico

### 7. Respaldo antes del push (Google Drive)

**La carpeta del proyecto está respaldada por Google Drive de forma continua** (`C:\Proyectos` es raíz de copia de seguridad del equipo; confirmado por Luis el 2026-09-27, con la marca verde de Drive en cada archivo). Por eso **ya no se arman carpetas `Ver X.Y.Z`** ni hay un paso de respaldo que ejecutar: antes del push (paso 4) basta con que Drive no tenga subidas pendientes del proyecto.

Sólo si hay duda: copiar `mirror_sqlite.db` (con `-wal` y `-shm`) de `%LOCALAPPDATA%\Google\DriveFS\<cuenta>\`, comparar el MD5 de los archivos del commit con `cloud_md5_checksum` y revisar `pending_uploads` y `queued_uploads`.

Las carpetas `Ver` ya preparadas en `OneDrive - HBCorp SAS\_Para mover a Archivo de versiones APP\` siguen ahí hasta que Luis las mueva.

### 8. Actualizar Onboarding

Editar `_internos/Onboarding_chat_nuevo.json`:
- `version_documento` (incrementar)
- `ultima_actualizacion`
- `estado_actual.ultima_version_cerrada` (mover anterior a `ultima_version_anterior_*`)
- `roadmap_versiones_pendientes` (eliminar la versión cerrada, ajustar próximas)

---

## v8.0.8 — Agenda con Google Calendar API (desplegada 2026-10-08)

Plan: `_internos/Plan_de_accion_v7_11_0_agenda_google_calendar_2026-10-06.json` (D1–D7, C1–C4). El código (F1–F3) no despliega nada por sí solo. Funciones nuevas: `agendaQuotes`, `agendaProposals` y `agendaPropfinals` (trigger por documento) y `agendaReconciliar` (todos los días a las 03:00 de Bogotá; también hace la carga inicial). Se **elimina** `agendaIcs` (D3). Parámetros (no son secretos): `GB_CALENDAR_ID` y `GB_AGENDA_SA`.

### F0 — Configuración que hace Luis (D4), cuando esté decidido D1

Claude no toca la consola. En el proyecto `gourmet-bites-cotizador`:

1. Google Cloud → APIs y servicios → Biblioteca → **Google Calendar API** → Habilitar.
2. IAM → Cuentas de servicio → Crear: `gb-agenda`, con **dos roles de proyecto**: `Visualizador de Cloud Datastore` (`roles/datastore.viewer`, D7) y `Receptor de eventos de Eventarc` (`roles/eventarc.eventReceiver`, lo exigen los disparadores; Luis lo aprobó el 2026-10-08). **Sin claves**: no descargar ningún JSON.
3. En la cuenta de Google de D1: Google Calendar → Otros calendarios → + → Crear calendario **«Gourmet Bites — Producción y entregas»** (así quedó en producción), zona horaria Bogotá.
4. Configuración de ese calendario → Compartir con personas:
   - el correo de `gb-agenda@…iam.gserviceaccount.com` con **«Hacer cambios en eventos»** (no «Hacer cambios y administrar el uso compartido»);
   - Kathy y JP con **«Ver todos los detalles del evento»**.
5. Configuración del calendario → Integrar el calendario → copiar el **ID del calendario**.
6. Valores de los parámetros: `GB_CALENDAR_ID` = ese id; `GB_AGENDA_SA` = el correo de la cuenta de servicio. En el primer despliegue la CLI los pide y los guarda en `functions/.env.<proyecto>`. Ese archivo no lleva secretos, pero no se añade al commit (el repositorio es público).

Verificación de F0: la cuenta de servicio figura en «Compartir con personas» con «Hacer cambios en eventos» y sus roles de proyecto son sólo `datastore.viewer` y `eventarc.eventReceiver`.

**Por comprobar en F0/F5, sin mostrar tokens** (no verificable sin red; viene de la revisión de código):
- **Permisos de los disparadores.** En funciones de 2.ª generación, Eventarc (trigger de Firestore) y Cloud Scheduler invocan la función con una identidad. En v8.0.8 la CLI pidió `roles/eventarc.eventReceiver` (ya incluido en el paso 2). Si pide otro más (p. ej. `roles/run.invoker`), **parar y decide Luis**.
- **Región.** Las funciones van en `us-central1`, como `agendaIcs`. Si la ubicación de Firestore no es compatible, la CLI lo rechaza al desplegar: parar.
- **Alcance del token.** El servidor de metadatos debe entregar el token con `calendar.events`. Si el primer registro dice `HTTP 403` en Calendar, revisar el alcance y la compartición del calendario.

### F5 — Despliegue, en este orden (cada paso con su frase)

1. Precondiciones: `APTO` de Codex sobre este código, F0 hecha, batería en verde y lote local confirmado.
2. **Desplegar las funciones**, con una frase que nombre expresamente la baja de `agendaIcs`. Por ejemplo: `APROBADO POR LUIS PARA QUE CLAUDE CODE EJECUTE: firebase deploy --only functions de v8.0.8 (crea agendaQuotes, agendaProposals, agendaPropfinals y agendaReconciliar y ELIMINA agendaIcs)`.
   ```bash
   firebase deploy --only functions --project gourmet-bites-cotizador
   ```
   La CLI pregunta si borra `agendaIcs`: se responde que sí (nunca `--force` sin que la frase lo diga).
3. **Comprobar que el .ics ya no responde** (sin token en la URL): debe dar `404`.
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://agendaics-zeuz3hinla-uc.a.run.app
   ```
   Si no da 404, no se sigue.
4. **Sólo después**, con su frase (`APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>`), destruir el secreto:
   ```bash
   firebase functions:secrets:destroy GB_AGENDA_TOKEN --project gourmet-bites-cotizador
   ```
5. **Carga inicial**: ejecutar `agendaReconciliar` una vez (Google Cloud → Cloud Scheduler → job `firebase-schedule-agendaReconciliar-us-central1` → Forzar ejecución), con la frase del despliegue si la incluye o con una propia. Escribe sólo en el calendario. Comprobar en el registro (`firebase functions:log --only agendaReconciliar`) la línea `agenda: reconciliación` con `errores: 0` **y** `sinConverger: 0`, y ver los pedidos futuros en el calendario. Si cualquiera de los dos es mayor que 0 (p. ej. por el límite de escrituras de Calendar en la carga inicial), volver a forzar la ejecución hasta que ambos den 0: es idempotente y sólo rehace lo que falta.
6. Medir y registrar la latencia de un cambio: cambiar la fecha de un pedido en la app y medir cuánto tarda en verse en el calendario. Es un objetivo, no una promesa.
7. **Publicar la app** (push de v8.0.8 con su frase): la frase textual en `.git/push_autorizado` y `bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push origin main`, como en «Deploy completo», paso 4 (`AGENTS.md`, «Publicación en GitHub»). Con eso se retira el panel «Sync agenda externa» y cada navegador borra el token guardado al cargar.
8. **C4** — `_internos/Sync_agenda_token_PRIVADO.md` **no se mueve ni lo lee la IA**. Después del paso 4, Luis lo revisa sin mostrar el valor a la IA y lo borra él, o autoriza su borrado con frase.
9. F6: prueba con Kathy y JP en sus teléfonos, los dos a la vez.

### Lecciones del despliegue (2026-10-08)

1. **Windows: análisis local lento.** La CLI corta a los 10 s al leer `functions/`. Antes de desplegar: `export FUNCTIONS_DISCOVERY_TIMEOUT=60` (PowerShell: `$env:FUNCTIONS_DISCOVERY_TIMEOUT=60`).
2. **Primera vez con 2.ª generación:** Google tarda minutos en preparar el agente de Eventarc. Si el primer despliegue falla por eso, esperar unos minutos y repetir; no tocar permisos.
3. **Los disparadores de Firestore exigen `roles/eventarc.eventReceiver`** en la cuenta del servicio (`gb-agenda`), además de `datastore.viewer`. Luis lo aprobó (cambia D4/D7 «un solo rol»: son dos). En IAM el clic de Guardar lo hace Luis.
4. **`403` de Calendar al listar:** revisar primero que la Google Calendar API esté habilitada (la página de la API debe decir «Administrar», no «Habilitar»). En F0 no había quedado habilitada.

### Rollback de v8.0.8

- **El calendario es sólo una vista**: borrar eventos o el calendario entero no toca Firestore. La reconciliación de las 03:00 lo vuelve a llenar.
- **Detener la sincronización sin volver atrás**, con frase: `firebase functions:delete agendaQuotes agendaProposals agendaPropfinals agendaReconciliar --project gourmet-bites-cotizador`.
- **Volver a `agendaIcs`**, con frase antes: `git checkout 2e7df15 -- functions/` y desplegar. Sólo funciona **antes del paso 4**. Después, `agendaIcs` exige un secreto nuevo (rotar el token) y eso lo decide Luis.
- **App**: `git revert <commit de v8.0.8>` y push con frase (`.git/push_autorizado` y `con_cuenta.sh`, como en «Deploy completo», paso 4). Vuelve el panel, pero sin `agendaIcs` su link ya no sirve.

## v8.0.8.1 — Colores por tipo de evento en el calendario

Plan: `_internos/Plan_de_accion_v8_0_8_1_colores_agenda_2026-10-08.json`. Cada evento lleva un `colorId` (`functions/agenda-sync.js`): producir naranja (`6`), entrega azul (`9`). La comparación incluye el color, así que la reconciliación recolorea los eventos ya creados.

1. Con su frase, desplegar funciones (con `FUNCTIONS_DISCOVERY_TIMEOUT=60`): `firebase deploy --only functions --project gourmet-bites-cotizador`. Sólo actualiza las cuatro funciones de la agenda; no crea ni borra ninguna.
2. Forzar `agendaReconciliar` (Cloud Scheduler, como F5 paso 5): `errores: 0` y `sinConverger: 0`; si no, forzar otra vez. Ver los colores en el calendario. Si no se fuerza, la corrida de las 03:00 hace lo mismo.
3. Push de la app con su frase (como «Deploy completo», paso 4).

Rollback: `git checkout 89c775e -- functions/agenda-sync.js` y desplegar funciones con frase. Eso **no quita** los colores ya puestos: el código de v8.0.8 no compara el color y un PATCH sin `colorId` no lo borra. Son inofensivos; si se quieren quitar, borrar los eventos del calendario (es sólo una vista) y forzar `agendaReconciliar`, que los recrea sin color.

---

## Rollback

### Rollback de frontend (GitHub Pages)

```bash
# 1. Identificar commit anterior estable
git log --oneline -10

# 2. Revertir
git revert <hash-bug>           # crea commit que deshace los cambios (preferido — preserva historia)

# 3. El push del revert también exige la frase canónica en .git/push_autorizado
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/push_autorizado
bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push origin main

# 4. Pages auto-redeploya en 1-2 min
```

**Caso extremo (reescribe `main`):** sólo si la frase de Luis nombra expresamente el `git reset --hard` y el push forzado. Primero la frase, después los comandos:

```bash
# 1. La frase textual en .git/push_autorizado, ANTES de cualquier comando destructivo
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/push_autorizado
# 2. Sólo entonces el reinicio y el push forzado
git reset --hard <hash-anterior>
bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push --force-with-lease origin main
```

### Rollback de rules (Firestore o Storage)

Firebase guarda historial de versiones de rules. Para revertir:

```bash
# 0. Antes de todo, la frase de Luis que nombre este rollback (despliegue de rules y push): APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>
# 1. Editar firestore.rules / storage.rules a la versión anterior (manual o desde git checkout)
git checkout <hash-anterior> -- firestore.rules
# 2. Redeployar
firebase deploy --only firestore:rules --project gourmet-bites-cotizador
# 3. Commit del revert
git add firestore.rules && git commit -m "revert: rules a <hash-anterior>"
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/push_autorizado
bash "C:\Proyectos\Interaccion Codex C Code/herramientas/relevo/con_cuenta.sh" git push origin main
```

**Alternativa via Console:** Firebase Console → Firestore → Rules → "Historial de versiones" permite ver y reactivar versiones previas sin pasar por CLI. Útil en emergencia.

### Rollback de Cloud Functions

```bash
# Antes, la frase de Luis que nombre este despliegue: APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>
git checkout <hash-anterior> -- functions/
firebase deploy --only functions --project gourmet-bites-cotizador
```

---

## Casos especiales

### Half-deploy detection

Síntoma: app cargada con BUILD_VERSION nueva pero comportamiento de rules viejas (errores `PERMISSION_DENIED` aleatorios, logs que se quedan colgados, etc.).

Diagnóstico:
1. Confirmar BUILD_VERSION servida: `curl -s https://app.gourmetbites.com.co/app-core.js | grep BUILD_VERSION`
2. Si coincide con `origin/main` pero hay errores de rules → ejecutar deploy de rules manualmente.

### Cache aggressive en navegador

Si tras hard reload sigue sirviendo versión vieja:
- Verificar cache busters en `index.html` están actualizados
- Limpiar caché en DevTools → Application → Clear storage
- En último caso, `Ctrl+F5` repetido o usar incógnito

---

## Estado del deploy actual (al 2026-09-28)

- **Versión en producción:** v8.0.6 (publicada el 2026-10-07, datos y dinero, núcleo): los pagos antiguos (anticipo/saldo en orderData, approvalData o saldoData) ya no se borran del cobrado al registrar, editar o adjuntar un pago; anular, entregar, aprobar, marcar como pedido, producido, despachos, asignar fecha, seguimiento, normalizar y el paso automático a producción revisan el documento fresco dentro de una transacción (no reviven anulados ni duplican el anticipo o la devolución); doble toque bloqueado en confirmar pedido, aprobación, anulación y entrega; el pago con foto queda en su documento; «Deshacer» de Propuesta devuelve sólo lo quitado; el contador del año nuevo se crea solo si el servidor confirma que no hay documentos del año; las tarjetas de módulo se repintan tras cada acción. Rollback: `git revert <commit de v8.0.6>` (vuelve a v8.0.5, `14c294a`). Sin cambios de reglas ni de datos (los pagos legados se materializan en pagos[] sólo al escribir un pago en ese documento).
- **v8.0.5** (`14c294a`, publicada el 2026-10-07, arreglo urgente): en el computador y en iPad, la hoja «Crear» cerrada ya no recibe clics (en la v8.0.4 quedaba transparente encima de los botones de abajo a la derecha, también dentro de las ventanas, y los botones «hacían otra cosa»); «Nueva cotización» y «Nueva propuesta» (hoja Crear y menú lateral) empiezan un documento vacío en vez de mostrar el anterior. Rollback: `git revert <commit de v8.0.5>` (vuelve a v8.0.4, `2e7df15`). Sin datos ni reglas.
- **v8.0.4** (`2e7df15`, publicada el 2026-10-04): «+ Crear» también en el computador (arriba del menú lateral, abre la misma hoja que el «+» del teléfono); «Registrar pedido directo» funciona (cotización nueva que, al guardarse, abre «Marcar como pedido»; exige el cliente); la ficha del cliente tiene «Ver perdidas (N)», que abre Negocios filtrado; fuera del menú los letreros «Pronto» (Pipeline, Perdidas de Clientes y Configuración). Rollback: `git revert <commit de v8.0.4>` (vuelve a v8.0.3, `6dafa50`). Sin datos ni reglas.
- **v8.0.3** (`6dafa50`, publicada el 2026-09-30): si iPhone bloquea «Compartir» tras la espera del guardado (`NotAllowedError`), la app muestra «El PDF está listo» con «Compartir» en vez de abrir el PDF en Safari (que añadía un enlace `blob:` roto al mensaje). Aplica a cotización, propuesta y PF (`savePdf`); estado de cuenta, cuenta de cobro y hojas siguen con descarga directa. Rollback: `git revert <commit de v8.0.3>` (vuelve a v8.0.2, `4e13554`).
- **v8.0.2** (`4e13554`, publicada el 2026-09-29): el PDF se entrega aunque la red esté mala (la copia en Storage espera como máximo 20 s; si no termina, queda `pdfUploadFailed` con el ⚠️ y reintento de siempre); los reintentos de Storage se limitan a 20 s para todas las subidas; mensaje de reintento por conexión para transacciones o subidas agotadas. Rollback: `git revert <commit de v8.0.2>` (vuelve a v8.0.1, `7d98870`). Sin datos ni reglas.
- **v8.0.1** (`7d98870`, publicada el 2026-09-28): el chip «Por cobrar» de Negocios muestra sólo lo entregado con saldo; Inicio tiene un rango de fechas propio («Fechas»: Desde/Hasta); pruebas de rendimiento estables. Rollback: `git revert <commit de v8.0.1>` (vuelve a v8.0.0, `ec75058`). Sin datos ni reglas.
- **v8.0.0** (`ec75058`, publicada el 2026-09-28): rediseño R1 con Inicio (Pipeline y cinco números), lista única de Negocios, ficha del negocio, pagos con botones de método, estado de cuenta por WhatsApp y PDF, avisos «Por actualizar», unir/separar a mano, «Crear versión nueva» en vez de «Sobrescribir» y PDF sin guardado silencioso. Anteriores: v7.10.2 (`a37aea3`), v7.10.1 (`fc7ec13`), v7.10.0 (`4ce8b73`).
- **Bandera del rediseño:** `GB_REDISENO_R1=true` en `app-core.js`. Reversión rápida: ponerla en `false` y publicar (con frase): vuelve a las pantallas de v7.10.2 y conserva los arreglos de datos de v8.0 (versión nueva, PDF, próximo contacto, pérdidas) y el ajuste del botón «+».
- **Régimen Simple apagado:** v7.10.0 y v7.10.1 están en producción pero no se ven ni actúan hasta llenar fecha de inicio, razón social, NIT y DV en `GB_EMISOR` (`app-core.js`). Encenderlo es una versión propia, con revisión. En v8.0 también dependen de él «Por facturar» y «Registrar FE».
- **Rollback de v8.0.0:** `git revert <commit de v8.0.0>` + push (con la frase en `.git/push_autorizado` y `con_cuenta.sh`); vuelve a v7.10.2. Los campos nuevos (`businessId`, `proximoContacto`, `negocioManual`) son aditivos y v7.10.2 los ignora: no hay migración que revertir. Sólo frontend: las rules, las functions y `firebase.json` no cambiaron desde v7.9.33. La última comparación de las rules publicadas contra las del repositorio (idénticas) es del 2026-09-22.
- **CI (`.github/workflows/check.yml`, "pre-deploy check"):** `check.mjs`, nueve suites unitarias (desde v8.0.0 incluye `test_negocios.mjs`, 80 pruebas), `test_integridad_flujos.mjs` (sobre la fuente real; 238 escenarios) y `check_drift.mjs` (23 comprobaciones, incluida la lista de administradores del cliente frente a `firestore.rules`).
- **Backup previo a v8.0.0:** backup diario de Firestore del 2026-09-28 13:47 UTC en estado READY (`firebase firestore:backups:list`).
- **Remoto:** `https://luisrandrade-collab@github.com/luisrandrade-collab/GB-Ciclo-de-ventas.git`, con la cuenta en la URL. GB publica siempre con `luisrandrade-collab`, nunca con `mihv-admin`.
- **Push protegido:** gancho local `pre-push` con la frase canónica (ver Pre-requisitos).
- **Emulador local:** `firebase.json` incluye el bloque `emulators` (auth 9099, firestore 8080, storage 9199, UI 4000). Usar siempre un proyecto `demo-*`, nunca `gourmet-bites-cotizador`.
- **Repositorio público:** GitHub Pages publica la raíz del repo. Añadir al commit sólo los archivos de la versión, uno por uno (nunca `git add .`); la documentación interna no se sube.
- **URL app:** https://app.gourmetbites.com.co (CNAME → GitHub Pages)
- **URL Pages directa:** https://luisrandrade-collab.github.io/GB-Ciclo-de-ventas/
- **Proyecto Firebase:** `gourmet-bites-cotizador` (Plan Blaze)
- **Backups Firestore:** schedule diario activo desde 2026-04-21, retención 98d
- **Storage rules:** evidencia inmutable en `pagos/`, `pdfs/`, `entregas/`, `facturas/`, `comprobantes-compras/`, `comentarios/`. `productos/` mutable para editor.
- **DNS/SSL:** Cloudflare DNS-only (necesario para SSL de GitHub Pages)
