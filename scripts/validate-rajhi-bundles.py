#!/usr/bin/env python3
"""
Pre-submission validation for Al-Rajhi appeal bundles.

Checks each bundle against three criteria:
  1. ORACLE_DOC_NEEDED  – claim type/code requires a document from Oracle portal
                          (SE-1-6, AD-3-7, or oral/dental claims)
  2. APPROVAL_LIMIT     – single-claim net amount > 500 SAR (needs supervisor sign-off
                          in some payer workflows)
  3. READY              – can go directly to portal submission

Writes:
  outputs/rajhi-appeal-prep/validation_report.json   – full per-bundle validation
  outputs/rajhi-appeal-prep/oracle_doc_queue.csv      – claims needing Oracle docs
  outputs/rajhi-appeal-prep/approval_limit_queue.csv  – claims needing limit check
  artifacts/rajhi_portal_data.json                    – portal automation input
"""
import json, csv, os
from collections import defaultdict

BASE    = "/Users/fadil369/abha-nphies-session-deliverables-1"
PREP_DIR = f"{BASE}/outputs/rajhi-appeal-prep"
BUNDLE_DIR = f"{BASE}/outputs/rajhi-appeal-execution/bundles"
EXEC_CSV   = f"{BASE}/outputs/rajhi-appeal-execution/execution_results.csv"
CLAIM_SUMMARY_CSV = f"{PREP_DIR}/claim_appeal_summary.csv"
VAL_JSON   = f"{PREP_DIR}/validation_report.json"
ORACLE_CSV = f"{PREP_DIR}/oracle_doc_queue.csv"
LIMIT_CSV  = f"{PREP_DIR}/approval_limit_queue.csv"
PORTAL_JSON= f"{BASE}/artifacts/rajhi_portal_data.json"

# ─── Rules ────────────────────────────────────────────────────────────────────
# Codes that require a supporting document to be fetched from Oracle
ORACLE_DOC_CODES = {'SE-1-6', 'AD-3-7'}
# Claim types that need supporting images from Oracle (dental X-ray, etc.)
ORACLE_DOC_TYPES = {'oral'}
# SAR threshold above which approval limit check is needed
APPROVAL_LIMIT_SAR = 500.0
# Codes that are always manual (no auto path)
ALWAYS_MANUAL = {'CV-1-3', 'CV-1-9', 'Override Reason'}

# ─── Load execution results ───────────────────────────────────────────────────
import csv as csvmod
with open(EXEC_CSV, newline='', encoding='utf-8') as f:
    bundles = list(csvmod.DictReader(f))

print(f"Loaded {len(bundles)} bundles for validation")

# ─── Load full claim details from appeal_summary.json ────────────────────────
with open(f"{PREP_DIR}/appeal_summary.json", encoding='utf-8') as f:
    prep = json.load(f)

claim_by_bundle = defaultdict(list)
for c in prep['claims']:
    claim_by_bundle[c['bundle_id']].append(c)

# claim_appeal_summary contains transactional fields not present in execution_results.csv
summary_by_bundle = {}
with open(CLAIM_SUMMARY_CSV, newline='', encoding='utf-8') as f:
    for row in csvmod.DictReader(f):
        bundle_id = row.get('BundleID')
        if bundle_id and bundle_id not in summary_by_bundle:
            summary_by_bundle[bundle_id] = row

# ─── Classify each bundle ─────────────────────────────────────────────────────
results      = []
oracle_queue = []
limit_queue  = []
portal_ready = []

for b in bundles:
    bundle_id     = b['bundle_id']
    meta          = summary_by_bundle.get(bundle_id, {})
    first_claim   = (claim_by_bundle.get(bundle_id) or [{}])[0]

    # execution_results.csv produced by build-rajhi-appeals.py does not include transaction fields
    txn_id        = str(meta.get('TransactionID') or first_claim.get('transaction_id') or '').replace('.0', '')
    codes         = [c.strip() for c in b['rejection_codes'].split(',')]
    claim_type    = (meta.get('ClaimType') or first_claim.get('claim_type') or 'Unknown').lower()
    readiness     = b['readiness']
    net           = float(b['net_amount'] or 0)
    lines         = int(b['lines_rejected'] or 0)
    member        = meta.get('MemberName') or b.get('member_name') or first_claim.get('member_name', '')
    national_id   = str(meta.get('NationalID') or b.get('national_id') or first_claim.get('national_id', ''))
    policy_no     = str(meta.get('PolicyNo') or first_claim.get('policy_number') or '').replace('.0', '')
    claim_lines   = claim_by_bundle.get(bundle_id, [])

    flags = []

    # 1. Oracle doc needed?
    needs_oracle = (
        any(c in ORACLE_DOC_CODES for c in codes) or
        claim_type in ORACLE_DOC_TYPES
    )
    if needs_oracle:
        flags.append('ORACLE_DOC_NEEDED')
        oracle_queue.append({
            'bundle_id':     bundle_id,
            'transaction_id': txn_id,
            'member_name':   member,
            'national_id':   national_id,
            'claim_type':    claim_type,
            'rejection_codes': b['rejection_codes'],
            'net_amount':    net,
            'policy_number': policy_no,
            'oracle_reason': ', '.join(
                [f'Code {c} requires investigation doc' for c in codes if c in ORACLE_DOC_CODES] +
                (['Oral/Dental type requires X-ray from Oracle'] if claim_type in ORACLE_DOC_TYPES else [])
            ),
            'doc_needed': ('Dental X-ray, periodontal chart' if claim_type == 'oral'
                           else 'Lab/Radiology investigation result'),
        })

    # 2. Approval limit check?
    needs_limit = net > APPROVAL_LIMIT_SAR
    if needs_limit:
        flags.append('APPROVAL_LIMIT_CHECK')
        limit_queue.append({
            'bundle_id':      bundle_id,
            'transaction_id': txn_id,
            'member_name':    member,
            'national_id':    national_id,
            'claim_type':     claim_type,
            'rejection_codes': b['rejection_codes'],
            'net_amount':     net,
            'lines_rejected': lines,
            'policy_number':  policy_no,
            'limit_threshold': APPROVAL_LIMIT_SAR,
            'action_required': 'Supervisor approval required before portal submission',
        })

    # 3. Always-manual override
    if any(c in ALWAYS_MANUAL for c in codes) and readiness != 'READY_AUTO_APPEAL':
        flags.append('MANUAL_REVIEW')

    # Final status
    if not flags:
        final_status = 'PORTAL_READY'
    elif 'ORACLE_DOC_NEEDED' in flags and 'APPROVAL_LIMIT_CHECK' not in flags:
        final_status = 'ORACLE_ONLY'
    elif 'APPROVAL_LIMIT_CHECK' in flags and 'ORACLE_DOC_NEEDED' not in flags:
        final_status = 'LIMIT_ONLY'
    elif 'ORACLE_DOC_NEEDED' in flags and 'APPROVAL_LIMIT_CHECK' in flags:
        final_status = 'ORACLE_AND_LIMIT'
    else:
        final_status = 'MANUAL_REVIEW'

    # Build portal content string for submission
    claim_lines_text = []
    for cl in claim_lines:
        claim_lines_text.append(
            f"  • {cl['service_date']} | {cl['service_code']} – {cl['service_name']} "
            f"[{cl['rejection_code']}]"
        )

    from datetime import datetime
    content = (
        f"Re-Adjudication Request – Al-Rajhi Batch {prep['batch_no']}\n"
        f"Transaction: {txn_id}\n"
        f"Patient: {member} (NID: {national_id})\n"
        f"Policy: {policy_no}\n"
        f"Claim Type: {claim_type}\n"
        f"Net Claimed: SAR {net:,.2f}\n"
        f"\nRejected Services:\n" + "\n".join(claim_lines_text) +
        f"\n\nRejection Codes: {b['rejection_codes']}\n"
        f"\nAPPEAL BASIS: Retroactive preauthorization / clinical justification per ART PreAuth Protocol.\n"
        f"All supporting documentation attached.\n"
        f"\nProvider: Al-Hayat National Hospital | License: 10000000000988\n"
        f"Payer: Al-Rajhi Company for Cooperative Insurance | License: 7001593321"
    )

    portal_ready.append({
        'Content':    content,
        'InvoiceNo':  txn_id,
        'BundleID':   bundle_id,
        'Readiness':  readiness,
        'FinalStatus': final_status,
        'Flags':      ', '.join(flags) if flags else 'NONE',
        'NetAmount':  net,
        'ClaimType':  claim_type,
        'Codes':      b['rejection_codes'],
        'NeedsOracle': needs_oracle,
        'NeedsLimit':  needs_limit,
    })

    results.append({
        'bundle_id':     bundle_id,
        'transaction_id': txn_id,
        'member_name':   member,
        'claim_type':    claim_type,
        'rejection_codes': b['rejection_codes'],
        'net_amount':    net,
        'readiness':     readiness,
        'flags':         ', '.join(flags) if flags else 'NONE',
        'final_status':  final_status,
        'portal_ready':  final_status in ('PORTAL_READY', 'LIMIT_ONLY'),
    })

# ─── Write outputs ─────────────────────────────────────────────────────────────
# Validation report JSON
from collections import Counter
status_counts = Counter(r['final_status'] for r in results)
val_report = {
    'batch_no': prep['batch_no'],
    'validated_at': datetime.now().isoformat(),
    'total_bundles': len(results),
    'status_breakdown': dict(status_counts),
    'oracle_doc_needed': len(oracle_queue),
    'approval_limit_needed': len(limit_queue),
    'portal_ready_now': status_counts.get('PORTAL_READY', 0),
    'approval_limit_SAR': APPROVAL_LIMIT_SAR,
    'bundles': results,
}
with open(VAL_JSON, 'w', encoding='utf-8') as f:
    json.dump(val_report, f, indent=2, ensure_ascii=False)

# Oracle doc queue CSV
if oracle_queue:
    with open(ORACLE_CSV, 'w', newline='', encoding='utf-8') as f:
        wr = csvmod.DictWriter(f, fieldnames=oracle_queue[0].keys())
        wr.writeheader(); wr.writerows(oracle_queue)

# Approval limit queue CSV
if limit_queue:
    with open(LIMIT_CSV, 'w', newline='', encoding='utf-8') as f:
        wr = csvmod.DictWriter(f, fieldnames=limit_queue[0].keys())
        wr.writeheader(); wr.writerows(limit_queue)

# Portal data JSON (for Playwright automation)
# Include ALL bundles — script will skip those with flags
portal_json_items = [
    {'Content': p['Content'], 'InvoiceNo': p['InvoiceNo'], 'Readiness': p['Readiness'],
     'BundleID': p['BundleID'], 'FinalStatus': p['FinalStatus'], 'Flags': p['Flags'],
     'NetAmount': p['NetAmount'], 'ClaimType': p['ClaimType'], 'Codes': p['Codes'],
     'NeedsOracle': p['NeedsOracle'], 'NeedsLimit': p['NeedsLimit']}
    for p in sorted(portal_ready, key=lambda x: (
        0 if x['FinalStatus'] == 'PORTAL_READY' else
        1 if x['FinalStatus'] == 'LIMIT_ONLY' else
        2 if x['FinalStatus'] == 'ORACLE_ONLY' else
        3 if x['FinalStatus'] == 'ORACLE_AND_LIMIT' else 4
    ))
]
os.makedirs(f"{BASE}/artifacts", exist_ok=True)
with open(PORTAL_JSON, 'w', encoding='utf-8') as f:
    json.dump(portal_json_items, f, indent=2, ensure_ascii=False)

# ─── Print summary ─────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"  VALIDATION SUMMARY – {prep['batch_no']}")
print(f"{'='*60}")
print(f"  Total bundles:          {len(results)}")
print(f"  PORTAL_READY:           {status_counts.get('PORTAL_READY',0):>3}  → submit now")
print(f"  LIMIT_ONLY:             {status_counts.get('LIMIT_ONLY',0):>3}  → supervisor approval, then submit")
print(f"  ORACLE_ONLY:            {status_counts.get('ORACLE_ONLY',0):>3}  → fetch docs from Oracle, then submit")
print(f"  ORACLE_AND_LIMIT:       {status_counts.get('ORACLE_AND_LIMIT',0):>3}  → Oracle docs + supervisor approval")
print(f"  MANUAL_REVIEW:          {status_counts.get('MANUAL_REVIEW',0):>3}  → manual case review")
print(f"{'─'*60}")
print(f"  Oracle doc queue:       {len(oracle_queue)} bundles → {ORACLE_CSV}")
print(f"  Approval limit queue:   {len(limit_queue)} bundles → {LIMIT_CSV}")
print(f"  Portal data JSON:       {PORTAL_JSON}")
print(f"{'='*60}")

print(f"\nOracle doc queue ({len(oracle_queue)} bundles):")
for o in oracle_queue:
    print(f"  txn={o['transaction_id']:<10} type={o['claim_type']:<15} codes={o['rejection_codes']:<12} net={o['net_amount']:>8.2f}  doc={o['doc_needed']}")

print(f"\nApproval limit queue ({len(limit_queue)} bundles > SAR {APPROVAL_LIMIT_SAR}):")
for l in limit_queue:
    print(f"  txn={l['transaction_id']:<10} type={l['claim_type']:<15} codes={l['rejection_codes']:<12} net={l['net_amount']:>8.2f}")
