import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useForm } from "../..";
import { deferred } from "./_deferred";

afterEach(cleanup);

function Price() {
  const form = useForm({ initial: { price: 0 } });

  return (
    <>
      <input inputMode="decimal" aria-label="Price" {...form.field("price")} />
      <button type="button" onClick={() => form.reset({ price: 5 })}>
        Load
      </button>
    </>
  );
}

function Editor({ id, name, seen }: { id: number; name: string; seen: string[] }) {
  const form = useForm({ initial: { name }, resetKey: id });

  return (
    <>
      <input aria-label="Name" {...form.field("name")} />
      <Probe value={form.values.name} seen={seen} />
    </>
  );
}

function Probe({ value, seen }: { value: string; seen: string[] }) {
  seen.push(value);
  return null;
}

describe("reset()", () => {
  it("returns to initial and the saved option, clears touched, errors and submitError", async () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { title: "Untitled", body: "" },
        saved: { title: "" },
        onSubmit: () => Promise.reject(new Error("Down")),
      }),
    );

    act(() => result.current.setValue("body", "Text"));
    await act(async () => {
      await result.current.submit();
    });
    act(() => result.current.setError("body", "Too long"));
    expect(result.current.submitError).toBeInstanceOf(Error);

    act(() => result.current.reset());

    expect(result.current.values).toEqual({ title: "Untitled", body: "" });
    expect(result.current.fields.title).toMatchObject({ saved: "", dirty: true, touched: false });
    expect(result.current.fields.body).toMatchObject({ error: null, touched: false });
    expect(result.current.submitError).toBeNull();
  });

  it("with values: they become current and saved, missing fields go back to initial", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "", email: "", repeat: "" } }));

    act(() => result.current.setValue("repeat", "x"));
    // Data from the server: no "repeat", and a field the form does not have.
    const fromServer = { name: "Ann", email: "a@b.c", id: 7 };
    act(() => result.current.reset(fromServer));

    expect(result.current.values).toEqual({ name: "Ann", email: "a@b.c", repeat: "" });
    expect(result.current.fields.name.saved).toBe("Ann");
    expect(result.current.dirty).toBe(false);
    expect(result.current.canSubmit).toBe(false);
  });

  it("clears the raw text of an input being edited", async () => {
    render(<Price />);
    const input = screen.getByLabelText<HTMLInputElement>("Price");

    await userEvent.clear(input);
    await userEvent.type(input, "1.");
    await userEvent.click(screen.getByRole("button"));

    expect(input.value).toBe("5");
  });
});

describe("resetKey", () => {
  it("resets during render: children never see the old record's values", async () => {
    const seen: string[] = [];
    const { rerender } = render(<Editor id={1} name="Ann" seen={seen} />);

    await userEvent.type(screen.getByLabelText("Name"), "!");
    expect(seen.at(-1)).toBe("Ann!");

    seen.length = 0;
    rerender(<Editor id={2} name="Bob" seen={seen} />);

    expect(seen[0]).toBe("Bob");
    expect(seen).not.toContain("Ann!");
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bob");
  });

  it("does nothing while the key stays the same", async () => {
    const seen: string[] = [];
    const { rerender } = render(<Editor id={1} name="Ann" seen={seen} />);

    await userEvent.type(screen.getByLabelText("Name"), "!");
    rerender(<Editor id={1} name="Other" seen={seen} />);

    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Ann!");
  });
});

describe("reset during a submit in flight", () => {
  it("the old submit's success marks nothing saved, pending lasts until it ends", async () => {
    const request = deferred();
    const onSubmit = vi.fn<() => Promise<void>>(() => request.promise);
    const { result } = renderHook(() => useForm({ initial: { name: "" }, onSubmit }));

    act(() => result.current.setValue("name", "Draft"));
    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });

    act(() => result.current.reset({ name: "Server" }));
    expect(result.current.pending).toBe(true);

    act(() => result.current.setValue("name", "Edited"));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => {
      request.resolve();
      expect(await submitted).toBe(true);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.fields.name).toMatchObject({ value: "Edited", saved: "Server" });
    expect(result.current.canSubmit).toBe(true);
  });

  it("the old submit's failure reaches onError but not submitError", async () => {
    const request = deferred();
    const onError = vi.fn<(error: unknown) => void>();
    const { result } = renderHook(() =>
      useForm({ initial: { name: "" }, onSubmit: () => request.promise, onError }),
    );

    act(() => result.current.setValue("name", "Draft"));
    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    act(() => result.current.reset());

    await act(async () => {
      request.reject(new Error("Down"));
      expect(await submitted).toBe(false);
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(result.current.submitError).toBeNull();
    expect(result.current.pending).toBe(false);
  });
});
