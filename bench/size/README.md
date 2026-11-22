# Bundle size

The same small form built with each library: a profile edit form with name, email, city and a newsletter checkbox. Name and email are required and checked, errors show after the field loses focus, the submit button is off until something changes, and after a successful save the sent values count as saved. The code is in [`entries`](./entries).

- Bundled with esbuild, minified, ESM, `NODE_ENV=production`.
- React is external: every app pays for it anyway.
- Counted: everything else the entry imports, the library's own dependencies included (formik brings parts of lodash, `deepmerge` and `react-fast-compare`; @tanstack/react-form brings `@tanstack/form-core` and `@tanstack/store`). The form component itself is counted too, so each number is a little more than the library alone.
- Validation is plain functions in every entry, no schema library.
- gzip at level 9, brotli at its default level.

Run from the repository root:

```sh
pnpm bench:size
```

It builds draftform, installs the pinned versions from `package.json` and writes [`results.md`](./results.md).

The libraries do not do the same job. The draftform entry also turns on autosave and sends only the changed fields: the other three have no autosave, and the entries for them leave it out instead of writing it by hand (`watch` or a subscription, a debounce, and one save at a time). With them, "saved" is the default values, reset to the sent values after each save. react-hook-form and @tanstack/react-form handle field arrays, nested objects and async validation, which draftform does not. The README of draftform lists these notes next to the numbers.
