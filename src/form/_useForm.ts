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

import { createSaveQueue } from "../submit";
import { deriveFields } from "./_derive";
import { elementRef, type Elements, focusFirst } from "./_elements";
import { displayValue, readInput } from "./_input";
import {
  createState,
  createStore,
  type FormAction,
  formReducer,
  isSameValue,
  startValues,
  type Values,
} from "./_state";
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
 *   autosave: true,
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

  const [state, setState] = useState(() =>
    createState(untyped.initial, untyped.saved, untyped.resetKey),
  );
  const [store] = useState(() => createStore(state, setState));
  const { dispatch } = store;

  // Handlers made once read the options of the latest committed render: parsers and
  // `onSubmit` may close over props.
  const optionsRef = useRef(untyped);
  // The queue calls the getter from handlers, timers and effects, never during render.
  // oxlint-disable-next-line react/refs
  const [queue] = useState(() => createSaveQueue(store, () => optionsRef.current));

  // A new key resets the form. This render already shows the reset state, so children
  // never render the old record's values with the new key. The store resets only when
  // the render commits: React may throw a render away (a transition that suspends or
  // is interrupted, the extra render of StrictMode), and the store would stay reset
  // while the screen shows the old record.
  const current = Object.is(state.key, untyped.resetKey)
    ? state
    : formReducer(state, resetTo(untyped));

  useIsomorphicLayoutEffect(() => {
    const previous = optionsRef.current;
    optionsRef.current = untyped;

    if (!Object.is(store.current.key, untyped.resetKey)) {
      // Changes autosave has not sent yet belong to the old record: they go out with
      // its handlers, never with the new record's `onSubmit`.
      queue.leave(previous);
      dispatch(resetTo(untyped));
    }
  });

  useEffect(() => {
    queue.mount();
    return queue.unmount;
  }, [queue]);

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

  /** A change of a value: autosave waits for quiet again. */
  const change = useCallback(
    (action: FormAction) => {
      const before = store.current.values;
      dispatch(action);

      if (store.current.values !== before) queue.changed();
    },
    [store, dispatch, queue],
  );

  const setValue = useCallback(
    (name: string, next: FieldValue | ((value: FieldValue) => FieldValue)) => {
      const { initial, fields } = optionsRef.current;
      assertField(initial, name);

      const normalize = fields?.[name]?.normalize;

      change({
        type: "change",
        name,
        update: (value) => apply(normalize, typeof next === "function" ? next(value) : next),
        text: undefined,
      });
    },
    [change],
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
    // A save in flight may still leave something unsaved: `saveNow` waits and checks.
    if (!derived.dirty && !queue.busy()) return false;

    return queue.saveNow();
  }, [store, dispatch, elements, queue]);

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

      // Starting over drops what autosave has not sent: a Cancel button must not save,
      // and data loaded from the server must not be overwritten by edits made before it.
      queue.drop();
      dispatch({ type: "reset", key: store.current.key, ...startValues(initial, saved, values) });
    },
    [store, dispatch, queue],
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

          change({
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
  const { values, saved, touched, errors } = current;
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

    const text = current.text[name];

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
    canSubmit: derived.valid && derived.dirty && !current.pending,
    pending: current.pending,
    submitError: current.submitError,
    field,
    setValue,
    setError,
    fieldId,
    errorId,
    submit,
    handleSubmit,
    flush: queue.saveNow,
    reset,
  };

  // The values are the ones `initial` was typed with, and `field` returns checkbox
  // props exactly for boolean values, as FieldProps<V[K]> says.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return form as unknown as Form<V>;
}

/** The reset a `resetKey` change makes: back to `initial` and the `saved` option. */
function resetTo(options: FormOptions<Values>): FormAction {
  return { type: "reset", key: options.resetKey, ...startValues(options.initial, options.saved) };
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
