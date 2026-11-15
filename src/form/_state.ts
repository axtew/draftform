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
  /** A save is in flight. */
  pending: boolean;
  /** What the last failed save threw; `null` after a success or a reset. */
  submitError: unknown;
  /**
   * Grows on every reset. A save remembers it at the start: when the save ends after a
   * reset, its values belong to the old data and must not be marked saved.
   */
  epoch: number;
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
  | { type: "error"; name: string; error: string | null }
  | { type: "touchAll" }
  | { type: "submitStart" }
  /** The save of `sent` succeeded: exactly these values become saved. */
  | { type: "submitDone"; epoch: number; sent: Values }
  | { type: "submitFailed"; epoch: number; error: unknown }
  | { type: "reset"; values: Values; saved: Values };

/** Equal values; `NaN` equals `NaN`, so an empty number field that stays empty is clean. */
export function isSameValue(a: FieldValue, b: FieldValue | undefined): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

/**
 * Starting values and saved values: `initial`, with saved values overridden by the
 * `saved` option. `values` given to `reset` replace both, field by field.
 */
export function startValues(
  initial: Values,
  savedOption: Partial<Values> | undefined,
  values?: Partial<Values>,
): { values: Values; saved: Values } {
  const current = { ...initial };
  const saved = { ...initial };

  for (const [name, value] of Object.entries(savedOption ?? {})) {
    if (value !== undefined && Object.hasOwn(current, name)) saved[name] = value;
  }

  // Only the form's fields: a server object may carry more.
  for (const [name, value] of Object.entries(values ?? {})) {
    if (value !== undefined && Object.hasOwn(current, name)) {
      current[name] = value;
      saved[name] = value;
    }
  }

  return { values: current, saved };
}

export function createState(initial: Values, savedOption: Partial<Values> | undefined): FormState {
  return {
    ...startValues(initial, savedOption),
    text: {},
    touched: {},
    errors: {},
    pending: false,
    submitError: null,
    epoch: 0,
  };
}

export function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "change": {
      const { name } = action;
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

    case "blur": {
      const { name } = action;
      const hasText = Object.hasOwn(state.text, name);

      if (state.touched[name] === true && !hasText) return state;

      return {
        ...state,
        touched: { ...state.touched, [name]: true },
        text: hasText ? withEntry(state.text, name, undefined) : state.text,
      };
    }

    case "error": {
      const error = action.error ?? undefined;

      if (state.errors[action.name] === error) return state;

      return { ...state, errors: withEntry(state.errors, action.name, error) };
    }

    case "touchAll": {
      const names = Object.keys(state.values);

      if (names.every((name) => state.touched[name] === true)) return state;

      return { ...state, touched: Object.fromEntries(names.map((name) => [name, true])) };
    }

    case "submitStart":
      return { ...state, pending: true };

    case "submitDone":
      if (action.epoch !== state.epoch) return { ...state, pending: false };

      // Not the current values: a field edited while the request was in flight keeps
      // its new value and stays dirty.
      return { ...state, pending: false, saved: action.sent, submitError: null };

    case "submitFailed":
      if (action.epoch !== state.epoch) return { ...state, pending: false };

      return { ...state, pending: false, submitError: action.error };
  }

  // reset. A save in flight keeps `pending`: the form does not start a second one meanwhile.
  return {
    values: action.values,
    saved: action.saved,
    text: {},
    touched: {},
    errors: {},
    pending: state.pending,
    submitError: null,
    epoch: state.epoch + 1,
  };
}

/**
 * The form's state outside React's queue, so code running after an update in the same
 * handler (`setValue` then `submit`) reads the new values. Every change also goes to
 * React state, which renders it.
 */
export interface Store {
  readonly current: FormState;
  dispatch: (action: FormAction) => void;
}

export function createStore(initial: FormState, publish: (state: FormState) => void): Store {
  let current = initial;

  return {
    get current() {
      return current;
    },
    dispatch: (action) => {
      const next = formReducer(current, action);

      if (next === current) return;

      current = next;
      publish(next);
    },
  };
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
