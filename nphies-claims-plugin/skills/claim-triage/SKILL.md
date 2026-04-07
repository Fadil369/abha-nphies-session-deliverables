# Claim Triage Skill

## Purpose
Analyze NPHIES rejection codes and categorize claims by priority level, estimated recovery percentage, and required corrective actions.

## When to Use This Skill
- You need to understand why a claim was rejected
- You want to categorize multiple rejections by priority
- You need to estimate recovery potential
- You're preparing corrective action plans
- You want to identify which documents are needed for appeals

## Inputs Required
The skill accepts:
- **rejection_code** (string): The NPHIES rejection code (e.g., "BE-1-4", "MN-1-1")
- **claim_details** (object): Claim information including:
  - claim_amount (number): Claimed amount in SAR
  - service_type (string): Type of service (pharmacy, professional, institutional)
  - patient_id (string): Patient identifier
  - invoice_no (string): Invoice number
- **branch** (string, optional): "riyadh" or "abha" (default: "riyadh")

## What This Skill Does

1. **Maps rejection code to root cause**
   - BE-1-4: Preauthorization required
   - MN-1-1: Other/contractual issue
   - Other codes: Maps to NPHIES documentation

2. **Categorizes by priority tier**
   - HIGH: 70%+ recovery potential (easy to fix)
   - MEDIUM: 40-70% recovery potential (moderate effort)
   - LOW: <40% recovery potential (complex issues)

3. **Estimates recovery percentage**
   - Based on historical success rates
   - Considers claim amount and rejection type
   - Adjusts for branch-specific factors

4. **Identifies required documents**
   - Medical records needed
   - Clinical justification
   - Policy documentation
   - Prior approval evidence

5. **Recommends next action**
   - Resubmit with supporting info
   - Communication/contractual appeal
   - New claim with prior linkage
   - Manual review required

## Outputs Provided

```javascript
{
  rejection_code: "BE-1-4",
  root_cause: "Preauthorization required",
  priority_tier: "HIGH",
  recovery_percentage: 70,
  action_required: "Resubmit with Supporting Info",
  required_documents: [
    "Medical records supporting medical necessity",
    "Clinical justification from provider",
    "Patient member information",
    "Policy preauthorization request"
  ],
  estimated_effort: "Low",
  success_rate_percent: 70,
  next_steps: [
    "Prepare clinical justification",
    "Gather medical records",
    "Submit retroactive preauthorization appeal",
    "Check status in 3-5 business days"
  ],
  appeal_message_template: "Requesting retroactive preauthorization per ART PreAuth Protocol"
}
```

## Usage Examples

### Example 1: Analyze a preauth rejection
```
Use claim-triage for:
  rejection_code: "BE-1-4"
  claim_details: {
    claim_amount: 5000,
    service_type: "professional",
    patient_id: "P123456",
    invoice_no: "6629884"
  }
  branch: "riyadh"

Result: HIGH priority, 70% recovery, needs clinical justification
```

### Example 2: Analyze a contractual issue
```
Use claim-triage for:
  rejection_code: "MN-1-1"
  claim_details: {
    claim_amount: 2500,
    service_type: "pharmacy",
    patient_id: "P789012",
    invoice_no: "6629890"
  }
  branch: "abha"

Result: MEDIUM priority, 50% recovery, needs contractual appeal
```

## Key Features

✓ **Rejection code database** - Maps all known NPHIES codes to root causes  
✓ **Priority ranking** - HIGH/MEDIUM/LOW based on recovery potential  
✓ **Document checklists** - Specific docs needed per rejection type  
✓ **Next action planning** - Clear steps to move forward  
✓ **Success rate tracking** - Historical data for each code  
✓ **Branch awareness** - Different rules for Riyadh vs ABHA  
✓ **Appeal templates** - Pre-written messages for appeals  

## Integration Points

This skill is used by:
- **submissions-manager agent** - To categorize claims before submission
- **appeals-processor agent** - To analyze rejection reasons
- **batch-processor skill** - To triage batches of claims
- **/nphies-validate command** - To explain why claim is rejected
- **/nphies-appeal command** - To prepare appeal strategy

## Related Skills

- **doc-validation** - Verify you have the required documents
- **approval-limits** - Check if claim exceeds approval limits
- **batch-processor** - Triage multiple claims at once

## Error Handling

If rejection code is unknown:
- Returns general NPHIES compliance guidelines
- Suggests manual review
- Escalates to operator

If claim details are incomplete:
- Processes with available information
- Flags missing data as gaps
- Recommends data collection

## Performance Expectations

- Single claim analysis: <1 second
- Batch of 100 claims: <5 seconds
- Ideal batch size: 10-50 claims

## Safety Notes

✓ All analysis is non-destructive (read-only)  
✓ No actual submissions made by this skill  
✓ Uses historical data and templates only  
✓ Operator must confirm before taking action  
✓ All recommendations are advisory  

## What You'll Get

When you invoke this skill, you receive:
- Root cause analysis of the rejection
- Priority tier (HIGH/MEDIUM/LOW)
- Estimated recovery percentage (0-100%)
- Required documents checklist
- Specific next action steps
- Appeal message template
- Success rate from historical data
- Effort level estimate

---

**This skill is safe to use.** It provides recommendations only—no actual submissions or changes occur. Always review recommendations before taking action.
