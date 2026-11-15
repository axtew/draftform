import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { validateField } from "../validate";
import { displayValue, readInput } from "./_input";
import { createState, formReducer, isSameValue, type Values } from "./_state";
import type {
  CheckboxFieldProps,
  CheckValues,
  FieldElement,
  FieldState,
  FieldValue,
  Form,
  FormOptions,
  InputFieldProps,
} from "./_types";

interface Handlers {
  onChange: (event: ChangeEvent<FieldElement>) => void;
  onBlur: () => void;
}

// Layout effects warn during server rendering in React 18; there is nothing to sync there.
const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Form state for a flat form: values that keep their types, validation, `touched`,
 * and `dirty` measured against the saved values.
 *
 * ```tsx
 * const form = useForm({
 *   initial: { email: "", age: 18, remember: false },
 *   fields: { email: { required: true, normalize: (v) => v.trim() } },
 * });
 *
 * <input {...form.field("email")} />
 * {form.fields.email.visibleError && <p id={form.errorId("email")}>{form.fields.email.visibleError}</p>}
 * <input type="number" {...form.field("age")} />
 * <input type="checkbox" {...form.field("remember")} />
 * <button disabled={!form.canSubmit}>Save</button>
 * ```
 *
 * `initial` is read on mount; later changes of it are ignored. `fields` is read on
 * every render, so validators may depend on props.
 */
export function useForm<V>(options: FormOptions<V> & CheckValues<V>): Form<V> {
  // The form's type lives in the public signature; inside, values are plain records.
  // `CheckValues` has already rejected anything that is not a field value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const untyped = options as unknown as FormOptions<Values>;

  const [state, dispatch] = useReducer(formReducer, untyped, (o) =>
    createState(o.initial, o.saved),
  );

  // Handlers made once read the options of the latest render: parsers may close over props.
  const optionsRef = useRef(untyped);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = untyped;
  });

  const baseId = useId();
  const fieldId = useCallback(
    (name: string) => `${baseId}-f-${encodeURIComponent(name)}`,
    [baseId],
  );
  const errorId = useCallback(
    (name: string) => `${baseId}-e-${encodeURIComponent(name)}`,
    [baseId],
  );

  const setValue = useCallback(
    (name: string, next: FieldValue | ((current: FieldValue) => FieldValue)) => {
      const { initial, fields } = optionsRef.current;
      assertField(initial, name);

      const normalize = fields?.[name]?.normalize;

      dispatch({
        type: "change",
        name,
        update: (current) => apply(normalize, typeof next === "function" ? next(current) : next),
        text: undefined,
      });
    },
    [],
  );

  const setError = useCallback((name: string, error: string | null) => {
    assertField(optionsRef.current.initial, name);
    dispatch({ type: "error", name, error });
  }, []);

  // One pair of handlers per field for the hook's lifetime: spreading `field()` on
  // every render does not hand inputs new functions.
  const [handlersCache] = useState(() => new Map<string, Handlers>());
  const handlersFor = (name: string): Handlers => {
    let handlers = handlersCache.get(name);

    if (handlers === undefined) {
      handlers = {
        onChange: (event) => {
          const element = event.target;
          const { initial, saved, fields } = optionsRef.current;
          const config = fields?.[name];
          const isCheckbox = element.type === "checkbox";
          const value =
            config?.parse !== undefined && !isCheckbox
              ? config.parse(element.value)
              : readInput(element, {
                  initial: initial[name] ?? null,
                  saved: saved?.[name] ?? initial[name] ?? null,
                });
          const stored = apply(config?.normalize, value);

          dispatch({
            type: "change",
            name,
            update: () => stored,
            text: isCheckbox ? undefined : element.value,
          });
        },
        onBlur: () => dispatch({ type: "blur", name }),
      };
      handlersCache.set(name, handlers);
    }

    return handlers;
  };

  const fieldsOptions = untyped.fields;
  const derived = useMemo(() => {
    const fields: Record<string, FieldState<FieldValue>> = {};
    let dirty = false;
    let valid = true;

    // All validators run on every change: a cross-field rule ("repeat password")
    // never shows a stale result, and flat forms are small enough for it.
    for (const [name, value] of Object.entries(state.values)) {
      const setByCaller = state.errors[name];
      const error = setByCaller ?? validateField(value, state.values, fieldsOptions?.[name]);
      const touched = state.touched[name] === true;
      const saved = state.saved[name] ?? null;
      const fieldDirty = !isSameValue(value, saved);

      fields[name] = {
        value,
        saved,
        error,
        // An error set with setError comes from an explicit action: shown at once.
        visibleError: setByCaller ?? (touched ? error : null),
        dirty: fieldDirty,
        touched,
      };
      dirty ||= fieldDirty;
      valid &&= error === null;
    }

    return { fields, dirty, valid };
  }, [state, fieldsOptions]);

  const field = (name: string): InputFieldProps | CheckboxFieldProps => {
    const fieldState = derived.fields[name];

    if (fieldState === undefined) throw unknownField(name);

    const { onChange, onBlur } = handlersFor(name);
    const { value, visibleError } = fieldState;
    const visible = visibleError !== null;
    const base = {
      name,
      id: fieldId(name),
      onChange,
      onBlur,
      "aria-invalid": visible,
      "aria-describedby": visible ? errorId(name) : undefined,
    };

    if (typeof value === "boolean") return { ...base, checked: value };

    const text = state.text[name];
    const format = fieldsOptions?.[name]?.format;

    return {
      ...base,
      value: text ?? (format === undefined ? displayValue(value) : format(value)),
    };
  };

  // `field` is typed per field in Form<V>; here it returns either shape.
  const form: Omit<Form<Values>, "field"> & { field: typeof field } = {
    values: state.values,
    fields: derived.fields,
    dirty: derived.dirty,
    valid: derived.valid,
    canSubmit: derived.valid && derived.dirty,
    field,
    setValue,
    setError,
    fieldId,
    errorId,
  };

  // The values are the ones `initial` was typed with, and `field` returns checkbox
  // props exactly for boolean values, as FieldProps<V[K]> says.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return form as unknown as Form<V>;
}

function apply(
  normalize: ((value: FieldValue) => FieldValue) | undefined,
  value: FieldValue,
): FieldValue {
  return normalize === undefined ? value : normalize(value);
}

function assertField(initial: Values, name: string): void {
  if (!Object.hasOwn(initial, name)) throw unknownField(name);
}

function unknownField(name: string): Error {
  return new Error(`draftform: no field "${name}" in initial values`);
}
