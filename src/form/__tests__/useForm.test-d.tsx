import { describe, expectTypeOf, test } from "vitest";

import {
  type CheckboxFieldProps,
  type FieldRef,
  type FieldState,
  type Form,
  type InputFieldProps,
  type RadioFieldProps,
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
declare const mutateAsync: (body: Partial<{ title: string }>) => Promise<{ id: number }>;

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

describe("submission", () => {
  test("onSubmit gets the values and the changed fields as a Partial", () => {
    useForm({
      initial: { email: "", age: 0, remember: false },
      onSubmit: (values, { changed }) => {
        expectTypeOf(values).toEqualTypeOf<{ email: string; age: number; remember: boolean }>();
        expectTypeOf(changed).toEqualTypeOf<
          Partial<{ email: string; age: number; remember: boolean }>
        >();
      },
      onError: (error) => {
        expectTypeOf(error).toEqualTypeOf<unknown>();
      },
      resetKey: "record-1",
    });
  });

  test("onSubmit may be sync or async and return anything, like mutateAsync", () => {
    useForm({ initial: { title: "" }, onSubmit: (_, { changed }) => mutateAsync(changed) });
    useForm({ initial: { title: "" }, onSubmit: () => {} });
  });

  test("values in onSubmit keep the field types", () => {
    useForm({
      initial: { title: "" },
      onSubmit: (values) => {
        // @ts-expect-error: title is a string
        const pages: number = values.title;
        return pages;
      },
    });
  });

  test("submit, handleSubmit, reset and the flags", () => {
    const form = useForm({ initial: { title: "", pages: 0 } });

    expectTypeOf(form.submit).toEqualTypeOf<() => Promise<boolean>>();
    expectTypeOf(form.pending).toEqualTypeOf<boolean>();
    expectTypeOf(form.submitError).toEqualTypeOf<unknown>();
    form.reset();
    form.reset({ title: "From server" });
    // @ts-expect-error: pages is a number
    form.reset({ pages: "1" });
    // @ts-expect-error: no such field in a literal
    form.reset({ nope: 1 });

    void (<form onSubmit={form.handleSubmit} />);
  });
});

describe("radio buttons", () => {
  type Plan = "free" | "pro";
  const initial: { plan: Plan; seats: number; size: string | null; remember: boolean } = {
    plan: "free",
    seats: 1,
    size: null,
    remember: false,
  };
  const form = useForm({ initial });

  test("give radio props for an option of the field's type", () => {
    expectTypeOf(form.field("plan", { radio: "pro" })).toEqualTypeOf<RadioFieldProps>();
    form.field("seats", { radio: 5 });
    form.field("size", { radio: null });
    form.field("size", { radio: "m" });
    form.field("remember", { radio: true });
    void (<input type="radio" {...form.field("plan", { radio: "pro" })} />);
  });

  test("an option outside the field's type is an error", () => {
    // @ts-expect-error: not a plan
    form.field("plan", { radio: "team" });
    // @ts-expect-error: seats is a number
    form.field("seats", { radio: "5" });
    // @ts-expect-error: no such field
    form.field("nope", { radio: "x" });
  });

  test("fieldId takes the option too", () => {
    expectTypeOf(form.fieldId("plan", "pro")).toEqualTypeOf<string>();
    // @ts-expect-error: not a plan
    form.fieldId("plan", "team");
  });
});

describe("the ref from field() fits the elements and merges with your own", () => {
  test("a callback that takes the element", () => {
    const form = useForm({ initial: { email: "" } });
    const props = form.field("email");
    const own: { current: HTMLInputElement | null } = { current: null };

    expectTypeOf(props.ref).toEqualTypeOf<FieldRef>();
    void (
      <input
        {...props}
        ref={(element) => {
          props.ref(element);
          own.current = element;
        }}
      />
    );
  });
});
