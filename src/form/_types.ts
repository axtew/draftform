import type { ChangeEvent, FocusEvent } from "react";

/** A value a form field can hold. Forms are flat: no arrays or nested objects. */
export type FieldValue = string | number | boolean | null;

/**
 * The shape every form satisfies: each field holds a {@link FieldValue}.
 * Written as a mapped type, so interfaces fit too, not only object literals.
 */
export type FormValues<V> = { [K in keyof V]: FieldValue };

/**
 * Rejects values that are not field values (arrays, objects) at the call site.
 * A check next to the options, not a constraint on the type parameter: a constraint
 * would make TypeScript keep `false` as a literal type instead of `boolean`.
 */
export type CheckValues<V> = [V] extends [FormValues<V>] ? unknown : { initial: FormValues<V> };

/** Field names of a form. */
export type FieldName<V> = keyof V & string;

/** The elements `field()` can be spread on. */
export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Per-field configuration, all optional. `T` is the field's value type, `V` the whole form. */
export interface FieldOptions<T, V> {
  /**
   * The field must not be empty. Empty means: a string of whitespace only, `null`,
   * `NaN`, or `false` (an unchecked checkbox, as with the HTML `required` attribute).
   * `true` gives the message "Required", a string is used as the message.
   */
  required?: boolean | string;
  /**
   * Turns the input's text into the field's value. Not called for checkboxes, which
   * give `checked`. By default the value keeps the field's type: a number field (or an
   * `<input type="number">`) gives a number, an empty input gives `NaN`, or `null` when
   * the field started as `null`.
   */
  parse?: (input: string) => T;
  /** Turns the value into the input's text. By default `null` and `NaN` show as empty. */
  format?: (value: T) => string;
  /**
   * Applied to every new value before it is stored and validated (trim, lower case).
   * While the user types, the input keeps showing the raw text; after blur it shows
   * the stored value.
   */
  normalize?: (value: T) => T;
  /**
   * Returns an error message, or `null` / `undefined` when the value is fine. Gets the
   * stored value (after `parse` and `normalize`) and all current values, so it can
   * compare fields. All validators run on every change.
   */
  validate?: (value: T, values: V) => string | null | undefined;
}

/** Configuration of the fields, keyed by field name. */
export type FieldsOptions<V> = { [K in keyof V]?: FieldOptions<V[K], V> };

export interface FormOptions<V> {
  /** Starting values. The form's type is inferred from them. */
  initial: V;
  /** Parsing, formatting and validation per field. */
  fields?: FieldsOptions<V>;
  /**
   * Values that count as already saved, for some fields. By default the saved value
   * is the initial one, so the form starts clean. A create form whose defaults are
   * meaningful input passes, say, `{ title: "" }` here: the field is dirty from the
   * first render and the form can be submitted without edits.
   */
  saved?: Partial<V>;
}

/** The state of one field. */
export interface FieldState<T> {
  /** The stored value, after `parse` and `normalize`. */
  value: T;
  /** The value that counts as saved. */
  saved: T;
  /** The current error, computed from the start, whether the field was touched or not. */
  error: string | null;
  /** The error to show: set once the field was touched, or set with `setError`. */
  visibleError: string | null;
  /** The value differs from the saved one. */
  dirty: boolean;
  /** The field lost focus at least once. */
  touched: boolean;
}

/** Props shared by every field. */
export interface BaseFieldProps {
  name: string;
  id: string;
  onChange: (event: ChangeEvent<FieldElement>) => void;
  onBlur: (event: FocusEvent<FieldElement>) => void;
  /** `true` only while the error is visible. */
  "aria-invalid": boolean;
  /** Points to the element with `errorId(name)` while the error is visible. */
  "aria-describedby": string | undefined;
}

/** Props for text inputs, number inputs, `<select>` and `<textarea>`. */
export interface InputFieldProps extends BaseFieldProps {
  value: string | number;
}

/** Props for a checkbox: `checked` instead of `value`. */
export interface CheckboxFieldProps extends BaseFieldProps {
  checked: boolean;
}

/** Props `field(name)` returns: a checkbox for a boolean field, an input otherwise. */
export type FieldProps<T> = [T] extends [boolean] ? CheckboxFieldProps : InputFieldProps;

export interface Form<V> {
  /** Current values. The object changes only when a value does. */
  values: V;
  /** State per field. */
  fields: { [K in keyof V]: FieldState<V[K]> };
  /** Some field differs from its saved value. */
  dirty: boolean;
  /** No field has an error. */
  valid: boolean;
  /** Valid and dirty: there is something to save. */
  canSubmit: boolean;
  /** Props to spread on an input, `<select>` or `<textarea>`. */
  field: <K extends FieldName<V>>(name: K) => FieldProps<V[K]>;
  /**
   * Sets a value from code (custom components, computed fields). Takes a value or a
   * function of the current one; several calls in one handler all apply in order.
   */
  setValue: <K extends FieldName<V>>(name: K, value: V[K] | ((current: V[K]) => V[K])) => void;
  /**
   * Sets an error from outside, usually from the server. It is visible at once and
   * stays until the field is edited; `null` removes it.
   */
  setError: (name: FieldName<V>, error: string | null) => void;
  /** The `id` the field's input gets, for `<label htmlFor>`. */
  fieldId: (name: FieldName<V>) => string;
  /** The `id` to put on the element showing the field's error. */
  errorId: (name: FieldName<V>) => string;
}
