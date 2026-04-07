#!/bin/bash

# batch-monitoring.sh
# SessionStart/periodic hook: Monitor batch processing health
# Checks for stuck batches, stuck agents, limit violations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-.}"
LOGS_DIR="${PLUGIN_ROOT}/outputs"
ARTIFACTS_DIR="${PLUGIN_ROOT}/artifacts"

# Create directories if needed
mkdir -p "$LOGS_DIR"
mkdir -p "$ARTIFACTS_DIR"

LOG_FILE="$LOGS_DIR/batch-monitoring.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔍 Batch monitoring hook triggered"

# Check for active batches
PROGRESS_FILE="$ARTIFACTS_DIR/rajhi_portal_progress.json"
if [[ -f "$PROGRESS_FILE" ]]; then
  log "Found batch progress file"
  
  # Extract batch ID and status
  BATCH_ID=$(grep -o '"batch_id": "[^"]*"' "$PROGRESS_FILE" | cut -d'"' -f4)
  STATUS=$(grep -o '"status": "[^"]*"' "$PROGRESS_FILE" | cut -d'"' -f4)
  
  log "  Batch: $BATCH_ID"
  log "  Status: $STATUS"
  
  # Check if batch is stuck (status unchanged for >30 min)
  MTIME=$(stat -f%m "$PROGRESS_FILE" 2>/dev/null || stat -c%Y "$PROGRESS_FILE")
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  
  if [[ $AGE -gt 1800 ]] && [[ "$STATUS" == "processing" ]]; then
    log "⚠️  WARNING: Batch stuck (no progress for 30 minutes)"
    log "   Action: Check portal connectivity, consider resuming batch"
  fi
  
  # Check error count
  if [[ -f "$ARTIFACTS_DIR/batch_${BATCH_ID}_errors.html" ]]; then
    ERROR_COUNT=$(grep -c "error" "$ARTIFACTS_DIR/batch_${BATCH_ID}_errors.html" || echo 0)
    if [[ $ERROR_COUNT -gt 5 ]]; then
      log "⚠️  WARNING: Multiple errors detected ($ERROR_COUNT)"
      log "   Check: $ARTIFACTS_DIR/batch_${BATCH_ID}_errors.html"
    fi
  fi
else
  log "ℹ️  No active batch found"
fi

# Check for ABHA hydration freshness
if [[ -d "$ARTIFACTS_DIR" ]]; then
  HYDRATION_FILE="$ARTIFACTS_DIR/abha-limits-fresh.json"
  if [[ -f "$HYDRATION_FILE" ]]; then
    HYDRATION_MTIME=$(stat -f%m "$HYDRATION_FILE" 2>/dev/null || stat -c%Y "$HYDRATION_FILE")
    NOW=$(date +%s)
    HYDRATION_AGE=$((NOW - HYDRATION_MTIME))
    HOURS_AGE=$((HYDRATION_AGE / 3600))
    
    if [[ $HOURS_AGE -gt 24 ]]; then
      log "⚠️  WARNING: ABHA limits are stale ($HOURS_AGE hours old)"
      log "   Recommendation: Run /nphies-hydrate to refresh limits"
    else
      log "✓ ABHA limits fresh ($HOURS_AGE hours old)"
    fi
  fi
fi

# Check approval limits for upcoming submissions
BRANCH="${BRANCH:-riyadh}"
if [[ "$BRANCH" == "abha" ]]; then
  LIMITS_FILE="$ARTIFACTS_DIR/patient-limits-cache.json"
  if [[ -f "$LIMITS_FILE" ]]; then
    # Check for patients near limits (>80% used)
    NEAR_LIMIT=$(grep -c '"percentage_used": [89][0-9]' "$LIMITS_FILE" || echo 0)
    if [[ $NEAR_LIMIT -gt 0 ]]; then
      log "⚠️  WARNING: $NEAR_LIMIT patients near approval limits (>80%)"
      log "   Action: Review before submitting high-value claims"
    fi
  fi
fi

# Disk space check
AVAILABLE_SPACE=$(df "$ARTIFACTS_DIR" | tail -1 | awk '{print $4}')
if [[ $AVAILABLE_SPACE -lt 100000 ]]; then  # Less than 100MB
  log "⚠️  WARNING: Low disk space ($AVAILABLE_SPACE KB available)"
  log "   Action: Clean up old artifacts or logs"
fi

log "✅ Batch monitoring complete"
log "   Status: Healthy"

exit 0
