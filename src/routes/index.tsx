import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { evaluateCompliance } from "@/lib/compliance.functions";
import type { AuditReport, UnifiedContext } from "@/lib/comparator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EPA Compliance Evaluation Engine" },
      {
        name: "description",
        content:
          "Evaluate proposed machinery changes against site permits and 40 CFR baselines with an auditable ALLOW / HOLD / ESCALATE / BLOCK decision.",
      },
      { property: "og:title", content: "EPA Compliance Evaluation Engine" },
      {
        property: "og:description",
        content: "Explainable, auditable compliance decisions against permits and Title 40 eCFR.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const decisionStyle: Record<AuditReport["decision"], string> = {
  ALLOW: "bg-allow text-primary-foreground",
  HOLD: "bg-hold text-primary-foreground",
  ESCALATE: "bg-escalate text-foreground",
  BLOCK: "bg-block text-primary-foreground",
};

function Index() {
  const run = useServerFn(evaluateCompliance);
  const [operationalText, setOp] = useState(
    "Monthly Environmental Log: Boiler #2 recorded NOx emissions running at 18.5 lbs per hour for November.",
  );
  const [permitText, setPermit] = useState(
    "Operating Permit PA-990 Section 3.2: Stationary gas combustion units shall not exceed a maximum NOx emission limit of 15.0 lbs per hour.",
  );
  const [ecfrQuery, setQuery] = useState("stationary gas turbine NOx emission limits");
  const [flags, setFlags] = useState({
    hasRequiredEvidence: true,
    calibrationValid: true,
    operatingHoursProvided: true,
    requiresPermitModification: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ context: UnifiedContext; report: AuditReport } | null>(
    null,
  );

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await run({ data: { operationalText, permitText, ecfrQuery, ...flags } });
      if (r.ok) setResult({ context: r.context, report: r.report });
      else setError(r.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const flagLabels: [keyof typeof flags, string][] = [
    ["hasRequiredEvidence", "Required evidence attached"],
    ["calibrationValid", "Equipment calibration valid"],
    ["operatingHoursProvided", "Operating hours provided"],
    ["requiresPermitModification", "Requires permit modification"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Title 40 · Protection of Environment
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold text-primary md:text-5xl">
          Compliance Evaluation Engine
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          AI extracts the facts. A deterministic rule engine makes the call — every decision is
          traceable to a permit clause and federal baseline.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-2">
        <section className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="op">1 · Operational log / proposed change</Label>
            <Textarea id="op" rows={4} value={operationalText} onChange={(e) => setOp(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="permit">2 · Facility permit text</Label>
            <Textarea id="permit" rows={4} value={permitText} onChange={(e) => setPermit(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="q">3 · eCFR search keywords</Label>
            <Input id="q" value={ecfrQuery} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <fieldset className="grid grid-cols-1 gap-3 rounded border border-border bg-card p-4 sm:grid-cols-2">
            <legend className="px-1 font-mono text-xs uppercase text-muted-foreground">Evidence checks</legend>
            {flagLabels.map(([k, label]) => (
              <div key={k} className="flex items-center gap-2">
                <Checkbox
                  id={k}
                  checked={flags[k]}
                  onCheckedChange={(v) => setFlags((f) => ({ ...f, [k]: v === true }))}
                />
                <Label htmlFor={k} className="font-normal">{label}</Label>
              </div>
            ))}
          </fieldset>
          <Button size="lg" onClick={submit} disabled={loading} className="w-full">
            {loading ? "Evaluating…" : "Run compliance evaluation"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </section>

        <section>
          {!result ? (
            <div className="flex h-full min-h-64 items-center justify-center rounded border border-dashed border-border p-8 text-center text-muted-foreground">
              The audit report will appear here.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded border border-border bg-card p-6">
                <span
                  className={`inline-block rounded px-3 py-1 font-mono text-sm font-medium tracking-widest ${decisionStyle[result.report.decision]}`}
                >
                  {result.report.decision}
                </span>
                <h2 className="mt-4 font-serif text-2xl font-bold">{result.report.parameter}</h2>
                <p className="mt-2">{result.report.rationale}</p>
                <ul className="mt-4 space-y-1 font-mono text-xs text-muted-foreground">
                  {result.report.citations.map((c) => (
                    <li key={c}>§ {c}</li>
                  ))}
                </ul>
                {result.context.regulatory_baseline.snippet && (
                  <p className="mt-4 border-l-2 border-accent pl-3 text-sm italic text-muted-foreground">
                    {result.context.regulatory_baseline.snippet}
                  </p>
                )}
              </div>
              <details className="rounded border border-border bg-card p-4">
                <summary className="cursor-pointer font-mono text-xs uppercase text-muted-foreground">
                  Unified context (audit trail)
                </summary>
                <pre className="mt-3 overflow-x-auto font-mono text-xs">
                  {JSON.stringify(result.context, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
