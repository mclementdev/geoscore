/**
 * Collecte des données régionales réelles pour GeoScore.
 *
 * Usage : node scripts/build-data.ts   (Node >= 23.6, exécution TypeScript native)
 *
 * Sources (voir src/data/SOURCES.md) :
 *  - API Melodi de l'INSEE (accès libre, sans clé) : recensement 2023 et Filosofi 2023
 *  - Grille communale de densité INSEE 2024 + Code officiel géographique 2024
 *  - Contours simplifiés des régions : gregoiredavid/france-geojson
 *
 * Aucune valeur n'est saisie à la main : tout est recalculé depuis les fichiers sources.
 * Une valeur introuvable est écrite à null et signalée en fin d'exécution.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

const MELODI = "https://api.insee.fr/melodi/data";
const GEO_PREFIX = "2026-REG-"; // millésime géographique utilisé par Melodi
const GRILLE_URL =
  "https://www.insee.fr/fr/statistiques/fichier/6439600/grille_densite_7_niveaux_2024.xlsx";
const COG_URL = "https://www.insee.fr/fr/statistiques/fichier/7766585/v_commune_2024.csv";
const GEOJSON_URL =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";

/** Les 13 régions de France métropolitaine (codes INSEE). */
const REGIONS: Record<string, string> = {
  "11": "Île-de-France",
  "24": "Centre-Val de Loire",
  "27": "Bourgogne-Franche-Comté",
  "28": "Normandie",
  "32": "Hauts-de-France",
  "44": "Grand Est",
  "52": "Pays de la Loire",
  "53": "Bretagne",
  "75": "Nouvelle-Aquitaine",
  "76": "Occitanie",
  "84": "Auvergne-Rhône-Alpes",
  "93": "Provence-Alpes-Côte d'Azur",
  "94": "Corse",
};
const CODES = Object.keys(REGIONS);

/** Codes PCS (groupes socioprofessionnels, 15 ans ou plus) → clés du JSON. */
const PCS_KEYS: Record<string, string> = {
  "1": "agriculteurs",
  "2": "artisansCommercants",
  "3": "cadres",
  "4": "professionsIntermediaires",
  "5": "employes",
  "6": "ouvriers",
  "7": "retraites",
  "9": "autresInactifs",
};

interface Observation {
  dimensions: Record<string, string>;
  measures: { OBS_VALUE_NIVEAU: { value: number | null } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const missing: string[] = [];

async function melodi(dataset: string, query: string): Promise<Observation[]> {
  const out: Observation[] = [];
  let url: string | undefined = `${MELODI}/${dataset}?${query}`;
  while (url) {
    let res: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url);
      if (res.status !== 429 && res.status < 500) break;
      await sleep(2000 * (attempt + 1));
    }
    if (!res || !res.ok) throw new Error(`${dataset} ${res?.status} ${url}`);
    const json = (await res.json()) as {
      observations: Observation[];
      paging?: { next?: string; isLast?: boolean };
    };
    out.push(...json.observations);
    url = json.paging?.isLast === false ? json.paging.next : undefined;
    await sleep(250);
  }
  return out;
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Lecteur xlsx minimal (première feuille) : renvoie les lignes sous forme de tableaux de chaînes. */
function readXlsxFirstSheet(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes);
  const shared = strFromU8(files["xl/sharedStrings.xml"]);
  const strings = [...shared.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(""),
  );
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const colIndex = (col: string) =>
    [...col].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, attrs, inner = ""] = c;
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(inner)?.[1] ?? "";
      cells[colIndex(col)] = /t="s"/.test(attrs) ? strings[Number(v)] : v;
    }
    rows.push(cells);
  }
  return rows;
}

async function main() {
  const regionGeo = CODES.map((c) => `GEO=${GEO_PREFIX}${c}`).join("&");
  const value = (o: Observation) => o.measures.OBS_VALUE_NIVEAU.value;
  const regOf = (o: Observation) => o.dimensions.GEO.replace(GEO_PREFIX, "");

  // 1. Population et superficie (RP 2023, série historique)
  console.log("→ Population et superficie (RP 2023)");
  const histo = await melodi(
    "DS_RP_SERIE_HISTORIQUE",
    `${regionGeo}&TIME_PERIOD=2023&RP_MEASURE=POP&RP_MEASURE=SUP&OCS=_T`,
  );
  const pop: Record<string, number> = {};
  const sup: Record<string, number> = {};
  for (const o of histo) {
    const v = value(o);
    if (v == null) continue;
    if (o.dimensions.RP_MEASURE === "POP") pop[regOf(o)] = v;
    if (o.dimensions.RP_MEASURE === "SUP") sup[regOf(o)] = v;
  }

  // 2. Population par âge détaillé (RP 2023, tableau POP1) → structure par âge + âge médian
  console.log("→ Pyramide des âges détaillée (RP 2023, POP1)");
  const ages: Record<string, number[]> = {};
  for (const code of CODES) {
    const obs = await melodi(
      "DS_RP_TD_POPULATION_AGESEX_PRINC",
      `GEO=${GEO_PREFIX}${code}&SEX=_T&TIME_PERIOD=2023`,
    );
    const arr = new Array<number>(101).fill(0);
    for (const o of obs) {
      const a = o.dimensions.AGE;
      const v = value(o) ?? 0;
      if (a === "Y_GE100") arr[100] += v;
      else if (/^Y\d+$/.test(a)) arr[Number(a.slice(1))] += v;
    }
    ages[code] = arr;
  }

  // 3. Population de 15 ans ou plus par PCS (RP 2023, tableau POP6)
  console.log("→ CSP des 15 ans ou plus (RP 2023, POP6)");
  const pcs = await melodi(
    "DS_RP_TD_POPULATION_PCSAGESEX_COMP",
    `${regionGeo}&SEX=_T&AGE=Y_GE15&TIME_PERIOD=2023`,
  );
  const pcsByReg: Record<string, Record<string, number>> = {};
  for (const o of pcs) {
    const r = regOf(o);
    (pcsByReg[r] ??= {})[o.dimensions.PCS] = value(o) ?? NaN;
  }

  // 4. Filosofi 2023 : niveau de vie médian et taux de pauvreté à 60 %
  console.log("→ Revenus (Filosofi 2023)");
  const filo = await melodi(
    "DS_FILOSOFI_CC",
    `${regionGeo}&FILOSOFI_MEASURE=MED_SL&FILOSOFI_MEASURE=PR_MD60&TIME_PERIOD=2023`,
  );
  const med: Record<string, number> = {};
  const pauv: Record<string, number> = {};
  for (const o of filo) {
    const v = value(o);
    if (v == null || o.dimensions.CONF_STATUS === "C") continue;
    if (o.dimensions.FILOSOFI_MEASURE === "MED_SL") med[regOf(o)] = v;
    if (o.dimensions.FILOSOFI_MEASURE === "PR_MD60") pauv[regOf(o)] = v;
  }

  // 5. Part de population urbaine : grille de densité 2024 (niveaux 1 à 4 = communes urbaines)
  console.log("→ Grille communale de densité 2024 + COG 2024");
  const cogCsv = strFromU8(await download(COG_URL));
  const [cogHeader, ...cogLines] = cogCsv.trim().split(/\r?\n/);
  // Fichier CSV entre guillemets ; les colonnes utilisées précèdent tout champ libellé.
  const unquote = (line: string) => line.split(",").map((x) => x.replace(/^"|"$/g, ""));
  const h = unquote(cogHeader);
  const iType = h.indexOf("TYPECOM");
  const iCom = h.indexOf("COM");
  const iReg = h.indexOf("REG");
  const regOfCommune = new Map<string, string>();
  for (const line of cogLines) {
    const cols = unquote(line);
    if (cols[iType] === "COM") regOfCommune.set(cols[iCom], cols[iReg]);
  }
  const grille = readXlsxFirstSheet(await download(GRILLE_URL));
  const headerRow = grille.findIndex((r) => r.includes("CODGEO") && r.includes("DENS"));
  const gh = grille[headerRow];
  const gCode = gh.indexOf("CODGEO");
  const gDens = gh.indexOf("DENS");
  const gPop = gh.findIndex((x) => /^PMUN\d+$/.test(x ?? ""));
  console.log(`  colonne population de la grille : ${gh[gPop]}`);
  const urb: Record<string, { urban: number; total: number }> = {};
  let unmatched = 0;
  for (const row of grille.slice(headerRow + 1)) {
    const com = row[gCode];
    if (!com) continue;
    const reg = regOfCommune.get(com);
    if (!reg) {
      unmatched++;
      continue;
    }
    const p = Number(row[gPop]);
    const d = Number(row[gDens]);
    const acc = (urb[reg] ??= { urban: 0, total: 0 });
    acc.total += p;
    if (d >= 1 && d <= 4) acc.urban += p;
  }
  console.log(`  communes de la grille sans correspondance COG : ${unmatched}`);

  // 6. Assemblage
  const regions = CODES.map((code) => {
    const name = REGIONS[code];
    const a = ages[code];
    const totalAge = a.reduce((s, x) => s + x, 0);
    const sumAges = (from: number, to: number) => a.slice(from, to + 1).reduce((s, x) => s + x, 0);

    // Âge médian : interpolation linéaire à l'intérieur de l'année d'âge où l'on franchit 50 %.
    let medianAge: number | null = null;
    let cum = 0;
    for (let i = 0; i <= 100 && totalAge > 0; i++) {
      if (cum + a[i] >= totalAge / 2) {
        medianAge = round(i + (totalAge / 2 - cum) / a[i], 1);
        break;
      }
      cum += a[i];
    }

    const pct = (x: number, total: number) => round((100 * x) / total);
    const ageStructure =
      totalAge > 0
        ? {
            under25: pct(sumAges(0, 24), totalAge),
            a25_39: pct(sumAges(25, 39), totalAge),
            a40_54: pct(sumAges(40, 54), totalAge),
            a55_64: pct(sumAges(55, 64), totalAge),
            a65plus: pct(sumAges(65, 100), totalAge),
          }
        : null;

    const p = pcsByReg[code];
    const pcsTotal = p?.["_T"];
    let csp: Record<string, number> | null = null;
    if (p && pcsTotal) {
      csp = {};
      for (const [k, key] of Object.entries(PCS_KEYS)) csp[key] = pct(p[k], pcsTotal);
    }

    const population = pop[code] ?? null;
    const density =
      population != null && sup[code] ? round(population / sup[code], 1) : null;
    const u = urb[code];
    const record = {
      code,
      name,
      population,
      density,
      medianAge,
      ageStructure,
      csp,
      medianIncome: med[code] ?? null,
      povertyRate: pauv[code] ?? null,
      urbanShare: u && u.total > 0 ? round((100 * u.urban) / u.total, 1) : null,
    };
    for (const [k, v] of Object.entries(record)) if (v == null) missing.push(`${name} : ${k}`);
    return { record, totalAge };
  });

  // 7. Contrôles de cohérence
  console.log("\n— Contrôles —");
  const problems: string[] = [];
  for (const { record: r, totalAge } of regions) {
    const sum = (o: Record<string, number> | null) =>
      o ? Object.values(o).reduce((s, x) => s + x, 0) : NaN;
    const sa = sum(r.ageStructure);
    const sc = sum(r.csp);
    if (Math.abs(sa - 100) > 0.5) problems.push(`${r.name} : âges = ${sa}`);
    if (Math.abs(sc - 100) > 0.5) problems.push(`${r.name} : CSP = ${sc}`);
    if (r.population && Math.abs(totalAge - r.population) / r.population > 0.001)
      problems.push(`${r.name} : POP1 (${Math.round(totalAge)}) ≠ population (${r.population})`);
    console.log(
      `${r.code} ${r.name.padEnd(28)} pop=${r.population} dens=${r.density} âgeMéd=${r.medianAge} ` +
        `revenu=${r.medianIncome} pauvreté=${r.povertyRate} urbain=${r.urbanShare} Σâges=${round(sa)} ΣCSP=${round(sc)}`,
    );
  }
  const byIncome = [...regions].sort(
    (x, y) => (y.record.medianIncome ?? 0) - (x.record.medianIncome ?? 0),
  );
  if (byIncome[0].record.code !== "11")
    problems.push(`Revenu médian le plus élevé : ${byIncome[0].record.name} (attendu Île-de-France)`);
  const totalPop = regions.reduce((s, r) => s + (r.record.population ?? 0), 0);
  console.log(`Population métropolitaine totale : ${totalPop}`);
  if (totalPop < 60e6 || totalPop > 70e6) problems.push(`Population totale implausible : ${totalPop}`);

  // 8. GeoJSON des contours
  console.log("\n→ Contours GeoJSON");
  const geo = JSON.parse(strFromU8(await download(GEOJSON_URL))) as {
    type: string;
    features: { properties: { code: string; nom: string } }[];
  };
  geo.features = geo.features.filter((f) => CODES.includes(f.properties.code));
  const geoCodes = new Set(geo.features.map((f) => f.properties.code));
  for (const c of CODES) if (!geoCodes.has(c)) problems.push(`GeoJSON : région ${c} absente`);
  console.log(`  ${geo.features.length} régions dans le GeoJSON`);

  mkdirSync("src/data", { recursive: true });
  mkdirSync("public/data", { recursive: true });
  writeFileSync(
    "src/data/regions-stats.json",
    JSON.stringify(
      regions.map((r) => r.record),
      null,
      2,
    ) + "\n",
  );
  writeFileSync("public/data/regions.geojson", JSON.stringify(geo));

  console.log(missing.length ? `\nValeurs manquantes :\n  ${missing.join("\n  ")}` : "\nAucune valeur manquante.");
  if (problems.length) {
    console.error(`\nProblèmes de cohérence :\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Contrôles de cohérence OK.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
