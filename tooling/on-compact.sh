#!/bin/bash
# PreCompact hook: logs compaction event to in-progress tickets.
# Reads ticket JSON files and appends a compaction note to comments.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKETS_DIR="$ROOT/process/agile/tickets"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Find all inDevelopment tickets from JSON files
if [ -d "$TICKETS_DIR" ]; then
  for ticket_file in "$TICKETS_DIR"/*.json; do
    [ -f "$ticket_file" ] || continue
    STATUS=$(python3 -c "import json,sys; d=json.load(open('$ticket_file')); print(d.get('status',''))" 2>/dev/null)
    if [ "$STATUS" = "inDevelopment" ]; then
      NAME=$(python3 -c "import json,sys; d=json.load(open('$ticket_file')); print(d.get('name',''))" 2>/dev/null)
      # Append compaction note to comments field
      python3 -c "
import json
with open('$ticket_file', 'r') as f:
    d = json.load(f)
note = '\n\n**Compaction at $NOW**: Context was compacted. Review git log and docs/ for recent work.'
d['comments'] = d.get('comments', '') + note
with open('$ticket_file', 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
" 2>/dev/null
      echo "Logged compaction to $NAME" >&2
    fi
  done
fi

echo '{"systemMessage":"Compaction logged to in-progress tickets."}'
