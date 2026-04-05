# Abha NPHIES Session Deliverables

This repository contains the deliverables produced during the April 5, 2026 session for MOH Abha claim triage, NPHIES action assignment, and portal review preparation.

## Contents

- `scripts/analyze-abha-nphies.mjs`: Node analysis script used to merge the three Abha workbooks and generate the deliverables.
- `outputs/master_claim_actions.xlsx`: Main line-item action sheet.
- `outputs/master_claim_actions.csv`: CSV export of the main action sheet.
- `outputs/actionable_claims_payload.json`: Actionable NPHIES justification payload with `ClaimItemSequence` and `contentString`.
- `outputs/portal_limit_check_queue.csv`: Claim-level queue for live Oasis approval-limit verification.
- `outputs/analysis_summary.json`: Aggregate counts and notes.

## Final Output Summary

- Filtered rejected or partial line items: `4914`
- Action 1 - Resubmit with Supporting Info: `2181`
- Action 2 - Communication - Contractual Appeal: `2650`
- Action 3 - New Claim - Prior Linkage: `83`
- Claim-level portal limit queue rows: `290`

## Notes

- The packaged outputs are the final validated run from the session.
- The offline Oracle artifact set did not overlap this Abha workbook population, so document filenames and patient approval limits were not live-verified here.
- The Oasis portal was reachable during the session, and the `portal_limit_check_queue.csv` file is the next-step queue for live portal validation.
- If `node` is not available on `PATH` in your environment, the original machine used `C:\nodejs\node.exe`.

## Re-running

The script is included for traceability. It was executed against local source workbooks that are not bundled into this deliverables repository. To rerun it, place the Abha source workbooks and Oracle artifact JSON files in the expected relative paths or adapt the script paths for your environment.