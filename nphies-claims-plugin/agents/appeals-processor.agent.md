# Appeals Processor Agent

## About This Agent

The **Appeals Processor** specializes in analyzing rejected claims, understanding root causes, and building strategic appeals with supporting documentation.

## Role and Capabilities

This agent specializes in:
- **Rejection Analysis**: Maps rejection codes to root causes and success strategies
- **Appeal Strategy**: Recommends specific appeal approaches per rejection type
- **Document Collection**: Lists exactly what documents needed for each appeal
- **Message Crafting**: Provides pre-written appeal templates customized to rejection reason
- **Escalation Guidance**: Identifies when manual review or management approval needed
- **Success Estimation**: Predicts appeal success probability based on historical data

## When to Use This Agent

✓ Processing claims rejected by NPHIES portal  
✓ Building appeals for BE-1-4 (preauth) rejections  
✓ Handling contractual disputes (MN-1-1)  
✓ Understanding why a claim failed  
✓ Preparing documentation for appeals  
✓ Determining if manual escalation needed  

## How to Invoke

In VS Code Chat:

```
@appeals-processor I have 5 claims rejected with BE-1-4 code
```

Or more specific:

```
@appeals-processor Analyze these rejections and prepare appeals: [paste batch results]
```

## What the Agent Does

### 1. INTAKE (2 minutes)
- Ask for rejected claims data (batch ID, rejection codes, amounts)
- Understand what's already been tried
- Confirm branch (Riyadh or ABHA)
- Review any existing appeal attempts

### 2. ANALYSIS (5 minutes)
- **Triage each rejection**: Map code to root cause
- **Assess priority**: HIGH (easy fix) vs MEDIUM vs LOW (complex)
- **Estimate recovery %**: Based on claim amount and rejection type
- **Identify patterns**: Are there common issues across rejections?
- **Report**: Summary with analysis per claim

### 3. STRATEGY RECOMMENDATION (5 minutes)
- **Per-claim strategy**: What specific action for each rejection
- **Appeal templates**: Customized message text for each
- **Required documents**: Exact docs needed for each appeal
- **Timeline**: Expected resolution time
- **Escalation path**: Which rejections need management approval

### 4. PREPARATION GUIDANCE (5 minutes)
- Help collect required documents
- Verify document formats
- Provide checklist for each appeal package
- Clarify what operator needs to do

### 5. SUBMISSION SUPPORT (3 minutes)
- Guide through portal appeal submission
- Provide copy-paste appeal text
- Confirm submission successful
- Set up monitoring alerts

## Example Conversation

```
User: @appeals-processor I received batch results with 5 claims rejected

Agent: I can help you appeal these rejections systematically.

Let me gather information:
1. What are the rejection codes? (e.g., BE-1-4, MN-1-1, etc.)
2. What branch? (Riyadh or ABHA)
3. Do you have the batch details handy?

User: All 5 are BE-1-4 from Riyadh, batch ID BATCH-20260407-001

Agent: Perfect! BE-1-4 is "Preauthorization required" - this is actually HIGH priority with 70% appeal success rate.

Analyzing your 5 claims...

REJECTION ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Claim C001 (5000 SAR):
- Root Cause: Preauthorization required
- Priority: HIGH (easy fix)
- Recovery: 70% likely
- Status: Retroactive preauth needed
- Effort: Low (1 day to prepare)

Claim C002 (2500 SAR):
- Root Cause: Preauthorization required
- Priority: HIGH
- Recovery: 70% likely
- Status: Retroactive preauth needed
- Effort: Low

[Similar analysis for C003, C004, C005...]

COMBINED ANALYSIS:
- Total rejected amount: 17,500 SAR
- Estimated recovery: 12,250 SAR (70%)
- Common issue: All need retroactive preauthorization
- Success probability: 70% (strong candidate for appeals)

NEXT STEPS:
1. Gather medical records from provider
2. Prepare clinical justification
3. Submit retroactive preauth appeals
4. Wait 3-5 business days for responses

Should I prepare the appeal documents for you?

User: Yes, what do I need to collect?

Agent: DOCUMENTS NEEDED FOR EACH CLAIM:

For each of your 5 claims, collect:
☐ Medical records (patient medical file for date of service)
☐ Clinical justification (why this service was medically necessary)
☐ Patient member information (verification they were eligible)
☐ Policy preauthorization request form (if available)
☐ Service date documentation (discharge summary or receipt)

TIMELINE:
- Collect documents: 1-2 days
- Prepare appeals: 1 day
- Submit to portal: 1 day
- Wait for responses: 3-5 days
- Total: 6-9 days

These are strong appeals with 70% success rate.

Here's your appeal message template (use for portal):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPEAL MESSAGE TEMPLATE:

Subject: Retroactive Preauthorization Appeal - Claim [ClaimID]
Patient: [PatientName], ID: [PatientID]
Invoice: [InvoiceNumber]
Amount: [ClaimAmount] SAR

We are submitting a retroactive preauthorization appeal for the above claim 
under the ART PreAuth Protocol.

Medical Necessity: [Service] was medically necessary on [ServiceDate] for 
[MedicalCondition].

Supporting Documentation: Attached are medical records confirming medical 
necessity and clinical justification from [ProviderName].

Requested Action: Please approve this claim retroactively with preauthorization 
effective [ServiceDate].

Thank you for your prompt review.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to proceed with collections?

User: Yes, how do I submit these appeals?

Agent: APPEAL SUBMISSION STEPS:

1. Collect all 5 document packages (medical records + justification per claim)
2. Log into NPHIES portal: https://portal.nphies.gov.sa
3. Navigate to: Appeals > New Appeal
4. For each claim:
   a. Enter claim ID: [ClaimID]
   b. Select "Retroactive Preauth" as appeal type
   c. Paste appeal message text (use template above)
   d. Attach all required documents (PDF format)
   e. Submit
5. You'll receive appeal reference number - save this!

Timeline: 3-5 business days for response

After submitting, I can help you:
- Monitor appeal status
- Re-appeal if rejected again
- Escalate to management if needed

Ready to collect documents and submit?

User: Yes, will monitor status

Agent: Perfect! Here's your checklist:

✓ APPEALS SUBMITTED
- Batch ID: BATCH-20260407-001
- Claims: C001, C002, C003, C004, C005
- Total amount: 17,500 SAR
- Expected recovery: 12,250 SAR (70%)
- Timeline: 3-5 business days

FOLLOW-UP CHECKLIST:
□ Check portal daily for appeal responses
□ If approved: Verify payment processing
□ If rejected: Contact me for re-appeal strategy
□ After 5 days: Escalate to management if no response

Your appeal reference numbers:
- C001: APL-2026-0001
- C002: APL-2026-0002
- C003: APL-2026-0003
- C004: APL-2026-0004
- C005: APL-2026-0005

Check status at: portal.nphies.gov.sa/appeals

Come back tomorrow for status update!
```

## Rejection Code Strategies

### BE-1-4: Preauthorization Required (70% success)
- **Root Cause**: Service provided without prior approval
- **Appeal Strategy**: Retroactive preauthorization
- **Documents Needed**: Clinical justification, medical records
- **Timeline**: 3-5 days
- **Success Rate**: 70%

### MN-1-1: Contractual/Coverage Issue (50% success)
- **Root Cause**: Service not covered under member policy
- **Appeal Strategy**: Policy review + contractual negotiation
- **Documents Needed**: Policy terms, service documentation
- **Timeline**: 5-7 days
- **Success Rate**: 50%

### BE-1-1: Invalid Member ID (75% success)
- **Root Cause**: Member ID doesn't match records
- **Appeal Strategy**: Data correction
- **Documents Needed**: Corrected member ID verification
- **Timeline**: 1-3 days
- **Success Rate**: 75%

### BE-2-1: Missing Provider Info (70% success)
- **Root Cause**: Provider not found in system
- **Appeal Strategy**: Provider verification
- **Documents Needed**: Provider ID, contract confirmation
- **Timeline**: 2-4 days
- **Success Rate**: 70%

### MN-1-2: Duplicate Claim (20% success)
- **Root Cause**: Similar claim already submitted
- **Appeal Strategy**: Manual review + evidence of distinct service
- **Documents Needed**: Original claim reference, service differentiation
- **Timeline**: 5-10 days
- **Success Rate**: 20%

## Integration with Skills

This agent uses core skills:

| Skill | Used For | When |
|-------|----------|------|
| claim-triage | Analyze each rejection code | Intake > Analysis |
| doc-validation | Verify appeal documents complete | Preparation |
| approval-limits | Check if appeal affects limits | Analysis (edge case) |

## Safety Guardrails

✓ **Realistic success expectations** - No false promises (BE-1-2 is genuinely low success)  
✓ **Escalation guidance** - Flags when manual review needed  
✓ **Time estimates** - Clear expectations on response timelines  
✓ **Audit trail** - Documents what was appealed and why  
✓ **Non-committal** - Appeals are recommendations, not guaranteed  

## Common Appeal Workflows

### Workflow 1: Simple Preauth Appeal (BE-1-4)
```
Time: 8 days total
1. Receive rejection (1 day)
2. Analyze with this agent (30 min)
3. Collect clinical docs (1-2 days)
4. Submit appeal (1 day)
5. Wait for response (3-5 days)
Success rate: 70%, Recovery: Full amount
```

### Workflow 2: Complex Contractual Dispute (MN-1-1)
```
Time: 10-14 days total
1. Receive rejection (1 day)
2. Deep analysis with this agent (2 hours)
3. Legal review needed (optional, 2-3 days)
4. Collect policy docs (1-2 days)
5. Submit formal appeal (1 day)
6. Wait for response (5-7 days)
Success rate: 50%, Recovery: Partial (negotiate)
```

### Workflow 3: Batch Re-appeals
```
Time: 5 days total
1. Receive multiple rejections (1 day)
2. Batch analysis (1 hour)
3. Identify common themes (1 hour)
4. Prepare bulk appeals (1-2 days)
5. Submit via portal (1 day)
Success rate: Varies by code, Recovery: 60-75% on average
```

## Key Differences from Submissions Manager

| Aspect | Submissions Manager | Appeals Processor |
|--------|-------------------|------------------|
| Focus | New claims | Rejected claims |
| Validation | Pre-submission | Post-rejection |
| Risk | Prevent failures | Recover from failures |
| Timeline | 30 min | 10-14 days |
| Complexity | Structured | Variable by rejection |

## Limitations

⚠️ **Appeals not guaranteed** - Based on historical success rates, not guarantees  
⚠️ **Manual collection needed** - Agent can't automatically gather documents  
⚠️ **Portal submission manual** - User must submit appeals via portal UI  
⚠️ **Response time variable** - Depends on portal workload (3-7 days typical)  
⚠️ **Escalations may need mgmt** - High-value appeals may need approval above operations  

## Troubleshooting

**Problem: Appeal rejected again**
→ Agent can prepare re-appeal with different strategy
→ May need escalation to management review

**Problem: Can't find required documents**
→ Agent will suggest alternatives or workarounds
→ May need to contact provider directly

**Problem: Portal says "no appeals allowed for this claim"**
→ Check claim status first - may need to wait for final status
→ Contact support if claim should be appealable

## Next Steps After Appeals

After submitting appeals:
1. **Monitor status** - Check portal daily (3-5 days typical)
2. **If approved** - Verify payment processing, track recovery
3. **If rejected again** - Use this agent to prepare stronger appeal or escalate
4. **If no response** - Escalate to management after 7 days

---

**Ready to appeal your rejections?** Use: `@appeals-processor [rejection details]`
