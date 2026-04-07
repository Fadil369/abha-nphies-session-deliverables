#!/bin/bash

# post-submit-tracking.sh
# PostToolUse hook: Track and audit all submissions
# Runs after submission is complete
# Logs results to audit trail

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-.}"
LOGS_DIR="${PLUGIN_ROOT}/outputs"
ARTIFACTS_DIR="${PLUGIN_ROOT}/artifacts"

# Create directories if needed
mkdir -p "$LOGS_DIR"
mkdir -p "$ARTIFACTS_DIR"

LOG_FILE="$LOGS_DIR/post-submit-tracking.log"
AUDIT_FILE="$LOGS_DIR/submission_audit.csv"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "📊 Post-submission tracking hook triggered"

# Initialize audit CSV if needed
if [[ ! -f "$AUDIT_FILE" ]]; then
  echo "batch_id,claim_id,amount,status,timestamp,receipt_id,operator" > "$AUDIT_FILE"
  log "✓ Created audit file: $AUDIT_FILE"
fi

# Get submission details from environment
BATCH_ID="${BATCH_ID:-UNKNOWN}"
SUBMISSION_STATUS="${SUBMISSION_STATUS:-unknown}"
CLAIMS_PROCESSED="${CLAIMS_PROCESSED:-0}"
CLAIMS_SUCCESS="${CLAIMS_SUCCESS:-0}"
CLAIMS_FAILED="${CLAIMS_FAILED:-0}"

log "Batch: $BATCH_ID"
log "Status: $SUBMISSION_STATUS"
log "Processed: $CLAIMS_PROCESSED, Success: $CLAIMS_SUCCESS, Failed: $CLAIMS_FAILED"

# Calculate success rate
if [[ $CLAIMS_PROCESSED -gt 0 ]]; then
  SUCCESS_RATE=$((CLAIMS_SUCCESS * 100 / CLAIMS_PROCESSED))
  log "Success rate: $SUCCESS_RATE%"
  
  # Flag warnings for low success
  if [[ $SUCCESS_RATE -lt 80 ]]; then
    log "⚠️  WARNING: Success rate below 80%"
    log "   Check /artifacts/batch_${BATCH_ID}_errors.html for diagnostics"
  fi
fi

# Update progress file
PROGRESS_FILE="$ARTIFACTS_DIR/rajhi_portal_progress.json"
cat > "$PROGRESS_FILE" <<EOF
{
  "batch_id": "$BATCH_ID",
  "status": "$SUBMISSION_STATUS",
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "claims_processed": $CLAIMS_PROCESSED,
  "claims_success": $CLAIMS_SUCCESS,
  "claims_failed": $CLAIMS_FAILED,
  "success_rate": ${SUCCESS_RATE:-0},
  "audit_log": "$AUDIT_FILE"
}
EOF

log "✓ Updated progress file: $PROGRESS_FILE"

# Log submission to audit CSV
OPERATOR="${OPERATOR:-system}"
NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# This would be appended per claim in production
# For now, log batch summary
echo "$BATCH_ID,summary,$CLAIMS_SUCCESS,SUCCESS,$NOW,N/A,$OPERATOR" >> "$AUDIT_FILE"

log "✅ Post-submission tracking complete"
log "   Audit logged to: $AUDIT_FILE"
log "   Progress saved to: $PROGRESS_FILE"

# Check if dry-run or live
if [[ "$SUBMISSION_STATUS" == "dry-run" ]]; then
  log "ℹ️  Dry-run mode - no portal impact"
  # Check if ready for live
  DRY_RUN_FILE="$ARTIFACTS_DIR/dry-run-count.txt"
  DRY_COUNT=$(cat "$DRY_RUN_FILE" 2>/dev/null || echo 0)
  DRY_COUNT=$((DRY_COUNT + 1))
  echo $DRY_COUNT > "$DRY_RUN_FILE"
  log "   Dry-run count: $DRY_COUNT / 3 required"
else
  log "✓ Live submission tracked"
  log "   Portal receipts saved to: $PROGRESS_FILE"
fi

exit 0
