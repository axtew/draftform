import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { save } from "../submit";
import { deriveFields } from "./_derive";
import { elementRef, type Elements, focusFirst } from "./_elements";
import { displayValue, readInput } from "./_input";
import { createState, createStore, isSameValue, startValues, type Values } from "./_state";
import type {
  CheckboxFieldProps,
  CheckValues,
  FieldElement,
  FieldRef,
  FieldValue,
  Form,
  FormOptions,
  InputFieldProps,
  RadioFieldProps,
  RadioOptions,
} from "./_types";

interface Handlers {
  onChange: (event: ChangeEvent<FieldElement>) => void;
  onBlur: () => void;
  ref: FieldRef;
  /** A change handler and a ref per radio option. */
  radios: Map<FieldValue, { onChange: () => void; ref: FieldRef }>;
}

// Layout effects warn during server rendering in React 18; there is nothing to sync there.
const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Form state for a flat form: values that keep their types, validation, `touched`,
 * `dirty` measured against the saved values, and submission that marks as saved
 * exactly what was sent.
 *
 * ```tsx
 * const form = useForm({
 *   initial: { email: "", age: 18, plan: "free", remember: false },
 *   fields: { email: { required: true, normalize: (v) => v.trim() } },
 *   onSubmit: (values, { changed }) => api.patch("/me", changed),
 *   onError: (error) => toast(String(error)),
 *   resetKey: userId,
 * });
 *
 * <form onSubmit={form.handleSubmit}>
 *   <input {...form.field("email")} />
 *   {form.fields.email.visibleError && <p id={form.errorId("email")}>{form.fields.email.visibleError}</p>}
 *   <input type="number" {...form.field("age")} />
 *   <input type="radio" {...form.field("plan", { radio: "pro" })} />
 *   <input type="checkbox" {...form.field("remember")} />
 *   <button disabled={!form.canSubmit}>Save</button>
 * </form>
 * ```
 *
 * `initial` is read on mount and on reset; `fields` and the handlers are read on every
 * render, so they may depend on props.
 */
export function useForm<V>(options: FormOptions<V> & CheckValues<V>): Form<V> {
  // The form's type lives in the public signature; inside, values are plain records.
  // `CheckValues` has already rejected anything that is not a field value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const untyped = options as unknown as FormOptions<Values>;

  const [state, setState] = useState(() => createState(untyped.initial, untyped.saved));
  const [store] = useState(() => createStore(state, setState));
  const { dispatch } = store;

  // A new key resets during render, as React recommends for adjusting state to a prop:
  // the children never render the old record's values with the new key.
  const [resetKey, setResetKey] = useState(untyped.resetKey);
  if (!Object.is(resetKey, untyped.resetKey)) {
    setResetKey(untyped.resetKey);
    dispatch({ type: "reset", ...startValues(untyped.initial, untyped.saved) });
  }

  // Handlers made once read the options of the latest render: parsers may close over props.
  const optionsRef = useRef(untyped);
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = untyped;
  });

  const baseId = useId();
  const fieldId = useCallback(
    (name: string, option?: FieldValue) =>
      `${baseId}-f-${encodeURIComponent(name)}` +
      (option === undefined ? "" : `-${encodeURIComponent(String(option))}`),
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
    [dispatch],
  );

  const setError = useCallback(
    (name: string, error: string | null) => {
      assertField(optionsRef.current.initial, name);
      dispatch({ type: "error", name, error });
    },
    [dispatch],
  );

  const [elements] = useState<Elements>(() => new Map());

  const submit = useCallback(async (): Promise<boolean> => {
    if (store.current.pending) return false;

    dispatch({ type: "touchAll" });

    const { values, saved, touched, errors } = store.current;
    const derived = deriveFields(values, saved, touched, errors, optionsRef.current.fields);

    if (!derived.valid) {
      focusFirst(
        Object.keys(values),
        (name) => (derived.fields[name]?.error ?? null) !== null,
        elements,
      );
      return false;
    }

    // An edit form does not resend unchanged data; the `saved` option covers create forms.
    if (!derived.dirty) return false;

    return save(store, () => optionsRef.current, values);
  }, [store, dispatch, elements]);

  const handleSubmit = useCallback(
    (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      void submit();
    },
    [submit],
  );

  const reset = useCallback(
    (values?: Partial<Values>) => {
      const { initial, saved } = optionsRef.current;
      dispatch({ type: "reset", ...startValues(initial, saved, values) });
    },
    [dispatch],
  );

  // One set of handlers per field (and per radio option) for the hook's lifetime:
  // spreading `field()` on every render does not hand inputs new functions.
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
        ref: elementRef(elements, name),
        radios: new Map(),
      };
      handlersCache.set(name, handlers);
    }

    return handlers;
  };

  const radioFor = (name: string, handlers: Handlers, option: FieldValue) => {
    let radio = handlers.radios.get(option);

    if (radio === undefined) {
      radio = {
        // The option is the value: no parsing of the input's text.
        onChange: () => setValue(name, option),
        ref: elementRef(elements, name),
      };
      handlers.radios.set(option, radio);
    }

    return radio;
  };

  const fieldsOptions = untyped.fields;
  const { values, saved, touched, errors } = state;
  const derived = useMemo(
    () => deriveFields(values, saved, touched, errors, fieldsOptions),
    [values, saved, touched, errors, fieldsOptions],
  );

  const field = (
    name: string,
    config?: RadioOptions<FieldValue>,
  ): InputFieldProps | CheckboxFieldProps | RadioFieldProps => {
    const fieldState = derived.fields[name];

    if (fieldState === undefined) throw unknownField(name);

    const handlers = handlersFor(name);
    const { value, visibleError } = fieldState;
    const visible = visibleError !== null;
    const format = fieldsOptions?.[name]?.format;
    const base = {
      name,
      id: fieldId(name),
      onChange: handlers.onChange,
      onBlur: handlers.onBlur,
      ref: handlers.ref,
      "aria-invalid": visible,
      "aria-describedby": visible ? errorId(name) : undefined,
    };

    if (config !== undefined) {
      const { radio: option } = config;
      const radio = radioFor(name, handlers, option);

      return {
        ...base,
        id: fieldId(name, option),
        onChange: radio.onChange,
        ref: radio.ref,
        value: format === undefined ? String(displayValue(option)) : format(option),
        checked: isSameValue(value, option),
      };
    }

    if (typeof value === "boolean") return { ...base, checked: value };

    const text = state.text[name];

    return {
      ...base,
      value: text ?? (format === undefined ? displayValue(value) : format(value)),
    };
  };

  // `field` is typed per field in Form<V>; here it returns either shape.
  const form: Omit<Form<Values>, "field"> & { field: typeof field } = {
    values,
    fields: derived.fields,
    dirty: derived.dirty,
    valid: derived.valid,
    canSubmit: derived.valid && derived.dirty && !state.pending,
    pending: state.pending,
    submitError: state.submitError,
    field,
    setValue,
    setError,
    fieldId,
    errorId,
    submit,
    handleSubmit,
    reset,
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
