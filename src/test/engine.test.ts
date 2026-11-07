import { describe, it, expect } from "vitest";
import { assess, deriveRequirements, factorToLbPerMMBtu } from "@/lib/engine";
import { emptyEvidence, type Evidence } from "@/lib/evidence-schema";

const s = "test";
const b01 = [3600, 3200, 2800, 2200, 1600, 1000, 800, 800, 1400, 2200, 2800, 3600];
const b02 = [2400, 2200, 1800, 1400, 1000, 600, 400, 400, 800, 1400, 1800, 2400];
const b03 = [0, 1800, 1600, 1200, 800, 400, 200, 200, 600, 1200, 1600, 2000];
const m = (y: number, i: number) => `${y}-${String(i + 1).padStart(2, "0")}`;

function demo(): Evidence {
  const ev = emptyEvidence();
  ev.conditions = [
    { id: "U-AIR-01", kind: "rolling_mass_limit", description: "NOx", pollutant: "NOx", limit: 3000, unit: "lb", window_months: 12, units: ["B-01", "B-02", "B-03"], required_approvals: [], source: s },
    { id: "U-AIR-02", kind: "rolling_mass_limit", description: "CO", pollutant: "CO", limit: 2500, unit: "lb", window_months: 12, units: ["B-01", "B-02", "B-03"], required_approvals: [], source: s },
    { id: "U-AIR-04a", kind: "monthly_heat_input_limit", description: "", limit: 2500, units: ["B-03"], required_approvals: [], source: s },
    { id: "U-AIR-07", kind: "approval_required", description: "", units: [], required_approvals: ["Permit applicability decision", "Project environmental approval"], source: s },
  ];
  ev.equipment = [
    { id: "B-01", status: "existing", fuel: "natural gas", controls_enabled: "yes", source: s },
    { id: "B-02", status: "existing", fuel: "natural gas", controls_enabled: "yes", source: s },
    { id: "B-03", status: "proposed", fuel: "natural gas", controls_enabled: "yes", max_heat_input_mmbtu_hr: 5, planned_firing_rate_mmbtu_hr: 4, source: s },
  ];
  ev.emission_factors = [
    { unit_id: "B-01", pollutant: "NOx", value: 0.05, uom: "lb/MMBtu", basis: "measured", covers_all_modes: true, source: s },
    { unit_id: "B-01", pollutant: "CO", value: 0.04, uom: "lb/MMBtu", basis: "measured", covers_all_modes: true, source: s },
    { unit_id: "B-02", pollutant: "NOx", value: 0.04, uom: "lb/MMBtu", basis: "measured", covers_all_modes: true, source: s },
    { unit_id: "B-02", pollutant: "CO", value: 0.03, uom: "lb/MMBtu", basis: "measured", covers_all_modes: true, source: s },
    { unit_id: "B-03", pollutant: "NOx", value: 30, uom: "g/MMBtu", basis: "estimated", covers_all_modes: true, source: s },
    { unit_id: "B-03", pollutant: "CO", value: 0.04, uom: "lb/MMBtu", basis: "estimated", covers_all_modes: true, source: s },
  ];
  ev.heat_input = [
    ...b01.map((v, i) => ({ unit_id: "B-01", month: m(2026, i), mmbtu: v, kind: "observed" as const, source: s })),
    ...b02.map((v, i) => ({ unit_id: "B-02", month: m(2026, i), mmbtu: v, kind: "observed" as const, source: s })),
    ...b03.map((v, i) => ({ unit_id: "B-03", month: m(2027, i), mmbtu: v, kind: "projected" as const, source: s })),
  ];
  ev.assumptions = [{ text: "2026 repeats in 2027", kind: "repeat_prior_year", unit_ids: ["B-01", "B-02"], source: s }];
  ev.approvals = [
    { item: "Permit applicability / modification decision", status: "pending", source: s },
    { item: "Project environmental approval", status: "not_recorded", source: s },
  ];
  return ev;
}

describe("assessment engine", () => {
  it("converts 30 g/MMBtu using exactly 453.59237 g/lb", () => {
    expect(factorToLbPerMMBtu({ value: 30, uom: "g/MMBtu" })).toBeCloseTo(30 / 453.59237, 10);
  });
  it("peak rolling 12-month NOx is ~2,731.2 lb and passes the 3,000 lb limit", () => {
    const f = assess(demo(), "2027-01-15").findings.find((x) => x.condition_id === "U-AIR-01")!;
    const peak = Math.max(...f.table!.map((r) => r.rolling_lb));
    expect(peak).toBeCloseTo(1964 + 11600 * (30 / 453.59237), 6);
    expect(f.status).toBe("pass");
  });
  it("peak rolling CO is 2,002 lb and passes 2,500", () => {
    const f = assess(demo(), "2027-01-15").findings.find((x) => x.condition_id === "U-AIR-02")!;
    expect(Math.max(...f.table!.map((r) => r.rolling_lb))).toBeCloseTo(2002, 6);
    expect(f.status).toBe("pass");
  });
  it("escalates when numeric checks pass but approvals are pending", () => {
    expect(assess(demo(), "2027-01-15").outcome).toBe("ESCALATE");
  });
  it("allows only when approvals are recorded", () => {
    const ev = demo();
    ev.approvals.forEach((a) => (a.status = "approved"));
    expect(assess(ev, "2027-01-15").outcome).toBe("ALLOW");
  });
  it("blocks when the rolling limit is exceeded", () => {
    const ev = demo();
    ev.conditions[0].limit = 2500;
    expect(assess(ev, "2027-01-15").outcome).toBe("BLOCK");
  });
  it("a total exactly equal to the limit passes (inclusive)", () => {
    const ev = demo();
    ev.conditions[1].limit = 2002;
    expect(assess(ev, "2027-01-15").findings.find((x) => x.condition_id === "U-AIR-02")!.status).toBe("pass");
  });
  it("holds instead of assuming zero when a factor is missing", () => {
    const ev = demo();
    ev.emission_factors = ev.emission_factors.filter((f) => !(f.unit_id === "B-03" && f.pollutant === "NOx"));
    expect(assess(ev, "2027-01-15").outcome).toBe("HOLD");
    expect(deriveRequirements(ev).find((r) => r.id === "factor:B-03:NOX")!.satisfied).toBe(false);
  });
  it("blocks when monthly heat input exceeds 2,500 MMBtu", () => {
    const ev = demo();
    ev.heat_input.find((h) => h.unit_id === "B-03" && h.month === "2027-12")!.mmbtu = 2600;
    expect(assess(ev, "2027-01-15").findings.find((x) => x.condition_id === "U-AIR-04a")!.status).toBe("fail");
  });
});
