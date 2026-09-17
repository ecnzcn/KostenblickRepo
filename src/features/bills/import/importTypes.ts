export interface EditableField<T> {
  value: T
  confidence: number
  manuallyVerified: boolean
  sourceText?: string
}

export function editedField<T>(field: EditableField<T>, value: T): EditableField<T> {
  return { ...field, value, confidence: 1, manuallyVerified: true }
}
