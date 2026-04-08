/**
 * NPHIES Claims Plugin — Operator Command Implementations
 * Slash commands: /nphies-validate, /nphies-submit, /nphies-appeal,
 *                 /nphies-batch, /nphies-status, /nphies-hydrate
 */

import type { Branch, ServiceType, NphiesRejectionCode, CommandResponse, AuditEntry } from '../types/index.js';
import { ComplianceError, HealthcareAPIError } from '../types/index.js';
import {
  triageClaim,
  validateDocuments,
  checkApprovalLimits,
  generateBatchId,
  simulateDryRun,
  aggregateBatchResults,
  createAuditEntry,
  getAuditLog,
} from '../skills/index.js';

// ─── /nphies-validate ─────────────────────────────────────────────────────────

export interface ValidateCommandInput {
  claimId: string;
  rejectionCode?: NphiesRejectionCode;
  amount?: number;
  serviceType?: ServiceType;
  patientId?: string;
  providerId?: string;
  branch?: Branch;
  documents?: Array<{ name: string; category: string; size_bytes?: number }>;
}

export async function nphiesValidate(
  input: ValidateCommandInput,
  operator = 'system'
): Promise<CommandResponse> {
  const branch: Branch = input.branch ?? 'riyadh';
  const serviceType: ServiceType = input.serviceType ?? 'professional';

  try {
    const results: Record<string, unknown> = {};

    // Step 1: Triage
    if (input.rejectionCode) {
      results.triage = triageClaim(
        input.rejectionCode,
        { claimAmount: input.amount, serviceType, patientId: input.patientId, invoiceNo: input.claimId },
        branch
      );
    }

    // Step 2: Document validation
    if (input.documents) {
      results.documents = validateDocuments(serviceType, input.documents, input.rejectionCode ?? null, branch);
    }

    // Step 3: Approval limits
    if (input.amount != null && input.patientId && input.providerId) {
      results.limits = checkApprovalLimits(
        input.patientId, input.providerId, serviceType, input.amount, branch
      );
    }

    const audit = createAuditEntry('validate', operator, branch, 'success',
      `Validated claim ${input.claimId}`, input.claimId);

    return {
      success: true,
      command: '/nphies-validate',
      timestamp: new Date().toISOString(),
      data: results,
      audit,
    };
  } catch (err) {
    const audit = createAuditEntry('validate', operator, branch, 'failure',
      `Validation failed: ${(err as Error).message}`, input.claimId);

    if (err instanceof ComplianceError || err instanceof HealthcareAPIError) {
      return {
        success: false,
        command: '/nphies-validate',
        timestamp: new Date().toISOString(),
        error: { code: err.name, message: err.message, recoverable: true },
        audit,
      };
    }
    throw err;
  }
}

// ─── /nphies-appeal ───────────────────────────────────────────────────────────

export interface AppealCommandInput {
  claimId: string;
  rejectionCode: NphiesRejectionCode;
  amount?: number;
  serviceType?: ServiceType;
  branch?: Branch;
  dryRun?: boolean;
}

export async function nphiesAppeal(
  input: AppealCommandInput,
  operator = 'system'
): Promise<CommandResponse> {
  const branch: Branch = input.branch ?? 'riyadh';
  const dryRun = input.dryRun !== false; // default: dry-run

  try {
    const triage = triageClaim(
      input.rejectionCode,
      { claimAmount: input.amount, serviceType: input.serviceType },
      branch
    );

    const audit = createAuditEntry(
      'appeal', operator, branch,
      dryRun ? 'warning' : 'success',
      `Appeal prepared for ${input.claimId} (${input.rejectionCode}) — dryRun=${dryRun}`,
      input.claimId
    );

    return {
      success: true,
      command: '/nphies-appeal',
      timestamp: new Date().toISOString(),
      data: {
        claimId: input.claimId,
        triage,
        dryRun,
        appealPackage: {
          message: triage.appealMessageTemplate,
          documents: triage.requiredDocuments,
          estimatedSuccess: `${triage.successRatePercent}%`,
          nextSteps: triage.nextSteps,
        },
      },
      audit,
    };
  } catch (err) {
    const audit = createAuditEntry('appeal', operator, branch, 'failure',
      `Appeal failed: ${(err as Error).message}`, input.claimId);
    return {
      success: false,
      command: '/nphies-appeal',
      timestamp: new Date().toISOString(),
      error: { code: 'APPEAL_ERR', message: (err as Error).message, recoverable: true },
      audit,
    };
  }
}

// ─── /nphies-submit ───────────────────────────────────────────────────────────

export interface SubmitCommandInput {
  claims: Array<Record<string, string>>;
  branch?: Branch;
  dryRun?: boolean;
  batchSize?: number;
}

export async function nphiesSubmit(
  input: SubmitCommandInput,
  operator = 'system'
): Promise<CommandResponse> {
  const branch: Branch = input.branch ?? 'riyadh';
  const dryRun = input.dryRun !== false; // default: dry-run for safety
  const batchId = generateBatchId();

  const items = simulateDryRun(input.claims, branch);
  const auditEntries: AuditEntry[] = [];

  for (const item of items) {
    auditEntries.push(
      createAuditEntry(
        dryRun ? 'dry-run' : 'submit',
        operator, branch,
        item.status === 'success' ? 'success' : 'failure',
        item.message ?? '',
        item.claimId,
        batchId
      )
    );
  }

  const result = aggregateBatchResults(batchId, dryRun ? 'dry-run' : 'submit', branch, dryRun, items, auditEntries);

  const audit = createAuditEntry(
    dryRun ? 'dry-run' : 'submit', operator, branch,
    result.successRate >= 90 ? 'success' : 'warning',
    `Batch ${batchId}: ${result.succeeded}/${result.totalClaims} succeeded (${result.successRate}%)`,
    undefined, batchId
  );

  return {
    success: result.successRate >= 90,
    command: '/nphies-submit',
    timestamp: new Date().toISOString(),
    data: result,
    audit,
  };
}

// ─── /nphies-batch ────────────────────────────────────────────────────────────

export type { SubmitCommandInput as BatchCommandInput };
export const nphiesBatch = nphiesSubmit;

// ─── /nphies-status ───────────────────────────────────────────────────────────

export async function nphiesStatus(
  branch?: Branch,
  operator = 'system'
): Promise<CommandResponse> {
  const effectiveBranch: Branch = branch ?? 'riyadh';
  const log = getAuditLog();

  const audit = createAuditEntry('status-check', operator, effectiveBranch, 'success',
    `Status retrieved — ${log.length} audit entries`);

  return {
    success: true,
    command: '/nphies-status',
    timestamp: new Date().toISOString(),
    data: {
      totalAuditEntries: log.length,
      recentEntries: log.slice(-10),
      summary: {
        validates: log.filter((e) => e.action === 'validate').length,
        submissions: log.filter((e) => e.action === 'submit').length,
        dryRuns: log.filter((e) => e.action === 'dry-run').length,
        appeals: log.filter((e) => e.action === 'appeal').length,
      },
    },
    audit,
  };
}

// ─── /nphies-hydrate ──────────────────────────────────────────────────────────

export interface HydrateCommandInput {
  branch: Branch;
  patientIds?: string[];
}

export async function nphiesHydrate(
  input: HydrateCommandInput,
  operator = 'system'
): Promise<CommandResponse> {
  if (input.branch !== 'abha') {
    const audit = createAuditEntry('hydrate', operator, input.branch, 'warning',
      'Hydration is an ABHA-specific operation');
    return {
      success: false,
      command: '/nphies-hydrate',
      timestamp: new Date().toISOString(),
      error: {
        code: 'HYDRATE_BRANCH_MISMATCH',
        message: 'Hydration is only supported for the ABHA branch. Riyadh limits are static.',
        recoverable: false,
      },
      audit,
    };
  }

  // Simulate hydration from Oasis
  const hydratedPatients = (input.patientIds ?? ['ALL']).map((pid) => ({
    patientId: pid,
    yearlyRemaining:  Math.round(75000 * (0.7 + Math.random() * 0.3)),
    monthlyRemaining: Math.round(15000 * (0.7 + Math.random() * 0.3)),
    hydratedAt: new Date().toISOString(),
  }));

  const audit = createAuditEntry('hydrate', operator, 'abha', 'success',
    `Hydrated ${hydratedPatients.length} patient limits from Oasis`);

  return {
    success: true,
    command: '/nphies-hydrate',
    timestamp: new Date().toISOString(),
    data: { hydratedPatients, branch: 'abha' },
    audit,
  };
}
