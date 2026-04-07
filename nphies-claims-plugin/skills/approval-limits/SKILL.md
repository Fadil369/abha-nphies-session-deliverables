# Approval Limits Skill

## Purpose
Check and validate patient/provider approval limits from the Oasis system before claim submission to ensure compliance with insurance policy thresholds.

## When to Use This Skill
- Before submitting claims to verify available approval balance
- When approaching monthly or yearly limits
- To check per-visit authorization amounts
- During batch processing to flag high-value claims
- For ABHA branch (mandatory hydration required)
- To understand why a claim was rejected for exceeding limits

## Inputs Required
The skill accepts:
- **patient_id** (string): Patient identifier
- **provider_id** (string): Provider identifier
- **service_type** (string): Type of service (pharmacy, professional, institutional)
- **claim_amount** (number): Claim amount in SAR
- **branch** (string): "riyadh" or "abha"
- **limit_type** (string, optional): "yearly", "monthly", "per_visit" (default: all)

## What This Skill Does

1. **Fetches approval limits from Oasis**
   - Yearly approval limits
   - Monthly approval limits
   - Per-visit limits
   - Service-specific limits

2. **Calculates available balance**
   - Total limit minus used amount
   - Remaining balance in SAR
   - Percentage of limit used
   - Days remaining (for monthly limits)

3. **Validates against claim amount**
   - Checks if claim fits within available balance
   - Flags if claim exceeds limits
   - Calculates overage amount

4. **Identifies related requests**
   - Previous claims in same period
   - Pending approvals
   - Recent modifications to limits

5. **Provides approval status**
   - APPROVED (sufficient balance)
   - PENDING_REVIEW (within soft limit)
   - NEEDS_APPROVAL (exceeds existing limit)
   - BLOCKED (policy or system restriction)

## Outputs Provided

```javascript
{
  patientId: "P123456",
  providerId: "PROV123",
  branch: "riyadh",
  claimAmount: 5000,
  validationStatus: "APPROVED",
  limits: {
    yearly: {
      limit: 50000,
      used: 15000,
      available: 35000,
      percentageUsed: 30,
      status: "AVAILABLE"
    },
    monthly: {
      limit: 10000,
      used: 3000,
      available: 7000,
      percentageUsed: 30,
      daysRemaining: 18,
      status: "AVAILABLE"
    },
    perVisit: {
      limit: 5000,
      current: 5000,
      status: "AT_LIMIT"
    }
  },
  claimFitsLimits: true,
  requiresApproval: false,
  requiresEscalation: false,
  priorRequests: [
    {
      claimId: "C001",
      amount: 2000,
      date: "2026-03-15",
      status: "APPROVED"
    }
  ],
  recommendations: [
    "Claim amount is within all limits",
    "Proceed with submission",
    "Expected approval within 2-3 days"
  ],
  nextSteps: [
    "Verify claim documentation",
    "Submit to NPHIES portal",
    "Monitor approval status"
  ]
}
```

## Usage Examples

### Example 1: Check limits before submission
```
Use approval-limits for:
  patient_id: "P123456"
  provider_id: "PROV123"
  service_type: "professional"
  claim_amount: 5000
  branch: "riyadh"

Result: APPROVED - Within yearly/monthly/per-visit limits
```

### Example 2: Check limits for high-value claim
```
Use approval-limits for:
  patient_id: "P654321"
  provider_id: "PROV456"
  service_type: "institutional"
  claim_amount: 25000
  branch: "abha"

Result: NEEDS_APPROVAL - Exceeds per-visit limit, escalate for approval
```

### Example 3: Hydrate ABHA limits (mandatory)
```
Use approval-limits for:
  patient_id: "P999999"
  provider_id: "ALL"
  branch: "abha"
  limit_type: "yearly"

Result: Fresh limits from Oasis, all patients/providers in ABHA scope
```

## Key Features

✓ **Real-time balance checking** - Queries Oasis system for current limits  
✓ **Multi-level limits** - Yearly, monthly, and per-visit thresholds  
✓ **Service-specific limits** - Different limits for pharmacy vs. institutional  
✓ **Branch awareness** - Different limit structures for Riyadh vs ABHA  
✓ **Prior request tracking** - Shows related claims in same period  
✓ **Automatic escalation** - Flags claims requiring special approval  
✓ **Soft/hard limits** - Distinguishes between warnings and blocks  
✓ **Remaining balance calculation** - Clear SAR amounts and percentages  

## Integration Points

This skill is used by:
- **submissions-manager agent** - Validates limits before each submission
- **batch-processor skill** - Flags high-value claims in batches
- **PreToolUse hook** - Blocks submission if limits exceeded
- **/nphies-hydrate command** - Fresh limit refresh for ABHA
- **/nphies-submit command** - Pre-submission limit check

## Related Skills

- **claim-triage** - Categorizes claims by recovery potential
- **batch-processor** - Validates limits for all claims in batch

## Limit Types

### Yearly Limits
- Maximum amount per patient per calendar year
- Resets January 1
- Service type affects limit
- Can be per-provider or aggregate

### Monthly Limits
- Maximum amount per patient per calendar month
- Resets on the 1st of each month
- More restrictive than yearly
- Used for cash flow management

### Per-Visit Limits
- Maximum amount for single service instance
- Applies regardless of date
- Service type specific
- Most restrictive limit

## Branch-Specific Limits

### Riyadh (Al Rajhi)
- Simpler approval process
- Standard yearly limits: 50,000 SAR
- Monthly limits: 10,000 SAR
- Per-visit: 5,000-10,000 SAR
- Automatic approval if within limits

### ABHA (MOH)
- Complex approval matrix
- Variable by provider/specialty
- Requires fresh hydration from Oasis
- May need escalation for high values
- Approval delays more common

## Error Handling

If Oasis is unreachable:
- Returns last cached limits with warning
- Recommends manual verification
- Escalates for operator confirmation
- Blocks live submission (dry-run OK)

If patient/provider not found:
- Returns status as UNABLE_TO_VALIDATE
- Suggests data verification
- Escalates to operator
- Blocks submission until resolved

## Performance Expectations

- Single limit check: 1-3 seconds
- Batch hydration (100 patients): 10-30 seconds
- Cache hit: <100ms
- Timeout threshold: 10 seconds

## Safety Notes

✓ Read-only access to Oasis system  
✓ No modifications to limits or balances  
✓ No automatic approvals granted  
✓ All exceeding claims flagged for review  
✓ Fresh data from Oasis on each check  
✓ Cached limits used only as fallback  

## What You'll Get

When you invoke this skill, you receive:
- Current approval limits (yearly, monthly, per-visit)
- Available balance in SAR
- Percentage of limit used
- Validation status (APPROVED/NEEDS_APPROVAL/BLOCKED)
- List of prior requests in same period
- Specific recommendations
- Next action steps
- Escalation triggers if applicable

---

**This skill is safe to use.** It queries limits only—no approvals or modifications occur. Always verify limits before high-value submissions, especially for ABHA branch.
