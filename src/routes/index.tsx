import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseEvidence, searchEcfr, type EcfrRef } from "@/lib/evidence.functions";
import { readEvidenceFile } from "@/lib/read-file";
import { assess, deriveRequirements, type Assessment } from "@/lib/engine";
import { emptyEvidence, mergeFragment, SECTION_LABEL, type Evidence, type Fragment, type Section } from "@/lib/evidence-schema";
import { ReviewCard } from "@/components/evidence/ReviewCard";
import { RequirementsPanel, type ManualEntry } from "@/components/evidence/RequirementsPanel";
import { ProposedAction } from "@/components/evidence/ProposedAction";
import { Report } from "@/components/evidence/Report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EPA Compliance Evaluation Engine" },
      { name: "description", content: "Upload evidence in any format, confirm what was extracted, and get an auditable ALLOW / HOLD / ESCALATE / BLOCK assessment against your permit and 40 CFR." },
      { property: "og:title", content: "EPA Compliance Evaluation Engine" },
      { property: "og:description", content: "Evidence-driven, user-confirmed compliance screening against permits and Title 40 eCFR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Item = { id: string; filename: string; status: "parsing" | "review" | "confirmed" | "rejected" | "error"; fragment?: Fragment; error?: string };
const TRACKED: Section[] = ["facility", "permit", "equipment_emissions", "operating_records", "proposed_equipment", "environmental", "costs", "approvals"];

function applyManual(ev: Evidence, e: ManualEntry): Evidence {
  const n = structuredClone(ev);
  const source = "User entry";
  const eq = (id: string) => {
    let x = n.equipment.find((q) => q.id === id);
    if (!x) {
      x = { id, status: "existing", controls_enabled: "unknown", source };
      n.equipment.push(x);
    }
    return x;
  };
  if (e.type === "factor") n.emission_factors.push({ unit_id: e.unit_id, pollutant: e.pollutant, value: e.value, uom: e.uom, basis: "user_entry", covers_all_modes: false, source });
  if (e.type === "rating") eq(e.unit_id)[e.field] = e.value;
  if (e.type === "fuel") eq(e.unit_id).fuel = e.value;
  if (e.type === "controls") eq(e.unit_id).controls_enabled = e.value;
  if (e.type === "approval") n.approvals.push({ item: e.item, status: e.value, source });
  if (e.type === "factor_date") {
    const f = n.emission_factors.find((x) => x.unit_id === e.unit_id && x.pollutant.toUpperCase() === e.pollutant.toUpperCase());
    if (f) f.date = e.value;
  }
  return n;
}

function Index() {
  const parse = useServerFn(parseEvidence);
  const ecfr = useServerFn(searchEcfr);
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [evidence, setEvidence] = useState<Evidence>(() => ({ ...emptyEvidence(), assessment_id: "ASMT-REVIEW" }));
  const [manual, setManual] = useState<ManualEntry[]>([]);
  const [assessmentDate, setAssessmentDate] = useState("");
  const [result, setResult] = useState<{ a: Assessment; refs: EcfrRef[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const finalEvidence = useMemo(() => manual.reduce(applyManual, evidence), [evidence, manual]);
  const reqs = useMemo(() => deriveRequirements(finalEvidence), [finalEvidence]);
  const effectiveDate = assessmentDate || finalEvidence.facility.assessment_date || new Date().toISOString().slice(0, 10);

  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addFiles = async (files: FileList | File[]) => {
    const list = [...files];
    const queued = list.map((f) => ({ id: crypto.randomUUID(), filename: f.name, status: "parsing" as const }));
    setItems((xs) => [...xs, ...queued]);
    setResult(null);
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const i = next++;
        try {
          const file = list[i];
          if (!file) continue;
          const queuedItem = queued[i];
          if (!queuedItem) continue;
          const payload = await readEvidenceFile(file);
          const r = await parse({ data: payload });
          if (r.ok) patch(queued[i]?.id ?? "", { status: "review", fragment: r.fragment });
          else patch(queued[i]?.id ?? "", { status: "error", error: r.error });
        } catch (e) {
          patch(queued[i]?.id ?? "", { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  };

  const confirm = (id: string, f: Fragment) => {
    setEvidence((ev) => mergeFragment(ev, f));
    patch(id, { status: "confirmed", fragment: f });
    setResult(null);
  };

  const sectionStatus = (s: Section) => {
    const its = items.filter((i) => i.fragment?.doc.section === s);
    if (its.some((i) => i.status === "confirmed")) return "Confirmed";
    if (its.some((i) => i.status === "review")) return "Needs review";
    return "Missing";
  };

  const run = async () => {
    setRunning(true);
    try {
      const kw = finalEvidence.regulatory_keywords.slice(0, 4);
      const refs = kw.length ? await ecfr({ data: { keywords: kw } }) : [];
      setResult({ a: assess(finalEvidence, effectiveDate), refs });
    } finally {
      setRunning(false);
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ ...finalEvidence, assessment_date: effectiveDate }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${finalEvidence.assessment_id}-evidence.json`;
    a.click();
  };

  const pending = items.filter((i) => i.status === "review");
  const parsing = items.filter((i) => i.status === "parsing").length;
  const confirmedCount = items.filter((i) => i.status === "confirmed").length;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 border-b border-border pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Title 40 · Protection of Environment · {finalEvidence.assessment_id}</p>
        <h1 className="mt-2 font-serif text-4xl font-bold text-primary md:text-5xl">Environmental Regulatory Review</h1>
        <p className="mt-3 text-muted-foreground">Company evidence review · Permit screening · Proposed-action evaluation</p>
        <nav aria-label="Review steps" className="mt-6 flex flex-wrap gap-2">
          {["Company evidence", "Confirm evidence", "Permit requirements", "Proposed action", "Assessment"].map((label, i) => <Button key={label} variant={step === i ? "default" : "outline"} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}>{i + 1} · {label}</Button>)}
        </nav>
      </header>

      <div className="space-y-8">
        <div className="space-y-8">
          {step === 0 && <section>
            <h2 className="mb-3 font-serif text-2xl font-bold">Company evidence</h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-10 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-border bg-card"}`}
            >
              <p className="text-sm">Drop permits, logs, spec sheets, stack tests, photos of records…</p>
              <p className="font-mono text-xs text-muted-foreground">PDF · images · DOCX · TXT · CSV · JSON</p>
              <Button onClick={() => fileRef.current?.click()}>Choose files</Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {items.length > 0 && (
              <ul className="mt-3 divide-y divide-border rounded border border-border bg-card text-sm">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate font-mono text-xs">{i.filename}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {i.fragment && <span className="text-muted-foreground">{SECTION_LABEL[i.fragment.doc.section]}</span>}
                      <span
                        className={`rounded px-2 py-0.5 font-mono uppercase ${
                          i.status === "confirmed" ? "bg-allow text-primary-foreground" : i.status === "review" ? "bg-escalate text-foreground" : i.status === "error" ? "bg-block text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i.status === "parsing" ? "parsing…" : i.status === "review" ? "needs review" : i.status}
                      </span>
                    </span>
                    {i.error && <span className="text-xs text-destructive">{i.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>}

          {step === 1 && <section>
            <h2 className="mb-3 font-serif text-2xl font-bold">Confirm company evidence</h2>
            {pending.length === 0 ? (
              <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
                {parsing ? `Parsing ${parsing} file(s)…` : "Nothing waiting for review. Nothing is added to the evidence until you confirm it."}
              </p>
            ) : (
              <div className="space-y-5">
                {pending.map((i) => (
                  <ReviewCard key={i.id} fragment={i.fragment ?? ({} as Fragment)} filename={i.filename} onConfirm={(f) => confirm(i.id, f)} onDiscard={() => patch(i.id, { status: "rejected" })} />
                ))}
              </div>
            )}
          </section>}

          {step === 4 && <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-serif text-2xl font-bold">Regulatory assessment</h2>
              <div className="flex items-end gap-2">
                <label className="text-xs">
                  <span className="text-muted-foreground">Assessment date</span>
                  <Input type="date" className="h-9" value={effectiveDate} onChange={(e) => setAssessmentDate(e.target.value)} />
                </label>
                <Button size="lg" onClick={run} disabled={running || parsing > 0 || confirmedCount === 0 || pending.length > 0}>
                  {running ? "Assessing…" : "Run assessment"}
                </Button>
              </div>
            </div>
            {pending.length > 0 && <p className="mb-2 text-xs text-muted-foreground">Confirm or reject every document before running.</p>}
            {result ? <Report a={result.a} refs={result.refs} facility={finalEvidence.facility} /> : <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">The audit report will appear here.</p>}
          </section>}
          {step === 3 && <ProposedAction evidence={finalEvidence} />}
        </div>

        <div className="space-y-6">
          {step === 0 && <section className="border-t border-border pt-4">
            <h3 className="mb-2 text-sm font-semibold">Evidence sections</h3>
            <ul className="space-y-1 text-xs">
              {TRACKED.map((s) => {
                const st = sectionStatus(s);
                return (
                  <li key={s} className="flex justify-between gap-2">
                    <span>{SECTION_LABEL[s]}</span>
                    <span className={st === "Confirmed" ? "text-allow" : st === "Needs review" ? "text-escalate" : "text-muted-foreground"}>{st}</span>
                  </li>
                );
              })}
            </ul>
          </section>}

          {step === 2 && <section>
            <h2 className="mb-3 font-serif text-2xl font-bold">Permit-derived requirements</h2>
            <RequirementsPanel
              reqs={reqs}
              onAdd={(e) => {
                setManual((m) => [...m, e]);
                setResult(null);
              }}
            />
          </section>}

          {step === 1 && <section className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Evidence JSON</h3>
              <Button size="sm" variant="outline" onClick={download} disabled={confirmedCount === 0 && manual.length === 0}>
                Download
              </Button>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {finalEvidence.documents.length} docs · {finalEvidence.conditions.length} conditions · {finalEvidence.heat_input.length} records · {manual.length} user entries
            </p>
            <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-[10px]">{JSON.stringify(finalEvidence, null, 2)}</pre>
          </section>}
        </div>
      </div>
      <footer className="mt-8 flex justify-between border-t border-border pt-5"><Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Previous</Button><Button disabled={step === 4} onClick={() => setStep(step + 1)}>Next step</Button></footer>
    </main>
  );
}
