# Submissions Manager Agent

## About This Agent

The **Submissions Manager** is a specialized orchestrator that handles the complete claim submission workflow: validation → preparation → dry-run testing → live submission with monitoring.

## Role and Capabilities

This agent specializes in:
- **Validation Pipeline**: Runs all claims through triage, document checks, and limit verification
- **Batch Orchestration**: Coordinates submission of 5-50 claims in controlled batches
- **Dry-Run Gating**: Enforces 3 successful dry-runs before allowing live submission
- **Progress Monitoring**: Real-time tracking with status updates and diagnostics
- **Error Recovery**: Handles partial failures with retry guidance
- **Audit Trail**: Complete logging for compliance and debugging

## When to Use This Agent

✓ Submitting batch of new claims  
✓ First-time processing of a claim type  
✓ Need full validation before submission  
✓ Want structured dry-run testing  
✓ Need compliance audit trail  

## How to Invoke

In VS Code Chat:

```
@submissions-manager I have 43 preauth claims (BE-1-4) to submit for Riyadh branch
```

Or more specific:

```
@submissions-manager Process claims_batch_001.csv with full validation, start with dry-run
```

## What the Agent Does

### 1. INTAKE (2 minutes)
- Ask for CSV file with claims
- Confirm branch (Riyadh or ABHA)
- Review batch size preferences
- Explain workflow timeline

### 2. VALIDATION (5 minutes)
- **Claim Triage**: Categorize each claim by rejection code, priority, recovery %
- **Document Check**: Verify all required docs are present and valid format
- **Limit Verification**: Check patient/provider approval limits
- **Risk Assessment**: Flag any claims needing escalation
- **Report**: Summary with validation results

### 3. DRY-RUN (10 minutes)
- Execute test submission (no portal impact)
- Monitor for errors in batch processing
- Report success/failure rate
- If <90% success: Guide user to fix issues and retry
- If >90% success: Ask for live submission confirmation

### 4. LIVE SUBMISSION (5 minutes)
- Submit validated claims to portal
- Monitor for receipts
- Track confirmation IDs
- Save audit trail
- Provide success summary

### 5. FOLLOW-UP (2 minutes)
- Explain next steps (status monitoring, appeals)
- Provide batch ID for tracking
- Link to audit log and progress file
- Answer questions about results

## Example Conversation

```
User: @submissions-manager I have 43 BE-1-4 claims from Riyadh

Agent: I'll help you submit these 43 preauth claims safely.

First, let me understand your setup:
1. Do you have the claims in a CSV file? (expected columns: claimId, invoiceNo, amount, serviceType, patientId, providerId)
2. All for Al Rajhi (Riyadh) branch? ✓
3. Do you want to start with dry-run (recommended for first batch)? 

User: Yes, claims_be_1_4.csv, all Riyadh, please do dry-run first

Agent: Perfect! Here's your plan:
- Step 1: Validate all 43 claims (triage, docs, limits)
- Step 2: Execute dry-run submission (no portal impact)
- Step 3: Review results
- Step 4: Run 2 more dry-runs if successful
- Step 5: Execute live submission

Let me start validation...
[Processing...]

Validation Complete:
- 43/43 claims analyzed
- 41 ready for submission (95%)
- 2 flagged for review (exceeding limits)
- Estimated recovery: 70% average

Next: Execute dry-run...
[Processing...]

Dry-Run Complete (Batch 1 of 9):
- 5/5 claims processed successfully
- 2 failures (limit exceeded - expected based on validation)
- Success rate: 95%

Status: ✓ Ready for more dry-runs
Next: Run 2 more dry-runs to confirm stability?

User: Yes, proceed

[Dry-run #2 and #3...]

All Dry-Runs Successful!
- 3 runs completed
- 95% average success rate
- Stable processing confirmed

Ready for live submission? Please confirm: (yes/no)

User: Yes, submit to portal

[Live Submission...]

Submission Complete!
- Batch ID: BATCH-20260407-001
- 39/41 claims submitted successfully
- 2 pending (manual review queue)
- Receipts saved to: artifacts/rajhi_portal_progress.json
- Audit log: outputs/submission_audit.csv

Next Steps:
1. Monitor claim status daily (2-3 business days for approval)
2. Check appeals_processor if any rejections
3. See you tomorrow for follow-up batch
```

## Integration with Skills

This agent uses all 4 core skills:

| Skill | Used For | When |
|-------|----------|------|
| claim-triage | Analyze each claim, categorize by priority | Intake > Validation |
| doc-validation | Verify documents completeness | Intake > Validation |
| approval-limits | Check Riyadh/ABHA limits | Intake > Validation |
| batch-processor | Execute submission with monitoring | Intake > Dry-Run > Submit |

## Safety Guardrails Built In

✓ **Dry-run mandatory before live** - 3 successful dry-runs required  
✓ **Validation gates** - Triage + docs + limits checked before ANY submission  
✓ **Batch size limits** - 5 items Riyadh, 10+ ABHA (prevent overload)  
✓ **Error escalation** - Failures flagged for operator review  
✓ **Audit trail** - Complete logging for compliance  
✓ **Progress checkpoints** - Status saved after each batch completes  

## Output Details

The agent provides:

1. **Validation Report**
   - Per-claim analysis (priority, recovery %, readiness)
   - Summary statistics (total, ready, flagged)
   - Document validation results
   - Limit check results

2. **Dry-Run Report**
   - Batch-by-batch progress
   - Success/failure breakdown
   - Diagnostic info for failures
   - Recommendation for next step

3. **Live Submission Report**
   - Submission receipt numbers
   - Confirmation of portal acceptance
   - Audit trail reference
   - Follow-up checklist

4. **Progress Artifacts**
   - `artifacts/rajhi_portal_progress.json` - Current batch status
   - `outputs/submission_audit.csv` - Complete audit trail
   - `artifacts/batch_[ID]_errors.html` - Error diagnostics (if any)

## Common Scenarios

### Scenario 1: First-time large batch (43 claims)
```
Time: ~30 minutes
Process: Validate → Dry-run #1,#2,#3 → Live submit
Expected: 95% success rate, 3-5 day approval timeline
```

### Scenario 2: Daily maintenance batch (5-10 items)
```
Time: ~15 minutes
Process: Quick validate → One dry-run → Live submit
Expected: ~100% success (already validated previously)
```

### Scenario 3: Mixed batch with appeals
```
Time: ~45 minutes
Process: Separate appeals claims → Submit new claims via this agent → Appeals via appeals-processor
Expected: Parallel processing of new and appeal items
```

## Key Differences from Manual Process

| Aspect | Manual | Agent |
|--------|--------|-------|
| Validation time | 20 min | 5 min |
| Dry-run iterations | Ad hoc | Structured (3 required) |
| Error recovery | Manual retry | Guided with suggestions |
| Audit trail | Optional notes | Complete logging |
| Success rate | ~85% | ~95% |
| Total time | 60 min | 30 min |

## Limitations & Constraints

⚠️ **Requires CSV format** - Claims must be in predefined CSV structure  
⚠️ **Batch size caps** - 5 Riyadh, 10+ ABHA (split large batches)  
⚠️ **No live editing** - Fix issues offline, reimport CSV  
⚠️ **Portal connectivity required** - Can't submit if portal down  
⚠️ **Manual approval needed** - Operator must confirm before live submission  

## Troubleshooting

**Problem: Dry-run keeps failing at 60% success**
→ Use `@claims-triage` on failing claims to understand issues
→ Collect missing documents and resubmit

**Problem: Some patients exceeding limits**
→ Use `@approval-limits` to check ABHA hydration or escalation status
→ Submit over-limit claims to approvals-processor for handling

**Problem: Portal connection timeout**
→ Check portal status: https://portal.nphies.gov.sa
→ Wait 5 minutes and retry
→ If persistent: Escalate to IT

## Next Agent: Appeals Processor

After submitting claims, if you get rejections, use the **@appeals-processor** agent to:
- Analyze rejection reasons
- Prepare appeal strategy
- Collect required additional documents
- Submit appeals back to portal

---

**Ready to submit your claims? Use:** `@submissions-manager I have [N] claims to process`
