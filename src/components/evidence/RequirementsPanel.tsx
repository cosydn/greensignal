import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Requirement } from "@/lib/engine";
import { APPROVAL_STATUSES, FACTOR_UNITS } from "@/lib/evidence-schema";

export type ManualEntry =
  | { type: "factor"; unit_id: string; pollutant: string; value: number; uom: (typeof FACTOR_UNITS)[number] }
  | { type: "rating"; unit_id: string; field: "max_heat_input_mmbtu_hr" | "planned_firing_rate_mmbtu_hr"; value: number }
  | { type: "fuel"; unit_id: string; value: string }
  | { type: "controls"; unit_id: string; value: "yes" | "no" }
  | { type: "approval"; item: string; value: (typeof APPROVAL_STATUSES)[number] }
  | { type: "factor_date"; unit_id: string; pollutant: string; value: string };

const sel = "h-8 rounded border border-input bg-card px-2 text-xs";

function Fill({ r, onAdd }: { r: Requirement; onAdd: (e: ManualEntry) => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState<string>(FACTOR_UNITS[0]);
  const inp = r.input!;
  if (inp.type === "upload") return <p className="text-xs text-muted-foreground">{inp.hint}</p>;
  const submit = () => {
    if (!a) return;
    if (inp.type === "factor") onAdd({ ...inp, value: Number(a), uom: b as any });
    else if (inp.type === "rating") onAdd({ ...inp, value: Number(a) });
    else if (inp.type === "fuel") onAdd({ type: "fuel", unit_id: inp.unit_id, value: a });
    else if (inp.type === "controls") onAdd({ ...inp, value: a as any });
    else if (inp.type === "approval") onAdd({ ...inp, value: a as any });
    else if (inp.type === "factor_date") onAdd({ ...inp, value: a });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {inp.type === "factor" && (
        <>
          <Input className="h-8 w-24 text-xs" type="number" placeholder="value" value={a} onChange={(e) => setA(e.target.value)} />
          <select className={sel} value={b} onChange={(e) => setB(e.target.value)}>
            {FACTOR_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </>
      )}
      {inp.type === "rating" && <Input className="h-8 w-28 text-xs" type="number" placeholder="MMBtu/hr" value={a} onChange={(e) => setA(e.target.value)} />}
      {inp.type === "factor_date" && <Input className="h-8 w-40 text-xs" type="date" value={a} onChange={(e) => setA(e.target.value)} />}
      {(inp.type === "fuel" || inp.type === "controls" || inp.type === "approval") && (
        <select className={sel} value={a} onChange={(e) => setA(e.target.value)} aria-label={r.label}>
          <option value="">Select…</option>
          {(inp.type === "fuel" ? inp.options : inp.type === "controls" ? ["yes", "no"] : APPROVAL_STATUSES).map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
      )}
      <Button size="sm" variant="secondary" onClick={submit} disabled={!a}>
        Add as user entry
      </Button>
    </div>
  );
}

export function RequirementsPanel({ reqs, onAdd }: { reqs: Requirement[]; onAdd: (e: ManualEntry) => void }) {
  if (!reqs.length)
    return (
      <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
        Confirm a permit document to generate the required inputs. Requirements are derived from the permit's conditions.
      </p>
    );
  const done = reqs.filter((r) => r.satisfied).length;
  return (
    <div>
      <p className="mb-3 font-mono text-xs text-muted-foreground">
        {done} / {reqs.length} requirements satisfied
      </p>
      <ul className="space-y-2">
        {reqs.map((r) => (
          <li key={r.id} className="rounded border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm">{r.label}</span>
              <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${r.satisfied ? "bg-allow text-primary-foreground" : "bg-hold text-primary-foreground"}`}>
                {r.satisfied ? "Provided" : "Missing"}
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">from {r.condition_id}</p>
            {!r.satisfied && r.input && (
              <div className="mt-2">
                <Fill r={r} onAdd={onAdd} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
