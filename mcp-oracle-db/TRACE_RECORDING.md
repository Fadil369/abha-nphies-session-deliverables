# Portal Trace Recording

Use the trace runner when you want a headed Oracle portal session that records:

- Playwright trace with screenshots and DOM snapshots
- HAR request/response traffic for the session
- Manual click/change/submit steps into a JSONL step log
- Downloaded documents into a scenario-specific folder

## Quick start

From [mcp-oracle-db](/Users/fadil369/abha-nphies-session-deliverables-1/mcp-oracle-db):

```bash
npm run trace:portal -- --branch riyadh --scenario claims-submission
```

Common presets:

```bash
npm run trace:claims
npm run trace:documents
```

The runner opens a headed browser, starts tracing immediately, and saves artifacts under `.portal-traces/`.

## Scenarios

- `home`: start at the branch home/login page and let the operator drive everything.
- `claims-submission`: pre-navigate to Claims Submission when the session is ready.
- `claim-search`: pre-navigate to `MANAGECLAIMS`.
- `document-retrieval`: start from Claims Submission and capture downloads.
- `approvals`: pre-navigate to `MANAGEAPPROVALSTF`.
- `patient-search`: pre-navigate to `PATIENTSEARCHTF`.

## Useful flags

```bash
node src/portal-trace-runner.js --branch riyadh --scenario document-retrieval --label docs-run
node src/portal-trace-runner.js --branch abha --scenario patient-search --duration-ms 15000
node src/portal-trace-runner.js --branch riyadh --task-flow MANAGECLAIMS
```

- `--label`: append a readable suffix to the trace folder.
- `--duration-ms`: auto-stop after the given duration instead of waiting for Enter.
- `--task-flow`: override the built-in scenario navigation target.
- `--use-direct-ip`: force internal-IP access instead of the Cloudflare URL.

## Outputs

Each run creates a folder like:

```text
.portal-traces/2026-04-16T12-00-00-000Z-riyadh-claims-submission/
```

The folder contains:

- `metadata.json`: branch, scenario, URLs, and run summary.
- `playwright-trace.zip`: Playwright trace for the session.
- `session.har`: network capture for request/response review.
- `steps.jsonl`: user interaction trail.
- `network.jsonl`: summarized request/response events.
- `downloads/`: saved downloaded documents.

Keep these artifacts local. They are ignored by git.
