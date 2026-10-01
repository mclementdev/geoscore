"use client";

import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import { useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parsePrice, ProductForm, type ProductDraft } from "@/components/product-form";
import { RegionPanel } from "@/components/region-panel";
import { scoreColor } from "@/lib/colors";
import { CATEGORIES, labelOf, type Product } from "@/lib/domain";
import { fmtEuro, fmtScore } from "@/lib/format";
import { REGIONS, scoreAllRegions, type RegionResult } from "@/lib/scoring";

const RegionMap = dynamic(() => import("@/components/region-map"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
});

const INITIAL_DRAFT: ProductDraft = {
  name: "",
  category: "mode",
  price: "",
  targetAges: [],
  targetCsp: [],
  positioning: "milieu",
};

function toProduct(d: ProductDraft): Product | null {
  const price = parsePrice(d.price);
  if (price == null) return null;
  return {
    name: d.name.trim() || "Produit sans nom",
    category: d.category,
    price,
    targetAges: d.targetAges,
    targetCsp: d.targetCsp,
    positioning: d.positioning,
  };
}

export function GeoScoreApp() {
  const [draft, setDraft] = useState<ProductDraft>(INITIAL_DRAFT);
  const [computed, setComputed] = useState<{ product: Product; draft: ProductDraft; results: RegionResult[] } | null>(
    null,
  );
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ code: string; nonce: number } | null>(null);

  const ranked = useMemo(
    () => (computed ? [...computed.results].sort((a, b) => b.score - a.score) : []),
    [computed],
  );

  const compute = () => {
    const product = toProduct(draft);
    if (product) setComputed({ product, draft, results: scoreAllRegions(product) });
  };

  const selectedRegion = REGIONS.find((r) => r.code === selectedCode) ?? null;
  const selectedResult = computed?.results.find((r) => r.code === selectedCode) ?? null;
  const selectedRank = selectedResult ? ranked.findIndex((r) => r.code === selectedCode) + 1 : null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-[360px] shrink-0 flex-col border-r">
        <header className="flex items-center gap-2 border-b px-5 py-3.5">
          <MapPinned className="size-5" />
          <h1 className="text-lg font-semibold tracking-tight">GeoScore</h1>
          <span className="ml-auto text-xs text-muted-foreground">France métropolitaine</span>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-5">
            <ProductForm
              draft={draft}
              onChange={setDraft}
              onSubmit={compute}
              stale={computed != null && JSON.stringify(computed.draft) !== JSON.stringify(draft)}
            />

            <section>
              <h2 className="mb-2 text-sm font-medium">Top 5 des régions</h2>
              {computed ? (
                <>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {computed.product.name} · {labelOf(CATEGORIES, computed.product.category)} ·{" "}
                    {fmtEuro(computed.product.price)}
                  </p>
                  <ol className="space-y-1">
                    {ranked.slice(0, 5).map((r, i) => (
                      <li key={r.code}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCode(r.code);
                            setFocus({ code: r.code, nonce: Date.now() });
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[selected=true]:bg-muted"
                          data-selected={r.code === selectedCode}
                        >
                          <span className="w-4 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                          <span className="flex-1 truncate">{r.name}</span>
                          <span
                            className="size-2.5 rounded-full"
                            style={{ background: scoreColor(r.normalized) }}
                            aria-hidden
                          />
                          <span className="w-7 text-right font-medium tabular-nums">{fmtScore(r.normalized)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Le classement apparaîtra après le calcul.</p>
              )}
            </section>
          </div>
        </ScrollArea>
      </aside>

      <main className="relative min-w-0 flex-1">
        <RegionMap
          results={computed?.results ?? null}
          selectedCode={selectedCode}
          focus={focus}
          onSelect={setSelectedCode}
        />
        {selectedRegion && (
          <RegionPanel
            region={selectedRegion}
            result={selectedResult}
            rank={selectedRank}
            onClose={() => setSelectedCode(null)}
          />
        )}
      </main>
    </div>
  );
}
