#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Gourmet Bites — Pre-deploy check (CI mínimo, REQ-6 Codex 2026-05-15)
# ═══════════════════════════════════════════════════════════════════════════
# Valida que el proyecto esté listo para deploy ANTES de push a main.
# Correr desde la raíz del proyecto:  bash scripts/check.sh
#
# Checks:
#   1. node -c en los 7 archivos JS (sintaxis)
#   2. BUILD_VERSION en app-core.js coincide con los 7 cache busters de index.html
#   3. Existencia de los archivos clave del frontend
#
# Sale con código 0 si TODO está OK. Cualquier fallo → exit 1.
# ═══════════════════════════════════════════════════════════════════════════

set -u

if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; BOLD='\033[1m'; NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; NC=''
fi

ERRORS=0
WARNINGS=0
pass() { echo -e "  ${GREEN}✅${NC} $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; ERRORS=$((ERRORS+1)); }
warn() { echo -e "  ${YELLOW}⚠️${NC} $1"; WARNINGS=$((WARNINGS+1)); }
header() { echo -e "\n${BOLD}─── $1 ───${NC}"; }

# Localizar raíz
if [ -f "./index.html" ] && [ -f "./app-core.js" ]; then ROOT="."
elif [ -f "../index.html" ] && [ -f "../app-core.js" ]; then ROOT=".."
else echo "${RED}❌${NC} No encuentro index.html + app-core.js"; exit 1
fi
cd "$ROOT" || exit 1

echo -e "${BOLD}🍽️  Gourmet Bites — pre-deploy check${NC}"
echo "  Proyecto: $(pwd)"
echo "  Fecha:    $(date '+%Y-%m-%d %H:%M:%S')"

# ─── 1. Node disponible
header "1. Node.js disponible"
if ! command -v node >/dev/null 2>&1; then
  fail "node no instalado"; exit 1
fi
pass "node $(node --version)"

# ─── 2. Sintaxis JS
header "2. Sintaxis (node -c en 7 archivos)"
JS_FILES=(app-assets.js app-core.js app-cotizar.js app-propuesta.js app-historial.js app-seguimiento.js app-dashboard.js)
for f in "${JS_FILES[@]}"; do
  if [ ! -f "$f" ]; then fail "$f no existe"; continue; fi
  ERR=$(node -c "$f" 2>&1)
  if [ $? -eq 0 ]; then pass "$f ($(wc -l < "$f" | tr -d ' ') líneas)"
  else fail "$f — SYNTAX ERROR"; echo "$ERR" | sed 's/^/        /'
  fi
done

# functions/index.js si existe
if [ -f "functions/index.js" ]; then
  ERR=$(node -c functions/index.js 2>&1)
  if [ $? -eq 0 ]; then pass "functions/index.js"
  else fail "functions/index.js — SYNTAX ERROR"; echo "$ERR" | sed 's/^/        /'
  fi
fi

# ─── 3. Coherencia BUILD_VERSION ↔ cache busters
header "3. Coherencia BUILD_VERSION ↔ cache busters"
BUILD_VER=$(grep -E 'const BUILD_VERSION\s*=' app-core.js | head -1 | sed -E 's/.*"(v[^"]+)".*/\1/')
if [ -z "$BUILD_VER" ]; then
  fail "No pude extraer BUILD_VERSION de app-core.js"
else
  echo "  BUILD_VERSION: $BUILD_VER"
  VERSION_NUM=$(echo "$BUILD_VER" | sed 's/^v//')
  SCRIPT_VERSIONS=$(grep -oE 'script src="app-[^"]+\?v=[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?' index.html | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?' | sort -u)
  COUNT=$(echo "$SCRIPT_VERSIONS" | wc -l | tr -d ' ')
  if [ "$COUNT" -eq 1 ] && [ "$SCRIPT_VERSIONS" = "$VERSION_NUM" ]; then
    pass "7 <script ?v=$VERSION_NUM> coinciden con BUILD_VERSION"
  elif [ "$COUNT" -eq 1 ]; then
    fail "Cache busters apuntan a $SCRIPT_VERSIONS pero BUILD_VERSION es $VERSION_NUM"
  else
    fail "Cache busters INCONSISTENTES: $(echo $SCRIPT_VERSIONS | tr '\n' ' ')"
  fi
fi

# ─── 4. Archivos clave presentes
header "4. Archivos clave presentes"
EXPECTED=(app-assets.js app-core.js app-cotizar.js app-propuesta.js app-historial.js app-seguimiento.js app-dashboard.js index.html firestore.rules storage.rules)
for f in "${EXPECTED[@]}"; do
  if [ -f "$f" ]; then pass "$f"; else fail "$f — FALTA"; fi
done

# ─── Resumen
echo ""
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✅ TODO OK — listo para push${NC}  (BUILD: ${BUILD_VER:-?})"
  exit 0
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "${YELLOW}${BOLD}⚠️  $WARNINGS advertencia(s)${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}❌ $ERRORS error(es) · $WARNINGS advertencia(s) — NO deployar${NC}"
  exit 1
fi
