import { describe, expectTypeOf, test } from "vitest";

import {
  type CheckboxFieldProps,
  type FieldState,
  type Form,
  type InputFieldProps,
  useForm,
} from "../..";

interface Profile {
  name: string;
  age: number;
  phone: string | null;
  height: number | null;
  newsletter: boolean;
}

declare const profile: Profile;

describe("the form type is inferred from initial", () => {
  test("literals widen to the field types", () => {
    const form = useForm({ initial: { email: "", age: 0, remember: false } });

    expectTypeOf(form).toEqualTypeOf<Form<{ email: string; age: number; remember: boolean }>>();
    expectTypeOf(form.values).toEqualTypeOf<{ email: string; age: number; remember: boolean }>();
    expectTypeOf(form.fields.age).toEqualTypeOf<FieldState<number>>();
  });

  test("an interface fits as is, nullable fields included", () => {
    const form = useForm({ initial: profile });

    expectTypeOf(form.values).toEqualTypeOf<Profile>();
    expectTypeOf(form.fields.phone.value).toEqualTypeOf<string | null>();
    expectTypeOf(form.fields.height.saved).toEqualTypeOf<number | null>();
  });

  test("values outside the field types are rejected", () => {
    // @ts-expect-error: arrays are not field values
    useForm({ initial: { tags: ["a"] } });
    // @ts-expect-error: nor are nested objects
    useForm({ initial: { address: { city: "" } } });
  });
});

describe("fields", () => {
  test("options are typed by the field", () => {
    useForm({
      initial: { email: "", password: "", repeat: "", age: 0 },
      fields: {
        email: {
          required: "Enter your email",
          normalize: (value) => {
            expectTypeOf(value).toEqualTypeOf<string>();
            return value.trim();
          },
          validate: (value) => (value.includes("@") ? null : "Invalid email"),
        },
        repeat: {
          validate: (value, values) => {
            expectTypeOf(values).toEqualTypeOf<{
              email: string;
              password: string;
              repeat: string;
              age: number;
            }>();
            return value === values.password ? null : "Does not match";
          },
        },
        age: {
          parse: Number,
          format: (value) => {
            expectTypeOf(value).toEqualTypeOf<number>();
            return value.toFixed(0);
          },
        },
      },
    });
  });

  test("parse must return the field's type", () => {
    useForm({
      initial: { age: 0 },
      // @ts-expect-error: a string for a number field
      fields: { age: { parse: (input: string) => input } },
    });
    useForm({
      initial: { height: null as number | null },
      fields: { height: { parse: (input) => (input === "" ? null : Number(input)) } },
    });
  });

  test("an unknown field name is an error", () => {
    useForm({
      initial: { email: "" },
      // @ts-expect-error: no such field
      fields: { nope: { required: true } },
    });
    useForm({
      initial: { email: "" },
      // @ts-expect-error: no such field
      saved: { nope: "" },
    });
  });

  test("saved values are typed by the field", () => {
    useForm({ initial: { title: "Untitled" }, saved: { title: "" } });
    // @ts-expect-error: a number for a string field
    useForm({ initial: { title: "Untitled" }, saved: { title: 1 } });
  });
});

describe("the form API", () => {
  const form = useForm({ initial: { email: "", age: 0, remember: false } });

  test("field() gives checkbox props for boolean fields, input props otherwise", () => {
    expectTypeOf(form.field("email")).toEqualTypeOf<InputFieldProps>();
    expectTypeOf(form.field("age")).toEqualTypeOf<InputFieldProps>();
    expectTypeOf(form.field("remember")).toEqualTypeOf<CheckboxFieldProps>();
    // @ts-expect-error: no such field
    form.field("nope");
  });

  test("setValue takes the field's type or an updater", () => {
    form.setValue("email", "a@b.c");
    form.setValue("age", (age) => age + 1);
    // @ts-expect-error: a number for a string field
    form.setValue("email", 5);
    // @ts-expect-error: the updater must return the field's type
    form.setValue("age", (age) => String(age));
    // @ts-expect-error: no such field
    form.setValue("nope", "");
  });

  test("setError, fieldId and errorId know the field names", () => {
    form.setError("email", "Taken");
    form.setError("email", null);
    expectTypeOf(form.errorId("email")).toEqualTypeOf<string>();
    // @ts-expect-error: no such field
    form.setError("nope", "x");
    // @ts-expect-error: no such field
    form.errorId("nope");
  });

  test("the flags are booleans", () => {
    expectTypeOf(form.dirty).toEqualTypeOf<boolean>();
    expectTypeOf(form.valid).toEqualTypeOf<boolean>();
    expectTypeOf(form.canSubmit).toEqualTypeOf<boolean>();
  });
});

describe("field props fit the elements", () => {
  test("inputs, selects, textareas and checkboxes", () => {
    const form = useForm({ initial: { email: "", role: "user", bio: "", remember: false } });

    void (
      <form>
        <input {...form.field("email")} />
        <select {...form.field("role")} />
        <textarea {...form.field("bio")} />
        <input type="checkbox" {...form.field("remember")} />
      </form>
    );
  });
});
