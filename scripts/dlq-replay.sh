#!/usr/bin/env bash
# DLQ Replay Script
# Redrives messages from DLQ back to main processing queue
# Usage: ./scripts/dlq-replay.sh --env <env> --queue <queue-name> [--max-messages N] [--dry-run] [--confirm]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV=""
QUEUE_NAME=""
MAX_MESSAGES=0
DRY_RUN=true
CONFIRMED=false
LOG_FILE="dlq-replay-$(date +%Y%m%d-%H%M%S).log"

# Help message
show_help() {
  cat << EOF
DLQ Replay Script - Redrive messages from DLQ to main queue

Usage: $0 --env <env> --queue <queue-name> [options]

Required:
  --env ENV               Environment (dev|staging|prod)
  --queue QUEUE          Queue name suffix (e.g., image-processing-dlq)

Options:
  --max-messages N       Maximum messages to replay (0 = all, default: 0)
  --dry-run             Preview actions without executing (default)
  --confirm             Execute replay (required for actual processing)
  --help                Show this help message

Examples:
  # Dry-run replay (preview only)
  $0 --env staging --queue image-processing-dlq --dry-run

  # Replay all messages
  $0 --env staging --queue image-processing-dlq --confirm

  # Replay first 50 messages
  $0 --env staging --queue image-processing-dlq --max-messages 50 --confirm

EOF
}

# Logging function
log() {
  local level=$1
  shift
  local message="$*"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --queue)
      QUEUE_NAME="$2"
      shift 2
      ;;
    --max-messages)
      MAX_MESSAGES="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --confirm)
      CONFIRMED=true
      DRY_RUN=false
      shift
      ;;
    --help)
      show_help
      exit 0
      ;;
    *)
      echo -e "${RED}Error: Unknown option $1${NC}"
      show_help
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "${ENV}" ]]; then
  echo -e "${RED}Error: --env is required${NC}"
  show_help
  exit 1
fi

if [[ -z "${QUEUE_NAME}" ]]; then
  echo -e "${RED}Error: --queue is required${NC}"
  show_help
  exit 1
fi

# Validate environment
if [[ ! "${ENV}" =~ ^(dev|staging|prod)$ ]]; then
  echo -e "${RED}Error: Invalid environment. Must be dev, staging, or prod${NC}"
  exit 1
fi

# Safety check for production
if [[ "${ENV}" == "prod" ]] && [[ "${CONFIRMED}" == "false" ]]; then
  echo -e "${RED}Error: Production replay requires --confirm flag${NC}"
  exit 1
fi

# Construct queue names
DLQ_FULL_NAME="photoeditor-${ENV}-${QUEUE_NAME}"
MAIN_QUEUE_NAME=$(echo "${QUEUE_NAME}" | sed 's/-dlq$//')
MAIN_QUEUE_FULL_NAME="photoeditor-${ENV}-${MAIN_QUEUE_NAME}-queue"

log "INFO" "Starting DLQ replay process"
log "INFO" "Environment: ${ENV}"
log "INFO" "DLQ: ${DLQ_FULL_NAME}"
log "INFO" "Target Queue: ${MAIN_QUEUE_FULL_NAME}"
log "INFO" "Max Messages: ${MAX_MESSAGES} (0 = all)"
log "INFO" "Mode: $([ "${DRY_RUN}" == "true" ] && echo "DRY-RUN" || echo "LIVE")"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo -e "${RED}Error: AWS CLI not found. Please install aws-cli v2.x${NC}"
  exit 1
fi

# Check jq
if ! command -v jq &> /dev/null; then
  echo -e "${RED}Error: jq not found. Please install jq for JSON parsing${NC}"
  exit 1
fi

# Get queue URLs
log "INFO" "Retrieving queue URLs..."
DLQ_URL=$(aws sqs get-queue-url --queue-name "${DLQ_FULL_NAME}" --query 'QueueUrl' --output text 2>&1) || {
  log "ERROR" "Failed to get DLQ URL: ${DLQ_URL}"
  exit 1
}

MAIN_QUEUE_URL=$(aws sqs get-queue-url --queue-name "${MAIN_QUEUE_FULL_NAME}" --query 'QueueUrl' --output text 2>&1) || {
  log "ERROR" "Failed to get main queue URL: ${MAIN_QUEUE_URL}"
  exit 1
}

log "INFO" "DLQ URL: ${DLQ_URL}"
log "INFO" "Main Queue URL: ${MAIN_QUEUE_URL}"

# Get DLQ message count
log "INFO" "Checking DLQ message count..."
DLQ_ATTRS=$(aws sqs get-queue-attributes \
  --queue-url "${DLQ_URL}" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
  --output json)

TOTAL_MESSAGES=$(echo "${DLQ_ATTRS}" | jq -r '.Attributes.ApproximateNumberOfMessages')
IN_FLIGHT_MESSAGES=$(echo "${DLQ_ATTRS}" | jq -r '.Attributes.ApproximateNumberOfMessagesNotVisible')

log "INFO" "Messages in DLQ: ${TOTAL_MESSAGES}"
log "INFO" "Messages in-flight: ${IN_FLIGHT_MESSAGES}"

if [[ "${TOTAL_MESSAGES}" == "0" ]]; then
  log "INFO" "No messages to replay. Exiting."
  exit 0
fi

# Calculate target message count
TARGET_COUNT="${TOTAL_MESSAGES}"
if [[ "${MAX_MESSAGES}" -gt 0 ]] && [[ "${MAX_MESSAGES}" -lt "${TOTAL_MESSAGES}" ]]; then
  TARGET_COUNT="${MAX_MESSAGES}"
fi

log "INFO" "Target replay count: ${TARGET_COUNT}"

# Dry-run confirmation
if [[ "${DRY_RUN}" == "true" ]]; then
  echo -e "${YELLOW}"
  echo "=========================================="
  echo "DRY-RUN MODE - No changes will be made"
  echo "=========================================="
  echo "Would replay ${TARGET_COUNT} messages from:"
  echo "  DLQ: ${DLQ_FULL_NAME}"
  echo "  To:  ${MAIN_QUEUE_FULL_NAME}"
  echo ""
  echo "To execute, run with --confirm flag"
  echo -e "${NC}"
  exit 0
fi

# Live run confirmation
echo -e "${YELLOW}"
echo "=========================================="
echo "LIVE REPLAY MODE"
echo "=========================================="
echo "Will replay ${TARGET_COUNT} messages from:"
echo "  DLQ: ${DLQ_FULL_NAME}"
echo "  To:  ${MAIN_QUEUE_FULL_NAME}"
echo ""
read -p "Continue? (yes/no): " confirmation
echo -e "${NC}"

if [[ "${confirmation}" != "yes" ]]; then
  log "INFO" "Replay cancelled by user"
  exit 0
fi

# Replay loop
REPLAYED_COUNT=0
FAILED_COUNT=0
BATCH_SIZE=10

log "INFO" "Starting message replay..."

while [[ "${REPLAYED_COUNT}" -lt "${TARGET_COUNT}" ]]; do
  # Calculate batch size
  REMAINING=$((TARGET_COUNT - REPLAYED_COUNT))
  CURRENT_BATCH_SIZE=$((REMAINING < BATCH_SIZE ? REMAINING : BATCH_SIZE))

  log "INFO" "Receiving batch of ${CURRENT_BATCH_SIZE} messages (${REPLAYED_COUNT}/${TARGET_COUNT} replayed)..."

  # Receive messages
  MESSAGES=$(aws sqs receive-message \
    --queue-url "${DLQ_URL}" \
    --max-number-of-messages "${CURRENT_BATCH_SIZE}" \
    --visibility-timeout 30 \
    --attribute-names All \
    --message-attribute-names All \
    --output json)

  # Check if messages received
  MESSAGE_COUNT=$(echo "${MESSAGES}" | jq '.Messages | length')

  if [[ "${MESSAGE_COUNT}" -eq 0 ]]; then
    log "INFO" "No more messages available"
    break
  fi

  # Process each message
  for i in $(seq 0 $((MESSAGE_COUNT - 1))); do
    MESSAGE=$(echo "${MESSAGES}" | jq -r ".Messages[${i}]")
    BODY=$(echo "${MESSAGE}" | jq -r '.Body')
    RECEIPT_HANDLE=$(echo "${MESSAGE}" | jq -r '.ReceiptHandle')
    MESSAGE_ID=$(echo "${MESSAGE}" | jq -r '.MessageId')

    # Validate message body (must be valid JSON)
    if ! echo "${BODY}" | jq empty 2>/dev/null; then
      log "WARN" "Invalid JSON in message ${MESSAGE_ID}, skipping"
      ((FAILED_COUNT++))
      continue
    fi

    # Send to main queue
    SEND_RESULT=$(aws sqs send-message \
      --queue-url "${MAIN_QUEUE_URL}" \
      --message-body "${BODY}" \
      --output json 2>&1) || {
      log "ERROR" "Failed to send message ${MESSAGE_ID}: ${SEND_RESULT}"
      ((FAILED_COUNT++))
      continue
    }

    # Delete from DLQ
    DELETE_RESULT=$(aws sqs delete-message \
      --queue-url "${DLQ_URL}" \
      --receipt-handle "${RECEIPT_HANDLE}" 2>&1) || {
      log "ERROR" "Failed to delete message ${MESSAGE_ID} from DLQ: ${DELETE_RESULT}"
      log "WARN" "Message was sent to main queue but not deleted from DLQ"
      ((FAILED_COUNT++))
      continue
    }

    ((REPLAYED_COUNT++))
    log "INFO" "Replayed message ${MESSAGE_ID} (${REPLAYED_COUNT}/${TARGET_COUNT})"
  done

  # Brief pause between batches
  if [[ "${REPLAYED_COUNT}" -lt "${TARGET_COUNT}" ]]; then
    sleep 1
  fi
done

# Summary
echo -e "${GREEN}"
echo "=========================================="
echo "Replay Complete"
echo "=========================================="
echo "Total replayed: ${REPLAYED_COUNT}"
echo "Failed: ${FAILED_COUNT}"
echo "Log file: ${LOG_FILE}"
echo -e "${NC}"

log "INFO" "Replay process completed. Replayed: ${REPLAYED_COUNT}, Failed: ${FAILED_COUNT}"

# Check final DLQ count
FINAL_ATTRS=$(aws sqs get-queue-attributes \
  --queue-url "${DLQ_URL}" \
  --attribute-names ApproximateNumberOfMessages \
  --output json)

FINAL_COUNT=$(echo "${FINAL_ATTRS}" | jq -r '.Attributes.ApproximateNumberOfMessages')
log "INFO" "Messages remaining in DLQ: ${FINAL_COUNT}"

exit 0
