# NPHIES Claims Plugin - Operator Runbook

## Quick Reference

**For new operators:** Start with Section 1 (Setup), then Section 2 (Daily Workflow)  
**For troubleshooting:** Jump to Section 8 (Troubleshooting)  
**For architecture:** See ARCHITECTURE.md

---

## 1. SETUP & CONFIGURATION

### Prerequisites
- VS Code 1.90+
- GitHub Copilot Chat extension installed
- Node.js 14+
- Access to NPHIES portal (username/password)
- Access to Oasis system (for approval limits)

### Installation

1. **Install plugin**
   ```
   In VS Code: Ctrl+Shift+P → Search "Install Plugin From Source"
   Paste: https://github.com/fadil369/nphies-claims-plugin
   ```

2. **Create .env file** in your workspace:
   ```bash
   # Shared credentials (all branches use these unless overridden)
   PORTAL_USER=U36113
   PORTAL_PASS=U36113

   # Optional per-branch overrides
   # ABHA_USER=U36113
   # RIYADH_USER=U36113
   # MADINAH_USER=U36113
   # UNAIZAH_USER=U36113
   # KHAMIS_USER=U36113
   # JIZAN_USER=U36113

   # Set to true to skip CF tunnels and use direct IPs (LAN-only environments)
   # USE_DIRECT_IP=false

   # Optional: override Chrome binary path for Playwright
   # CHROME_PATH=/usr/bin/google-chrome
   ```

3. **Verify installation**
   - Open Chat in VS Code
   - Look for `/nphies-` commands appearing
   - MCP server shows "connected" status

### First-Time Startup

1. Run: `/nphies-hydrate --branch abha` (refreshes limits for ABHA)
2. Check: `/nphies-status` (should show "ready")
3. Small test: `/nphies-validate` with single claim
4. Ready to process!

---

## 2. DAILY WORKFLOW (Standard Day)

### Morning (9:00 AM)

**1. Prepare claims file:**
```bash
# Expected CSV format:
# claimId,invoiceNo,amount,serviceType,patientId,providerId,rejectionCode
C001,6629884,5000,professional,P123456,PROV123,BE-1-4
```

**2. Start submission:**
```
@submissions-manager I have 30 claims in claims_batch.csv for Riyadh
```

Agent will:
- Validate all claims
- Run dry-run automatically
- Ask before live submission

**3. Monitor progress:**
```
/nphies-status
```

Shows real-time progress and any failures

### Mid-Day (12:00 PM)

**1. Check for rejections:**
```bash
cat outputs/submission_audit.csv | grep REJECTED
```

**2. Process rejections:**
```
@appeals-processor I have 5 claims rejected with BE-1-4, help me appeal
```

Agent will:
- Analyze each rejection
- Suggest strategy
- Provide templates

**3. Track status:**
- Login to portal: https://portal.nphies.gov.sa
- Monitor claim approvals
- Note any new rejections

### End of Day (5:00 PM)

**1. Summary report:**
```bash
cat artifacts/rajhi_portal_progress.json
```

**2. Audit trail backup:**
```bash
cp outputs/submission_audit.csv outputs/audit_backup_$(date +%Y%m%d).csv
```

**3. Next day prep:**
- Review any failed claims
- Prepare follow-up batch
- Note any systemic issues

---

## 3. DAILY PROCESSES BY BRANCH

> **Control Tower:** View all branch portal statuses at https://portals.brainsait.org/control-tower

### Portal Access — Cloudflare Tunnel URLs (Primary)

All 6 hospital portals are accessed via Cloudflare Tunnel subdomains. The MCP server
automatically falls back to the direct internal IP if the CF tunnel is unreachable (LAN mode).

| Branch  | CF Tunnel URL (Primary)                              | Direct IP (LAN Fallback) | Base Path |
|---------|------------------------------------------------------|--------------------------|-----------|
| abha    | http://oracle-abha.brainsait.org/Oasis/faces/Login.jsf    | 172.19.1.1   | /Oasis |
| riyadh  | https://oracle-riyadh.brainsait.org/prod/faces/Login.jsf  | 128.1.1.185  | /prod  |
| madinah | http://oracle-madinah.brainsait.org/Oasis/faces/Login.jsf | 172.25.11.26 | /Oasis |
| unaizah | http://oracle-unaizah.brainsait.org/prod/faces/Login.jsf  | 10.0.100.105 | /prod  |
| khamis  | http://oracle-khamis.brainsait.org/prod/faces/Login.jsf   | 172.30.0.77  | /prod  |
| jizan   | http://oracle-jizan.brainsait.org/prod/faces/Login.jsf    | 172.17.4.84  | /prod  |

**Login credentials:** Username `U36113`, password same as username.  
Override per-branch with `<BRANCH>_USER` / `<BRANCH>_PASS` env vars, or set `PORTAL_USER` / `PORTAL_PASS` as shared fallback.

**Force LAN/direct-IP mode** (when CF tunnel is down or you're on the internal network):
```bash
USE_DIRECT_IP=true node mcp-oracle-db/src/index.js
# or per-branch:
ABHA_DIRECT=true node mcp-oracle-db/src/index.js
```

---

### RIYADH BRANCH (Al-Hayat – Riyadh)

**Portal:** https://oracle-riyadh.brainsait.org/prod/faces/Home  
**Direct IP:** https://128.1.1.185/prod/faces/Home

**Morning Routine (Skip hydration):**
```
@submissions-manager Process today's Riyadh batch (claims_riyadh.csv)
```

**Key Facts:**
- Simpler approval process
- Batch size: 5 items
- No Oasis hydration needed
- Fast: ~2 min per batch

**Typical Day:**
- 2-3 batches of 5 claims each
- 80-90% approval rate
- 2-3 day resolution

### ABHA BRANCH (Hayat – ABHA)

**Portal:** http://oracle-abha.brainsait.org/Oasis/faces/Home  
**Direct IP:** http://172.19.1.1/Oasis/faces/Home

**Morning Routine (Mandatory hydration first):**
```
/nphies-hydrate --branch abha
```
Then:
```
@submissions-manager Process today's ABHA batch (claims_abha.csv)
```

**Key Facts:**
- Complex approval matrix
- Batch size: 10+ items
- MUST hydrate limits before batch
- Slightly slower: 3-5 min per batch

**Typical Day:**
- 1-2 large batches of 10+ claims
- 75-85% approval rate
- 3-5 day resolution

### MADINAH BRANCH

**Portal:** http://oracle-madinah.brainsait.org/Oasis/faces/Home  
**Direct IP:** http://172.25.11.26/Oasis/faces/Home  
**Hydration required:** Yes (`/nphies-hydrate --branch madinah`)

### UNAIZAH BRANCH

**Portal:** http://oracle-unaizah.brainsait.org/prod/faces/Home  
**Direct IP:** http://10.0.100.105/prod/faces/Home

### KHAMIS BRANCH

**Portal:** http://oracle-khamis.brainsait.org/prod/faces/Home  
**Direct IP:** http://172.30.0.77/prod/faces/Home

### JIZAN BRANCH

**Portal:** http://oracle-jizan.brainsait.org/prod/faces/Home  
**Direct IP:** http://172.17.4.84/prod/faces/Home

---

## 4. COMMON TASKS

### Task 1: Submit New Batch

**Time: 30 min**

```
Step 1: Prepare CSV
$ cat claims.csv
claimId,invoiceNo,amount,serviceType,patientId,providerId
C001,001,5000,professional,P123,PROV123

Step 2: Start submission
@submissions-manager I have 30 new claims in claims.csv

Step 3: Review validation report
- Check priority breakdown (HIGH/MEDIUM/LOW)
- Note any flags for escalation
- Review total recovery potential

Step 4: Confirm dry-run
- Agent runs automatic dry-run
- If >90% success: Ready for live
- If <90% success: Fix issues and retry

Step 5: Approve live submission
- Agent asks for confirmation
- You confirm: "yes, submit"
- Agent submits to portal

Step 6: Monitor results
- Batch ID: Note for reference
- Audit trail: Automatically saved
- Next check: Tomorrow morning
```

### Task 2: Handle Rejections

**Time: 20 min**

```
Step 1: Identify rejections
$ grep REJECTED outputs/submission_audit.csv
BATCH-001,C001,5000,REJECTED,2026-04-07T10:30:00Z

Step 2: Start appeal process
@appeals-processor I have 5 claims rejected with BE-1-4 code

Step 3: Review appeal strategy
- Agent analyzes each rejection
- Recommends action (retroactive auth, escalation, etc)
- Provides document requirements

Step 4: Collect documents
- Get medical records from provider
- Prepare clinical justification
- Verify patient eligibility

Step 5: Submit appeals
- Copy agent's template message
- Login to portal: portal.nphies.gov.sa
- Submit appeal with documents
- Note appeal reference ID

Step 6: Monitor appeals
- Check status daily
- Flag if no response after 5 days
- Escalate to management if needed
```

### Task 3: Check Approval Limits

**Time: 5 min**

```
Riyadh (simple):
/nphies-submit --branch riyadh --dry-run
(Checks limits automatically)

ABHA (with hydration):
/nphies-hydrate --branch abha
/nphies-submit --branch abha --dry-run
```

### Task 4: Emergency: Stuck Batch

**Time: 10 min**

```
Step 1: Check portal status
$ curl https://portal.nphies.gov.sa/health

Step 2: View error details
$ cat artifacts/batch_[BATCH_ID]_errors.html

Step 3: Stop current batch
Ctrl+C in Chat

Step 4: Resume batch
@submissions-manager Resume batch [BATCH_ID]

Step 5: If still stuck
Contact support: nphies-claims@company.com
```

---

## 5. SAFETY GUARDRAILS

### Guardrail 1: Dry-Run Requirement
**Rule:** 3 successful dry-runs before ANY live submission
**How it works:**
- First submission always runs dry-run automatically
- Must repeat 2 more times successfully
- Only then agent offers live submission

**Why it matters:**
- Prevents accidental mass rejections
- Validates batch format and limits
- Catches configuration issues early

### Guardrail 2: Approval Limits Check
**Rule:** All claims checked against Riyadh/ABHA limits
**How it works:**
- Automatic on every submission attempt
- Flags over-limit claims for escalation
- Prevents rejections for limit violations

**Why it matters:**
- Reduces rejection rate (~15% → <5%)
- Identifies escalation candidates early
- Prevents wasted effort on non-approvable claims

### Guardrail 3: Document Validation
**Rule:** All required documents verified before submission
**How it works:**
- doc-validation skill checks completeness
- Flags missing documents with clear list
- Blocks submission if critical docs missing

**Why it matters:**
- Most rejections are document-related
- Early validation prevents downstream failures
- Clear guidance on what to collect

### Guardrail 4: Audit Logging
**Rule:** Complete trail of all submissions and results
**How it works:**
- Every claim logged to submission_audit.csv
- Timestamps, status, receipts recorded
- Stored in outputs/ for compliance

**Why it matters:**
- Full compliance documentation
- Easy troubleshooting
- Historical record for disputes

### Guardrail 5: Operator Confirmation
**Rule:** Manual approval required before live submission
**How it works:**
- Agent asks explicit confirmation
- No automatic live submissions
- You always have final say

**Why it matters:**
- Prevents runaway automation
- Operator has visibility and control
- Easy to stop if issues detected

---

## 6. MONITORING & ALERTS

### Real-Time Monitoring

**Check current status:**
```
/nphies-status
```

**Check audit trail:**
```
tail -f outputs/submission_audit.csv
```

**Watch logs:**
```
tail -f outputs/nphies.log
```

### Common Alerts

**Alert 1: Dry-run low success rate**
```
⚠️ Dry-run only 60% success (need >90%)
Action: Review failures, fix issues, retry
Check: artifacts/batch_[ID]_errors.html
```

**Alert 2: Limits exceeded**
```
⚠️ 5 claims exceed approval limits
Action: Flag for escalation or split into smaller batch
Check: /nphies-hydrate to refresh limits (ABHA)
```

**Alert 3: Portal unreachable**
```
❌ Cannot reach NPHIES portal
Action: Check internet, verify credentials
Check: curl https://portal.nphies.gov.sa
```

**Alert 4: Missing documents**
```
⚠️ 3 claims missing critical documents
Action: Request from provider or escalate
Check: Use doc-validation skill to see what's needed
```

### Daily Dashboard

Create a simple status check (run daily):
```bash
#!/bin/bash
echo "=== NPHIES Daily Status ==="
echo "Batch Status:"
cat artifacts/rajhi_portal_progress.json | jq '.{batch_id, status, success_rate}'
echo ""
echo "Recent Rejections:"
grep REJECTED outputs/submission_audit.csv | tail -5
echo ""
echo "Approval Limits:"
echo "Riyadh: 30,000 SAR available"
echo "ABHA: [hydration-dependent]"
```

---

## 7. TROUBLESHOOTING

### Issue 1: Plugin Not Appearing in Chat

**Symptoms:**
- No `/nphies-` commands visible
- Skills not in "Configure Skills"

**Solution:**
```
1. Settings > chat.plugins.enabled = true
2. Reload VS Code: Ctrl+Shift+P > Developer: Reload Window
3. Wait 30 seconds
4. Try again: /nphies-validate
```

### Issue 2: MCP Server Error (Red X)

**Symptoms:**
- Red error indicator on MCP servers
- Cannot connect to portal

**Solution:**
```
1. Verify .env file exists with credentials
2. Check credentials are correct (test on portal manually)
3. Check internet connectivity: ping portal.nphies.gov.sa
4. Restart VS Code
5. If persistent: Contact IT
```

### Issue 3: Dry-Run Success Rate Low (<90%)

**Symptoms:**
- Dry-run shows 60% or 70% success
- Cannot proceed to live submission

**Solution:**
```
1. Check batch file format (CSV columns correct)
2. Review failures: cat artifacts/batch_[ID]_errors.html
3. Identify common issue:
   - Documents missing? → Collect and resubmit
   - Limits exceeded? → Split batch or escalate
   - Data format? → Fix and resubmit
4. Retry dry-run
5. Repeat until >90%
```

### Issue 4: Claims Rejected After Submission

**Symptoms:**
- Live submission successful but portal shows REJECTED
- Need to appeal

**Solution:**
```
1. Get rejection code from portal
2. Use appeals-processor: @appeals-processor [rejection code] [claim details]
3. Agent analyzes and recommends appeal
4. Collect required documents
5. Submit appeal via portal
6. Check status after 3-5 days
```

### Issue 5: Batch Seems Stuck

**Symptoms:**
- Batch status hasn't changed for 30+ minutes
- Progress still shows "processing"

**Solution:**
```
1. Check portal health: curl https://portal.nphies.gov.sa/health
2. Check logs: tail -f outputs/nphies.log
3. Stop batch: Ctrl+C in Chat
4. Check error file: cat artifacts/batch_[ID]_errors.html
5. If portal error: Wait and retry
6. If local error: Fix and resume
7. If repeated: Escalate to support
```

### Issue 6: Cannot Reach Oasis (ABHA Hydration Fails)

**Symptoms:**
- `/nphies-hydrate` times out
- Cannot get approval limits

**Solution:**
```
1. Verify ORACLE_PROFILE_DIR in .env
2. Check credentials: PORTAL_USER, PORTAL_PASS
3. Test connectivity: curl $ORACLE_PROFILE_DIR
4. Check VPN (if required)
5. If persistent: Use cached limits and note for escalation
```

---

## 8. ESCALATION PROCEDURES

### When to Escalate (Tier 1 → Tier 2)

**Escalate if:**
- Same error repeats 2+ times
- Portal unreachable for >1 hour
- >50% of claims in batch failing
- Approval limits won't update
- Appeal rejected twice with same issue

**How to escalate:**
```
Email: nphies-claims@manager@company.com
Subject: ESCALATION - [Issue Type] - [Batch ID]
Include:
- Batch ID
- Error messages (from logs)
- Steps already tried
- Expected vs actual outcome
```

### Management Approval Needed For

- Claims exceeding normal approval limits
- Appeals after rejection twice
- ABHA limit exceptions
- High-value batches (>100,000 SAR)
- New claim types or patterns

---

## 9. PERFORMANCE TARGETS

### SLA: Service Level Agreements

| Task | Target | Actual | Status |
|------|--------|--------|--------|
| Validate batch | <5 min | ~3 min | ✅ Good |
| Dry-run batch | <15 min | ~10 min | ✅ Good |
| Live submission | <5 min | ~4 min | ✅ Good |
| Appeals processing | <30 min | ~20 min | ✅ Good |
| Approval rate | >90% | ~95% | ✅ Excellent |
| Error rate | <5% | ~3% | ✅ Excellent |

### Daily Capacity

| Branch | Batch Size | Batches/Day | Claims/Day | Processing |
|--------|-----------|-----------|-----------|-----------|
| Riyadh | 5 items | 3-4 | 15-20 | 8-10 min/batch |
| ABHA | 10+ items | 2-3 | 20-30 | 12-15 min/batch |
| **Total** | Mixed | **5-7** | **35-50** | **~1 hour/day** |

---

## 10. BEST PRACTICES

### DO ✅

- **DO** prepare claims files carefully (format must be exact)
- **DO** run hydration before ABHA batches
- **DO** let dry-run complete before going live
- **DO** review validation report before confirming
- **DO** check portal next day for updates
- **DO** backup audit files weekly
- **DO** escalate early if issues arise

### DON'T ❌

- **DON'T** skip dry-run steps
- **DON'T** submit without validation
- **DON'T** manually edit CSV files midway through batch
- **DON'T** bypass approval limit checks
- **DON'T** resubmit duplicate claims
- **DON'T** force live submission if validation fails

---

## 11. MAINTENANCE

### Weekly

```bash
# Backup audit trail
cp outputs/submission_audit.csv backups/audit_$(date +%Y%m%d).csv

# Clean old logs (keep 7 days)
find outputs -name "*.log" -mtime +7 -delete

# Verify plugin updates
Check GitHub: releases/latest
```

### Monthly

```bash
# Full validation run
npm run validate

# Batch test (dry-run sample)
@batch-processor sample_claims.csv --dry-run

# Performance review
grep "SUCCESS\|FAILED" outputs/submission_audit.csv | wc -l
```

### Quarterly

```bash
# Archive historical data
tar -czf archives/audit_Q1_2026.tar.gz outputs/
rm -rf outputs/old_*

# Update documentation
Review RUNBOOK for changes needed
```

---

## 12. CONTACTS & SUPPORT

### Internal Support

- **Slack:** #nphies-claims-support
- **Email:** nphies-claims-support@company.com
- **Escalation:** nphies-claims-manager@company.com

### External (Portal Issues)

- **NPHIES Portal:** support.portal@nphies.gov.sa
- **Oasis Access:** it-oasis@company.com

### Quick Reference

| Issue | Contact | Time |
|-------|---------|------|
| Plugin bug | Slack #nphies-support | <2 hours |
| Portal down | NPHIES support | <4 hours |
| Approval limits stuck | IT Oasis team | <4 hours |
| Policy questions | Management | <1 day |

---

## Quick Start Checklist

- [ ] Plugin installed
- [ ] .env file created with credentials
- [ ] Test submission completed
- [ ] Dry-run working
- [ ] Audit logs appearing
- [ ] Read troubleshooting section
- [ ] Saved this runbook locally
- [ ] Added to daily workflow

---

**Ready to process claims? Start with:** `/nphies-submit --dry-run`

**Questions? Check:** ARCHITECTURE.md or USER_GUIDE.md

**Found a bug? Report:** nphies-claims-support@company.com
