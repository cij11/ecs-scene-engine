#!/bin/bash
# PreCompact hook: logs compaction event to in-progress tickets.
# Reads recent context from stdin and appends to the Comments section
# of any ticket with status "inDevelopment".

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPRINTS_DIR="$ROOT/process/agile/sprints"
BACKLOG_DIR="$ROOT/process/agile/backlog"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Read stdin for context
CONTEXT=""
if read -t 1 -r line; then
  CONTEXT="$line"
  while read -t 0.1 -r line; do
    CONTEXT="$CONTEXT $line"
  done
fi

# Find all inDevelopment tickets
find "$SPRINTS_DIR" "$BACKLOG_DIR" -name "*.md" 2>/dev/null | while read -r ticket; do
  if head -2 "$ticket" | grep -q "^inDevelopment$"; then
    TICKET_NAME=$(basename "$ticket" .md)
    # Append compaction note to Comments section
    if grep -q "^## Comments" "$ticket"; then
      echo "" >> "$ticket"
      echo "**Compaction at $NOW**: Context was compacted. Review git log and docs/ for recent work." >> "$ticket"
      echo "Logged compaction to $TICKET_NAME" >&2
    fi
  fi
done

echo '{"systemMessage":"Compaction logged to in-progress tickets."}'
