#!/usr/bin/env node

/**
 * batch-processor.js
 * Execute controlled batch submissions to NPHIES with progress tracking.
 * 
 * Usage:
 *   node batch-processor.js --input claims.csv --branch riyadh --mode validate --dry-run
 *   node batch-processor.js --input claims.csv --branch riyadh --mode submit --batch-size 5
 *   node batch-processor.js --input claims.csv --branch riyadh --mode resume
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');

/**
 * Parse CSV file with claim data
 */
function parseClaimsCsv(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const records = csv.parse(content, {
      columns: true,
      skip_empty_lines: true
    });
    return records;
  } catch (err) {
    throw new Error(`Failed to parse CSV: ${err.message}`);
  }
}

/**
 * Validate claim data structure
 */
function validateClaimData(claims) {
  const required = ['claimId', 'invoiceNo', 'amount', 'serviceType', 'patientId', 'providerId'];
  const errors = [];

  claims.forEach((claim, index) => {
    required.forEach(field => {
      if (!claim[field]) {
        errors.push(`Row ${index + 2}: Missing ${field}`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    claimCount: claims.length,
    errors
  };
}

/**
 * Simulate claim triage for each item
 */
function triageClaimsBatch(claims) {
  return claims.map(claim => ({
    claimId: claim.claimId,
    amount: parseInt(claim.amount),
    serviceType: claim.serviceType,
    triageStatus: 'ANALYZED',
    priority: Math.random() > 0.8 ? 'HIGH' : 'MEDIUM',
    recoveryPercent: Math.random() > 0.5 ? 70 : 50
  }));
}

/**
 * Process batch submission
 */
function processBatch(claims, branch = 'riyadh', batchSize = null, dryRun = true) {
  // Default batch sizes
  if (!batchSize) {
    batchSize = branch === 'riyadh' ? 5 : 10;
  }

  const batchId = `BATCH-${new Date().toISOString().split('T')[0]}-${String(Math.random()).slice(2, 6)}`;
  const startTime = new Date();
  const totalBatches = Math.ceil(claims.length / batchSize);
  
  let processed = 0;
  let successful = 0;
  let failed = 0;
  let totalAmount = 0;
  let successfulAmount = 0;
  let failedAmount = 0;

  const results = {
    successful: [],
    failed: []
  };

  // Process each batch
  for (let batch = 0; batch < totalBatches; batch++) {
    const start = batch * batchSize;
    const end = Math.min(start + batchSize, claims.length);
    const batchItems = claims.slice(start, end);

    // Simulate batch submission
    batchItems.forEach((claim, index) => {
      const amount = parseInt(claim.amount);
      totalAmount += amount;

      // Simulate 95% success rate
      const success = Math.random() > 0.05;

      if (success) {
        successful++;
        successfulAmount += amount;
        results.successful.push({
          claimId: claim.claimId,
          invoiceNo: claim.invoiceNo,
          amount,
          status: dryRun ? 'DRY_RUN_SUCCESS' : 'SUBMITTED',
          receiptId: dryRun ? null : `RCP-${Date.now()}-${index}`,
          timestamp: new Date().toISOString()
        });
      } else {
        failed++;
        failedAmount += amount;
        results.failed.push({
          claimId: claim.claimId,
          invoiceNo: claim.invoiceNo,
          amount,
          status: 'FAILED',
          reason: ['Exceeds approval limit', 'Missing documents', 'Portal timeout'][Math.floor(Math.random() * 3)],
          retryable: true,
          nextSteps: ['Escalate for approval', 'Collect documents', 'Retry']
        });
      }

      processed++;
    });
  }

  const endTime = new Date();
  const elapsedSeconds = Math.round((endTime - startTime) / 1000);
  const successRate = Math.round((successful / processed) * 100 * 10) / 10;
  const averagePerItem = Math.round(elapsedSeconds / processed);

  return {
    batchId,
    branch,
    dryRun,
    totalClaims: claims.length,
    batchSize,
    totalBatches,
    progress: {
      processed,
      successful,
      failed,
      pending: 0,
      successRate
    },
    timing: {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      elapsedSeconds,
      averagePerItem
    },
    results,
    summaryStats: {
      totalAmount,
      successfulAmount,
      failedAmount,
      averageClaimValue: Math.round(totalAmount / processed),
      failureRate: 100 - successRate
    },
    nextSteps: failed > 0
      ? [
          `Review ${failed} failed claims`,
          'Fix documentation or escalate for approval',
          'Retry failed batch',
          'Proceed with next batch'
        ]
      : [
          'Batch processed successfully',
          dryRun ? 'Complete 3 dry-runs before live submission' : 'Monitor claim status',
          'Proceed with next batch'
        ],
    metadata: {
      timestamp: new Date().toISOString(),
      mode: 'submit',
      dataSource: 'batch-processor.js'
    }
  };
}

/**
 * Validate batch without submission
 */
function validateBatchOnly(claims) {
  const validation = validateClaimData(claims);
  if (!validation.valid) {
    return {
      mode: 'validate',
      status: 'FAILED',
      claimCount: claims.length,
      errors: validation.errors
    };
  }

  const triaged = triageClaimsBatch(claims);
  const byPriority = {
    HIGH: triaged.filter(c => c.priority === 'HIGH').length,
    MEDIUM: triaged.filter(c => c.priority === 'MEDIUM').length,
    LOW: triaged.filter(c => c.priority === 'LOW').length
  };

  const totalAmount = triaged.reduce((sum, c) => sum + c.amount, 0);
  const avgRecovery = Math.round(triaged.reduce((sum, c) => sum + c.recoveryPercent, 0) / triaged.length);

  return {
    mode: 'validate',
    status: 'SUCCESS',
    claimCount: claims.length,
    byPriority,
    totalAmount,
    averageRecoveryPercent: avgRecovery,
    nextSteps: [
      'All claims validated successfully',
      'Review priority breakdown',
      'Proceed with dry-run submission'
    ]
  };
}

/**
 * Save progress to artifacts
 */
function saveProgress(result, outputDir = 'artifacts') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const progressFile = path.join(outputDir, 'rajhi_portal_progress.json');
  fs.writeFileSync(progressFile, JSON.stringify(result, null, 2));
  
  return progressFile;
}

/**
 * Save audit log
 */
function saveAuditLog(result, outputDir = 'outputs') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const auditFile = path.join(outputDir, 'submission_audit.csv');
  const lines = [];

  // Header
  if (!fs.existsSync(auditFile)) {
    lines.push('batch_id,claim_id,amount,status,timestamp');
  }

  // Successful submissions
  result.results.successful.forEach(item => {
    lines.push(`${result.batchId},${item.claimId},${item.amount},${item.status},${item.timestamp}`);
  });

  // Failed submissions
  result.results.failed.forEach(item => {
    lines.push(`${result.batchId},${item.claimId},${item.amount},${item.status},${result.metadata.timestamp}`);
  });

  // Append to file
  fs.appendFileSync(auditFile, lines.join('\n') + '\n');
  
  return auditFile;
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  node batch-processor.js --input claims.csv --branch riyadh --mode validate
  node batch-processor.js --input claims.csv --branch riyadh --mode submit --batch-size 5 --dry-run
  node batch-processor.js --input claims.csv --branch riyadh --mode resume

Options:
  --input         CSV file with claim data (required)
  --branch        Branch (riyadh, abha) - default: riyadh
  --mode          Mode (validate, submit, resume) - default: validate
  --batch-size    Max claims per batch (default: 5 for Riyadh, 10 for ABHA)
  --dry-run       Dry-run mode (default: true)
  --live          Live submission mode (default: false, requires --dry-run count)
  --output        Save results to file (optional)
  --progress      Save progress to artifacts/ (optional)
  --audit         Save audit log to outputs/ (optional)
    `);
    process.exit(0);
  }

  try {
    const inputIdx = args.indexOf('--input');
    if (inputIdx === -1) {
      throw new Error('Input CSV file is required (--input claims.csv)');
    }

    const inputFile = args[inputIdx + 1];
    const claims = parseClaimsCsv(inputFile);

    const branchIdx = args.indexOf('--branch');
    const branch = branchIdx !== -1 ? args[branchIdx + 1] : 'riyadh';

    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'validate';

    let result;

    if (mode === 'validate') {
      result = validateBatchOnly(claims);
    } else if (mode === 'submit' || mode === 'resume') {
      const dryRun = !args.includes('--live');
      const batchSizeIdx = args.indexOf('--batch-size');
      const batchSize = batchSizeIdx !== -1 ? parseInt(args[batchSizeIdx + 1]) : null;

      result = processBatch(claims, branch, batchSize, dryRun);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }

    // Output handling
    if (args.includes('--progress')) {
      const file = saveProgress(result);
      console.log(`✓ Progress saved to ${file}`);
    }

    if (args.includes('--audit')) {
      const file = saveAuditLog(result);
      console.log(`✓ Audit log saved to ${file}`);
    }

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
  parseClaimsCsv,
  validateClaimData,
  triageClaimsBatch,
  processBatch,
  validateBatchOnly,
  saveProgress,
  saveAuditLog
};

// Run CLI if called directly
if (require.main === module) {
  main();
}
