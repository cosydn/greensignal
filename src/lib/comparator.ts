// Deterministic rule engine ported 1:1 from comparator.py. No AI involvement.
export type Decision = "ALLOW" | "HOLD" | "ESCALATE" | "BLOCK";

export interface OperationalInput {
  parameter_name?: string;
  measured_value?: number;
  unit?: string;
  has_required_evidence?: boolean;
  calibration_valid?: boolean;
  operating_hours_provided?: boolean;
  requires_permit_modification?: boolean;
}
export interface PermitLimit {
  parameter_name?: string;
  max_allowable_limit?: number | null;
  unit?: string;
  permit_section?: string;
}
export interface RegulatoryBaseline {
  citation?: string;
  heading?: string | null;
  snippet?: string;
}
export interface UnifiedContext {
  operational_input: OperationalInput;
  facility_permit_limit: PermitLimit;
  regulatory_baseline: RegulatoryBaseline;
}
export interface AuditReport {
  decision: Decision;
  parameter: string;
  rationale: string;
  citations: string[];
}

export function runComplianceComparator(ctx: UnifiedContext): AuditReport {
  const op = ctx.operational_input ?? {};
  const permit = ctx.facility_permit_limit ?? {};
  const baseline = ctx.regulatory_baseline ?? {};
  const val = op.measured_value ?? 0;
  const limit = permit.max_allowable_limit ?? null;
  const param = op.parameter_name ?? "Emission Metric";

  const hasEvidence = op.has_required_evidence ?? true;
  const calibrationValid = op.calibration_valid ?? true;
  const hoursProvided = op.operating_hours_provided ?? true;

  if (!hasEvidence || !calibrationValid || !hoursProvided) {
    return {
      decision: "HOLD",
      parameter: param,
      rationale:
        "Required evidence, valid equipment calibration, or operating hours are missing or unsuitable.",
      citations: [
        permit.permit_section ?? "Permit General Conditions",
        baseline.citation ?? "40 CFR Baseline",
      ],
    };
  }
  if (limit !== null && val > limit) {
    return {
      decision: "BLOCK",
      parameter: param,
      rationale: `Calculated value (${val}) exceeds verified limit (${limit}). Defined rule prohibits action.`,
      citations: [
        permit.permit_section ?? "Permit Limits Table",
        baseline.citation ?? "40 CFR Baseline",
      ],
    };
  }
  if (op.requires_permit_modification || (limit !== null && val >= limit * 0.9)) {
    return {
      decision: "ESCALATE",
      parameter: param,
      rationale:
        "Value is within 90% of threshold or requires a permit modification review by an authorized official.",
      citations: [permit.permit_section ?? "Permit Modification Clause"],
    };
  }
  return {
    decision: "ALLOW",
    parameter: param,
    rationale: `Measured value (${val}) is within limit (${limit}) with valid evidence and calibration.`,
    citations: [
      permit.permit_section ?? "Permit Limits Table",
      baseline.citation ?? "40 CFR Baseline",
    ],
  };
}
