import { describe, expect, it } from "vitest";
import type { Product, RegionStats } from "./domain";
import { buildContext, normalizeScores, REGIONS, scoreAllRegions, scoreRegion, WEIGHTS } from "./scoring";

const base: Product = {
  name: "Test",
  category: "alimentation",
  price: 10,
  targetAges: [],
  targetCsp: [],
  positioning: "milieu",
};

const ranking = (product: Product) =>
  scoreAllRegions(product).sort((a, b) => b.score - a.score);

describe("scoreRegion", () => {
  it("place l'Île-de-France en tête pour un produit premium ciblant les cadres", () => {
    const product: Product = {
      ...base,
      name: "Montre connectée premium",
      category: "luxe",
      price: 900,
      targetAges: ["a25_39", "a40_54"],
      targetCsp: ["cadres"],
      positioning: "premium",
    };
    const ranked = ranking(product);
    expect(ranked[0].code).toBe("11");
    expect(ranked[0].normalized).toBe(100);
    expect(scoreRegion(product, REGIONS.find((r) => r.code === "11")!).score).toBeGreaterThan(0.3);
  });

  it("favorise les régions les plus âgées pour un produit ciblant les 65 ans et plus", () => {
    const product: Product = { ...base, name: "Téléassistance", targetAges: ["a65plus"] };
    const ranked = ranking(product);

    const byOldShare = [...REGIONS].sort(
      (a, b) => b.ageStructure!.a65plus - a.ageStructure!.a65plus,
    );
    // La région où les 65 ans et plus pèsent le plus arrive en tête…
    expect(ranked[0].code).toBe(byOldShare[0].code);
    // … le top 3 est composé de régions plus âgées que la moyenne nationale…
    const context = buildContext(REGIONS);
    for (const r of ranked.slice(0, 3)) {
      const stats = REGIONS.find((x) => x.code === r.code)!;
      expect(stats.ageStructure!.a65plus).toBeGreaterThan(context.ageRef!.a65plus);
    }
    // … et l'Île-de-France, région la plus jeune selon les données, est dans les deux dernières.
    expect(byOldShare.at(-1)!.code).toBe("11");
    expect(ranked.slice(-2).map((r) => r.code)).toContain("11");
    // Le classement suit globalement la part des 65 ans et plus (corrélation de rang de Spearman).
    const rankOf = (codes: string[]) => (code: string) => codes.indexOf(code);
    const byScore = rankOf(ranked.map((r) => r.code));
    const byShare = rankOf(byOldShare.map((r) => r.code));
    const n = REGIONS.length;
    const d2 = REGIONS.reduce((s, r) => s + (byScore(r.code) - byShare(r.code)) ** 2, 0);
    expect(1 - (6 * d2) / (n * (n * n - 1))).toBeGreaterThan(0.6); // observé : 0,69
  });

  it("produit des contributions signées dont la somme vaut le score brut", () => {
    const product: Product = { ...base, category: "sport", targetAges: ["under25"], targetCsp: ["employes"] };
    for (const region of REGIONS) {
      const { score, factors } = scoreRegion(product, region);
      expect(factors.map((f) => f.key)).toEqual(["age", "csp", "purchasingPower", "category", "marketSize"]);
      expect(factors.reduce((s, f) => s + f.contribution, 0)).toBeCloseTo(score, 12);
      expect(factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 12);
      expect(Math.abs(score)).toBeLessThanOrEqual(1);
    }
  });

  it("redistribue le poids des composantes sans critère", () => {
    // Alimentation sans cible : seuls le pouvoir d'achat et la taille du marché sont actifs.
    const { factors } = scoreRegion(base, REGIONS[0]);
    expect(factors.map((f) => f.key)).toEqual(["purchasingPower", "marketSize"]);
    const total = WEIGHTS.purchasingPower + WEIGHTS.marketSize;
    expect(factors[0].weight).toBeCloseTo(WEIGHTS.purchasingPower / total, 12);
  });

  it("ignore proprement les valeurs manquantes", () => {
    const incomplete: RegionStats = {
      ...REGIONS[0],
      medianIncome: null,
      povertyRate: null,
      csp: null,
      urbanShare: null,
    };
    const regions = [incomplete, ...REGIONS.slice(1)];
    // Mode : règles « moins de 40 ans » (disponible) et « urbanisation » (manquante).
    const product: Product = { ...base, category: "mode", targetCsp: ["cadres"], positioning: "premium" };
    const { score, factors } = scoreRegion(product, incomplete, buildContext(regions));
    expect(Number.isFinite(score)).toBe(true);
    expect(factors.map((f) => f.key)).toEqual(["category", "marketSize"]);
    expect(factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 12);
    for (const r of scoreAllRegions(product, regions)) expect(Number.isFinite(r.normalized)).toBe(true);
  });

  it("change le classement quand le produit change", () => {
    const young = ranking({ ...base, category: "sport", targetAges: ["under25", "a25_39"] });
    const old = ranking({ ...base, targetAges: ["a65plus"], targetCsp: ["retraites"] });
    expect(young.slice(0, 5).map((r) => r.code)).not.toEqual(old.slice(0, 5).map((r) => r.code));
  });
});

describe("normalizeScores", () => {
  it("ramène les scores sur 0-100", () => {
    expect(normalizeScores([-0.2, 0, 0.6])).toEqual([0, 25, 100]);
  });
  it("renvoie 50 partout quand toutes les valeurs sont égales", () => {
    expect(normalizeScores([0.1, 0.1])).toEqual([50, 50]);
  });
});
