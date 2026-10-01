/** Types et libellés partagés entre les données, le scoring et l'interface. */

export const AGE_BANDS = [
  { key: "under25", label: "Moins de 25 ans", short: "< 25 ans", phrase: "moins de 25 ans" },
  { key: "a25_39", label: "25-39 ans", short: "25-39", phrase: "25-39 ans" },
  { key: "a40_54", label: "40-54 ans", short: "40-54", phrase: "40-54 ans" },
  { key: "a55_64", label: "55-64 ans", short: "55-64", phrase: "55-64 ans" },
  { key: "a65plus", label: "65 ans et plus", short: "65 +", phrase: "65 ans et plus" },
] as const;
export type AgeBand = (typeof AGE_BANDS)[number]["key"];

export const CSP_LIST = [
  { key: "agriculteurs", label: "Agriculteurs", short: "Agri.", phrase: "agriculteurs" },
  { key: "artisansCommercants", label: "Artisans, commerçants, chefs d'entreprise", short: "Artisans", phrase: "artisans-commerçants" },
  { key: "cadres", label: "Cadres et prof. intellectuelles sup.", short: "Cadres", phrase: "cadres" },
  { key: "professionsIntermediaires", label: "Professions intermédiaires", short: "Prof. inter.", phrase: "professions intermédiaires" },
  { key: "employes", label: "Employés", short: "Employés", phrase: "employés" },
  { key: "ouvriers", label: "Ouvriers", short: "Ouvriers", phrase: "ouvriers" },
  { key: "retraites", label: "Retraités", short: "Retraités", phrase: "retraités" },
  { key: "autresInactifs", label: "Autres inactifs", short: "Inactifs", phrase: "autres inactifs" },
] as const;
export type CspKey = (typeof CSP_LIST)[number]["key"];

export const CATEGORIES = [
  { key: "mode", label: "Mode" },
  { key: "beaute", label: "Beauté" },
  { key: "alimentation", label: "Alimentation" },
  { key: "maison", label: "Maison & Déco" },
  { key: "sport", label: "Sport & Loisirs" },
  { key: "hightech", label: "High-tech" },
  { key: "services", label: "Services" },
  { key: "luxe", label: "Luxe" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];

export const POSITIONINGS = [
  { key: "entree", label: "Entrée de gamme" },
  { key: "milieu", label: "Milieu de gamme" },
  { key: "premium", label: "Premium" },
] as const;
export type Positioning = (typeof POSITIONINGS)[number]["key"];

export interface Product {
  name: string;
  category: Category;
  /** Prix unitaire en euros. */
  price: number;
  targetAges: AgeBand[];
  targetCsp: CspKey[];
  positioning: Positioning;
}

/** Statistiques d'une région (cf. src/data/SOURCES.md). Toute valeur peut manquer (null). */
export interface RegionStats {
  code: string;
  name: string;
  population: number | null;
  density: number | null;
  medianAge: number | null;
  ageStructure: Record<AgeBand, number> | null;
  csp: Record<CspKey, number> | null;
  medianIncome: number | null;
  povertyRate: number | null;
  urbanShare: number | null;
}

export const labelOf = <K extends string>(
  list: readonly { key: K; label: string }[],
  key: K,
): string => list.find((x) => x.key === key)?.label ?? key;
