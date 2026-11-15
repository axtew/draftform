import type { FieldOptions, FieldValue } from "../form/_types";

/** The message for `required: true`. */
export const REQUIRED_MESSAGE = "Required";

/**
 * Empty for `required`: a whitespace-only string, `null`, `NaN` (an empty number
 * input) and `false` (an unchecked checkbox, as the HTML `required` attribute treats it).
 */
export function isEmpty(value: FieldValue): boolean {
  if (value === null || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return Number.isNaN(value);

  return false;
}

/**
 * The error of one field for the stored value. `required` goes first; the validator
 * runs only for a non-empty or optional value, so it never repeats "Required".
 */
export function validateField<T extends FieldValue, V>(
  value: T,
  values: V,
  options: FieldOptions<T, V> | undefined,
): string | null {
  if (options === undefined) return null;

  const { required, validate } = options;

  if (required !== undefined && required !== false && isEmpty(value)) {
    return typeof required === "string" ? required : REQUIRED_MESSAGE;
  }

  // An empty message is no message: `"" || null`.
  return validate?.(value, values) || null;
}
