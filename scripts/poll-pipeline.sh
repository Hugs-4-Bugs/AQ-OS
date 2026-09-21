#!/usr/bin/env bash
# Poll prospect pipeline status until completed/failed (max ~200s)
JAR=/home/z/my-project/scripts/.repro-cookies.txt
LEAD="cmu9mmil8006spulsw94mkydy"
for i in $(seq 1 40); do
  sleep 5
  RESP=$(curl -s -b "$JAR" "http://localhost:3000/api/prospecting/pipeline/status?leadId=$LEAD")
  STATUS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('pipeline') or {}; print(p.get('status',''), p.get('progress',0), p.get('currentStep',0), p.get('error',''))" 2>/dev/null)
  echo "poll $i: $STATUS"
  case "$STATUS" in
    completed*|failed*) break ;;
  esac
done
echo "════ FINAL STATE ════"
curl -s -b "$JAR" "http://localhost:3000/api/prospecting/pipeline/status?leadId=$LEAD" > /tmp/final-pipeline.json
python3 - <<'EOF'
import json
d = json.load(open('/tmp/final-pipeline.json'))
p = d.get('pipeline') or {}
print("status:", p.get('status'), "| progress:", p.get('progress'), "| step:", p.get('currentStep'))
ss = json.loads(p.get('stepStatus') or '{}')
print("stepStatus:", ss)
r = json.loads(p['step1ResearchJson']) if p.get('step1ResearchJson') else None
if r: print("STEP1 research:", r.get('summary','')[:150], "| dataSources:", r.get('dataSources'))
g = json.loads(p['step2GapsJson']) if p.get('step2GapsJson') else None
if g: print("STEP2 gaps count:", len(g.get('gaps', [])), "| top:", (g.get('gaps') or [{}])[0].get('title','')[:100])
m = json.loads(p['step3MatchJson']) if p.get('step3MatchJson') else None
if m: print("STEP3 match:", "skipped" if m.get('skipped') else f"score {m.get('matchScore')}, {m.get('opportunityStatement','')[:100]}")
pt = json.loads(p['step4PitchJson']) if p.get('step4PitchJson') else None
if pt: print("STEP4 pitch:", pt.get('headline','')[:120])
em = json.loads(p['step5EmailJson']) if p.get('step5EmailJson') else None
if em: print("STEP5 email subject:", em.get('subject','')); print("  body:", em.get('body','')[:150])
print("overallScore:", p.get('overallScore'), "| temperature:", p.get('temperature'))
print("error:", p.get('error'))
EOF