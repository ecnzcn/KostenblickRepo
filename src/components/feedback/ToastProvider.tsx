import { useCallback, useState, type PropsWithChildren } from 'react'
import { ToastContext, type ToastVariant } from './ToastContext'

interface ToastMessage {
  id: string
  text: string
  variant: ToastVariant
}

const AUTO_DISMISS_MS = 3000

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((text: string, variant: ToastVariant = 'success') => {
    const id = crypto.randomUUID()
    setToasts((current) => [...current, { id, text, variant }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, AUTO_DISMISS_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${
              toast.variant === 'error' ? 'bg-red-600' : 'bg-neutral-900'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
