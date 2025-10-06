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
# - --pick [STATUS] prints the single highest-priority task path (default auto: in_progress first, then ready TODO)
# - Respects nested subfolders under tasks/, and archived tasks under docs/completed-tasks/

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
TASK_GLOB='tasks/**/TASK-*.task.yaml'
ARCHIVE_DIR="${ROOT_DIR}/docs/completed-tasks"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--list | --pick [auto|todo|in_progress|completed] | --claim [TASK_FILE] | --complete [TASK_FILE]]

Examples:
  $(basename "$0") --list
  $(basename "$0") --pick                # print path to highest-priority in_progress task, else ready TODO
  $(basename "$0") --pick in_progress    # explicitly print path to highest-priority in_progress task
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

# List candidate tasks with fields: status_rank\tprio_num\tid\tpath\ttitle\tstatus\tready\torder
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
    case "$status" in in_progress) sn=0;; todo) sn=1;; completed) sn=2;; *) sn=3;; esac
    printf "%d\t%d\t%s\t%s\t%s\t%s\t%s\t%s\n" "$sn" "$pn" "${id:-NA}" "$f" "${title:-}" "$status" "$readyflag" "$ord"
  done | sort -k1,1n -k2,2n -k8,8n -k3,3
}

pick_top_todo() {
  list_tasks | awk -F"\t" '$6=="todo" && $7=="ready" {print $4; exit}'
}

pick_top_in_progress() {
  list_tasks | awk -F"\t" '$6=="in_progress" {print $4; exit}'
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
      list_tasks | awk -F"\t" '$6=="completed" {print $4; exit}'
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
      list_tasks | awk -F"\t" '{printf "%s\t%s\t%s\t%s\n", $3, $6, $4, $5}'
      ;;
    --pick)
      local requested="${1:-auto}"
      local status="$requested"
      local file=""
      case "$requested" in
        auto)
          file=$(pick_top_in_progress)
          if [ -n "$file" ]; then
            status="in_progress"
          else
            file=$(pick_top_todo)
            status="todo"
          fi
          ;;
        todo|in_progress|completed)
          file=$(pick_top_by_status "$requested")
          ;;
        *)
          echo "Invalid status: $requested (expected: auto|todo|in_progress|completed)" >&2
          exit 2
          ;;
      esac
      if [ -n "$file" ]; then
        echo "$file"
      else
        if [ "$requested" = "auto" ]; then
          echo "No in_progress or todo tasks found" >&2
        else
          echo "No $status tasks found" >&2
        fi
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
