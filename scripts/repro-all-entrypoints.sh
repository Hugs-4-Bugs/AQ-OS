#!/usr/bin/env bash
# Test ALL AI/lead execution entry points with a real owned, visible lead
BASE="http://localhost:3000"
JAR=/home/z/my-project/scripts/.repro-cookies.txt
LEAD="cmu9mmil8006spulsw94mkydy"

hit() {
  local label="$1"; local method="$2"; local url="$3"; local body="$4"
  echo "──── $label ────"
  if [ "$method" = "GET" ]; then
    curl -s -b "$JAR" -o /tmp/r.json -w "HTTP %{http_code} " "$BASE$url"
  else
    curl -s -b "$JAR" -o /tmp/r.json -w "HTTP %{http_code} " -X "$method" "$BASE$url" \
      -H 'Content-Type: application/json' ${body:+-d "$body"}
  fi
  head -c 220 /tmp/r.json; echo; echo
}

hit "1. lead detail GET /api/leads/[id]"                 GET  "/api/leads/$LEAD"
hit "2. AI analyze POST /api/leads/[id]/analyze"         POST "/api/leads/$LEAD/analyze" '{}'
hit "3. analyze-website POST .../analyze-website"        POST "/api/leads/$LEAD/analyze-website" '{}'
hit "4. deep research POST /api/leads/[id]/research"     POST "/api/leads/$LEAD/research" '{}'
hit "5. company-research POST /api/company-research"     POST "/api/company-research" "{\"leadId\":\"$LEAD\"}"
hit "6. dashboard lead-scoring GET"                      GET  "/api/dashboard/lead-scoring?leadId=$LEAD"
hit "7. prospect pipeline run (AI Pipeline tab)"         POST "/api/prospecting/pipeline/run" "{\"leadId\":\"$LEAD\"}"
hit "8. gap analysis POST /api/leads/[id]/gap-analysis"  POST "/api/leads/$LEAD/gap-analysis" '{}'
