import { describe, it, expect } from "vitest";
import { runComplianceComparator } from "@/lib/comparator";

const ctx = (val: number, extra = {}) => ({
  operational_input: { parameter_name: "NOx", measured_value: val, ...extra },
  facility_permit_limit: { max_allowable_limit: 15, permit_section: "PA-990 §3.2" },
  regulatory_baseline: { citation: "40 CFR 60.4320" },
});

describe("comparator", () => {
  it("blocks values above the limit", () => {
    expect(runComplianceComparator(ctx(18.5)).decision).toBe("BLOCK");
  });
  it("escalates at 90% of limit", () => {
    expect(runComplianceComparator(ctx(13.5)).decision).toBe("ESCALATE");
  });
  it("allows below 90% of limit", () => {
    expect(runComplianceComparator(ctx(13.4)).decision).toBe("ALLOW");
  });
  it("holds when calibration is invalid, even if over limit", () => {
    expect(runComplianceComparator(ctx(18.5, { calibration_valid: false })).decision).toBe("HOLD");
  });
  it("escalates when permit modification is required", () => {
    expect(
      runComplianceComparator(ctx(5, { requires_permit_modification: true })).decision,
    ).toBe("ESCALATE");
  });
});
