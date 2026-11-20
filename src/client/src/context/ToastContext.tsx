import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

type Listener = (t: Toast) => void;
let listener: Listener | null = null;
let nextId = 1;

function emit(kind: ToastKind, text: string) {
  const toast = { id: nextId++, kind, text };
  if (listener) listener(toast);
  else console[kind === 'error' ? 'error' : 'log'](text);
}

/** Save/error feedback from anywhere (components, services). Rendered by <ToastHost />. */
export const notify = {
  success: (text: string) => emit('success', text),
  error: (text: string) => emit('error', text),
  info: (text: string) => emit('info', text),
};

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  useEffect(() => {
    listener = (toast) => {
      setToasts((list) => [...list.slice(-4), toast]);
      // Errors stay longer: they usually need reading
      setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 8000 : 4000);
    };
    return () => {
      listener = null;
    };
  }, [dismiss]);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : undefined}>
            <Icon size={16} />
            <span>{toast.text}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="×">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
