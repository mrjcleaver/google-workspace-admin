export type ComplianceStatus =
  | "compliant"
  | "non-compliant"
  | "invalid"
  | "exempt";

export interface ForwardingEntry {
  forwardingAddress: string;
  verified?: boolean;
  disposition?: string;
  enabled?: boolean;
}

export interface UserRecord {
  primaryEmail: string;
  isAdmin?: boolean;
  isSuspended?: boolean;
  orgUnitPath?: string;
  recoveryEmail?: string;
  groups?: string[];
  /** ISO timestamp of last Google login, or undefined if never logged in. */
  lastLoginTime?: string;
}

export interface AuditRecord {
  primaryEmail: string;
  isAdmin: boolean;
  isSuspended: boolean;
  forwardingAddresses: ForwardingEntry[];
  recoveryEmail: string;
  groups: string[];
  lastLoginTime: string;
  /** Integer day count, or -1 to indicate "never logged in". */
  daysSinceLogin: number;
  /** True when account is dormant AND no working forwarding configured. */
  unreachable: boolean;
  status: ComplianceStatus;
  reason: string;
  lastChecked: string;
}

export interface AuditSummary {
  totalUsers: number;
  compliant: number;
  nonCompliant: number;
  invalid: number;
  exempt: number;
  unreachable: number;
  compliancePct: number;
  generatedAt: string;
}

export interface AuditResult {
  records: AuditRecord[];
  summary: AuditSummary;
}

export interface ComplianceOptions {
  /** Domains permitted as forwarding targets. Empty = any domain allowed. */
  allowedDomains?: string[];
  /** Treat admin users as exempt from forwarding requirement. PRD open Q3 → true. */
  exemptAdmins?: boolean;
  /** Treat suspended users as exempt. */
  exemptSuspended?: boolean;
  /** Days since last login above which the account is considered dormant. */
  unreachableAfterDays?: number;
}
