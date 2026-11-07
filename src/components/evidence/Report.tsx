import type { Assessment, CheckStatus } from "@/lib/engine";
import { fmt } from "@/lib/engine";
import type { EcfrRef } from "@/lib/evidence.functions";

const outcomeStyle = {
  ALLOW: "bg-allow text-primary-foreground",
  HOLD: "bg-hold text-primary-foreground",
  ESCALATE: "bg-escalate text-foreground",
  BLOCK: "bg-block text-primary-foreground",
};
const statusStyle: Record<CheckStatus, string> = {
  pass: "bg-allow text-primary-foreground",
  fail: "bg-block text-primary-foreground",
  hold: "bg-hold text-primary-foreground",
  pending: "bg-escalate text-foreground",
  not_assessed: "bg-muted text-muted-foreground",
};

export function Report({ a, refs, facility }: { a: Assessment; refs: EcfrRef[]; facility: Record<string, string | undefined> }) {
  return (
    <div className="space-y-6">
      <div className="rounded border border-border bg-card p-6">
        <span className={`inline-block rounded px-3 py-1 font-mono text-sm tracking-widest ${outcomeStyle[a.outcome]}`}>{a.outcome}</span>
        <h3 className="mt-3 font-serif text-2xl font-bold">{a.headline}</h3>
        {facility.proposed_action && <p className="mt-2 text-sm text-muted-foreground">{facility.proposed_action}</p>}
        {facility.reviewer && <p className="mt-1 text-xs">Reviewer: {facility.reviewer}</p>}
        {a.projection.start && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">Evaluated months: {a.projection.start} → {a.projection.end}</p>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="font-semibold">Condition findings</h4>
        {a.findings.map((f) => (
          <div key={f.condition_id} className="rounded border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{f.title}</p>
              <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase ${statusStyle[f.status]}`}>{f.status.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{f.rationale}</p>
            {f.source && <p className="mt-1 font-mono text-[10px] text-muted-foreground">source: {f.source}</p>}
            {f.table && f.table.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-primary">Monthly & rolling calculation</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left">Month</th>
                        {Object.keys(f.table[0].byUnit).map((u) => <th key={u} className="text-right">{u} lb</th>)}
                        <th className="text-right">Month lb</th>
                        <th className="text-right">Rolling lb</th>
                        <th className="w-32 pl-3 text-left">vs {fmt(f.limit!)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.table.map((r) => (
                        <tr key={r.month}>
                          <td>{r.month}</td>
                          {Object.keys(f.table![0].byUnit).map((u) => <td key={u} className="text-right">{fmt(r.byUnit[u] ?? 0)}</td>)}
                          <td className="text-right">{fmt(r.monthly_lb)}</td>
                          <td className="text-right font-medium">{fmt(r.rolling_lb)}</td>
                          <td className="pl-3">
                            <div className="h-2 rounded bg-muted">
                              <div className={`h-2 rounded ${r.rolling_lb > f.limit! ? "bg-block" : r.rolling_lb > f.limit! * 0.9 ? "bg-escalate" : "bg-allow"}`} style={{ width: `${Math.min(100, (r.rolling_lb / f.limit!) * 100)}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>

      {a.actions.length > 0 && (
        <div className="rounded border border-border bg-card p-4">
          <h4 className="font-semibold">Unresolved prerequisites & next steps</h4>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{a.actions.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}

      <div className="rounded border border-border bg-card p-4">
        <h4 className="font-semibold">Federal baseline (eCFR Title 40)</h4>
        <p className="text-xs text-muted-foreground">Search terms were generated from the confirmed evidence. Matches are context for the reviewer; applicability is a reviewer decision.</p>
        <ul className="mt-3 space-y-3">
          {refs.map((r) => (
            <li key={r.query} className="border-l-2 border-accent pl-3">
              <p className="font-mono text-xs text-muted-foreground">“{r.query}”</p>
              <p className="text-sm font-medium">
                {r.url ? <a className="underline" href={r.url} target="_blank" rel="noreferrer">{r.citation}</a> : r.citation}
                {r.heading && <span className="font-normal text-muted-foreground"> — {r.heading}</span>}
              </p>
              {r.snippet && <p className="text-xs italic text-muted-foreground">{r.snippet}</p>}
            </li>
          ))}
        </ul>
      </div>

      {(a.sustainability.length > 0 || a.missing.length > 0) && (
        <div className="rounded border border-border bg-card p-4">
          <h4 className="font-semibold">Sustainability context & limitations</h4>
          <p className="text-xs text-muted-foreground">Informational only — does not affect the outcome.</p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {a.sustainability.map((s) => (
              <div key={s.label} className="flex justify-between gap-3 border-b border-border py-1">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="text-right font-mono text-xs">{s.value}</dd>
              </div>
            ))}
          </dl>
          {a.missing.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs text-muted-foreground">{a.missing.map((m) => <li key={m}>Not supplied: {m}</li>)}</ul>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Screening of defined conditions only — not a legal determination of compliance.</p>
    </div>
  );
}
