# Deploy y rollback — Gourmet Bites v7

Procedimiento operativo para deploy de la app, las rules de Firebase, y los rollbacks correspondientes.

**Mantener este archivo actualizado al cambiar infraestructura.** Última revisión: 2026-05-10 (v7.9.4.1).

---

## Arquitectura de deploy

| Componente | Ruta | Mecanismo de deploy | Tiempo de propagación |
|---|---|---|---|
| **Frontend (HTML/JS/CSS)** | `index.html`, `catalogo.html`, `app-*.js` | GitHub Pages auto-deploy desde `origin/main` | 1-2 min |
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
- Repo limpio: `git status` debe estar clean en `main` antes de cualquier deploy

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

### 4. Commit + push (frontend)

```bash
git add app-core.js index.html
git commit -m "feat(v7.X.Y.Z): <resumen>"
git push origin HEAD:main
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

### 7. Snapshot OneDrive (al cierre de versión)

Carpeta en `Downloads/gourmet-bites-vX.Y.Z_<fecha>/` con:
- `_internos/` completo
- `context.txt` (resumen ejecutivo)
- `LEEME.txt` (instrucciones reconstrucción)

Patrón ligero (recomendado): solo `_internos` + 2 docs. El código fuente vive en GitHub.

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

# 3. Pages auto-redeploya en 1-2 min
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

## Estado del deploy actual (al 2026-05-10)

- **Versión en producción:** v7.9.4.1 (commit `83af371`)
- **URL app:** https://app.gourmetbites.com.co (CNAME → GitHub Pages)
- **URL Pages directa:** https://luisrandrade-collab.github.io/GB-Ciclo-de-ventas/
- **Proyecto Firebase:** `gourmet-bites-cotizador` (Plan Blaze)
- **Backups Firestore:** schedule diario activo desde 2026-04-21, retención 98d
- **Storage rules:** evidencia inmutable en `pagos/`, `pdfs/`, `entregas/`, `facturas/`, `comprobantes-compras/`, `comentarios/`. `productos/` mutable para editor.
- **DNS/SSL:** Cloudflare DNS-only (necesario para SSL de GitHub Pages)
