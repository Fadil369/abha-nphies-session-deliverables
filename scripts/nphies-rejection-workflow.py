#!/usr/bin/env python3
"""
NPHIES Rejection Workflow - Analyze rejections and prepare corrective actions
Processes BE-1-4 (Preauth), MN-1-1 (Clinical), CV-1-3 (Not Covered) cases
"""
import json
import csv
from pathlib import Path
from datetime import datetime
from collections import defaultdict

def load_claim_data():
    """Load all claim and appeal data"""
    with open('outputs/rajhi-appeal-prep/claim_appeal_summary.csv', 'r', encoding='utf-8') as f:
        claims = {row['TransactionID']: row for row in csv.DictReader(f)}
    
    with open('artifacts/rajhi_portal_data.json', 'r', encoding='utf-8') as f:
        portal_data = json.load(f)
    
    with open('outputs/rajhi-appeal-prep/appeal_summary.json', 'r', encoding='utf-8') as f:
        appeals = json.load(f)
    
    return claims, portal_data, appeals

def categorize_rejections(claims, portal_data):
    """Categorize rejections by code and prepare corrective actions"""
    
    categories = {
        'BE-1-4': {
            'name': 'Preauthorization Required',
            'action': 'Request retroactive preauthorization',
            'documents_needed': ['Service details', 'Medical justification', 'Policy information'],
            'priority': 'HIGH',
            'recovery_rate': 0.70,
            'cases': []
        },
        'MN-1-1': {
            'name': 'Clinical Justification Required',
            'action': 'Provide clinical evidence and medical records',
            'documents_needed': ['Medical records', 'Diagnosis codes (ICD-10)', 'Clinical notes', 'Lab/Radiology results'],
            'priority': 'HIGH',
            'recovery_rate': 0.40,
            'cases': []
        },
        'CV-1-3': {
            'name': 'Service Not Covered',
            'action': 'Verify coverage or request benefit review',
            'documents_needed': ['Policy coverage details', 'Alternative service codes', 'Member authorization'],
            'priority': 'MEDIUM',
            'recovery_rate': 0.10,
            'cases': []
        },
        'BE-1-3': {
            'name': 'Submission Non-Compliant',
            'action': 'Correct compliance issues and resubmit',
            'documents_needed': ['Corrected claim data', 'Policy verification', 'Service code mapping'],
            'priority': 'MEDIUM',
            'recovery_rate': 0.65,
            'cases': []
        },
        'SE-1-6': {
            'name': 'Investigation Results Missing',
            'action': 'Attach X-ray/lab investigation results',
            'documents_needed': ['X-ray images', 'Lab test results', 'Investigation report'],
            'priority': 'MEDIUM',
            'recovery_rate': 0.60,
            'cases': []
        },
        'AD-1-4': {
            'name': 'Diagnosis Code Mismatch',
            'action': 'Correct diagnosis codes (ICD-10)',
            'documents_needed': ['Corrected ICD-10 codes', 'Medical records', 'Diagnosis verification'],
            'priority': 'LOW',
            'recovery_rate': 0.45,
            'cases': []
        }
    }
    
    # Group cases by rejection code
    for item in portal_data:
        txn = item['InvoiceNo']
        codes = item.get('Codes', '').split(',')
        
        for code in codes:
            code = code.strip()
            if code in categories:
                categories[code]['cases'].append({
                    'transaction_id': txn,
                    'amount': item['NetAmount'],
                    'claim_type': item['ClaimType'],
                    'readiness': item.get('Readiness', 'Unknown'),
                    'needs_oracle': item.get('NeedsOracle', False),
                    'needs_limit': item.get('NeedsLimit', False),
                })
    
    return categories

def generate_workflow_plan(categories):
    """Generate detailed workflow plan"""
    
    workflow_plan = {
        'timestamp': datetime.now().isoformat(),
        'batch_id': 'BAT-2026-NB-00004295-OT',
        'summary': {},
        'action_items': [],
        'timeline': []
    }
    
    print("\n" + "="*100)
    print("NPHIES REJECTION WORKFLOW PLAN")
    print("="*100)
    
    total_amount = 0
    total_recovery = 0
    
    for code, info in sorted(categories.items()):
        case_count = len(info['cases'])
        if case_count == 0:
            continue
        
        total_cases_amount = sum(c['amount'] for c in info['cases'])
        estimated_recovery = total_cases_amount * info['recovery_rate']
        
        total_amount += total_cases_amount
        total_recovery += estimated_recovery
        
        workflow_plan['summary'][code] = {
            'name': info['name'],
            'case_count': case_count,
            'total_amount': total_cases_amount,
            'estimated_recovery': estimated_recovery,
            'recovery_rate': f"{info['recovery_rate']*100:.0f}%",
            'priority': info['priority']
        }
        
        print(f"\n[{code}] {info['name']}")
        print(f"  Cases: {case_count} | Amount: SAR {total_cases_amount:,.2f} | Priority: {info['priority']}")
        print(f"  Action: {info['action']}")
        print(f"  Documents Needed: {', '.join(info['documents_needed'])}")
        print(f"  Estimated Recovery: SAR {estimated_recovery:,.2f} ({info['recovery_rate']*100:.0f}%)")
        print(f"  Sample Cases:")
        
        for case in info['cases'][:3]:
            print(f"    - Txn {case['transaction_id']}: SAR {case['amount']} ({case['claim_type']})")
        
        if case_count > 3:
            print(f"    ... and {case_count - 3} more cases")
        
        # Add system workflow action items
        if code == 'BE-1-4':
            workflow_plan['action_items'].append({
                'priority': 'HIGH',
                'action': f"Submit {case_count} BE-1-4 (Preauth) appeals to NPHIES",
                'expected_response_time': '3-5 business days',
                'follow_up': 'Monitor for payer approval/denial'
            })
        elif code == 'MN-1-1':
            workflow_plan['action_items'].append({
                'priority': 'HIGH',
                'action': f"Submit {case_count} MN-1-1 (Clinical) appeals with supporting docs",
                'expected_response_time': '5-7 business days',
                'follow_up': 'Prepare additional clinical evidence if needed'
            })
        elif code == 'CV-1-3':
            workflow_plan['action_items'].append({
                'priority': 'MEDIUM',
                'action': f"Request coverage verification for {case_count} CV-1-3 cases",
                'expected_response_time': '2-4 business days',
                'follow_up': 'Explore alternative service codes'
            })
    
    print(f"\n{'='*100}")
    print(f"FINANCIAL SUMMARY")
    print(f"{'='*100}")
    print(f"Total Cases: {sum(len(info['cases']) for info in categories.values())}")
    print(f"Total Amount: SAR {total_amount:,.2f}")
    print(f"Estimated Recovery: SAR {total_recovery:,.2f}")
    print(f"Recovery Rate: {(total_recovery/total_amount*100):.1f}%" if total_amount > 0 else "N/A")
    
    return workflow_plan

def generate_corrective_action_report(categories, claims):
    """Generate detailed corrective action report"""
    
    report_dir = Path('outputs/rajhi-nphies-workflow')
    report_dir.mkdir(exist_ok=True)
    
    # Create detailed action list by rejection code
    for code, info in categories.items():
        if len(info['cases']) == 0:
            continue
        
        action_file = report_dir / f"action_required_{code}.csv"
        
        with open(action_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'TransactionID', 'Amount', 'ClaimType', 'Member', 'NationalID', 'Policy',
                'RejectionCode', 'AppealAction', 'DocumentsNeeded', 'Priority', 'EstRecovery'
            ])
            
            for case in info['cases']:
                txn = case['transaction_id']
                claim = claims.get(txn, {})
                recovery = case['amount'] * info['recovery_rate']
                
                writer.writerow([
                    txn,
                    case['amount'],
                    case['claim_type'],
                    claim.get('MemberName', 'N/A'),
                    claim.get('NationalID', 'N/A'),
                    claim.get('PolicyNo', 'N/A'),
                    code,
                    info['action'],
                    '; '.join(info['documents_needed']),
                    info['priority'],
                    recovery
                ])
        
        print(f"\n✓ Generated: {action_file}")
    
    return report_dir

def main():
    print("\nLoading claim data...")
    claims, portal_data, appeals = load_claim_data()
    
    print(f"Loaded {len(claims)} claims, {len(portal_data)} portal items, {len(appeals)} appeals")
    
    print("\nCategorizing rejections...")
    categories = categorize_rejections(claims, portal_data)
    
    print("\nGenerating workflow plan...")
    workflow_plan = generate_workflow_plan(categories)
    
    print("\nGenerating corrective action reports...")
    report_dir = generate_corrective_action_report(categories, claims)
    
    # Save workflow plan
    with open(report_dir / 'workflow_plan.json', 'w', encoding='utf-8') as f:
        json.dump(workflow_plan, f, indent=2, default=str)
    
    print(f"\n✓ Workflow plan saved: {report_dir / 'workflow_plan.json'}")
    print(f"\n✓ All corrective action reports generated in: {report_dir}")

if __name__ == '__main__':
    main()
