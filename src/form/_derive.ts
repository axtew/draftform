import { checkSchema, type SchemaErrors, validateField } from "../validate";
import { isSameValue, type Values } from "./_state";
import type { FieldsOptions, FieldState, FieldValue, FormSchema } from "./_types";

export interface Derived {
  fields: Record<string, FieldState<FieldValue>>;
  dirty: boolean;
  valid: boolean;
  /** The schema's error for the whole form, whether it is shown yet or not. */
  formError: string | null;
}

/** The checks of the values: the options that `deriveFields` reads. */
export interface Checks {
  fields?: FieldsOptions<Values> | undefined;
  schema?: FormSchema<Values> | undefined;
}

/**
 * Errors, `dirty` and `valid` of every field, computed from the stored state. The
 * schema's result may come in already computed: a render checks the schema only when
 * the values change, not on every blur.
 */
export function deriveFields(
  values: Values,
  saved: Values,
  touched: Record<string, true>,
  errors: Record<string, string>,
  { fields: options, schema }: Checks,
  schemaErrors: SchemaErrors = checkSchema(schema, values),
): Derived {
  const fields: Record<string, FieldState<FieldValue>> = {};
  let dirty = false;
  let valid = schemaErrors.form === null;

  // All validators run on every change: a cross-field rule ("repeat password")
  // never shows a stale result, and flat forms are small enough for it.
  for (const [name, value] of Object.entries(values)) {
    const setByCaller = errors[name];
    // The field's own checks first: "Required" before the schema's "Too short".
    const error =
      setByCaller ??
      validateField(value, values, options?.[name]) ??
      schemaErrors.fields[name] ??
      null;
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

  return { fields, dirty, valid, formError: schemaErrors.form };
}
