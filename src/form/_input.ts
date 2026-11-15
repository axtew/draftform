import type { FieldElement, FieldValue } from "./_types";

/**
 * What the field held before any edit: the type information that survives to runtime.
 * A field that started as `null` allows `null`, one that started as a number is a number.
 */
export interface FieldOrigin {
  initial: FieldValue;
  saved: FieldValue;
}

/**
 * The value from an input when the field has no `parse`. It keeps the field's type:
 * a checkbox gives `checked`; an empty input gives `null` if the field started as
 * `null`; a number input or a number field gives a number (`NaN` when empty or not a
 * number); a boolean field outside a checkbox (a `<select>`) compares with "true".
 */
export function readInput(element: FieldElement, origin: FieldOrigin): FieldValue {
  if (element.type === "checkbox" && "checked" in element) return element.checked;

  const text = element.value;
  const { initial, saved } = origin;

  if (text === "" && (initial === null || saved === null)) return null;

  if (
    element.type === "number" ||
    element.type === "range" ||
    typeof initial === "number" ||
    typeof saved === "number"
  ) {
    // Number("") is 0: an empty input must not turn into a zero.
    return text.trim() === "" ? Number.NaN : Number(text);
  }

  if (typeof initial === "boolean" || typeof saved === "boolean") return text === "true";

  return text;
}

/** The input's `value` prop when the field is not being edited and has no `format`. */
export function displayValue(value: FieldValue): string | number {
  if (value === null || Number.isNaN(value)) return "";

  return typeof value === "number" ? value : String(value);
}
