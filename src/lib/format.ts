/** Formatage des nombres en français (Intl.NumberFormat 'fr-FR'). */

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signed = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

const orDash = <T,>(v: T | null | undefined, f: (x: T) => string) => (v == null ? "—" : f(v));

export const fmtInt = (v: number | null | undefined) => orDash(v, (x) => integer.format(x));
export const fmtDecimal = (v: number | null | undefined) => orDash(v, (x) => oneDecimal.format(x));
export const fmtPct = (v: number | null | undefined) => orDash(v, (x) => `${oneDecimal.format(x)} %`);
export const fmtEuro = (v: number | null | undefined) => orDash(v, (x) => euros.format(x));
export const fmtSigned = (v: number) => signed.format(v);
export const fmtScore = (v: number) => integer.format(Math.round(v));
