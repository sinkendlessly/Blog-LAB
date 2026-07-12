import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ToastType = "default" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((message: string, type: ToastType = "default") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                "rounded-md px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-5 fade-in",
                t.type === "success" && "bg-emerald-600 text-white",
                t.type === "error" && "bg-red-600 text-white",
                t.type === "default" && "bg-foreground text-background"
              )}
            >
              {t.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
