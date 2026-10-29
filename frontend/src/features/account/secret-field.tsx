import { Input } from "../../shared/ui/input";
export function SecretField({
  id,
  label,
  name = id,
  minLength,
  autoComplete = "off",
}: {
  id: string;
  label: string;
  name?: string;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        name={name}
        type="password"
        required
        minLength={minLength}
        maxLength={128}
        autoComplete={autoComplete}
      />
    </div>
  );
}
