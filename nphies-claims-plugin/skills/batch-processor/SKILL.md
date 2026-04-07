# Batch Processor Skill

## Purpose
Execute controlled batch submissions to NPHIES portal with full progress tracking, validation, and error recovery.

## When to Use This Skill
- Submitting multiple claims in a single batch
- Processing daily claim queues
- Running dry-runs before live submissions
- Batch recovery after validation failures
- When you need detailed progress and diagnostics
- Monitoring batch execution with real-time updates

## Inputs Required
The skill accepts:
- **input_file** (string): CSV file with claim data and actions
- **branch** (string): "riyadh" or "abha"
- **batch_size** (number, optional): Max claims per batch (default: 5 for Riyadh, 10 for ABHA)
- **dry_run** (boolean, optional): Default true; false for live submission
- **mode** (string, optional): "validate", "submit", "resume" (default: "validate")
- **skip_dry_runs** (number, optional): Require N successful dry-runs before live (default: 3)

## What This Skill Does

1. **Loads and validates CSV**
   - Reads claim data from input file
   - Validates required columns
   - Checks data integrity
   - Reports parsing errors

2. **Pre-submission validation**
   - Runs claim-triage for each item
   - Validates documentation
   - Checks approval limits
   - Flags items needing escalation

3. **Executes batch submission**
   - Submits in controlled batches (not all at once)
   - Tracks progress in real-time
   - Captures responses and diagnostics
   - Handles partial failures gracefully

4. **Progress monitoring**
   - Items processed vs. total
   - Success/failure rates
   - Time elapsed and estimated completion
   - Error tracking and recovery

5. **Post-submission tracking**
   - Saves results to `artifacts/rajhi_portal_progress.json`
   - Logs audit trail to `outputs/submission_audit.csv`
   - Captures submission receipts
   - Flags for follow-up if no receipt

## Outputs Provided

```javascript
{
  batchId: "BATCH-20260407-001",
  branch: "riyadh",
  dryRun: true,
  totalClaims: 43,
  batchSize: 5,
  totalBatches: 9,
  progress: {
    processed: 43,
    successful: 41,
    failed: 2,
    pending: 0,
    successRate: 95.3
  },
  timing: {
    startTime: "2026-04-07T10:30:00Z",
    endTime: "2026-04-07T10:45:00Z",
    elapsedSeconds: 900,
    averagePerItem: 21
  },
  results: {
    successful: [
      {
        claimId: "C001",
        amount: 5000,
        status: "SUBMITTED",
        receiptId: "RCP-001",
        timestamp: "2026-04-07T10:31:00Z"
      }
    ],
    failed: [
      {
        claimId: "C002",
        amount: 2500,
        status: "FAILED",
        reason: "Exceeds approval limit",
        retryable: true,
        nextSteps: ["Escalate for approval", "Resubmit"]
      }
    ]
  },
  summaryStats: {
    totalAmount: 185000,
    successfulAmount: 175500,
    failedAmount: 9500,
    averageClaimValue: 4300
  },
  nextSteps: [
    "Review 2 failed claims",
    "Fix documentation issues",
    "Retry failed batch",
    "Proceed with next batch"
  ],
  diagnostics: {
    errorLog: "Error details and stack traces",
    htmlSnapshots: ["portal_error_1.html", "portal_error_2.html"],
    portalResponses: [...]
  }
}
```

## Usage Examples

### Example 1: Validate batch before submission
```
Use batch-processor with:
  input_file: "claims_be_1_4.csv"
  branch: "riyadh"
  mode: "validate"
  dry_run: true

Result: Validation report with 43/43 claims checked, 41 ready, 2 need attention
```

### Example 2: Submit dry-run batch
```
Use batch-processor with:
  input_file: "claims_be_1_4.csv"
  branch: "riyadh"
  batch_size: 5
  dry_run: true
  mode: "submit"

Result: 43 claims submitted in 9 batches of 5, 95% success rate
```

### Example 3: Resume failed batch
```
Use batch-processor with:
  input_file: "claims_be_1_4.csv"
  branch: "riyadh"
  mode: "resume"
  skip_dry_runs: 3

Result: Resume from last checkpoint, skip already-submitted items
```

## Key Features

✓ **Controlled batch size** - Max 5 Riyadh, 10 ABHA (prevent overload)  
✓ **Progress tracking** - Real-time updates to artifacts/rajhi_portal_progress.json  
✓ **Error recovery** - Resume capability for partial batch failures  
✓ **Dry-run mandatory** - 3 successful dry-runs before live (safety gate)  
✓ **Validation pipeline** - Triage + docs + limits checked before submission  
✓ **Diagnostic capture** - HTML snapshots and error logs saved  
✓ **Audit logging** - Complete trail in outputs/submission_audit.csv  
✓ **Retryable failure detection** - Identifies which failures can be retried  

## Integration Points

This skill is used by:
- **submissions-manager agent** - Orchestrates batch workflows
- **batch-processor skill** - Entry point for batch execution
- **PostToolUse hook** - Tracks submission results
- **batch-monitoring hook** - Monitors progress and escalates
- **/nphies-submit command** - Submits batches from CLI
- **/nphies-batch command** - Run batch from CSV file

## Related Skills

- **claim-triage** - Validates each claim's recovery potential
- **doc-validation** - Checks documentation completeness
- **approval-limits** - Verifies limits before submission

## CSV Format

**Required columns:**
```
claimId,invoiceNo,amount,serviceType,patientId,providerId,rejectionCode
C001,6629884,5000,professional,P123456,PROV123,BE-1-4
C002,6629885,2500,pharmacy,P654321,PROV456,MN-1-1
```

**Optional columns:**
- documents: List of document files
- notes: Additional context
- priority: HIGH/MEDIUM/LOW
- escalationReason: Why escalation may be needed

## Batch Size Guidelines

### Riyadh (Al Rajhi)
- Default batch size: 5 items
- Maximum: 10 items per batch
- Reason: System capacity and response time
- Recommended: 1-3 batches per day

### ABHA (MOH)
- Default batch size: 10 items
- Maximum: 50 items per batch
- Reason: Higher capacity after limit hydration
- Recommended: 2-5 batches per day

## Dry-Run Requirements

Before any live submission:
1. Minimum 3 successful dry-runs required
2. All dry-runs must complete without exceeding limits
3. All dry-runs must have >90% success rate
4. Dry-run data is discarded (no impact on portal)

## Error Handling

**Retryable errors:**
- Temporary network issues
- Portal timeouts
- Rate limiting (brief wait and retry)

**Non-retryable errors:**
- Validation failures (fix and resubmit)
- Limit exceeded (escalate for approval)
- Missing documents (collect and retry)
- Invalid claim data (correct and resubmit)

## Performance Expectations

- Single claim submission: 5-15 seconds
- Batch of 5 claims: 30-75 seconds
- Batch of 10 claims: 60-150 seconds
- Dry-run overhead: +10-15% time vs. validation only

## Output Artifacts

### Progress File
- Location: `artifacts/rajhi_portal_progress.json`
- Updated: After each batch
- Contains: Current status, processed count, failures

### Audit Log
- Location: `outputs/submission_audit.csv`
- Contains: Batch ID, claim ID, amount, status, timestamp
- Format: Append-only (historical record)

### Error Diagnostics
- Location: `artifacts/batch_[BATCH_ID]_errors.html`
- Contains: Portal error pages and responses
- Useful for: Debugging submission failures

## Safety Notes

✓ Default dry-run mode (dryRun=true)  
✓ Dry-run mandatory before live (3 successful required)  
✓ No data modification, submission only  
✓ Complete audit trail maintained  
✓ Partial failures don't block batch  
✓ Failed items can be retried  
✓ All diagnostics captured for review  

## What You'll Get

When you invoke this skill, you receive:
- Batch ID and progress tracking
- Total claims processed
- Success/failure count and rate
- Detailed results for each claim
- Summary statistics (amounts, averages)
- Diagnostic information for failures
- Clear next action steps
- Audit trail reference

---

**This skill requires careful execution.** Always validate before submitting. Complete 3 successful dry-runs before live submission. Review failures before retry. Contact operator if escalation needed.
