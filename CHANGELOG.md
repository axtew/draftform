# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com), versions follow [semver](https://semver.org). While the version is 0.x, a minor release may change the API.

## 0.1.0 - 2026-11-22

The first release.

- `useForm` for flat forms: the form's type is inferred from `initial`; values are strings, numbers, booleans and `null`.
- `field(name)` gives an input its value or `checked`, handlers, `id`, `ref` and the aria attributes; `field(name, { radio })` does the same for a radio button.
- Per field: `parse`, `format`, `normalize`, `required` (spaces, `null`, `NaN` and `false` are empty) and `validate(value, values)`. Number fields keep numbers, a checkbox is `boolean` only.
- Errors are computed on every change and shown after blur or a submit (`visibleError`); `setError` for errors from the server.
- Accessibility: `aria-invalid` and `aria-describedby` while an error shows, focus on the first field with an error after a failed submit.
- Saved values: `dirty` against what is saved, `changed` fields in `onSubmit`, the `saved` option for create forms; after a success exactly the sent values become saved.
- Submit: `submit()` resolves `true` when saved, `handleSubmit`, `pending`, `canSubmit`, `submitError` and `onError`; a submit during a save waits for it.
- Reset: `reset()`, `reset(values)` for data loaded after mount, and `resetKey` to switch records; unsent autosave edits go to the record they were made on.
- Autosave with a debounce: only a valid, dirty form, one save at a time and one follow-up with the latest values, no abort, no automatic retry; `flush()` saves now, and a pending edit is saved on unmount.
- Schema validation with any synchronous Standard Schema (Zod, Valibot, ArkType), no dependency on them; issues go to fields by path, the rest to `formError`.
- ESM, ES2022, React 18 or newer, TypeScript 5.0 or newer.
