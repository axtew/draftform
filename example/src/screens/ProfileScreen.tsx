import { type FieldState, useForm } from "draftform";
import { useState } from "react";
import * as z from "zod";

import { TextField } from "../fields";
import {
  clearLog,
  type ProfileId,
  type SaveEntry,
  saveProfile,
  setDelay,
  setFailNext,
  useServer,
} from "../profileServer";

const PROFILES: readonly { id: ProfileId; label: string }[] = [
  { id: "ann", label: "Ann" },
  { id: "bob", label: "Bob" },
];

const profileSchema = z.object({
  name: z.string().min(2, "At least 2 characters"),
  email: z.email("Enter a valid email"),
  city: z.string().max(30, "At most 30 characters"),
});

interface Status {
  text: string;
  tone: "ok" | "busy" | "warn" | "error" | "plain";
}

/** Where a field stands, from the form's state and the request in flight. */
function statusOf(
  name: string,
  state: FieldState<string | boolean>,
  sending: ReadonlyMap<string, unknown>,
  pending: boolean,
): Status {
  if (state.error !== null) return { text: "invalid, not saved", tone: "error" };
  if (!state.dirty) return { text: "saved", tone: "ok" };
  if (sending.has(name)) {
    return sending.get(name) === state.value
      ? { text: "saving", tone: "busy" }
      : { text: "edited during the save, goes next", tone: "warn" };
  }
  if (pending) return { text: "waits for the save in flight", tone: "warn" };

  return { text: "unsaved, autosave after a pause", tone: "plain" };
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(2)} s`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProfileScreen() {
  const server = useServer();
  const [profileId, setProfileId] = useState<ProfileId>("ann");

  const form = useForm({
    // Read when the profile changes: the form starts from what the server has.
    initial: profileId === "ann" ? server.profiles.ann : server.profiles.bob,
    fields: { name: { required: "Enter a name" } },
    schema: profileSchema,
    autosave: true,
    resetKey: profileId,
    onSubmit: (_, { changed }) => saveProfile(profileId, changed),
  });

  const inFlight = server.log.find(
    (entry) => entry.result === "pending" && entry.profile === profileId,
  );
  const sending = new Map<string, unknown>(Object.entries(inFlight?.changed ?? {}));
  const mostInFlight = Math.max(0, ...server.log.map((entry) => entry.inFlight));

  return (
    <>
      <section className="card">
        <h2>Profile with autosave</h2>
        <p className="intro">
          Edits are saved half a second after you stop typing, one request at a time. Make the
          server slow, type during a save, and watch the request log: nothing is lost, and the edit
          goes in one follow-up request.
        </p>

        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Profile">
            {PROFILES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === profileId}
                onClick={() => setProfileId(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">
            Edit a field and switch the profile right away: the edit is saved to the profile it was
            made on.
          </p>
        </div>

        <form className="form" onSubmit={form.handleSubmit}>
          <TextField
            label="Name"
            props={form.field("name")}
            error={form.fields.name.visibleError}
            errorId={form.errorId("name")}
          />
          <TextField
            label="Email"
            type="email"
            props={form.field("email")}
            error={form.fields.email.visibleError}
            errorId={form.errorId("email")}
          />
          <TextField
            label="City"
            props={form.field("city")}
            error={form.fields.city.visibleError}
            errorId={form.errorId("city")}
          />
          <label className="check">
            <input type="checkbox" {...form.field("newsletter")} />
            Send me the newsletter
          </label>

          <div className="form-footer">
            <button type="button" disabled={!form.dirty} onClick={() => void form.flush()}>
              Save now
            </button>
            <p className="save-state" aria-live="polite">
              {form.pending
                ? "Saving..."
                : form.dirty
                  ? form.valid
                    ? "Unsaved changes"
                    : "Fix the errors to save"
                  : "All changes saved"}
            </p>
          </div>

          {form.submitError !== null && (
            <p className="alert" role="alert">
              Save failed: {errorMessage(form.submitError)}. Your edits are kept: the next edit or
              Save now tries again.
            </p>
          )}
        </form>
      </section>

      <section className="card">
        <h2>Field status</h2>
        <dl className="flags">
          <div>
            <dt>dirty</dt>
            <dd>{String(form.dirty)}</dd>
          </div>
          <div>
            <dt>pending</dt>
            <dd>{String(form.pending)}</dd>
          </div>
          <div>
            <dt>valid</dt>
            <dd>{String(form.valid)}</dd>
          </div>
        </dl>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Value</th>
              <th scope="col">Saved</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(form.fields).map(([name, state]) => {
              const status = statusOf(name, state, sending, form.pending);

              return (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>
                    <code>{JSON.stringify(state.value)}</code>
                  </td>
                  <td>
                    <code>{JSON.stringify(state.saved)}</code>
                  </td>
                  <td className={`tone-${status.tone}`}>{status.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Server</h2>
        <div className="server-controls">
          <label className="range">
            <span>
              Delay of a save: <strong>{seconds(server.delay)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={3000}
              step={100}
              value={server.delay}
              onChange={(event) => setDelay(Number(event.target.value))}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={server.failNext}
              onChange={(event) => setFailNext(event.target.checked)}
            />
            Fail the next save
          </label>
        </div>
        <table className="table">
          <caption>What the server has stored</caption>
          <thead>
            <tr>
              <th scope="col">Profile</th>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">City</th>
              <th scope="col">Newsletter</th>
            </tr>
          </thead>
          <tbody>
            {PROFILES.map(({ id, label }) => {
              const profile = id === "ann" ? server.profiles.ann : server.profiles.bob;

              return (
                <tr key={id}>
                  <th scope="row">{label}</th>
                  <td>{profile.name}</td>
                  <td>{profile.email}</td>
                  <td>{profile.city}</td>
                  <td>{profile.newsletter ? "yes" : "no"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>Request log</h2>
          <button type="button" onClick={clearLog} disabled={server.log.length === 0}>
            Clear
          </button>
        </div>
        <p className="intro">
          Most requests in flight at once: <strong>{mostInFlight}</strong>. Times are from the page
          load.
        </p>
        <RequestLog entries={server.log} />
      </section>
    </>
  );
}

function RequestLog({ entries }: { entries: readonly SaveEntry[] }) {
  if (entries.length === 0) return <p className="empty">No saves yet: edit a field above.</p>;

  return (
    <table className="table log">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Profile</th>
          <th scope="col">Sent (changed fields)</th>
          <th scope="col">Started</th>
          <th scope="col">Ended</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{entry.id}</td>
            <td>{entry.profile === "ann" ? "Ann" : "Bob"}</td>
            <td>
              <code>{JSON.stringify(entry.changed)}</code>
            </td>
            <td>{seconds(entry.start)}</td>
            <td>{entry.end === null ? "" : seconds(entry.end)}</td>
            <td className={`tone-${RESULT_TONES[entry.result]}`}>{RESULTS[entry.result]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const RESULTS: Record<SaveEntry["result"], string> = {
  pending: "in flight",
  ok: "ok",
  failed: "failed",
};

const RESULT_TONES: Record<SaveEntry["result"], Status["tone"]> = {
  pending: "busy",
  ok: "ok",
  failed: "error",
};
