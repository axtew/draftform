import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { type FieldState, type FormOptions, type StandardSchemaV1, useForm } from "../..";
import { renderForm } from "./_helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface SignUpValues {
  email: string;
  password: string;
  repeat: string;
}

const signUpFields = z.object({
  email: z.email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
  repeat: z.string(),
});

const signUpSchema = signUpFields.refine((data) => data.password === data.repeat, {
  message: "Passwords do not match",
  path: ["repeat"],
});

function SignUp(props: Partial<FormOptions<SignUpValues>>) {
  const form = useForm({
    initial: { email: "", password: "", repeat: "" },
    schema: signUpSchema,
    ...props,
  });

  const row = (name: keyof SignUpValues, { visibleError }: FieldState<string>) => (
    <div>
      <input aria-label={name} {...form.field(name)} />
      {visibleError !== null && <p id={form.errorId(name)}>{visibleError}</p>}
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit}>
      {row("email", form.fields.email)}
      {row("password", form.fields.password)}
      {row("repeat", form.fields.repeat)}
      {form.formError !== null && <p role="alert">{form.formError}</p>}
      <button type="submit">Sign up</button>
    </form>
  );
}

describe("schema issues become field errors", () => {
  it("by the path, shown once the field is touched, like other errors", () => {
    const { form } = renderForm(
      { initial: { email: "", password: "" }, schema: signUpFields.omit({ repeat: true }) },
      ({ field }) => (
        <>
          <input aria-label="Email" {...field("email")} />
          <input aria-label="Password" {...field("password")} />
        </>
      ),
    );

    expect(form.current.fields.email).toMatchObject({
      error: "Invalid email",
      visibleError: null,
    });
    expect(form.current.fields.password.error).toBe("At least 8 characters");
    expect(form.current.valid).toBe(false);

    fireEvent.blur(screen.getByLabelText("Email"));
    expect(form.current.fields.email.visibleError).toBe("Invalid email");
    expect(form.current.fields.password.visibleError).toBeNull();

    act(() => form.current.setValue("email", "ann@example.com"));
    act(() => form.current.setValue("password", "long enough"));
    expect(form.current.fields.email.error).toBeNull();
    expect(form.current.valid).toBe(true);
  });

  it("a cross-field refine follows both fields, with aria-describedby on the field", async () => {
    render(<SignUp />);
    const repeat = screen.getByLabelText("repeat");

    await userEvent.type(screen.getByLabelText("password"), "secret-one");
    await userEvent.type(repeat, "secret-two");
    await userEvent.tab();

    expect(screen.getByText("Passwords do not match").id).toBe(
      repeat.getAttribute("aria-describedby"),
    );
    expect(repeat.getAttribute("aria-invalid")).toBe("true");

    // Fixed from the other field.
    await userEvent.clear(screen.getByLabelText("password"));
    await userEvent.type(screen.getByLabelText("password"), "secret-two");

    expect(screen.queryByText("Passwords do not match")).toBeNull();
    expect(repeat.getAttribute("aria-invalid")).toBe("false");
  });

  it("valibot: { key } path segments and a forwarded check", () => {
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
    const { result } = renderHook(() => useForm({ initial: { password: "", repeat: "" }, schema }));

    expect(result.current.fields.password.error).toBe("Too short");

    act(() => result.current.setValue("password", "long enough"));
    act(() => result.current.setValue("repeat", "long"));

    expect(result.current.fields.password.error).toBeNull();
    expect(result.current.fields.repeat.error).toBe("Does not match");
  });

  it("a schema may cover only some of the fields", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { email: "", remember: false },
        schema: z.object({ email: z.email("Invalid email") }),
      }),
    );

    expect(result.current.fields.email.error).toBe("Invalid email");
    expect(result.current.fields.remember.error).toBeNull();

    act(() => result.current.setValue("email", "ann@example.com"));
    expect(result.current.valid).toBe(true);
  });
});

describe("the fields' own checks go first", () => {
  it("required and validate before the schema; the schema once they pass", () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { email: "", password: "", repeat: "" },
        fields: {
          email: { required: "Enter your email" },
          password: { validate: (value) => (value.includes(" ") ? "No spaces" : null) },
        },
        schema: signUpSchema,
      }),
    );

    expect(result.current.fields.email.error).toBe("Enter your email");

    act(() => result.current.setValue("email", "ann"));
    expect(result.current.fields.email.error).toBe("Invalid email");

    act(() => result.current.setValue("password", "a b"));
    expect(result.current.fields.password.error).toBe("No spaces");

    act(() => result.current.setValue("password", "ab"));
    expect(result.current.fields.password.error).toBe("At least 8 characters");
  });

  it("an error from setError is shown over the schema's", () => {
    const { result } = renderHook(() =>
      useForm({ initial: { email: "ann" }, schema: z.object({ email: z.email("Invalid email") }) }),
    );

    act(() => result.current.setError("email", "Taken"));
    expect(result.current.fields.email).toMatchObject({ error: "Taken", visibleError: "Taken" });

    // The next edit removes it: the schema's error is back.
    act(() => result.current.setValue("email", "ann!"));
    expect(result.current.fields.email.error).toBe("Invalid email");
  });
});

describe("issues that belong to no field", () => {
  const schema = z
    .object({ phone: z.string(), email: z.string() })
    .refine((data) => data.phone !== "" || data.email !== "", "Enter a phone or an email");

  it("go to formError after a submit, and make the form invalid before that", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useForm({ initial: { phone: "", email: "" }, saved: { phone: "-" }, schema, onSubmit }),
    );

    expect(result.current.formError).toBeNull();
    expect(result.current.valid).toBe(false);
    expect(result.current.canSubmit).toBe(false);

    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.formError).toBe("Enter a phone or an email");
    expect(result.current.fields.phone.error).toBeNull();

    act(() => result.current.setValue("email", "ann@example.com"));
    expect(result.current.formError).toBeNull();
    expect(result.current.valid).toBe(true);
  });

  it("a path that is not a field goes there too", () => {
    const outside: StandardSchemaV1<{ name: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: () => ({ issues: [{ message: "Server says no", path: ["meta", "id"] }] }),
      },
    };
    const { form } = renderForm({ initial: { name: "" }, schema: outside }, ({ field }) => (
      <input aria-label="Name" {...field("name")} />
    ));

    fireEvent.blur(screen.getByLabelText("Name"));
    // Every field touched, as after a submit.
    expect(form.current.formError).toBe("Server says no");
    expect(form.current.fields.name.error).toBeNull();
    expect(form.current.valid).toBe(false);
  });
});

describe("schema errors block saving", () => {
  it("submit touches all fields, focuses the first field with a schema error", async () => {
    const onSubmit = vi.fn<() => void>();
    render(<SignUp onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("email"), "ann@example.com");
    await userEvent.type(screen.getByLabelText("password"), "long enough");
    await userEvent.type(screen.getByLabelText("repeat"), "long");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("repeat"));
    expect(screen.getByText("Passwords do not match")).toBeTruthy();

    await userEvent.type(screen.getByLabelText("repeat"), " enough");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { email: "ann@example.com", password: "long enough", repeat: "long enough" },
      { changed: { email: "ann@example.com", password: "long enough", repeat: "long enough" } },
    );
  });

  it("onSubmit gets the form's values, not the schema's output", async () => {
    const onSubmit = vi.fn<(values: { name: string }) => void>();
    const { form } = renderForm(
      {
        initial: { name: "" },
        schema: z.object({ name: z.string().transform((name) => name.toUpperCase()) }),
        onSubmit,
      },
      ({ field }) => <input aria-label="Name" {...field("name")} />,
    );

    await userEvent.type(screen.getByLabelText("Name"), "ann");
    await act(() => form.current.submit());

    expect(onSubmit).toHaveBeenCalledWith({ name: "ann" }, { changed: { name: "ann" } });
  });

  it("autosave waits while the schema rejects the values, saves once they pass", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useForm({
        initial: { password: "long enough", repeat: "long enough" },
        schema: signUpFields.omit({ email: true }).refine((data) => data.password === data.repeat, {
          message: "Passwords do not match",
          path: ["repeat"],
        }),
        onSubmit,
        autosave: true,
      }),
    );

    act(() => result.current.setValue("password", "longer still"));
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(onSubmit).not.toHaveBeenCalled();
    // Autosave does not touch fields: the error stays hidden.
    expect(result.current.fields.repeat).toMatchObject({
      error: "Passwords do not match",
      visibleError: null,
    });
    expect(await act(() => result.current.flush())).toBe(false);

    act(() => result.current.setValue("repeat", "longer still"));
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.dirty).toBe(false);
  });

  it("changes left by a resetKey change are checked with the old record's schema", async () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn<() => void>();
    const strict = z.object({ name: z.string().min(3, "Too short") });
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useForm({
          initial: { name: "Ann" },
          // The old record's schema rejects what the new one would take.
          schema: id === 1 ? strict : z.object({ name: z.string() }),
          onSubmit,
          autosave: true,
          resetKey: id,
        }),
      { initialProps: { id: 1 } },
    );

    act(() => result.current.setValue("name", "Al"));
    rerender({ id: 2 });
    await act(() => vi.advanceTimersByTimeAsync(2000));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.values).toEqual({ name: "Ann" });
  });
});

describe("the schema runs when the values change", () => {
  it("not on a blur, again on an edit", () => {
    const schema = z.object({ name: z.string() });
    const validate = vi.spyOn(schema["~standard"], "validate");
    const { form } = renderForm({ initial: { name: "" }, schema }, ({ field }) => (
      <input aria-label="Name" {...field("name")} />
    ));
    const calls = validate.mock.calls.length;

    fireEvent.blur(screen.getByLabelText("Name"));
    expect(form.current.fields.name.touched).toBe(true);
    expect(validate.mock.calls.length).toBe(calls);

    act(() => form.current.setValue("name", "Ann"));
    expect(validate.mock.calls.length).toBe(calls + 1);
  });

  it("a new schema from props is used at once", () => {
    const { result, rerender } = renderHook(
      ({ min }: { min: number }) =>
        useForm({
          initial: { name: "Ann" },
          schema: z.object({ name: z.string().min(min, "Too short") }),
        }),
      { initialProps: { min: 1 } },
    );

    expect(result.current.valid).toBe(true);

    rerender({ min: 5 });
    expect(result.current.fields.name.error).toBe("Too short");
  });
});
