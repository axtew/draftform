import { validateField } from "../validate";
import { isSameValue, type Values } from "./_state";
import type { FieldsOptions, FieldState, FieldValue } from "./_types";

export interface Derived {
  fields: Record<string, FieldState<FieldValue>>;
  dirty: boolean;
  valid: boolean;
}

/** Errors, `dirty` and `valid` of every field, computed from the stored state. */
export function deriveFields(
  values: Values,
  saved: Values,
  touched: Record<string, true>,
  errors: Record<string, string>,
  options: FieldsOptions<Values> | undefined,
): Derived {
  const fields: Record<string, FieldState<FieldValue>> = {};
  let dirty = false;
  let valid = true;

  // All validators run on every change: a cross-field rule ("repeat password")
  // never shows a stale result, and flat forms are small enough for it.
  for (const [name, value] of Object.entries(values)) {
    const setByCaller = errors[name];
    const error = setByCaller ?? validateField(value, values, options?.[name]);
    const isTouched = touched[name] === true;
    const savedValue = saved[name] ?? null;
    const fieldDirty = !isSameValue(value, savedValue);

    fields[name] = {
      value,
      saved: savedValue,
      error,
      // An error set with setError comes from an explicit action: shown at once.
      visibleError: setByCaller ?? (isTouched ? error : null),
      dirty: fieldDirty,
      touched: isTouched,
    };
    dirty ||= fieldDirty;
    valid &&= error === null;
  }

  return { fields, dirty, valid };
}
