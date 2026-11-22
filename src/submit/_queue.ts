import { deriveFields } from "../form/_derive";
import type { Store, Values } from "../form/_state";
import type { FormOptions } from "../form/_types";
import { save, type Snapshot } from "./_save";

type Options = FormOptions<Values>;

const DEFAULT_DELAY = 500;

/** The autosave wait in milliseconds, or `undefined` when autosave is off. */
export function autosaveDelay(option: Options["autosave"]): number | undefined {
  if (option === undefined || option === false) return undefined;

  return option === true ? DEFAULT_DELAY : (option.delay ?? DEFAULT_DELAY);
}

/** How a save ended. */
interface Outcome {
  ok: boolean;
  /** The values it sent: the very object, so a later check can tell new edits by identity. */
  sent: Values;
  epoch: number;
}

/** Unsent changes of a record the form has left, with that record's handlers. */
interface Leftover extends Snapshot {
  errors: Record<string, string>;
  options: Options;
}

/**
 * A save that started, or what stopped it from starting: `false` for an invalid form,
 * `true` when everything is already saved.
 */
type Started = Promise<Outcome> | boolean;

/**
 * Every save of the form goes through here, one at a time: submit, flush, autosave and
 * the changes of a record left by a `resetKey` change. A request in flight is never
 * aborted: aborting stops the wait, not the server, and a newer request could then be
 * processed before an older one. What comes up meanwhile waits for it and goes in one
 * save with the latest values.
 */
export interface SaveQueue {
  /** A value changed: autosave waits for quiet again. */
  changed: () => void;
  /** A save is in flight. */
  busy: () => boolean;
  /**
   * Saves the latest values now, after the save in flight. Resolves `true` when they
   * are saved, `false` when they are invalid, the save failed, or the form was reset.
   */
  saveNow: () => Promise<boolean>;
  /**
   * The form moves to another record. Changes autosave has not sent yet are sent with
   * `options`, the handlers of the record they were made on. Call before the reset.
   */
  leave: (options: Options) => void;
  /** `reset()`: changes waiting for autosave are dropped. */
  drop: () => void;
  mount: () => void;
  /** Changes waiting for autosave are sent at once. */
  unmount: () => void;
}

/**
 * `getOptions` is called on every use: it gives the options of the latest committed
 * render.
 */
export function createSaveQueue(store: Store, getOptions: () => Options): SaveQueue {
  let running: Promise<Outcome> | null = null;
  let last: Outcome | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Autosave came due while a save was in flight: one more save when it ends. */
  let followUp = false;
  const leftovers: Leftover[] = [];
  let mounted = false;

  const stopTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const send = (snapshot: Snapshot, options: () => Options): Promise<Outcome> => {
    const finish = (ok: boolean): Outcome => {
      last = { ok, sent: snapshot.values, epoch: snapshot.epoch };
      running = null;
      next();
      return last;
    };

    running = save(store, options, snapshot).then(finish, (error: unknown) => {
      // Only a throwing `onError` gets here: the queue goes on, the error goes up.
      finish(false);
      throw error;
    });

    return running;
  };

  /** The form's latest values, if they are valid and not saved yet. */
  const sendLatest = (): Started => {
    const { values, saved, touched, errors, epoch } = store.current;
    const { valid, dirty } = deriveFields(values, saved, touched, errors, getOptions());

    if (!valid || !dirty) return valid;

    // These values hold every change so far: nothing waits any more.
    stopTimer();
    followUp = false;

    return send({ values, saved, epoch }, getOptions);
  };

  const sendLeftover = (leftover: Leftover): Started => {
    // A save of that record in flight at the reset may have saved part of the changes.
    const saved =
      last !== null && last.ok && last.epoch === leftover.epoch ? last.sent : leftover.saved;
    const { values, errors, epoch, options: handlers } = leftover;
    const { valid, dirty } = deriveFields(values, saved, {}, errors, handlers);

    if (!valid || !dirty) return valid;

    // The epoch of the old record: the outcome marks nothing in the new one.
    return send({ values, saved, epoch }, () => handlers);
  };

  /** After a save ends: changes of left records first, then the autosave follow-up. */
  const next = (): void => {
    const leftover = leftovers.shift();

    if (leftover !== undefined) {
      // Nothing to send for this one: on to the next.
      const started = sendLeftover(leftover);
      if (typeof started === "boolean") next();
      return;
    }

    if (followUp) {
      followUp = false;
      void sendLatest();
    }
  };

  /** Autosave is due: now, or after the save in flight. */
  const due = () => {
    if (running === null) void sendLatest();
    else followUp = true;
  };

  return {
    changed: () => {
      const delay = autosaveDelay(getOptions().autosave);

      if (delay === undefined) return;

      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;

        // Turned off during the wait.
        if (autosaveDelay(getOptions().autosave) !== undefined) due();
      }, delay);
    },

    busy: () => running !== null,

    saveNow: async () => {
      const { epoch } = store.current;
      let waited: Outcome | null = null;

      stopTimer();

      for (let current = running; current !== null; current = running) {
        waited = await current;
      }

      const { values } = store.current;

      // Reset while waiting: the values now belong to another record.
      if (store.current.epoch !== epoch) return false;

      // The save waited for failed with these very values: one call, one attempt.
      if (waited !== null && !waited.ok && waited.sent === values) return false;

      const started = sendLatest();

      return typeof started === "boolean" ? started : (await started).ok;
    },

    leave: (options) => {
      if (timer === undefined && !followUp) return;

      stopTimer();
      followUp = false;

      const { values, saved, errors, epoch } = store.current;
      const leftover = { values, saved, errors, epoch, options };

      if (running === null) void sendLeftover(leftover);
      else leftovers.push(leftover);
    },

    drop: () => {
      stopTimer();
      followUp = false;
    },

    mount: () => {
      mounted = true;
    },

    unmount: () => {
      mounted = false;

      // StrictMode unmounts and mounts again at once: a tick later tells a real unmount.
      void Promise.resolve().then(() => {
        if (mounted || timer === undefined) return;

        stopTimer();
        due();
      });
    },
  };
}
