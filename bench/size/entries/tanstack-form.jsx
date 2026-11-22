import { useForm } from "@tanstack/react-form";

const isEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value);

function TextField({ field, label, type = "text" }) {
  const { isBlurred, errors } = field.state.meta;
  const error = isBlurred && errors.length > 0 ? errors[0] : null;

  return (
    <>
      <label htmlFor={field.name}>{label}</label>
      <input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={error !== null}
      />
      {error && <p id={`${field.name}-error`}>{error}</p>}
    </>
  );
}

function ProfileForm({ profile, save }) {
  const form = useForm({
    defaultValues: profile,
    // The defaults are the saved values: after a successful save, the sent values replace them.
    onSubmit: async ({ value }) => {
      await save(value);
      form.reset(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: ({ value }) =>
            value.trim() === ""
              ? "Required"
              : value.trim().length < 2
                ? "At least 2 characters"
                : undefined,
        }}
      >
        {(field) => <TextField field={field} label="Name" />}
      </form.Field>
      <form.Field
        name="email"
        validators={{
          onChange: ({ value }) =>
            value.trim() === "" ? "Required" : isEmail(value) ? undefined : "Enter a valid email",
        }}
      >
        {(field) => <TextField field={field} label="Email" type="email" />}
      </form.Field>
      <form.Field
        name="city"
        validators={{
          onChange: ({ value }) => (value.length > 30 ? "At most 30 characters" : undefined),
        }}
      >
        {(field) => <TextField field={field} label="City" />}
      </form.Field>
      <form.Field name="newsletter">
        {(field) => (
          <label>
            <input
              type="checkbox"
              name={field.name}
              checked={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.checked)}
            />{" "}
            Newsletter
          </label>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) => [state.canSubmit, state.isDefaultValue, state.isSubmitting]}
      >
        {([canSubmit, isDefaultValue, isSubmitting]) => (
          <button type="submit" disabled={!canSubmit || isDefaultValue || isSubmitting}>
            Save
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}

export function App() {
  return (
    <ProfileForm
      profile={{ name: "Anna", email: "anna@example.com", city: "", newsletter: false }}
      save={(values) =>
        fetch("/api/me", { method: "PATCH", body: JSON.stringify(values) }).then((response) => {
          if (!response.ok) throw new Error(response.statusText);
        })
      }
    />
  );
}
