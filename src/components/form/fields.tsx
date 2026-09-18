import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const LABEL_CLASS = 'text-sm font-medium text-neutral-700'
const INPUT_CLASS =
  'min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'

interface FieldWrapperProps {
  label: string
  htmlFor: string
  optional?: boolean
  children: ReactNode
}

function FieldWrapper({ label, htmlFor, optional, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
        {optional ? <span className="text-neutral-400"> (optional)</span> : null}
      </label>
      {children}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  id: string
  label: string
  optional?: boolean
}

export function TextField({ id, label, optional, ...inputProps }: TextFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} optional={optional}>
      <input id={id} className={INPUT_CLASS} {...inputProps} />
    </FieldWrapper>
  )
}

interface MoneyFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  optional?: boolean
  placeholder?: string
}

export function MoneyField({ id, label, value, onChange, optional, placeholder = '0,00' }: MoneyFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} optional={optional}>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${INPUT_CLASS} pr-8`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-neutral-400">
          €
        </span>
      </div>
    </FieldWrapper>
  )
}

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  id: string
  label: string
  optional?: boolean
}

export function TextAreaField({ id, label, optional, ...textareaProps }: TextAreaFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} optional={optional}>
      <textarea id={id} rows={3} className={`${INPUT_CLASS} min-h-24 py-2`} {...textareaProps} />
    </FieldWrapper>
  )
}

interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  id: string
  label: string
  options: SelectOption[]
  placeholder?: string
  optional?: boolean
}

export function SelectField({ id, label, options, placeholder, optional, ...selectProps }: SelectFieldProps) {
  return (
    <FieldWrapper label={label} htmlFor={id} optional={optional}>
      <div className="relative">
        <select id={id} className={`${INPUT_CLASS} appearance-none pr-9`} {...selectProps}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-neutral-400"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </FieldWrapper>
  )
}

interface CheckboxFieldProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function CheckboxField({ id, label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-neutral-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-neutral-300 text-accent focus:ring-accent/30"
      />
      {label}
    </label>
  )
}

interface FormErrorProps {
  errors: string[]
}

export function FormError({ errors }: FormErrorProps) {
  if (errors.length === 0) return null
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <ul className="list-disc space-y-1 pl-4">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  )
}

interface FormActionsProps {
  onCancel: () => void
  saving?: boolean
  saveLabel?: string
}

export function FormActions({ onCancel, saving, saveLabel = 'Speichern' }: FormActionsProps) {
  return (
    <div className="sticky bottom-20 z-10 -mx-4 flex gap-3 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-none lg:bg-transparent lg:p-0">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 flex-1 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
      >
        Abbrechen
      </button>
      <button
        type="submit"
        disabled={saving}
        className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? 'Speichert …' : saveLabel}
      </button>
    </div>
  )
}
