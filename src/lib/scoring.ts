/**
 * Scoring produit × région.
 *
 * Fonctions pures et déterministes :
 * - `scoreRegion(product, region, context?)` renvoie le score brut d'une région et sa décomposition ;
 * - `scoreAllRegions(product, regions)` calcule les 13 régions puis normalise le score sur 0-100.
 *
 * Score brut = Σ (poids × signal) sur les composantes actives.
 * Chaque signal est compris entre -1 et +1 ; il vaut 0 quand la région est dans la moyenne
 * métropolitaine. Le score brut est donc lui aussi compris entre -1 et +1.
 */
import regionsData from "../data/regions-stats.json";
import {
  AGE_BANDS,
  CATEGORIES,
  CSP_LIST,
  labelOf,
  type AgeBand,
  type Category,
  type CspKey,
  type Positioning,
  type Product,
  type RegionStats,
} from "./domain";

// ---------------------------------------------------------------------------
// PONDÉRATIONS (somme = 1)
// Si une composante est inactive (aucun critère saisi ou données manquantes), son poids est
// redistribué au prorata sur les autres composantes actives.
// ---------------------------------------------------------------------------
export const WEIGHTS = {
  /** Part de la population régionale dans les tranches d'âge ciblées, par rapport à la moyenne nationale. */
  age: 0.3,
  /** Part des CSP ciblées dans la population de 15 ans ou plus, par rapport à la moyenne nationale. */
  csp: 0.25,
  /** Revenu médian et taux de pauvreté, modulés par le positionnement et le prix. */
  purchasingPower: 0.2,
  /** Règles d'affinité propres à chaque catégorie (voir CATEGORY_RULES). */
  category: 0.15,
  /** Taille du marché : log(population), effet volontairement léger. */
  marketSize: 0.1,
} as const;
export type ComponentKey = keyof typeof WEIGHTS;

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  age: "Adéquation de l'âge",
  csp: "Adéquation des CSP",
  purchasingPower: "Pouvoir d'achat",
  category: "Affinité de la catégorie",
  marketSize: "Taille du marché",
};

/**
 * Les z-scores (écarts à la moyenne, en écarts-types entre régions) sont compressés par tanh(z / Z_SCALE).
 *
 * Âge et CSP : on calcule ln(part régionale des cibles / part nationale). Ce rapport est rapporté
 * à sa dispersion entre régions pour les mêmes cibles, puis compressé de la même façon. Sans cet
 * étalonnage, une cible peu variable d'une région à l'autre (les 65 ans et plus, par exemple)
 * pèserait moins qu'une cible très contrastée (les cadres, par exemple).
 */
const Z_SCALE = 1.5;

/** Pouvoir d'achat : indice = 0,7 × z(revenu médian) − 0,3 × z(taux de pauvreté). */
const INCOME_WEIGHT = 0.7;
const POVERTY_WEIGHT = 0.3;

/**
 * Sensibilité au pouvoir d'achat selon le positionnement. Un produit d'entrée de gamme est
 * presque neutre ; un produit premium favorise pleinement les régions aisées.
 */
const POSITIONING_INTENSITY: Record<Positioning, number> = {
  entree: 0.2,
  milieu: 0.5,
  premium: 1,
};

/**
 * Prix de référence par catégorie (€). Un prix supérieur renforce la sensibilité au pouvoir
 * d'achat : +25 % par doublement du prix, dans la limite de ×0,5 à ×1,5.
 */
const REFERENCE_PRICE: Record<Category, number> = {
  mode: 50,
  beaute: 30,
  alimentation: 10,
  maison: 80,
  sport: 60,
  hightech: 300,
  services: 50,
  luxe: 500,
};
const PRICE_ELASTICITY = 0.25;

// ---------------------------------------------------------------------------
// INDICATEURS utilisés par les règles de catégorie et la taille du marché
// ---------------------------------------------------------------------------
const sumBands = (r: RegionStats, bands: AgeBand[]) =>
  r.ageStructure ? bands.reduce((s, b) => s + r.ageStructure![b], 0) : null;
const positiveLog = (x: number | null) => (x != null && x > 0 ? Math.log(x) : null);

interface Indicator {
  /** Nom neutre, pour le détail chiffré. */
  name: string;
  get: (r: RegionStats) => number | null;
  high: string;
  low: string;
}
const INDICATORS = {
  medianIncome: { name: "revenu médian", get: (r) => r.medianIncome, high: "Revenu médian élevé", low: "Revenu médian modeste" },
  povertyRate: { name: "taux de pauvreté", get: (r) => r.povertyRate, high: "Pauvreté élevée", low: "Pauvreté faible" },
  logDensity: { name: "densité", get: (r) => positiveLog(r.density), high: "Forte densité", low: "Faible densité" },
  urbanShare: { name: "part urbaine", get: (r) => r.urbanShare, high: "Population très urbaine", low: "Population plutôt rurale" },
  cadres: { name: "part de cadres", get: (r) => r.csp?.cadres ?? null, high: "Forte part de cadres", low: "Faible part de cadres" },
  under40: {
    name: "part des moins de 40 ans",
    get: (r) => sumBands(r, ["under25", "a25_39"]),
    high: "Population jeune",
    low: "Peu de moins de 40 ans",
  },
  a25_39: { name: "part des 25-39 ans", get: (r) => sumBands(r, ["a25_39"]), high: "Beaucoup de 25-39 ans", low: "Peu de 25-39 ans" },
  a25_54: { name: "part des 25-54 ans", get: (r) => sumBands(r, ["a25_39", "a40_54"]), high: "Beaucoup de 25-54 ans", low: "Peu de 25-54 ans" },
  a40_64: { name: "part des 40-64 ans", get: (r) => sumBands(r, ["a40_54", "a55_64"]), high: "Beaucoup de 40-64 ans", low: "Peu de 40-64 ans" },
  logPopulation: { name: "population", get: (r) => positiveLog(r.population), high: "Grand marché", low: "Petit marché" },
} satisfies Record<string, Indicator>;
type IndicatorKey = keyof typeof INDICATORS;

/**
 * AFFINITÉ DE CATÉGORIE : chaque règle associe un indicateur et un poids signé.
 * Signal = tanh(Σ poids × z(indicateur) / Z_SCALE).
 * Une catégorie sans règle (Alimentation : consommation universelle) rend la composante inactive.
 */
export const CATEGORY_RULES: Record<Category, { indicator: IndicatorKey; weight: number }[]> = {
  mode: [
    { indicator: "under40", weight: 0.6 },
    { indicator: "urbanShare", weight: 0.4 },
  ],
  beaute: [
    { indicator: "a25_54", weight: 0.5 },
    { indicator: "urbanShare", weight: 0.3 },
    { indicator: "medianIncome", weight: 0.2 },
  ],
  alimentation: [],
  maison: [
    { indicator: "a40_64", weight: 0.5 },
    { indicator: "medianIncome", weight: 0.3 },
    { indicator: "urbanShare", weight: -0.2 }, // plus de maisons individuelles hors des villes
  ],
  sport: [{ indicator: "under40", weight: 1 }],
  hightech: [
    { indicator: "a25_39", weight: 0.4 },
    { indicator: "cadres", weight: 0.3 },
    { indicator: "urbanShare", weight: 0.3 },
  ],
  services: [
    { indicator: "logDensity", weight: 0.7 },
    { indicator: "urbanShare", weight: 0.3 },
  ],
  luxe: [
    { indicator: "cadres", weight: 0.5 },
    { indicator: "medianIncome", weight: 0.5 },
  ],
};

// ---------------------------------------------------------------------------
// CONTEXTE NATIONAL : moyennes de référence calculées sur les régions métropolitaines
// ---------------------------------------------------------------------------
export interface ScoringContext {
  /** Régions de référence (servent à mesurer la dispersion des parts ciblées). */
  regions: RegionStats[];
  /** Part nationale de chaque tranche d'âge (moyenne pondérée par la population). */
  ageRef: Record<AgeBand, number> | null;
  /** Part nationale de chaque CSP (moyenne pondérée par la population). */
  cspRef: Record<CspKey, number> | null;
  /** Moyenne et écart-type de chaque indicateur sur les régions (non pondérés). */
  indicators: Record<IndicatorKey, { mean: number; sd: number } | null>;
}

function weightedShares<K extends string>(
  regions: RegionStats[],
  keys: readonly K[],
  get: (r: RegionStats) => Record<K, number> | null,
): Record<K, number> | null {
  const usable = regions.filter((r) => get(r) != null && r.population != null);
  const total = usable.reduce((s, r) => s + r.population!, 0);
  if (total === 0) return null;
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = usable.reduce((s, r) => s + get(r)![k] * r.population!, 0) / total;
  return out;
}

export function buildContext(regions: RegionStats[]): ScoringContext {
  const indicators = {} as ScoringContext["indicators"];
  for (const key of Object.keys(INDICATORS) as IndicatorKey[]) {
    const values = regions.map(INDICATORS[key].get).filter((v): v is number => v != null);
    if (values.length < 2) {
      indicators[key] = null;
      continue;
    }
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    indicators[key] = sd > 0 ? { mean, sd } : null;
  }
  return {
    regions,
    ageRef: weightedShares(regions, AGE_BANDS.map((b) => b.key), (r) => r.ageStructure),
    cspRef: weightedShares(regions, CSP_LIST.map((c) => c.key), (r) => r.csp),
    indicators,
  };
}

export const REGIONS: RegionStats[] = regionsData as RegionStats[];
let defaultContext: ScoringContext | null = null;
/** Contexte calculé une fois pour toutes sur les 13 régions du fichier de données. */
export const getDefaultContext = () => (defaultContext ??= buildContext(REGIONS));

// ---------------------------------------------------------------------------
// SCORING
// ---------------------------------------------------------------------------
export interface Factor {
  key: ComponentKey;
  /** Nom de la composante (« Adéquation de l'âge »…). */
  name: string;
  /** Explication courte, sans signe (« Forte part de cadres »…). */
  label: string;
  /** Détail chiffré pour le panneau. */
  detail: string;
  /** Poids effectif après redistribution. */
  weight: number;
  /** Signal dans [-1, 1]. */
  signal: number;
  /** Contribution signée au score brut = poids × signal. */
  contribution: number;
}

export interface RegionScore {
  /** Score brut, compris entre -1 et 1 (0 = région dans la moyenne). */
  score: number;
  /** Composantes actives, dans l'ordre de WEIGHTS. */
  factors: Factor[];
}

type PartialFactor = Omit<Factor, "weight" | "contribution" | "name">;

const pctFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const eurFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signedFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, signDisplay: "exceptZero" });

const zScore = (ctx: ScoringContext, key: IndicatorKey, r: RegionStats): number | null => {
  const v = INDICATORS[key].get(r);
  const s = ctx.indicators[key];
  return v == null || !s ? null : (v - s.mean) / s.sd;
};

/** Composantes âge / CSP : part cumulée des cibles rapportée à la part nationale. */
function targetShareFactor<K extends string>(
  key: "age" | "csp",
  targets: K[],
  region: RegionStats,
  ctx: ScoringContext,
  get: (r: RegionStats) => Record<K, number> | null,
  ref: Record<K, number> | null,
  phrases: readonly { key: K; phrase: string }[],
): PartialFactor | null {
  const shares = get(region);
  if (targets.length === 0 || !shares || !ref) return null;
  const refShare = targets.reduce((s, t) => s + ref[t], 0);
  const logRatio = (r: RegionStats) => {
    const sh = get(r);
    const share = sh ? targets.reduce((s, t) => s + sh[t], 0) : 0;
    return share > 0 && refShare > 0 ? Math.log(share / refShare) : null;
  };
  const own = logRatio(region);
  const all = ctx.regions.map(logRatio).filter((v): v is number => v != null);
  if (own == null || all.length < 2) return null;
  // Dispersion autour de la référence nationale (rapport = 1, soit ln = 0).
  const sd = Math.sqrt(all.reduce((s, v) => s + v * v, 0) / all.length);
  const share = targets.reduce((s, t) => s + shares[t], 0);
  const ratio = share / refShare;
  const signal = sd > 0 ? Math.tanh(own / sd / Z_SCALE) : 0;
  const what = targets
    .map((t) => phrases.find((p) => p.key === t)?.phrase ?? t)
    .join(", ");
  const article = key === "age" ? "des" : "de";
  const label =
    Math.abs(signal) < 0.05
      ? `Part ${article} ${what} dans la moyenne`
      : `${signal > 0 ? "Forte" : "Faible"} part ${article} ${what}`;
  return {
    key,
    label,
    detail: `${pctFmt.format(share)} % contre ${pctFmt.format(refShare)} % en France métropolitaine (×${pctFmt.format(ratio)})`,
    signal,
  };
}

function purchasingPowerFactor(product: Product, r: RegionStats, ctx: ScoringContext): PartialFactor | null {
  const zi = zScore(ctx, "medianIncome", r);
  const zp = zScore(ctx, "povertyRate", r);
  if (zi == null && zp == null) return null;
  // Si l'un des deux indicateurs manque, l'autre porte tout le poids.
  const wi = zi == null ? 0 : INCOME_WEIGHT;
  const wp = zp == null ? 0 : POVERTY_WEIGHT;
  const index = ((zi ?? 0) * wi - (zp ?? 0) * wp) / (wi + wp);

  const refPrice = REFERENCE_PRICE[product.category];
  const price = product.price > 0 ? product.price : refPrice;
  const priceFactor = Math.min(1.5, Math.max(0.5, 1 + PRICE_ELASTICITY * Math.log2(price / refPrice)));
  const intensity = Math.min(1, POSITIONING_INTENSITY[product.positioning] * priceFactor);
  const signal = intensity * Math.tanh(index / Z_SCALE);

  const parts = [
    r.medianIncome != null ? `revenu médian ${eurFmt.format(r.medianIncome)}` : null,
    r.povertyRate != null ? `pauvreté ${pctFmt.format(r.povertyRate)} %` : null,
  ].filter(Boolean);
  return {
    key: "purchasingPower",
    label: index >= 0 ? "Revenu médian élevé" : "Pouvoir d'achat modeste",
    detail: `${parts.join(", ")} ; sensibilité au prix ×${pctFmt.format(intensity)}`,
    signal,
  };
}

function categoryFactor(product: Product, r: RegionStats, ctx: ScoringContext): PartialFactor | null {
  const terms = CATEGORY_RULES[product.category]
    .map((rule) => ({ rule, z: zScore(ctx, rule.indicator, r) }))
    .filter((t): t is { rule: (typeof t)["rule"]; z: number } => t.z != null);
  if (terms.length === 0) return null;
  // Renormalise les poids si certaines règles n'ont pas de données.
  const totalAbs = terms.reduce((s, t) => s + Math.abs(t.rule.weight), 0);
  const combined = terms.reduce((s, t) => s + (t.rule.weight / totalAbs) * t.z, 0);
  const signal = Math.tanh(combined / Z_SCALE);
  // Explication : la règle qui pousse le plus dans le sens du signal.
  const main = [...terms].sort((a, b) => Math.sign(signal) * (b.rule.weight * b.z - a.rule.weight * a.z))[0];
  const ind = INDICATORS[main.rule.indicator];
  return {
    key: "category",
    label: main.z >= 0 ? ind.high : ind.low,
    detail: `${labelOf(CATEGORIES, product.category)} : ${terms
      .map((t) => `${INDICATORS[t.rule.indicator].name} ${t.rule.weight < 0 ? "(effet inverse) " : ""}z ${signedFmt.format(t.z)}`)
      .join(", ")}`,
    signal,
  };
}

function marketSizeFactor(r: RegionStats, ctx: ScoringContext): PartialFactor | null {
  const z = zScore(ctx, "logPopulation", r);
  if (z == null) return null;
  return {
    key: "marketSize",
    label: z >= 0 ? "Grand marché" : "Petit marché",
    detail: `${new Intl.NumberFormat("fr-FR").format(r.population ?? 0)} habitants (échelle logarithmique)`,
    signal: Math.tanh(z / Z_SCALE),
  };
}

export function scoreRegion(
  product: Product,
  region: RegionStats,
  context: ScoringContext = getDefaultContext(),
): RegionScore {
  const partials = [
    targetShareFactor("age", product.targetAges, region, context, (r) => r.ageStructure, context.ageRef, AGE_BANDS),
    targetShareFactor("csp", product.targetCsp, region, context, (r) => r.csp, context.cspRef, CSP_LIST),
    purchasingPowerFactor(product, region, context),
    categoryFactor(product, region, context),
    marketSizeFactor(region, context),
  ].filter((f): f is PartialFactor => f != null);

  const totalWeight = partials.reduce((s, f) => s + WEIGHTS[f.key], 0);
  const factors: Factor[] = partials.map((f) => {
    const weight = WEIGHTS[f.key] / totalWeight;
    return { ...f, name: COMPONENT_LABELS[f.key], weight, contribution: weight * f.signal };
  });
  return { score: factors.reduce((s, f) => s + f.contribution, 0), factors };
}

/** Normalisation min-max sur 0-100 ; si toutes les valeurs sont égales, chacune vaut 50. */
export function normalizeScores(raw: number[]): number[] {
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  return raw.map((x) => (max - min < 1e-12 ? 50 : (100 * (x - min)) / (max - min)));
}

export interface RegionResult extends RegionScore {
  code: string;
  name: string;
  /** Score normalisé 0-100 relativement aux régions évaluées ensemble. */
  normalized: number;
}

export function scoreAllRegions(product: Product, regions: RegionStats[] = REGIONS): RegionResult[] {
  const context = regions === REGIONS ? getDefaultContext() : buildContext(regions);
  const scored = regions.map((r) => ({ region: r, ...scoreRegion(product, r, context) }));
  const normalized = normalizeScores(scored.map((s) => s.score));
  return scored.map((s, i) => ({
    code: s.region.code,
    name: s.region.name,
    score: s.score,
    normalized: normalized[i],
    factors: s.factors,
  }));
}
