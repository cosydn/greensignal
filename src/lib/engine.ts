// Deterministic assessment engine. AI never makes decisions here: it only
// supplies confirmed evidence. Every result is reproducible from the evidence JSON.
import type { Condition, EmissionFactor, Evidence, HeatInput } from "./evidence-schema";

export const GRAMS_PER_LB = 453.59237;
export const KG_PER_LB = 0.45359237;

export type Outcome = "ALLOW" | "HOLD" | "ESCALATE" | "BLOCK";
export type CheckStatus = "pass" | "fail" | "hold" | "pending" | "not_assessed";

// ---------------------------------------------------------------- requirements

export type RequirementInput =
  | { type: "factor"; unit_id: string; pollutant: string }
  | { type: "rating"; unit_id: string; field: "max_heat_input_mmbtu_hr" | "planned_firing_rate_mmbtu_hr" }
  | { type: "fuel"; unit_id: string; options: string[] }
  | { type: "controls"; unit_id: string }
  | { type: "approval"; item: string }
  | { type: "factor_date"; unit_id: string; pollutant: string }
  | { type: "upload"; hint: string };

export interface Requirement {
  id: string;
  condition_id: string;
  label: string;
  satisfied: boolean;
  input?: RequirementInput;
}

const P = (s?: string) => (s ?? "").toUpperCase().replace(/\s+/g, "");
const unitsFor = (ev: Evidence, c: Pick<Condition, "units">) =>
  c.units.length ? c.units : ev.equipment.map((e) => e.id);

export function findFactor(ev: Evidence, unit: string, pollutant?: string) {
  return ev.emission_factors.find((f) => f.unit_id === unit && P(f.pollutant) === P(pollutant));
}

/** What the confirmed permit conditions require, and whether the evidence provides it. */
export function deriveRequirements(ev: Evidence): Requirement[] {
  const reqs: Requirement[] = [];
  const add = (r: Requirement) => {
    if (!reqs.some((x) => x.id === r.id)) reqs.push(r);
  };
  for (const c of ev.conditions) {
    switch (c.kind) {
      case "rolling_mass_limit":
        for (const u of unitsFor(ev, c)) {
          const f = findFactor(ev, u, c.pollutant);
          add({
            id: `factor:${u}:${P(c.pollutant)}`,
            condition_id: c.id,
            label: `${c.pollutant} emission factor for ${u}`,
            satisfied: f?.value != null,
            input: { type: "factor", unit_id: u, pollutant: c.pollutant ?? "" },
          });
          const series = ev.heat_input.filter((h) => h.unit_id === u && h.mmbtu != null);
          const repeat = hasRepeatAssumption(ev, u);
          add({
            id: `heat:${u}`,
            condition_id: c.id,
            label: `Monthly heat-input records for ${u}${repeat ? " (prior-year profile repeated)" : ""}`,
            satisfied: series.length >= Math.min(12, c.window_months ?? 12) || (repeat && series.length > 0),
            input: { type: "upload", hint: `Upload monthly heat-input (MMBtu) records for ${u}` },
          });
        }
        break;
      case "monthly_heat_input_limit":
        for (const u of unitsFor(ev, c))
          add({
            id: `heat:${u}`,
            condition_id: c.id,
            label: `Monthly heat-input records for ${u}`,
            satisfied: ev.heat_input.some((h) => h.unit_id === u && h.mmbtu != null),
            input: { type: "upload", hint: `Upload monthly heat-input records for ${u}` },
          });
        break;
      case "instantaneous_heat_input_limit":
        for (const u of unitsFor(ev, c)) {
          const e = ev.equipment.find((x) => x.id === u);
          add({
            id: `rate:${u}`,
            condition_id: c.id,
            label: `Planned peak firing rate (MMBtu/hr) for ${u}`,
            satisfied: e?.planned_firing_rate_mmbtu_hr != null || e?.max_heat_input_mmbtu_hr != null,
            input: { type: "rating", unit_id: u, field: "planned_firing_rate_mmbtu_hr" },
          });
        }
        break;
      case "fuel_restriction":
        for (const u of unitsFor(ev, c)) {
          const e = ev.equipment.find((x) => x.id === u);
          add({
            id: `fuel:${u}`,
            condition_id: c.id,
            label: `Fuel burned by ${u}`,
            satisfied: !!e?.fuel,
            input: {
              type: "fuel",
              unit_id: u,
              options: [...new Set([c.allowed_fuel ?? "natural gas", "fuel oil", "biomass", "waste fuel", "other"])],
            },
          });
        }
        break;
      case "control_required":
        for (const u of unitsFor(ev, c)) {
          const e = ev.equipment.find((x) => x.id === u);
          add({
            id: `controls:${u}`,
            condition_id: c.id,
            label: `Required controls enabled on ${u}`,
            satisfied: !!e && e.controls_enabled !== "unknown",
            input: { type: "controls", unit_id: u },
          });
        }
        break;
      case "factor_validity":
        for (const f of ev.emission_factors)
          add({
            id: `factordate:${f.unit_id}:${P(f.pollutant)}`,
            condition_id: c.id,
            label: `Date of ${f.pollutant} factor for ${f.unit_id}`,
            satisfied: !!f.date,
            input: { type: "factor_date", unit_id: f.unit_id, pollutant: f.pollutant },
          });
        break;
      case "calibration_required":
        add({
          id: `cal:${c.id}`,
          condition_id: c.id,
          label: "Calibration records for measuring instruments",
          satisfied: ev.instruments.length > 0,
          input: { type: "upload", hint: "Upload instrument calibration records" },
        });
        break;
      case "approval_required": {
        const items = c.required_approvals.length ? c.required_approvals : ["Project approval"];
        for (const item of items) {
          const a = matchApproval(ev, item);
          add({
            id: `approval:${item.toLowerCase()}`,
            condition_id: c.id,
            label: `Status: ${item}`,
            satisfied: !!a,
            input: { type: "approval", item },
          });
        }
        break;
      }
    }
  }
  return reqs;
}

function hasRepeatAssumption(ev: Evidence, unit: string) {
  return ev.assumptions.some(
    (a) => a.kind === "repeat_prior_year" && (a.unit_ids.length === 0 || a.unit_ids.includes(unit)),
  );
}

function matchApproval(ev: Evidence, item: string) {
  const words = item.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return (
    ev.approvals.find((a) => a.item.toLowerCase() === item.toLowerCase()) ??
    ev.approvals.find((a) => {
      const t = a.item.toLowerCase();
      return words.filter((w) => t.includes(w)).length >= Math.max(1, Math.ceil(words.length / 2));
    })
  );
}

// ---------------------------------------------------------------- assessment

export function factorToLbPerMMBtu(f: { value?: number | undefined; uom: EmissionFactor["uom"] }): number | undefined {
  if (f.value == null) return undefined;
  if (f.uom === "g/MMBtu") return f.value / GRAMS_PER_LB;
  if (f.uom === "kg/MMBtu") return f.value / KG_PER_LB;
  return f.value;
}

const addMonths = (m: string, n: number) => {
  const [y = 2000, mo = 1] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDayOf = (m: string) => {
  const [y = 2000, mo = 1] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
};

/** Heat input for a unit in a month, applying the confirmed prior-year assumption when needed. */
export function heatFor(ev: Evidence, unit: string, month: string, projectionStart?: string) {
  const rows = ev.heat_input.filter((h) => h.unit_id === unit && h.month === month && h.mmbtu != null);
  const pick = rows.find((r) => r.kind === "projected") ?? rows[0];
  if (pick) return { value: pick.mmbtu as number, basis: pick.kind as string };
  if (projectionStart && month >= projectionStart && hasRepeatAssumption(ev, unit)) {
    const prior = ev.heat_input.find((h) => h.unit_id === unit && h.month === addMonths(month, -12) && h.mmbtu != null);
    if (prior) return { value: prior.mmbtu as number, basis: "assumed (prior year)" };
  }
  const eq = ev.equipment.find((e) => e.id === unit);
  if (eq?.status === "proposed" && projectionStart && month < projectionStart) return { value: 0, basis: "not installed" };
  return undefined;
}

export interface RollingRow {
  month: string;
  monthly_lb: number;
  rolling_lb: number;
  byUnit: Record<string, number>;
}

export interface Finding {
  condition_id: string;
  title: string;
  status: CheckStatus;
  rationale: string;
  source?: string;
  table?: RollingRow[];
  limit?: number;
  unit?: string;
}

export interface Assessment {
  outcome: Outcome;
  headline: string;
  findings: Finding[];
  actions: string[];
  projection: { start?: string | undefined; end?: string | undefined };
  sustainability: { label: string; value: string }[];
  missing: string[];
}

function projectionRange(ev: Evidence) {
  const proj = ev.heat_input.filter((h) => h.kind === "projected").map((h) => h.month).sort();
  if (proj.length) return { start: proj[0], end: proj[proj.length - 1] };
  const obs = ev.heat_input.map((h) => h.month).sort();
  if (!obs.length) return {};
  return { start: obs[0], end: obs[obs.length - 1] };
}

export function assess(ev: Evidence, assessmentDate: string): Assessment {
  const findings: Finding[] = [];
  const actions: string[] = [];
  const range = projectionRange(ev);
  const reqs = deriveRequirements(ev);

  for (const c of ev.conditions) {
    const base = { condition_id: c.id, source: (c as any).source, title: `${c.id} — ${c.description.slice(0, 90)}` };
    const unmet = reqs.filter((r) => r.condition_id === c.id && !r.satisfied);

    switch (c.kind) {
      case "rolling_mass_limit": {
        const units = unitsFor(ev, c);
        const window = c.window_months ?? 12;
        if (c.limit == null || !range.start || !range.end) {
          findings.push({ ...base, status: "hold", rationale: "Limit or operating records are missing; cannot calculate." });
          break;
        }
        const factors: Record<string, number | undefined> = {};
        for (const u of units) {
          const f = findFactor(ev, u, c.pollutant);
          factors[u] = f ? factorToLbPerMMBtu(f) : undefined;
        }
        const noFactor = units.filter((u) => factors[u] == null);
        const rows: RollingRow[] = [];
        const gaps: string[] = [];
        const monthly = (m: string) => {
          const byUnit: Record<string, number> = {};
          let total = 0;
          for (const u of units) {
            const h = heatFor(ev, u, m, ev.heat_input.some((x) => x.kind === "projected") ? range.start : undefined);
            if (!h) {
              gaps.push(`${u} ${m}`);
              continue;
            }
            const lb = h.value * (factors[u] ?? 0);
            byUnit[u] = lb;
            total += lb;
          }
          return { total, byUnit };
        };
        for (let m = range.start; m <= range.end; m = addMonths(m, 1)) {
          let rolling = 0;
          for (let i = 0; i < window; i++) rolling += monthly(addMonths(m, -i)).total;
          const cur = monthly(m);
          rows.push({ month: m, monthly_lb: cur.total, rolling_lb: rolling, byUnit: cur.byUnit });
        }
        if (noFactor.length || gaps.length) {
          const uniq = [...new Set(gaps)];
          findings.push({
            ...base,
            status: "hold",
            table: rows,
            limit: c.limit,
            unit: "lb",
            rationale: [
              noFactor.length ? `No supported ${c.pollutant} factor for ${noFactor.join(", ")}.` : "",
              uniq.length ? `Missing heat-input for ${uniq.slice(0, 6).join(", ")}${uniq.length > 6 ? ` and ${uniq.length - 6} more` : ""}. Missing data is not treated as zero.` : "",
            ].join(" "),
          });
          break;
        }
        const firstRow = rows[0];
        if (!firstRow) break;
        const peak = rows.reduce((a, b) => (b.rolling_lb > a.rolling_lb ? b : a), firstRow);
        const pass = peak.rolling_lb <= c.limit; // limits are inclusive
        findings.push({
          ...base,
          status: pass ? "pass" : "fail",
          table: rows,
          limit: c.limit,
          unit: "lb",
          rationale: `Peak rolling ${window}-month ${c.pollutant} is ${fmt(peak.rolling_lb)} lb (${peak.month}) vs limit ${fmt(c.limit)} lb — margin ${fmt(c.limit - peak.rolling_lb)} lb (${((1 - peak.rolling_lb / c.limit) * 100).toFixed(1)}%).`,
        });
        break;
      }
      case "monthly_heat_input_limit": {
        if (c.limit == null) {
          findings.push({ ...base, status: "hold", rationale: "Monthly limit value missing." });
          break;
        }
        const over: string[] = [];
        let any = false;
        for (const u of unitsFor(ev, c))
          for (const h of ev.heat_input.filter((x) => x.unit_id === u && x.mmbtu != null)) {
            any = true;
            if ((h.mmbtu as number) > c.limit) over.push(`${u} ${h.month}: ${fmt(h.mmbtu ?? 0)}`);
          }
        if (!any) findings.push({ ...base, status: "hold", rationale: "No heat-input records for the covered units." });
        else
          findings.push({
            ...base,
            status: over.length ? "fail" : "pass",
            rationale: over.length
              ? `Exceeds ${fmt(c.limit)} MMBtu/month: ${over.join("; ")}.`
              : `All months at or below ${fmt(c.limit)} MMBtu.`,
          });
        break;
      }
      case "instantaneous_heat_input_limit": {
        if (c.limit == null) {
          findings.push({ ...base, status: "hold", rationale: "Instantaneous limit value missing." });
          break;
        }
        const res = unitsFor(ev, c).map((u) => {
          const e = ev.equipment.find((x) => x.id === u);
          const rate = e?.planned_firing_rate_mmbtu_hr ?? e?.max_heat_input_mmbtu_hr;
          return { u, rate };
        });
        if (res.some((r) => r.rate == null)) {
          findings.push({ ...base, status: "hold", rationale: `Firing rate missing for ${res.filter((r) => r.rate == null).map((r) => r.u).join(", ")}.` });
          break;
        }
        const over = res.filter((r) => (r.rate as number) > (c.limit ?? 0));
        findings.push({
          ...base,
          status: over.length ? "fail" : "pass",
          rationale: over.length
            ? `Planned rate exceeds ${c.limit} MMBtu/hr for ${over.map((o) => o.u).join(", ")}.`
            : `Planned peak ${res.map((r) => `${r.u} ${r.rate}`).join(", ")} MMBtu/hr ≤ ${c.limit}. Planning rate does not prove future performance; verify after commissioning.`,
        });
        break;
      }
      case "fuel_restriction": {
        const allowed = (c.allowed_fuel ?? "natural gas").toLowerCase();
        const res = unitsFor(ev, c).map((u) => ({ u, fuel: ev.equipment.find((e) => e.id === u)?.fuel }));
        if (res.some((r) => !r.fuel)) {
          findings.push({ ...base, status: "hold", rationale: `Fuel not documented for ${res.filter((r) => !r.fuel).map((r) => r.u).join(", ")}.` });
          break;
        }
        const keyword = allowed.replace(/pipeline\s*/, "");
        const bad = res.filter((r) => !(r.fuel ?? "").toLowerCase().includes(keyword));
        findings.push({
          ...base,
          status: bad.length ? "fail" : "pass",
          rationale: bad.length ? `Non-permitted fuel: ${bad.map((b) => `${b.u} (${b.fuel})`).join(", ")}.` : `All units burn ${allowed}.`,
        });
        break;
      }
      case "control_required": {
        const res = unitsFor(ev, c).map((u) => ({ u, s: ev.equipment.find((e) => e.id === u)?.controls_enabled ?? "unknown" }));
        const off = res.filter((r) => r.s === "no");
        const unk = res.filter((r) => r.s === "unknown");
        findings.push({
          ...base,
          status: off.length ? "fail" : unk.length ? "hold" : "pass",
          rationale: off.length
            ? `Required controls not enabled on ${off.map((o) => o.u).join(", ")}.`
            : unk.length
              ? `Control status unknown for ${unk.map((o) => o.u).join(", ")}.`
              : "Required controls specified as enabled.",
        });
        break;
      }
      case "factor_validity": {
        const maxAge = c.max_age_days ?? 365;
        const issues: string[] = [];
        const holds: string[] = [];
        for (const f of ev.emission_factors) {
          if (!f.date) {
            holds.push(`${f.unit_id} ${f.pollutant}`);
            continue;
          }
          const age = (Date.parse(assessmentDate) - Date.parse(f.date)) / 86400000;
          if (age > maxAge || age < -1) issues.push(`${f.unit_id} ${f.pollutant} factor dated ${f.date} (${Math.round(age)} days)`);
        }
        if (!ev.emission_factors.length) holds.push("all factors");
        findings.push({
          ...base,
          status: issues.length ? "hold" : holds.length ? "hold" : "pass",
          rationale: issues.length
            ? `Factor outside ${maxAge}-day window: ${issues.join("; ")}.`
            : holds.length
              ? `Factor date missing for ${holds.join(", ")}.`
              : `All factors dated within ${maxAge} days of ${assessmentDate}.`,
        });
        break;
      }
      case "calibration_required": {
        if (!ev.instruments.length) {
          findings.push({ ...base, status: "hold", rationale: "No calibration records supplied." });
          break;
        }
        const invalid: string[] = [];
        const pending: string[] = [];
        for (const ins of ev.instruments) {
          if (ins.status === "pending" || !ins.calibrated_on) {
            pending.push(`${ins.id} calibration/commissioning pending (required before operation)`);
            continue;
          }
          const observed = ev.heat_input
            .filter((h) => h.kind === "observed" && (ins.unit_ids.length === 0 || ins.unit_ids.includes(h.unit_id)))
            .map((h) => h.month)
            .sort();
          if (observed.length) {
            const first = `${observed[0]}-01`;
            const last = lastDayOf(observed[observed.length - 1] ?? "2000-01");
            if (ins.calibrated_on > first || (ins.due_on && ins.due_on < last))
              invalid.push(`${ins.id} not valid for all measured months (${ins.calibrated_on} → ${ins.due_on ?? "?"})`);
          }
          if (ins.due_on && range.end && ins.due_on < lastDayOf(range.end))
            actions.push(`Renew calibration of ${ins.id} before ${ins.due_on} (future renewal; does not invalidate past measurements).`);
        }
        findings.push({
          ...base,
          status: invalid.length ? "hold" : pending.length ? "pending" : "pass",
          rationale: invalid.length
            ? invalid.join("; ") + "."
            : pending.length
              ? `Measured evidence was collected under valid calibration. ${pending.join("; ")}.`
              : "All instruments calibrated on measurement dates.",
        });
        pending.forEach((p) => actions.push(p.charAt(0).toUpperCase() + p.slice(1) + "."));
        break;
      }
      case "approval_required": {
        const items = c.required_approvals.length ? c.required_approvals : ["Project approval"];
        const res = items.map((i) => ({ i, a: matchApproval(ev, i) }));
        const missing = res.filter((r) => !r.a);
        const notDone = res.filter((r) => r.a && !["approved", "completed"].includes(r.a.status));
        findings.push({
          ...base,
          status: missing.length ? "hold" : notDone.length ? "pending" : "pass",
          rationale: missing.length
            ? `No status recorded for: ${missing.map((m) => m.i).join(", ")}.`
            : notDone.length
              ? `Requires authorized decision: ${notDone.map((n) => `${n.i} (${n.a?.status.replace("_", " ")})`).join(", ")}. Passing numeric limits does not waive this.`
              : "All required approvals recorded.",
        });
        notDone.forEach((n) => actions.push(`Obtain recorded decision: ${n.i}${ev.facility.reviewer ? ` — ${ev.facility.reviewer}` : ""}.`));
        break;
      }
      default:
        findings.push({ ...base, status: "not_assessed", rationale: "No deterministic rule implemented for this condition; reviewer judgement required." });
    }
    if (unmet.length && findings[findings.length - 1]?.status === "pass") {
      // Safety net: never pass a condition whose required inputs are unmet.
      const last = findings[findings.length - 1];
      if (last) last.status = "hold";
    }
  }

  // Other pending review items not tied to a condition.
  for (const a of ev.approvals)
    if (["pending", "not_recorded", "scheduled"].includes(a.status) && !actions.some((x) => x.includes(a.item)))
      actions.push(`${a.item}: ${a.status.replace("_", " ")}.`);

  const has = (s: CheckStatus) => findings.some((f) => f.status === s);
  const outcome: Outcome = !ev.conditions.length
    ? "HOLD"
    : has("fail")
      ? "BLOCK"
      : has("hold")
        ? "HOLD"
        : has("pending") || has("not_assessed")
          ? "ESCALATE"
          : "ALLOW";
  const headline = {
    BLOCK: "A supported calculation violates a defined permit condition.",
    HOLD: !ev.conditions.length
      ? "No permit conditions confirmed — upload and confirm a permit."
      : "An assessable check is missing required or valid evidence.",
    ESCALATE: "Numeric checks pass, but an authorized decision or pre-operation prerequisite is outstanding.",
    ALLOW: "All implemented checks pass with valid evidence and recorded approvals.",
  }[outcome];

  // Sustainability (informational only; never affects outcome).
  const sustainability: { label: string; value: string }[] = [];
  const proposed = ev.equipment.filter((e) => e.status === "proposed").map((e) => e.id);
  const propHeat = ev.heat_input
    .filter((h) => proposed.includes(h.unit_id) && h.kind === "projected")
    .reduce((s, h) => s + (h.mmbtu ?? 0), 0);
  if (propHeat) sustainability.push({ label: "Projected heat input, proposed units", value: `${fmt(propHeat)} MMBtu` });
  if (ev.co2_factor_kg_per_mmbtu != null && propHeat)
    sustainability.push({
      label: "Direct combustion CO₂, proposed units",
      value: `${fmt((propHeat * ev.co2_factor_kg_per_mmbtu) / 1000)} t (factor ${ev.co2_factor_kg_per_mmbtu} kg/MMBtu)`,
    });
  for (const o of ev.other_data) sustainability.push({ label: o.label, value: `${o.value}${o.unit ? ` ${o.unit}` : ""}` });

  return { outcome, headline, findings, actions: [...new Set(actions)], projection: range, sustainability, missing: ev.missing };
}

export const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export type { HeatInput };
