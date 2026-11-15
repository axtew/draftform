import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useForm } from "../..";
import { renderForm } from "./_helpers";

afterEach(cleanup);

function EmailForm() {
  const form = useForm({
    initial: { email: "" },
    fields: { email: { required: "Enter your email" } },
  });
  const { visibleError } = form.fields.email;

  return (
    <form>
      <label htmlFor={form.fieldId("email")}>Email</label>
      <input {...form.field("email")} />
      {visibleError !== null && <p id={form.errorId("email")}>{visibleError}</p>}
      <p data-testid="touched">{String(form.fields.email.touched)}</p>
    </form>
  );
}

describe("text inputs", () => {
  it("shows the value and stores what the user types", async () => {
    const { form } = renderForm({ initial: { name: "Ann" } }, ({ field }) => (
      <input aria-label="Name" {...field("name")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Name");

    expect(input.value).toBe("Ann");
    expect(input.name).toBe("name");

    await userEvent.type(input, "a");
    expect(form.current.values.name).toBe("Anna");
    expect(form.current.fields.name.dirty).toBe(true);
  });

  it("an empty input gives null when the field started as null", async () => {
    const { form } = renderForm({ initial: { phone: null as string | null } }, ({ field }) => (
      <input aria-label="Phone" {...field("phone")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Phone");

    expect(input.value).toBe("");

    await userEvent.type(input, "5");
    expect(form.current.values.phone).toBe("5");

    await userEvent.clear(input);
    expect(form.current.values.phone).toBeNull();
    expect(form.current.dirty).toBe(false);
  });

  it("uses parse and format when given", async () => {
    const { form } = renderForm(
      {
        initial: { tags: "a,b" },
        fields: {
          tags: {
            parse: (input) => input.replaceAll(" ", ","),
            format: (value) => value.replaceAll(",", " "),
          },
        },
      },
      ({ field }) => <input aria-label="Tags" {...field("tags")} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Tags");

    expect(input.value).toBe("a b");

    await userEvent.type(input, " c");
    expect(form.current.values.tags).toBe("a,b,c");
  });
});

describe("number inputs", () => {
  it("an empty number input gives NaN, which required treats as empty", async () => {
    const { form } = renderForm(
      { initial: { age: 30 }, fields: { age: { required: true } } },
      ({ field }) => <input type="number" aria-label="Age" {...field("age")} />,
    );
    const input = screen.getByLabelText<HTMLInputElement>("Age");

    expect(input.value).toBe("30");

    await userEvent.clear(input);
    expect(form.current.values.age).toBeNaN();
    expect(form.current.fields.age.error).toBe("Required");
    expect(input.value).toBe("");
  });

  it("an empty number input gives null when the field started as null", async () => {
    const { form } = renderForm({ initial: { height: null as number | null } }, ({ field }) => (
      <input type="number" aria-label="Height" {...field("height")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Height");

    await userEvent.type(input, "180");
    expect(form.current.values.height).toBe(180);

    await userEvent.clear(input);
    expect(form.current.values.height).toBeNull();
  });

  it("a number field bound to a text input still gets a number", async () => {
    const { form } = renderForm({ initial: { year: 2000 } }, ({ field }) => (
      <input inputMode="numeric" aria-label="Year" {...field("year")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Year");

    await userEvent.clear(input);
    await userEvent.type(input, "1999");

    expect(form.current.values.year).toBe(1999);
  });

  it("keeps the typed text while editing, so a trailing dot is not eaten", async () => {
    const { form } = renderForm({ initial: { price: 0 } }, ({ field }) => (
      <input inputMode="decimal" aria-label="Price" {...field("price")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Price");

    await userEvent.clear(input);
    await userEvent.type(input, "1.");
    expect(input.value).toBe("1.");
    expect(form.current.values.price).toBe(1);

    await userEvent.type(input, "5");
    expect(form.current.values.price).toBe(1.5);
  });
});

describe("checkboxes", () => {
  it("are checked from the value and give a boolean", async () => {
    const { form } = renderForm({ initial: { remember: true } }, ({ field }) => (
      <input type="checkbox" aria-label="Remember" {...field("remember")} />
    ));
    const input = screen.getByLabelText<HTMLInputElement>("Remember");

    expect(input.checked).toBe(true);

    await userEvent.click(input);
    expect(input.checked).toBe(false);
    expect(form.current.values.remember).toBe(false);
    expect(form.current.dirty).toBe(true);
  });
});

describe("select and textarea", () => {
  it("a select stores the chosen option", async () => {
    const { form } = renderForm({ initial: { role: "user" } }, ({ field }) => (
      <select aria-label="Role" {...field("role")}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
    ));
    const select = screen.getByLabelText<HTMLSelectElement>("Role");

    expect(select.value).toBe("user");

    await userEvent.selectOptions(select, "admin");
    expect(form.current.values.role).toBe("admin");
    expect(select.value).toBe("admin");
  });

  it("a select for a boolean field gives a boolean", async () => {
    const { form } = renderForm({ initial: { active: false } }, ({ field }) => {
      // A boolean field gives checkbox props: a select takes the value from code.
      const { checked, ...props } = field("active");
      return (
        <select aria-label="Active" {...props} value={String(checked)}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    });

    await userEvent.selectOptions(screen.getByLabelText("Active"), "true");
    expect(form.current.values.active).toBe(true);
  });

  it("a textarea stores its text", async () => {
    const { form } = renderForm({ initial: { bio: "" } }, ({ field }) => (
      <textarea aria-label="Bio" {...field("bio")} />
    ));

    await userEvent.type(screen.getByLabelText("Bio"), "Hi");
    expect(form.current.values.bio).toBe("Hi");
  });
});

describe("touched and visible errors", () => {
  it("shows the error only after blur", async () => {
    render(<EmailForm />);
    const input = screen.getByLabelText("Email");

    expect(screen.queryByText("Enter your email")).toBeNull();
    expect(screen.getByTestId("touched").textContent).toBe("false");

    await userEvent.click(input);
    expect(screen.queryByText("Enter your email")).toBeNull();

    await userEvent.tab();
    expect(screen.getByText("Enter your email")).toBeTruthy();
    expect(screen.getByTestId("touched").textContent).toBe("true");
  });

  it("sets aria-invalid and aria-describedby only while the error is visible", async () => {
    render(<EmailForm />);
    const input = screen.getByLabelText("Email");

    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.hasAttribute("aria-describedby")).toBe(false);

    await userEvent.click(input);
    await userEvent.tab();

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("Enter your email").id);
    expect(screen.getByRole("textbox", { description: "Enter your email" })).toBe(input);

    await userEvent.type(input, "a@b.c");
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("ids are unique per form instance", () => {
    render(
      <>
        <EmailForm />
        <EmailForm />
      </>,
    );
    const [first, second] = screen.getAllByLabelText("Email");

    expect(first?.id).toBeTruthy();
    expect(first?.id).not.toBe(second?.id);
  });
});
