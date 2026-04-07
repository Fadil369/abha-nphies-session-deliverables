// Slash command implementations for NPHIES Claims Plugin
// These are quick-access commands for common workflows

module.exports = {
  commands: [
    {
      id: "nphies-validate",
      name: "Validate Claim",
      description: "Validate single claim against NPHIES requirements",
      category: "validation",
      prompt: `You are helping validate a single NPHIES claim.

Guide the user through:
1. Claim details (amount, service type, patient ID)
2. Rejection code (if known)
3. Available documents
4. Branch (Riyadh or ABHA)

Then:
- Use claim-triage skill to analyze
- Use doc-validation skill to check documents
- Use approval-limits skill to verify limits
- Provide clear validation report with next steps`,
      example: "/nphies-validate\nUser provides: BE-1-4, 5000 SAR, professional, riyadh"
    },
    
    {
      id: "nphies-submit",
      name: "Submit Batch",
      description: "Submit batch of claims from CSV file with progress tracking",
      category: "submission",
      prompt: `You are helping submit a batch of claims to NPHIES.

Guide the user:
1. Ask for CSV file location
2. Confirm branch (Riyadh or ABHA)
3. Confirm dry-run mode (recommended: true)
4. Ask for batch size (default: 5 Riyadh, 10 ABHA)

Then:
- Parse CSV using batch-processor skill
- Execute dry-run submission
- Show progress and results
- Ask for confirmation before live submission
- Track audit trail

Important: Require 3 successful dry-runs before live submission.`,
      example: "/nphies-submit\nUser provides: claims.csv, riyadh, dry-run=true"
    },

    {
      id: "nphies-appeal",
      name: "Appeal Claim",
      description: "Analyze rejection and prepare appeal strategy",
      category: "appeals",
      prompt: `You are helping appeal a rejected NPHIES claim.

Guide the user:
1. Provide rejection code (e.g., BE-1-4, MN-1-1)
2. Provide claim ID and original amount
3. Ask what's known about rejection reason

Then:
- Use claim-triage to analyze rejection
- Identify root cause
- Recommend appeal strategy
- List required documents
- Provide message templates
- Estimate success probability

Help user prepare complete appeal package.`,
      example: "/nphies-appeal\nUser provides: BE-1-4, C001, 5000 SAR"
    },

    {
      id: "nphies-hydrate",
      name: "Hydrate Limits",
      description: "Refresh approval limits from Oasis (ABHA only)",
      category: "limits",
      prompt: `You are refreshing approval limits from Oasis system.

Guide the user:
1. Confirm branch is ABHA
2. Ask if hydrating specific patient or all patients
3. Provide patient IDs if applicable

Then:
- Use approval-limits skill with hydrate mode
- Load fresh limits from Oasis
- Show which patients/providers have been updated
- Flag any patients with near-limit balances
- Provide summary of changes

Important: This is ABHA-specific and recommended before ABHA batch submission.`,
      example: "/nphies-hydrate --branch abha\nFreshens all patient limits"
    },

    {
      id: "nphies-batch",
      name: "Process Batch",
      description: "Full batch processing: validate, dry-run, then submit",
      category: "batch",
      prompt: `You are processing a complete batch workflow.

Steps:
1. Ask for CSV file with claims
2. Confirm branch (Riyadh or ABHA)
3. Run validation on all claims
4. If ABHA: Run hydrate first
5. Execute dry-run
6. If dry-run <90%: Fix failures and retry
7. Once dry-run >90%: Ask for live submission confirmation
8. Execute live submission
9. Provide audit trail and next steps

Guide user through entire workflow with clear status at each step.`,
      example: "/nphies-batch --file claims.csv --branch riyadh"
    },

    {
      id: "nphies-status",
      name: "Check Status",
      description: "Check current batch processing status and results",
      category: "monitoring",
      prompt: `You are checking the status of a running or completed batch.

Guide the user:
1. Ask for batch ID (format: BATCH-YYYY-MM-DD-XXXX)
2. Or ask to show latest batch

Then:
- Read artifacts/rajhi_portal_progress.json
- Show current progress (X of Y claims processed)
- Show success/failure rate
- List recent failures with reasons
- Show audit trail for this batch
- Provide next action recommendations

Help user monitor long-running batches and understand results.`,
      example: "/nphies-status --batch BATCH-20260407-001"
    }
  ],

  // Command invocation logic
  async invoke(commandId, params = {}) {
    const command = this.commands.find(c => c.id === commandId);
    if (!command) {
      throw new Error(`Command not found: ${commandId}`);
    }

    return {
      commandId,
      name: command.name,
      prompt: command.prompt,
      example: command.example,
      category: command.category,
      instructions: [
        `You are executing the ${command.name} workflow.`,
        command.prompt,
        `Always ask clarifying questions if needed.`,
        `Provide clear, actionable results.`,
        `Include next steps in every response.`
      ].join('\n\n')
    };
  },

  // Get available commands for display
  getAll() {
    return this.commands.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category
    }));
  },

  // Get commands by category
  getByCategory(category) {
    return this.commands.filter(c => c.category === category);
  }
};
