'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Confirmation éphémère (« lien copié », « enregistré »).
 *
 * Implémentation maison plutôt qu'une nouvelle dépendance : le design system
 * n'utilise déjà quasiment aucune des librairies qu'il déclare (Radix compris,
 * avant `Dialog`), et une notification qui s'auto-efface après trois secondes
 * ne justifie pas d'en ajouter une.
 */
export interface ToastTone {
  tone?: 'success' | 'danger' | 'info';
}

interface ToastItem extends ToastTone {
  id: number;
  message: string;
}

interface ToastContextValue {
  push: (message: string, tone?: ToastItem['tone']) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Readonly<Record<NonNullable<ToastItem['tone']>, string>> = {
  success: 'bg-ink text-white',
  danger: 'bg-red-700 text-white',
  info: 'bg-ink text-white',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);

  const push = React.useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);

    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-full px-4 py-2.5 text-body-s font-semibold shadow-lg',
              TONE_CLASSES[toast.tone ?? 'success'],
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** À appeler depuis un composant client, sous un `ToastProvider`. */
export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error('useToast() doit être appelé sous un <ToastProvider>.');
  }

  return context;
}
