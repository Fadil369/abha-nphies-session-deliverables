#!/usr/bin/env python3
"""
Oracle Submission Helper - Extract appeal content for manual submission
Usage: python3 oracle-submission-helper.py [rejection-code]
Example: python3 oracle-submission-helper.py BE-1-4
"""
import json
import sys
from pathlib import Path

def get_appeal_content(transaction_id):
    """Retrieve appeal content for a specific transaction"""
    with open('artifacts/rajhi_portal_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for item in data:
        if str(item['InvoiceNo']) == str(transaction_id):
            return item.get('Content', '')
    return None

def get_txns_by_code(code):
    """Get all transactions for a specific rejection code"""
    txns = []
    with open('artifacts/rajhi_portal_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for item in data:
        if code in item.get('Codes', ''):
            txns.append({
                'txn': item['InvoiceNo'],
                'amount': item['NetAmount'],
                'type': item['ClaimType'],
                'content': item['Content']
            })
    return txns

def main():
    if len(sys.argv) < 2:
        print("ORACLE SUBMISSION HELPER\n")
        print("Usage: python3 oracle-submission-helper.py [option] [value]\n")
        print("Options:")
        print("  --code BE-1-4          Show all BE-1-4 cases")
        print("  --code MN-1-1          Show all MN-1-1 cases")  
        print("  --txn 6629884          Show content for specific transaction")
        print("  --batch [file]         Process batch from CSV file\n")
        print("Examples:")
        print("  python3 oracle-submission-helper.py --code BE-1-4")
        print("  python3 oracle-submission-helper.py --txn 6629884")
        return
    
    option = sys.argv[1]
    
    if option == '--txn' and len(sys.argv) > 2:
        txn = sys.argv[2]
        content = get_appeal_content(txn)
        if content:
            print(f"\n{'='*100}")
            print(f"APPEAL CONTENT - TRANSACTION {txn}")
            print(f"{'='*100}\n")
            print(content)
            print(f"\n{'='*100}")
            print("✓ Copy the above content to Oracle portal submission dialog\n")
        else:
            print(f"Transaction {txn} not found")
    
    elif option == '--code' and len(sys.argv) > 2:
        code = sys.argv[2]
        txns = get_txns_by_code(code)
        
        if txns:
            print(f"\n{'='*100}")
            print(f"TRANSACTIONS WITH CODE: {code} ({len(txns)} cases)")
            print(f"{'='*100}\n")
            
            total_amount = sum(t['amount'] for t in txns)
            print(f"Total Cases: {len(txns)}")
            print(f"Total Amount: SAR {total_amount:,.2f}\n")
            
            for i, txn_data in enumerate(txns[:10], 1):
                print(f"{i:2d}. Txn: {txn_data['txn']} | Amount: SAR {txn_data['amount']:>10.2f} | Type: {txn_data['type']}")
            
            if len(txns) > 10:
                print(f"    ... and {len(txns) - 10} more cases\n")
            
            # Create a submission order file
            output_file = f'submissions_{code}.txt'
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(f"SUBMISSION SEQUENCE - {code}\n")
                f.write("="*80 + "\n\n")
                for i, txn_data in enumerate(txns, 1):
                    f.write(f"SUBMISSION #{i}\n")
                    f.write(f"Transaction ID: {txn_data['txn']}\n")
                    f.write(f"Amount: SAR {txn_data['amount']}\n")
                    f.write(f"Claim Type: {txn_data['type']}\n")
                    f.write(f"\nAPPEAL CONTENT:\n")
                    f.write("-"*80 + "\n")
                    f.write(txn_data['content'])
                    f.write("\n" + "-"*80 + "\n\n")
            
            print(f"✓ Submission file created: {output_file}")
            print(f"  Use this file as reference while submitting to Oracle portal\n")
        else:
            print(f"No transactions found with code {code}")

if __name__ == '__main__':
    main()
