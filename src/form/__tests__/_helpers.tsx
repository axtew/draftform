import { render } from "@testing-library/react";
import type { ReactNode } from "react";

import { type CheckValues, type Form, type FormOptions, useForm } from "../..";

/**
 * Renders a component with the hook and the given markup. `form.current` is the
 * form of the latest render, for reading state after user actions.
 */
export function renderForm<V>(
  options: FormOptions<V> & CheckValues<V>,
  markup: (form: Form<V>) => ReactNode,
): { form: { current: Form<V> } } & ReturnType<typeof render> {
  let latest: Form<V> | undefined;

  function TestForm() {
    const form = useForm(options);
    latest = form;

    return <form>{markup(form)}</form>;
  }

  const rendered = render(<TestForm />);
  const form = {
    get current(): Form<V> {
      if (latest === undefined) throw new Error("the form has not rendered");
      return latest;
    },
  };

  return { form, ...rendered };
}
