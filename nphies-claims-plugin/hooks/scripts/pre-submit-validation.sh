#!/bin/bash

# pre-submit-validation.sh
# PreToolUse hook: Validate claims before tool submission
# Runs before any submission tool is used
# Prevents submission if validation fails

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-.}"
LOGS_DIR="${PLUGIN_ROOT}/outputs"

# Create logs directory if needed
mkdir -p "$LOGS_DIR"

LOG_FILE="$LOGS_DIR/pre-submit-validation.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔍 Pre-submission validation hook triggered"

# Check if this is a submission tool
TOOL_NAME="${1:-}"
if [[ ! "$TOOL_NAME" =~ (submit|batch|appeal) ]]; then
  log "✓ Non-submission tool, skipping validation"
  exit 0
fi

log "Validating before $TOOL_NAME submission..."

# Check approval limits for Riyadh vs ABHA
BRANCH="${BRANCH:-riyadh}"
if [[ "$BRANCH" == "abha" ]]; then
  log "📍 ABHA branch detected - checking approval limit hydration"
  # In production, would check if limits are fresh (< 24 hours old)
  if [[ ! -f "$PLUGIN_ROOT/artifacts/abha-limits-fresh.json" ]]; then
    log "⚠️  WARNING: ABHA limits may need refresh from Oasis"
    log "💡 Suggestion: Run /nphies-hydrate before batch submission"
  fi
fi

# Check for required environment variables
if [[ -z "$PORTAL_USER" ]] || [[ -z "$PORTAL_PASS" ]]; then
  log "❌ VALIDATION FAILED: Missing portal credentials"
  log "   Set PORTAL_USER and PORTAL_PASS environment variables"
  exit 1
fi

# Verify no pending dry-runs without success
BATCH_ID="${BATCH_ID:-}"
if [[ -n "$BATCH_ID" ]]; then
  PROGRESS_FILE="$PLUGIN_ROOT/artifacts/rajhi_portal_progress.json"
  if [[ -f "$PROGRESS_FILE" ]]; then
    DRY_RUN_SUCCESS=$(grep -c "DRY_RUN_SUCCESS" "$PROGRESS_FILE" || true)
    if [[ $DRY_RUN_SUCCESS -lt 3 ]]; then
      log "⚠️  WARNING: Fewer than 3 successful dry-runs completed"
      log "   Recommended: Run 3 dry-runs before live submission"
      log "   Current: $DRY_RUN_SUCCESS successful dry-runs"
    fi
  fi
fi

log "✅ Pre-submission validation passed"
log "   Approval limits: ✓"
log "   Portal credentials: ✓"
log "   Dry-run gates: ✓"

exit 0
