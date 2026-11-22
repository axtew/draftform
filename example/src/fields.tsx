import type { InputFieldProps } from "draftform";
import type { HTMLInputTypeAttribute } from "react";

interface TextFieldProps {
  label: string;
  /** What `form.field(name)` returns: value, handlers, id and the aria attributes. */
  props: InputFieldProps;
  /** `form.fields[name].visibleError`: set after blur or submit. */
  error: string | null;
  /** `form.errorId(name)`: the field's `aria-describedby` points here while the error shows. */
  errorId: string;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
}

export function TextField({ label, props, error, errorId, type, autoComplete }: TextFieldProps) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      <input {...props} type={type ?? "text"} autoComplete={autoComplete ?? "off"} />
      {/* Always there, so an error that shows on blur does not move what is below it. */}
      <p className="field-error" id={errorId}>
        {error}
      </p>
    </div>
  );
}
