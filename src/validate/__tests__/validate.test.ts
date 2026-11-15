import { describe, expect, it } from "vitest";

import { isEmpty, REQUIRED_MESSAGE, validateField } from "..";

describe("isEmpty", () => {
  it("empty: whitespace-only strings, null, NaN, false", () => {
    for (const value of ["", "  ", "\n\t", null, Number.NaN, false]) {
      expect(isEmpty(value)).toBe(true);
    }
  });

  it("not empty: text, zero, true", () => {
    for (const value of ["a", " a ", 0, -1, true]) {
      expect(isEmpty(value)).toBe(false);
    }
  });
});

describe("validateField", () => {
  const values = { a: "", b: "x" };

  it("no options, no error", () => {
    expect(validateField("", values, undefined)).toBeNull();
  });

  it("required gives the default or the given message", () => {
    expect(validateField("", values, { required: true })).toBe(REQUIRED_MESSAGE);
    expect(validateField("", values, { required: "Fill me" })).toBe("Fill me");
    expect(validateField("", values, { required: false })).toBeNull();
  });

  it("required goes first, the validator runs for filled or optional values", () => {
    const calls: string[] = [];
    const validate = (value: string) => {
      calls.push(value);
      return null;
    };

    expect(validateField("", values, { required: true, validate })).toBe(REQUIRED_MESSAGE);
    expect(calls).toEqual([]);

    validateField("", values, { validate });
    validateField("y", values, { required: true, validate });
    expect(calls).toEqual(["", "y"]);
  });

  it("the validator gets all values; undefined and an empty message mean no error", () => {
    expect(
      validateField("x", values, { validate: (value, all) => (value === all.b ? "Same" : null) }),
    ).toBe("Same");
    expect(validateField("x", values, { validate: () => undefined })).toBeNull();
    expect(validateField("x", values, { validate: () => "" })).toBeNull();
  });
});
