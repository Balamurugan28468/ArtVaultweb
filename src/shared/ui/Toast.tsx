import { create } from 'zustand'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastStore {
  toasts: ToastItem[]
  push: (message: string, tone: ToastTone) => void
  dismiss: (id: number) => void
}

let nextId = 0
const AUTO_DISMISS_MS = 5000

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, tone) => {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }))
    // Toasts are meant to be transient — without this, one sitting at
    // `top-4` (see Toaster below) can cover fixed page chrome like the top
    // bar's account menu indefinitely until someone manually dismisses it.
    // The manual dismiss button stays too, for anyone (including a
    // screen-reader user) who wants it gone sooner or needs more time to
    // read it before it goes.
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export function useToast() {
  const push = useToastStore((state) => state.push)
  return {
    success: (message: string) => push(message, 'success'),
    error: (message: string) => push(message, 'error'),
    info: (message: string) => push(message, 'info'),
  }
}

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-success/40 bg-surface-elevated text-success',
  error: 'border-danger/40 bg-surface-elevated text-danger',
  info: 'border-border-strong bg-surface-elevated text-text-primary',
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 top-4 z-[var(--z-index-toast)] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`w-full max-w-sm rounded-md border px-4 py-3 text-sm shadow-elevated ${TONE_CLASSES[toast.tone]}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="text-text-muted hover:text-text-primary"
            >
              &times;
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
