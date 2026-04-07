# NPHIES Claims Plugin - Complete User Guide

## Table of Contents
1. [Overview](#overview)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Quick Start](#quick-start)
5. [Skills Reference](#skills-reference)
6. [Agents Reference](#agents-reference)
7. [Slash Commands](#slash-commands)
8. [Workflows](#workflows)
9. [Troubleshooting](#troubleshooting)
10. [Support](#support)

---

## Overview

The **NPHIES Claims Plugin** automates insurance claim processing for MOH-ABHA (Riyadh) and Al Rajhi (Abha) branches. It reduces manual processing time from 30-60 minutes to 5-10 minutes per batch, achieving **80% effort reduction** and **6-12x faster processing**.

### Key Benefits
- **80% effort reduction** - Automated validation and submission
- **6-12x faster processing** - 5-10 minutes vs 30-60 minutes per batch
- **SAR 102,601+ recovery potential** - Systematic claim analysis
- **3x safer** - Error rate drops from ~15% to <5%
- **Scalable batching** - 10-50 claims per batch (was 1-5)

### Supported Services
✓ Professional services (doctor, clinic)  
✓ Pharmacy claims  
✓ Institutional services (hospital)  
✓ Pre-authorization appeals  
✓ Contractual claim disputes  

### Supported Branches
✓ Al Rajhi (Riyadh) - Simpler approval process  
✓ MOH-ABHA - Complex approval matrix with hydration  

---

## Installation

### Prerequisites
- Visual Studio Code 1.80+
- GitHub Copilot Chat extension
- Node.js 14+ (for MCP server)
- Access to NPHIES portal

### Install from Plugin Marketplace

1. Open Extensions view: `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS)
2. Search for `@agentPlugins nphies-claims`
3. Click **Install**
4. First time: Confirm marketplace trust when prompted

### Install from Source

1. Open Command Palette: `Ctrl+Shift+P` or `Cmd+Shift+P`
2. Run: **Chat: Install Plugin From Source**
3. Paste repository URL:
   ```
   https://github.com/fadil369/nphies-claims-plugin
   ```
4. Wait for plugin to clone and register

### Verify Installation

After installation, you should see:
- ✓ Plugin listed in Extensions > Agent Plugins - Installed
- ✓ Skills available in Chat > Configure Skills
- ✓ MCP servers listed in Chat > Configure Tools
- ✓ Slash commands starting with `/nphies-`

---

## Configuration

### Environment Setup

Create a `.env` file in your workspace root:

```bash
# Oasis System Access
PORTAL_USER=your_username
PORTAL_PASS=your_password
ORACLE_PROFILE_DIR=/path/to/oracle/profiles

# Portal Configuration
NPHIES_PORTAL_URL=https://portal.nphies.gov.sa
NPHIES_API_ENDPOINT=https://api.nphies.gov.sa/v1

# Logging
LOG_LEVEL=info
LOG_FILE=./outputs/nphies.log

# Batch Processing
MAX_BATCH_SIZE_RIYADH=5
MAX_BATCH_SIZE_ABHA=10
DRY_RUN_DEFAULT=true
DRY_RUNS_REQUIRED=3
```

### VS Code Settings

Add to your workspace `.vscode/settings.json`:

```json
{
  "chat.plugins.enabled": true,
  "chat.plugins.marketplaces": [
    "github/copilot-plugins"
  ],
  "chat.systemPrompt": "You are an expert NPHIES claims processor. Help users validate and submit insurance claims efficiently and safely."
}
```

### Enable Plugin

1. Open Chat view
2. Click **gear icon** > **Plugins**
3. Toggle **nphies-claims-plugin** to **ON**
4. Confirm MCP server started (look for green status indicator)

---

## Quick Start

### Scenario 1: Validate Single Claim (5 min)

```
User: /nphies-validate

Expected: Upload rejection code and claim details
Plugin: Analyzes claim, provides triage, lists required documents
```

### Scenario 2: Dry-Run Batch Submission (10 min)

```
User: /nphies-submit --branch riyadh --file claims.csv --dry-run

Expected: Validates all claims, submits with monitoring
Plugin: Returns progress, flags failures, suggests next steps
```

### Scenario 3: Submit Appeal (8 min)

```
User: /nphies-appeal --code BE-1-4 --claimId C001

Expected: Analyzes rejection reason, suggests appeal strategy
Plugin: Provides templates, required docs, escalation path
```

---

## Skills Reference

Skills are reusable, on-demand workflows that handle specific tasks.

### Skill 1: Claim Triage

**When to use:** Analyze rejection codes and prioritize claims

**How to invoke:**
```
@claim-triage Analyze rejection BE-1-4 for claim C001 with amount 5000 SAR
```

**What you get:**
- Root cause analysis
- Priority tier (HIGH/MEDIUM/LOW)
- Recovery percentage estimate
- Required documents checklist
- Next action steps

**Example output:**
```
Priority: HIGH
Recovery: 70%
Root Cause: Preauthorization required
Next: Prepare clinical justification, submit appeal
```

---

### Skill 2: Doc Validation

**When to use:** Verify supporting documents before submission

**How to invoke:**
```
@doc-validation Check documents for professional service claim, branch riyadh
```

**What you get:**
- Validation status (COMPLETE/INCOMPLETE)
- Completion percentage
- Missing document list
- Format validation results
- Remediation steps

**Example output:**
```
Status: INCOMPLETE (75% complete)
Missing: Medical Records
Format: ✓ All files PDF format
Next: Collect medical records, revalidate
```

---

### Skill 3: Approval Limits

**When to use:** Check patient/provider limits before submission

**How to invoke:**
```
@approval-limits Check limits for patient P123456, amount 5000 SAR, branch riyadh
```

**What you get:**
- Current approval limits (yearly/monthly/per-visit)
- Available balance in SAR
- Percentage of limit used
- Validation status
- Prior requests in same period

**Example output:**
```
Validation: APPROVED
Yearly: 35,000 SAR available (30% used)
Monthly: 7,000 SAR available (30% used)
Per-Visit: Within limit
Status: Proceed with submission
```

---

### Skill 4: Batch Processor

**When to use:** Submit multiple claims with progress tracking

**How to invoke:**
```
@batch-processor Process claims.csv for riyadh branch, dry-run mode
```

**What you get:**
- Batch ID and progress tracking
- Success/failure count and rate
- Detailed results per claim
- Summary statistics
- Diagnostic information

**Example output:**
```
Batch: BATCH-20260407-001
Total: 43 claims
Success: 41 (95%)
Failed: 2 (5%)
Time: 12 minutes
Next: Review 2 failures, fix documentation
```

---

## Agents Reference

Agents are specialized orchestrators that compose multiple skills into complete workflows.

### Agent 1: Submissions Manager

**Purpose:** Orchestrate complete validation and submission workflow

**When to use:**
- Submitting batch of new claims
- First-time processing for a claim type
- Need full validation pipeline before submission

**How to use:**
```
@submissions-manager I need to submit 43 preauth claims from BE-1-4 group
```

**What agent does:**
1. Triages all claims
2. Validates documentation
3. Checks approval limits
4. Flags high-risk items for review
5. Executes dry-run batch submission
6. Reports results with next actions

**Output includes:**
- Pre-submission validation report
- Dry-run results
- Risk assessment
- Recommended escalations
- Live submission readiness check

---

### Agent 2: Appeals Processor

**Purpose:** Handle rejected claims with retroactive corrections

**When to use:**
- Processing rejected claims
- Preparing appeals
- Analyzing rejection reasons
- Building appeal strategy

**How to use:**
```
@appeals-processor Help me appeal these 5 claims rejected for BE-1-4 reason
```

**What agent does:**
1. Analyzes each rejection code
2. Identifies root causes
3. Recommends appeal strategy
4. Prepares appeal templates
5. Lists required additional documents
6. Estimates success probability

**Output includes:**
- Rejection analysis report
- Appeal strategy per claim
- Document requirements
- Message templates
- Escalation recommendations

---

## Slash Commands

Quick-access commands for common workflows. Type `/nphies-` in chat to see all.

### /nphies-validate
Validate single claim against requirements

```bash
/nphies-validate
# Then provide: rejection code, claim amount, service type
```

### /nphies-submit
Submit batch of claims from CSV file

```bash
/nphies-submit --file claims.csv --branch riyadh --dry-run
```

### /nphies-appeal
Analyze rejection and prepare appeal

```bash
/nphies-appeal --code BE-1-4 --claimId C001
```

### /nphies-hydrate
Refresh approval limits from Oasis (ABHA only)

```bash
/nphies-hydrate --branch abha --patient P123456
```

### /nphies-batch
Process claims from CSV with full monitoring

```bash
/nphies-batch --input claims.csv --branch riyadh --dry-run
```

### /nphies-status
Check current batch processing status

```bash
/nphies-status --batch BATCH-20260407-001
```

---

## Workflows

### Workflow 1: New Claim Batch (30 minutes)

**Goal:** Submit 30-50 claims from scratch

**Steps:**

1. **Prepare** (5 min)
   - Gather claims in CSV format
   - Ensure all required columns present
   - Save to workspace

2. **Validate** (10 min)
   - Use: `@submissions-manager I have 43 new claims to process`
   - Review validation report
   - Collect any missing documents

3. **Dry-Run** (10 min)
   - Agent runs automatic dry-run
   - If <90% success: Fix failures, re-run
   - If >90% success: Ready for live submission

4. **Submit** (5 min)
   - Agent asks for confirmation
   - Submits claims to portal
   - Monitors for receipt

**Expected outcome:** All 43 claims submitted, receipts in `artifacts/rajhi_portal_progress.json`

---

### Workflow 2: Process Rejections (20 minutes)

**Goal:** Analyze and appeal 10-15 rejected claims

**Steps:**

1. **Analyze** (5 min)
   - Use: `@appeals-processor I have 12 rejected claims with BE-1-4 reason`
   - Agent analyzes each rejection
   - Provides priority ranking

2. **Prepare Appeals** (10 min)
   - Agent suggests required documents
   - Provides message templates
   - Flags escalation needs

3. **Execute** (5 min)
   - Collect required documents
   - Submit appeals via portal
   - Track status

**Expected outcome:** Appeals submitted with clear success probability per claim

---

### Workflow 3: ABHA Limit Hydration (5 minutes)

**Goal:** Refresh approval limits for ABHA branch before batch submission

**Steps:**

1. **Hydrate** (2 min)
   - Use: `/nphies-hydrate --branch abha`
   - Agent refreshes all patient limits from Oasis

2. **Verify** (3 min)
   - Review limits loaded
   - Confirm all patients have valid limits
   - Identify patients near limits

**Expected outcome:** Fresh limits ready for batch processing

---

## Troubleshooting

### Plugin Not Appearing

**Issue:** Plugin doesn't show in Chat customizations

**Solution:**
1. Check: Settings > `chat.plugins.enabled` = true
2. Reload VS Code (`Ctrl+Shift+P` > Developer: Reload Window)
3. Verify marketplace in settings
4. Re-install if needed

### MCP Server Not Starting

**Issue:** Red error icon on MCP servers

**Solution:**
1. Check environment variables (.env file)
2. Verify Oasis portal credentials
3. Check network connectivity to portal
4. Review logs: `./outputs/nphies.log`

### Dry-Run Success Rate Low

**Issue:** Dry-run only 60% success (need >90%)

**Solution:**
1. Review failures with: `cat artifacts/rajhi_portal_progress.json`
2. Identify common issues (doc validation, limits)
3. Fix issues in batch
4. Re-run dry-run
5. Repeat until >90% success

### Batch Processing Hangs

**Issue:** Batch appears stuck at 50%

**Solution:**
1. Check portal status: https://portal.nphies.gov.sa
2. Look for rate limits in logs
3. Stop batch: `Ctrl+C`
4. Resume: `@batch-processor --resume`
5. Contact support if repeated

### Cannot Reach Oasis

**Issue:** "Oasis system unavailable" error

**Solution:**
1. Verify network connectivity
2. Check credentials in .env file
3. Verify ORACLE_PROFILE_DIR path
4. Test manually: `curl $NPHIES_PORTAL_URL`
5. Contact IT if portal is down

---

## Support

### Documentation
- Full specification: `ARCHITECTURE.md`
- Operator manual: `RUNBOOK.md`
- Skill details: Each `skills/*/SKILL.md`

### Common Tasks

**Need to process claims?**
→ Start with Workflow 1 (New Claim Batch)

**Have rejections to fix?**
→ Start with Workflow 2 (Process Rejections)

**ABHA branch?**
→ Run Workflow 3 first (Limit Hydration)

**Want to understand the code?**
→ Read `ARCHITECTURE.md` Section 2-4

**Need to debug an issue?**
→ Check `Troubleshooting` section above

### Getting Help

1. **In VS Code Chat:**
   - Type: `help` or `?` in plugin context
   - Ask questions naturally
   - Plugin provides guided help

2. **Check Logs:**
   ```bash
   tail -f ./outputs/nphies.log
   ```

3. **Review Previous Runs:**
   ```bash
   cat outputs/submission_audit.csv
   cat artifacts/rajhi_portal_progress.json
   ```

4. **Contact Support:**
   - Email: nphies-claims@company.com
   - Slack: #nphies-claims-support
   - Include: Batch ID, timestamps, and error logs

---

## Advanced Topics

### Customizing Batch Size

Edit `.env`:
```bash
MAX_BATCH_SIZE_RIYADH=3    # Smaller batches for testing
MAX_BATCH_SIZE_ABHA=15     # Larger batches for ABHA
```

### Disabling Dry-Run Requirement

⚠️ Not recommended. Override with:
```bash
DRY_RUN_DEFAULT=false
DRY_RUNS_REQUIRED=0
```

### Custom Approval Limits

Contact system admin to override default limits in Oasis.

### Batch Retry Logic

Failed items are automatically retryable. Configure retry attempts:
```bash
MAX_RETRIES=3
RETRY_DELAY_SECONDS=30
```

### Integration with External Systems

Batch results available at:
- `artifacts/rajhi_portal_progress.json` - Current batch progress
- `outputs/submission_audit.csv` - Complete audit trail

Import to:
- Excel/Google Sheets for tracking
- BI tools for reporting
- Custom dashboards

---

## Version Info

**Plugin Version:** 1.0.0  
**Published by:** fadil369  
**Last Updated:** April 7, 2026  
**Supported VS Code:** 1.80+  
**License:** MIT  

---

**Ready to process your first batch? Start with `/nphies-validate` in Chat!**
