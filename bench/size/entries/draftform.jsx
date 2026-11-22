import { useForm } from "draftform";

const isEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value);

function ProfileForm({ profile, save }) {
  const form = useForm({
    initial: profile,
    fields: {
      name: {
        required: true,
        validate: (value) => (value.trim().length < 2 ? "At least 2 characters" : null),
      },
      email: {
        required: true,
        validate: (value) => (isEmail(value) ? null : "Enter a valid email"),
      },
      city: { validate: (value) => (value.length > 30 ? "At most 30 characters" : null) },
    },
    // Only the changed fields; when the request succeeds, the values it sent become saved.
    onSubmit: (_, { changed }) => save(changed),
    autosave: true,
  });

  const error = (name) =>
    form.fields[name].visibleError && (
      <p id={form.errorId(name)}>{form.fields[name].visibleError}</p>
    );

  return (
    <form onSubmit={form.handleSubmit}>
      <label htmlFor={form.fieldId("name")}>Name</label>
      <input {...form.field("name")} />
      {error("name")}
      <label htmlFor={form.fieldId("email")}>Email</label>
      <input type="email" {...form.field("email")} />
      {error("email")}
      <label htmlFor={form.fieldId("city")}>City</label>
      <input {...form.field("city")} />
      {error("city")}
      <label>
        <input type="checkbox" {...form.field("newsletter")} /> Newsletter
      </label>
      <button type="submit" disabled={!form.canSubmit}>
        Save
      </button>
    </form>
  );
}

export function App() {
  return (
    <ProfileForm
      profile={{ name: "Anna", email: "anna@example.com", city: "", newsletter: false }}
      save={(changed) =>
        fetch("/api/me", { method: "PATCH", body: JSON.stringify(changed) }).then((response) => {
          if (!response.ok) throw new Error(response.statusText);
        })
      }
    />
  );
}
