#!/usr/bin/env bash
set -euo pipefail

# Minimal task picker/claimer/completer for tasks/*.task.yaml
# - Lists TODO tasks ordered by priority (P0->P2), then optional order, then id
# - Supports sequencing via optional `blocked_by: [TASK-000X, ...]` (top-level YAML list)
#   - Tasks with unmet blockers are skipped by --pick/--claim (treated as not ready)
#   - Completed blockers are resolved by scanning both tasks/ and docs/completed-tasks/
# - Optional `order: <int>` to override id tie-break within the same priority
# - --claim picks top ready task (or specific path) and sets status: in_progress
# - --complete sets status: completed and archives to docs/completed-tasks/
# - --list prints candidates (unchanged columns), still ordered with sequencing
# - --pick [STATUS] prints the single highest-priority ready task path (default STATUS=todo)
# - Respects nested subfolders under tasks/, and archived tasks under docs/completed-tasks/

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
TASK_GLOB='tasks/**/TASK-*.task.yaml'
ARCHIVE_DIR="${ROOT_DIR}/docs/completed-tasks"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--list | --pick [todo|in_progress|completed] | --claim [TASK_FILE] | --complete [TASK_FILE]]

Examples:
  $(basename "$0") --list
  $(basename "$0") --pick                # print path to highest-priority TODO task
  $(basename "$0") --pick in_progress    # print path to highest-priority in_progress task
  $(basename "$0") --claim               # claim top-priority TODO task
  $(basename "$0") --claim tasks/TASK-0104-edit-screen-cleanup.task.yaml
  $(basename "$0") --complete            # complete current top in_progress task
  $(basename "$0") --complete tasks/TASK-0104-edit-screen-cleanup.task.yaml

Notes:
  - Sequencing: add `blocked_by:` at top level, e.g.
      blocked_by:
        - TASK-0003
        - TASK-0008
    The picker will only choose tasks whose blockers are completed.
  - Manual ordering within same priority: add `order: 10` (lower first).
EOF
}

# Build a newline-delimited set of IDs whose status is completed across active and archived tasks
completed_ids() {
  rg --files -g "tasks/**/TASK-*.task.yaml" -g "docs/completed-tasks/**/TASK-*.task.yaml" "$ROOT_DIR" 2>/dev/null | \
  while read -r f; do
    st=$(rg -oN '^status:\s*(\w+)' -r '$1' "$f" || true)
    [ "$st" = "completed" ] || continue
    rg -oN '^id:\s*(\S+)' -r '$1' "$f" || true
  done | awk 'NF>0'
}

# Extract blocked_by list (IDs) from a YAML file
blocked_by_ids() {
  local f="$1"
  perl -0777 -ne 'if (/^blocked_by:\s*((?:\n\s*-\s*\S+.*)*)/m) { $s=$1; while ($s =~ /^\s*-\s*(\S+)/mg) { print "$1\n" } }' "$f" 2>/dev/null || true
}

# Determine if a task file is ready (all blockers completed or no blockers)
is_ready() {
  local f="$1"
  local completed_set="$2"
  local ok=1
  # Build a regex-safe newline-wrapped list for membership checks
  local cs="\n${completed_set}\n"
  while read -r dep; do
    [ -n "$dep" ] || continue
    case "$cs" in
      *"\n${dep}\n"*) ;; # found
      *) ok=0; break;;
    esac
  done < <(blocked_by_ids "$f")
  echo $ok
}

# Extract optional order (defaults to large number if missing)
task_order() {
  local f="$1"
  local o
  o=$(rg -oN '^order:\s*(\d+)' -r '$1' "$f" || true)
  echo "${o:-9999}"
}

# List candidate tasks with fields: prio_num\tid\tpath\ttitle\tstatus\tready\torder
list_tasks() {
  local completed
  completed="$(completed_ids)"
  rg --files -g "${TASK_GLOB}" -g '!docs/completed-tasks/**' "$ROOT_DIR" 2>/dev/null |\
  while read -r f; do
    status=$(rg -oN '^status:\s*(\w+)' -r '$1' "$f" || true)
    [ -n "$status" ] || continue
    id=$(rg -oN '^id:\s*(\S+)' -r '$1' "$f" || true)
    pr=$(rg -oN '^priority:\s*(P[0-2])' -r '$1' "$f" || echo 'P9')
    title=$(rg -oN '^title:\s*(.*)' -r '$1' "$f" || true)
    readyflag=$( [ "$(is_ready "$f" "$completed")" -eq 1 ] && echo ready || echo blocked )
    ord=$(task_order "$f")
    case "$pr" in P0) pn=0;; P1) pn=1;; P2) pn=2;; *) pn=9;; esac
    printf "%d\t%s\t%s\t%s\t%s\t%s\t%s\n" "$pn" "${id:-NA}" "$f" "${title:-}" "$status" "$readyflag" "$ord"
  done | sort -k1,1n -k7,7n -k2,2
}

pick_top_todo() {
  list_tasks | awk -F"\t" '$5=="todo" && $6=="ready" {print $3; exit}'
}

pick_top_in_progress() {
  list_tasks | awk -F"\t" '$5=="in_progress" {print $3; exit}'
}

pick_top_by_status() {
  # $1 = status (todo|in_progress|completed)
  local st="${1:-todo}"
  case "$st" in
    todo)
      pick_top_todo
      ;;
    in_progress)
      pick_top_in_progress
      ;;
    completed)
      # Typically archived to docs/completed-tasks and excluded from list; keep for completeness
      list_tasks | awk -F"\t" '$5=="completed" {print $3; exit}'
      ;;
    *)
      echo ""  # invalid handled by caller
      ;;
  esac
}

claim_task() {
  local file="$1"
  [ -f "$file" ] || { echo "Task file not found: $file" >&2; exit 1; }
  perl -0777 -pe 's/^status:\s*todo\b/status: in_progress/m' -i "$file"
  echo "Claimed: $file"
}

complete_task() {
  local file="$1"
  [ -f "$file" ] || { echo "Task file not found: $file" >&2; exit 1; }
  perl -0777 -pe 's/^status:\s*in_progress\b/status: completed/m' -i "$file"
  mkdir -p "$ARCHIVE_DIR"
  local base
  base="$(basename "$file")"
  # Prefer git mv if repo; fall back to mv
  if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$ROOT_DIR" mv -f "$file" "$ARCHIVE_DIR/$base" 2>/dev/null || mv "$file" "$ARCHIVE_DIR/$base"
  else
    mv "$file" "$ARCHIVE_DIR/$base"
  fi
  echo "Completed and archived to: docs/completed-tasks/$base"
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    --list)
      list_tasks | awk -F"\t" '{printf "%s\t%s\t%s\t%s\n", $2, $5, $3, $4}'
      ;;
    --pick)
      local status="${1:-todo}"
      case "$status" in todo|in_progress|completed) ;; *) echo "Invalid status: $status (expected: todo|in_progress|completed)" >&2; exit 2;; esac
      local file
      file=$(pick_top_by_status "$status")
      if [ -n "$file" ]; then
        echo "$file"
      else
        echo "No $status tasks found" >&2
        exit 3
      fi
      ;;
    --claim)
      local file="${1:-}"
      if [ -z "$file" ]; then
        file=$(pick_top_todo)
        [ -n "$file" ] || { echo "No TODO tasks found" >&2; exit 2; }
      fi
      claim_task "$file"
      ;;
    --complete)
      local file="${1:-}"
      if [ -z "$file" ]; then
        file=$(pick_top_in_progress)
        [ -n "$file" ] || { echo "No in_progress tasks found" >&2; exit 2; }
      fi
      complete_task "$file"
      ;;
    -h|--help|*)
      usage
      ;;
  esac
}

main "$@"
