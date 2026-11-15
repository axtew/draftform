import { isSameValue, type Store, type Values } from "../form/_state";
import type { FormOptions } from "../form/_types";

export type SaveOptions = Pick<FormOptions<Values>, "onSubmit" | "onError">;

/** The fields whose value differs from the saved one. */
export function changedValues(values: Values, saved: Values): Partial<Values> {
  const changed: Partial<Values> = {};

  for (const [name, value] of Object.entries(values)) {
    if (!isSameValue(value, saved[name])) changed[name] = value;
  }

  return changed;
}

/**
 * Hands `values` to `onSubmit` and records the outcome; the one place that marks values
 * saved, for submit and autosave alike. Checks nothing but `pending`: validity and
 * dirtiness are the caller's business. `getOptions` is read when needed, so the
 * handlers of the latest render run, even if they changed during the request.
 *
 * Resolves `true` when `onSubmit` succeeded, `false` when a save was already in flight
 * or `onSubmit` failed. A failure keeps values and saved values as they were, so the
 * same submit can be retried.
 */
export async function save(
  store: Store,
  getOptions: () => SaveOptions,
  values: Values,
): Promise<boolean> {
  const { pending, saved, epoch } = store.current;

  if (pending) return false;

  store.dispatch({ type: "submitStart" });

  try {
    await getOptions().onSubmit?.(values, { changed: changedValues(values, saved) });
  } catch (error) {
    store.dispatch({ type: "submitFailed", epoch, error });
    // Called even after a reset: the save of the old data failed, the caller should know.
    getOptions().onError?.(error);
    return false;
  }

  store.dispatch({ type: "submitDone", epoch, sent: values });
  return true;
}
