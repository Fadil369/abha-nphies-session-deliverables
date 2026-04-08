/**
 * NPHIES Claims Plugin — TypeScript Skill Wrappers
 * Typed interfaces for all four core skills
 */

import type {
  Branch,
  ServiceType,
  ClaimPriority,
  NphiesRejectionCode,
  TriageResult,
  DocumentInfo,
  DocumentValidationResult,
  ApprovalLimitResult,
  BatchConfig,
  BatchResult,
  BatchItemResult,
  AuditEntry,
  AuditAction,
  ComplianceError as ComplianceErrorType,
} from '../types/index.js';

import { ComplianceError, HealthcareAPIError } from '../types/index.js';

// ─── Re-export error types for consumers ──────────────────────────────────────
export { ComplianceError, HealthcareAPIError };

// ─── Audit Logger ─────────────────────────────────────────────────────────────
let _auditLog: AuditEntry[] = [];

export function createAuditEntry(
  action: AuditAction,
  operator: string,
  branch: Branch,
  result: AuditEntry['result'],
  details: string,
  claimId?: string,
  batchId?: string
): AuditEntry {
  const entry: AuditEntry = {
    id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    action,
    operator,
    branch,
    claimId,
    batchId,
    result,
    details,
    hipaaCompliant: true,
  };
  _auditLog.push(entry);
  return entry;
}

export function getAuditLog(): AuditEntry[] {
  return [..._auditLog];
}

export function clearAuditLog(): void {
  _auditLog = [];
}

// ─── Skill 1: Claim Triage ────────────────────────────────────────────────────

interface RejectionCodeSpec {
  rootCause: string;
  description: string;
  priority: ClaimPriority;
  recoveryPercentage: number;
  action: string;
  requiredDocuments: string[];
  estimatedEffort: 'Low' | 'Medium' | 'High';
  successRate: number;
  appealTemplate: string;
  nextSteps: string[];
}

const REJECTION_DB: Readonly<Record<string, RejectionCodeSpec>> = {
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
      'Service date documentation',
    ],
    estimatedEffort: 'Low',
    successRate: 70,
    appealTemplate:
      'Requesting retroactive preauthorization per ART PreAuth Protocol. Medical necessity documented.',
    nextSteps: [
      'Prepare clinical justification',
      'Gather medical records from provider',
      'Submit retroactive preauthorization appeal via portal',
      'Check status in 3-5 business days',
    ],
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
    ],
    estimatedEffort: 'Medium',
    successRate: 50,
    appealTemplate:
      'Appealing contractual denial. Member was eligible at date of service. Service falls under covered benefits.',
    nextSteps: [
      'Review member policy for coverage',
      'Collect contractual documentation',
      'Prepare written appeal with policy references',
      'Submit to member services',
    ],
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
      'Insurance card or digital ID',
    ],
    estimatedEffort: 'Low',
    successRate: 75,
    appealTemplate: 'Resubmitting claim with corrected member ID verified from Oasis system.',
    nextSteps: [
      'Verify correct member ID from Oasis',
      'Check member eligibility dates',
      'Resubmit claim with correct ID',
    ],
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
    ],
    estimatedEffort: 'Low',
    successRate: 70,
    appealTemplate: 'Resubmitting with valid provider ID and contract confirmation from NPHIES system.',
    nextSteps: [
      'Confirm provider ID in NPHIES system',
      'Verify provider contract status',
      'Resubmit with corrected provider details',
    ],
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
      'Clinical records with service date',
    ],
    estimatedEffort: 'Low',
    successRate: 80,
    appealTemplate: 'Resubmitting with corrected service date. Member eligibility verified.',
    nextSteps: [
      'Verify correct service date from records',
      'Check member was eligible on that date',
      'Resubmit with corrected dates',
    ],
  },
};

const BRANCH_ADJUSTMENTS: Record<string, { name: string; recoveryMultiplier: number; timeToResolve: string }> = {
  riyadh:  { name: 'Al-Hayat National Hospital – Riyadh', recoveryMultiplier: 1.0,  timeToResolve: '3-5 business days' },
  abha:    { name: 'Hayat National Hospital – ABHA',      recoveryMultiplier: 0.95, timeToResolve: '5-7 business days' },
  madinah: { name: 'Hospital – Madinah',                  recoveryMultiplier: 0.97, timeToResolve: '4-6 business days' },
  unaizah: { name: 'Hospital – Unaizah',                  recoveryMultiplier: 0.95, timeToResolve: '5-7 business days' },
  khamis:  { name: 'Hospital – Khamis',                   recoveryMultiplier: 0.93, timeToResolve: '5-7 business days' },
  jizan:   { name: 'Hospital – Jizan',                    recoveryMultiplier: 0.92, timeToResolve: '6-8 business days' },
};

export function triageClaim(
  rejectionCode: NphiesRejectionCode,
  claimDetails: { claimAmount?: number; serviceType?: ServiceType; patientId?: string; invoiceNo?: string } = {},
  branch: Branch = 'riyadh'
): TriageResult {
  const branchInfo = BRANCH_ADJUSTMENTS[branch];
  const spec = REJECTION_DB[rejectionCode] ?? {
    rootCause: 'Unknown rejection code',
    description: 'This rejection code is not in the standard NPHIES database',
    priority: 'LOW' as ClaimPriority,
    recoveryPercentage: 30,
    action: 'Manual Review Required',
    requiredDocuments: ['NPHIES documentation for this code', 'Rejection message details'],
    estimatedEffort: 'High' as const,
    successRate: 30,
    appealTemplate: 'Requesting clarification on rejection reason and appeal guidelines.',
    nextSteps: ['Contact NPHIES support for code definition', 'Escalate to compliance team'],
  };

  const adjustedRecovery = Math.round(spec.recoveryPercentage * branchInfo.recoveryMultiplier);

  return {
    rejectionCode,
    rootCause: spec.rootCause,
    description: spec.description,
    branch,
    branchName: branchInfo.name,
    priorityTier: spec.priority,
    recoveryPercentage: adjustedRecovery,
    estimatedRecoveryAmount:
      claimDetails.claimAmount != null
        ? Math.round((claimDetails.claimAmount * adjustedRecovery) / 100)
        : null,
    actionRequired: spec.action,
    requiredDocuments: spec.requiredDocuments,
    estimatedEffort: spec.estimatedEffort,
    successRatePercent: spec.successRate,
    approxTimeToResolve: branchInfo.timeToResolve,
    nextSteps: spec.nextSteps,
    appealMessageTemplate: spec.appealTemplate,
    metadata: {
      claimAmount: claimDetails.claimAmount,
      serviceType: claimDetails.serviceType,
      patientId: claimDetails.patientId,
      invoiceNo: claimDetails.invoiceNo,
      timestamp: new Date().toISOString(),
    },
  };
}

// ─── Skill 2: Document Validation ─────────────────────────────────────────────

interface DocRequirement {
  name: string;
  category: string;
  formats: string[];
  priority: 'CRITICAL' | 'MEDIUM' | 'LOW';
}

const SERVICE_REQUIREMENTS: Record<ServiceType, { required: DocRequirement[]; optional: DocRequirement[] }> = {
  pharmacy: {
    required: [
      { name: 'Invoice/Receipt',        category: 'invoice',      formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Prescription',           category: 'prescription', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Patient ID Verification',category: 'patient_id',   formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
    ],
    optional: [
      { name: 'Medical Records',        category: 'medical_record', formats: ['PDF', 'TIFF'], priority: 'MEDIUM' },
    ],
  },
  professional: {
    required: [
      { name: 'Invoice/Receipt',        category: 'invoice',        formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
      { name: 'Medical Records',        category: 'medical_record', formats: ['PDF', 'TIFF'],         priority: 'CRITICAL' },
      { name: 'Patient ID Verification',category: 'patient_id',     formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
    ],
    optional: [
      { name: 'Clinical Justification', category: 'justification',  formats: ['PDF'],                priority: 'MEDIUM' },
      { name: 'Prior Authorization',    category: 'auth',            formats: ['PDF'],                priority: 'LOW' },
    ],
  },
  institutional: {
    required: [
      { name: 'Itemized Bill',          category: 'invoice',          formats: ['PDF', 'TIFF'],         priority: 'CRITICAL' },
      { name: 'Discharge Summary',      category: 'discharge_summary',formats: ['PDF', 'TIFF'],         priority: 'CRITICAL' },
      { name: 'Medical Records',        category: 'medical_record',   formats: ['PDF', 'TIFF'],         priority: 'CRITICAL' },
      { name: 'Patient ID Verification',category: 'patient_id',       formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
    ],
    optional: [
      { name: 'Lab Reports',    category: 'lab_report',    formats: ['PDF', 'TIFF'], priority: 'MEDIUM' },
      { name: 'Imaging Reports',category: 'imaging_report',formats: ['PDF', 'TIFF'], priority: 'MEDIUM' },
    ],
  },
  laboratory: {
    required: [
      { name: 'Lab Report Invoice', category: 'invoice',    formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Request Form',       category: 'request',    formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Patient ID',         category: 'patient_id', formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
    ],
    optional: [],
  },
  radiology: {
    required: [
      { name: 'Radiology Report', category: 'invoice',     formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Request Form',     category: 'request',     formats: ['PDF', 'TIFF'], priority: 'CRITICAL' },
      { name: 'Patient ID',       category: 'patient_id',  formats: ['PDF', 'TIFF', 'JPG'], priority: 'CRITICAL' },
    ],
    optional: [],
  },
};

export function validateDocuments(
  serviceType: ServiceType,
  providedDocs: DocumentInfo[],
  rejectionCode: NphiesRejectionCode | null = null,
  branch: Branch = 'riyadh'
): DocumentValidationResult {
  if (!SERVICE_REQUIREMENTS[serviceType]) {
    throw new ComplianceError(
      `Unknown service type: ${serviceType}`,
      'DOC_VAL_001',
      'NPHIES',
    );
  }

  const reqs = SERVICE_REQUIREMENTS[serviceType];
  const providedCategories = new Set(providedDocs.map((d) => d.category));

  const missingCritical = reqs.required
    .filter((r) => !providedCategories.has(r.category))
    .map((r) => r.name);

  const missingOptional = reqs.optional
    .filter((r) => !providedCategories.has(r.category))
    .map((r) => r.name);

  const issues: string[] = [];
  for (const doc of providedDocs) {
    if (doc.size_bytes !== undefined && doc.size_bytes > 10 * 1024 * 1024) {
      issues.push(`${doc.name}: file exceeds 10 MB limit`);
    }
  }

  const requiredPresent = reqs.required.length - missingCritical.length;
  const completionPercentage =
    reqs.required.length === 0 ? 100 : Math.round((requiredPresent / reqs.required.length) * 100);

  return {
    serviceType,
    branch,
    allPresent: missingCritical.length === 0,
    readyForSubmission: missingCritical.length === 0 && issues.length === 0,
    completionPercentage,
    missingCritical,
    missingOptional,
    issues,
    checkedDocuments: providedDocs,
  };
}

// ─── Skill 3: Approval Limits ──────────────────────────────────────────────────

const DEFAULT_LIMITS: Record<string, Record<string, { limit: number; warnAt: number }>> = {
  riyadh: {
    yearly:   { limit: 50000, warnAt: 0.8 },
    monthly:  { limit: 10000, warnAt: 0.8 },
    perVisit: { limit: 5000,  warnAt: 0.9 },
  },
  abha: {
    yearly:   { limit: 75000, warnAt: 0.8 },
    monthly:  { limit: 15000, warnAt: 0.8 },
    perVisit: { limit: 7500,  warnAt: 0.9 },
  },
  madinah: {
    yearly:   { limit: 60000, warnAt: 0.8 },
    monthly:  { limit: 12000, warnAt: 0.8 },
    perVisit: { limit: 6000,  warnAt: 0.9 },
  },
  unaizah: {
    yearly:   { limit: 50000, warnAt: 0.8 },
    monthly:  { limit: 10000, warnAt: 0.8 },
    perVisit: { limit: 5000,  warnAt: 0.9 },
  },
  khamis: {
    yearly:   { limit: 50000, warnAt: 0.8 },
    monthly:  { limit: 10000, warnAt: 0.8 },
    perVisit: { limit: 5000,  warnAt: 0.9 },
  },
  jizan: {
    yearly:   { limit: 45000, warnAt: 0.8 },
    monthly:  { limit: 9000,  warnAt: 0.8 },
    perVisit: { limit: 4500,  warnAt: 0.9 },
  },
};

const SERVICE_MULTIPLIERS: Record<ServiceType, number> = {
  pharmacy:      0.8,
  professional:  1.0,
  institutional: 1.5,
  laboratory:    0.6,
  radiology:     0.9,
};

export function checkApprovalLimits(
  patientId: string,
  providerId: string,
  serviceType: ServiceType,
  claimAmount: number,
  branch: Branch = 'riyadh'
): ApprovalLimitResult {
  const limits = DEFAULT_LIMITS[branch];
  const multiplier = SERVICE_MULTIPLIERS[serviceType] ?? 1.0;

  const yearlyLimit  = Math.round(limits.yearly.limit   * multiplier);
  const monthlyLimit = Math.round(limits.monthly.limit  * multiplier);
  const perVisitLimit= Math.round(limits.perVisit.limit * multiplier);

  // Simulate consumed amounts (replace with live Oasis lookup in production)
  const consumedYearly  = 0;
  const consumedMonthly = 0;

  const availableYearly  = yearlyLimit  - consumedYearly;
  const availableMonthly = monthlyLimit - consumedMonthly;

  const warnings: string[] = [];
  if (claimAmount > perVisitLimit) {
    warnings.push(`Claim amount SAR ${claimAmount} exceeds per-visit limit SAR ${perVisitLimit}`);
  }
  if (availableYearly < yearlyLimit * (1 - limits.yearly.warnAt)) {
    warnings.push(`Patient ${patientId} approaching yearly limit — only SAR ${availableYearly} remaining`);
  }
  if (availableMonthly < monthlyLimit * (1 - limits.monthly.warnAt)) {
    warnings.push(`Patient ${patientId} approaching monthly limit — only SAR ${availableMonthly} remaining`);
  }

  const withinLimits =
    claimAmount <= perVisitLimit &&
    claimAmount <= availableYearly &&
    claimAmount <= availableMonthly;

  return {
    patientId,
    providerId,
    serviceType,
    branch,
    yearlyLimit,
    monthlyLimit,
    perVisitLimit,
    availableYearly,
    availableMonthly,
    claimAmount,
    withinLimits,
    warnings,
    hydrationRequired: branch === 'abha' || branch === 'madinah',
  };
}

// ─── Skill 4: Batch Processor ──────────────────────────────────────────────────

export function generateBatchId(): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BATCH-${ts}-${rand}`;
}

export function validateClaimRow(row: Record<string, string>, index: number): string[] {
  const required = ['claimId', 'invoiceNo', 'amount', 'serviceType', 'patientId', 'providerId'];
  return required
    .filter((field) => !row[field])
    .map((field) => `Row ${index + 2}: Missing required field "${field}"`);
}

export function simulateDryRun(
  claims: Array<Record<string, string>>,
  branch: Branch
): BatchItemResult[] {
  return claims.map((claim, i) => {
    const errors = validateClaimRow(claim, i);
    if (errors.length > 0) {
      return {
        index: i,
        claimId:   claim['claimId']   ?? `UNKNOWN-${i}`,
        invoiceNo: claim['invoiceNo'] ?? '',
        status: 'error' as const,
        message: errors.join('; '),
      };
    }
    // Simulate 95% success in dry-run
    const success = Math.random() > 0.05;
    return {
      index: i,
      claimId:   claim['claimId'],
      invoiceNo: claim['invoiceNo'],
      status:    success ? 'success' as const : 'error' as const,
      message:   success ? 'Dry-run validation passed' : 'Simulated portal timeout',
      receiptId: success ? `DRY-${Date.now()}-${i}` : undefined,
    };
  });
}

export function aggregateBatchResults(
  batchId: string,
  mode: BatchConfig['mode'],
  branch: Branch,
  dryRun: boolean,
  items: BatchItemResult[],
  auditTrail: AuditEntry[]
): BatchResult {
  const succeeded = items.filter((i) => i.status === 'success').length;
  const failed    = items.filter((i) => i.status === 'error').length;
  return {
    batchId,
    mode,
    branch,
    dryRun,
    totalClaims:  items.length,
    processed:    items.length,
    succeeded,
    failed,
    successRate:  items.length === 0 ? 0 : Math.round((succeeded / items.length) * 100),
    items,
    auditTrail,
    completedAt: new Date().toISOString(),
  };
}
