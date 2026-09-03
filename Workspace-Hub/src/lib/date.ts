/**
 * Astryx's DateInput types its value as a template-literal ISO date
 * (`${number}${number}${number}${number}-${number}${number}-${number}${number}`)
 * rather than a plain string, so a malformed date is a compile error.
 *
 * Our state holds plain strings, because that is what the API returns. These
 * helpers are the single documented crossing point between the two. The
 * mismatch was invisible until now because @types/react was never installed,
 * so `npm run lint` (tsc --noEmit) was checking almost nothing.
 */
export type IsoDate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value);
}

/**
 * Narrow a plain string for DateInput. Anything unparseable becomes undefined,
 * which renders as an empty field — the honest outcome for a value we cannot
 * display correctly.
 */
export function asIsoDate(value: string | null | undefined): IsoDate | undefined {
  return value && isIsoDate(value) ? value : undefined;
}
