import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "default" | "compact";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "secondary", size = "default", className = "", ...props }: ButtonProps) {
  const variantClass = variant === "primary" ? "gold-button" : "ghost-button";
  const classes = [variantClass, size === "compact" && "compact-button", variant === "danger" && "danger-action", className]
    .filter(Boolean)
    .join(" ");
  return <button {...props} className={classes} />;
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  label: string;
  value: string | number;
  onValueChange?: (value: string) => void;
  icon?: ReactNode;
  fieldClassName?: string;
};

export function TextField({ label, value, onValueChange, type = "text", icon, fieldClassName = "", className = "", ...inputProps }: TextFieldProps) {
  const fieldClasses = ["field", fieldClassName].filter(Boolean).join(" ");
  const displayValue = type === "number" && value === 0 ? "" : value;
  return (
    <label className={["ui-field-label", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <div className={[fieldClasses, "ui-field-control"].join(" ")}>
        {icon}
        <input {...inputProps} type={type} value={displayValue} onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined} />
      </div>
    </label>
  );
}

export type SelectOption = { value: string; label: string };

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  selectClassName?: string;
};

type SelectControlProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
};

export function SelectControl({ value, onValueChange, options, placeholder, className = "", ...selectProps }: SelectControlProps) {
  return (
    <select {...selectProps} className={["ui-select-control", className].filter(Boolean).join(" ")} value={value} onChange={(event) => onValueChange(event.target.value)}>
      {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export function SelectField({ label, value, onValueChange, options, placeholder, className = "", selectClassName = "", ...selectProps }: SelectFieldProps) {
  return (
    <label className={["ui-field-label", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <SelectControl {...selectProps} className={selectClassName} value={value} onValueChange={onValueChange} options={options} placeholder={placeholder} />
    </label>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

export function TextAreaField({ label, value, onValueChange, className = "", ...textareaProps }: TextAreaFieldProps) {
  return (
    <label className={["ui-field-label", className].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <textarea {...textareaProps} value={value} onChange={(event) => onValueChange(event.target.value)} />
    </label>
  );
}

export function SectionHeader({ title, children, className = "" }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={["section-title", className].filter(Boolean).join(" ")}>
      <h2>{title}</h2>
      <span />
      {children}
    </div>
  );
}
