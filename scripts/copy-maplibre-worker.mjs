// MapLibre GL 6 charge son Web Worker depuis une URL calculée à l'exécution, que le bundler
// de Next.js ne peut pas résoudre. On sert donc le worker (et le module partagé qu'il importe)
// depuis public/, copiés depuis node_modules pour rester alignés sur la version installée.
import { cpSync, mkdirSync } from "node:fs";

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
mkdirSync("public/maplibre", { recursive: true });
for (const f of files) cpSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
