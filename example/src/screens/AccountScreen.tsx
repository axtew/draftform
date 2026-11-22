import { useForm } from "draftform";
import { useState } from "react";
import * as z from "zod";

import { TextField } from "../fields";

type Mode = "sign-in" | "sign-up";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password123";
const TAKEN_EMAIL = "taken@example.com";

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A server in the page: one known account, one email that is already taken. */
const accounts = {
  async signIn(email: string, password: string): Promise<void> {
    await wait(700);
    if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
      throw new Error("Wrong email or password");
    }
  },
  async signUp(email: string): Promise<void> {
    await wait(700);
    if (email === TAKEN_EMAIL) throw new Error("This email is already registered");
  },
};

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
});

const signUpSchema = z
  .object({
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    repeat: z.string(),
  })
  .refine((values) => values.password === values.repeat, {
    message: "The passwords do not match",
    path: ["repeat"],
  });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AccountScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [done, setDone] = useState<string | null>(null);

  return (
    <section className="card">
      <h2>Sign in and sign up</h2>
      <p className="intro">
        No autosave here: errors show after you leave a field or press the button, and the first
        field with an error gets the focus. The schema checks the email format and that the
        passwords match.
      </p>

      <div className="segmented" role="group" aria-label="Form">
        <button
          type="button"
          aria-pressed={mode === "sign-in"}
          onClick={() => {
            setMode("sign-in");
            setDone(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === "sign-up"}
          onClick={() => {
            setMode("sign-up");
            setDone(null);
          }}
        >
          Sign up
        </button>
      </div>

      {done !== null ? (
        <div className="success" role="status">
          <p>{done}</p>
          <button type="button" onClick={() => setDone(null)}>
            Start over
          </button>
        </div>
      ) : mode === "sign-in" ? (
        <SignInForm onDone={setDone} />
      ) : (
        <SignUpForm onDone={setDone} />
      )}
    </section>
  );
}

function SignInForm({ onDone }: { onDone: (message: string) => void }) {
  const form = useForm({
    initial: { email: "", password: "" },
    fields: {
      email: { required: "Enter your email", normalize: (value) => value.trim() },
      password: { required: "Enter your password" },
    },
    schema: signInSchema,
    onSubmit: async ({ email, password }) => {
      await accounts.signIn(email, password);
      onDone(`Signed in as ${email}.`);
    },
  });

  return (
    <form className="form" onSubmit={form.handleSubmit} noValidate>
      <p className="hint">
        The button is always on: press it with empty fields to see the errors and the focus. The
        account that works is <code>{DEMO_EMAIL}</code> with <code>{DEMO_PASSWORD}</code>; anything
        else gets an error from the server.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="username"
        props={form.field("email")}
        error={form.fields.email.visibleError}
        errorId={form.errorId("email")}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        props={form.field("password")}
        error={form.fields.password.visibleError}
        errorId={form.errorId("password")}
      />
      {form.submitError !== null && (
        <p className="alert" role="alert">
          {errorMessage(form.submitError)}
        </p>
      )}
      <div className="form-footer">
        <button type="submit" className="primary" disabled={form.pending}>
          {form.pending ? "Signing in..." : "Sign in"}
        </button>
      </div>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: (message: string) => void }) {
  const form = useForm({
    initial: { email: "", password: "", repeat: "", terms: false },
    fields: {
      email: { required: "Enter your email", normalize: (value) => value.trim() },
      password: { required: "Choose a password" },
      repeat: { required: "Repeat the password" },
      terms: { required: "Accept the terms to go on" },
    },
    schema: signUpSchema,
    onSubmit: async ({ email }) => {
      await accounts.signUp(email);
      onDone(`Account created for ${email}.`);
    },
  });

  return (
    <form className="form" onSubmit={form.handleSubmit} noValidate>
      <p className="hint">
        The button turns on once the form is filled in and valid. Try <code>{TAKEN_EMAIL}</code> for
        an error from the server.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        props={form.field("email")}
        error={form.fields.email.visibleError}
        errorId={form.errorId("email")}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        props={form.field("password")}
        error={form.fields.password.visibleError}
        errorId={form.errorId("password")}
      />
      <TextField
        label="Repeat the password"
        type="password"
        autoComplete="new-password"
        props={form.field("repeat")}
        error={form.fields.repeat.visibleError}
        errorId={form.errorId("repeat")}
      />
      <div className="field">
        <label className="check">
          <input type="checkbox" {...form.field("terms")} />I accept the terms
        </label>
        <p className="field-error" id={form.errorId("terms")}>
          {form.fields.terms.visibleError}
        </p>
      </div>
      {form.submitError !== null && (
        <p className="alert" role="alert">
          {errorMessage(form.submitError)}
        </p>
      )}
      <div className="form-footer">
        <button type="submit" className="primary" disabled={!form.canSubmit}>
          {form.pending ? "Creating the account..." : "Create the account"}
        </button>
      </div>
    </form>
  );
}
