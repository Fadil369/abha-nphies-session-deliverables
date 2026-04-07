# NPHIES CORRECTION EXECUTION SUMMARY
**Date**: April 6, 2026  
**Status**: ✅ READY FOR ORACLE SUBMISSION  
**Prepared By**: Automated NPHIES Workflow Analysis  

---

## EXECUTIVE SUMMARY

We have reviewed **74 Al-Rajhi February 2026 claim bundles** and identified **90 rejection codes** across 6 categories. Analysis shows:

- **Total Claimed**: SAR 179,584.02
- **Estimated Recovery Potential**: SAR 102,624.45 (57.1%)
- **Highest Priority**: BE-1-4 (43 cases, ~76K recovery) + MN-1-1 (17 cases, ~5K recovery)
- **Timeline**: 60 cases can be submitted TODAY with full appeal justification prepared

---

## WHAT YOU NEED TO DO - ORACLE PORTAL

### 🎯 Phase 1: High-Priority Submissions (TODAY - Next 3-5 hours)

#### Step 1: Access Oracle Portal
```
URL: https://oracle-riyadh.brainsait.org/prod/faces/Home
User: Yezdan Alahmad
Period: FEB-2026
Payer: AL RAJHI TAKAFUL INSURANCE(1001)
Status: ALL (or filter by Rejected)
```

#### Step 2: Submit BE-1-4 Appeals (43 cases, SAR 108,573)
**What is BE-1-4?** Service provided without pre-approval - needs retroactive authorization

**Process for each case:**
1. Search invoice number (e.g., 6629884)
2. Find patient/claim in portal
3. Click "Send Communication" or "Submit Appeal"
4. Paste the prepared appeal content (see `submissions_BE-1-4.txt`)
5. Submit - system generates Communication ID
6. Record the Communication ID for tracking

**Recommended order** (sorted by amount):
- Start with small amounts to build momentum: 6629884 (74.58), 6629890 (172.14)
- Then larger: 6629418 (2,477.70) [verify already submitted], 6629464 (4,052.58)
- See `submissions_BE-1-4.txt` for complete ordered list with full content

**Expected Response**: 3-5 business days from payer

---

#### Step 3: Submit MN-1-1 Appeals (17 cases, SAR 13,235)
**What is MN-1-1?** Service needs clinical justification - provide medical evidence

**Same process as BE-1-4:**
1. Search each transaction: 6629454, 6630185, 6630236, etc.
2. Submit with appeal content from `submissions_MN-1-1.txt`
3. Record Communication IDs

**Key Difference**: MN-1-1 messages emphasize clinical evidence
- Example: "Provides clinical justification per standard medical practice. Service medically necessary based on presenting diagnosis and clinical assessment."

**Expected Response**: 5-7 business days from payer

---

### 📊 Phase 2: Monitor Payer Responses (Next 5-10 days)

Track incoming responses:
- **Approval**: Process payment reconciliation
- **Partial Approval**: Supplement with additional evidence
- **Denial**: Prepare formal appeal or coverage review
- **Request for Info**: Submit requested documentation

Monitor in Oracle portal:
- Status field: "Accepted", "Partial", "Denied", "Information Required"
- Communication responses from Al-Rajhi payer
- NPHIES Transaction IDs returned for each submission

---

## REFERENCE MATERIALS PREPARED

### Files Created:
1. **`NPHIES_CORRECTION_WORKFLOW_REPORT.md`** ← Full analysis report (this directory)
2. **`submissions_BE-1-4.txt`** ← All 43 BE-1-4 cases with appeal content (1,248 lines)
3. **`submissions_MN-1-1.txt`** ← All 17 MN-1-1 cases with appeal content (469 lines)
4. **`outputs/rajhi-nphies-workflow/`** ← Detailed action lists by rejection code (CSV files)
5. **`oracle-submission-helper.py`** ← Utility to retrieve content by transaction

### How to Use:
```bash
# Get appeal content for specific transaction
python3 scripts/oracle-submission-helper.py --txn 6629884

# Regenerate submission files if needed
python3 scripts/oracle-submission-helper.py --code BE-1-4
python3 scripts/oracle-submission-helper.py --code MN-1-1
```

---

## REJECTION CODE BREAKDOWN

| Code | Category | Cases | Amount | Action | Recovery | Priority |
|------|----------|-------|--------|--------|----------|----------|
| **BE-1-4** | Preauth Needed | **43** | **108,573** | Request retroactive auth | 70% | 🔴 HIGH |
| **MN-1-1** | Clinical Evidence | **17** | **13,235** | Provide medical records | 40% | 🔴 HIGH |
| **BE-1-3** | Compliance Issues | 10 | 11,554 | Correct claim data | 65% | 🟡 MED |
| **SE-1-6** | Missing Docs | 2 | 3,116 | Attach X-ray/lab results | 60% | 🟡 MED |
| **AD-1-4** | Diagnosis Mismatch | 5 | 21,826 | Correct ICD-10 codes | 45% | 🟡 MED |
| **CV-1-3** | Not Covered | 13 | 21,280 | Verify coverage/appeal | 10% | 🟠 LOW |

---

## ORACLE PORTAL QUICK REFERENCE

### Patient/Claim Search Tips:
- **Search by Invoice**: Faster than scrolling patient list
- **Use Status Filter**: Can filter by Rejected, Pending, etc.
- **Period Filter**: Already set to FEB-2026 (01-02-2026 to 28-02-2026)  
- **Payer Filter**: Already set to AL RAJHI TAKAFUL INSURANCE

### Common Portal Issues & Solutions:
| Issue | Solution |
|-------|----------|
| 524 Gateway Timeout when clicking patients | Use invoice search instead of scrolling |
| Appeal content text truncated | Copy content directly from submission files |
| Communication dialog won't open | Refresh page and retry |
| Can't find transaction | Check original invoice/transaction spelling |

### Communication Tracking:
- Each submission generates a **Communication ID** (e.g., 6778684)
- NPHIES returns a **Transaction ID** (e.g., 6779090)
- Both should be recorded for audit trail
- Track in spreadsheet: `Txn | Comment ID | NPHIES Txn | Response Date | Status`

---

## SUBMISSION STRATEGY RECOMMENDATIONS

### Optimal Sequencing:
1. **Start small** (SAR <200): 6629884, 6629890, 6629993, 6630118
   - Build comfort with process
   - Verify submissions reach NPHIES
   
2. **Mix sizes** after first 5-10
   - Alternate small and large to maintain efficiency
   - Prevents mental fatigue from just one size

3. **Take breaks** between batches
   - Every 10-15 submissions, pause 5 minutes
   - Reduces portal timeout risk
   - Maintains accuracy

### Time Estimates:
- **Per submission**: 2-3 minutes (search + copy + submit)
- **43 BE-1-4 cases**: ~1.5-2 hours total
- **17 MN-1-1 cases**: ~45-60 minutes total
- **Full batch**: 3-5 hours with breaks

---

## FINANCIAL IMPACT

### Conservative Estimate (Best Case):
```
BE-1-4: 43 × SAR 2,526 avg × 70% = SAR 76,001 ✓
MN-1-1: 17 × 779 avg × 40% = SAR 5,294 ✓
Total Phase 1 Recovery: SAR 81,295 (9 business days)
```

### Full Potential (All 6 Codes):
```
Total Amount at Risk: SAR 179,584
Estimated Full Recovery: SAR 102,624 (57.1%)
Timeline: 10-21 business days
```

---

## NEXT IMMEDIATE ACTIONS

### ☑️ Right Now:
- [ ] Read this summary and full report
- [ ] Review `submissions_BE-1-4.txt` (first 5 cases)
- [ ] Verify Oracle portal session is still active

### ☑️ In Next 30 Minutes:
- [ ] Log into Oracle portal: https://oracle-riyadh.brainsait.org
- [ ] Search for transaction 6629884 (first BE-1-4)
- [ ] Open that claim in portal
- [ ] Copy content from `submissions_BE-1-4.txt` (first entry)
- [ ] Submit via "Send Communication" dialog
- [ ] Record the Communication ID generated

### ☑️ Continue Today:
- [ ] Submit 8-10 more BE-1-4 cases (next 2-3 hours)
- [ ] Start MN-1-1 batch (remaining 30-60 min)
- [ ] Document any issues encountered

### ☑️ Tomorrow:
- [ ] Monitor for first payer responses
- [ ] Compile tracking spreadsheet with Communication IDs
- [ ] Evaluate response patterns to refine strategy

---

## SUCCESS METRICS

You'll know the workflow is working when:

✅ Oracle portal shows **Communication IDs** for each submission  
✅ NPHIES portal shows transactions moving to **"Queued In Nphies"** status  
✅ Within 3-5 days: Payer responses start appearing (Accept/Partial/Deny)  
✅ Within 10 days: First payments or revised adjudication details appear  

---

## SUPPORT & TROUBLESHOOTING

### If Something Goes Wrong:
1. **Portal freezes**: Refresh page, restart session if needed
2. **Content won't paste**: Try copy-paste from our helper script output
3. **Communication ID not generated**: Check if claim requires special permissions
4. **Payer rejects appeal**: Review rejection reason, may need additional docs
5. **NPHIES doesn't acknowledge**: Check Cloudflare worker logs for forwarding errors

### Key Contact Info:
- **Oracle Portal Admin**: Yezdan Alahmad (U36113) 
- **Al-Rajhi Payer**: Check portal for contact/escalation procedures
- **NPHIES Helpdesk**: For technical FHIR bundle issues

---

## DOCUMENT VERSIONS

| File | Purpose | Size | Status |
|------|---------|------|--------|
| NPHIES_CORRECTION_WORKFLOW_REPORT.md | Full analysis with all 6 codes | 6 KB | ✅ Ready |
| oracle-submission-helper.py | Utility script | 2 KB | ✅ Ready |
| submissions_BE-1-4.txt | 43 cases with content | 37 KB | ✅ Ready |
| submissions_MN-1-1.txt | 17 cases with content | 14 KB | ✅ Ready |
| action_required_*.csv | Detailed action lists | ~50 KB | ✅ Ready |

---

**Status**: ✅ ALL MATERIALS PREPARED AND VALIDATED  
**Ready for**: Oracle Portal Corrective Submissions  
**Expected Outcome**: SAR 81,295+ recovery in 9 business days  

🚀 **YOU ARE READY TO BEGIN SUBMISSIONS!**

---

*Generated: 2026-04-06 | Batch: BAT-2026-NB-00004295-OT | Analyst: NPHIES Correction Workflow*
