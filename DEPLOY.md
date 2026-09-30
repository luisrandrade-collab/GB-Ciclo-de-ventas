# Deploy y rollback — Gourmet Bites APP

Procedimiento operativo para deploy de la app, las rules de Firebase, y los rollbacks correspondientes.

**Mantener este archivo actualizado al cambiar infraestructura.** Última revisión: 2026-09-30 (estado de producción v8.0.3). Anterior: 2026-09-29 (v8.0.2).

---

## Arquitectura de deploy

| Componente | Ruta | Mecanismo de deploy | Tiempo de propagación |
|---|---|---|---|
| **Frontend (HTML/JS/CSS)** | `index.html`, `app-*.js` | GitHub Pages auto-deploy desde `origin/main` | 1-2 min |
| **Firestore rules** | `firestore.rules` | `firebase deploy --only firestore:rules` | <30 s |
| **Storage rules** | `storage.rules` | `firebase deploy --only storage:rules` | <30 s |
| **Cloud Functions** | `functions/index.js` | `firebase deploy --only functions` | 2-5 min |
| **DNS / SSL** | Cloudflare | manual via panel Cloudflare | variable |

**Punto crítico:** un `git push` a `main` solo despliega frontend. Las rules y functions requieren deploy explícito por CLI. Es posible quedar half-deployed (caso v7.9.4 → v7.9.4.1).

---

## Pre-requisitos

- `firebase` CLI instalado: `npm install -g firebase-tools`
- Login: `firebase login`
- Proyecto activo: `firebase use gourmet-bites-cotizador` (o usar `--project gourmet-bites-cotizador` en cada comando)
- Repo limpio: `git status` en `main` sin cambios fuera del lote (sólo quedan sin seguimiento `AGENTS.md` y `_IA/`, que nunca se suben)
- Revisión independiente con veredicto apto y recorrido en el emulador de lo que cambió
- **Frase canónica de Luis** escrita textual: `APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>`. «ok», «sí» o «adelante» no autorizan commit, push ni despliegue
- Gancho local `.git/hooks/pre-push` (no versionado): bloquea todo push salvo que `.git/gb_push_autorizado` contenga esa frase textual. Es de un solo uso: el gancho borra el archivo al publicar. Nunca usar `--no-verify`
- Cuenta de GitHub: git toma la credencial de `gh`. Si la cuenta activa no es `luisrandrade-collab` (p. ej. `mihv-admin`), el push da 403: `gh auth switch --user luisrandrade-collab` antes y volver a la anterior después
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
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/gb_push_autorizado
git push origin main
```

GitHub Pages auto-despliega en 1-2 min. Verificar con:
```bash
curl -s https://app.gourmetbites.com.co/app-core.js | grep BUILD_VERSION
```

### 5. Deploy de rules (si cambiaron)

```bash
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

## Rollback

### Rollback de frontend (GitHub Pages)

```bash
# 1. Identificar commit anterior estable
git log --oneline -10

# 2. Revertir
git revert <hash-bug>           # crea commit que deshace los cambios (preferido — preserva historia)
# O en caso extremo:
git reset --hard <hash-anterior> && git push --force-with-lease origin main
# (CUIDADO: --force a main solo si está absolutamente justificado)

# 3. El push del revert también exige la frase canónica en .git/gb_push_autorizado
printf '%s\n' 'APROBADO POR LUIS PARA QUE <herramienta> EJECUTE: <alcance>' > .git/gb_push_autorizado
git push origin main

# 4. Pages auto-redeploya en 1-2 min
```

### Rollback de rules (Firestore o Storage)

Firebase guarda historial de versiones de rules. Para revertir:

```bash
# 1. Editar firestore.rules / storage.rules a la versión anterior (manual o desde git checkout)
git checkout <hash-anterior> -- firestore.rules
# 2. Redeployar
firebase deploy --only firestore:rules --project gourmet-bites-cotizador
# 3. Commit del revert
git add firestore.rules && git commit -m "revert: rules a <hash-anterior>"
git push origin main
```

**Alternativa via Console:** Firebase Console → Firestore → Rules → "Historial de versiones" permite ver y reactivar versiones previas sin pasar por CLI. Útil en emergencia.

### Rollback de Cloud Functions

```bash
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

- **Versión en producción:** v8.0.3 (publicada el 2026-09-30): si iPhone bloquea «Compartir» tras la espera del guardado (`NotAllowedError`), la app muestra «El PDF está listo» con «Compartir» en vez de abrir el PDF en Safari (que añadía un enlace `blob:` roto al mensaje). Aplica a cotización, propuesta y PF (`savePdf`); estado de cuenta, cuenta de cobro y hojas siguen con descarga directa. Rollback: `git revert <commit de v8.0.3>` (vuelve a v8.0.2, `4e13554`).
- **v8.0.2** (`4e13554`, publicada el 2026-09-29): el PDF se entrega aunque la red esté mala (la copia en Storage espera como máximo 20 s; si no termina, queda `pdfUploadFailed` con el ⚠️ y reintento de siempre); los reintentos de Storage se limitan a 20 s para todas las subidas; mensaje de reintento por conexión para transacciones o subidas agotadas. Rollback: `git revert <commit de v8.0.2>` (vuelve a v8.0.1, `7d98870`). Sin datos ni reglas.
- **v8.0.1** (`7d98870`, publicada el 2026-09-28): el chip «Por cobrar» de Negocios muestra sólo lo entregado con saldo; Inicio tiene un rango de fechas propio («Fechas»: Desde/Hasta); pruebas de rendimiento estables. Rollback: `git revert <commit de v8.0.1>` (vuelve a v8.0.0, `ec75058`). Sin datos ni reglas.
- **v8.0.0** (`ec75058`, publicada el 2026-09-28): rediseño R1 con Inicio (Pipeline y cinco números), lista única de Negocios, ficha del negocio, pagos con botones de método, estado de cuenta por WhatsApp y PDF, avisos «Por actualizar», unir/separar a mano, «Crear versión nueva» en vez de «Sobrescribir» y PDF sin guardado silencioso. Anteriores: v7.10.2 (`a37aea3`), v7.10.1 (`fc7ec13`), v7.10.0 (`4ce8b73`).
- **Bandera del rediseño:** `GB_REDISENO_R1=true` en `app-core.js`. Reversión rápida: ponerla en `false` y publicar (con frase): vuelve a las pantallas de v7.10.2 y conserva los arreglos de datos de v8.0 (versión nueva, PDF, próximo contacto, pérdidas) y el ajuste del botón «+».
- **Régimen Simple apagado:** v7.10.0 y v7.10.1 están en producción pero no se ven ni actúan hasta llenar fecha de inicio, razón social, NIT y DV en `GB_EMISOR` (`app-core.js`). Encenderlo es una versión propia, con revisión. En v8.0 también dependen de él «Por facturar» y «Registrar FE».
- **Rollback de v8.0.0:** `git revert <commit de v8.0.0>` + push (con la frase en `.git/gb_push_autorizado`); vuelve a v7.10.2. Los campos nuevos (`businessId`, `proximoContacto`, `negocioManual`) son aditivos y v7.10.2 los ignora: no hay migración que revertir. Sólo frontend: las rules, las functions y `firebase.json` no cambiaron desde v7.9.33. La última comparación de las rules publicadas contra las del repositorio (idénticas) es del 2026-09-22.
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
