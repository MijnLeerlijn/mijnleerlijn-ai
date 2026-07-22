import { useId } from "react";
import Label from "@/components/atoms/Label";
import Input from "@/components/atoms/Input";
import Textarea from "@/components/atoms/Textarea";
import FormMessage from "@/components/molecules/FormMessage";

interface ContactFieldProps {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
  disabled?: boolean;
}

// Label + veld + foutmelding als één geheel — zie docs/UI-DESIGN.md §8. Gebruikt
// door ContactForm (organism); nooit een los <input>/<textarea> zonder
// gekoppeld label.
export default function ContactField({
  label,
  name,
  required = false,
  error,
  multiline = false,
  rows,
  placeholder,
  defaultValue,
  disabled,
}: ContactFieldProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          name={name}
          rows={rows}
          error={!!error}
          aria-describedby={errorId}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
        />
      ) : (
        <Input
          id={id}
          name={name}
          error={!!error}
          aria-describedby={errorId}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          disabled={disabled}
        />
      )}
      {error && (
        <FormMessage tone="error" id={errorId}>
          {error}
        </FormMessage>
      )}
    </div>
  );
}
