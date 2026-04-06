#!/usr/bin/env python3
"""
Build NPHIES FHIR CommunicationRequest appeal bundles for
BAT-2026-NB-00004295-OT (Al-Rajhi Insurance – Riyadh / Al-Hayat NH)

Reads:  outputs/rajhi-appeal-prep/appeal_summary.json
Writes: outputs/rajhi-appeal-execution/bundles/appeal_<bundleId>_<readiness>.json
        outputs/rajhi-appeal-execution/execution_report.json
        outputs/rajhi-appeal-execution/execution_results.csv
"""
import json, csv, os, sys, re
from datetime import datetime, timezone
from collections import defaultdict

# ─── Paths ──────────────────────────────────────────────────────────────────
BASE      = "/Users/fadil369/abha-nphies-session-deliverables-1"
PREP_JSON = f"{BASE}/outputs/rajhi-appeal-prep/appeal_summary.json"
TS        = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
OUT_DIR   = f"{BASE}/outputs/rajhi-appeal-execution"
BUNDLE_DIR= f"{OUT_DIR}/bundles"
os.makedirs(BUNDLE_DIR, exist_ok=True)

# ─── Load prep data ─────────────────────────────────────────────────────────
with open(PREP_JSON, encoding='utf-8') as f:
    prep = json.load(f)

payer    = prep['payer']
provider = prep['provider']
claims   = prep['claims']
fin      = prep['financial_summary']

print(f"Loaded {len(claims)} claim records")
print(f"Provider: {provider['name']} ({provider['license']})")
print(f"Payer:    {payer['name']} ({payer['license']})")

# ─── Group claims by bundle_id ───────────────────────────────────────────────
bundle_claims = defaultdict(list)
for c in claims:
    bundle_claims[c['bundle_id']].append(c)

print(f"Unique bundles: {len(bundle_claims)}")

# ─── ART protocol action text per code ──────────────────────────────────────
ACTION_TEXT = {
    'BE-1-4': (
        "PREAUTHORIZATION APPEAL: The service was provided without prior authorization "
        "due to clinical urgency / administrative oversight. We hereby submit a retroactive "
        "preauthorization request with full clinical justification as required under ART PreAuth "
        "Protocol Section: General Requirements. All supporting clinical documentation is attached."
    ),
    'MN-1-1': (
        "CLINICAL JUSTIFICATION APPEAL: The service is clinically justified as evidenced by the "
        "attached medical records, diagnosis codes, and clinical pathway documentation. The service "
        "aligns with accepted Clinical Practice Guidelines (CPG) and was medically necessary for "
        "the patient's condition."
    ),
    'CV-1-3': (
        "COVERAGE VERIFICATION APPEAL: We are appealing the coverage determination and requesting "
        "re-adjudication based on the attached policy benefit schedule. If the primary diagnosis is "
        "excluded, we request consideration of the secondary covered diagnosis as documented in the "
        "clinical notes."
    ),
    'BE-1-3': (
        "CONTRACTUAL COMPLIANCE APPEAL: The service codes have been reviewed against the contractual "
        "agreement. Corrected service codes are provided in this resubmission per the agreed tariff "
        "schedule. We request re-adjudication under the correct code mapping."
    ),
    'SE-1-6': (
        "SUPPORTING EVIDENCE APPEAL: The missing investigation results (laboratory/radiology) are "
        "attached to this communication as supporting evidence. These results confirm the medical "
        "necessity and clinical justification for the service rendered."
    ),
    'AD-1-4': (
        "DIAGNOSIS-SERVICE ALIGNMENT APPEAL: The diagnosis codes have been reviewed and corrected "
        "to accurately reflect the clinical picture. The corrected ICD-10 codes are consistent with "
        "the service provided. We request re-adjudication with the updated coding."
    ),
    'CV-1-9': (
        "COVERAGE APPEAL: Member eligibility and benefit coverage have been verified as confirmed by "
        "the attached eligibility documents. We request re-adjudication under the verified coverage."
    ),
    'AD-3-7': (
        "ADDITIONAL INFORMATION APPEAL: The additional documentation requested for adjudication is "
        "attached herewith. This includes all relevant clinical records, reports, and supporting "
        "materials required for complete adjudication."
    ),
    'AD-2-4': (
        "DUPLICATE REVIEW APPEAL: This claim was flagged as a duplicate. We have verified that the "
        "original claim has not been settled. The claim represents a unique service encounter and "
        "should be adjudicated independently."
    ),
}

# ─── Build FHIR bundles ──────────────────────────────────────────────────────
results = []
now_ts  = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

for bundle_id, bundle_cls in bundle_claims.items():
    first   = bundle_cls[0]
    readiness = (
        'READY_AUTO_APPEAL'   if first['preventable'] == 'YES'
        else 'PARTIAL_AUTO_APPEAL' if first['preventable'] == 'PARTIALLY'
        else 'MANUAL_REVIEW'
    )

    # Group rejection codes within bundle
    by_code = defaultdict(list)
    for c in bundle_cls:
        by_code[c['rejection_code']].append(c)

    # Build payload text
    lines = [
        f"APPEAL REQUEST – Al-Rajhi Riyadh Batch {prep['batch_no']}",
        f"Bundle ID: {bundle_id}",
        f"Transaction ID: {first.get('transaction_id','')}",
        f"Patient: {first['member_name']} (NID: {first['national_id']})",
        f"Policy: {first.get('policy_number','')}",
        "",
        "REJECTION DETAILS:",
    ]

    for code, code_claims in sorted(by_code.items()):
        lines.append(f"  Code {code}: {code_claims[0].get('rejection_code','')}")
        lines.append(f"  Services affected: {len(code_claims)}")
        for cc in code_claims:
            lines.append(f"    • {cc['service_date']} | {cc['service_code']} – {cc['service_name']}")
        lines.append("")
        action = ACTION_TEXT.get(code, "Request re-adjudication with supporting documentation.")
        lines.append(f"APPEAL JUSTIFICATION ({code}):")
        lines.append(action)
        lines.append(f"Supporting Documents: {code_claims[0].get('docs_required','')}")
        lines.append("")

    # Financial summary for this bundle
    net_amts = [c.get('net_amount') or 0 for c in bundle_cls]
    total_net = sum(net_amts)
    if total_net:
        lines += [
            "FINANCIAL SUMMARY:",
            f"  Total Claimed: SAR {total_net:,.2f}",
            f"  Lines Rejected: {len(bundle_cls)}",
            "",
        ]

    lines += [
        "---",
        f"Provider: {provider['name']} | License: {provider['license']}",
        f"Payer: {payer['name']} | License: {payer['license']}",
        f"Batch: {prep['batch_no']} | Period: {prep['period']}",
    ]

    payload_text = "\n".join(lines)

    # Determine primary rejection code
    primary_code = max(by_code, key=lambda k: len(by_code[k]))

    bundle = {
        "facility_id": 1,
        "fhir_payload": {
            "resourceType": "CommunicationRequest",
            "id": f"appeal-{re.sub(r'[^a-zA-Z0-9]', '-', bundle_id)}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "status": "active",
            "category": [
                {
                    "coding": [
                        {
                            "system": "http://nphies.sa/terminology/CodeSystem/communication-category",
                            "code": "re-adjudication",
                            "display": "Re-Adjudication Request"
                        }
                    ]
                }
            ],
            "priority": "routine",
            "subject": {
                "identifier": {
                    "system": "http://nphies.sa/identifier/patient",
                    "value": first['national_id']
                },
                "display": first['member_name']
            },
            "about": [
                {
                    "type": "Claim",
                    "identifier": {
                        "system": "http://nphies.sa/identifier/claim",
                        "value": bundle_id
                    }
                }
            ],
            "sender": {
                "type": "Organization",
                "identifier": {
                    "system": provider['system'],
                    "value": provider['license']
                },
                "display": provider['name']
            },
            "recipient": [
                {
                    "type": "Organization",
                    "identifier": {
                        "system": payer['system'],
                        "value": payer['license']
                    },
                    "display": payer['name']
                }
            ],
            "reasonCode": [
                {
                    "coding": [
                        {
                            "system": "http://nphies.sa/terminology/CodeSystem/rejection-reason",
                            "code": primary_code
                        }
                    ],
                    "text": "re-adjudication"
                }
            ],
            "payload": [
                {
                    "contentString": payload_text
                }
            ],
            "authoredOn": now_ts
        },
        "signature": "",
        "resource_type": "CommunicationRequest"
    }

    # Write bundle file
    safe_id   = re.sub(r'[^a-zA-Z0-9_-]', '_', bundle_id)
    filename  = f"appeal_{safe_id}_{readiness}.json"
    filepath  = f"{BUNDLE_DIR}/{filename}"
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, indent=2, ensure_ascii=False)

    results.append({
        'bundle_id':       bundle_id,
        'member_name':     first['member_name'],
        'national_id':     first['national_id'],
        'primary_code':    primary_code,
        'rejection_codes': ', '.join(sorted(by_code.keys())),
        'lines_rejected':  len(bundle_cls),
        'readiness':       readiness,
        'filename':        filename,
        'net_amount':      total_net,
        'status':          'GENERATED',
    })

print(f"\nGenerated {len(results)} FHIR bundles in {BUNDLE_DIR}")

# ─── Write execution report ──────────────────────────────────────────────────
by_readiness = defaultdict(int)
for r in results:
    by_readiness[r['readiness']] += 1

report = {
    "batch_no":       prep['batch_no'],
    "period":         prep['period'],
    "generated_at":   datetime.now(timezone.utc).isoformat(),
    "provider":       provider,
    "payer":          payer,
    "totals": {
        "bundles_generated":   len(results),
        "READY_AUTO_APPEAL":   by_readiness.get('READY_AUTO_APPEAL', 0),
        "PARTIAL_AUTO_APPEAL": by_readiness.get('PARTIAL_AUTO_APPEAL', 0),
        "MANUAL_REVIEW":       by_readiness.get('MANUAL_REVIEW', 0),
    },
    "financial": {
        "net_claimed":        fin['net_claimed'],
        "rejected":           fin['rejected_amount'],
        "approved":           fin['approved_amount'],
        "estimated_recovery": fin['estimated_recovery'],
        "net_exposure":       fin['net_exposure'],
    },
    "bundles": results,
}

with open(f"{OUT_DIR}/execution_report.json", 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)

# ─── Write CSV results ───────────────────────────────────────────────────────
with open(f"{OUT_DIR}/execution_results.csv", 'w', newline='', encoding='utf-8') as f:
    wr = csv.DictWriter(f, fieldnames=results[0].keys())
    wr.writeheader()
    wr.writerows(results)

# ─── Summary ─────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"  FHIR BUNDLE GENERATION COMPLETE")
print(f"{'='*60}")
print(f"  Batch:             {prep['batch_no']}")
print(f"  Bundles Generated: {len(results)}")
print(f"  READY_AUTO:        {by_readiness.get('READY_AUTO_APPEAL',0)}")
print(f"  PARTIAL_AUTO:      {by_readiness.get('PARTIAL_AUTO_APPEAL',0)}")
print(f"  MANUAL_REVIEW:     {by_readiness.get('MANUAL_REVIEW',0)}")
print(f"  Rejected Amount:   SAR {fin['rejected_amount']:,.2f}")
print(f"  Est. Recovery:     SAR {fin['estimated_recovery']:,.2f}")
print(f"  Net Exposure:      SAR {fin['net_exposure']:,.2f}")
print(f"  Output:            {OUT_DIR}")
print(f"{'='*60}")
