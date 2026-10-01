"use client";

import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AGE_BANDS,
  CATEGORIES,
  CSP_LIST,
  POSITIONINGS,
  type AgeBand,
  type Category,
  type CspKey,
  type Positioning,
} from "@/lib/domain";

/** État du formulaire : le prix reste une chaîne tant qu'il est en cours de saisie. */
export interface ProductDraft {
  name: string;
  category: Category;
  price: string;
  targetAges: AgeBand[];
  targetCsp: CspKey[];
  positioning: Positioning;
}

/** Option sélectionnée bien visible, en restant dans les tons neutres. */
const SELECTED =
  "data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background hover:data-[state=on]:bg-foreground/90 hover:data-[state=on]:text-background";

export const parsePrice = (raw: string): number | null => {
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface Props {
  draft: ProductDraft;
  onChange: (draft: ProductDraft) => void;
  onSubmit: () => void;
  /** Le formulaire a changé depuis le dernier calcul. */
  stale: boolean;
}

export function ProductForm({ draft, onChange, onSubmit, stale }: Props) {
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const priceInvalid = draft.price.trim() !== "" && parsePrice(draft.price) == null;
  const canSubmit = parsePrice(draft.price) != null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom du produit</Label>
        <Input
          id="name"
          placeholder="Ex. : Sneakers éco-conçues"
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="category">Catégorie</Label>
          <Select value={draft.category} onValueChange={(v) => set("category", v as Category)}>
            <SelectTrigger id="category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="price">Prix unitaire (€)</Label>
          <Input
            id="price"
            inputMode="decimal"
            placeholder="Ex. : 89"
            value={draft.price}
            aria-invalid={priceInvalid}
            onChange={(e) => set("price", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Positionnement</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={draft.positioning}
          onValueChange={(v) => v && set("positioning", v as Positioning)}
        >
          {POSITIONINGS.map((p) => (
            <ToggleGroupItem key={p.key} value={p.key} className={`flex-1 text-xs ${SELECTED}`}>
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-1.5">
        <Label>Tranches d&apos;âge ciblées</Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          spacing={1}
          className="w-full flex-wrap"
          value={draft.targetAges}
          onValueChange={(v) => set("targetAges", v as AgeBand[])}
        >
          {AGE_BANDS.map((a) => (
            <ToggleGroupItem key={a.key} value={a.key} aria-label={a.label} className={SELECTED}>
              {a.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium leading-none">CSP ciblées</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {CSP_LIST.map((c) => {
            const checked = draft.targetCsp.includes(c.key);
            return (
              <Label key={c.key} htmlFor={`csp-${c.key}`} className="items-start gap-2 text-xs font-normal leading-snug">
                <Checkbox
                  id={`csp-${c.key}`}
                  checked={checked}
                  onCheckedChange={(v) =>
                    set(
                      "targetCsp",
                      v === true ? [...draft.targetCsp, c.key] : draft.targetCsp.filter((k) => k !== c.key),
                    )
                  }
                />
                {c.label}
              </Label>
            );
          })}
        </div>
      </fieldset>

      <Button type="submit" disabled={!canSubmit} className="w-full">
        <Calculator data-icon="inline-start" />
        Calculer les scores
      </Button>
      {!canSubmit && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {priceInvalid ? "Saisissez un prix positif." : "Renseignez au moins le prix pour lancer le calcul."}
        </p>
      )}
      {canSubmit && stale && (
        <p className="-mt-2 text-xs text-muted-foreground">Le produit a changé : recalculez pour mettre à jour la carte.</p>
      )}
    </form>
  );
}
