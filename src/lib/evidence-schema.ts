// Canonical evidence model. Every uploaded document is parsed into a
// fragment of this shape; confirmed fragments are merged into one evidence JSON.
import { z } from "zod";

const str = z.coerce.string().catch("");
const optStr = z.string().nullish().transform((v) => v ?? undefined);
const num = z.coerce.number().nullish().catch(null).transform((v) => (v == null || Number.isNaN(v) ? undefined : v));
const strArr = z.array(z.coerce.string()).catch([]);

export const SECTIONS = [
  "facility",
  "permit",
  "equipment_emissions",
  "operating_records",
  "proposed_equipment",
  "environmental",
  "costs",
  "approvals",
  "instructions",
  "other",
] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  facility: "Facility & proposed change",
  permit: "Permit requirements",
  equipment_emissions: "Existing equipment & emissions",
  operating_records: "Historical operating records",
  proposed_equipment: "Proposed equipment & projections",
  environmental: "Other environmental & energy data",
  costs: "Project costs",
  approvals: "Approvals & review status",
  instructions: "Instructions (not evidence)",
  other: "Other",
};

export const CONDITION_KINDS = [
  "rolling_mass_limit",
  "monthly_heat_input_limit",
  "instantaneous_heat_input_limit",
  "fuel_restriction",
  "control_required",
  "factor_validity",
  "calibration_required",
  "approval_required",
  "other",
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const ConditionSchema = z.object({
  id: str,
  kind: z.enum(CONDITION_KINDS).catch("other"),
  description: str,
  pollutant: optStr,
  limit: num,
  unit: optStr,
  window_months: num,
  units: strArr,
  allowed_fuel: optStr,
  max_age_days: num,
  required_approvals: strArr,
});
export type Condition = z.infer<typeof ConditionSchema>;

export const EquipmentSchema = z.object({
  id: str,
  status: z.enum(["existing", "proposed"]).catch("existing"),
  fuel: optStr,
  max_heat_input_mmbtu_hr: num,
  planned_firing_rate_mmbtu_hr: num,
  controls_enabled: z.enum(["yes", "no", "unknown"]).catch("unknown"),
  controls: optStr,
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const FACTOR_UNITS = ["lb/MMBtu", "g/MMBtu", "kg/MMBtu"] as const;
export const EmissionFactorSchema = z.object({
  unit_id: str,
  pollutant: str,
  value: num,
  uom: z.enum(FACTOR_UNITS).catch("lb/MMBtu"),
  basis: z.enum(["measured", "estimated", "user_entry"]).catch("estimated"),
  date: optStr,
  covers_all_modes: z.coerce.boolean().catch(false),
});
export type EmissionFactor = z.infer<typeof EmissionFactorSchema>;

export const HeatInputSchema = z.object({
  unit_id: str,
  month: str,
  mmbtu: num,
  kind: z.enum(["observed", "projected"]).catch("observed"),
  hours: num,
});
export type HeatInput = z.infer<typeof HeatInputSchema>;

export const InstrumentSchema = z.object({
  id: str,
  unit_ids: strArr,
  calibrated_on: optStr,
  due_on: optStr,
  status: z.enum(["valid", "pending", "expired", "unknown"]).catch("unknown"),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

export const APPROVAL_STATUSES = ["approved", "pending", "not_recorded", "scheduled", "completed"] as const;
export const ApprovalSchema = z.object({
  item: str,
  status: z.enum(APPROVAL_STATUSES).catch("not_recorded"),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const AssumptionSchema = z.object({
  text: str,
  kind: z.enum(["repeat_prior_year", "other"]).catch("other"),
  unit_ids: strArr,
});

export const OtherDataSchema = z.object({ label: str, value: str, unit: optStr });

export const FragmentSchema = z.object({
  doc: z.object({
    document_id: str,
    title: str,
    source: str,
    date: optStr,
    section: z.enum(SECTIONS).catch("other"),
    synthetic: z.coerce.boolean().catch(false),
    summary: str,
  }),
  facility: z
    .object({
      name: optStr,
      facility_id: optStr,
      requester: optStr,
      reviewer: optStr,
      proposed_action: optStr,
      assessment_date: optStr,
      target_operation_date: optStr,
    })
    .nullish()
    .transform((v) => v ?? undefined),
  conditions: z.array(ConditionSchema).catch([]),
  equipment: z.array(EquipmentSchema).catch([]),
  emission_factors: z.array(EmissionFactorSchema).catch([]),
  heat_input: z.array(HeatInputSchema).catch([]),
  instruments: z.array(InstrumentSchema).catch([]),
  approvals: z.array(ApprovalSchema).catch([]),
  assumptions: z.array(AssumptionSchema).catch([]),
  co2_factor_kg_per_mmbtu: num,
  other_data: z.array(OtherDataSchema).catch([]),
  missing: strArr,
  regulatory_keywords: strArr,
});
export type Fragment = z.infer<typeof FragmentSchema>;

/** Merged, user-confirmed evidence. Items carry the document they came from. */
export type Sourced<T> = T & { source: string };
export interface Evidence {
  assessment_id: string;
  documents: Fragment["doc"][];
  facility: NonNullable<Fragment["facility"]>;
  conditions: Sourced<Condition>[];
  equipment: Sourced<Equipment>[];
  emission_factors: Sourced<EmissionFactor>[];
  heat_input: Sourced<HeatInput>[];
  instruments: Sourced<Instrument>[];
  approvals: Sourced<Approval>[];
  assumptions: Sourced<z.infer<typeof AssumptionSchema>>[];
  co2_factor_kg_per_mmbtu?: number;
  other_data: Sourced<z.infer<typeof OtherDataSchema>>[];
  missing: string[];
  regulatory_keywords: string[];
}

export const emptyEvidence = (): Evidence => ({
  assessment_id: "",
  documents: [],
  facility: {},
  conditions: [],
  equipment: [],
  emission_factors: [],
  heat_input: [],
  instruments: [],
  approvals: [],
  assumptions: [],
  other_data: [],
  missing: [],
  regulatory_keywords: [],
});

const LIST_KEYS = [
  "conditions",
  "equipment",
  "emission_factors",
  "heat_input",
  "instruments",
  "approvals",
  "assumptions",
  "other_data",
] as const;

/** Merge a confirmed fragment into the evidence. Later entries for the same key replace earlier ones. */
export function mergeFragment(ev: Evidence, f: Fragment, assessmentId?: string): Evidence {
  const src = f.doc.document_id || f.doc.title;
  const next: Evidence = structuredClone(ev);
  if (assessmentId && !next.assessment_id) next.assessment_id = assessmentId;
  next.documents = [...next.documents.filter((d) => d.document_id !== f.doc.document_id), f.doc];
  if (f.facility) {
    for (const [k, v] of Object.entries(f.facility)) if (v) (next.facility as Record<string, string>)[k] = v;
  }
  for (const key of LIST_KEYS) {
    const incoming = (f[key] as object[]).map((i) => ({ ...i, source: src }));
    const keyOf = (i: any): string =>
      key === "heat_input"
        ? `${i.unit_id}|${i.month}|${i.kind}`
        : key === "emission_factors"
          ? `${i.unit_id}|${String(i.pollutant).toUpperCase()}`
          : key === "approvals" || key === "other_data"
            ? `${i.item ?? i.label}`.toLowerCase()
            : key === "assumptions"
              ? i.text
              : i.id;
    const map = new Map<string, any>();
    for (const i of next[key] as any[]) map.set(keyOf(i), i);
    for (const i of incoming) {
      const prev = map.get(keyOf(i));
      // Equipment details often arrive across several documents; fill gaps rather than overwrite.
      map.set(keyOf(i), key === "equipment" && prev ? fillGaps(prev, i) : i);
    }
    (next as any)[key] = [...map.values()];
  }
  if (f.co2_factor_kg_per_mmbtu != null) next.co2_factor_kg_per_mmbtu = f.co2_factor_kg_per_mmbtu;
  next.missing = [...new Set([...next.missing, ...f.missing])];
  next.regulatory_keywords = [...new Set([...next.regulatory_keywords, ...f.regulatory_keywords])];
  return next;
}

function fillGaps(prev: any, inc: any) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(inc)) {
    if (v === undefined || v === "" || v === "unknown") continue;
    out[k] = v;
  }
  return out;
}
