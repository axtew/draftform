import { useSyncExternalStore } from "react";

/**
 * A server that lives in the page: two profiles in memory, a configurable delay and a
 * switch that makes the next save fail. Every save is written to a log, so the page
 * can show what was sent, when, and whether two requests were ever in flight at once.
 */

export interface Profile {
  name: string;
  email: string;
  city: string;
  newsletter: boolean;
}

export type ProfileId = "ann" | "bob";

export interface SaveEntry {
  id: number;
  profile: ProfileId;
  /** The body of the request: only the changed fields. */
  changed: Partial<Profile>;
  /** Milliseconds since the page loaded. */
  start: number;
  end: number | null;
  result: "pending" | "ok" | "failed";
  /** Requests in flight right after this one started, itself included. */
  inFlight: number;
}

export interface ServerState {
  profiles: Record<ProfileId, Profile>;
  log: readonly SaveEntry[];
  /** How long a save takes, in milliseconds. */
  delay: number;
  /** The next save fails; the switch turns itself off after that. */
  failNext: boolean;
}

let state: ServerState = {
  profiles: {
    ann: { name: "Ann Lee", email: "ann@example.com", city: "Oslo", newsletter: true },
    bob: { name: "Bob Stone", email: "bob@example.com", city: "Lisbon", newsletter: false },
  },
  log: [],
  delay: 1500,
  failNext: false,
};

const listeners = new Set<() => void>();
let inFlight = 0;
let lastId = 0;

function update(change: Partial<ServerState>): void {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

function updateEntry(id: number, change: Partial<SaveEntry>): void {
  update({ log: state.log.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)) });
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** PATCH /profiles/:id with the changed fields. */
export async function saveProfile(profile: ProfileId, changed: Partial<Profile>): Promise<void> {
  const id = ++lastId;

  inFlight++;
  update({
    log: [
      ...state.log,
      { id, profile, changed, start: performance.now(), end: null, result: "pending", inFlight },
    ],
  });

  await wait(state.delay);
  inFlight--;

  if (state.failNext) {
    update({ failNext: false });
    updateEntry(id, { end: performance.now(), result: "failed" });
    throw new Error("The server could not save the profile");
  }

  update({
    profiles: { ...state.profiles, [profile]: { ...state.profiles[profile], ...changed } },
  });
  updateEntry(id, { end: performance.now(), result: "ok" });
}

export function setDelay(delay: number): void {
  update({ delay });
}

export function setFailNext(failNext: boolean): void {
  update({ failNext });
}

export function clearLog(): void {
  // Requests still in flight stay: their end is yet to come.
  update({ log: state.log.filter((entry) => entry.result === "pending") });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServer(): ServerState {
  return state;
}

export function useServer(): ServerState {
  return useSyncExternalStore(subscribe, getServer);
}
