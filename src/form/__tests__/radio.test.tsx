import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useForm } from "../..";
import { renderForm } from "./_helpers";

afterEach(cleanup);

type Plan = "free" | "pro";

// Annotated objects keep the union types: a literal would widen to string.
const planForm: { plan: Plan } = { plan: "free" };
const sizeForm: { size: string | null } = { size: "m" };

function PlanForm() {
  const form = useForm({
    initial: planForm,
    fields: { plan: { validate: (plan) => (plan === "pro" ? null : "Pick pro") } },
  });
  const { visibleError } = form.fields.plan;

  return (
    <form onSubmit={form.handleSubmit}>
      <input type="radio" {...form.field("plan", { radio: "free" })} />
      <label htmlFor={form.fieldId("plan", "free")}>Free</label>
      <input type="radio" {...form.field("plan", { radio: "pro" })} />
      <label htmlFor={form.fieldId("plan", "pro")}>Pro</label>
      {visibleError !== null && <p id={form.errorId("plan")}>{visibleError}</p>}
      <button type="submit">Save</button>
    </form>
  );
}

describe("radio groups", () => {
  it("are checked from the value and set the option on change", async () => {
    const { form } = renderForm({ initial: planForm }, ({ field }) => (
      <>
        <input type="radio" aria-label="Free" {...field("plan", { radio: "free" })} />
        <input type="radio" aria-label="Pro" {...field("plan", { radio: "pro" })} />
      </>
    ));
    const free = screen.getByLabelText<HTMLInputElement>("Free");
    const pro = screen.getByLabelText<HTMLInputElement>("Pro");

    expect(free.checked).toBe(true);
    expect(pro.checked).toBe(false);
    expect(free.name).toBe("plan");
    expect(pro.value).toBe("pro");

    await userEvent.click(pro);

    expect(form.current.values.plan).toBe("pro");
    expect(form.current.dirty).toBe(true);
    expect(free.checked).toBe(false);
    expect(pro.checked).toBe(true);
  });

  it("number options give numbers, their value attribute is the text", async () => {
    const { form } = renderForm({ initial: { seats: 1 } }, ({ field }) =>
      [1, 5, 10].map((seats) => (
        <input
          key={seats}
          type="radio"
          aria-label={`${seats}`}
          {...field("seats", { radio: seats })}
        />
      )),
    );

    expect(screen.getByLabelText<HTMLInputElement>("5").value).toBe("5");

    await userEvent.click(screen.getByLabelText("10"));
    expect(form.current.values.seats).toBe(10);
  });

  it("a null option fits a nullable field", async () => {
    const { form } = renderForm({ initial: sizeForm }, ({ field }) => (
      <>
        <input type="radio" aria-label="None" {...field("size", { radio: null })} />
        <input type="radio" aria-label="M" {...field("size", { radio: "m" })} />
      </>
    ));

    expect(screen.getByLabelText<HTMLInputElement>("None").value).toBe("");

    await userEvent.click(screen.getByLabelText("None"));
    expect(form.current.values.size).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>("M").checked).toBe(false);
  });

  it("uses format for the value attribute", () => {
    renderForm(
      { initial: { level: 1 }, fields: { level: { format: (v) => `L${v}` } } },
      ({ field }) => <input type="radio" aria-label="One" {...field("level", { radio: 1 })} />,
    );

    expect(screen.getByLabelText<HTMLInputElement>("One").value).toBe("L1");
  });

  it("labels find their option by fieldId(name, option)", async () => {
    render(<PlanForm />);
    const pro = screen.getByLabelText<HTMLInputElement>("Pro");

    expect(pro.id).not.toBe(screen.getByLabelText("Free").id);

    await userEvent.click(screen.getByText("Pro"));
    expect(pro.checked).toBe(true);
  });

  it("every option gets the aria props of the field, and focus goes to the checked one", async () => {
    render(<PlanForm />);
    const free = screen.getByLabelText("Free");
    const pro = screen.getByLabelText("Pro");

    expect(free.getAttribute("aria-invalid")).toBe("false");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const errorId = screen.getByText("Pick pro").id;
    for (const radio of [free, pro]) {
      expect(radio.getAttribute("aria-invalid")).toBe("true");
      expect(radio.getAttribute("aria-describedby")).toBe(errorId);
    }
    expect(document.activeElement).toBe(free);
  });

  it("hands out the same handlers per option on every render", () => {
    const { result } = renderHook(() => useForm({ initial: planForm }));
    const before = result.current.field("plan", { radio: "pro" });

    act(() => result.current.setValue("plan", "pro"));
    const after = result.current.field("plan", { radio: "pro" });

    expect(after.onChange).toBe(before.onChange);
    expect(after.ref).toBe(before.ref);
    expect(after.checked).toBe(true);
    expect(result.current.field("plan", { radio: "free" }).onChange).not.toBe(after.onChange);
  });
});
