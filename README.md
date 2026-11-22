# draftform

[![CI](https://github.com/axtew/draftform/actions/workflows/ci.yml/badge.svg)](https://github.com/axtew/draftform/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/draftform)](https://www.npmjs.com/package/draftform)
[![license](https://img.shields.io/npm/l/draftform)](./LICENSE)

A small React hook for flat forms. It knows which values are saved: the submit button stays disabled until something changes, `onSubmit` gets only the changed fields, and autosave works without races.

[Live demo](https://draftform.stevvy1122.workers.dev) · [Русская версия](./README.ru.md)

```tsx
import { useForm } from "draftform";

function SettingsForm({ settings }: { settings: Settings }) {
  const form = useForm({
    initial: settings,
    fields: { name: { required: true } },
    onSubmit: (_, { changed }) => api.patch("/settings", changed),
    autosave: true,
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <input {...form.field("name")} />
      <input type="checkbox" {...form.field("notifications")} />
      <p>{form.pending ? "Saving..." : form.dirty ? "Unsaved changes" : "All changes saved"}</p>
    </form>
  );
}
```

- **Knows what is saved.** Every field has a saved value next to the current one. `dirty`, `canSubmit` and the `changed` fields come from comparing the two, and after a successful request exactly the values it sent become saved.
- **Autosave without races.** One request at a time. Edits made while it is in flight go in one more request right after it, so nothing is lost and an older request never overwrites a newer one.
- **Values keep their types.** The form's type comes from `initial`. A number field holds a number, a checkbox holds a `boolean`, and `parse`, `format` and `normalize` sit between the input and the value.
- **Errors at the right time.** Validation runs on every change, errors show after the field loses focus or after a submit. `field()` sets `aria-invalid` and `aria-describedby`, and a failed submit focuses the first field with an error.
- **Schemas without adapters.** Zod, Valibot, ArkType and others through Standard Schema, cross-field checks included.
- **Small, no dependencies.** 3.5 kB min + gzip, see [Bundle size](#bundle-size).

## Contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Fields](#fields)
- [Errors and touched](#errors-and-touched)
- [Accessibility](#accessibility)
- [Saved values and dirty](#saved-values-and-dirty)
- [Submit](#submit)
- [Reset](#reset)
- [Autosave](#autosave)
- [Schema validation](#schema-validation)
- [Custom components](#custom-components)
- [With TanStack Query](#with-tanstack-query)
- [When to use react-hook-form instead](#when-to-use-react-hook-form-instead)
- [API](#api)
- [Bundle size](#bundle-size)
- [License](#license)

## Why

draftform is based on a form hook I wrote and used in my projects. Most forms there edited something that already existed: a profile, settings, a card. Such a form has to know what is already saved. The Save button stays off until something changes, the request carries only the changed fields, and after the response the sent values count as saved.

Autosave added the harder part: the user keeps typing while a save is in flight. Those edits must not be lost, and an older request must not land after a newer one. The tests cover these timing cases, and the [demo](https://draftform.stevvy1122.workers.dev) shows them with a slow server and a request log.

The rest is what any form needs: parsing and validation per field, errors after blur, aria attributes, focus on the first error, and a schema check when the rules get bigger.

## Install

```sh
pnpm add draftform
# or: npm install draftform
```

- React 18 or newer.
- ESM only, ES2022.
- Browsers: Chrome 93, Firefox 92, Safari 15.4 (iOS 15.4) or newer. The code uses `Object.hasOwn`.
- TypeScript 5.0 or newer for the types.
- No dependencies.

## Quick start

An edit form for a profile that already exists:

```tsx
import { useForm } from "draftform";

interface Profile {
  name: string;
  email: string;
  age: number;
  newsletter: boolean;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const form = useForm({
    initial: profile,
    fields: {
      name: { required: "Enter your name", normalize: (value) => value.trim() },
      email: {
        required: true,
        validate: (value) => (value.includes("@") ? null : "Enter a valid email"),
      },
      age: { required: true, validate: (value) => (value < 18 ? "18 or older" : null) },
    },
    // Only what differs from the saved values: the body of a PATCH.
    onSubmit: (_, { changed }) => api.patch("/me", changed),
  });

  const error = (name: keyof Profile) => {
    const message = form.fields[name].visibleError;
    return message === null ? null : <p id={form.errorId(name)}>{message}</p>;
  };

  return (
    <form onSubmit={form.handleSubmit}>
      <label htmlFor={form.fieldId("name")}>Name</label>
      <input {...form.field("name")} />
      {error("name")}

      <label htmlFor={form.fieldId("email")}>Email</label>
      <input type="email" {...form.field("email")} />
      {error("email")}

      <label htmlFor={form.fieldId("age")}>Age</label>
      <input type="number" {...form.field("age")} />
      {error("age")}

      <label>
        <input type="checkbox" {...form.field("newsletter")} /> Send me the newsletter
      </label>

      {form.submitError !== null && <p role="alert">Could not save, try again.</p>}
      <button type="submit" disabled={!form.canSubmit}>
        {form.pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
```

- The form's type is `Profile`, taken from `initial`. `form.field("nmae")` does not compile.
- `field(name)` gives the input its `name`, `id`, `value` (or `checked`), `onChange`, `onBlur`, `ref` and the aria attributes.
- `canSubmit` is `true` when the form is valid, has changes and no save is running.
- `onSubmit` may return a promise. When it resolves, the values it got become saved and the button goes off again.

## Fields

Options per field go in `fields`, keyed by name. All of them are optional.

```tsx
const form = useForm({
  initial: { title: "", priceCents: 0, discount: null as number | null },
  fields: {
    title: { required: true, normalize: (value) => value.trim() },
    // Cents in the form, dollars in the input.
    priceCents: {
      parse: (input) => Math.round(Number(input) * 100),
      format: (value) => (value / 100).toFixed(2),
      validate: (value) => (value > 0 ? null : "Must be more than zero"),
    },
  },
});
```

- `parse` turns the input's text into the value. `format` turns the value into the input's text.
- `normalize` runs on every new value before it is stored and checked: trim, lower case. While the user types, the input keeps the raw text, so a space between two words is not eaten. After blur it shows the stored value.
- `required` fails for a string of spaces, `null`, `NaN` and `false`. `true` gives the message "Required", a string is the message.
- `validate(value, values)` gets the stored value (after `parse` and `normalize`) and all current values, so it can compare fields. It returns a message, or `null` / `undefined` when the value is fine. `required` goes first, so `validate` never repeats "Required".
- All checks run on every change, for every field. A rule like "repeat the password" never shows a stale result.

### Numbers and empty input

Without `parse`, a field keeps the type it started with. A number field, or any `<input type="number">`, gives a number. An empty input gives `NaN`, or `null` when the field started as `null`, like `discount` above. Both show as an empty input, and both count as empty for `required`.

When a number field should become `null` every time it is cleared, say so in `parse`:

```tsx
const form = useForm({
  initial: { age: 30 as number | null },
  fields: {
    age: { parse: (input) => (input.trim() === "" ? null : Number(input)) },
  },
});
```

### Checkboxes

A `boolean` field is a checkbox: `field()` returns `checked` instead of `value`. With `required`, the box must be checked, as with the HTML attribute.

```tsx
const form = useForm({
  initial: { terms: false },
  fields: { terms: { required: "Accept the terms to go on" } },
});

<input type="checkbox" {...form.field("terms")} />;
```

A checkbox has two states, so `boolean | null` and optional booleans are a type error. For a third state ("not answered yet"), use a radio group over a type such as `"yes" | "no" | null`.

### Radio buttons

`field(name, { radio: option })` returns the props of one radio button. Write `type="radio"` yourself. The option must fit the field's type, and each option gets its own `id`, `fieldId(name, option)`, for a label:

```tsx
type Plan = "free" | "pro" | "team";

const form = useForm({ initial: { plan: "free" as Plan } });

<fieldset>
  <legend>Plan</legend>
  {(["free", "pro", "team"] as const).map((plan) => (
    <div key={plan}>
      <input type="radio" {...form.field("plan", { radio: plan })} />
      <label htmlFor={form.fieldId("plan", plan)}>{plan}</label>
    </div>
  ))}
</fieldset>;
```

`<select>` and `<textarea>` take `field(name)` like an input.

## Errors and touched

Each field in `form.fields` has two errors:

- `error` is the current error, computed from the first render, touched or not. Prefilled data that is already wrong makes the form invalid at once.
- `visibleError` is the error to show. It is set once the field was touched (lost focus), or after a submit, which touches every field. An error from `setError` shows at once.

So a user who tabs through an empty form does not see red fields before leaving them, but `valid` and `canSubmit` are right from the start.

```tsx
const { visibleError, touched, dirty } = form.fields.email;
```

## Accessibility

- While a field's error is visible, its input has `aria-invalid="true"` and `aria-describedby` set to `errorId(name)`. Put that id on the element with the message, as in the [Quick start](#quick-start).
- `fieldId(name)` is the input's `id`, for `<label htmlFor>`. Ids come from `useId`, so two forms on a page do not clash.
- A submit of an invalid form focuses the first field with an error, in the order of `initial`. A field without an element (a custom component driven by `setValue`) or a disabled one is skipped. In a radio group the checked option gets focus, as with Tab.

## Saved values and dirty

The saved value of a field is what the server has. By default it is the initial value, so an edit form starts clean.

- A field is `dirty` when its value differs from the saved one. Typing a change and then undoing it makes the field clean again.
- The form is `dirty` when any field is.
- `onSubmit` gets `{ changed }`: only the dirty fields.
- When `onSubmit` resolves, exactly the values it got become saved. A field edited while the request was in flight keeps its new value and stays dirty, so the next save sends it.

A create form often has defaults that are real input: a title, a visibility. Without changes such a form is clean, and `submit()` would not send it. The `saved` option tells the form what is really saved:

```tsx
const form = useForm({
  initial: { title: "Untitled board", visibility: "team" },
  // Nothing exists yet: the defaults are changes, and the form can be submitted as is.
  saved: { title: "", visibility: "" },
  onSubmit: (values) => api.post("/boards", values),
});
```

## Submit

`handleSubmit` goes on `<form onSubmit>` and prevents the page reload. `submit()` is the same without an event, and returns `Promise<boolean>`:

```tsx
async function saveAndClose() {
  if (await form.submit()) navigate("/settings");
}
```

What `submit()` does:

1. Marks every field touched, so their errors show.
2. If the form is invalid, focuses the first field with an error and resolves `false`.
3. If nothing changed, resolves `false`.
4. Otherwise calls `onSubmit(values, { changed })` and resolves `true` when it succeeds.

While the request runs, `pending` is `true` and `canSubmit` is `false`. If `onSubmit` throws or rejects, `submit()` resolves `false`, the error goes to `onError` and stays in `submitError` until the next success or reset. The form stays dirty, so the user can try again. Nothing is retried by itself.

A submit while a save is in flight waits for it, then sends only what is still unsaved. A double click makes one request.

`disabled={!form.canSubmit}` keeps the button off until there is something valid to save. If you want the button always on, so that a click shows the errors and moves the focus, use `disabled={form.pending}` instead.

`onSubmit` and `onError` are read from the latest render, so they may use props and state without stale values.

## Reset

```tsx
// A Cancel button: back to the initial values.
<button type="button" onClick={() => form.reset()}>
  Cancel
</button>;

// Data that arrived after mount: it becomes both current and saved.
form.reset(user);
```

- `reset()` returns the values to `initial` and the saved values to `initial` plus the `saved` option.
- `reset(values)` makes the given values current and saved. Fields that are missing return to `initial`, keys that are not fields are ignored, so a whole server object can go in.
- Both clear `touched`, errors from `setError` and `submitError`.
- A save in flight keeps running and `pending` stays `true` until it ends, but its result no longer marks anything saved.
- Edits that autosave has not sent yet are dropped: a Cancel button must not save them. To keep them, call `await form.flush()` before `reset`.

### resetKey

A form that switches between records gets the record's id in `resetKey`:

```tsx
function UserForm({ user }: { user: User }) {
  const form = useForm({
    initial: user,
    resetKey: user.id,
    onSubmit: (_, { changed }) => api.patch(`/users/${user.id}`, changed),
    autosave: true,
  });
  // ...
}
```

When `resetKey` changes, the form resets to the `initial` and `saved` of that render, before its children render, so they never show the old record's values with the new one. Edits that autosave has not sent yet are sent at once, with the `onSubmit` of the old record: they reach the record they were made on.

`initial` is read only on mount and on a reset. A new object in `initial` with the same `resetKey` does not touch what the user is typing.

## Autosave

```tsx
const form = useForm({
  initial: settings,
  onSubmit: (_, { changed }) => api.patch("/settings", changed),
  autosave: true, // 500 ms after the last change, or { delay: 1000 }
});
```

- The form saves after the user stops editing for the delay. Each change starts the wait again.
- Only a valid, dirty form is saved. An invalid one waits for the next change, without touching fields or moving focus.
- One save at a time. Changes made while a save is in flight go in one more save right after it ends, with the latest values.
- A request in flight is never aborted. Aborting stops the wait in the browser, not the work on the server, so the old request could still finish after the new one and overwrite it. Waiting keeps the order.
- A failed save is not retried by itself: `submitError` and `onError` report it, and the next change or `flush()` tries again.
- `flush()` saves now, without the wait: before leaving the page, or as a "Save now" button. It waits for a save in flight, then sends what is still unsaved, and resolves `true` when everything is saved.
- A change still waiting when the form unmounts is saved at once.

```tsx
<p aria-live="polite">
  {form.pending ? "Saving..." : form.dirty ? "Unsaved changes" : "All changes saved"}
</p>
```

## Schema validation

Any [Standard Schema](https://standardschema.dev) works: Zod, Valibot, ArkType and others. draftform has no dependency on them, it only knows the interface.

```tsx
import { useForm } from "draftform";
import * as z from "zod";

const signUpSchema = z
  .object({
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    repeat: z.string(),
  })
  .refine((values) => values.password === values.repeat, {
    message: "The passwords do not match",
    path: ["repeat"],
  });

const form = useForm({
  initial: { email: "", password: "", repeat: "" },
  fields: { email: { required: "Enter your email" } },
  schema: signUpSchema,
  onSubmit: (values) => api.post("/sign-up", values),
});
```

The same with Valibot:

```tsx
import * as v from "valibot";

const signUpSchema = v.pipe(
  v.object({
    email: v.pipe(v.string(), v.email("Enter a valid email")),
    password: v.pipe(v.string(), v.minLength(8, "At least 8 characters")),
    repeat: v.string(),
  }),
  v.forward(
    v.partialCheck(
      [["password"], ["repeat"]],
      (input) => input.password === input.repeat,
      "The passwords do not match",
    ),
    ["repeat"],
  ),
);
```

- The schema checks the whole form on every change of a value.
- An issue belongs to the field named by the first segment of its path. The `refine` above puts its message on `repeat`.
- An issue without a path, or with a path that is not a field, goes to `form.formError`. It shows after a submit, like field errors, and makes the form invalid until then too.
- The order per field: an error from `setError`, then `required`, then `validate`, then the schema. A field shows the schema's message only when its own checks pass.
- The schema only checks. `onSubmit` gets the form's values, not the schema's output, so transforms and defaults of the schema do not apply.
- A schema of another shape is a type error: a field of another type, or no field in common with the form.
- Only synchronous schemas. A schema that answers with a promise throws an error.

A check that needs the server (is this email taken) goes in `onSubmit`, and its result goes to the field with `setError`:

```tsx
const form = useForm({
  initial: { email: "", password: "" },
  onSubmit: async (values) => {
    try {
      await api.post("/sign-up", values);
    } catch (error) {
      if (error instanceof EmailTakenError) {
        form.setError("email", "This email is already registered");
      }
      // Throw, so the form stays unsaved and the user can send it again.
      throw error;
    }
  },
});
```

## Custom components

A component that is not an input (a date picker, a color picker, a toggle) uses `values` and `setValue`:

```tsx
<ColorPicker value={form.values.color} onChange={(color) => form.setValue("color", color)} />
```

- `setValue(name, value)` takes a value or a function of the current one: `form.setValue("count", (count) => count + 1)`. Several calls in one handler all apply, in order. The field's `normalize` runs, autosave counts the change.
- `setError(name, message)` sets an error from outside, usually from the server. It shows at once and stays until the field is edited. `null` removes it.

`field()` returns a `ref` callback: the form uses it to focus the field after a failed submit. On DOM elements it works in any React version. If you spread `field()` onto your own component, React 19 passes `ref` as a prop; on React 18 wrap the component in `forwardRef`, otherwise focus on error skips that field. To keep a ref of your own, call both: `ref={(element) => { props.ref(element); myRef.current = element; }}`.

## With TanStack Query

TanStack Query loads the record and sends the request; draftform keeps the edits. `mutateAsync` returns a promise, so the form waits for it, marks the sent values saved on success, and gets the error on failure:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "draftform";

const EMPTY: Profile = { id: 0, name: "", email: "", newsletter: false };

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const mutation = useMutation({
    mutationFn: (changed: Partial<Profile>) => patchProfile(changed),
    onSuccess: (profile) => queryClient.setQueryData(["profile"], profile),
  });

  const form = useForm({
    initial: data ?? EMPTY,
    // Resets to `initial` once the data arrives, and again for another record.
    resetKey: data?.id,
    onSubmit: (_, { changed }) => mutation.mutateAsync(changed),
    autosave: true,
  });

  if (data === undefined) return <p>Loading...</p>;

  return (
    <form onSubmit={form.handleSubmit}>
      <input {...form.field("name")} />
      <input type="email" {...form.field("email")} />
      <input type="checkbox" {...form.field("newsletter")} />
    </form>
  );
}
```

`resetKey` changes from `undefined` to the id when the data arrives, and the form takes the data as its initial and saved values. A refetch, or `setQueryData` after a save, gives a new `data` object with the same id, and the form keeps what the user is typing. `id` is a field without an input here: it never changes, so it is never in `changed`.

`reset(data)` in an effect on `data` works too. It runs on every new `data`, a refetch included, and drops unsent edits each time. Rendering the form only once the data is loaded is the simplest way of all.

## When to use react-hook-form instead

draftform is for flat forms with up to a few dozen fields. Take [react-hook-form](https://react-hook-form.com) (or TanStack Form) when you need:

- **Field arrays**: a list of addresses, rows the user adds and removes.
- **Nested objects**: values like `address.city`. draftform's values are strings, numbers, booleans and `null`.
- **Hundreds of fields or heavy inputs.** draftform is controlled: every keystroke renders the form. react-hook-form keeps inputs uncontrolled and renders far less.
- **Async validation per field**, with a debounce, such as "is this username free" while typing. In draftform a server check goes in `onSubmit` with `setError`.
- **A big ecosystem**: resolvers, devtools, UI kit bindings, many answers online.

draftform fits forms that edit a record and settings pages: profile, account and card edits, with or without autosave. Small sign-in and sign-up forms work well too. With react-hook-form, "saved" values mean calling `reset(values)` after every save, and autosave means `watch`, a debounce and your own guard against parallel requests.

## API

### useForm options

| Option     | Type                                                   | Default   | What it does                                                                                                |
| ---------- | ------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------- |
| `initial`  | object of `string`, `number`, `boolean`, `null` values | required  | Starting values; the form's type comes from them. Read on mount and on every reset.                         |
| `fields`   | `{ [name]: FieldOptions }`                             | none      | `required`, `parse`, `format`, `normalize`, `validate` per field. See [Fields](#fields).                    |
| `schema`   | a Standard Schema                                      | none      | Checks the whole form on every change. Synchronous only. See [Schema validation](#schema-validation).       |
| `saved`    | `Partial<V>`                                           | `initial` | Values that count as saved, for create forms whose defaults should be sent.                                 |
| `onSubmit` | `(values: V, { changed }) => unknown`                  | none      | Saves. May return a promise; throw or reject to report a failure. Called by `submit`, `flush` and autosave. |
| `onError`  | `(error: unknown) => void`                             | none      | Gets what `onSubmit` threw.                                                                                 |
| `autosave` | `boolean` or `{ delay?: number }`                      | off       | Saves a valid, dirty form after `delay` ms without changes (500 by default). See [Autosave](#autosave).     |
| `resetKey` | `unknown`                                              | none      | When it changes (`Object.is`), the form resets. Pass the id of the record being edited.                     |

### FieldOptions

| Option      | Type                                                   | What it does                                                                   |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `required`  | `boolean` or `string`                                  | The field must not be empty. A string is the message, `true` gives "Required". |
| `parse`     | `(input: string) => T`                                 | The input's text to the value. Not called for checkboxes.                      |
| `format`    | `(value: T) => string`                                 | The value to the input's text. By default `null` and `NaN` show as empty.      |
| `normalize` | `(value: T) => T`                                      | Applied to every new value before it is stored and checked.                    |
| `validate`  | `(value: T, values: V) => string \| null \| undefined` | Returns a message, or `null` / `undefined` when the value is fine.             |

### The form

| Property                 | Type                                          | What it is                                                                                         |
| ------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `values`                 | `V`                                           | Current values. The object changes only when a value does.                                         |
| `fields`                 | `{ [name]: FieldState }`                      | State per field, below.                                                                            |
| `dirty`                  | `boolean`                                     | Some field differs from its saved value.                                                           |
| `valid`                  | `boolean`                                     | No field has an error, and no `formError`.                                                         |
| `formError`              | `string \| null`                              | The schema's error that belongs to no field. Shown after a submit.                                 |
| `canSubmit`              | `boolean`                                     | Valid, dirty and not pending.                                                                      |
| `pending`                | `boolean`                                     | A save is in flight: from `submit`, `flush` or autosave.                                           |
| `submitError`            | `unknown`                                     | What the last failed `onSubmit` threw; `null` after a success or a reset.                          |
| `field(name)`            | props                                         | Props for an input, `<select>` or `<textarea>`; `checked` instead of `value` for a boolean field.  |
| `field(name, { radio })` | props                                         | Props for one radio button of the group.                                                           |
| `setValue`               | `(name, value \| (current) => value) => void` | Sets a value from code.                                                                            |
| `setError`               | `(name, message \| null) => void`             | Sets an error from outside. Shown at once, removed by the next edit of the field.                  |
| `fieldId`                | `(name, option?) => string`                   | The input's `id`, or the `id` of one radio button.                                                 |
| `errorId`                | `(name) => string`                            | The `id` for the element with the field's error.                                                   |
| `submit`                 | `() => Promise<boolean>`                      | Touches all fields, checks, saves. `true` when the values are saved.                               |
| `handleSubmit`           | `(event?) => void`                            | `submit()` for `<form onSubmit>`, prevents the page reload.                                        |
| `flush`                  | `() => Promise<boolean>`                      | Saves now, without the autosave wait and without touching fields. `true` when everything is saved. |
| `reset`                  | `(values?: Partial<V>) => void`               | Starts over: back to `initial`, or to the given values as current and saved.                       |

### FieldState

| Property       | Type             | What it is                                                     |
| -------------- | ---------------- | -------------------------------------------------------------- |
| `value`        | `T`              | The stored value, after `parse` and `normalize`.               |
| `saved`        | `T`              | The value that counts as saved.                                |
| `error`        | `string \| null` | The current error, whether the field was touched or not.       |
| `visibleError` | `string \| null` | The error to show: after touch or submit, or from `setError`.  |
| `dirty`        | `boolean`        | The value differs from the saved one.                          |
| `touched`      | `boolean`        | The field lost focus at least once, or the form was submitted. |

The props from `field()` are `name`, `id`, `value` or `checked`, `onChange`, `onBlur`, `ref`, `aria-invalid` and `aria-describedby`.

The package also exports the types `Form`, `FormOptions`, `FieldOptions`, `FieldsOptions`, `FieldState`, `FieldValue`, `FormValues`, `FieldName`, `FieldProps`, `InputFieldProps`, `CheckboxFieldProps`, `RadioFieldProps`, `RadioOptions`, `BaseFieldProps`, `FieldElement`, `FieldRef`, `SubmitContext`, `AutosaveOptions`, `FormSchema`, `CheckValues`, `StandardSchemaV1` and `StandardTypedV1`.

## Bundle size

The same small form in each library: a profile with name, email, city and a newsletter checkbox, required fields with checks, errors after blur, a submit button that is off until something changes, and the sent values marked saved after a save. Minified with esbuild, React excluded, the libraries' dependencies and the form component itself included. Method and code: [`bench/size`](./bench/size), run with `pnpm bench:size`.

| Library              | min + gzip | Notes                                                                                                          |
| -------------------- | ---------: | -------------------------------------------------------------------------------------------------------------- |
| **draftform**        | **4.0 kB** | saved values, `changed` and autosave built in; no field arrays, nested objects or async field checks           |
| react-hook-form      |    13.1 kB | uncontrolled inputs, field arrays, resolvers, async validation; autosave by hand with `watch`                  |
| formik               |    13.7 kB | field arrays, Yup through `validationSchema`; autosave by hand                                                 |
| @tanstack/react-form |    18.0 kB | field arrays, nested values, async validation with debounce, Standard Schema; autosave by hand with a listener |

Every row includes the form component, about 0.5 kB; draftform on its own is 3.5 kB. Measured in November 2026, the versions are in [`bench/size/package.json`](./bench/size/package.json).

## License

[MIT](./LICENSE)
