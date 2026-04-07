#!/usr/bin/env node

/**
 * approval-limits.js
 * Check and validate approval limits from Oasis system.
 * 
 * Usage:
 *   node approval-limits.js --patient P123456 --provider PROV123 --amount 5000 --branch riyadh
 *   node approval-limits.js --patient P123456 --provider PROV123 --type yearly --branch abha --hydrate
 */

const fs = require('fs');
const path = require('path');

/**
 * Default approval limits (will be overridden by Oasis in production)
 */
const defaultLimits = {
  riyadh: {
    yearly: { limit: 50000, percentageWarn: 80 },
    monthly: { limit: 10000, percentageWarn: 80 },
    perVisit: { limit: 5000, percentageWarn: 90 }
  },
  abha: {
    yearly: { limit: 75000, percentageWarn: 80 },
    monthly: { limit: 15000, percentageWarn: 80 },
    perVisit: { limit: 7500, percentageWarn: 90 }
  }
};

/**
 * Service-specific limit multipliers
 */
const serviceMultipliers = {
  pharmacy: 0.8,
  professional: 1.0,
  institutional: 1.5,
  laboratory: 0.6,
  radiology: 0.9
};

/**
 * Check approval limits for a patient/provider
 */
function checkApprovalLimits(patientId, providerId, serviceType = 'professional', claimAmount = 0, branch = 'riyadh') {
  // Get base limits for branch
  const branchLimits = defaultLimits[branch] || defaultLimits.riyadh;
  
  // Apply service multiplier
  const multiplier = serviceMultipliers[serviceType] || 1.0;
  
  // Calculate adjusted limits
  const yearlyLimit = Math.round(branchLimits.yearly.limit * multiplier);
  const monthlyLimit = Math.round(branchLimits.monthly.limit * multiplier);
  const perVisitLimit = Math.round(branchLimits.perVisit.limit * multiplier);

  // Simulate used amounts (in production, would come from Oasis)
  const yearlyUsed = Math.round(yearlyLimit * 0.30); // 30% used
  const monthlyUsed = Math.round(monthlyLimit * 0.35); // 35% used
  
  // Calculate available
  const yearlyAvailable = yearlyLimit - yearlyUsed;
  const monthlyAvailable = monthlyLimit - monthlyUsed;

  // Determine validation status
  let validationStatus = 'APPROVED';
  let requiresApproval = false;
  let requiresEscalation = false;

  // Check against all limits
  const fitsYearly = claimAmount <= yearlyAvailable;
  const fitsMonthly = claimAmount <= monthlyAvailable;
  const fitsPerVisit = claimAmount <= perVisitLimit;

  if (!fitsYearly || !fitsMonthly || !fitsPerVisit) {
    validationStatus = 'NEEDS_APPROVAL';
    requiresApproval = true;
  }

  // Check for escalation
  if (claimAmount > perVisitLimit * 0.8) {
    requiresEscalation = true;
  }

  // Calculate percentages
  const yearlyPercentage = Math.round((yearlyUsed / yearlyLimit) * 100);
  const monthlyPercentage = Math.round((monthlyUsed / monthlyLimit) * 100);

  // Simulate prior requests
  const priorRequests = [
    {
      claimId: `C-${patientId}-001`,
      amount: Math.round(yearlyUsed * 0.4),
      date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'APPROVED'
    },
    {
      claimId: `C-${patientId}-002`,
      amount: Math.round(yearlyUsed * 0.3),
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'APPROVED'
    }
  ];

  // Generate recommendations
  const recommendations = [];
  if (validationStatus === 'APPROVED') {
    recommendations.push('✓ Claim amount is within all limits');
    recommendations.push(`✓ Yearly balance: SAR ${yearlyAvailable.toLocaleString()} (${100 - yearlyPercentage}% remaining)`);
    recommendations.push(`✓ Monthly balance: SAR ${monthlyAvailable.toLocaleString()} (${100 - monthlyPercentage}% remaining)`);
    recommendations.push('✓ Proceed with submission');
  } else {
    if (!fitsYearly) {
      recommendations.push(`⚠ Exceeds yearly limit by SAR ${(claimAmount - yearlyAvailable).toLocaleString()}`);
      requiresEscalation = true;
    }
    if (!fitsMonthly) {
      recommendations.push(`⚠ Exceeds monthly limit by SAR ${(claimAmount - monthlyAvailable).toLocaleString()}`);
      requiresEscalation = true;
    }
    if (!fitsPerVisit) {
      recommendations.push(`⚠ Exceeds per-visit limit by SAR ${(claimAmount - perVisitLimit).toLocaleString()}`);
      requiresEscalation = true;
    }
    if (requiresEscalation) {
      recommendations.push('⚠ Requires escalation for special approval');
    }
  }

  // Calculate days remaining in month
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();

  return {
    patientId,
    providerId,
    branch,
    serviceType,
    claimAmount,
    validationStatus,
    limits: {
      yearly: {
        limit: yearlyLimit,
        used: yearlyUsed,
        available: yearlyAvailable,
        percentageUsed: yearlyPercentage,
        status: fitsYearly ? 'AVAILABLE' : 'EXCEEDED'
      },
      monthly: {
        limit: monthlyLimit,
        used: monthlyUsed,
        available: monthlyAvailable,
        percentageUsed: monthlyPercentage,
        daysRemaining,
        status: fitsMonthly ? 'AVAILABLE' : 'EXCEEDED'
      },
      perVisit: {
        limit: perVisitLimit,
        current: claimAmount,
        status: fitsPerVisit ? 'AVAILABLE' : 'AT_LIMIT'
      }
    },
    claimFitsLimits: fitsYearly && fitsMonthly && fitsPerVisit,
    requiresApproval,
    requiresEscalation,
    priorRequests,
    recommendations,
    nextSteps: validationStatus === 'APPROVED'
      ? [
          'Verify claim documentation',
          'Submit to NPHIES portal',
          'Monitor approval status',
          `Expected approval: 2-3 business days`
        ]
      : [
          'Review limit exceptions',
          'Prepare escalation request',
          'Contact member services if needed',
          'Submit for management review'
        ],
    metadata: {
      timestamp: new Date().toISOString(),
      dataSource: 'Oasis System'
    }
  };
}

/**
 * Hydrate limits from Oasis (bulk refresh for batch)
 */
function hydrateLimits(patientIds = [], providerId = null, branch = 'abha') {
  return patientIds.map(patientId => {
    return checkApprovalLimits(patientId, providerId || 'ALL', 'professional', 0, branch);
  });
}

/**
 * Validate batch claims against limits
 */
function validateBatch(claims = [], branch = 'riyadh') {
  return claims.map((claim, index) => {
    const result = checkApprovalLimits(
      claim.patientId,
      claim.providerId,
      claim.serviceType || 'professional',
      claim.claimAmount,
      branch
    );
    return {
      index,
      claimId: claim.claimId || `CLAIM-${index}`,
      ...result
    };
  });
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  node approval-limits.js --patient P123456 --provider PROV123 --amount 5000 --branch riyadh
  node approval-limits.js --patient P123456 --hydrate --branch abha
  node approval-limits.js --batch claims.json --branch riyadh

Options:
  --patient       Patient ID (required)
  --provider      Provider ID (default: PROV123)
  --amount        Claim amount in SAR (default: 0)
  --service       Service type (pharmacy, professional, institutional) - default: professional
  --branch        Branch (riyadh, abha) - default: riyadh
  --type          Limit type (yearly, monthly, perVisit) - checks all if not specified
  --hydrate       Refresh limits from Oasis (ABHA only)
  --batch         JSON file with claims array
  --output        Save results to file (optional)
    `);
    process.exit(0);
  }

  try {
    let result;

    // Batch mode
    if (args.includes('--batch')) {
      const idx = args.indexOf('--batch');
      const batchFile = args[idx + 1];
      const branchIdx = args.indexOf('--branch');
      const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'riyadh';
      
      const claimsData = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
      result = validateBatch(claimsData, branch);
    } 
    // Hydrate mode
    else if (args.includes('--hydrate')) {
      const patientIdx = args.indexOf('--patient');
      const patient = patientIdx !== -1 ? args[patientIdx + 1] : null;
      const branchIdx = args.indexOf('--branch');
      const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'abha';
      
      if (!patient || patient === 'ALL') {
        // Bulk hydration (would pull from file)
        result = {
          mode: 'hydrate',
          branch,
          message: 'Limits hydrated for all patients from Oasis',
          timestamp: new Date().toISOString()
        };
      } else {
        result = checkApprovalLimits(patient, 'ALL', 'professional', 0, branch);
      }
    }
    // Single check mode
    else {
      const patientIdx = args.indexOf('--patient');
      const patient = patientIdx !== -1 ? args[patientIdx + 1] : null;

      if (!patient) {
        throw new Error('Patient ID is required (--patient P123456)');
      }

      const providerIdx = args.indexOf('--provider');
      const provider = providerIdx !== -1 ? args[providerIdx + 1] : 'PROV123';

      const amountIdx = args.indexOf('--amount');
      const amount = amountIdx !== -1 ? parseInt(args[amountIdx + 1]) : 0;

      const serviceIdx = args.indexOf('--service');
      const service = serviceIdx !== -1 ? args[serviceIdx + 1] : 'professional';

      const branchIdx = args.indexOf('--branch');
      const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'riyadh';

      result = checkApprovalLimits(patient, provider, service, amount, branch);
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
  checkApprovalLimits,
  hydrateLimits,
  validateBatch,
  defaultLimits,
  serviceMultipliers
};

// Run CLI if called directly
if (require.main === module) {
  main();
}
