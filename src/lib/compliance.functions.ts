import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateChatCompletion, GatewayError } from "@lovable.dev/ai-gateway";
import { runComplianceComparator, type UnifiedContext } from "./comparator";

const OPERATION_SCHEMA = `{"parameter_name": string (e.g. NOx Emissions, Wastewater pH), "measured_value": number, "unit": string (e.g. lbs/hr, ppm)}`;
const PERMIT_SCHEMA = `{"parameter_name": string, "max_allowable_limit": number, "unit": string, "permit_section": string (reference clause or section in the permit)}`;

async function extract(text: string, schema: string) {
  const res = await generateChatCompletion({
    model: "google/gemini-2.5-flash",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract the relevant compliance parameters accurately. Reply with JSON only, exactly matching: ${schema}`,
      },
      { role: "user", content: text },
    ],
  });
  const content = res.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("AI returned no content");
  return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

async function searchEcfrBaseline(query: string) {
  const url = new URL("https://www.ecfr.gov/api/search/v1/results.json");
  url.searchParams.set("query", query);
  url.searchParams.set("hierarchy[title]", "40");
  url.searchParams.set("per_page", "1");
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) console.error("eCFR status", res.status, await res.clone().text());
    if (res.ok) {
      const json = (await res.json()) as { results?: any[] };
      const top = json.results?.[0];
      if (top) {
        const strip = (v: unknown) => String(v ?? "").replace(/<[^>]+>/g, "").trim();
        const h = top.hierarchy ?? {};
        const section = h.section
          ? `§ ${h.section}`
          : h.appendix
            ? strip(top.hierarchy_headings?.appendix ?? h.appendix)
            : `Part ${h.part ?? "?"}`;
        const heading = strip(top.headings?.section ?? top.headings?.appendix ?? top.headings?.part) || null;
        const snippet = String(top.full_text_excerpt ?? top.text ?? "")
          .replace(/<[^>]+>/g, "")
          .slice(0, 200);
        return { citation: `40 CFR ${section}`, heading, snippet };
      }
    }
  } catch (e) {
    console.error("eCFR lookup failed", e);
  }
  return { citation: "40 CFR Baseline", heading: null, snippet: "No specific section matched." };
}

export const evaluateCompliance = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        operationalText: z.string().min(1).max(10000),
        permitText: z.string().min(1).max(10000),
        ecfrQuery: z.string().min(1).max(300),
        hasRequiredEvidence: z.boolean(),
        calibrationValid: z.boolean(),
        operatingHoursProvided: z.boolean(),
        requiresPermitModification: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const [operation, permit, baseline] = await Promise.all([
        extract(data.operationalText, OPERATION_SCHEMA),
        extract(data.permitText, PERMIT_SCHEMA),
        searchEcfrBaseline(data.ecfrQuery),
      ]);
      const context: UnifiedContext = {
        operational_input: {
          ...operation,
          measured_value: Number(operation.measured_value),
          has_required_evidence: data.hasRequiredEvidence,
          calibration_valid: data.calibrationValid,
          operating_hours_provided: data.operatingHoursProvided,
          requires_permit_modification: data.requiresPermitModification,
        },
        facility_permit_limit: {
          ...permit,
          max_allowable_limit:
            permit.max_allowable_limit == null ? null : Number(permit.max_allowable_limit),
        },
        regulatory_baseline: baseline,
      };
      return { ok: true as const, context, report: runComplianceComparator(context) };
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof GatewayError
          ? e.code === "payment_required"
            ? "AI credits are exhausted."
            : "The AI service couldn't process this request. Please try again."
          : "Could not extract data from the documents.";
      return { ok: false as const, error: msg };
    }
  });
