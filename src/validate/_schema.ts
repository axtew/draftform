import type { StandardSchemaV1 } from "../schema";

/** What a schema says about the values: an error per field and one for the whole form. */
export interface SchemaErrors {
  /** The first message for each field that has an issue. */
  fields: Record<string, string>;
  /** The first message of an issue that belongs to no field: no path, or not a field's. */
  form: string | null;
}

const NO_ERRORS: SchemaErrors = { fields: {}, form: null };

/**
 * Checks `values` against `schema`. An issue belongs to the field named by the first
 * segment of its path (a key, or `{ key }`); every other issue goes to the whole form.
 * Only synchronous schemas: the form derives its errors during render.
 */
export function checkSchema(
  schema: StandardSchemaV1 | undefined,
  values: Record<string, unknown>,
): SchemaErrors {
  if (schema === undefined) return NO_ERRORS;

  const result = schema["~standard"].validate(values);

  if (result instanceof Promise) {
    throw new Error(
      "draftform: the schema validated asynchronously, only synchronous schemas are supported. " +
        "Check what needs the server in onSubmit and report it with setError.",
    );
  }

  // The spec: a falsy `issues` means success.
  if (!result.issues) return NO_ERRORS;

  const fields: Record<string, string> = {};
  let form: string | null = null;

  for (const { message, path } of result.issues) {
    const segment = path?.[0];
    const key = typeof segment === "object" ? segment.key : segment;

    if (typeof key === "string" && Object.hasOwn(values, key)) {
      fields[key] ??= message;
    } else {
      form ??= message;
    }
  }

  return { fields, form };
}
