#!/usr/bin/env node

/**
 * doc-validation.js
 * Validate supporting documents for NPHIES claim submission.
 * 
 * Usage:
 *   node doc-validation.js --service professional --docs documents.json --branch riyadh
 *   node doc-validation.js --code BE-1-4 --docs documents.json
 */

const fs = require('fs');
const path = require('path');

/**
 * Document requirements by service type
 */
const serviceRequirements = {
  pharmacy: {
    required: [
      { name: 'Invoice/Receipt', category: 'invoice', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Prescription', category: 'prescription', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Patient ID Verification', category: 'patient_id', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' }
    ],
    optional: [
      { name: 'Medical Records', category: 'medical_record', formats: ['PDF', 'TIFF'], priority: 'MEDIUM' },
      { name: 'Clinical Justification', category: 'justification', formats: ['PDF'], priority: 'LOW' }
    ]
  },
  professional: {
    required: [
      { name: 'Invoice/Receipt', category: 'invoice', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Medical Records', category: 'medical_record', formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Patient ID Verification', category: 'patient_id', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' }
    ],
    optional: [
      { name: 'Clinical Justification', category: 'justification', formats: ['PDF'], priority: 'MEDIUM' },
      { name: 'Prior Authorization', category: 'auth', formats: ['PDF'], priority: 'LOW' }
    ]
  },
  institutional: {
    required: [
      { name: 'Itemized Bill', category: 'invoice', formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Discharge Summary', category: 'discharge_summary', formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Medical Records', category: 'medical_record', formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Patient ID Verification', category: 'patient_id', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' }
    ],
    optional: [
      { name: 'Lab Reports', category: 'lab_report', formats: ['PDF', 'TIFF'], priority: 'MEDIUM' },
      { name: 'Imaging Reports', category: 'imaging_report', formats: ['PDF', 'TIFF'], priority: 'MEDIUM' }
    ]
  }
};

/**
 * Additional requirements for specific rejection codes (appeals)
 */
const rejectionSpecificRequirements = {
  'BE-1-4': {
    name: 'Preauthorization Appeal',
    additionalDocs: [
      { name: 'Clinical Justification', category: 'justification', formats: ['PDF'], priority: 'CRITICAL' },
      { name: 'Original Claim Reference', category: 'claim_ref', formats: ['PDF', 'TEXT'], priority: 'CRITICAL' }
    ]
  },
  'MN-1-1': {
    name: 'Contractual Appeal',
    additionalDocs: [
      { name: 'Policy Documentation', category: 'policy_doc', formats: ['PDF'], priority: 'CRITICAL' },
      { name: 'Coverage Verification', category: 'coverage_doc', formats: ['PDF'], priority: 'CRITICAL' }
    ]
  },
  'BE-1-1': {
    name: 'Member ID Correction',
    additionalDocs: [
      { name: 'Corrected Member ID', category: 'member_id', formats: ['PDF', 'TEXT'], priority: 'CRITICAL' }
    ]
  }
};

/**
 * Branch-specific requirements
 */
const branchRequirements = {
  riyadh: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxPages: 50,
    acceptedFormats: ['PDF', 'TIFF', 'JPG'],
    requireSignatures: false,
    requireTimestamp: false
  },
  abha: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxPages: 50,
    acceptedFormats: ['PDF', 'TIFF', 'JPG'],
    requireSignatures: false,
    requireTimestamp: true
  }
};

/**
 * Validate file format
 */
function validateFormat(filename, acceptedFormats = ['PDF', 'TIFF', 'JPG']) {
  const ext = path.extname(filename).toUpperCase().replace('.', '');
  return acceptedFormats.includes(ext) ? 'PASSED' : 'FAILED_FORMAT';
}

/**
 * Validate file size
 */
function validateSize(sizeBytes, maxSize) {
  return sizeBytes <= maxSize ? 'PASSED' : 'FAILED_SIZE';
}

/**
 * Check if document exists
 */
function checkDocumentExists(doc, providedDocs = []) {
  return providedDocs.some(d => 
    d.category === doc.category || 
    d.name.toLowerCase().includes(doc.name.toLowerCase())
  );
}

/**
 * Validate a set of documents
 */
function validateDocuments(serviceType, providedDocs = [], rejectionCode = null, branch = 'riyadh') {
  // Get service requirements
  let requirements = serviceRequirements[serviceType] || serviceRequirements.professional;
  const branchReqs = branchRequirements[branch] || branchRequirements.riyadh;

  let allRequired = [...requirements.required];
  let allOptional = [...requirements.optional];

  // Add rejection-specific requirements if applicable
  if (rejectionCode && rejectionSpecificRequirements[rejectionCode]) {
    const rejReqs = rejectionSpecificRequirements[rejectionCode];
    allRequired = [...allRequired, ...rejReqs.additionalDocs];
  }

  // Validate each required document
  const validatedRequired = allRequired.map(req => {
    const provided = providedDocs.find(d => 
      d.category === req.category || 
      d.name.toLowerCase().includes(req.name.toLowerCase())
    );

    let validation = {
      name: req.name,
      category: req.category,
      required: true,
      priority: req.priority,
      status: provided ? 'PRESENT' : 'MISSING',
      format: req.formats[0],
      validation: 'NOT_CHECKED'
    };

    if (provided) {
      const formatCheck = validateFormat(provided.name, req.formats);
      const sizeCheck = validateSize(provided.size_bytes || 0, branchReqs.maxFileSize);
      
      validation.validation = formatCheck === 'PASSED' && sizeCheck === 'PASSED' ? 'PASSED' : 'FAILED';
      validation.size_bytes = provided.size_bytes;
      validation.format_validation = formatCheck;
      validation.size_validation = sizeCheck;
    }

    return validation;
  });

  // Validate optional documents
  const validatedOptional = allOptional.map(opt => {
    const provided = providedDocs.find(d => 
      d.category === opt.category || 
      d.name.toLowerCase().includes(opt.name.toLowerCase())
    );

    let validation = {
      name: opt.name,
      category: opt.category,
      required: false,
      priority: opt.priority,
      status: provided ? 'PRESENT' : 'NOT_PROVIDED',
      format: opt.formats[0],
      validation: 'NOT_CHECKED'
    };

    if (provided) {
      const formatCheck = validateFormat(provided.name, opt.formats);
      const sizeCheck = validateSize(provided.size_bytes || 0, branchReqs.maxFileSize);
      
      validation.validation = formatCheck === 'PASSED' && sizeCheck === 'PASSED' ? 'PASSED' : 'FAILED';
      validation.size_bytes = provided.size_bytes;
      validation.format_validation = formatCheck;
      validation.size_validation = sizeCheck;
    }

    return validation;
  });

  // Calculate overall status
  const missingRequired = validatedRequired.filter(d => d.status === 'MISSING');
  const failedValidation = validatedRequired.filter(d => d.validation === 'FAILED');
  const allPresent = missingRequired.length === 0;
  const allValid = failedValidation.length === 0;
  
  let validationStatus = 'COMPLETE';
  if (!allPresent) validationStatus = 'INCOMPLETE';
  if (!allValid) validationStatus = 'INVALID_FORMAT';
  if (validationStatus === 'COMPLETE') validationStatus = 'COMPLETE';

  // Calculate completion percentage
  const presentRequired = validatedRequired.filter(d => d.status === 'PRESENT').length;
  const completionPercentage = Math.round((presentRequired / validatedRequired.length) * 100);

  // Generate remediation steps
  const remediation = [];
  if (missingRequired.length > 0) {
    remediation.push(`Collect ${missingRequired.length} missing document(s):`);
    missingRequired.forEach(doc => {
      remediation.push(`  - ${doc.name} (Priority: ${doc.priority})`);
    });
  }
  if (failedValidation.length > 0) {
    remediation.push(`Fix ${failedValidation.length} invalid document(s):`);
    failedValidation.forEach(doc => {
      remediation.push(`  - ${doc.name}: ${doc.format_validation === 'FAILED_FORMAT' ? 'Invalid format' : 'File too large'}`);
    });
  }

  return {
    serviceType,
    branch,
    rejectionCode: rejectionCode || null,
    validationStatus,
    completionPercentage,
    allPresent,
    readyForSubmission: allPresent && allValid,
    requiredDocuments: validatedRequired,
    optionalDocuments: validatedOptional,
    missingDocuments: missingRequired.map(d => d.name),
    invalidDocuments: failedValidation.map(d => ({ name: d.name, issue: d.format_validation === 'FAILED_FORMAT' ? 'Invalid format' : 'File too large' })),
    remediation: remediation.length > 0 ? remediation : ['All required documents present and valid'],
    branchRequirements: {
      maxFileSize: `${branchReqs.maxFileSize / (1024 * 1024)}MB`,
      maxPages: branchReqs.maxPages,
      acceptedFormats: branchReqs.acceptedFormats
    },
    estimatedTimeToComplete: missingRequired.length > 0 ? '1-2 business days' : 'Ready',
    nextSteps: allPresent && allValid 
      ? ['Proceed to claim validation', 'Submit to NPHIES portal', 'Monitor claim status']
      : ['Collect/fix documents above', 'Verify all formats are correct', 'Revalidate before submission']
  };
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  node doc-validation.js --service professional --docs documents.json --branch riyadh
  node doc-validation.js --code BE-1-4 --docs documents.json

Options:
  --service       Service type (pharmacy, professional, institutional)
  --code          Rejection code (BE-1-4, MN-1-1, etc.) for appeals
  --docs          JSON file with documents array
  --branch        Branch (riyadh, abha) - default: riyadh
  --output        Save results to file (optional)
    `);
    process.exit(0);
  }

  try {
    const docsIdx = args.indexOf('--docs');
    if (docsIdx === -1) {
      throw new Error('Documents file is required (--docs documents.json)');
    }

    const docsFile = args[docsIdx + 1];
    const docsData = JSON.parse(fs.readFileSync(docsFile, 'utf8'));

    const serviceIdx = args.indexOf('--service');
    const service = serviceIdx !== -1 ? args[serviceIdx + 1] : 'professional';

    const codeIdx = args.indexOf('--code');
    const code = codeIdx !== -1 ? args[codeIdx + 1] : null;

    const branchIdx = args.indexOf('--branch');
    const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'riyadh';

    const result = validateDocuments(service, docsData, code, branch);

    // Output handling
    const outputIdx = args.indexOf('--output');
    const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : null;

    const output = JSON.stringify(result, null, 2);

    if (outputFile) {
      fs.writeFileSync(outputFile, output);
      console.log(`✓ Results saved to ${outputFile}`);
    } else {
      console.log(output);
    }

    process.exit(0);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  validateDocuments,
  validateFormat,
  validateSize,
  serviceRequirements,
  rejectionSpecificRequirements,
  branchRequirements
};

// Run CLI if called directly
if (require.main === module) {
  main();
}
