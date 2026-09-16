import { createContext } from 'react'

export type ToastVariant = 'success' | 'error'

export interface ToastContextValue {
  showToast: (text: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined)
