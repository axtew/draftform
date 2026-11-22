import type { ChangeEvent, FocusEvent } from "react";

import type { StandardSchemaV1 } from "../schema";

/** A value a form field can hold. Forms are flat: no arrays or nested objects. */
export type FieldValue = string | number | boolean | null;

/**
 * The shape every form satisfies: each field holds a {@link FieldValue}.
 * Written as a mapped type, so interfaces fit too, not only object literals.
 */
export type FormValues<V> = { [K in keyof V]: FieldValue };

/**
 * Rejects values that are not field values (arrays, objects) at the call site, and
 * boolean fields that may also be `null` or missing: a checkbox has two states. For a
 * third one ("not answered") use a radio group over a type such as
 * `"yes" | "no" | null`. The error points at those fields and asks for `boolean`.
 *
 * A check next to the options, not a constraint on the type parameter: a constraint
 * would make TypeScript keep `false` as a literal type instead of `boolean`.
 */
export type CheckValues<V> = [V] extends [FormValues<V>]
  ? [TriStateFields<V>] extends [never]
    ? unknown
    : { initial: { [K in TriStateFields<V>]: boolean } }
  : { initial: FormValues<V> };

/** Names of boolean fields that may also be `null`, `undefined` or missing. */
type TriStateFields<V> = {
  [K in keyof V]-?: [Extract<V[K], boolean>] extends [never]
    ? never
    : null extends V[K]
      ? K
      : undefined extends V[K]
        ? K
        : {} extends Pick<V, K>
          ? K
          : never;
}[keyof V];

/** Field names of a form. */
export type FieldName<V> = keyof V & string;

/** The elements `field()` can be spread on. */
export type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The `ref` callback `field()` returns: the form keeps the element to focus it. */
export type FieldRef = (element: FieldElement | null) => void;

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

/**
 * A Standard Schema (Zod, Valibot, ArkType and others) that fits the form: its input
 * has some of the form's fields, each of the field's type or narrower. A schema of
 * another shape (a field of another type, no field in common) is a type error.
 */
export type FormSchema<V> = StandardSchemaV1<{ [K in keyof V]?: V[K] | undefined }, unknown>;

export interface FormOptions<V> {
  /**
   * Starting values. The form's type is inferred from them. Read on mount and on
   * every reset, so a form keyed by `resetKey` can pass the record being edited.
   */
  initial: V;
  /** Parsing, formatting and validation per field. */
  fields?: FieldsOptions<V>;
  /**
   * A Standard Schema for the whole form: Zod, Valibot, ArkType and others, no adapter.
   * It checks the values on every change, together with the fields' `required` and
   * `validate`, which go first: a field shows the schema's message only when its own
   * checks pass. An issue belongs to the field named by the first segment of its path;
   * an issue without a path, or with a path that is not a field, goes to `formError`.
   * Errors show like any other (after touch or submit) and block saving.
   *
   * The schema only checks: `onSubmit` gets the form's values, not the schema's
   * output. Only synchronous schemas: an async check (is this email taken) belongs in
   * `onSubmit`, reported with `setError`. A schema that answers with a promise throws.
   */
  schema?: FormSchema<V> | undefined;
  /**
   * Values that count as already saved, for some fields. By default the saved value
   * is the initial one, so the form starts clean. A create form whose defaults are
   * meaningful input passes, say, `{ title: "" }` here: the field is dirty from the
   * first render and the form can be submitted without edits.
   */
  saved?: Partial<V>;
  /**
   * Saves the values; called by `submit()`, `flush()` and autosave for a valid, dirty
   * form, one call at a time. Throw (or reject) to report a failure: the form stays
   * dirty for a retry and `onError` gets the error. When it resolves, exactly the values
   * it got become saved; edits made meanwhile stay dirty. The handler of the latest
   * render is called.
   */
  onSubmit?: (values: V, context: SubmitContext<V>) => unknown;
  /** Called with what `onSubmit` threw. The error is also in `submitError`. */
  onError?: (error: unknown) => void;
  /**
   * Saves by itself after the user stops editing: `true` waits 500 ms after the last
   * change, `{ delay }` sets the wait in milliseconds. Only a valid, dirty form is
   * saved; an invalid one waits for the next change, without touching fields or
   * moving focus.
   *
   * One save runs at a time. Changes made while a save is in flight go in one more
   * save right after it ends, with the latest values; a request in flight is never
   * aborted, so the server gets the values in the order they were made. A failure does
   * not retry by itself: the next change or `flush()` does. A change still waiting
   * when the form unmounts is saved at once.
   */
  autosave?: boolean | AutosaveOptions | undefined;
  /**
   * When it changes (compared with `Object.is`), the form resets to `initial` and the
   * `saved` option of that render, before its children render: pass the id of the
   * record being edited. Changes autosave has not sent yet are sent at once, with the
   * handlers of the last render before the change, so they reach the record they were
   * made on.
   */
  resetKey?: unknown;
}

/** Autosave settings. */
export interface AutosaveOptions {
  /** Milliseconds without changes before the form saves. Default: 500. */
  delay?: number | undefined;
}

/** The second argument of `onSubmit`. */
export interface SubmitContext<V> {
  /** Only the fields that differ from their saved values: the body of a PATCH. */
  changed: Partial<V>;
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
  /**
   * Lets the form focus the field after a failed submit. To keep a ref of your own,
   * call both: `ref={(el) => { props.ref(el); myRef.current = el; }}`. A field without
   * an element is skipped; on React 18 leave `ref` out when spreading on a component
   * that does not forward refs.
   */
  ref: FieldRef;
}

/** Props for text inputs, number inputs, `<select>` and `<textarea>`. */
export interface InputFieldProps extends BaseFieldProps {
  value: string | number;
}

/** Props for a checkbox: `checked` instead of `value`. */
export interface CheckboxFieldProps extends BaseFieldProps {
  checked: boolean;
}

/**
 * Props for one radio button of a group, from `field(name, { radio: option })`. Write
 * `type="radio"` yourself. The `id` is unique per option: `fieldId(name, option)`.
 */
export interface RadioFieldProps extends BaseFieldProps {
  /** The option as text, through the field's `format`. */
  value: string;
  /** The field's value is this option. */
  checked: boolean;
}

/** The second argument of `field()` for a radio button: the option it stands for. */
export interface RadioOptions<T> {
  radio: T;
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
  /** No field has an error, nor the form: see `formError`. */
  valid: boolean;
  /**
   * The schema's error for the form as a whole: the first issue without a path, or with
   * a path that is not a field. Like field errors, it shows after a submit (or once
   * every field was touched); until then it is `null`, but still makes the form invalid.
   */
  formError: string | null;
  /** Valid, dirty and not pending: there is something to save. */
  canSubmit: boolean;
  /** A save is in flight: from `submit()`, `flush()` or autosave. */
  pending: boolean;
  /** What the last failed `onSubmit` threw; `null` after a success or a reset. */
  submitError: unknown;
  /**
   * Props to spread on an input, `<select>` or `<textarea>`. With `{ radio: option }`,
   * props for the radio button of that option; the option must fit the field's type.
   */
  field: {
    <K extends FieldName<V>>(name: K): FieldProps<V[K]>;
    <K extends FieldName<V>>(name: K, options: RadioOptions<V[K]>): RadioFieldProps;
  };
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
  /**
   * The `id` the field's input gets, for `<label htmlFor>`. With an option, the `id` of
   * that radio button.
   */
  fieldId: <K extends FieldName<V>>(name: K, option?: V[K]) => string;
  /** The `id` to put on the element showing the field's error. */
  errorId: (name: FieldName<V>) => string;
  /**
   * Submits: marks all fields touched, so errors show; for an invalid form focuses the
   * first field with an error (in the order of `initial`) and stops; for a form without
   * changes stops; otherwise calls `onSubmit`. While a save is in flight, waits for it
   * and then sends only what is still unsaved: a double click makes one request.
   * Resolves `true` when the values are saved.
   */
  submit: () => Promise<boolean>;
  /**
   * Saves now, without the autosave wait: before leaving the page, or as "save now" in a
   * form without autosave. Waits for a save in flight, then sends what is still
   * unsaved. Does not touch fields or move focus. Resolves `true` when everything is
   * saved, `false` when the form is invalid, the save failed or the form was reset
   * meanwhile.
   */
  flush: () => Promise<boolean>;
  /** `submit()` for `<form onSubmit>`: prevents the page reload. */
  handleSubmit: (event?: { preventDefault: () => void }) => void;
  /**
   * Starts over: clears touched fields, errors from `setError` and `submitError`.
   * Without arguments, values return to `initial` and the `saved` option. Given values
   * (data loaded after mount) become both current and saved; missing fields return to
   * `initial`. A save in flight stays pending, but its result no longer marks
   * anything saved. Changes autosave has not sent yet are dropped: to keep them,
   * `await flush()` first.
   */
  reset: (values?: Partial<V>) => void;
}
