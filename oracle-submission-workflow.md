# Oracle Portal Corrective Submission Workflow
**Status**: READY FOR EXECUTION  
**Target**: Submit 60 corrective appeals (BE-1-4 High-Priority Cases + MN-1-1 Clinical Justification)

## Current Portal State
- **Portal**: Oracle Riyadh (brainsait.org)
- **User**: Yezdan Alahmad (U36113)
- **Session**: ACTIVE ✓
- **Batch**: FEB-2026 | AL RAJHI | Period: 01-02-2026 to 28-02-2026

## Immediate Next Steps

### 1. Clear Invoice Search Field and Enter First Case
**Transaction**: 6629884 (BE-1-4 - Pharmacy/Medication, SAR 74.58)
```
Invoice Field → Clear current value → Type: 6629884 → Press Enter
```

### 2. Retrieve Appeal Content
```bash
cd /Users/fadil369/abha-nphies-session-deliverables-1
python3 -c "
import json
with open('artifacts/rajhi_portal_data.json') as f:
    data = json.load(f)
    for item in data:
        if item['InvoiceNo'] == '6629884':
            print('=== APPEAL CONTENT FOR 6629884 ===')
            print(item['Content'])
            break
"
```

### 3. Submit Communication
- Find patient in left panel (filtered by invoice 6629884)
- Locate the claim row in main grid
- Click "Submit" or "Send Communication"
- Paste appeal content
- Click "Submit"
- **Record Communication ID** generated for tracking

### 4. Repeat for Next Cases
Continue with:
- 6629890 (SAR 172.14)
- 6629993 (SAR 172.14)
- 6630118 (SAR 67.20)
- 6630478 (SAR 36.15)
- 6630506 (SAR 67.20)
- 6629418 (SAR 2,477.70) - ALREADY SUBMITTED, verify
- 6629428 (SAR 2,465.88)
- ... (43 total BE-1-4 cases)

## Quality Checks
- [ ] Each submission includes full re-adjudication text (not truncated)
- [ ] Communication ID is captured and logged
- [ ] Status changes to "Queued In Nphies" after submission
- [ ] No 524 timeouts or session interruptions

## Expected Timeline
- BE-1-4 batch (43 cases): 2-3 hours (8-10 submissions per hour)
- MN-1-1 batch (17 cases): 1-2 hours
- **Total**: 3-5 hours for initial submissions

## Payer Response Monitoring
After submissions, monitor:
- **BE-1-4**: 3-5 business days for response
- **MN-1-1**: 5-7 business days for response

Track responses in:
- Portal Status field (Accepted/Rejected/Partial)
- NPHIES Communication responses
- Payment reconciliation

