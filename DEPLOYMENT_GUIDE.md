# NPHIES Claims Plugin - Deployment Guide

**Status:** ✅ Production Ready  
**Version:** 1.0.0  
**Publisher:** fadil369  
**Repository:** https://github.com/Fadil369/abha-nphies-session-deliverables

---

## Phase 1: Pre-Deployment Checklist

- [x] Code validation (structure verified)
- [x] All 4 skills implemented and tested
- [x] 2 orchestrator agents configured
- [x] 3 lifecycle hooks configured
- [x] 6 slash commands available
- [x] 46+ test cases passing
- [x] 50KB+ comprehensive documentation
- [x] Git commits pushed to main (d8f9a2a)
- [x] No security issues in plugin code (dependency vulnerabilities noted)

---

## Phase 2: VS Code Plugin Publication

### Option A: Manual Installation (Testing)

1. Clone the repository:
   ```bash
   git clone https://github.com/Fadil369/abha-nphies-session-deliverables.git
   cd abha-nphies-session-deliverables/nphies-claims-plugin
   ```

2. Register the plugin locally in VS Code:
   - Open VS Code Settings → Extensions → Chat
   - Add plugin location to `chat.pluginLocations`:
   ```json
   {
     "chat.pluginLocations": {
       "/path/to/nphies-claims-plugin": true
     }
   }
   ```

3. Reload VS Code and enable the plugin

### Option B: GitHub Release (Distribution)

1. Create a GitHub release from commit `d8f9a2a`:
   ```bash
   git tag v1.0.0 d8f9a2a
   git push origin v1.0.0
   ```

2. Publish to VS Code Marketplace:
   - Install vsce: `npm install -g vsce`
   - Package the plugin: `vsce package`
   - Upload to marketplace: `vsce publish`

### Option C: Plugin Marketplace Registration

1. Add plugin to an organization's marketplace repository:
   ```json
   {
     "plugins": {
       "nphies-claims": {
         "source": "github",
         "repo": "Fadil369/abha-nphies-session-deliverables",
         "path": "nphies-claims-plugin"
       }
     }
   }
   ```

2. Configure in workspace settings:
   ```json
   {
     "chat.plugins.marketplaces": ["your-org/plugin-marketplace"],
     "chat.plugins.enabled": true
   }
   ```

---

## Phase 3: Operator Onboarding

### Pre-Deployment Setup (30 minutes)

1. **Environment Configuration:**
   ```bash
   cd nphies-claims-plugin
   cp .env.example .env
   # Configure:
   # - ORACLE_PORTAL_URL
   # - ORACLE_API_KEY
   # - OASIS_PORTAL_URL (for ABHA branch)
   # - BRANCH (riyadh or abha)
   ```

2. **Credentials Setup:**
   - Obtain Oracle Portal API credentials
   - Obtain Oasis Portal credentials (ABHA only)
   - Add to `.env` file (DO NOT commit)

3. **Directory Initialization:**
   ```bash
   mkdir -p artifacts outputs
   echo "0" > artifacts/dry-run-count.txt
   ```

4. **Run Initialization Test:**
   ```bash
   node skills/claim-triage/analyze.js --init
   node skills/approval-limits/check.js --init
   ```

### Operator Training (2-3 hours)

Read in order:
1. **RUNBOOK.md** - Daily procedures, workflows, safety guardrails
2. **USER_GUIDE.md** - Skills reference, commands, troubleshooting
3. **ARCHITECTURE.md** - Technical design for advanced troubleshooting

---

## Phase 4: First Production Run

### Pre-Flight Checklist

- [ ] Plugin installed and enabled in VS Code
- [ ] Environment variables configured
- [ ] Credentials verified with test call
- [ ] 3 dry-runs completed successfully
- [ ] Operators trained and certified
- [ ] Monitoring/audit system ready
- [ ] Rollback plan documented

### Step 1: Verify Installation (5 min)

```
/claims-status

Expected output: "Plugin initialized and ready"
```

### Step 2: Run 3 Required Dry-Runs (15-20 min)

```
/batch-submit --file claims.csv --branch riyadh --dry-run
/batch-submit --file claims.csv --branch riyadh --dry-run
/batch-submit --file claims.csv --branch riyadh --dry-run
```

Expected: All 3 return "✅ Dry-run success, 0 rejections"

### Step 3: First Live Submission (10 min)

```
/batch-submit --file claims.csv --branch riyadh --live
```

Monitor:
- `artifacts/rajhi_portal_progress.json` (real-time progress)
- `outputs/submission_audit.csv` (immutable record)
- VS Code console (status updates)

### Step 4: Monitor & Verify (ongoing)

```
/claims-status
/get-audit-log
/list-rejections
```

---

## Phase 5: Production Monitoring

### Daily Procedures

**Morning (9 AM):**
```
/claims-status
/batch-submit --file morning-batch.csv --branch riyadh --dry-run
```

**Mid-Day (12 PM):**
- Manual approval of morning batch (if dry-run passes)
- Live submission

**Evening (5 PM):**
```
/get-audit-log
/list-rejections
```

### Key Metrics to Track

- Claims processed per day (target: 50+)
- Success rate (target: >90%)
- Average processing time (target: 5-10 min)
- Rejection rate by code
- Cost recovery from appeals

### Safety Guardrails (DO NOT DISABLE)

1. **Dry-run mandatory** - 3 successful runs before ANY live submission
2. **Approval limits** - Auto-checks on every submission
3. **Document validation** - Required docs checked before submission
4. **Operator confirmation** - Manual approval required for live
5. **Audit logging** - Complete immutable trail maintained

---

## Phase 6: Troubleshooting & Support

### Common Issues

| Issue | Solution |
|-------|----------|
| Plugin not loading | Check `chat.plugins.enabled: true` in settings |
| Commands not available | Verify plugin enabled in Chat Customizations |
| API authentication fails | Check `.env` credentials and Oracle Portal access |
| Dry-run succeeds but live fails | Check `artifacts/dry-run-count.txt` (must be ≥3) |
| ABHA hydration fails | Verify Oasis Portal connectivity and credentials |
| Batch size exceeded | Reduce CSV rows to max (5 Riyadh, 10+ ABHA) |

### Rollback Procedure

If live submission fails:

1. **Stop immediately:**
   ```bash
   # Disable plugin in VS Code
   # Settings → Chat → Disable nphies-claims plugin
   ```

2. **Analyze failure:**
   - Check `outputs/submission_audit.csv` for what was submitted
   - Check `outputs/error-*.log` for error details
   - Identify root cause (API issue? Invalid data? Portal error?)

3. **Recover:**
   - Fix root cause (update credentials, correct data, etc.)
   - Re-enable plugin
   - Run validation tests
   - Resume with new batch

---

## Phase 7: Ongoing Maintenance

### Weekly (Every Monday)

- Review `outputs/submission_audit.csv` for trends
- Check approval rates by branch
- Verify no system errors in last week
- Run security scan on dependencies

### Monthly (1st of month)

- Update rejection codes if changed by NPHIES
- Review and optimize approval limits
- Analyze cost recovery from appeals
- Update RUNBOOK.md with lessons learned

### Quarterly (Every 3 months)

- Full security audit
- Performance optimization
- User feedback collection
- Feature requests evaluation

---

## Support & Escalation

### Level 1 Support (Operator)
- Check RUNBOOK.md
- Review logs in `outputs/`
- Verify `.env` configuration
- Restart plugin

### Level 2 Support (Tech Team)
- Review ARCHITECTURE.md
- Check hook execution: `artifacts/*progress*.json`
- Verify MCP server connectivity
- Review git commit history

### Level 3 Support (Publisher - fadil369)
- File GitHub issue with logs and reproduction steps
- Access to source code and full git history
- Code review and optimization support

---

## Expected ROI

- **Processing time:** 30-60 min → 5-10 min per batch (6-12x faster)
- **Manual effort:** 100% → 20% (80% reduction)
- **Success rate:** 85% → 95%+
- **Cost recovery:** SAR 102,601+ (from appeals)
- **Operational cost:** ~50% reduction

---

**Last Updated:** 2026-04-08  
**Status:** Ready for production deployment  
**Next Steps:** Execute Phase 3 (Operator Onboarding)
