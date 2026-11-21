import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { startTransition, StrictMode, Suspense, use, useState } from "react";
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

describe("a resetKey change touches the form's store only once the render commits", () => {
  const names: Record<number, string> = { 1: "Ann", 2: "Bob" };

  function Record({
    id,
    onSubmit,
  }: {
    id: number;
    onSubmit: (id: number, values: object) => void;
  }) {
    const form = useForm({
      initial: { name: names[id] ?? "" },
      resetKey: id,
      onSubmit: (values) => onSubmit(id, values),
    });

    return (
      <>
        <input aria-label="Name" {...form.field("name")} />
        <button type="button" onClick={() => void form.submit()}>
          Save
        </button>
        <Details id={id} />
      </>
    );
  }

  /** Suspends for record 2 until its data arrives. */
  const loading = { promise: new Promise<void>(() => {}) };
  function Details({ id }: { id: number }) {
    if (id === 2) use(loading.promise);
    return null;
  }

  it("a render with the new key that React throws away leaves the form on the old record", async () => {
    loading.promise = new Promise<void>(() => {});
    const onSubmit = vi.fn<(id: number, values: object) => void>();

    function App() {
      const [id, setId] = useState(1);

      return (
        <>
          <button type="button" onClick={() => startTransition(() => setId(2))}>
            Next
          </button>
          <Suspense fallback="Loading">
            <Record id={id} onSubmit={onSubmit} />
          </Suspense>
        </>
      );
    }

    render(<App />);
    await userEvent.type(screen.getByLabelText("Name"), "!");

    // Record 2 suspends: the transition renders it, then keeps the old screen.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Ann!");

    // The screen shows record 1 with an unsaved edit, so Save sends it to record 1.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(1, { name: "Ann!" });
  });

  it("works under StrictMode, which renders twice and keeps one", async () => {
    const seen: string[] = [];
    const onSubmit = vi.fn<(id: number, values: object) => void>();

    function Strict({ id }: { id: number }) {
      const form = useForm({
        initial: { name: names[id] ?? "" },
        resetKey: id,
        onSubmit: (values) => onSubmit(id, values),
      });

      return (
        <>
          <input aria-label="Name" {...form.field("name")} />
          <button type="button" onClick={() => void form.submit()}>
            Save
          </button>
          <Probe value={form.values.name} seen={seen} />
        </>
      );
    }

    const { rerender } = render(
      <StrictMode>
        <Strict id={1} />
      </StrictMode>,
    );
    await userEvent.type(screen.getByLabelText("Name"), "!");

    seen.length = 0;
    rerender(
      <StrictMode>
        <Strict id={2} />
      </StrictMode>,
    );
    expect(seen).not.toContain("Ann!");
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bob");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Name"), "?");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(2, { name: "Bob?" });
  });

  it("setValue and then submit in one handler see the new record and the new value", async () => {
    const onSubmit = vi.fn<(id: number, values: object) => void>();
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useForm({
          initial: { name: names[id] ?? "", status: "draft" },
          resetKey: id,
          onSubmit: (values) => onSubmit(id, values),
        }),
      { initialProps: { id: 1 } },
    );

    act(() => result.current.setValue("name", "Ann!"));
    rerender({ id: 2 });

    await act(async () => {
      result.current.setValue("status", "published");
      expect(await result.current.submit()).toBe(true);
    });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(2, { name: "Bob", status: "published" });
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
      request.resolve();
      expect(await submitted).toBe(true);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.fields.name).toMatchObject({ value: "Edited", saved: "Server" });
    expect(result.current.canSubmit).toBe(true);
  });

  it("a submit after the reset waits for the old one, then sends against the new saved values", async () => {
    const old = deferred();
    const onSubmit = vi
      .fn<(values: { name: string }, context: { changed: object }) => Promise<void>>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useForm({ initial: { name: "" }, onSubmit }));

    act(() => result.current.setValue("name", "Draft"));
    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    act(() => result.current.reset({ name: "Server" }));
    act(() => result.current.setValue("name", "Edited"));

    let again: Promise<boolean> | undefined;
    act(() => {
      again = result.current.submit();
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => {
      old.resolve();
      expect(await submitted).toBe(true);
      expect(await again).toBe(true);
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]).toEqual([{ name: "Edited" }, { changed: { name: "Edited" } }]);
    expect(result.current.fields.name).toMatchObject({ saved: "Edited", dirty: false });
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
