/**
 * NPHIES Claims Plugin — Main Extension Entry Point
 * Registers commands, agents, skills, and MCP server connection
 */

import type { CommandResponse, Branch, BranchConfig } from './types/index.js';
import {
  ComplianceError,
  HealthcareAPIError,
  ALL_BRANCHES,
  BRANCH_LABELS,
  BRANCH_CF_LOGIN_URLS,
  BRANCH_CF_HOME_URLS,
  BRANCH_DIRECT_IPS,
  CONTROL_TOWER_URL,
} from './types/index.js';
import {
  nphiesValidate,
  nphiesAppeal,
  nphiesSubmit,
  nphiesBatch,
  nphiesStatus,
  nphiesHydrate,
} from './commands/index.js';

// Re-export public API
export {
  ComplianceError,
  HealthcareAPIError,
  nphiesValidate,
  nphiesAppeal,
  nphiesSubmit,
  nphiesBatch,
  nphiesStatus,
  nphiesHydrate,
  // Branch & portal constants
  ALL_BRANCHES,
  BRANCH_LABELS,
  BRANCH_CF_LOGIN_URLS,
  BRANCH_CF_HOME_URLS,
  BRANCH_DIRECT_IPS,
  CONTROL_TOWER_URL,
};

export type { CommandResponse, Branch, BranchConfig };

/** Plugin version — kept in sync with plugin.json */
export const PLUGIN_VERSION = '1.1.0';

/** BrainSAIT design tokens (exported for UI consumers) */
export const BRAINSAIT_COLORS = {
  midnightBlue: '#1a365d',
  medicalBlue:  '#2b6cb8',
  signalTeal:   '#0ea5e9',
} as const;

/** NPHIES compliance standards enforced by this plugin */
export const COMPLIANCE_STANDARDS = ['HIPAA', 'NPHIES-SA', 'FHIR_R4', 'MOH_SA'] as const;

/** Operator command registry — maps slash command IDs to implementations */
export const COMMAND_REGISTRY = {
  '/nphies-validate': nphiesValidate,
  '/nphies-submit':   nphiesSubmit,
  '/nphies-appeal':   nphiesAppeal,
  '/nphies-batch':    nphiesBatch,
  '/nphies-status':   nphiesStatus,
  '/nphies-hydrate':  nphiesHydrate,
} as const;
