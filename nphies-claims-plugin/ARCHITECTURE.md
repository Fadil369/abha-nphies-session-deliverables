# NPHIES Claims Plugin - Architecture Design Document

**Version:** 1.0.0  
**Date:** April 7, 2026  
**Status:** Phase 1 - Foundation Complete

---

## 1. Overview

The NPHIES Claims Plugin is a VS Code Agent Plugin that automates claims submission management for MOH-ABHA (Abha) and Al Rajhi (Riyadh) branches using agents, skills, hooks, and MCP servers.

### Key Objectives
- Automate NPHIES claims submission workflow (validate → submit → track)
- Reduce manual effort by 80% per submission cycle
- Enforce safety guardrails (approval limits, document validation)
- Provide complete audit trails for compliance
- Enable operators to self-serve via intuitive slash commands

### Recovery Potential
- **BE-1-4 (Preauth)**: 43 cases, SAR 76,001
- **MN-1-1 (Other)**: 31 cases, SAR 26,600
- **Total**: SAR 102,601+ (57.1% of claimed amount)

---

## 2. Architecture Components

### 2.1 MCP Servers (Enhanced oracle-portal)

**Purpose:** Provide tool-based access to NPHIES portal and claim management.

**Existing Tools (from mcp-oracle-db/src/index.js):**
- `portal_get_claims` - Search claims by invoice number
- `portal_get_claim_detail` - Get full claim details
- `portal_submit_appeal` - Submit appeal to portal (dryRun mode available)

**New Tools to Add:**
1. **validate-claim**
   - Input: claim object, branch (riyadh/abha)
   - Checks: Format, required fields, NPHIES compliance
   - Output: Validation status, errors, warnings
   - Use: Pre-submission validation gate

2. **check-approval-limits**
   - Input: patient_id, provider_id, service_type, amount
   - Fetches: Current approval limits from Oasis
   - Output: Available balance, limit status, approval flags
   - Use: Enforce approval limits before submission

3. **fetch-claim-details**
   - Input: invoice_no, branch
   - Returns: Full claim info, rejection reasons, metadata
   - Output: Claim object with rejection analysis
   - Use: Get detailed claim information for appeals

4. **submit-appeal-batch**
   - Input: claim_ids[], corrective_action, branch, dryRun flag
   - Submits: Multiple appeals in sequence
   - Output: Success/failure per claim, receipt IDs
   - Use: Batch appeal submission with progress tracking

5. **get-submission-status**
   - Input: receipt_id, branch
   - Queries: Portal for submission status updates
   - Output: Current status, approval updates, rejections
   - Use: Track submission progress over time

6. **fetch-supporting-docs**
   - Input: claim_id, branch
   - Returns: Document references, audit trails
   - Output: Required docs, attached docs, missing docs
   - Use: Verify document completeness

**Implementation Location:** `mcp-oracle-db/src/index.js`  
**Config Location:** `nphies-claims-plugin/.mcp.json`

---

### 2.2 Skills (Reusable Workflows)

Each skill is a self-contained workflow that can be used standalone or composed within agents.

#### Skill 1: claim-triage
**Purpose:** Analyze rejection codes and categorize claims by corrective action.

**Inputs:**
- Rejection code (BE-1-4, MN-1-1, etc.)
- Claim details (amount, service type)
- Historical data (similar claims)

**Processing:**
- Map rejection code to root cause
- Categorize by priority (high/medium/low)
- Estimate recovery percentage
- Identify required corrective documents

**Outputs:**
- Action plan (preauth, communication, new claim)
- Recovery % (optimistic estimate)
- Required documents checklist
- Recommended next steps

**Location:** `nphies-claims-plugin/skills/claim-triage/`
- `SKILL.md` - Instructions for AI
- `analyze.js` - Implementation script

#### Skill 2: doc-validation
**Purpose:** Verify supporting documents for completeness and format.

**Inputs:**
- Claim item (from claim-triage output)
- Required document checklist
- File references (paths, names, sizes)

**Processing:**
- Check document existence
- Validate file format (PDF, image, etc.)
- Verify file size (NPHIES limits)
- Check metadata (page count, resolution)

**Outputs:**
- Missing documents list
- Invalid format/size issues
- Validation status (pass/fail/warning)
- Remediation recommendations

**Location:** `nphies-claims-plugin/skills/doc-validation/`
- `SKILL.md` - Instructions for AI
- `validate.js` - Implementation script

#### Skill 3: approval-limits
**Purpose:** Check and manage patient/provider approval limits from Oasis.

**Inputs:**
- Patient ID
- Provider ID
- Service type
- Requested amount

**Processing:**
- Fetch current balance from Oasis (via MCP tool)
- Check against yearly/monthly/per-visit limits
- Identify contractual tariff adjustments
- Flag if approval needed

**Outputs:**
- Available balance
- Limit status (OK, warning, exceeded)
- Prior requests/approvals
- Approval requirement flags

**Location:** `nphies-claims-plugin/skills/approval-limits/`
- `SKILL.md` - Instructions for AI
- `check.js` - Implementation script

#### Skill 4: batch-processor
**Purpose:** Execute controlled batch submissions with progress tracking.

**Inputs:**
- CSV action queue (from outputs/master_claim_actions.csv)
- Branch (riyadh/abha)
- Batch limit (default 5, max 50)
- dryRun flag (default true)

**Processing:**
- Load claims from CSV
- Validate each claim (using claim-triage skill)
- Check approval limits (using approval-limits skill)
- Submit batch (via MCP tool submit-appeal-batch)
- Track progress (success/failure per claim)

**Outputs:**
- Progress JSON (items processed, success/failure)
- Audit log (submission details, receipt IDs)
- Error report (failed items with reasons)
- Diagnostics (HTML snapshots on failure)

**Location:** `nphies-claims-plugin/skills/batch-processor/`
- `SKILL.md` - Instructions for AI
- `run.js` - Wraps existing `mcp-oracle-db/src/batch-runner.js`

---

### 2.3 Custom Agents (Orchestrators)

#### Agent 1: submissions-manager
**Persona:** Senior submissions engineer; concise, safety-conscious, operational focus

**Tools Available:**
- oracle-portal MCP (all 6 tools)
- claim-triage skill
- doc-validation skill
- approval-limits skill
- batch-processor skill
- Playwright (via MCP for portal automation)

**Workflow:**
1. **Input:** User provides claim(s) and branch (riyadh/abha)
2. **Validate:** Run claim-triage → doc-validation → approval-limits
3. **Report:** Present validation results and any blockers
4. **Dry-Run:** Default to dryRun=true for portal_submit_appeal
5. **Confirmation:** Require manual operator confirmation for live submissions
6. **Track:** Log all submissions to `artifacts/rajhi_portal_progress.json`
7. **Report:** Provide summary (success/failure/audit trail)

**Safety Defaults:**
- dryRun=true by default for all submissions
- Max batch size: 10 (escalate for larger)
- Require 3 successful dry-runs before live submission
- Manual hydration required for fresh Oasis sessions
- Approval limits enforced (block if exceeded)

**Location:** `nphies-claims-plugin/agents/submissions-manager.agent.md`

#### Agent 2: appeals-processor
**Persona:** Regulatory specialist; compliance-focused, detail-oriented

**Tools Available:**
- oracle-portal MCP (validate-claim, fetch-claim-details, submit-appeal-batch)
- claim-triage skill (rejection analysis)
- Playwright (for manual document prep if needed)

**Workflow:**
1. **Input:** User provides claim and rejection code (BE-1-4, MN-1-1)
2. **Analyze:** Run claim-triage to understand rejection reason
3. **Plan:** Generate corrective action plan
4. **Documents:** Identify required supporting docs
5. **Prepare:** Guide user to prepare/attach documents
6. **Submit:** Submit appeal (dry-run first, then live with confirmation)
7. **Track:** Monitor appeal status via MCP tool
8. **Escalate:** If missing docs or limit issues, escalate to operator

**Key Features:**
- Detailed rejection analysis (root cause, recovery %)
- Step-by-step guidance for operators
- Document checklist & verification
- Appeal status tracking
- Escalation protocol for complex cases

**Location:** `nphies-claims-plugin/agents/appeals-processor.agent.md`

---

### 2.4 Lifecycle Hooks (Automation)

Hooks execute shell commands at agent lifecycle points to automate validation and tracking.

#### Hook 1: PreToolUse (Before portal submission)
**Trigger:** Before any `portal_submit_appeal` or `submit-appeal-batch` call

**Actions:**
1. Validate claim format and required fields
2. Check approval limits (fail if exceeded)
3. Verify supporting documents attached
4. If live mode: require manual confirmation + show dry-run result first
5. Log validation results to `artifacts/pre_submit_TIMESTAMP.json`

**Script Location:** `nphies-claims-plugin/hooks/scripts/validate-before-submit.sh`

**Output:**
- Validation status (pass/fail)
- Errors/warnings (if any)
- Audit log entry

**Config Location:** `nphies-claims-plugin/hooks/hooks.json`

#### Hook 2: PostToolUse (After successful submission)
**Trigger:** After successful `portal_submit_appeal` or batch submission

**Actions:**
1. Capture submission response (status, receipt ID, confirmation)
2. Update `artifacts/rajhi_portal_progress.json` with submission details
3. Log to `outputs/submission_audit.csv` (timestamp, invoice, status, operator)
4. Flag for follow-up if no receipt received
5. Archive HTML response for audit trail

**Script Location:** `nphies-claims-plugin/hooks/scripts/track-after-submit.sh`

**Output:**
- Updated progress JSON
- Audit log entry
- HTML snapshot (for compliance)

**Config Location:** `nphies-claims-plugin/hooks/hooks.json`

#### Hook 3: Batch Monitoring (During batch operations)
**Trigger:** During batch processing (every N items or per item)

**Actions:**
1. Log progress: items processed, success rate, current status
2. Capture diagnostics on failures (error message, HTML snapshot)
3. Email operator summary every 50 items or on batch completion
4. Stop batch if error rate > 10% and alert operator
5. Archive all diagnostics to `artifacts/batch_diagnostics/`

**Script Location:** `nphies-claims-plugin/hooks/scripts/monitor-batch.sh`

**Output:**
- Progress log (real-time)
- Diagnostic archive (on failures)
- Email alerts (to operator)

**Config Location:** `nphies-claims-plugin/hooks/hooks.json`

---

### 2.5 Slash Commands (Quick Access)

Slash commands provide intuitive operator access to workflows.

```
/nphies-validate <invoice> [branch]
  → Quick claim format check
  → Returns validation status + blockers
  → Example: /nphies-validate 6629884 riyadh

/nphies-submit <branch> [--limit N] [--dry-run]
  → Submit batch (default: limit=5, dry-run=true)
  → Returns dry-run results + confirmation prompt for live
  → Example: /nphies-submit riyadh --limit 10 --dry-run

/nphies-appeal <invoice> <rejection_code>
  → Analyze rejection + prepare appeal
  → Returns action plan + required documents
  → Example: /nphies-appeal 6629884 BE-1-4

/nphies-batch <csv_file> [--limit N] [--live]
  → Run batch from CSV (default: dry-run)
  → Returns progress + audit trail
  → Example: /nphies-batch outputs/master_claim_actions.csv --limit 5

/nphies-status [branch]
  → Show submission progress & last 10 operations
  → Returns summary table + audit trail snippet
  → Example: /nphies-status riyadh

/nphies-hydrate [branch]
  → Refresh approval limits from Oasis portal
  → Requires manual login for fresh session
  → Example: /nphies-hydrate abha
```

---

### 2.6 Plugin Manifest (plugin.json)

The plugin.json file defines metadata and bundles all components.

**Location:** `nphies-claims-plugin/plugin.json`

**Contents:**
- name, version, author, license
- description of plugin purpose
- list of included skills, agents, hooks, MCP servers
- marketplace metadata (tags, homepage, repository)
- changelog/release notes

---

## 3. Data Flows

### 3.1 Claim Submission Flow
```
Operator Input
    ↓
/nphies-submit command
    ↓
submissions-manager agent
    ├─ claim-triage skill → categorize claim
    ├─ approval-limits skill → check balances
    ├─ doc-validation skill → verify documents
    ↓
PreToolUse hook → validate before submit
    ├─ Check format, limits, documents
    ├─ Log to artifacts/pre_submit_*.json
    ↓ PASS
portal_submit_appeal (dryRun=true default)
    ├─ Dry-run results returned
    ├─ Operator confirms for live
    ↓ CONFIRMED
portal_submit_appeal (dryRun=false)
    ↓
PostToolUse hook → track after submit
    ├─ Capture response, receipt ID
    ├─ Update artifacts/rajhi_portal_progress.json
    ├─ Log to outputs/submission_audit.csv
    ↓
Operator receives summary + audit trail
```

### 3.2 Appeal Processing Flow
```
Operator Input (claim + rejection code)
    ↓
/nphies-appeal command
    ↓
appeals-processor agent
    ├─ claim-triage skill → analyze rejection
    ├─ Generate corrective action plan
    ├─ Identify required documents
    ├─ fetch-claim-details MCP tool → get current status
    ↓
Present to operator:
    ├─ Root cause
    ├─ Recovery %
    ├─ Document checklist
    ├─ Recommended next steps
    ↓
Operator prepares & attaches documents
    ↓
/nphies-submit for appeal
    ├─ Same flow as Claim Submission Flow
    ↓
Track appeal status
    ├─ get-submission-status MCP tool
    ├─ Monitor for approval updates
```

### 3.3 Batch Processing Flow
```
Operator Input (CSV file, branch, limit)
    ↓
/nphies-batch command
    ↓
batch-processor skill
    ├─ Load CSV from file
    ├─ For each claim (up to limit):
    │   ├─ Validate (claim-triage)
    │   ├─ Check limits (approval-limits)
    │   ├─ Verify docs (doc-validation)
    │   ├─ PreToolUse hook → validation gate
    │   ├─ submit-appeal-batch MCP tool (dryRun=true)
    │   ├─ PostToolUse hook → logging
    │   ├─ Batch Monitoring hook → progress update
    │
Batch Monitoring hook fires every 5-10 items:
    ├─ Log progress
    ├─ Check error rate
    ├─ Email operator if needed
    ├─ Stop if error rate > 10%
    ↓
Final summary:
    ├─ Success/failure counts
    ├─ Audit trail (all submissions)
    ├─ Error diagnostics
    ├─ Next actions
```

---

## 4. Safety Guardrails

### 4.1 Submission Safety
- **Default dry-run:** All submissions default to `dryRun=true`
- **Manual confirmation:** Require operator to confirm before live submission
- **3-dry-run rule:** Require 3 successful dry-runs before live
- **Approval limits:** PreToolUse hook blocks if limits exceeded
- **Document validation:** Pre-submission check for required files

### 4.2 Operational Safety
- **Session hydration:** Manual portal login required for fresh Oasis sessions
- **Batch limits:** Max 10 items per batch (escalate for larger)
- **Error thresholds:** Stop batch if error rate > 10%
- **Diagnostics capture:** HTML, errors, stack traces on failure
- **Audit logging:** Complete trail for compliance & troubleshooting

### 4.3 Approval Limits Enforcement
- **PreToolUse hook** checks:
  - Patient balance available?
  - Provider approval status?
  - Contractual tariff adjustments apply?
- **Decision logic:**
  - If limit exceeded → DENY submission (PreToolUse returns deny)
  - If warning level → ALLOW but flag for review
  - If no limits → ALLOW submission

---

## 5. Integration Points

### 5.1 External Systems
- **Oasis Portal:** Fetches approval limits, tracks submissions
- **NPHIES Portal:** Submits claims, appeals, tracks status
- **File System:** Reads CSV inputs, writes JSON/CSV outputs
- **Email:** Sends operator alerts on batch completion/errors

### 5.2 Internal Systems
- **mcp-oracle-db/src/index.js:** Existing MCP server (extend with 6 new tools)
- **mcp-oracle-db/src/batch-runner.js:** Existing batch runner (wrap in skill)
- **outputs/master_claim_actions.csv:** Input source for batch processing
- **artifacts/:** Output directory for progress tracking & diagnostics

---

## 6. Branch-Specific Workflows

### 6.1 Riyadh (Al Rajhi)
- Direct portal submission via Playwright automation
- Simpler approval workflow (batch-runner.js)
- Faster turnaround (5-10 min per batch)
- Manual confirmation gates required

### 6.2 ABHA (MOH-ABHA)
- Requires approval limit hydration from Oasis first
- Contractual tariff adjustments apply
- More complex validation rules
- Medical necessity documentation often needed

### 6.3 Branch Differentiation in Code
- MCP tools accept `branch` parameter (riyadh/abha)
- Agent workflows adapt based on branch
- Different validation rules per branch
- Different approval limit sources

---

## 7. Error Handling

### 7.1 Validation Errors
- **Format error:** Report field name + expected format
- **Limit exceeded:** Show current balance + requested amount
- **Missing document:** List specific document + reason required
- **Action:** Operator fixes + retries

### 7.2 Submission Errors
- **Portal unreachable:** Retry with exponential backoff
- **Session expired:** Require manual re-login + retry
- **Selector failed:** Capture HTML + report for investigation
- **Action:** Archive diagnostic + escalate

### 7.3 Escalation Protocol
- **Level 1:** Operator-fixable (retry, re-upload doc, confirm)
- **Level 2:** Requires manual intervention (missing approval, contract issue)
- **Level 3:** Technical issue (portal failure, selector broken, requires dev)

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Skill logic: claim-triage, doc-validation, approval-limits
- MCP tools: validate-claim, check-approval-limits (with mock data)
- Hook scripts: validate-before-submit, track-after-submit

### 8.2 Integration Tests
- End-to-end: load claims → validate → dry-run → track
- Riyadh batch: limit=5, dry-run, verify audit trail
- ABHA hydration: fetch limits, validate, prepare live run
- Hook execution: verify PreToolUse/PostToolUse fire correctly

### 8.3 Manual Testing
- Operator command: /nphies-validate on real claim
- Operator command: /nphies-submit on small batch
- Operator command: /nphies-appeal on known rejection
- Verify artifacts created + audit trail complete

---

## 9. Success Criteria (Phase 1)

✓ Architecture design document complete (this file)  
✓ Plugin directory structure created  
✓ MCP tools specification defined (6 new tools)  
✓ Skill specifications defined (4 skills)  
✓ Agent specifications defined (2 agents)  
✓ Hook specifications defined (3 hooks)  
✓ Slash command specifications defined (6 commands)  
✓ Data flows documented (3 main flows)  
✓ Safety guardrails identified & documented  
✓ Integration points mapped  
✓ Error handling protocol defined  
✓ Testing strategy defined  

---

## 10. Next Steps (Phase 2)

1. Implement claim-triage skill
2. Implement doc-validation skill
3. Implement approval-limits skill
4. Implement batch-processor skill
5. Create SKILL.md for each skill
6. Test skill loading in VS Code

---

## Appendix: File Locations

```
nphies-claims-plugin/
  ├── ARCHITECTURE.md               (this file)
  ├── plugin.json                   (manifest - to create)
  ├── README.md                     (user guide - to create)
  ├── RUNBOOK.md                    (operator instructions - to create)
  ├── .mcp.json                     (MCP config - to create)
  │
  ├── skills/
  │   ├── claim-triage/
  │   │   ├── SKILL.md              (to create)
  │   │   └── analyze.js            (to create)
  │   ├── doc-validation/
  │   │   ├── SKILL.md              (to create)
  │   │   └── validate.js           (to create)
  │   ├── approval-limits/
  │   │   ├── SKILL.md              (to create)
  │   │   └── check.js              (to create)
  │   └── batch-processor/
  │       ├── SKILL.md              (to create)
  │       └── run.js                (to create)
  │
  ├── agents/
  │   ├── submissions-manager.agent.md  (to create)
  │   └── appeals-processor.agent.md    (to create)
  │
  ├── hooks/
  │   ├── hooks.json                (to create)
  │   └── scripts/
  │       ├── validate-before-submit.sh  (to create)
  │       ├── track-after-submit.sh      (to create)
  │       └── monitor-batch.sh           (to create)
  │
  └── scripts/
      ├── init-plugin.sh            (to create)
      └── diagnostics.sh            (to create)

Related files (existing):
  mcp-oracle-db/
    ├── src/
    │   ├── index.js                (enhance with 6 new tools)
    │   └── batch-runner.js         (wrap in batch-processor skill)
    
  artifacts/
    └── rajhi_portal_progress.json  (created by PostToolUse hook)
    
  outputs/
    ├── master_claim_actions.csv    (input for batch processing)
    └── submission_audit.csv        (created by PostToolUse hook)
```

---

**End of Architecture Design Document (Phase 1)**
