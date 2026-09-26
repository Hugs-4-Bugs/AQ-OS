#!/usr/bin/env bash
# Reproduce: Existing Lead → Run AI Pipeline → Lead lookup → error
BASE="http://localhost:3000"
JAR=/home/z/my-project/scripts/.repro-cookies.txt
LEAD="cmu9mmil8006spulsw94mkydy"   # Modern Palace Cafeteria & Restaurant — visible in UI list
WF="cmu9m74xm000vpulsecpiahh5"     # Lead Follow-up Flow (user's workflow)

echo "════ A. GET /api/leads/$LEAD (detail — UI opens this before showing AI Pipeline tab) ════"
curl -s -b "$JAR" -o /tmp/detail.json -w "HTTP %{http_code}\n" "$BASE/api/leads/$LEAD"
head -c 300 /tmp/detail.json; echo; echo

echo "════ B. POST /api/prospecting/pipeline/run {leadId} — THE AI PIPELINE BUTTON ════"
curl -s -b "$JAR" -o /tmp/run.json -w "HTTP %{http_code}\n" -X POST "$BASE/api/prospecting/pipeline/run" \
  -H 'Content-Type: application/json' \
  -d "{\"leadId\":\"$LEAD\"}"
cat /tmp/run.json; echo; echo

echo "════ C. GET /api/prospecting/pipeline/status?leadId=$LEAD ════"
curl -s -b "$JAR" -o /tmp/status.json -w "HTTP %{http_code}\n" "$BASE/api/prospecting/pipeline/status?leadId=$LEAD"
cat /tmp/status.json; echo; echo

echo "════ D. POST /api/workflows/$WF/execute {} — THE WORKFLOW RUN BUTTON ════"
curl -s -b "$JAR" -o /tmp/wf.json -w "HTTP %{http_code}\n" -X POST "$BASE/api/workflows/$WF/execute" \
  -H 'Content-Type: application/json' -d '{}'
cat /tmp/wf.json; echo; echo

echo "════ E. server log tail (last 40 lines) ════"
tail -40 /home/z/my-project/dev.log
