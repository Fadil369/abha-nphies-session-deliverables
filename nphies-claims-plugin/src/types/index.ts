/**
 * NPHIES Claims Plugin — Core TypeScript Type Definitions
 * Strict FHIR R4 compliance with BrainSAIT clinical terminology
 */

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class ComplianceError extends Error {
  public readonly code: string;
  public readonly regulation: string;
  public readonly claimId?: string;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    regulation: 'HIPAA' | 'NPHIES' | 'FHIR_R4' | 'MOH_SA',
    claimId?: string
  ) {
    super(message);
    this.name = 'ComplianceError';
    this.code = code;
    this.regulation = regulation;
    this.claimId = claimId;
    this.timestamp = new Date().toISOString();
  }
}

export class HealthcareAPIError extends Error {
  public readonly statusCode: number;
  public readonly endpoint: string;
  public readonly branch: Branch;
  public readonly retryable: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number,
    endpoint: string,
    branch: Branch,
    retryable = false
  ) {
    super(message);
    this.name = 'HealthcareAPIError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.branch = branch;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
  }
}

// ─── Branch & Portal Types ─────────────────────────────────────────────────────

export type Branch = 'riyadh' | 'abha' | 'madinah' | 'unaizah' | 'khamis' | 'jizan';

export const ALL_BRANCHES: Branch[] = ['abha', 'riyadh', 'madinah', 'unaizah', 'khamis', 'jizan'];

export const BRANCH_LABELS: Record<Branch, string> = {
  abha:    'Hayat National Hospital – ABHA',
  riyadh:  'Al-Hayat National Hospital – Riyadh',
  madinah: 'Hospital – Madinah',
  unaizah: 'Hospital – Unaizah',
  khamis:  'Hospital – Khamis',
  jizan:   'Hospital – Jizan',
};

export const BRANCH_HOSTS: Record<Branch, string> = {
  abha:    '172.19.1.1',
  riyadh:  '128.1.1.185',
  madinah: '172.25.11.26',
  unaizah: '10.0.100.105',
  khamis:  '172.30.0.77',
  jizan:   '172.17.4.84',
};

export interface BranchConfig {
  key: Branch;
  label: string;
  host: string;
  basePath: string;
  homeUrl: string;
  loginUrl: string;
}

// ─── FHIR R4 Resource Types ────────────────────────────────────────────────────

export type FhirResourceType =
  | 'Claim'
  | 'ClaimResponse'
  | 'Coverage'
  | 'Patient'
  | 'Practitioner'
  | 'Organization'
  | 'Bundle';

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirMoney {
  value: number;
  currency: 'SAR';
}

export interface FhirReference {
  reference: string;
  display?: string;
}

// ─── Claim Types ───────────────────────────────────────────────────────────────

export type ServiceType = 'pharmacy' | 'professional' | 'institutional' | 'laboratory' | 'radiology';

export type ClaimPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type ClaimStatus =
  | 'pending'
  | 'validated'
  | 'dry-run-passed'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'appealed'
  | 'error';

export type NphiesRejectionCode =
  | 'BE-1-4'
  | 'MN-1-1'
  | 'BE-1-1'
  | 'BE-2-1'
  | 'MN-1-2'
  | 'BE-3-1'
  | string;

export interface Claim {
  claimId: string;
  invoiceNo: string;
  amount: number;
  serviceType: ServiceType;
  patientId: string;
  providerId: string;
  branch: Branch;
  serviceDate?: string;
  rejectionCode?: NphiesRejectionCode;
  status?: ClaimStatus;
}

// ─── Triage Types ──────────────────────────────────────────────────────────────

export interface TriageResult {
  rejectionCode: NphiesRejectionCode;
  rootCause: string;
  description: string;
  branch: Branch;
  branchName: string;
  priorityTier: ClaimPriority;
  recoveryPercentage: number;
  estimatedRecoveryAmount: number | null;
  actionRequired: string;
  requiredDocuments: string[];
  estimatedEffort: 'Low' | 'Medium' | 'High';
  successRatePercent: number;
  approxTimeToResolve: string;
  nextSteps: string[];
  appealMessageTemplate: string;
  metadata: {
    claimAmount?: number;
    serviceType?: ServiceType;
    patientId?: string;
    invoiceNo?: string;
    timestamp: string;
  };
}

// ─── Document Validation Types ─────────────────────────────────────────────────

export interface DocumentInfo {
  name: string;
  category: string;
  size_bytes?: number;
  format?: string;
}

export interface DocumentValidationResult {
  serviceType: ServiceType;
  branch: Branch;
  allPresent: boolean;
  readyForSubmission: boolean;
  completionPercentage: number;
  missingCritical: string[];
  missingOptional: string[];
  issues: string[];
  checkedDocuments: DocumentInfo[];
}

// ─── Approval Limit Types ──────────────────────────────────────────────────────

export interface ApprovalLimitResult {
  patientId: string;
  providerId: string;
  serviceType: ServiceType;
  branch: Branch;
  yearlyLimit: number;
  monthlyLimit: number;
  perVisitLimit: number;
  availableYearly: number;
  availableMonthly: number;
  claimAmount: number;
  withinLimits: boolean;
  warnings: string[];
  hydrationRequired: boolean;
}

// ─── Batch Processing Types ────────────────────────────────────────────────────

export type BatchMode = 'validate' | 'dry-run' | 'submit';

export interface BatchConfig {
  inputFile: string;
  branch: Branch;
  mode: BatchMode;
  batchSize: number;
  dryRun: boolean;
  dryRunCount: number;
  requiredDryRuns: number;
}

export interface BatchItemResult {
  index: number;
  claimId: string;
  invoiceNo: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  receiptId?: string;
}

export interface BatchResult {
  batchId: string;
  mode: BatchMode;
  branch: Branch;
  dryRun: boolean;
  totalClaims: number;
  processed: number;
  succeeded: number;
  failed: number;
  successRate: number;
  items: BatchItemResult[];
  auditTrail: AuditEntry[];
  completedAt: string;
}

// ─── Audit & Compliance Types ──────────────────────────────────────────────────

export type AuditAction =
  | 'validate'
  | 'triage'
  | 'doc-check'
  | 'limit-check'
  | 'dry-run'
  | 'submit'
  | 'appeal'
  | 'hydrate'
  | 'status-check';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  operator: string;
  branch: Branch;
  claimId?: string;
  batchId?: string;
  result: 'success' | 'failure' | 'warning';
  details: string;
  hipaaCompliant: boolean;
}

// ─── Command Response Types ────────────────────────────────────────────────────

export interface CommandResponse<T = unknown> {
  success: boolean;
  command: string;
  timestamp: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  audit: AuditEntry;
}

// ─── Dashboard Stat Types ──────────────────────────────────────────────────────

export interface DashboardStats {
  recoveryPotential: number;
  activeClaims: number;
  pendingAppeals: number;
  successRate: number;
  lastUpdated: string;
  branchBreakdown: {
    riyadh: BranchStats;
    abha: BranchStats;
  };
}

export interface BranchStats {
  totalClaims: number;
  recoveryAmount: number;
  successRate: number;
  pendingSubmissions: number;
}

// ─── MCP Tool Types ────────────────────────────────────────────────────────────

export interface MCPToolInput {
  branch?: Branch;
  dryRun?: boolean;
}

export interface ValidateClaimInput extends MCPToolInput {
  claim: Claim;
}

export interface CheckApprovalLimitsInput extends MCPToolInput {
  patientId: string;
  providerId: string;
  serviceType: ServiceType;
  amount: number;
}

export interface SubmitAppealBatchInput extends MCPToolInput {
  claimIds: string[];
  correctiveAction: string;
}

export interface GetSubmissionStatusInput extends MCPToolInput {
  receiptId: string;
}
