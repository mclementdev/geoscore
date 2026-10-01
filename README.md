# GeoScore (MVP)

Décrivez un produit à gauche. La carte de droite colore chaque région de France
métropolitaine selon un score de correspondance (0-100) entre ce produit et la population
de la région.

Tout tourne côté client à partir de données statiques réelles (INSEE). Il n'y a ni API, ni
clé, ni variable d'environnement.

## Lancer le projet

```bash
npm install
npm run dev        # http://localhost:3000
```

| Commande | Rôle |
|---|---|
| `npm run build` | build de production |
| `npm run lint` | ESLint |
| `npm test` | tests unitaires du scoring (Vitest) |
| `npm run data` | recollecte les données INSEE et le GeoJSON (nécessite Node ≥ 23.6) |

## Organisation

| Fichier | Contenu |
|---|---|
| `src/data/regions-stats.json` | statistiques des 13 régions, générées par `scripts/build-data.ts` |
| `src/data/SOURCES.md` | source, URL et millésime de chaque indicateur |
| `public/data/regions.geojson` | contours simplifiés des régions (gregoiredavid/france-geojson) |
| `src/lib/scoring.ts` | scoring pur et testable : pondérations, règles de catégorie, normalisation |
| `src/lib/scoring.test.ts` | tests unitaires |
| `src/components/region-map.tsx` | carte MapLibre (chargée avec `dynamic`, `ssr: false`) ; couleurs via `feature-state` |
| `scripts/copy-maplibre-worker.mjs` | copie le Web Worker de MapLibre 6 dans `public/`, exécuté avant `dev` et `build` |

Le fond de carte CARTO Positron est gratuit et ne demande pas de clé, mais il nécessite une
connexion internet.
