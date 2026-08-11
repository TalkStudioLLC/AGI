#!/usr/bin/env bash
#
# EXP-007 Phase 1b — the traffic dial. Customer-agnostic by design.
#
# Drives stepped load at ONE endpoint YOU OWN, so a quantized concurrency
# gauge has something above its floor to report and Little's Law (L = λ·W)
# becomes measurable. Nothing environment-specific lives in this file: the
# target comes from sr-lab/.env (TARGET_URL=..., gitignored) or --url.
#
# Usage:
#   ./load-sweep.sh --dry-run              # show the plan, send nothing
#   ./load-sweep.sh                        # zero-arg once TARGET_URL is in .env
#   ./load-sweep.sh --url https://YOUR-SERVICE/health
#   Optional: --steps "1 5 20 50" (req/s per step)  --duration 600 (s per step)
#
# Requires: hey (https://github.com/rakyll/hey). Each step runs hey with
# -c <rps> -q 1: rps workers at 1 req/s each, so in-flight concurrency
# floats naturally with latency — the open-loop shape Little's Law is about.
#
# Keepalive is DISABLED (-disable-keepalive): with keepalive on, proxies
# count held-open idle connections as "concurrency", which measures your
# load tool's worker pool, not requests in flight. One connection per
# request makes connection-count equal request-occupancy, so
# connects − disconnects (or a proxy concurrency gauge) tracks the L in
# L = λ·W. Found the hard way in EXP-007 Phase 1b.
#
# ETHICS/SAFETY: only point this at infrastructure you own or have explicit
# permission to load-test. Start with --dry-run; watch your dashboards.
#
# After the sweep, export JUST this window at fine resolution, e.g.:
#   ./export-telemetry.sh --minutes 45 --step 15
# then restart the sr-lab backend and rerun the dataset with time_split.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TARGET_URL=""; STEPS="1 5 20 50"; DURATION=600; DRY_RUN=0

ENV_FILE="$SCRIPT_DIR/.env"
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  local line
  line=$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" | tail -1) || true
  [ -z "$line" ] && return 0
  local val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --url)      TARGET_URL="$2"; shift 2 ;;
    --steps)    STEPS="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1 (see --help)" >&2; exit 1 ;;
  esac
done

[ -n "$TARGET_URL" ] || TARGET_URL="$(env_get TARGET_URL)"
[ -n "$TARGET_URL" ] || { echo "No target. Set TARGET_URL in sr-lab/.env or pass --url (see --help)." >&2; exit 1; }

TOTAL_MIN=0
for rps in $STEPS; do TOTAL_MIN=$(( TOTAL_MIN + DURATION / 60 )); done

echo "Load sweep plan for: $TARGET_URL"
for rps in $STEPS; do
  printf '  %3s req/s for %ss  (hey -c %s -q 1 -z %ss -disable-keepalive)\n' "$rps" "$DURATION" "$rps" "$DURATION"
done
echo "Total: ~${TOTAL_MIN} minutes. Export afterwards with: ./export-telemetry.sh --minutes $(( TOTAL_MIN + 5 )) --step 15"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "(dry run — nothing sent)"
  exit 0
fi

command -v hey >/dev/null || {
  echo "hey is required. Install in WSL/Linux:" >&2
  echo "  wget -q https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 -O ~/.local/bin/hey && chmod +x ~/.local/bin/hey" >&2
  echo "  (mkdir -p ~/.local/bin first; ensure it is on PATH)   — or: go install github.com/rakyll/hey@latest" >&2
  exit 1
}

echo ""
SWEEP_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Sweep start (UTC): $SWEEP_START"
for rps in $STEPS; do
  echo "--- step: $rps req/s for ${DURATION}s ---"
  hey -c "$rps" -q 1 -z "${DURATION}s" -t 10 -disable-keepalive "$TARGET_URL" | grep -E "Requests/sec|Average|requests done|Status code" || true
done
SWEEP_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo ""
echo "Sweep done: $SWEEP_START -> $SWEEP_END (UTC)"
echo "Give the metrics pipeline ~1 minute to catch up, then:"
echo "  ./export-telemetry.sh --minutes $(( TOTAL_MIN + 5 )) --step 15"
echo "Restart the sr-lab backend and rerun 'PRIVATE: Service Telemetry' with time_split."
