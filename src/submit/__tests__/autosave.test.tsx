import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type FormOptions, useForm } from "../..";
import { type Deferred, deferred } from "./_deferred";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Request<V> {
  values: V;
  changed: Partial<V>;
  request: Deferred;
}

/** An `onSubmit` whose every call stays in flight until the test settles it. */
function slowServer<V>() {
  const requests: Request<V>[] = [];
  const onSubmit = vi.fn<(values: V, context: { changed: Partial<V> }) => Promise<void>>(
    (values, { changed }) => {
      const request = deferred();
      requests.push({ values, changed, request });
      return request.promise;
    },
  );

  return { requests, onSubmit };
}

/** Lets time pass, and every promise that settles meanwhile run. */
async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function settle(request: Deferred | undefined, error?: unknown): Promise<void> {
  if (request === undefined) throw new Error("no such request");

  await act(async () => {
    if (error === undefined) request.resolve();
    else request.reject(error);
    await vi.advanceTimersByTimeAsync(0);
  });
}

function useProfile(options: Partial<FormOptions<{ name: string; city: string }>>) {
  return useForm({
    initial: { name: "Ann", city: "Oslo" },
    fields: { name: { required: "Enter a name" } },
    autosave: true,
    ...options,
  });
}

describe("autosave waits for quiet", () => {
  it("typing does not save; 500 ms without changes saves the latest values once", async () => {
    const onSubmit = vi.fn<(values: { name: string; city: string }) => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    for (const name of ["An", "Ann", "Anna"]) {
      act(() => result.current.setValue("name", name));
      await wait(300);
    }
    expect(onSubmit).not.toHaveBeenCalled();

    await wait(200);

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { name: "Anna", city: "Oslo" },
      { changed: { name: "Anna" } },
    );
    expect(result.current.dirty).toBe(false);

    await wait(5000);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("takes the delay from the options", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit, autosave: { delay: 1000 } }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(999);
    expect(onSubmit).not.toHaveBeenCalled();

    await wait(1);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("is off without the option", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit, autosave: undefined }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(5000);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(true);
  });

  it("does not save an invalid form, nor touch its fields; saves once it is fixed", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("name", ""));
    await wait(1000);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.fields.name).toMatchObject({ touched: false, visibleError: null });

    act(() => result.current.setValue("name", "Bo"));
    await wait(500);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("does not save a value changed back to the saved one", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    act(() => result.current.setValue("city", "Oslo"));
    await wait(1000);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls the onSubmit of the latest render", async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const { result, rerender } = renderHook(({ onSubmit }) => useProfile({ onSubmit }), {
      initialProps: { onSubmit: first },
    });

    act(() => result.current.setValue("city", "Rome"));
    rerender({ onSubmit: second });
    await wait(500);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("works under StrictMode", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }), { wrapper: StrictMode });

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.dirty).toBe(false);
  });
});

describe("one save at a time (old bug: parallel saves, replies in any order)", () => {
  it("a save due while another is in flight starts only after it ends", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);

    act(() => result.current.setValue("city", "Paris"));
    await wait(5000);
    // The reply to "Rome" could otherwise come after the one to "Paris" and win.
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(requests[1]?.values).toEqual({ name: "Ann", city: "Paris" });

    await settle(requests[1]?.request);
    expect(result.current.fields.city).toMatchObject({ saved: "Paris", dirty: false });
    expect(result.current.pending).toBe(false);
  });

  it("an edit during a slow save is not marked saved by its reply and goes in the follow-up", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("name", "Anna"));
    await wait(500);
    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    await settle(requests[0]?.request);

    expect(result.current.fields.name).toMatchObject({ saved: "Anna", dirty: false });
    expect(result.current.fields.city).toMatchObject({ value: "Rome", saved: "Oslo", dirty: true });
    expect(requests[1]?.changed).toEqual({ city: "Rome" });

    await settle(requests[1]?.request);
    expect(result.current.dirty).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("several edits during one slow save go in one follow-up with the latest values", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    for (const city of ["Paris", "Lyon", "Nice"]) {
      act(() => result.current.setValue("city", city));
      await wait(600);
    }
    act(() => result.current.setValue("name", "Anna"));
    await wait(600);
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);
    await settle(requests[1]?.request);
    await wait(5000);

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(requests[1]?.values).toEqual({ name: "Anna", city: "Nice" });
    expect(result.current.dirty).toBe(false);
  });

  it("an edit made during a slow save but not yet quiet when it ends waits for its own delay", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("city", "Paris"));
    await wait(100);
    await settle(requests[0]?.request);
    expect(onSubmit).toHaveBeenCalledOnce();

    await wait(400);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

describe("a failed autosave", () => {
  it("sets submitError and calls onError, does not retry by itself; the next change does", async () => {
    const failure = new Error("Network down");
    const onError = vi.fn<(error: unknown) => void>();
    const onSubmit = vi
      .fn<(values: { name: string; city: string }) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useProfile({ onSubmit, onError }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    expect(result.current.submitError).toBe(failure);
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(result.current.pending).toBe(false);
    expect(result.current.dirty).toBe(true);

    await wait(60_000);
    expect(onSubmit).toHaveBeenCalledOnce();

    act(() => result.current.setValue("name", "Anna"));
    await wait(500);

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]?.[0]).toEqual({ name: "Anna", city: "Rome" });
    expect(result.current.submitError).toBeNull();
    expect(result.current.dirty).toBe(false);
  });
});

describe("flush()", () => {
  it("during the delay: saves at once, and the timer does not save again", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));

    let flushed: boolean | undefined;
    await act(async () => {
      flushed = await result.current.flush();
    });

    expect(flushed).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();

    await wait(5000);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("during a save in flight: waits for it, then sends what is still unsaved", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("name", "Anna"));

    let flushed: Promise<boolean> | undefined;
    act(() => {
      flushed = result.current.flush();
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(requests[1]?.changed).toEqual({ name: "Anna" });

    await settle(requests[1]?.request);
    expect(await flushed).toBe(true);

    await wait(5000);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(result.current.dirty).toBe(false);
  });

  it("during a save in flight with nothing new: no second request", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    let flushed: Promise<boolean> | undefined;
    act(() => {
      flushed = result.current.flush();
    });
    await settle(requests[0]?.request);

    expect(await flushed).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("after the save it waited for failed with the same values: false, no second attempt", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    let flushed: Promise<boolean> | undefined;
    act(() => {
      flushed = result.current.flush();
    });
    await settle(requests[0]?.request, new Error("Down"));

    expect(await flushed).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();

    // A flush of its own retries.
    act(() => {
      flushed = result.current.flush();
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    await settle(requests[1]?.request);
    expect(await flushed).toBe(true);
  });

  it("an invalid form: false, nothing sent, fields untouched", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("name", " "));
    await act(async () => {
      expect(await result.current.flush()).toBe(false);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.fields.name.touched).toBe(false);
  });

  it("a failed save: false, submitError set", async () => {
    const { result } = renderHook(() =>
      useProfile({ onSubmit: () => Promise.reject(new Error("Down")) }),
    );

    act(() => result.current.setValue("city", "Rome"));
    await act(async () => {
      expect(await result.current.flush()).toBe(false);
    });

    expect(result.current.submitError).toBeInstanceOf(Error);
  });

  it("without autosave: saves a valid, dirty form now; a clean one resolves true", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit, autosave: false }));

    await act(async () => {
      expect(await result.current.flush()).toBe(true);
    });
    expect(onSubmit).not.toHaveBeenCalled();

    act(() => result.current.setValue("city", "Rome"));
    await act(async () => {
      expect(await result.current.flush()).toBe(true);
    });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("keeps its identity across renders", () => {
    const { result } = renderHook(() => useProfile({}));
    const { flush } = result.current;

    act(() => result.current.setValue("city", "Rome"));

    expect(result.current.flush).toBe(flush);
  });
});

describe("submit() while autosave is in flight", () => {
  it("waits for it and sends only what is still unsaved; a double click makes no extra request", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = result.current.submit();
      second = result.current.submit();
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("an edit made meanwhile goes in one request after the autosave, not in parallel", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("name", "Anna"));

    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    // The autosave timer of the edit is not needed any more.
    await wait(5000);
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(requests[1]?.values).toEqual({ name: "Anna", city: "Rome" });

    await settle(requests[1]?.request);
    expect(await submitted).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("keeps its checks: an invalid form is touched and not sent", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("name", ""));

    await act(async () => {
      expect(await result.current.submit()).toBe(false);
    });
    expect(result.current.fields.name.visibleError).toBe("Enter a name");

    await settle(requests[0]?.request);
    await wait(5000);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("a reset while it waits: resolves false and sends nothing of the data after the reset", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit, autosave: false }));

    act(() => result.current.setValue("city", "Rome"));
    act(() => {
      void result.current.submit();
    });
    act(() => result.current.setValue("name", "Anna"));

    let submitted: Promise<boolean> | undefined;
    act(() => {
      submitted = result.current.submit();
    });
    act(() => result.current.reset({ name: "Server", city: "Bergen" }));
    act(() => result.current.setValue("city", "Tromso"));

    await settle(requests[0]?.request);

    expect(await submitted).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.fields.city).toMatchObject({ value: "Tromso", dirty: true });
  });
});

describe("unmount (old bug: the last change was lost)", () => {
  it("during the delay: the change is sent at once", async () => {
    const consoleError = vi.spyOn(console, "error");
    const onSubmit = vi.fn<(values: { name: string; city: string }) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const { result, unmount } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { name: "Ann", city: "Rome" },
      { changed: { city: "Rome" } },
    );

    await wait(5000);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("during a save in flight with newer changes: the follow-up is sent after it ends", async () => {
    const consoleError = vi.spyOn(console, "error");
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result, unmount } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("name", "Anna"));
    unmount();
    await wait(0);
    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(requests[0]?.request);
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(requests[1]?.changed).toEqual({ name: "Anna" });

    await settle(requests[1]?.request);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("with nothing waiting: nothing is sent", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result, unmount } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    unmount();
    await wait(5000);

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("StrictMode's test unmount on mount does not send a change made by an effect early", async () => {
    const onSubmit = vi.fn<() => void>();
    renderHook(
      () => {
        const form = useProfile({ onSubmit });
        const { setValue } = form;
        // A value computed on mount, before StrictMode unmounts and mounts again.
        useEffect(() => setValue("city", "Rome"), [setValue]);
        return form;
      },
      { wrapper: StrictMode },
    );

    await wait(499);
    expect(onSubmit).not.toHaveBeenCalled();

    await wait(1);
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("a resetKey change with changes autosave has not sent", () => {
  interface Props {
    id: number;
  }
  const records: Record<number, { name: string; city: string }> = {
    1: { name: "Ann", city: "Oslo" },
    2: { name: "Bob", city: "Bergen" },
  };

  function setup(server: (id: number, values: { name: string; city: string }) => unknown) {
    const onError = vi.fn<(id: number, error: unknown) => void>();
    const rendered = renderHook(
      ({ id }: Props) =>
        useForm({
          initial: records[id] ?? { name: "", city: "" },
          autosave: true,
          resetKey: id,
          // Each render's handlers close over its record, as with mutate(id, values).
          onSubmit: (values) => server(id, values),
          onError: (error) => onError(id, error),
        }),
      { initialProps: { id: 1 } },
    );

    return { ...rendered, onError };
  }

  it("sends them at once with the old record's handlers, never with the new one's", async () => {
    const server = vi.fn<(id: number, values: object) => void>();
    const { result, rerender } = setup(server);

    act(() => result.current.setValue("name", "Ann!"));
    rerender({ id: 2 });
    await wait(0);

    expect(server).toHaveBeenCalledExactlyOnceWith(1, { name: "Ann!", city: "Oslo" });
    expect(result.current.values).toEqual({ name: "Bob", city: "Bergen" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.pending).toBe(false);

    await wait(5000);
    expect(server).toHaveBeenCalledOnce();
  });

  it("the old record's reply marks nothing saved in the new one", async () => {
    const requests: Deferred[] = [];
    const server = vi.fn<(id: number, values: object) => Promise<void>>(() => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    });
    const { result, rerender } = setup(server);

    act(() => result.current.setValue("name", "Ann!"));
    rerender({ id: 2 });
    expect(result.current.pending).toBe(true);
    act(() => result.current.setValue("name", "Bob!"));

    await settle(requests[0]);

    expect(result.current.fields.name).toMatchObject({ value: "Bob!", saved: "Bob", dirty: true });
    expect(result.current.submitError).toBeNull();

    // The new record's edit is saved through the new record's handlers.
    await wait(500);
    expect(server).toHaveBeenLastCalledWith(2, { name: "Bob!", city: "Bergen" });
  });

  it("a failure of the old record's save reaches the old onError, not submitError", async () => {
    const { result, rerender, onError } = setup(() => Promise.reject(new Error("Down")));

    act(() => result.current.setValue("name", "Ann!"));
    rerender({ id: 2 });
    await wait(0);

    expect(onError).toHaveBeenCalledExactlyOnceWith(1, expect.any(Error));
    expect(result.current.submitError).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("with a save in flight: they follow it, with the old handlers, before the new record's saves", async () => {
    const requests: Deferred[] = [];
    const server = vi.fn<(id: number, values: object) => Promise<void>>(() => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    });
    const { result, rerender } = setup(server);

    act(() => result.current.setValue("name", "Ann!"));
    await wait(500);
    act(() => result.current.setValue("city", "Rome"));
    rerender({ id: 2 });
    act(() => result.current.setValue("city", "Tromso"));
    await wait(500);
    expect(server).toHaveBeenCalledOnce();

    await settle(requests[0]);
    expect(server).toHaveBeenCalledTimes(2);
    expect(server).toHaveBeenLastCalledWith(1, { name: "Ann!", city: "Rome" });

    await settle(requests[1]);
    expect(server).toHaveBeenCalledTimes(3);
    expect(server).toHaveBeenLastCalledWith(2, { name: "Bob", city: "Tromso" });

    await settle(requests[2]);
    expect(result.current.fields.city).toMatchObject({ saved: "Tromso", dirty: false });
  });

  it("the changed fields of the old record are measured against what its last save sent", async () => {
    const requests: { values: object; changed: object; request: Deferred }[] = [];
    const { result, rerender } = renderHook(
      ({ id }: Props) =>
        useForm({
          initial: records[id] ?? { name: "", city: "" },
          autosave: true,
          resetKey: id,
          onSubmit: (values, { changed }) => {
            const request = deferred();
            requests.push({ values, changed, request });
            return request.promise;
          },
        }),
      { initialProps: { id: 1 } },
    );

    act(() => result.current.setValue("name", "Ann!"));
    await wait(500);
    act(() => result.current.setValue("city", "Rome"));
    rerender({ id: 2 });

    await settle(requests[0]?.request);
    expect(requests[1]?.changed).toEqual({ city: "Rome" });
  });

  it("an invalid old record is not sent", async () => {
    const server = vi.fn<(id: number, values: object) => void>();
    const { result, rerender } = renderHook(
      ({ id }: Props) =>
        useForm({
          initial: records[id] ?? { name: "", city: "" },
          fields: { name: { required: true } },
          autosave: true,
          resetKey: id,
          onSubmit: (values) => server(id, values),
        }),
      { initialProps: { id: 1 } },
    );

    act(() => result.current.setValue("name", ""));
    rerender({ id: 2 });
    await wait(5000);

    expect(server).not.toHaveBeenCalled();
  });
});

describe("reset() with changes autosave has not sent", () => {
  it("drops them: reset is starting over (a Cancel button must not save)", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    act(() => result.current.reset());
    await wait(5000);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.values.city).toBe("Oslo");
  });

  it("drops a follow-up waiting for a save in flight too", async () => {
    const { requests, onSubmit } = slowServer<{ name: string; city: string }>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await wait(500);
    act(() => result.current.setValue("name", "Anna"));
    await wait(500);
    act(() => result.current.reset({ name: "Server", city: "Bergen" }));

    await settle(requests[0]?.request);
    await wait(5000);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.fields.city).toMatchObject({ saved: "Bergen", dirty: false });
  });

  it("flush() first keeps them", async () => {
    const onSubmit = vi.fn<() => void>();
    const { result } = renderHook(() => useProfile({ onSubmit }));

    act(() => result.current.setValue("city", "Rome"));
    await act(async () => {
      await result.current.flush();
      result.current.reset();
    });

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
