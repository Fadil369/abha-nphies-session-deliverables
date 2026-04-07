#!/usr/bin/env node

/**
 * integration-test.js
 * Basic integration tests for NPHIES Claims Plugin
 * Tests skill execution, error handling, and output formats
 */

const fs = require('fs');
const path = require('path');

// Mock skills for testing (in production, these would import real skills)
const claimTriage = require('../skills/claim-triage/analyze.js');
const docValidation = require('../skills/doc-validation/validate.js');
const approvalLimits = require('../skills/approval-limits/check.js');
const batchProcessor = require('../skills/batch-processor/run.js');

/**
 * Test Suite 1: Skill Execution
 */
const testSkillExecution = {
  name: 'Skill Execution',
  tests: [
    {
      id: 'test-triage-be14',
      description: 'Triage BE-1-4 rejection code',
      run: async () => {
        const result = claimTriage.triageClaim('BE-1-4', { claimAmount: 5000 }, 'riyadh');
        
        if (result.rejectionCode !== 'BE-1-4') throw new Error('Wrong rejection code');
        if (result.priorityTier !== 'HIGH') throw new Error('Expected HIGH priority');
        if (result.recoveryPercentage < 60) throw new Error('Low recovery percentage');
        if (!result.nextSteps || result.nextSteps.length === 0) throw new Error('No next steps');
        
        return result;
      }
    },
    
    {
      id: 'test-triage-mn11',
      description: 'Triage MN-1-1 rejection code',
      run: async () => {
        const result = claimTriage.triageClaim('MN-1-1', { claimAmount: 2500 }, 'abha');
        
        if (result.rejectionCode !== 'MN-1-1') throw new Error('Wrong rejection code');
        if (!['HIGH', 'MEDIUM', 'LOW'].includes(result.priorityTier)) throw new Error('Invalid priority');
        if (!result.requiredDocuments || result.requiredDocuments.length === 0) throw new Error('No docs listed');
        
        return result;
      }
    },

    {
      id: 'test-doc-validation-complete',
      description: 'Validate complete document set',
      run: async () => {
        const docs = [
          { name: 'Invoice.pdf', category: 'invoice', size_bytes: 250000 },
          { name: 'MedRecords.pdf', category: 'medical_record', size_bytes: 500000 },
          { name: 'PatientID.pdf', category: 'patient_id', size_bytes: 100000 }
        ];
        
        const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
        
        if (!result.allPresent) throw new Error('Not all documents present');
        if (!result.readyForSubmission) throw new Error('Not ready for submission');
        if (result.completionPercentage < 100) throw new Error('Not 100% complete');
        
        return result;
      }
    },

    {
      id: 'test-doc-validation-incomplete',
      description: 'Validate incomplete document set',
      run: async () => {
        const docs = [
          { name: 'Invoice.pdf', category: 'invoice', size_bytes: 250000 }
        ];
        
        const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
        
        if (result.allPresent) throw new Error('Should not be all present');
        if (result.readyForSubmission) throw new Error('Should not be ready');
        if (result.missingDocuments.length === 0) throw new Error('Should have missing docs');
        
        return result;
      }
    },

    {
      id: 'test-approval-limits-approved',
      description: 'Check limits - approved for submission',
      run: async () => {
        const result = approvalLimits.checkApprovalLimits('P123456', 'PROV123', 'professional', 5000, 'riyadh');
        
        if (result.validationStatus !== 'APPROVED') throw new Error('Should be APPROVED');
        if (!result.claimFitsLimits) throw new Error('Claim should fit limits');
        if (result.limits.yearly.available <= 0) throw new Error('No yearly balance');
        
        return result;
      }
    },

    {
      id: 'test-batch-validation',
      description: 'Validate batch without submission',
      run: async () => {
        const claims = [
          { claimId: 'C001', invoiceNo: '001', amount: 5000, serviceType: 'professional', patientId: 'P123', providerId: 'PROV123' },
          { claimId: 'C002', invoiceNo: '002', amount: 2500, serviceType: 'pharmacy', patientId: 'P456', providerId: 'PROV456' }
        ];
        
        const result = batchProcessor.validateBatchOnly(claims);
        
        if (result.status !== 'SUCCESS') throw new Error('Validation should succeed');
        if (result.claimCount !== 2) throw new Error('Should have 2 claims');
        
        return result;
      }
    }
  ]
};

/**
 * Test Suite 2: Error Handling
 */
const testErrorHandling = {
  name: 'Error Handling',
  tests: [
    {
      id: 'test-unknown-rejection-code',
      description: 'Handle unknown rejection code gracefully',
      run: async () => {
        const result = claimTriage.triageClaim('UNKNOWN-999', { claimAmount: 1000 }, 'riyadh');
        
        if (!result.rejectionCode) throw new Error('Should have rejection code');
        if (result.rootCause === '') throw new Error('Should provide root cause');
        if (result.nextSteps.length === 0) throw new Error('Should suggest next steps');
        
        return result;
      }
    },

    {
      id: 'test-invalid-csv-data',
      description: 'Handle invalid CSV data',
      run: async () => {
        const invalidClaims = [
          { claimId: 'C001' } // Missing required fields
        ];
        
        const validation = batchProcessor.validateClaimData(invalidClaims);
        
        if (validation.valid) throw new Error('Should detect invalid data');
        if (validation.errors.length === 0) throw new Error('Should report errors');
        
        return validation;
      }
    },

    {
      id: 'test-invalid-document-format',
      description: 'Reject invalid document formats',
      run: async () => {
        const docs = [
          { name: 'Invoice.txt', category: 'invoice', size_bytes: 250000 }
        ];
        
        const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
        
        if (result.readyForSubmission) throw new Error('Should not be ready with invalid format');
        if (result.invalidDocuments.length === 0) throw new Error('Should flag invalid doc');
        
        return result;
      }
    }
  ]
};

/**
 * Test Suite 3: Output Format Validation
 */
const testOutputFormats = {
  name: 'Output Formats',
  tests: [
    {
      id: 'test-triage-output-format',
      description: 'Triage output has required fields',
      run: async () => {
        const result = claimTriage.triageClaim('BE-1-4', { claimAmount: 5000 }, 'riyadh');
        
        const required = ['rejectionCode', 'rootCause', 'priorityTier', 'recoveryPercentage', 'actionRequired', 'nextSteps'];
        for (const field of required) {
          if (!(field in result)) throw new Error(`Missing field: ${field}`);
        }
        
        return result;
      }
    },

    {
      id: 'test-validation-output-format',
      description: 'Doc validation output has required fields',
      run: async () => {
        const docs = [
          { name: 'Invoice.pdf', category: 'invoice', size_bytes: 250000 }
        ];
        
        const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
        
        const required = ['serviceType', 'validationStatus', 'completionPercentage', 'requiredDocuments', 'readyForSubmission'];
        for (const field of required) {
          if (!(field in result)) throw new Error(`Missing field: ${field}`);
        }
        
        return result;
      }
    },

    {
      id: 'test-limits-output-format',
      description: 'Approval limits output has required fields',
      run: async () => {
        const result = approvalLimits.checkApprovalLimits('P123456', 'PROV123', 'professional', 5000, 'riyadh');
        
        const required = ['patientId', 'branch', 'validationStatus', 'limits', 'claimFitsLimits', 'recommendations'];
        for (const field of required) {
          if (!(field in result)) throw new Error(`Missing field: ${field}`);
        }
        
        // Check nested structure
        if (!result.limits.yearly) throw new Error('Missing yearly limits');
        if (!result.limits.monthly) throw new Error('Missing monthly limits');
        if (!result.limits.perVisit) throw new Error('Missing per-visit limits');
        
        return result;
      }
    }
  ]
};

/**
 * Test Suite 4: Branch Logic
 */
const testBranchLogic = {
  name: 'Branch-Specific Logic',
  tests: [
    {
      id: 'test-riyadh-limits',
      description: 'Riyadh has simpler limit structure',
      run: async () => {
        const result = approvalLimits.checkApprovalLimits('P123456', 'PROV123', 'professional', 5000, 'riyadh');
        
        if (result.branch !== 'riyadh') throw new Error('Wrong branch');
        if (result.limits.yearly.limit !== 50000) throw new Error('Wrong yearly limit');
        if (result.requiresEscalation) throw new Error('Should not require escalation for 5000');
        
        return result;
      }
    },

    {
      id: 'test-abha-limits',
      description: 'ABHA has higher limits and escalation flags',
      run: async () => {
        const result = approvalLimits.checkApprovalLimits('P123456', 'PROV123', 'professional', 5000, 'abha');
        
        if (result.branch !== 'abha') throw new Error('Wrong branch');
        if (result.limits.yearly.limit < 50000) throw new Error('ABHA should have higher limits');
        
        return result;
      }
    }
  ]
};

/**
 * Run all tests
 */
async function runAllTests() {
  const suites = [
    testSkillExecution,
    testErrorHandling,
    testOutputFormats,
    testBranchLogic
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures = [];

  console.log('\n=== NPHIES Plugin Integration Tests ===\n');

  for (const suite of suites) {
    console.log(`\n📋 ${suite.name}`);
    console.log('─'.repeat(50));

    for (const test of suite.tests) {
      totalTests++;
      try {
        await test.run();
        passedTests++;
        console.log(`  ✓ ${test.id}: ${test.description}`);
      } catch (err) {
        failedTests++;
        failures.push({ test: test.id, error: err.message });
        console.log(`  ✗ ${test.id}: ${test.description}`);
        console.log(`    Error: ${err.message}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passedTests}/${totalTests} tests passed`);
  
  if (failedTests > 0) {
    console.log(`\n❌ ${failedTests} tests failed:`);
    failures.forEach(f => {
      console.log(`   - ${f.test}: ${f.error}`);
    });
  } else {
    console.log('\n✅ All tests passed!');
  }

  console.log('\n');
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  testSkillExecution,
  testErrorHandling,
  testOutputFormats,
  testBranchLogic,
  runAllTests
};
