#!/usr/bin/env bash
# Phase 18 — lightweight load smoke (no k6 required)
# Usage: bash scripts/load-smoke.sh [baseURL] [requests]
set -euo pipefail
BASE="${1:-http://127.0.0.1:4000/api/v1}"
N="${2:-200}"
LOG=$(mktemp)
START=$(date +%s%3N)
for i in $(seq 1 "$N"); do
  curl -s -o /dev/null -w "%{time_total}\n" "$BASE/health" >> "$LOG" || echo "999" >> "$LOG"
done
END=$(date +%s%3N)
node -e "
const fs=require('fs');
const lines=fs.readFileSync('$LOG','utf8').trim().split(/\n/).map(Number);
const sorted=lines.slice().sort((a,b)=>a-b);
const at=q=>sorted[Math.floor(sorted.length*q)]||0;
const dur=$END-$START;
console.log(JSON.stringify({
  samples: sorted.length,
  durationMs: dur,
  p50s: at(0.5),
  p95s: at(0.95),
  p99s: at(0.99),
  rps: Math.round(sorted.length/(dur/1000))
}, null, 2));
"
rm -f "$LOG"
