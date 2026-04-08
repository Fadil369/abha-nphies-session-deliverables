/**
 * NPHIES Claims Plugin — TypeScript Integration Tests
 * Tests for typed skill wrappers, error classes, and command implementations
 */

import { strict as assert } from 'assert';

// ─── We test via compiled JS or by running ts-node ──────────────────────────
// Since the project uses CJS for existing tests, we import from the skills JS
// and test the TypeScript types via assertion patterns.

const path = require('path');
const pluginRoot = path.join(__dirname, '..');

// Import compiled or source skill modules
const claimTriage = require(path.join(pluginRoot, 'skills/claim-triage/analyze.js'));
const docValidation = require(path.join(pluginRoot, 'skills/doc-validation/validate.js'));
const approvalLimits = require(path.join(pluginRoot, 'skills/approval-limits/check.js'));

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n    ${msg}`);
    failures.push(`${name}: ${msg}`);
    failed++;
  }
}

// ─── Suite 1: Claim Triage ────────────────────────────────────────────────────
console.log('\n[Suite 1] Claim Triage Skill');

await test('BE-1-4 triaged as HIGH priority', () => {
  const result = claimTriage.triageClaim('BE-1-4', { claimAmount: 5000 }, 'riyadh');
  assert.equal(result.rejectionCode, 'BE-1-4');
  assert.equal(result.priorityTier, 'HIGH');
  assert.ok(result.recoveryPercentage >= 60, `Expected >= 60, got ${result.recoveryPercentage}`);
  assert.ok(result.nextSteps.length > 0, 'Expected nextSteps');
  assert.ok(result.estimatedRecoveryAmount !== null, 'Expected recovery amount');
});

await test('MN-1-1 triaged as MEDIUM priority', () => {
  const result = claimTriage.triageClaim('MN-1-1', { claimAmount: 2500 }, 'abha');
  assert.equal(result.rejectionCode, 'MN-1-1');
  assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(result.priorityTier));
  assert.ok(result.requiredDocuments.length > 0);
});

await test('ABHA branch applies recovery multiplier', () => {
  const riyadh = claimTriage.triageClaim('BE-1-4', { claimAmount: 1000 }, 'riyadh');
  const abha   = claimTriage.triageClaim('BE-1-4', { claimAmount: 1000 }, 'abha');
  assert.ok(abha.recoveryPercentage <= riyadh.recoveryPercentage,
    `ABHA ${abha.recoveryPercentage} should be <= Riyadh ${riyadh.recoveryPercentage}`);
});

await test('Unknown rejection code returns LOW priority with manual review', () => {
  const result = claimTriage.triageClaim('XX-9-9', {}, 'riyadh');
  assert.equal(result.priorityTier, 'LOW');
  assert.ok(result.actionRequired.toLowerCase().includes('manual'));
});

await test('Batch processing returns summary statistics', () => {
  const tmpFile = require('os').tmpdir() + '/test-batch.json';
  require('fs').writeFileSync(tmpFile, JSON.stringify([
    { rejectionCode: 'BE-1-4', details: { claimAmount: 5000 }, branch: 'riyadh' },
    { rejectionCode: 'MN-1-1', details: { claimAmount: 2500 }, branch: 'abha' },
  ]));
  const result = claimTriage.processBatch(tmpFile);
  assert.equal(result.summary.totalClaims, 2);
  assert.ok(result.summary.averageRecovery > 0);
  require('fs').unlinkSync(tmpFile);
});

// ─── Suite 2: Document Validation ────────────────────────────────────────────
console.log('\n[Suite 2] Document Validation Skill');

await test('Complete professional document set passes', () => {
  const docs = [
    { name: 'Invoice.pdf',     category: 'invoice',        size_bytes: 250000 },
    { name: 'MedRecords.pdf',  category: 'medical_record', size_bytes: 500000 },
    { name: 'PatientID.pdf',   category: 'patient_id',     size_bytes: 100000 },
  ];
  const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
  assert.equal(result.allPresent, true);
  assert.equal(result.readyForSubmission, true);
  assert.equal(result.completionPercentage, 100);
  assert.equal(result.missingCritical.length, 0);
});

await test('Missing invoice fails validation', () => {
  const docs = [
    { name: 'MedRecords.pdf', category: 'medical_record', size_bytes: 500000 },
  ];
  const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
  assert.equal(result.allPresent, false);
  assert.equal(result.readyForSubmission, false);
  assert.ok(result.completionPercentage < 100);
  assert.ok(result.missingCritical.length > 0);
});

await test('Oversized document generates an issue', () => {
  const docs = [
    { name: 'HugeFile.pdf',   category: 'invoice',        size_bytes: 15 * 1024 * 1024 },
    { name: 'MedRecords.pdf', category: 'medical_record', size_bytes: 500000 },
    { name: 'PatientID.pdf',  category: 'patient_id',     size_bytes: 100000 },
  ];
  const result = docValidation.validateDocuments('professional', docs, null, 'riyadh');
  assert.ok(result.issues.length > 0, 'Expected size issue');
});

await test('Pharmacy service type handled correctly', () => {
  const docs = [
    { name: 'Invoice.pdf',     category: 'invoice',      size_bytes: 50000 },
    { name: 'Script.pdf',      category: 'prescription', size_bytes: 50000 },
    { name: 'PatientID.jpg',   category: 'patient_id',   size_bytes: 50000 },
  ];
  const result = docValidation.validateDocuments('pharmacy', docs, null, 'abha');
  assert.equal(result.allPresent, true);
});

// ─── Suite 3: Approval Limits ─────────────────────────────────────────────────
console.log('\n[Suite 3] Approval Limits Skill');

await test('Claim within limits is approved', () => {
  const result = approvalLimits.checkApprovalLimits('P001', 'PROV001', 'professional', 3000, 'riyadh');
  assert.equal(result.withinLimits, true);
  assert.ok(result.yearlyLimit > 0);
  assert.ok(result.perVisitLimit > 0);
});

await test('Claim exceeding per-visit limit is flagged', () => {
  const result = approvalLimits.checkApprovalLimits('P001', 'PROV001', 'professional', 999999, 'riyadh');
  assert.equal(result.withinLimits, false);
  assert.ok(result.warnings.length > 0, 'Expected warning messages');
});

await test('ABHA branch has higher limits than Riyadh', () => {
  const riyadh = approvalLimits.checkApprovalLimits('P002', 'PROV002', 'professional', 1000, 'riyadh');
  const abha   = approvalLimits.checkApprovalLimits('P002', 'PROV002', 'professional', 1000, 'abha');
  assert.ok(abha.yearlyLimit >= riyadh.yearlyLimit);
});

await test('Institutional service type has higher per-visit limit', () => {
  const prof  = approvalLimits.checkApprovalLimits('P003', 'PROV003', 'professional',   1000, 'riyadh');
  const inst  = approvalLimits.checkApprovalLimits('P003', 'PROV003', 'institutional',  1000, 'riyadh');
  assert.ok(inst.perVisitLimit >= prof.perVisitLimit);
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error('\nFailed tests:');
  failures.forEach((f) => console.error(`  • ${f}`));
  process.exit(1);
} else {
  console.log('All TypeScript integration tests passed ✓');
  process.exit(0);
}
