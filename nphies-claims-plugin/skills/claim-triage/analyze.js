#!/usr/bin/env node

/**
 * claim-triage.js
 * Analyze NPHIES rejection codes and categorize claims by priority.
 * 
 * Usage:
 *   node claim-triage.js --code BE-1-4 --amount 5000 --service professional --branch riyadh
 *   node claim-triage.js --input claims.json (batch mode)
 */

const fs = require('fs');
const path = require('path');

/**
 * NPHIES Rejection Code Database
 * Maps rejection codes to root causes, recovery rates, and required documents
 */
const rejectionDatabase = {
  'BE-1-4': {
    rootCause: 'Preauthorization required',
    description: 'Claim submitted without required preauthorization approval',
    priority: 'HIGH',
    recoveryPercentage: 70,
    action: 'Resubmit with Supporting Info',
    requiredDocuments: [
      'Medical records supporting medical necessity',
      'Clinical justification from provider',
      'Patient member information',
      'Policy preauthorization request',
      'Service date documentation'
    ],
    estimatedEffort: 'Low',
    successRate: 70,
    appealTemplate: 'Requesting retroactive preauthorization per ART PreAuth Protocol. Medical necessity documented. Service provided under emergency circumstances.',
    nextSteps: [
      'Prepare clinical justification',
      'Gather medical records from provider',
      'Submit retroactive preauthorization appeal via portal',
      'Check status in 3-5 business days',
      'Follow up if no response after 7 days'
    ]
  },
  'MN-1-1': {
    rootCause: 'Other/contractual issue',
    description: 'Claim rejected due to contractual or coverage limitations',
    priority: 'MEDIUM',
    recoveryPercentage: 50,
    action: 'Communication/Contractual Appeal',
    requiredDocuments: [
      'Policy contract documentation',
      'Contractual agreement with provider',
      'Service authorization documentation',
      'Member eligibility at date of service',
      'Clinical outcome documentation'
    ],
    estimatedEffort: 'Medium',
    successRate: 50,
    appealTemplate: 'Appealing contractual denial. Member was eligible at date of service. Service falls under covered benefits per member policy.',
    nextSteps: [
      'Review member policy for coverage',
      'Collect contractual documentation',
      'Prepare written appeal with policy references',
      'Submit to member services',
      'Request management review if denied'
    ]
  },
  'BE-1-1': {
    rootCause: 'Invalid member ID',
    description: 'Member ID does not match NPHIES system records',
    priority: 'MEDIUM',
    recoveryPercentage: 60,
    action: 'Resubmit with Corrected Data',
    requiredDocuments: [
      'Valid member ID confirmation from Oasis',
      'Member eligibility verification',
      'Insurance card or digital ID'
    ],
    estimatedEffort: 'Low',
    successRate: 75,
    appealTemplate: 'Resubmitting claim with corrected member ID verified from Oasis system.',
    nextSteps: [
      'Verify correct member ID from Oasis',
      'Check member eligibility dates',
      'Resubmit claim with correct ID',
      'Verify acceptance in portal'
    ]
  },
  'BE-2-1': {
    rootCause: 'Missing provider information',
    description: 'Provider ID or provider contract not found',
    priority: 'MEDIUM',
    recoveryPercentage: 55,
    action: 'Resubmit with Provider Details',
    requiredDocuments: [
      'Valid provider ID from NPHIES',
      'Provider contract confirmation',
      'Provider tax ID or commercial registration',
      'Service delivery location information'
    ],
    estimatedEffort: 'Low',
    successRate: 70,
    appealTemplate: 'Resubmitting with valid provider ID and contract confirmation from NPHIES system.',
    nextSteps: [
      'Confirm provider ID in NPHIES system',
      'Verify provider contract status',
      'Check service location eligibility',
      'Resubmit with corrected provider details'
    ]
  },
  'MN-1-2': {
    rootCause: 'Duplicate claim submission',
    description: 'Similar claim already submitted and processed',
    priority: 'LOW',
    recoveryPercentage: 20,
    action: 'Manual Review Required',
    requiredDocuments: [
      'Original claim reference number',
      'Payment status from original submission',
      'Evidence of duplicate vs. distinct service'
    ],
    estimatedEffort: 'High',
    successRate: 20,
    appealTemplate: 'Claim is distinct service on different date. Previous submission reference: [INSERT REF]. Medical records show different condition/treatment.',
    nextSteps: [
      'Research original claim submission',
      'Document differences from original claim',
      'Contact member services for clarification',
      'May require escalation to compliance team'
    ]
  },
  'BE-3-1': {
    rootCause: 'Invalid service date',
    description: 'Service date does not match member eligibility period',
    priority: 'MEDIUM',
    recoveryPercentage: 65,
    action: 'Resubmit with Corrected Dates',
    requiredDocuments: [
      'Correct service date documentation',
      'Member eligibility verification for corrected date',
      'Clinical records with service date'
    ],
    estimatedEffort: 'Low',
    successRate: 80,
    appealTemplate: 'Resubmitting with corrected service date. Member eligibility verified for corrected date.',
    nextSteps: [
      'Verify correct service date from records',
      'Check member was eligible on that date',
      'Resubmit with corrected dates',
      'Verify acceptance in portal'
    ]
  }
};

/**
 * Branch-specific adjustments
 */
const branchAdjustments = {
  riyadh: {
    name: 'Al Rajhi (Riyadh)',
    recoveryMultiplier: 1.0,
    maxBatchSize: 10,
    requiresApprovalHydration: false,
    timeToResolve: '3-5 business days'
  },
  abha: {
    name: 'MOH-ABHA',
    recoveryMultiplier: 0.95, // Slightly stricter approval process
    maxBatchSize: 50,
    requiresApprovalHydration: true,
    timeToResolve: '5-7 business days'
  }
};

/**
 * Analyze a single claim and return triage results
 */
function triageClaim(rejectionCode, claimDetails = {}, branch = 'riyadh') {
  const branchInfo = branchAdjustments[branch] || branchAdjustments.riyadh;
  const codeInfo = rejectionDatabase[rejectionCode] || getUnknownCodeTriage();

  // Apply branch-specific adjustments
  const adjustedRecovery = Math.round(codeInfo.recoveryPercentage * branchInfo.recoveryMultiplier);

  return {
    rejectionCode,
    rootCause: codeInfo.rootCause,
    description: codeInfo.description,
    branch,
    branchName: branchInfo.name,
    priorityTier: codeInfo.priority,
    recoveryPercentage: adjustedRecovery,
    estimatedRecoveryAmount: claimDetails.claimAmount 
      ? Math.round((claimDetails.claimAmount * adjustedRecovery) / 100)
      : null,
    actionRequired: codeInfo.action,
    requiredDocuments: codeInfo.requiredDocuments,
    estimatedEffort: codeInfo.estimatedEffort,
    successRatePercent: codeInfo.successRate,
    approxTimeToResolve: branchInfo.timeToResolve,
    nextSteps: codeInfo.nextSteps,
    appealMessageTemplate: codeInfo.appealTemplate,
    metadata: {
      claimAmount: claimDetails.claimAmount,
      serviceType: claimDetails.serviceType,
      patientId: claimDetails.patientId,
      invoiceNo: claimDetails.invoiceNo,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Triage unknown rejection codes
 */
function getUnknownCodeTriage() {
  return {
    rootCause: 'Unknown rejection code',
    description: 'This rejection code is not in the standard NPHIES database',
    priority: 'LOW',
    recoveryPercentage: 30,
    action: 'Manual Review Required',
    requiredDocuments: [
      'NPHIES documentation for this code',
      'Rejection message details',
      'Claim and service documentation'
    ],
    estimatedEffort: 'High',
    successRate: 30,
    appealTemplate: 'Requesting clarification on rejection reason and appeal guidelines.',
    nextSteps: [
      'Contact NPHIES support for code definition',
      'Escalate to compliance team',
      'Document rejection reason for future reference'
    ]
  };
}

/**
 * Process batch of claims from JSON file
 */
function processBatch(inputFile) {
  try {
    const data = fs.readFileSync(inputFile, 'utf8');
    const claims = JSON.parse(data);
    
    if (!Array.isArray(claims)) {
      throw new Error('Input file must contain an array of claims');
    }

    const results = claims.map((claim, index) => {
      try {
        return {
          index,
          ...triageClaim(claim.rejectionCode, claim.details, claim.branch || 'riyadh'),
          status: 'success'
        };
      } catch (err) {
        return {
          index,
          status: 'error',
          error: err.message
        };
      }
    });

    // Summary statistics
    const summary = {
      totalClaims: results.length,
      successfulTriages: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      byPriority: {
        HIGH: results.filter(r => r.priorityTier === 'HIGH').length,
        MEDIUM: results.filter(r => r.priorityTier === 'MEDIUM').length,
        LOW: results.filter(r => r.priorityTier === 'LOW').length
      },
      averageRecovery: Math.round(
        results.filter(r => r.status === 'success')
          .reduce((sum, r) => sum + r.recoveryPercentage, 0) / 
        results.filter(r => r.status === 'success').length
      )
    };

    return { results, summary };
  } catch (err) {
    throw new Error(`Failed to process batch file: ${err.message}`);
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage:
  node claim-triage.js --code BE-1-4 --amount 5000 --service professional --branch riyadh
  node claim-triage.js --input claims.json

Options:
  --code          Rejection code (e.g., BE-1-4)
  --amount        Claim amount in SAR
  --service       Service type (pharmacy, professional, institutional)
  --branch        Branch (riyadh, abha) - default: riyadh
  --input         JSON file with claims array
  --output        Save results to file (optional)
    `);
    process.exit(0);
  }

  try {
    let result;

    // Batch mode
    if (args.includes('--input')) {
      const idx = args.indexOf('--input');
      const inputFile = args[idx + 1];
      result = processBatch(inputFile);
    } else {
      // Single claim mode
      const codeIdx = args.indexOf('--code');
      const code = codeIdx !== -1 ? args[codeIdx + 1] : null;
      
      if (!code) {
        throw new Error('Rejection code is required (--code)');
      }

      const amountIdx = args.indexOf('--amount');
      const amount = amountIdx !== -1 ? parseInt(args[amountIdx + 1]) : null;

      const serviceIdx = args.indexOf('--service');
      const service = serviceIdx !== -1 ? args[serviceIdx + 1] : null;

      const branchIdx = args.indexOf('--branch');
      const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'riyadh';

      const details = {};
      if (amount) details.claimAmount = amount;
      if (service) details.serviceType = service;

      result = triageClaim(code, details, branch);
    }

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
  triageClaim,
  processBatch,
  rejectionDatabase,
  branchAdjustments
};

// Run CLI if called directly
if (require.main === module) {
  main();
}
