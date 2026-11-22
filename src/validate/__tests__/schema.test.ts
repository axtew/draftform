import * as v from "valibot";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import type { StandardSchemaV1 } from "../../schema";
import { checkSchema } from "..";

/** A schema that reports the given issues for any value. */
function issuesSchema(issues: StandardSchemaV1.Issue[]): StandardSchemaV1 {
  return {
    "~standard": { version: 1, vendor: "test", validate: () => ({ issues }) },
  };
}

const values = { email: "", password: "" };

describe("checkSchema: issues go to fields by the first segment of the path", () => {
  it("no schema, no errors", () => {
    expect(checkSchema(undefined, values)).toEqual({ fields: {}, form: null });
  });

  it("a key, or a { key } segment; deeper segments do not matter", () => {
    const schema = issuesSchema([
      { message: "Bad email", path: ["email"] },
      { message: "Too short", path: [{ key: "password" }, 0, "deep"] },
    ]);

    expect(checkSchema(schema, values)).toEqual({
      fields: { email: "Bad email", password: "Too short" },
      form: null,
    });
  });

  it("keeps the first message of a field", () => {
    const schema = issuesSchema([
      { message: "First", path: ["email"] },
      { message: "Second", path: [{ key: "email" }] },
    ]);

    expect(checkSchema(schema, values).fields).toEqual({ email: "First" });
  });

  it("an issue without a path, or with a path that is not a field, belongs to the form", () => {
    for (const path of [undefined, [], ["nope"], [{ key: "nope" }], [0], [Symbol("email")]]) {
      const schema = issuesSchema([{ message: "Whole form", path }]);

      expect(checkSchema(schema, values)).toEqual({ fields: {}, form: "Whole form" });
    }
  });

  it("an inherited key is not a field", () => {
    const schema = issuesSchema([{ message: "Nope", path: ["toString"] }]);

    expect(checkSchema(schema, values)).toEqual({ fields: {}, form: "Nope" });
  });

  it("success, also with an empty issues list", () => {
    const empty: StandardSchemaV1 = {
      "~standard": { version: 1, vendor: "test", validate: (value) => ({ value, issues: [] }) },
    };

    expect(checkSchema(z.object({ email: z.string() }), values)).toEqual({
      fields: {},
      form: null,
    });
    expect(checkSchema(empty, values)).toEqual({ fields: {}, form: null });
  });
});

describe("checkSchema with real schemas", () => {
  it("zod: field issues, a refine with a path, a refine without one", () => {
    const schema = z
      .object({ email: z.email("Bad email"), password: z.string().min(8, "Too short") })
      .refine((data) => data.password !== data.email, {
        message: "Same as email",
        path: ["password"],
      })
      .refine((data) => data.email !== "root@example.com", "Reserved");

    expect(checkSchema(schema, { email: "a", password: "a" })).toEqual({
      fields: { email: "Bad email", password: "Too short" },
      form: null,
    });
    expect(
      checkSchema(schema, { email: "root@example.com", password: "root@example.com" }),
    ).toEqual({ fields: { password: "Same as email" }, form: "Reserved" });
  });

  it("valibot: paths of { key } segments, a forwarded check", () => {
    const schema = v.pipe(
      v.object({ password: v.pipe(v.string(), v.minLength(8, "Too short")), repeat: v.string() }),
      v.forward(
        v.partialCheck(
          [["password"], ["repeat"]],
          (data) => data.password === data.repeat,
          "Does not match",
        ),
        ["repeat"],
      ),
    );

    expect(checkSchema(schema, { password: "a", repeat: "a" })).toEqual({
      fields: { password: "Too short" },
      form: null,
    });
    expect(checkSchema(schema, { password: "long enough", repeat: "long" })).toEqual({
      fields: { repeat: "Does not match" },
      form: null,
    });
  });

  it("an async schema is an error, with what to do instead", () => {
    const schema = z.object({ email: z.string().refine(async () => true) });

    expect(() => checkSchema(schema, { email: "" })).toThrow(/only synchronous schemas/);
  });
});
