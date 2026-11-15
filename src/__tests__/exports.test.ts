import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CheckboxFieldProps,
  FieldOptions,
  FieldProps,
  FieldState,
  FieldValue,
  Form,
  FormOptions,
  InputFieldProps,
  RadioFieldProps,
  SubmitContext,
} from "../index";
import * as entry from "../index";

describe("entry point", () => {
  it("exports useForm, nothing else at runtime", () => {
    expect(Object.keys(entry)).toEqual(["useForm"]);
    expect(entry.useForm).toBeTypeOf("function");
  });

  it("exports the types of options, state and field props", () => {
    expectTypeOf<FieldValue>().toEqualTypeOf<string | number | boolean | null>();
    expectTypeOf<FormOptions<{ a: string }>["initial"]>().toEqualTypeOf<{ a: string }>();
    expectTypeOf<FieldOptions<number, { a: number }>["parse"]>().toEqualTypeOf<
      ((input: string) => number) | undefined
    >();
    expectTypeOf<Form<{ a: string }>["fields"]["a"]>().toEqualTypeOf<FieldState<string>>();
    expectTypeOf<FieldProps<boolean>>().toEqualTypeOf<CheckboxFieldProps>();
    expectTypeOf<FieldProps<string | null>>().toEqualTypeOf<InputFieldProps>();
    expectTypeOf<RadioFieldProps["value"]>().toEqualTypeOf<string>();
    expectTypeOf<SubmitContext<{ a: string }>["changed"]>().toEqualTypeOf<{ a?: string }>();
  });
});
