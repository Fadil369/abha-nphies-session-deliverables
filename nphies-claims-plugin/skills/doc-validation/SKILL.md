# Doc Validation Skill

## Purpose
Verify that all required supporting documents are present and properly formatted according to NPHIES requirements before claim submission.

## When to Use This Skill
- Before submitting any claim to verify documentation is complete
- When preparing for an appeal to ensure all supporting evidence is attached
- To identify which documents are missing before submission
- To validate document format compliance
- To check for common documentation errors

## Inputs Required
The skill accepts:
- **rejection_code** (string, optional): The rejection code if known (e.g., "BE-1-4")
- **service_type** (string): Type of service (pharmacy, professional, institutional)
- **documents** (array): List of document objects with:
  - name: Document filename/name
  - type: Document category (medical_record, invoice, receipt, auth, etc.)
  - size_bytes: File size
  - exists: Boolean indicating if document is present
- **branch** (string, optional): "riyadh" or "abha" (default: "riyadh")

## What This Skill Does

1. **Identifies required documents**
   - Based on service type
   - Based on rejection code (if provided)
   - Branch-specific requirements

2. **Validates document presence**
   - Checks if each required document exists
   - Flags missing documents
   - Lists optional documents

3. **Checks document format**
   - File type validation (PDF, TIFF, JPG)
   - File size compliance
   - Page count verification
   - Clarity/quality checks (where applicable)

4. **Verifies document completeness**
   - All pages present
   - No blank pages
   - Required signatures or stamps
   - Date documentation

5. **Provides remediation guidance**
   - Which documents to collect
   - Where to source documents
   - Format requirements
   - Timeline estimates

## Outputs Provided

```javascript
{
  serviceType: "professional",
  branch: "riyadh",
  validationStatus: "INCOMPLETE",
  completionPercentage: 75,
  requiredDocuments: [
    {
      name: "Medical Records",
      category: "medical_record",
      status: "MISSING",
      required: true,
      priority: "CRITICAL",
      notes: "Patient medical records supporting medical necessity"
    },
    {
      name: "Invoice",
      category: "invoice",
      status: "PRESENT",
      required: true,
      priority: "CRITICAL",
      format: "PDF",
      size_bytes: 250000,
      validation: "PASSED"
    }
  ],
  missingDocuments: ["Medical Records"],
  invalidFormats: [],
  allPresent: false,
  readyForSubmission: false,
  remediation: [
    "Request medical records from provider",
    "Ensure records are legible and dated",
    "Submit via patient portal or email"
  ],
  estimatedTimeToComplete: "1-2 business days",
  nextSteps: [
    "Collect missing medical records",
    "Verify all documents are in PDF format",
    "Confirm file sizes are under 10MB each",
    "Proceed to claim validation"
  ]
}
```

## Usage Examples

### Example 1: Validate before professional services claim
```
Use doc-validation for:
  service_type: "professional"
  documents: [
    { name: "Invoice.pdf", type: "invoice", exists: true, size_bytes: 250000 },
    { name: "Medical_Records.pdf", type: "medical_record", exists: false }
  ]
  branch: "riyadh"

Result: INCOMPLETE - Missing medical records, 50% complete
```

### Example 2: Validate with rejection code
```
Use doc-validation for:
  rejection_code: "BE-1-4"
  service_type: "pharmacy"
  documents: [
    { name: "Prescription.pdf", type: "prescription", exists: true },
    { name: "Clinical_Justification.pdf", type: "auth", exists: true },
    { name: "Medical_Records.pdf", type: "medical_record", exists: true }
  ]
  branch: "abha"

Result: COMPLETE - All required documents present, ready for submission
```

## Key Features

✓ **Service-specific requirements** - Different docs for pharmacy vs. professional  
✓ **Rejection code mapping** - Extra docs needed for appeals  
✓ **Format validation** - PDF, TIFF, JPG compliance  
✓ **Size checking** - File size limits per document  
✓ **Branch awareness** - Different requirements for Riyadh vs ABHA  
✓ **Remediation guidance** - Clear steps to collect missing docs  
✓ **Priority flagging** - Critical vs. optional documents  
✓ **Status dashboard** - Completion percentage and ready/not-ready status  

## Integration Points

This skill is used by:
- **submissions-manager agent** - Validates docs before submission
- **appeals-processor agent** - Verifies appeal documentation
- **batch-processor skill** - Validates each claim in batch
- **/nphies-validate command** - Shows doc status
- **PreToolUse hook** - Blocks submission if docs incomplete

## Related Skills

- **claim-triage** - Identifies required docs based on rejection code
- **batch-processor** - Validates docs for all claims in batch

## Document Requirements

### Professional Services (Pharmacy, Doctor, Lab)
- Invoice/Receipt (CRITICAL)
- Medical Records (CRITICAL)
- Prescription (if pharmacy)
- Medical justification (if requested)
- Patient ID (CRITICAL)

### Institutional Services (Hospital)
- Discharge summary (CRITICAL)
- Itemized bill (CRITICAL)
- Medical records (CRITICAL)
- Lab/imaging reports (if applicable)
- Patient ID (CRITICAL)

### Appeals
- Original claim reference (CRITICAL)
- Rejection explanation (CRITICAL)
- Appeal justification (CRITICAL)
- Additional medical evidence (if applicable)
- Corrected information (if applicable)

## Format Requirements

- **Accepted formats**: PDF, TIFF (multi-page OK), JPG
- **Max file size**: 10MB per document
- **Max pages**: 50 pages per document
- **Language**: Arabic or English
- **Quality**: Clear, legible, not watermarked
- **Signatures**: Original or certified copies

## Error Handling

If documents cannot be validated:
- Returns status as UNABLE_TO_VALIDATE
- Provides manual review checklist
- Suggests data collection steps
- Escalates to operator if critical

If format is non-compliant:
- Lists specific format issues
- Provides conversion recommendations
- Suggests tools for format correction
- Flags as blocker for submission

## Performance Expectations

- Single document validation: <100ms
- Full set (10-20 docs): <1 second
- Batch validation (100 claims): <10 seconds

## Safety Notes

✓ All validation is non-destructive (read-only)  
✓ No documents are modified or moved  
✓ No submissions attempted by this skill  
✓ Operator must confirm readiness before proceeding  
✓ All missing documents flagged clearly  

## What You'll Get

When you invoke this skill, you receive:
- Validation status (COMPLETE, INCOMPLETE, UNABLE_TO_VALIDATE)
- Completion percentage
- List of required documents with status
- List of missing documents
- Format validation results
- Priority indicators
- Specific remediation steps
- Estimated time to completion
- Clear ready/not-ready determination

---

**This skill is safe to use.** It checks document readiness only—no actual changes occur. Always review the validation results before proceeding with submission.
