#!/usr/bin/env bash
#
# AGI project health check — one command, every moving part.
#
# Usage (from the repo root, Git Bash or WSL):
#   ./healthcheck.sh
#
# Checks, in order:
#   1. Docker daemon reachable
#   2. sr-lab backend container running + API answering (+ dataset count)
#   3. sr-lab frontend container running + serving
#   4. F3IL memory image present + answers an MCP initialize over stdio
#   5. any EXTRA_HEALTH_URLS from sr-lab/.env (comma-separated, gitignored —
#      put your real service URLs there; nothing environment-specific lives
#      in this file)
#
# Exit code 0 = all green. Each failure prints a one-line fix hint.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0

ok(){ echo "  [OK]   $1"; PASS=$((PASS+1)); }
bad(){ echo "  [FAIL] $1"; echo "         fix: $2"; FAIL=$((FAIL+1)); }

echo "AGI project health check — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# 1. Docker daemon
if docker info >/dev/null 2>&1; then
  ok "docker daemon reachable"
  DOCKER=1
else
  bad "docker daemon unreachable" "start Docker Desktop (or run from a shell that has the docker socket)"
  DOCKER=0
fi

# 2. sr-lab backend
if [ "$DOCKER" = 1 ] && docker ps --format '{{.Names}}' | grep -q '^sr-lab-backend$'; then
  ok "sr-lab-backend container running"
else
  bad "sr-lab-backend container not running" "cd <repo-root> && docker compose up -d"
fi
API_JSON=$(curl -fsS -m 5 http://localhost:8000/api/datasets 2>/dev/null) \
  && ok "backend API answering ($(printf '%s' "$API_JSON" | grep -o '"dataset_id"\|"id"' | wc -l | tr -d ' ') datasets)" \
  || bad "backend API not answering on :8000" "docker restart sr-lab-backend; then docker logs sr-lab-backend --tail 20"

# 3. sr-lab frontend
if [ "$DOCKER" = 1 ] && docker ps --format '{{.Names}}' | grep -q '^sr-lab-frontend$'; then
  ok "sr-lab-frontend container running"
else
  bad "sr-lab-frontend container not running" "cd <repo-root> && docker compose up -d"
fi
curl -fsS -m 5 -o /dev/null http://localhost:5173 2>/dev/null \
  && ok "frontend serving on :5173" \
  || bad "frontend not serving on :5173" "docker restart sr-lab-frontend"

# 4. F3IL memory server (image + a real MCP initialize over stdio)
if [ "$DOCKER" = 1 ]; then
  # exact compose image name first (project "agi", service "memory");
  # never match other repos' memory services (e.g. an HTTP memory-service)
  F3IL_IMAGE=$(docker images --format '{{.Repository}}' | grep -E '^agi-memory$' | head -1)
  [ -z "$F3IL_IMAGE" ] && F3IL_IMAGE=$(docker images --format '{{.Repository}}' | grep -E '^agi[-_]memory' | head -1)
  if [ -n "$F3IL_IMAGE" ]; then
    ok "F3IL memory image present ($F3IL_IMAGE)"
    # The image runs the server from a bind mount (-v repo:/data), exactly
    # like the Claude Desktop config — so the ping must mount it too.
    # pwd -W yields a Windows-style path in Git Bash, dodging MSYS's
    # colon-list path mangling on the -v argument.
    HOST_DIR=$(cd "$SCRIPT_DIR" && (pwd -W 2>/dev/null || pwd))
    # grep for the JSON-RPC reply rather than trusting line one — the server
    # may print startup banners to stdout before answering (false FAIL fix)
    # hold stdin open after sending — the server may exit on end-of-input
    # before flushing its reply (Desktop never closes stdin, so it never sees this)
    RESP=$({ printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"healthcheck","version":"0"}}}\n'; sleep 8; } \
      | timeout 40 docker run -i --rm -v "$HOST_DIR:/data" -e F3IL_DB_PATH=//tmp/health.db "$F3IL_IMAGE" 2>/dev/null | grep -m1 '"jsonrpc"')
    if printf '%s' "$RESP" | grep -q '"result"'; then
      ok "F3IL answers MCP initialize over stdio"
    else
      bad "F3IL image did not answer initialize" "docker compose --profile memory build   (rebuild after dependency changes), then re-run this check"
    fi
  else
    bad "F3IL memory image not found" "cd <repo-root> && docker compose --profile memory build"
  fi
fi

# 4.5 F3!L memory backup — every health check snapshots memory.db if it
# changed, keeps the last 14. Lesson paid for in full on 2026-08-11: the
# memory that matters is a file, and files need backups that aren't
# accidents. .backups/ must be gitignored.
if [ -f "$SCRIPT_DIR/memory.db" ]; then
  mkdir -p "$SCRIPT_DIR/.backups"
  LATEST=$(ls -t "$SCRIPT_DIR/.backups"/memory-*.db 2>/dev/null | head -1)
  if [ -z "$LATEST" ] || ! cmp -s "$SCRIPT_DIR/memory.db" "$LATEST"; then
    cp "$SCRIPT_DIR/memory.db" "$SCRIPT_DIR/.backups/memory-$(date -u +%Y%m%d-%H%M%S).db"
    ok "memory.db backed up ($(ls "$SCRIPT_DIR/.backups" | wc -l | tr -d ' ') snapshots kept)"
    ls -t "$SCRIPT_DIR/.backups"/memory-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
  else
    ok "memory.db unchanged since last backup"
  fi
else
  bad "memory.db not found at repo root" "check F3IL's volume mount"
fi

# 5. extra service URLs from sr-lab/.env (gitignored — your real endpoints)
ENV_FILE="$SCRIPT_DIR/sr-lab/.env"
EXTRA=""
if [ -f "$ENV_FILE" ]; then
  line=$(grep -E '^[[:space:]]*EXTRA_HEALTH_URLS[[:space:]]*=' "$ENV_FILE" | tail -1) || true
  [ -n "${line:-}" ] && EXTRA="${line#*=}"
fi
if [ -n "$EXTRA" ]; then
  IFS=',' read -ra URLS <<< "$EXTRA"
  for u in "${URLS[@]}"; do
    u=$(printf '%s' "$u" | tr -d ' "')
    [ -z "$u" ] && continue
    curl -fsS -m 8 -o /dev/null "$u" \
      && ok "external: $u" \
      || bad "external: $u unreachable" "check the service's own logs/deploy"
  done
else
  echo "  [--]   no EXTRA_HEALTH_URLS in sr-lab/.env (optional: EXTRA_HEALTH_URLS=https://your-api/health,https://...)"
fi

echo ""
echo "Result: $PASS ok, $FAIL failing"
exit $(( FAIL > 0 ? 1 : 0 ))
