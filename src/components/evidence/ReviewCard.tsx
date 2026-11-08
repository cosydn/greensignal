import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  SECTION_LABEL,
  SECTIONS,
  CONDITION_KINDS,
  FACTOR_UNITS,
  APPROVAL_STATUSES,
  type Fragment,
} from "@/lib/evidence-schema";

type ListKey = "conditions" | "equipment" | "emission_factors" | "instruments" | "approvals" | "assumptions" | "other_data";
type Col = { key: string; label: string; type?: "number" | "select" | "list"; options?: readonly string[] };

const COLUMNS: Record<ListKey, { title: string; cols: Col[] }> = {
  conditions: {
    title: "Permit conditions",
    cols: [
      { key: "id", label: "ID" },
      { key: "kind", label: "Rule type", type: "select", options: CONDITION_KINDS },
      { key: "pollutant", label: "Pollutant" },
      { key: "limit", label: "Limit", type: "number" },
      { key: "unit", label: "Unit" },
      { key: "window_months", label: "Window (mo)", type: "number" },
      { key: "units", label: "Equipment", type: "list" },
      { key: "required_approvals", label: "Approvals needed", type: "list" },
    ],
  },
  equipment: {
    title: "Equipment",
    cols: [
      { key: "id", label: "ID" },
      { key: "status", label: "Status", type: "select", options: ["existing", "proposed"] },
      { key: "fuel", label: "Fuel" },
      { key: "max_heat_input_mmbtu_hr", label: "Max MMBtu/hr", type: "number" },
      { key: "planned_firing_rate_mmbtu_hr", label: "Planned MMBtu/hr", type: "number" },
      { key: "controls_enabled", label: "Controls on", type: "select", options: ["yes", "no", "unknown"] },
    ],
  },
  emission_factors: {
    title: "Emission factors",
    cols: [
      { key: "unit_id", label: "Unit" },
      { key: "pollutant", label: "Pollutant" },
      { key: "value", label: "Value", type: "number" },
      { key: "uom", label: "Units", type: "select", options: FACTOR_UNITS },
      { key: "basis", label: "Basis", type: "select", options: ["measured", "estimated", "user_entry"] },
      { key: "date", label: "Date" },
    ],
  },
  instruments: {
    title: "Instruments & calibration",
    cols: [
      { key: "id", label: "ID" },
      { key: "unit_ids", label: "Units", type: "list" },
      { key: "calibrated_on", label: "Calibrated" },
      { key: "due_on", label: "Due" },
      { key: "status", label: "Status", type: "select", options: ["valid", "pending", "expired", "unknown"] },
    ],
  },
  approvals: {
    title: "Approvals",
    cols: [
      { key: "item", label: "Item" },
      { key: "status", label: "Status", type: "select", options: APPROVAL_STATUSES },
    ],
  },
  assumptions: {
    title: "Assumptions",
    cols: [
      { key: "text", label: "Assumption" },
      { key: "kind", label: "Kind", type: "select", options: ["repeat_prior_year", "other"] },
      { key: "unit_ids", label: "Units", type: "list" },
    ],
  },
  other_data: {
    title: "Other data",
    cols: [
      { key: "label", label: "Item" },
      { key: "value", label: "Value" },
      { key: "unit", label: "Unit" },
    ],
  },
};

const cell = "h-8 min-w-20 px-2 text-xs font-mono";

function Field({ col, value, onChange }: { col: Col; value: any; onChange: (v: any) => void }) {
  if (col.type === "select")
    return (
      <select className={`${cell} rounded border border-input bg-card`} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {(col.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    );
  if (col.type === "list")
    return (
      <Input
        className={cell}
        value={(value ?? []).join(", ")}
        onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
      />
    );
  return (
    <Input
      className={cell}
      type={col.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(col.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}
    />
  );
}

export function ReviewCard({
  fragment,
  filename,
  onConfirm,
  onDiscard,
}: {
  fragment: Fragment;
  filename: string;
  onConfirm: (f: Fragment) => void;
  onDiscard: () => void;
}) {
  const [f, setF] = useState<Fragment>(fragment);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const isInstructions = f.doc.section === "instructions";

  const toggle = (k: string) =>
    setExcluded((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const update = (key: ListKey | "heat_input", i: number, field: string, v: any) =>
    setF((p) => ({ ...p, [key]: (p[key] as any[]).map((row, j) => (j === i ? { ...row, [field]: v } : row)) }));

  const confirm = () => {
    const out: any = structuredClone(f);
    for (const key of [...Object.keys(COLUMNS), "heat_input"]) out[key] = out[key].filter((_: unknown, i: number) => !excluded.has(`${key}:${i}`));
    onConfirm(out);
  };

  const heatUnits = [...new Set(f.heat_input.map((h) => h.unit_id))];
  const counts = (Object.keys(COLUMNS) as ListKey[]).reduce((n, k) => n + f[k].length, 0) + f.heat_input.length;

  return (
    <article className="rounded border-2 border-escalate bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Needs your confirmation · {filename}</p>
          <h3 className="mt-1 font-serif text-xl font-bold">{f.doc.title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{f.doc.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Section"
            className="h-8 rounded border border-input bg-card px-2 text-xs"
            value={f.doc.section}
            onChange={(e) => setF((p) => ({ ...p, doc: { ...p.doc, section: e.target.value as any } }))}
          >
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
              </option>
            ))}
          </select>
          {f.doc.synthetic && <Badge variant="outline">Synthetic data</Badge>}
        </div>
      </header>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
        <div>ID: {f.doc.document_id}</div>
        {f.doc.date && <div>Dated: {f.doc.date}</div>}
        {f.doc.source && <div>Source: {f.doc.source}</div>}
      </dl>

      {isInstructions ? (
        <p className="mt-4 rounded bg-muted p-3 text-sm">
          This file reads as <b>instructions</b>, not company evidence. It won't be added as an input and can't override the
          assessment rules. Change the section above if this is wrong.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {f.facility && Object.values(f.facility).some(Boolean) && (
            <section>
              <h4 className="mb-2 text-sm font-semibold">Facility</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(f.facility).map(([k, v]) => (
                  <label key={k} className="text-xs">
                    <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                    <Input className={cell} value={v ?? ""} onChange={(e) => setF((p) => ({ ...p, facility: p.facility ? { ...p.facility, [k]: e.target.value } : undefined }))} />
                  </label>
                ))}
              </div>
            </section>
          )}

          {(Object.keys(COLUMNS) as ListKey[]).map((key) =>
            f[key].length ? (
              <section key={key}>
                <h4 className="mb-2 text-sm font-semibold">{COLUMNS[key].title}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="w-10 pb-1">Use</th>
                        {COLUMNS[key].cols.map((c) => (
                          <th key={c.key} className="pb-1 pr-2 font-medium">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(f[key] as any[]).map((row, i) => (
                        <tr key={i} className={excluded.has(`${key}:${i}`) ? "opacity-40" : ""}>
                          <td>
                            <input type="checkbox" aria-label="Include" checked={!excluded.has(`${key}:${i}`)} onChange={() => toggle(`${key}:${i}`)} />
                          </td>
                          {COLUMNS[key].cols.map((c) => (
                            <td key={c.key} className="py-0.5 pr-2">
                              <Field col={c} value={row[c.key]} onChange={(v) => update(key, i, c.key, v)} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {key === "conditions" &&
                  (f.conditions as any[]).map((c, i) => (
                    <p key={i} className="mt-1 text-xs text-muted-foreground">
                      <b>{c.id}:</b> {c.description}
                    </p>
                  ))}
              </section>
            ) : null,
          )}

          {f.heat_input.length > 0 && (
            <section>
              <h4 className="mb-2 text-sm font-semibold">Monthly heat input (MMBtu)</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {heatUnits.map((u) => (
                  <div key={u} className="rounded border border-border p-2">
                    <p className="mb-1 font-mono text-xs">{u}</p>
                    <div className="grid grid-cols-3 gap-1">
                      {f.heat_input.map((h, i) =>
                        h.unit_id === u ? (
                          <label key={i} className={`text-[10px] ${excluded.has(`heat_input:${i}`) ? "opacity-40" : ""}`}>
                            <span className="text-muted-foreground">
                              {h.month} {h.kind === "projected" ? "(proj.)" : ""}
                            </span>
                            <Input className="h-7 px-1 font-mono text-xs" type="number" value={h.mmbtu ?? ""} onChange={(e) => update("heat_input", i, "mmbtu", e.target.value === "" ? undefined : Number(e.target.value))} />
                          </label>
                        ) : null,
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {f.co2_factor_kg_per_mmbtu != null && (
            <p className="text-xs">
              CO₂ planning factor: <span className="font-mono">{f.co2_factor_kg_per_mmbtu} kg/MMBtu</span>
            </p>
          )}
          {f.missing.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">Stated as missing / not supplied</h4>
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {f.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {f.regulatory_keywords.length > 0 && (
            <p className="text-xs text-muted-foreground">
              eCFR search terms (auto): {f.regulatory_keywords.map((k) => <Badge key={k} variant="secondary" className="mr-1">{k}</Badge>)}
            </p>
          )}
          {counts === 0 && !f.facility && <p className="text-sm text-muted-foreground">No structured facts found.</p>}
        </div>
      )}

      <footer className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        {!isInstructions && <Button onClick={confirm}>Confirm & add to evidence</Button>}
        <Button variant="outline" onClick={onDiscard}>
          {isInstructions ? "Dismiss" : "Reject"}
        </Button>
      </footer>
    </article>
  );
}
