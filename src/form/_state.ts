import type { FieldValue } from "./_types";

/** Values with the form's type erased: the hook's public types put it back. */
export type Values = Record<string, FieldValue>;

/**
 * Everything the form keeps. Errors, `dirty` and `valid` are not here: they are
 * computed from this on every render, so they cannot drift from the values.
 */
export interface FormState {
  values: Values;
  saved: Values;
  /**
   * The raw text of inputs being edited. The input shows it until blur, so `normalize`
   * and `parse` do not fight the user's typing ("1." in a number field, a space
   * between two words with trim).
   */
  text: Record<string, string>;
  touched: Record<string, true>;
  /** Errors set with `setError`. */
  errors: Record<string, string>;
}

export type FormAction =
  | {
      type: "change";
      name: string;
      /** Computes the new value from the latest one, so updates in one handler stack up. */
      update: (current: FieldValue) => FieldValue;
      text: string | undefined;
    }
  | { type: "blur"; name: string }
  | { type: "error"; name: string; error: string | null };

/** Equal values; `NaN` equals `NaN`, so an empty number field that stays empty is clean. */
export function isSameValue(a: FieldValue, b: FieldValue | undefined): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

export function createState(initial: Values, saved: Partial<Values> | undefined): FormState {
  const values = { ...initial };
  const savedValues = { ...initial };

  if (saved !== undefined) {
    for (const [name, value] of Object.entries(saved)) {
      if (value !== undefined && Object.hasOwn(values, name)) savedValues[name] = value;
    }
  }

  return { values, saved: savedValues, text: {}, touched: {}, errors: {} };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  const { name } = action;

  if (action.type === "change") {
    const current = state.values[name] ?? null;
    const value = action.update(current);
    const valueChanged = !isSameValue(value, current);
    const textChanged = state.text[name] !== action.text;
    // An error from setError belongs to the value it was set for.
    const hadError = Object.hasOwn(state.errors, name);

    if (!valueChanged && !textChanged && !hadError) return state;

    return {
      ...state,
      values: valueChanged ? { ...state.values, [name]: value } : state.values,
      text: textChanged ? withEntry(state.text, name, action.text) : state.text,
      errors: hadError ? withEntry(state.errors, name, undefined) : state.errors,
    };
  }

  if (action.type === "blur") {
    const hasText = Object.hasOwn(state.text, name);

    if (state.touched[name] === true && !hasText) return state;

    return {
      ...state,
      touched: { ...state.touched, [name]: true },
      text: hasText ? withEntry(state.text, name, undefined) : state.text,
    };
  }

  const error = action.error ?? undefined;

  if (state.errors[name] === error) return state;

  return { ...state, errors: withEntry(state.errors, name, error) };
}

/** A copy with the entry set, or removed for `undefined`. */
function withEntry<T>(
  record: Record<string, T>,
  name: string,
  value: T | undefined,
): Record<string, T> {
  const next = { ...record };

  if (value === undefined) delete next[name];
  else next[name] = value;

  return next;
}
