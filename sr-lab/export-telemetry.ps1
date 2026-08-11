<#
.SYNOPSIS
  EXP-007 telemetry export — customer-agnostic by design.

  Pulls three series from any Prometheus-compatible API over a time range,
  aligns them on timestamp, and writes service_telemetry.csv into the
  gitignored private data folder. NOTHING environment-specific lives in
  this file: your URL and queries come from sr-lab\.env (gitignored — copy
  .env.example) or from runtime parameters, which always take precedence.

.EXAMPLE
  # zero-argument run once sr-lab\.env is filled in (copy .env.example):
  .\export-telemetry.ps1

.EXAMPLE
  # generic http_* metrics (adjust job label to one busy service)
  .\export-telemetry.ps1 -PromUrl "http://YOUR-PROM:9090" `
    -RateQuery    'sum(rate(http_requests_total{job="myservice"}[5m]))' `
    -LatencyQuery 'sum(rate(http_request_duration_seconds_sum{job="myservice"}[5m])) / sum(rate(http_request_duration_seconds_count{job="myservice"}[5m]))' `
    -InflightQuery 'sum(http_requests_in_flight{job="myservice"})'

.EXAMPLE
  # nginx ingress controller flavor
  .\export-telemetry.ps1 -PromUrl "http://YOUR-PROM:9090" `
    -RateQuery    'sum(rate(nginx_ingress_controller_requests{ingress="myapp"}[5m]))' `
    -LatencyQuery 'sum(rate(nginx_ingress_controller_request_duration_seconds_sum{ingress="myapp"}[5m])) / sum(rate(nginx_ingress_controller_request_duration_seconds_count{ingress="myapp"}[5m]))' `
    -InflightQuery 'sum(nginx_ingress_controller_nginx_process_connections{state="active"})'

.NOTES
  Aggregate to ONE series per query (wrap in sum(...)); if a query returns
  several series the first is used and a warning printed. Latency may be in
  seconds or ms — the lab's loader auto-detects. Output goes to
  backend/data/private/ which is gitignored: data stays home, code is public.
#>
param(
  [string]$PromUrl,
  [string]$RateQuery,
  [string]$LatencyQuery,
  [string]$InflightQuery,
  [int]$Days = 0,
  [int]$StepSeconds = 0,
  [string]$OutFile = "",
  [string]$Token = "",        # sends "Authorization: Bearer <Token>"
  [string]$AuthHeader = ""    # sends the value verbatim (e.g. "FlyV1 fm2_..."); wins over -Token
)

$ErrorActionPreference = "Stop"

# ---- .env support: set values once in sr-lab\.env (gitignored), run bare ----
# Explicit parameters always override .env. Copy .env.example to .env to start.
$envFile = Join-Path $PSScriptRoot ".env"
$envVals = @{}
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    $t = $line.Trim()
    if ($t -eq "" -or $t.StartsWith("#")) { continue }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    $envVals[$k] = $v
  }
  Write-Host "Loaded $($envVals.Count) value(s) from .env"
}
if (-not $PromUrl)       { $PromUrl       = $envVals["PROM_URL"] }
if (-not $RateQuery)     { $RateQuery     = $envVals["RATE_QUERY"] }
if (-not $LatencyQuery)  { $LatencyQuery  = $envVals["LATENCY_QUERY"] }
if (-not $InflightQuery) { $InflightQuery = $envVals["INFLIGHT_QUERY"] }
if ($Days -le 0)        { $Days        = if ($envVals["DAYS"]) { [int]$envVals["DAYS"] } else { 7 } }
if ($StepSeconds -le 0) { $StepSeconds = if ($envVals["STEP_SECONDS"]) { [int]$envVals["STEP_SECONDS"] } else { 60 } }
if (-not $OutFile)      { $OutFile = if ($envVals["OUT_FILE"]) { $envVals["OUT_FILE"] } else { "$PSScriptRoot\backend\data\private\service_telemetry.csv" } }
if (-not $Token)        { $Token      = $envVals["PROM_TOKEN"] }
if (-not $AuthHeader)   { $AuthHeader = $envVals["PROM_AUTH_HEADER"] }

# Optional auth (hosted Prometheus: Fly.io, Grafana Cloud, ...). No auth = no header.
$authHeaders = @{}
if ($AuthHeader)   { $authHeaders["Authorization"] = $AuthHeader }
elseif ($Token)    { $authHeaders["Authorization"] = "Bearer $Token" }

$missing = @()
if (-not $PromUrl)       { $missing += "PROM_URL" }
if (-not $RateQuery)     { $missing += "RATE_QUERY" }
if (-not $LatencyQuery)  { $missing += "LATENCY_QUERY" }
if (-not $InflightQuery) { $missing += "INFLIGHT_QUERY" }
if ($missing.Count -gt 0) {
  throw "Missing: $($missing -join ', '). Set them in sr-lab\.env (copy .env.example) or pass as parameters."
}

function Get-RangeSeries([string]$Query, [string]$Label) {
  $end = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $start = $end - ($Days * 86400)
  $resp = Invoke-RestMethod -Method Get -Uri "$PromUrl/api/v1/query_range" -Headers $authHeaders -Body @{
    query = $Query; start = $start; end = $end; step = $StepSeconds
  }
  if ($resp.status -ne "success") { throw "Prometheus error for $Label query: $($resp | ConvertTo-Json -Depth 3)" }
  $results = $resp.data.result
  if (-not $results -or $results.Count -eq 0) { throw "$Label query returned no series. Check the metric name/labels: $Query" }
  if ($results.Count -gt 1) { Write-Warning "$Label query returned $($results.Count) series; using the first. Wrap it in sum(...) to aggregate." }
  $map = @{}
  foreach ($pair in $results[0].values) {
    $v = [double]$pair[1]
    if (-not [double]::IsNaN($v)) { $map[[long]$pair[0]] = $v }
  }
  Write-Host ("  {0}: {1} samples" -f $Label, $map.Count)
  return $map
}

Write-Host "Querying $PromUrl over the last $Days day(s), step ${StepSeconds}s..."
$rate     = Get-RangeSeries $RateQuery     "rate"
$latency  = Get-RangeSeries $LatencyQuery  "latency"
$inflight = Get-RangeSeries $InflightQuery "inflight"

$rows = New-Object System.Collections.Generic.List[string]
$rows.Add("timestamp,rate,latency,inflight")
$joined = 0
foreach ($ts in ($rate.Keys | Sort-Object)) {
  if ($latency.ContainsKey($ts) -and $inflight.ContainsKey($ts)) {
    $iso = [DateTimeOffset]::FromUnixTimeSeconds($ts).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    $rows.Add(("{0},{1},{2},{3}" -f $iso, $rate[$ts], $latency[$ts], $inflight[$ts]))
    $joined++
  }
}
if ($joined -lt 100) { throw "Only $joined aligned samples — need at least a few hundred. Widen -Days or check that all three queries cover the same window." }

try {
  $dir = Split-Path -Parent $OutFile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-Content -Path $OutFile -Value $rows -Encoding UTF8
} catch [System.UnauthorizedAccessException] {
  throw "Cannot write $OutFile — the file may be open in another program, or the folder is write-protected."
}

Write-Host ""
Write-Host "Wrote $joined aligned samples to $OutFile"
Write-Host "This folder is gitignored — the export never enters version control."
Write-Host "Next: restart the sr-lab backend; dataset 'PRIVATE: Service Telemetry' appears. Run it with time_split enabled."
