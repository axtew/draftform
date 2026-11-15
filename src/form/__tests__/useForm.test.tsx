import { act, cleanup, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useForm } from "../..";
import { renderForm } from "./_helpers";

afterEach(cleanup);

describe("the validator sees the stored value (old bug: it got the raw one)", () => {
  it("validates the normalized value, not the typed text", async () => {
    const seen: string[] = [];
    const { form } = renderForm(
      {
        initial: { email: "" },
        fields: {
          email: {
            normalize: (value) => value.trim(),
            validate: (value) => {
              seen.push(value);
              return value.includes(" ") ? "No spaces" : null;
            },
          },
        },
      },
      ({ field }) => <input aria-label="Email" {...field("email")} />,
    );

    await userEvent.type(screen.getByLabelText("Email"), " a@b.c ");

    expect(form.current.values.email).toBe("a@b.c");
    expect(form.current.fields.email.error).toBeNull();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === value.trim())).toBe(true);
  });

  it("keeps the typed text in the input until blur, then shows the stored value", async () => {
    renderForm(
      { initial: { name: "" }, fields: { name: { normalize: (value) => value.trim() } } },
      ({ field }) => <input aria-label="Name" {...field("name")} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Name");

    await userEvent.type(input, " John Smith ");
    expect(input.value).toBe(" John Smith ");

    await userEvent.tab();
    expect(input.value).toBe("John Smith");
  });
});

describe("dirty has one source: value against saved (old bug: two flags drifted)", () => {
  it("is dirty while the value differs and clean when it returns", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" } }));

    act(() => result.current.setValue("name", "Bob"));
    expect(result.current.fields.name.dirty).toBe(true);
    expect(result.current.dirty).toBe(true);

    act(() => result.current.setValue("name", "Ann"));
    expect(result.current.fields.name.dirty).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it("setting an error does not change dirty", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "Ann", email: "" } }));

    act(() => result.current.setValue("name", "Bob"));
    act(() => result.current.setError("name", "Taken"));
    act(() => result.current.setError("email", "Taken"));

    expect(result.current.fields.name.dirty).toBe(true);
    expect(result.current.fields.email.dirty).toBe(false);
    expect(result.current.dirty).toBe(true);
  });

  it("treats NaN as equal to NaN", () => {
    const { result } = renderHook(() => useForm({ initial: { age: Number.NaN } }));

    act(() => result.current.setValue("age", Number.NaN));
    expect(result.current.dirty).toBe(false);
  });
});

describe("checkboxes and number inputs keep the field's type (old bug: a string got in)", () => {
  it("a checkbox gives checked, not its value attribute", async () => {
    const { form } = renderForm({ initial: { remember: false } }, ({ field }) => (
      <input type="checkbox" aria-label="Remember" {...field("remember")} />
    ));

    await userEvent.click(screen.getByLabelText("Remember"));
    expect(form.current.values.remember).toBe(true);

    await userEvent.click(screen.getByLabelText("Remember"));
    expect(form.current.values.remember).toBe(false);
  });

  it("a number input gives a number", async () => {
    const { form } = renderForm({ initial: { age: 0 } }, ({ field }) => (
      <input type="number" aria-label="Age" {...field("age")} />
    ));

    await userEvent.clear(screen.getByLabelText("Age"));
    await userEvent.type(screen.getByLabelText("Age"), "42");

    expect(form.current.values.age).toBe(42);
  });
});

describe("validation works for numbers and booleans (old bug: strings only)", () => {
  it("validate gets a number", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { age: 10 },
        fields: { age: { validate: (age) => (age >= 18 ? null : "Too young") } },
      }),
    );

    expect(result.current.fields.age.error).toBe("Too young");

    act(() => result.current.setValue("age", 18));
    expect(result.current.fields.age.error).toBeNull();
  });

  it("required treats NaN and null as empty, 0 as a value", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { age: Number.NaN, height: null as number | null },
        fields: { age: { required: true }, height: { required: "Enter height" } },
      }),
    );

    expect(result.current.fields.age.error).toBe("Required");
    expect(result.current.fields.height.error).toBe("Enter height");

    act(() => {
      result.current.setValue("age", 0);
      result.current.setValue("height", 0);
    });
    expect(result.current.valid).toBe(true);
  });

  it("required on a boolean means checked, as the HTML attribute does", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { terms: false },
        fields: { terms: { required: "Accept the terms" } },
      }),
    );

    expect(result.current.fields.terms.error).toBe("Accept the terms");

    act(() => result.current.setValue("terms", true));
    expect(result.current.fields.terms.error).toBeNull();
  });

  it("validate gets a boolean", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { remember: true },
        fields: { remember: { validate: (remember) => (remember ? "Not allowed" : null) } },
      }),
    );

    expect(result.current.fields.remember.error).toBe("Not allowed");
  });
});

describe("a prefilled invalid value makes the form invalid (old bug: valid until touched)", () => {
  it("computes errors from the first render, without showing them", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { email: "not-an-email" },
        fields: { email: { validate: (v) => (v.includes("@") ? null : "Invalid email") } },
      }),
    );

    expect(result.current.fields.email.error).toBe("Invalid email");
    expect(result.current.fields.email.visibleError).toBeNull();
    expect(result.current.valid).toBe(false);
    expect(result.current.canSubmit).toBe(false);
  });
});

describe("required fails on whitespace only (old bug: spaces passed)", () => {
  it("treats a whitespace-only string as empty", () => {
    const { result } = renderHook(() =>
      useForm({ initial: { name: "   " }, fields: { name: { required: true } } }),
    );

    expect(result.current.fields.name.error).toBe("Required");

    act(() => result.current.setValue("name", " x "));
    expect(result.current.fields.name.error).toBeNull();
  });
});

describe("several updates in one handler all apply (old bug: compared with a stale ref)", () => {
  it("two setValue calls on different fields", () => {
    const { result } = renderHook(() => useForm({ initial: { first: "", last: "" } }));

    act(() => {
      result.current.setValue("first", "Ann");
      result.current.setValue("last", "Lee");
    });

    expect(result.current.values).toEqual({ first: "Ann", last: "Lee" });
  });

  it("a value and back in one handler leaves the form clean", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" } }));

    act(() => {
      result.current.setValue("name", "Bob");
      result.current.setValue("name", "Ann");
    });

    expect(result.current.dirty).toBe(false);
  });

  it("updaters see the latest value", () => {
    const { result } = renderHook(() => useForm({ initial: { count: 0 } }));

    act(() => {
      result.current.setValue("count", (count) => count + 1);
      result.current.setValue("count", (count) => count + 1);
    });

    expect(result.current.values.count).toBe(2);
  });

  it("updaters apply once under StrictMode, which runs reducers twice", () => {
    const { result } = renderHook(() => useForm({ initial: { count: 0 } }), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.setValue("count", (count) => count + 1);
      result.current.setValue("count", (count) => count + 1);
    });

    expect(result.current.values.count).toBe(2);
  });

  it("setValue applies normalize", () => {
    const { result } = renderHook(() =>
      useForm({ initial: { email: "" }, fields: { email: { normalize: (v) => v.toLowerCase() } } }),
    );

    act(() => result.current.setValue("email", "A@B.C"));
    expect(result.current.values.email).toBe("a@b.c");
  });
});

describe("cross-field validation", () => {
  it("re-runs when the other field changes", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { password: "secret", repeat: "secret" },
        fields: {
          repeat: { validate: (v, values) => (v === values.password ? null : "Does not match") },
        },
      }),
    );

    expect(result.current.fields.repeat.error).toBeNull();

    act(() => result.current.setValue("password", "secret2"));
    expect(result.current.fields.repeat.error).toBe("Does not match");

    act(() => result.current.setValue("repeat", "secret2"));
    expect(result.current.fields.repeat.error).toBeNull();
  });

  it("uses the validators of the latest render", () => {
    const { result, rerender } = renderHook(
      ({ min }) =>
        useForm({
          initial: { age: 16 },
          fields: { age: { validate: (age) => (age >= min ? null : "Too young") } },
        }),
      { initialProps: { min: 18 } },
    );

    expect(result.current.valid).toBe(false);

    rerender({ min: 16 });
    expect(result.current.valid).toBe(true);
  });
});

describe("saved values", () => {
  it("default to initial: the form starts clean", () => {
    const { result } = renderHook(() => useForm({ initial: { title: "Untitled" } }));

    expect(result.current.fields.title.saved).toBe("Untitled");
    expect(result.current.dirty).toBe(false);
    expect(result.current.canSubmit).toBe(false);
  });

  it("the saved option makes a field dirty from the first render", () => {
    const { result } = renderHook(() =>
      useForm({ initial: { title: "Untitled", body: "" }, saved: { title: "" } }),
    );

    expect(result.current.fields.title.saved).toBe("");
    expect(result.current.fields.title.dirty).toBe(true);
    expect(result.current.fields.body.dirty).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });
});

describe("setError", () => {
  it("is visible at once, makes the form invalid and does not touch the field", () => {
    const { result } = renderHook(() => useForm({ initial: { email: "a@b.c" } }));

    act(() => result.current.setError("email", "Already taken"));

    expect(result.current.fields.email.error).toBe("Already taken");
    expect(result.current.fields.email.visibleError).toBe("Already taken");
    expect(result.current.fields.email.touched).toBe(false);
    expect(result.current.valid).toBe(false);
  });

  it("is cleared by the next edit of that field only", () => {
    const { result } = renderHook(() => useForm({ initial: { email: "", name: "" } }));

    act(() => result.current.setError("email", "Already taken"));
    act(() => result.current.setValue("name", "Ann"));
    expect(result.current.fields.email.error).toBe("Already taken");

    act(() => result.current.setValue("email", "c@d.e"));
    expect(result.current.fields.email.error).toBeNull();
  });

  it("wins over the validator while set, null removes it", () => {
    const { result } = renderHook(() =>
      useForm({ initial: { email: "" }, fields: { email: { required: true } } }),
    );

    act(() => result.current.setError("email", "Server says no"));
    expect(result.current.fields.email.error).toBe("Server says no");

    act(() => result.current.setError("email", null));
    expect(result.current.fields.email.error).toBe("Required");
    expect(result.current.fields.email.visibleError).toBeNull();
  });
});

describe("render cost", () => {
  it("field() hands out the same handlers on every render", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "" } }));
    const before = result.current.field("name");

    act(() => result.current.setValue("name", "Ann"));
    const after = result.current.field("name");

    expect(after.onChange).toBe(before.onChange);
    expect(after.onBlur).toBe(before.onBlur);
    expect(after.value).toBe("Ann");
  });

  it("setValue, setError and the values object are stable when nothing changes", () => {
    const { result, rerender } = renderHook(() => useForm({ initial: { name: "" } }));
    const { setValue, setError, values } = result.current;

    rerender();
    act(() => result.current.setValue("name", ""));

    expect(result.current.setValue).toBe(setValue);
    expect(result.current.setError).toBe(setError);
    expect(result.current.values).toBe(values);
  });
});

describe("unknown fields", () => {
  it("throws for a name that is not in initial", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "" } }));
    // @ts-expect-error: not a field of this form
    expect(() => result.current.field("nope")).toThrow('no field "nope"');
    // @ts-expect-error: not a field of this form
    expect(() => result.current.setValue("nope", "")).toThrow('no field "nope"');
  });
});
