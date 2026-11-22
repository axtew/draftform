import { useForm } from "react-hook-form";

const isEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value);

function ProfileForm({ profile, save }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = useForm({ defaultValues: profile, mode: "onTouched" });

  // The defaults are the saved values: after a successful save, the sent values replace them.
  const onSubmit = async (values) => {
    await save(values);
    reset(values);
  };

  const error = (name) => errors[name] && <p id={`${name}-error`}>{errors[name].message}</p>;

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
      <label htmlFor="name">Name</label>
      <input
        id="name"
        aria-invalid={errors.name !== undefined}
        {...register("name", {
          required: "Required",
          validate: (value) => value.trim().length >= 2 || "At least 2 characters",
        })}
      />
      {error("name")}
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        aria-invalid={errors.email !== undefined}
        {...register("email", {
          required: "Required",
          validate: (value) => isEmail(value) || "Enter a valid email",
        })}
      />
      {error("email")}
      <label htmlFor="city">City</label>
      <input
        id="city"
        aria-invalid={errors.city !== undefined}
        {...register("city", { maxLength: { value: 30, message: "At most 30 characters" } })}
      />
      {error("city")}
      <label>
        <input type="checkbox" {...register("newsletter")} /> Newsletter
      </label>
      <button type="submit" disabled={!isDirty || !isValid || isSubmitting}>
        Save
      </button>
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
