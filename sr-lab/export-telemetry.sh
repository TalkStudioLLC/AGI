#!/usr/bin/env bash
#
# EXP-007 telemetry export — bash edition, customer-agnostic by design.
#
# Pulls three series from any Prometheus-compatible API over a time range,
# aligns them on timestamp, and writes service_telemetry.csv into the
# gitignored private data folder. Nothing environment-specific lives in this
# file: values come from sr-lab/.env (gitignored — copy .env.example) or from
# flags, which always take precedence.
#
# Usage:
#   ./export-telemetry.sh                       # zero-arg once .env is filled
#   ./export-telemetry.sh --prom-url URL --rate-query Q --latency-query Q --inflight-query Q
#   Optional: --days N (7) --step SECONDS (60) --out FILE
#   --minutes N: lookback in minutes instead of days (wins over --days) —
#     for exporting just a load-test window at fine --step
#   --start TS --end TS: exact window (ISO like 2026-08-10T01:41:00Z, or
#     epoch seconds); wins over --minutes/--days. Use to re-export a banked
#     experiment window precisely, with no idle tail.
#   Auth (hosted Prometheus APIs, e.g. Fly.io / Grafana Cloud):
#     --token TOKEN        sends "Authorization: Bearer TOKEN"
#     --auth-header VALUE  sends the value verbatim (e.g. "FlyV1 fm2_...")
#   Both also settable in .env as PROM_TOKEN / PROM_AUTH_HEADER
#   (PROM_AUTH_HEADER wins if both are set). No auth = no header, as before.
#
# Requires: curl, jq. Wrap each query in sum(...) so it returns ONE series.
# Latency may be seconds or ms — the lab's loader auto-detects.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- defaults ----
PROM_URL=""; RATE_QUERY=""; LATENCY_QUERY=""; INFLIGHT_QUERY=""
DAYS=""; STEP_SECONDS=""; OUT_FILE=""; MINUTES=""
START_AT=""; END_AT=""
PROM_TOKEN=""; PROM_AUTH_HEADER=""

# ---- .env (parsed manually — PromQL braces make `source` unsafe) ----
ENV_FILE="$SCRIPT_DIR/.env"
env_get() {  # env_get KEY -> value or empty
  [ -f "$ENV_FILE" ] || return 0
  local line
  line=$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" | tail -1) || true
  [ -z "$line" ] && return 0
  local val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# ---- flags override .env ----
while [ $# -gt 0 ]; do
  case "$1" in
    --prom-url)       PROM_URL="$2"; shift 2 ;;
    --rate-query)     RATE_QUERY="$2"; shift 2 ;;
    --latency-query)  LATENCY_QUERY="$2"; shift 2 ;;
    --inflight-query) INFLIGHT_QUERY="$2"; shift 2 ;;
    --days)           DAYS="$2"; shift 2 ;;
    --minutes)        MINUTES="$2"; shift 2 ;;
    --start)          START_AT="$2"; shift 2 ;;
    --end)            END_AT="$2"; shift 2 ;;
    --step)           STEP_SECONDS="$2"; shift 2 ;;
    --out)            OUT_FILE="$2"; shift 2 ;;
    --token)          PROM_TOKEN="$2"; shift 2 ;;
    --auth-header)    PROM_AUTH_HEADER="$2"; shift 2 ;;
    -h|--help)        grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $1 (see --help)" >&2; exit 1 ;;
  esac
done

[ -n "$PROM_URL" ]       || PROM_URL="$(env_get PROM_URL)"
[ -n "$RATE_QUERY" ]     || RATE_QUERY="$(env_get RATE_QUERY)"
[ -n "$LATENCY_QUERY" ]  || LATENCY_QUERY="$(env_get LATENCY_QUERY)"
[ -n "$INFLIGHT_QUERY" ] || INFLIGHT_QUERY="$(env_get INFLIGHT_QUERY)"
[ -n "$DAYS" ]           || DAYS="$(env_get DAYS)";               DAYS="${DAYS:-7}"
[ -n "$STEP_SECONDS" ]   || STEP_SECONDS="$(env_get STEP_SECONDS)"; STEP_SECONDS="${STEP_SECONDS:-60}"
[ -n "$OUT_FILE" ]       || OUT_FILE="$(env_get OUT_FILE)"
OUT_FILE="${OUT_FILE:-$SCRIPT_DIR/backend/data/private/service_telemetry.csv}"
[ -n "$PROM_TOKEN" ]       || PROM_TOKEN="$(env_get PROM_TOKEN)"
[ -n "$PROM_AUTH_HEADER" ] || PROM_AUTH_HEADER="$(env_get PROM_AUTH_HEADER)"

# ---- optional auth header (hosted Prometheus: Fly.io, Grafana Cloud, ...) ----
AUTH_HEADER=""
if [ -n "$PROM_AUTH_HEADER" ]; then
  AUTH_HEADER="Authorization: $PROM_AUTH_HEADER"
elif [ -n "$PROM_TOKEN" ]; then
  AUTH_HEADER="Authorization: Bearer $PROM_TOKEN"
fi
CURL_AUTH=()
[ -n "$AUTH_HEADER" ] && CURL_AUTH=(-H "$AUTH_HEADER")

missing=()
[ -n "$PROM_URL" ]       || missing+=(PROM_URL)
[ -n "$RATE_QUERY" ]     || missing+=(RATE_QUERY)
[ -n "$LATENCY_QUERY" ]  || missing+=(LATENCY_QUERY)
[ -n "$INFLIGHT_QUERY" ] || missing+=(INFLIGHT_QUERY)
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing: ${missing[*]}" >&2
  echo "Set them in sr-lab/.env (copy .env.example) or pass flags (see --help)." >&2
  exit 1
fi

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "jq is required (https://jqlang.github.io/jq/ — or: apt/yum/pacman install jq; Windows: winget install jqlang.jq)" >&2; exit 1; }

[ -n "$MINUTES" ] || MINUTES="$(env_get MINUTES)"

to_epoch() {  # ISO timestamp or epoch seconds -> epoch seconds
  case "$1" in
    (*[!0-9]*) date -u -d "$1" +%s || { echo "Cannot parse timestamp: $1" >&2; exit 1; } ;;
    (*) printf '%s' "$1" ;;
  esac
}

if [ -n "$START_AT" ] && [ -n "$END_AT" ]; then
  START=$(to_epoch "$START_AT"); END=$(to_epoch "$END_AT")
  [ "$END" -gt "$START" ] || { echo "--end must be after --start" >&2; exit 1; }
  WINDOW_DESC="$START_AT -> $END_AT"
elif [ -n "$START_AT" ] || [ -n "$END_AT" ]; then
  echo "--start and --end must be given together" >&2; exit 1
else
  END=$(date -u +%s)
  if [ -n "$MINUTES" ]; then
    START=$(( END - MINUTES * 60 ))
    WINDOW_DESC="$MINUTES minute(s)"
  else
    START=$(( END - DAYS * 86400 ))
    WINDOW_DESC="$DAYS day(s)"
  fi
fi
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

fetch_series() {  # fetch_series QUERY LABEL -> writes "ts value" lines to $TMP/LABEL
  local query="$1" label="$2" resp status count
  resp=$(curl -fsS -G ${CURL_AUTH[@]+"${CURL_AUTH[@]}"} "$PROM_URL/api/v1/query_range" \
           --data-urlencode "query=$query" \
           --data-urlencode "start=$START" \
           --data-urlencode "end=$END" \
           --data-urlencode "step=$STEP_SECONDS") \
    || { echo "HTTP error talking to $PROM_URL for $label query (401/403? set PROM_TOKEN or PROM_AUTH_HEADER in .env)" >&2; exit 1; }
  status=$(jq -r '.status' <<<"$resp" | tr -d '\r')
  [ "$status" = "success" ] || { echo "Prometheus error for $label: $(jq -c '.error // .' <<<"$resp")" >&2; exit 1; }
  count=$(jq '.data.result | length' <<<"$resp" | tr -d '\r')
  [ "$count" -ge 1 ] || { echo "$label query returned no series — check metric name/labels: $query" >&2; exit 1; }
  [ "$count" -gt 1 ] && echo "WARN: $label returned $count series; using the first. Wrap the query in sum(...)." >&2
  # tr -d '\r': jq on Windows (Git Bash/MSYS) emits CRLF; a stray \r inside
  # the joined fields shatters every CSV row into three when parsers treat
  # bare \r as a line break. Strip it at the source.
  jq -r '.data.result[0].values[] | select(.[1] != "NaN" and .[1] != "+Inf" and .[1] != "-Inf") | "\(.[0]) \(.[1])"' <<<"$resp" | tr -d '\r' | sort -n > "$TMP/$label"
  echo "  $label: $(wc -l < "$TMP/$label") samples"
}

echo "Querying $PROM_URL over the last $WINDOW_DESC, step ${STEP_SECONDS}s..."
fetch_series "$RATE_QUERY"     rate
fetch_series "$LATENCY_QUERY"  latency
fetch_series "$INFLIGHT_QUERY" inflight

# align on timestamp (inner join across the three series)
join "$TMP/rate" "$TMP/latency" | join - "$TMP/inflight" > "$TMP/joined"
JOINED=$(wc -l < "$TMP/joined")
if [ "$JOINED" -lt 100 ]; then
  echo "Only $JOINED aligned samples — need at least a few hundred. Widen --days/--minutes (or use a finer --step) and check that all three queries cover the same window." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")" 2>/dev/null \
  || { echo "Cannot create $(dirname "$OUT_FILE") — folder write-protected?" >&2; exit 1; }
{
  echo "timestamp,rate,latency,inflight"
  awk '{ cmd="date -u -d @"$1" +%Y-%m-%dT%H:%M:%SZ"; cmd | getline iso; close(cmd);
         print iso","$2","$3","$4 }' "$TMP/joined"
} > "$OUT_FILE" \
  || { echo "Cannot write $OUT_FILE — is it open in another program?" >&2; exit 1; }

# integrity check: exactly 4 comma-fields per line, no CR, no empty values —
# never report success on a file a CSV parser would shatter
if ! awk -F, 'NR>1 && (NF!=4 || /\r/ || $2=="" || $3=="" || $4=="") {bad=1; exit} END {exit bad}' "$OUT_FILE"; then
  echo "Integrity check FAILED: $OUT_FILE is malformed (wrong field count / CR / empty values)." >&2
  exit 1
fi
LINES=$(( $(wc -l < "$OUT_FILE") - 1 ))
if [ "$LINES" -ne "$JOINED" ]; then
  echo "Integrity check FAILED: wrote $JOINED samples but file has $LINES data lines." >&2
  exit 1
fi

echo ""
echo "Wrote $JOINED aligned samples to $OUT_FILE (integrity check passed)"
echo "This folder is gitignored — the export never enters version control."
echo "Next: restart the sr-lab backend; dataset 'PRIVATE: Service Telemetry' appears. Run it with time_split enabled."
