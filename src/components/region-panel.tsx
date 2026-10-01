"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AGE_BANDS, CSP_LIST, type RegionStats } from "@/lib/domain";
import { fmtDecimal, fmtEuro, fmtInt, fmtPct, fmtScore, fmtSigned } from "@/lib/format";
import { getDefaultContext, type RegionResult } from "@/lib/scoring";

interface Props {
  region: RegionStats;
  result: RegionResult | null;
  rank: number | null;
  onClose: () => void;
}

export function RegionPanel({ region, result, rank, onClose }: Props) {
  const ctx = getDefaultContext();
  const maxContribution = Math.max(0.0001, ...(result?.factors ?? []).map((f) => Math.abs(f.contribution)));

  return (
    <aside className="absolute top-4 right-4 bottom-4 z-20 flex w-[340px] max-w-[calc(100%-2rem)] flex-col rounded-xl border bg-background/97 shadow-lg backdrop-blur">
      <header className="flex items-start justify-between gap-2 border-b p-4">
        <div>
          <h2 className="font-semibold leading-tight">{region.name}</h2>
          <p className="text-xs text-muted-foreground">Région {region.code}</p>
        </div>
        <div className="flex items-start gap-2">
          {result && (
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums leading-none">{fmtScore(result.normalized)}</div>
              <div className="text-[11px] text-muted-foreground">/ 100{rank ? ` · ${rank}ᵉ sur 13` : ""}</div>
            </div>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <X />
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-4 text-sm">
          {result && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Décomposition du score
              </h3>
              <ul className="space-y-2.5">
                {result.factors.map((f) => (
                  <li key={f.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{f.name}</span>
                      <span className="tabular-nums text-xs">{fmtSigned(f.contribution)}</span>
                    </div>
                    <ContributionBar value={f.contribution / maxContribution} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.label} · poids {fmtInt(f.weight * 100)} %
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-xs">
                Score brut : <strong className="tabular-nums">{fmtSigned(result.score)}</strong>{" "}
                <span className="text-muted-foreground">
                  (échelle de −1 à +1, 0 = moyenne métropolitaine). Le score sur 100 est normalisé entre la
                  moins bonne et la meilleure des 13 régions.
                </span>
              </p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Chiffres clés
            </h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Stat label="Population" value={fmtInt(region.population)} />
              <Stat label="Densité" value={`${fmtInt(region.density)} hab/km²`} />
              <Stat label="Âge médian" value={`${fmtDecimal(region.medianAge)} ans`} />
              <Stat label="Revenu médian / UC" value={fmtEuro(region.medianIncome)} />
              <Stat label="Taux de pauvreté" value={fmtPct(region.povertyRate)} />
              <Stat label="Population urbaine" value={fmtPct(region.urbanShare)} />
            </dl>
          </section>

          <Distribution
            title="Structure par âge"
            items={AGE_BANDS.map((a) => ({
              label: a.label,
              value: region.ageStructure?.[a.key] ?? null,
              reference: ctx.ageRef?.[a.key] ?? null,
            }))}
          />
          <Distribution
            title="CSP des 15 ans et plus"
            items={CSP_LIST.map((c) => ({
              label: c.label,
              value: region.csp?.[c.key] ?? null,
              reference: ctx.cspRef?.[c.key] ?? null,
            }))}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Le trait vertical indique la moyenne de la France métropolitaine. Sources : INSEE, RP 2023,
            Filosofi 2023, grille de densité 2024.
          </p>
        </div>
      </ScrollArea>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Barre centrée : vers la droite si la contribution est positive, vers la gauche sinon. */
function ContributionBar({ value }: { value: number }) {
  const width = `${Math.abs(value) * 50}%`;
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-muted">
      <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px bg-border" />
      <div
        className={value >= 0 ? "absolute inset-y-0 left-1/2 rounded-r-full bg-foreground" : "absolute inset-y-0 right-1/2 rounded-l-full bg-muted-foreground"}
        style={{ width }}
      />
    </div>
  );
}

function Distribution({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number | null; reference: number | null }[];
}) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.value ?? 0, i.reference ?? 0)));
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs">
            <span className="truncate" title={i.label}>
              {i.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{fmtPct(i.value)}</span>
            <div className="relative col-span-2 h-1.5 rounded-full bg-muted">
              {i.value != null && (
                <div className="absolute inset-y-0 left-0 rounded-full bg-foreground/70" style={{ width: `${(100 * i.value) / max}%` }} />
              )}
              {i.reference != null && (
                <div
                  className="absolute top-[-3px] bottom-[-3px] w-0.5 rounded bg-foreground"
                  style={{ left: `${(100 * i.reference) / max}%` }}
                  title={`France métropolitaine : ${fmtPct(i.reference)}`}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
