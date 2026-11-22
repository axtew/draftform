import { useFormik } from "formik";

const isEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value);

function validate(values) {
  const errors = {};

  if (values.name.trim() === "") errors.name = "Required";
  else if (values.name.trim().length < 2) errors.name = "At least 2 characters";
  if (values.email.trim() === "") errors.email = "Required";
  else if (!isEmail(values.email)) errors.email = "Enter a valid email";
  if (values.city.length > 30) errors.city = "At most 30 characters";

  return errors;
}

function ProfileForm({ profile, save }) {
  const formik = useFormik({
    initialValues: profile,
    validate,
    // The initial values are the saved ones: after a successful save, the sent values replace them.
    onSubmit: async (values, { resetForm }) => {
      await save(values);
      resetForm({ values });
    },
  });

  const error = (name) =>
    formik.touched[name] && formik.errors[name] ? (
      <p id={`${name}-error`}>{formik.errors[name]}</p>
    ) : null;

  return (
    <form onSubmit={formik.handleSubmit}>
      <label htmlFor="name">Name</label>
      <input id="name" {...formik.getFieldProps("name")} />
      {error("name")}
      <label htmlFor="email">Email</label>
      <input id="email" type="email" {...formik.getFieldProps("email")} />
      {error("email")}
      <label htmlFor="city">City</label>
      <input id="city" {...formik.getFieldProps("city")} />
      {error("city")}
      <label>
        <input
          type="checkbox"
          {...formik.getFieldProps({ name: "newsletter", type: "checkbox" })}
        />{" "}
        Newsletter
      </label>
      <button type="submit" disabled={!formik.dirty || !formik.isValid || formik.isSubmitting}>
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
