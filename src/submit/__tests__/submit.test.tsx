import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useForm } from "../..";
import { renderForm } from "../../form/__tests__/_helpers";
import { deferred } from "./_deferred";

afterEach(cleanup);

describe("edits during a pending submit stay dirty (old bug: marked saved with the reply)", () => {
  it("marks saved the values that were sent, not the current ones", async () => {
    const request = deferred();
    const { form } = renderForm(
      { initial: { name: "Ann", city: "Oslo" }, onSubmit: () => request.promise },
      ({ field }) => (
        <>
          <input aria-label="Name" {...field("name")} />
          <input aria-label="City" {...field("city")} />
        </>
      ),
    );

    await userEvent.type(screen.getByLabelText("Name"), "a");

    let result: Promise<boolean> | undefined;
    act(() => {
      result = form.current.submit();
    });
    expect(form.current.pending).toBe(true);

    await userEvent.type(screen.getByLabelText("City"), "!");

    await act(async () => {
      request.resolve();
      expect(await result).toBe(true);
    });

    expect(form.current.pending).toBe(false);
    expect(form.current.fields.name).toMatchObject({ value: "Anna", saved: "Anna", dirty: false });
    expect(form.current.fields.city).toMatchObject({ value: "Oslo!", saved: "Oslo", dirty: true });
    expect(form.current.canSubmit).toBe(true);
  });

  it("a field edited in flight and changed back counts as clean against the sent value", async () => {
    const request = deferred();
    const { result } = renderHook(() =>
      useForm({ initial: { name: "Ann" }, onSubmit: () => request.promise }),
    );

    act(() => result.current.setValue("name", "Bob"));
    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    act(() => result.current.setValue("name", "Ann"));

    await act(async () => {
      request.resolve();
      await submitted;
    });

    // The server now has "Bob": "Ann" is a change to save.
    expect(result.current.fields.name).toMatchObject({ value: "Ann", saved: "Bob", dirty: true });
  });
});

describe("a failed submit (old bugs: pending stuck, the error swallowed)", () => {
  it("clears pending, keeps the form dirty, sets submitError and calls onError", async () => {
    const failure = new Error("Network down");
    const onError = vi.fn<(error: unknown) => void>();
    const { result } = renderHook(() =>
      useForm({
        initial: { name: "Ann" },
        onSubmit: () => Promise.reject(failure),
        onError,
      }),
    );

    act(() => result.current.setValue("name", "Bob"));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.submit();
    });

    expect(saved).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.dirty).toBe(true);
    expect(result.current.fields.name.saved).toBe("Ann");
    expect(result.current.submitError).toBe(failure);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(result.current.canSubmit).toBe(true);
  });

  it("handles an onSubmit that throws synchronously", async () => {
    const { result } = renderHook(() =>
      useForm({
        initial: { name: "Ann" },
        onSubmit: () => {
          throw new Error("Bad");
        },
      }),
    );

    act(() => result.current.setValue("name", "Bob"));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.submitError).toBeInstanceOf(Error);
  });

  it("a retry without edits sends again and clears submitError on success", async () => {
    const onSubmit = vi
      .fn<(values: { name: string }) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" }, onSubmit }));

    act(() => result.current.setValue("name", "Bob"));
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]?.[0]).toEqual({ name: "Bob" });
    expect(result.current.submitError).toBeNull();
    expect(result.current.dirty).toBe(false);
  });
});

describe("onSubmit of the latest render is called (old bug: a stale closure)", () => {
  it("uses the handler passed in the last render", async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const { result, rerender } = renderHook(
      ({ onSubmit }) => useForm({ initial: { name: "Ann" }, onSubmit }),
      { initialProps: { onSubmit: first } },
    );

    act(() => result.current.setValue("name", "Bob"));
    rerender({ onSubmit: second });

    await act(async () => {
      await result.current.submit();
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe("what onSubmit gets", () => {
  it("all values, and the changed fields alone in changed", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useForm({ initial: { name: "Ann", age: 30, admin: false }, onSubmit }),
    );

    act(() => {
      result.current.setValue("age", 31);
      result.current.setValue("admin", true);
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { name: "Ann", age: 31, admin: true },
      { changed: { age: 31, admin: true } },
    );
  });

  it("changed is measured against the saved option of a create form", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useForm({ initial: { title: "Untitled", body: "" }, saved: { title: "" }, onSubmit }),
    );

    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      { title: "Untitled", body: "" },
      { changed: { title: "Untitled" } },
    );
    expect(result.current.dirty).toBe(false);
  });

  it("sees a value set in the same handler just before submit", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() =>
      useForm({ initial: { status: "draft", title: "A" }, onSubmit }),
    );

    await act(async () => {
      result.current.setValue("status", "published");
      await result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      { status: "published", title: "A" },
      { changed: { status: "published" } },
    );
  });

  it("without onSubmit a valid submit just marks the values saved", async () => {
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" } }));

    act(() => result.current.setValue("name", "Bob"));
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });

    expect(result.current.fields.name.saved).toBe("Bob");
  });
});

function SignUp({ onSubmit }: { onSubmit: () => void }) {
  const form = useForm({
    initial: { name: "", email: "", terms: false },
    fields: {
      name: { required: "Enter your name" },
      email: { required: "Enter your email" },
      terms: { required: "Accept the terms" },
    },
    onSubmit,
  });
  const { email, name } = form.fields;

  return (
    <form onSubmit={form.handleSubmit}>
      {/* Email comes first on the page; name comes first in initial. */}
      <input aria-label="Email" {...form.field("email")} />
      {email.visibleError !== null && <p id={form.errorId("email")}>{email.visibleError}</p>}
      <input aria-label="Name" {...form.field("name")} />
      {name.visibleError !== null && <p id={form.errorId("name")}>{name.visibleError}</p>}
      <input type="checkbox" aria-label="Terms" {...form.field("terms")} />
      <button type="submit">Sign up</button>
    </form>
  );
}

describe("submit checks the form first", () => {
  it("an invalid form: touches all fields, shows errors, focuses the first invalid field", async () => {
    const onSubmit = vi.fn<() => void>();
    render(<SignUp onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your name")).toBeTruthy();
    expect(screen.getByText("Enter your email")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  });

  it("focuses the next invalid field once the first one is fixed", async () => {
    render(<SignUp onSubmit={vi.fn<() => void>()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Ann");
    await userEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("handleSubmit prevents the page reload and submits a valid form", async () => {
    const onSubmit = vi.fn<() => void>();
    render(<SignUp onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Name"), "Ann");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.c");
    await userEvent.click(screen.getByLabelText("Terms"));

    const submitEvent = new Event("submit", { bubbles: true, cancelable: true });
    await act(async () => {
      screen.getByRole("button").closest("form")?.dispatchEvent(submitEvent);
      await Promise.resolve();
    });

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("skips invalid fields that have no element, and disabled ones", async () => {
    const { form } = renderForm(
      {
        initial: { rating: 0, nickname: "", email: "" },
        fields: {
          rating: { validate: (v) => (v > 0 ? null : "Rate us") },
          nickname: { required: true },
          email: { required: true },
        },
      },
      ({ field }) => (
        <>
          {/* rating is a custom widget driven by setValue: no element. */}
          <input aria-label="Nickname" disabled {...field("nickname")} />
          <input aria-label="Email" {...field("email")} />
        </>
      ),
    );

    await act(async () => {
      expect(await form.current.submit()).toBe(false);
    });

    expect(form.current.fields.rating.visibleError).toBe("Rate us");
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  });

  it("a form without changes does not call onSubmit", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" }, onSubmit }));

    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.fields.name.touched).toBe(true);
  });

  it("an error from setError blocks the submit until the field is edited", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useForm({ initial: { email: "a@b.c" }, onSubmit }));

    act(() => {
      result.current.setValue("email", "c@d.e");
      result.current.setError("email", "Already taken");
    });
    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => result.current.setValue("email", "e@f.g"));
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });
  });
});

describe("one submit at a time", () => {
  it("a second submit while pending does not send again and resolves false", async () => {
    const request = deferred();
    const onSubmit = vi.fn<() => Promise<void>>(() => request.promise);
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" }, onSubmit }));

    act(() => result.current.setValue("name", "Bob"));

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = result.current.submit();
      second = result.current.submit();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(await second).toBe(false);

    await act(async () => {
      request.resolve();
      expect(await first).toBe(true);
    });
  });

  it("canSubmit is false while pending and comes back for edits made meanwhile", async () => {
    const request = deferred();
    const { result } = renderHook(() =>
      useForm({ initial: { name: "Ann" }, onSubmit: () => request.promise }),
    );

    act(() => result.current.setValue("name", "Bob"));
    expect(result.current.canSubmit).toBe(true);

    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.canSubmit).toBe(false);

    act(() => result.current.setValue("name", "Bo"));
    expect(result.current.canSubmit).toBe(false);

    await act(async () => {
      request.resolve();
      await submitted;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });

  it("works under StrictMode", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useForm({ initial: { name: "Ann" }, onSubmit }), {
      wrapper: StrictMode,
    });

    act(() => result.current.setValue("name", "Bob"));
    await act(async () => {
      expect(await result.current.submit()).toBe(true);
    });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.dirty).toBe(false);
  });

  it("submit, handleSubmit and reset keep their identity across renders", () => {
    const { result } = renderHook(() => useForm({ initial: { name: "" } }));
    const { submit, handleSubmit, reset } = result.current;

    act(() => result.current.setValue("name", "Ann"));

    expect(result.current.submit).toBe(submit);
    expect(result.current.handleSubmit).toBe(handleSubmit);
    expect(result.current.reset).toBe(reset);
  });
});
