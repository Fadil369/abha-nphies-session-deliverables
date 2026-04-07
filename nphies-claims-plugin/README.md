# NPHIES Claims Plugin

A VS Code Agent Plugin for automating MOH-ABHA and Al Rajhi (Riyadh) claims submission management through NPHIES portal.

## Features

✨ **Automated Claim Workflows**
- Claim validation and triage
- Document verification
- Approval limit checking
- Batch submission processing

🤖 **Intelligent Agents**
- Submissions Manager: Orchestrate end-to-end submission workflows with safety guardrails
- Appeals Processor: Analyze rejections and prepare corrective documentation

🔒 **Safety & Compliance**
- Default dry-run mode for all submissions
- Approval limit enforcement
- Complete audit logging
- Error diagnostics and escalation

⚡ **Operator Commands**
- `/nphies-validate` - Quick claim format check
- `/nphies-submit` - Submit batch (default: dry-run)
- `/nphies-appeal` - Analyze rejection and prepare appeal
- `/nphies-batch` - Run batch from CSV
- `/nphies-status` - Show progress and audit trail
- `/nphies-hydrate` - Refresh approval limits

## Installation

### From GitHub
```bash
# Clone the plugin repository
git clone https://github.com/fadil369/nphies-claims-plugin.git
cd nphies-claims-plugin
```

### In VS Code
1. Open VS Code Settings (Cmd+,)
2. Search for "plugin locations"
3. Add the plugin path to `chat.pluginLocations`:
   ```json
   {
     "chat.pluginLocations": {
       "/path/to/nphies-claims-plugin": true
     }
   }
   ```
4. Restart VS Code
5. The plugin will load automatically

## Configuration

Set environment variables for portal access:

```bash
export PORTAL_USER="your-nphies-username"
export PORTAL_PASS="your-nphies-password"
export ORACLE_PROFILE_DIR="/path/to/playwright/profile"
```

Or create a `.env` file in the plugin root:

```env
PORTAL_USER=your-username
PORTAL_PASS=your-password
ORACLE_PROFILE_DIR=/path/to/profile
```

## Quick Start

### Validate a Claim
```
/nphies-validate 6629884 riyadh
```

### Submit Batch (Dry-Run)
```
/nphies-submit riyadh --limit 5 --dry-run
```

### Process an Appeal
```
/nphies-appeal 6629884 BE-1-4
```

### Batch from CSV
```
/nphies-batch outputs/master_claim_actions.csv --limit 5
```

## Supported Branches

- **riyadh**: Al Rajhi branch with direct portal submission
- **abha**: MOH-ABHA branch with approval limit hydration

## Components

### Skills
- **claim-triage**: Analyze rejection codes and categorize by priority
- **doc-validation**: Verify supporting documents for completeness
- **approval-limits**: Check patient/provider approval limits
- **batch-processor**: Execute controlled batch submissions

### Agents
- **submissions-manager**: Orchestrate complete submission workflow
- **appeals-processor**: Handle rejection appeals and appeals

### Hooks
- **PreToolUse**: Validate before submission
- **PostToolUse**: Track after submission
- **Batch Monitoring**: Monitor batch progress and diagnostics

### MCP Server
- **oracle-portal**: NPHIES portal automation and claim management tools

## Safety Guardrails

✓ Default dry-run mode for all submissions  
✓ 3 successful dry-runs required before live  
✓ Approval limits enforced and validated  
✓ Document validation before submission  
✓ Complete audit trail for compliance  
✓ Error diagnostics and escalation  

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Time/batch | 30-60 min | 5-10 min |
| Manual effort | 100% | 20% |
| Error rate | ~15% | <5% |
| Batch size | 1-5 items | 10-50 items |

**Recovery Potential**: SAR 102,601+ from rejected/partial claims

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture design including:
- Component specifications
- Data flows
- Integration points
- Error handling
- Testing strategy

## Operator Runbook

See [RUNBOOK.md](./RUNBOOK.md) for step-by-step instructions for:
- Pre-submission checks
- Dry-run submission
- Live submission
- Monitoring and tracking
- Failure handling
- Escalation protocol

## Development

### Structure
```
nphies-claims-plugin/
  ├── ARCHITECTURE.md      # Architecture design
  ├── plugin.json          # Plugin manifest
  ├── README.md           # This file
  ├── RUNBOOK.md          # Operator instructions
  ├── .mcp.json           # MCP configuration
  ├── skills/             # 4 reusable skills
  ├── agents/             # 2 specialized agents
  ├── hooks/              # 3 lifecycle hooks
  └── scripts/            # Setup and diagnostics
```

### Create a Skill

1. Create directory: `skills/my-skill/`
2. Create `SKILL.md` with:
   - Purpose
   - Inputs/outputs
   - Usage instructions
3. Create implementation script
4. Add to `plugin.json`

### Create an Agent

1. Create `agents/my-agent.agent.md` with:
   - Persona
   - Available tools
   - Workflow steps
   - Safety constraints
2. Add to `plugin.json`
3. Test in chat

## Testing

Run plugin validation:
```bash
npm run validate
```

Run tests:
```bash
npm test
```

## Troubleshooting

### Plugin not loading
- Check `chat.pluginLocations` setting
- Verify file paths exist
- Check VS Code console for errors

### MCP server connection failed
- Verify environment variables (PORTAL_USER, PORTAL_PASS)
- Check mcp-oracle-db setup
- Restart VS Code

### Submission failed
- Check dry-run results first
- Verify approval limits
- Check required documents
- Review error diagnostics

See [RUNBOOK.md](./RUNBOOK.md) for more troubleshooting.

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- 📖 [Architecture](./ARCHITECTURE.md)
- 📋 [Runbook](./RUNBOOK.md)
- 🐛 [Issues](https://github.com/fadil369/nphies-claims-plugin/issues)
- 💬 [Discussions](https://github.com/fadil369/nphies-claims-plugin/discussions)

## Author

NPHIES Automation Team

---

**Status**: Phase 1 - Foundation Complete ✓  
**Last Updated**: April 7, 2026  
**Version**: 1.0.0
