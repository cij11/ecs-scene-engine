#!/bin/bash
# Usage: ./sprintStart.sh <sprint_directory_name>
# Sums story points from tickets in the sprint and appends a row to sprints.csv.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPRINT_NAME="$1"

if [ -z "$SPRINT_NAME" ]; then
  echo "Usage: ./sprintStart.sh <sprint_directory_name>"
  echo "  e.g. ./sprintStart.sh sprint_1_2026_03_25"
  exit 1
fi

SPRINT_DIR="$SCRIPT_DIR/$SPRINT_NAME"

if [ ! -d "$SPRINT_DIR" ]; then
  echo "Error: Sprint directory '$SPRINT_DIR' not found."
  exit 1
fi

TOTAL_POINTS=0
TICKET_COUNT=0

for ticket in "$SPRINT_DIR"/*-ESE-*.md; do
  [ -f "$ticket" ] || continue
  TICKET_COUNT=$((TICKET_COUNT + 1))
  POINTS=$(grep -A1 '^## Size' "$ticket" | tail -1 | tr -dc '0-9')
  if [ -n "$POINTS" ]; then
    TOTAL_POINTS=$((TOTAL_POINTS + POINTS))
  fi
done

echo "$SPRINT_NAME,active,$TICKET_COUNT,$TOTAL_POINTS," >> "$SCRIPT_DIR/sprints.csv"
echo "Added sprint '$SPRINT_NAME' to sprints.csv: $TICKET_COUNT tickets, $TOTAL_POINTS story points."
