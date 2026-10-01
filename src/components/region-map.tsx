"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import { heatExpression, HEAT_GRADIENT_CSS, NEUTRAL_FILL } from "@/lib/colors";
import { fmtScore } from "@/lib/format";
import type { RegionResult } from "@/lib/scoring";

// Worker servi depuis public/ (voir scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Fond de carte vectoriel CARTO Positron (gratuit, sans clé), sans libellés. */
const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
const SOURCE_ID = "regions";
const FRANCE_BOUNDS: [number, number, number, number] = [-5.3, 41.3, 9.7, 51.2];

type Bbox = [number, number, number, number];
type RegionFeature = Feature<Polygon | MultiPolygon, { code: string; nom: string }>;
type RegionCollection = FeatureCollection<Polygon | MultiPolygon, { code: string; nom: string }>;

function bboxOf(feature: RegionFeature): Bbox {
  const g = feature.geometry;
  const rings = (g.type === "Polygon" ? g.coordinates : g.coordinates.flat()).flat();
  const xs = rings.map((p) => p[0]);
  const ys = rings.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Couleur : gris neutre tant qu'aucun score n'est posé dans le feature-state. */
const FILL_COLOR = [
  "case",
  ["==", ["typeof", ["feature-state", "score"]], "number"],
  heatExpression(["feature-state", "score"]),
  NEUTRAL_FILL,
] as unknown as ExpressionSpecification;

const isState = (key: string) =>
  ["boolean", ["feature-state", key], false] as unknown as ExpressionSpecification;

interface Props {
  results: RegionResult[] | null;
  selectedCode: string | null;
  focus: { code: string; nonce: number } | null;
  onSelect: (code: string | null) => void;
}

interface Hover {
  code: string;
  name: string;
  x: number;
  y: number;
  /** Le tooltip déborderait à droite / en bas : on l'affiche de l'autre côté du curseur. */
  flipX: boolean;
  flipY: boolean;
}

export default function RegionMap({ results, selectedCode, focus, onSelect }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [geojson, setGeojson] = useState<RegionCollection | null>(null);
  /** Incrémenté à chaque chargement de carte : une instance recréée reçoit à nouveau ses feature-states. */
  const [loadCount, setLoadCount] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);
  const hoveredCode = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/regions.geojson")
      .then((r) => r.json() as Promise<RegionCollection>)
      .then((data) => !cancelled && setGeojson(data))
      .catch((e: unknown) => console.error("Chargement du GeoJSON impossible", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const bboxes = useMemo(() => {
    const out: Record<string, Bbox> = {};
    for (const f of geojson?.features ?? []) out[f.properties.code] = bboxOf(f);
    return out;
  }, [geojson]);

  const byCode = useMemo(() => {
    const out: Record<string, RegionResult> = {};
    for (const r of results ?? []) out[r.code] = r;
    return out;
  }, [results]);

  /** Carte prête à recevoir des feature-states (style chargé, source présente), sinon null. */
  const readyMap = useCallback(() => {
    const map = mapRef.current?.getMap();
    return map && map.style && map.getSource<GeoJSONSource>(SOURCE_ID) ? map : null;
  }, []);

  // Scores → feature-state : la source GeoJSON n'est jamais rechargée.
  useEffect(() => {
    const map = readyMap();
    if (!map || !geojson) return;
    for (const f of geojson.features) {
      const r = byCode[f.properties.code];
      map.setFeatureState({ source: SOURCE_ID, id: f.properties.code }, { score: r ? r.normalized : null });
    }
  }, [byCode, geojson, loadCount, readyMap]);

  // Région sélectionnée → feature-state « selected ».
  useEffect(() => {
    const map = readyMap();
    if (!map || !geojson) return;
    for (const f of geojson.features) {
      const code = f.properties.code;
      map.setFeatureState({ source: SOURCE_ID, id: code }, { selected: code === selectedCode });
    }
  }, [selectedCode, geojson, loadCount, readyMap]);

  // Centrage demandé depuis le Top 5.
  useEffect(() => {
    if (!focus || !bboxes[focus.code]) return;
    const [x0, y0, x1, y1] = bboxes[focus.code];
    mapRef.current?.fitBounds(
      [
        [x0, y0],
        [x1, y1],
      ],
      // Marge droite élargie : le panneau de détail occupe ~360 px à droite.
      { padding: { top: 60, bottom: 60, left: 60, right: 400 }, duration: 900, maxZoom: 6 },
    );
  }, [focus, bboxes]);

  const setHovered = useCallback(
    (code: string | null) => {
      const map = readyMap();
      if (!map || hoveredCode.current === code) return;
      if (hoveredCode.current) map.setFeatureState({ source: SOURCE_ID, id: hoveredCode.current }, { hover: false });
      if (code) map.setFeatureState({ source: SOURCE_ID, id: code }, { hover: true });
      hoveredCode.current = code;
    },
    [readyMap],
  );

  const onMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const code = f?.properties?.code as string | undefined;
      setHovered(code ?? null);
      const box = containerRef.current?.getBoundingClientRect();
      setHover(
        code
          ? {
              code,
              name: String(f?.properties?.nom ?? code),
              x: e.point.x,
              y: e.point.y,
              flipX: box ? e.point.x > box.width - 300 : false,
              flipY: box ? e.point.y > box.height - 170 : false,
            }
          : null,
      );
    },
    [setHovered],
  );

  const onMouseLeave = useCallback(() => {
    setHovered(null);
    setHover(null);
  }, [setHovered]);

  const hovered = hover ? byCode[hover.code] : undefined;
  const topFactors = hovered
    ? [...hovered.factors]
        .filter((f) => Math.abs(f.contribution) > 0.005)
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
        .slice(0, 3)
    : [];

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapStyle={BASEMAP}
        initialViewState={{ bounds: FRANCE_BOUNDS, fitBoundsOptions: { padding: 24 } }}
        minZoom={3.5}
        maxZoom={9}
        dragRotate={false}
        pitchWithRotate={false}
        touchZoomRotate
        attributionControl={{ compact: true }}
        interactiveLayerIds={["regions-fill"]}
        cursor={hover ? "pointer" : "grab"}
        onLoad={() => {
          hoveredCode.current = null;
          setLoadCount((n) => n + 1);
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={(e) => onSelect((e.features?.[0]?.properties?.code as string | undefined) ?? null)}
        style={{ width: "100%", height: "100%" }}
      >
        {geojson && (
          <Source id={SOURCE_ID} type="geojson" data={geojson} promoteId="code">
            <Layer
              id="regions-fill"
              type="fill"
              paint={{ "fill-color": FILL_COLOR, "fill-opacity": 0.82 }}
            />
            <Layer
              id="regions-outline"
              type="line"
              paint={{
                "line-color": [
                  "case",
                  ["any", isState("hover"), isState("selected")],
                  "#171717",
                  "#ffffff",
                ] as unknown as ExpressionSpecification,
                "line-width": [
                  "case",
                  isState("selected"),
                  2.5,
                  isState("hover"),
                  2,
                  0.8,
                ] as unknown as ExpressionSpecification,
              }}
            />
          </Source>
        )}
      </Map>

      {hover && (
        <div
          className="pointer-events-none absolute z-30 w-64 rounded-lg border bg-popover/95 p-3 text-xs text-popover-foreground shadow-md backdrop-blur"
          style={{
            left: hover.x + 16,
            top: hover.y + 16,
            transform: `translate(${hover.flipX ? "calc(-100% - 32px)" : "0"}, ${hover.flipY ? "calc(-100% - 32px)" : "0"})`,
          }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-sm">{hover.name}</span>
            {hovered && (
              <span className="tabular-nums text-sm font-semibold">
                {fmtScore(hovered.normalized)}
                <span className="text-muted-foreground font-normal"> / 100</span>
              </span>
            )}
          </div>
          {hovered ? (
            <ul className="mt-2 space-y-1">
              {topFactors.map((f) => (
                <li key={f.key} className="flex justify-between gap-2">
                  <span>{f.label}</span>
                  <span className="font-semibold tabular-nums">{f.contribution > 0 ? "+" : "−"}</span>
                </li>
              ))}
              {topFactors.length === 0 && <li className="text-muted-foreground">Région dans la moyenne</li>}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">Cliquez pour voir les statistiques.</p>
          )}
        </div>
      )}

      {!results && (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-4">
          <p className="rounded-full border bg-background/95 px-4 py-2 text-sm text-muted-foreground shadow-sm">
            Décrivez votre produit puis cliquez sur « Calculer les scores ».
          </p>
        </div>
      )}

      {results && (
        <div className="absolute bottom-6 left-4 z-10 w-56 rounded-lg border bg-background/95 p-3 text-xs shadow-sm">
          <div className="mb-1.5 font-medium">Score de correspondance</div>
          <div className="h-2.5 rounded-sm" style={{ background: HEAT_GRADIENT_CSS }} />
          <div className="mt-1 flex justify-between tabular-nums text-muted-foreground">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Relatif aux 13 régions métropolitaines.
          </p>
        </div>
      )}
    </div>
  );
}
