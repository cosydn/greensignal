import type { Evidence } from "@/lib/evidence-schema";
import { factorToLbPerMMBtu, fmt } from "@/lib/engine";

export function ProposedAction({ evidence: ev }: { evidence: Evidence }) {
  const proposed = ev.equipment.filter((e) => e.status === "proposed");
  const existing = ev.equipment.filter((e) => e.status === "existing");
  const heat = ev.heat_input.filter((h) => proposed.some((e) => e.id === h.unit_id) && h.kind === "projected").reduce((n, h) => n + (h.mmbtu ?? 0), 0);
  const pollutants = [...new Set(ev.emission_factors.map((f) => f.pollutant))];
  return <section className="space-y-6">
    <div className="border-b border-border pb-5">
      <p className="font-mono text-xs uppercase text-muted-foreground">Proposed-action review · separate from compliance</p>
      <h2 className="mt-2 font-serif text-3xl font-bold">Environmental impact & potential benefit</h2>
      <p className="mt-3 text-muted-foreground">{ev.facility.proposed_action || "No proposed action confirmed yet."}</p>
    </div>
    {!proposed.length ? <p className="text-muted-foreground">Upload and confirm the company's proposed-equipment specifications and projections.</p> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-xs text-muted-foreground">Proposed equipment</p><p className="mt-1 font-serif text-2xl">{proposed.map((e) => e.id).join(", ")}</p></div>
        <div><p className="text-xs text-muted-foreground">Projected additional heat input</p><p className="mt-1 font-serif text-2xl">{fmt(heat)} MMBtu</p></div>
        <div><p className="text-xs text-muted-foreground">Additional direct CO₂</p><p className="mt-1 font-serif text-2xl">{ev.co2_factor_kg_per_mmbtu != null ? `${fmt(heat * ev.co2_factor_kg_per_mmbtu / 1000)} t` : "Not assessed"}</p></div>
      </div>
      <h3 className="font-semibold">Emission intensity comparison</h3>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="border-b border-border text-muted-foreground"><tr><th className="py-3">Pollutant</th>{[...existing, ...proposed].map((e) => <th key={e.id}>{e.id} · {e.status}</th>)}</tr></thead>
        <tbody>{pollutants.map((p) => <tr key={p} className="border-b border-border"><td className="py-3 font-medium">{p}</td>{[...existing, ...proposed].map((e) => {
          const f = ev.emission_factors.find((x) => x.unit_id === e.id && x.pollutant === p);
          const value = f ? factorToLbPerMMBtu(f) : undefined;
          return <td key={e.id} className="font-mono text-xs">{value != null ? `${value.toFixed(4)} lb/MMBtu` : "Not supplied"}{f && <span className="block text-muted-foreground">{f.basis} · {f.source}</span>}</td>;
        })}</tr>)}</tbody>
      </table></div>
      <div className="border-l-4 border-escalate pl-4">
        <h3 className="font-semibold">Benefit not yet established</h3>
        <p className="mt-1 text-sm text-muted-foreground">An addition serving new load can increase total emissions even with efficient equipment. Lower emissions per unit of fuel alone do not prove lower impact for the same useful output.</p>
        <p className="mt-2 text-sm">Request a like-for-like alternative, useful heat demand, supported efficiency values, and a same-load cost and emissions comparison before endorsing environmental benefits.</p>
      </div>
    </>}
    <h3 className="font-semibold">Resource use, costs & outstanding scope</h3>
    <dl className="divide-y divide-border">{ev.other_data.map((o) => <div key={o.label} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><dt className="text-muted-foreground">{o.label}</dt><dd>{o.value} {o.unit}</dd></div>)}</dl>
    <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">{ev.missing.map((m) => <li key={m}>{m}</li>)}</ul>
    <p className="text-xs text-muted-foreground">Planning estimates only. No invented savings, payback, exemption or environmental approval.</p>
  </section>;
}