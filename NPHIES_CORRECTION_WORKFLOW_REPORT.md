# NPHIES Rejection Corrective Workflow - Executive Report
**Generated**: April 6, 2026  
**Batch**: BAT-2026-NB-00004295-OT  
**Analysis Status**: COMPLETE ✓

---

## 1. NPHIES REJECTION ANALYSIS SUMMARY

### Overall Metrics
- **Total Cases Reviewed**: 74 bundles (90 rejection codes across multiple lines)
- **Total Claimed Amount**: SAR 179,584.02
- **Estimated Recovery Potential**: SAR 102,624.45 (57.1%)
- **Rejection Code Categories**: 6 distinct codes identified

---

## 2. REJECTION BREAKDOWN & CORRECTIVE ACTIONS

### 🔴 HIGH PRIORITY (70+% Recovery Potential)

#### [BE-1-4] PREAUTHORIZATION REQUIRED
**Cases**: 43 | **Amount**: SAR 108,572.72 | **Recovery Rate**: 70%  
**Estimated Recovery**: SAR 76,000.90

**What This Means:**
- Service was provided without pre-approval from payer
- Payer requires retroactive preauthorization to process claim

**Corrective Action - ORACLE PORTAL:**
1. Search for each transaction (e.g., 6629884, 6629890, 6629993, etc.)
2. Submit re-adjudication appeal with:
   - Full service details and clinical justification
   - Medical records supporting medical necessity
   - Policy and patient member information
3. Message to include: "Requesting retroactive preauthorization per ART PreAuth Protocol"

**Expected Payer Response Time**: 3-5 business days  
**Next Steps if Approved**: Process payment  
**Next Steps if Denied**: Investigate coverage limits or appeal process

**Sample Cases Ready for Submission:**
- Txn 6629884: SAR 74.58 (Pharmacy - Medication)
- Txn 6629890: SAR 172.14 (Pharmacy - Medication)
- Txn 6629418: SAR 2,477.70 (Professional - Consultation) [ALREADY SUBMITTED]
- Txn 6629464: SAR 4,052.58 (Professional - Consultation)
- Txn 6629613: SAR 3,548.72 (Professional - Consultation)

**See**: `outputs/rajhi-nphies-workflow/action_required_BE-1-4.csv` for complete list

---

#### [MN-1-1] CLINICAL JUSTIFICATION REQUIRED
**Cases**: 17 | **Amount**: SAR 13,235.47 | **Recovery Rate**: 40%  
**Estimated Recovery**: SAR 5,294.19

**What This Means:**
- Payer questions clinical appropriateness of service
- Requires clinical evidence that service was medically necessary

**Corrective Action - ORACLE PORTAL:**
1. Search for each transaction (e.g., 6629454, 6630185, 6630236, etc.)
2. Submit re-adjudication appeal with:
   - Medical records and clinical documentation
   - ICD-10 diagnosis codes supporting medical necessity
   - Clinical notes explaining why service was required
   - Lab/investigation results if applicable
3. Message to include: "Provides clinical justification per standard medical practice. Service medically necessary based on presenting diagnosis and clinical assessment."

**Expected Payer Response Time**: 5-7 business days  
**Next Steps if Approved**: Process payment  
**Next Steps if Denied**: May require additional specialist evidence or formal appeal

**Sample Cases Ready for Submission:**
- Txn 6629454: SAR 68.10 (Professional - Consultation)
- Txn 6630185: SAR 140.40 (Professional - Consultation)
- Txn 6630236: SAR 363.55 (Professional - Consultation)
- Txn 6630350: SAR 208.32 (Professional - Consultation)

**See**: `outputs/rajhi-nphies-workflow/action_required_MN-1-1.csv` for complete list

---

### 🟡 MEDIUM PRIORITY (45-65% Recovery Potential)

#### [BE-1-3] SUBMISSION NON-COMPLIANT
**Cases**: 10 | **Amount**: SAR 11,553.82 | **Recovery Rate**: 65%  
**Estimated Recovery**: SAR 7,509.98

**What This Means**: Claim has formatting/data compliance issues with coverage agreement

**Action**: Correct claim data (service codes, amounts, patient info) and resubmit

---

#### [SE-1-6] INVESTIGATION RESULTS MISSING
**Cases**: 2 | **Amount**: SAR 3,116.40 | **Recovery Rate**: 60%  
**Estimated Recovery**: SAR 1,869.84

**What This Means**: X-ray or lab investigation results referenced but not attached

**Action**: Retrieve and attach X-ray images or lab test results from Oracle system

---

#### [AD-1-4] DIAGNOSIS CODE MISMATCH  
**Cases**: 5 | **Amount**: SAR 21,825.65 | **Recovery Rate**: 45%  
**Estimated Recovery**: SAR 9,821.54

**What This Means**: ICD-10 diagnosis codes don't match treatment provided

**Action**: Correct diagnosis codes in medical records and resubmit

---

### 🟠 LOWER PRIORITY (10% Recovery Potential)

#### [CV-1-3] SERVICE NOT COVERED
**Cases**: 13 | **Amount**: SAR 21,279.96 | **Recovery Rate**: 10%  
**Estimated Recovery**: SAR 2,128.00

**What This Means**: Service is outside member's coverage under current policy

**Action**: Verify benefit coverage or explore alternative service codes

---

## 3. ORACLE PORTAL SUBMISSION WORKFLOW

### Step-by-Step Process

**For each transaction in the corrective action lists:**

1. **Search Transaction**
   - Go to Claims Submission screen
   - Enter Invoice number in search field (e.g., 6629884)
   - Select Status filter if needed
   - Press Enter to search

2. **Select Patient/Claim**
   - Click on the patient row in left panel
   - Select the claim row in main panel
   - Verify transaction details

3. **Open Communication Dialog**
   - Click "Actions" dropdown
   - Select "Send Communication" or similar
   - Verify the communication ID is generated

4. **Enter Appeal Content**
   - Use the re-adjudication text prepared in portal data
   - Fill in appeal reason based on rejection code:
     - **BE-1-4**: "Requesting retroactive preauthorization..."
     - **MN-1-1**: "Provides clinical justification..."
   - Attach relevant documents

5. **Submit Communication**
   - Click "Submit" button
   - Wait for NPHIES acknowledgment
   - Track communication ID returned

6. **Track Response**
   - Record communication ID for follow-up
   - Monitor for NPHIES response (3-7 days)
   - Check "Queued In Nphies" status

---

## 4. RECOMMENDED SUBMISSION SEQUENCE

### Phase 1: HIGH PRIORITY (Start Immediately)
1. **BE-1-4 Claims (43 cases)**
   - Start with cases 6629884, 6629890, 6629993, 6630118...
   - Batch submit 5-10 per session to avoid portal timeouts
   - Expected timeline: 2-3 days to submit all

2. **MN-1-1 Claims (17 cases)**
   - Submit after first batch of BE-1-4
   - Start with cases 6629454, 6630185, 6630236...
   - Expected timeline: 1 day

### Phase 2: MEDIUM PRIORITY (After High Priority Responses)
- Monitor BE-1-4 and MN-1-1 payer responses
- Based on approval/denial patterns, proceed with BE-1-3, SE-1-6, AD-1-4

### Phase 3: LOWER PRIORITY (Coverage Issues)
- CV-1-3 cases require investigation of coverage rules
- May require management escalation or coverage verification

---

## 5. FINANCIAL IMPACT SUMMARY

| Category | Cases | Amount | Recovery % | Est. Recovery | Timeline |
|----------|-------|--------|------------|---------------|----------|
| **BE-1-4** | 43 | SAR 108,573 | 70% | SAR 76,001 | 3-5 days |
| **MN-1-1** | 17 | SAR 13,235 | 40% | SAR 5,294 | 5-7 days |
| **BE-1-3** | 10 | SAR 11,554 | 65% | SAR 7,510 | 2-4 days |
| **SE-1-6** | 2 | SAR 3,116 | 60% | SAR 1,870 | 2-3 days |
| **AD-1-4** | 5 | SAR 21,826 | 45% | SAR 9,821 | 3-5 days |
| **CV-1-3** | 13 | SAR 21,280 | 10% | SAR 2,128 | 5-10 days |
| **TOTAL** | **90** | **SAR 179,584** | **57.1%** | **SAR 102,624** | **Up to 10 days** |

**Key Insight**: Focusing on BE-1-4 and MN-1-1 cases (60 total) will recover ~SAR 81,295 (71% of total recovery potential) in just 5-7 days.

---

## 6. NPHIES INTEGRATION NOTES

### How Appeals Reach NPHIES
1. **Oracle Portal** → Message submitted via "Send Communication"
2. **Cloudflare Worker** (brainsait-portals) → Relays every 5 minutes
3. **NPHIES HSB Endpoint** → Receives CommunicationRequest FHIR bundle
4. **Al-Rajhi Payer** → Reviews and responds with claim adjudication

### Tracking Communications
- Each submission generates a **Communication ID**
- NPHIES returns **TransactionID** (e.g., 6779090)
- Monitor `FinalStatus` field in portal for responses

### Known Issues & Solutions
- **Payload Truncation**: Full appeal text sometimes shows as claim ID only in NPHIES
  - **Action**: Verify content is transmitted correctly by checking Oracle logs
  - **Workaround**: Include full justification in first submission message
  
- **Portal Timeouts**: Large patient grid can cause 524 errors
  - **Action**: Use invoice search instead of scrolling patient list
  - **Workaround**: Session may need refresh after 10+ submissions

---

## 7. NEXT IMMEDIATE ACTIONS

**TODAY:**
- [ ] Review this corrective action report
- [ ] Confirm Oracle portal login is still active
- [ ] Start BE-1-4 submissions: Cases 6629884, 6629890, 6629993
  
**TOMORROW:**
- [ ] Continue BE-1-4 batch submissions
- [ ] Begin MN-1-1 submissions
- [ ] Monitor for first NPHIES responses

**WEEK 2:**
- [ ] Evaluate payer response patterns
- [ ] Proceed with BE-1-3/SE-1-6 based on priority
- [ ] Prepare escalation for CV-1-3 coverage issues if needed

---

## 8. REFERENCE FILES

**Corrective Action Details:**
- `outputs/rajhi-nphies-workflow/action_required_BE-1-4.csv` - Preauth cases (43)
- `outputs/rajhi-nphies-workflow/action_required_MN-1-1.csv` - Clinical cases (17)
- `outputs/rajhi-nphies-workflow/action_required_BE-1-3.csv` - Compliance cases (10)
- `outputs/rajhi-nphies-workflow/action_required_SE-1-6.csv` - Doc missing (2)
- `outputs/rajhi-nphies-workflow/action_required_AD-1-4.csv` - Diagnosis (5)
- `outputs/rajhi-nphies-workflow/action_required_CV-1-3.csv` - Not covered (13)

**Portal Data:**
- `artifacts/rajhi_portal_data.json` - Full submission queue with re-adjudication text

**Oracle Portal Access:**
- URL: `https://oracle-riyadh.brainsait.org/prod/faces/Home`
- User: Yezdan Alahmad (U36113)
- Batch: AL RAJHI TAKAFUL (1001) - February 2026

---

**Status**: READY FOR ORACLE PORTAL EXECUTION ✓  
**Risk Level**: LOW (using pre-prepared appeals with clinical justification)  
**Expected Batch Recovery**: SAR 102,624 (42 Sar 13,235 claimed amount)
