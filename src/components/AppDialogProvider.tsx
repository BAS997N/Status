import React, { FormEvent, ReactNode, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type DialogTone = "info" | "success" | "warning" | "danger";
type DialogKind = "alert" | "confirm" | "prompt";

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
  initialValue?: string;
  tone?: DialogTone;
}

interface DialogRequest extends DialogOptions {
  id: number;
  kind: DialogKind;
  message: string;
  resolve: (value: boolean | string | null) => void;
}

let requestId = 0;
let receiver: ((request: DialogRequest) => void) | null = null;
const waitingRequests: DialogRequest[] = [];

const enqueue = (request: DialogRequest) => {
  if (receiver) receiver(request);
  else waitingRequests.push(request);
};

export const appDialog = {
  alert(message: string, options: DialogOptions = {}) {
    return new Promise<void>((resolve) => {
      enqueue({
        ...options,
        id: ++requestId,
        kind: "alert",
        message,
        resolve: () => resolve(),
      });
    });
  },
  confirm(message: string, options: DialogOptions = {}) {
    return new Promise<boolean>((resolve) => {
      enqueue({
        ...options,
        id: ++requestId,
        kind: "confirm",
        message,
        resolve: (value) => resolve(value === true),
      });
    });
  },
  prompt(message: string, options: DialogOptions = {}) {
    return new Promise<string | null>((resolve) => {
      enqueue({
        ...options,
        id: ++requestId,
        kind: "prompt",
        message,
        resolve: (value) => resolve(typeof value === "string" ? value : null),
      });
    });
  },
};

const toneStyles: Record<DialogTone, { icon: string; button: string }> = {
  info: { icon: "bg-blue-100 text-blue-700", button: "bg-blue-600 hover:bg-blue-700" },
  success: { icon: "bg-emerald-100 text-emerald-700", button: "bg-emerald-600 hover:bg-emerald-700" },
  warning: { icon: "bg-amber-100 text-amber-700", button: "bg-amber-600 hover:bg-amber-700" },
  danger: { icon: "bg-rose-100 text-rose-700", button: "bg-rose-600 hover:bg-rose-700" },
};

export default function AppDialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [inputValue, setInputValue] = useState("");
  const current = queue[0];

  useEffect(() => {
    receiver = (request) => setQueue((items) => [...items, request]);
    if (waitingRequests.length) {
      const requests = waitingRequests.splice(0);
      setQueue((items) => [...items, ...requests]);
    }
    return () => {
      receiver = null;
    };
  }, []);

  useEffect(() => {
    setInputValue(current?.initialValue || "");
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && current.kind !== "alert") {
        event.preventDefault();
        finish(current.kind === "prompt" ? null : false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current]);

  const finish = (value: boolean | string | null) => {
    if (!current) return;
    current.resolve(value);
    setQueue((items) => items.slice(1));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    finish(current?.kind === "prompt" ? inputValue : true);
  };

  const tone = current?.tone || "info";
  const styles = toneStyles[tone];
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;

  return (
    <>
      {children}
      {current && (
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
          dir="rtl"
          role="presentation"
        >
          <form
            onSubmit={submit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 p-5 sm:p-6">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="app-dialog-title" className="text-lg font-black text-slate-900">
                  {current.title || (current.kind === "alert" ? "הודעה" : "אישור פעולה")}
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm font-medium leading-7 text-slate-600">
                  {current.message}
                </p>
                {current.kind === "prompt" && (
                  <input
                    autoFocus
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder={current.placeholder}
                    className="mt-4 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                )}
              </div>
              {current.kind !== "alert" && (
                <button
                  type="button"
                  onClick={() => finish(current.kind === "prompt" ? null : false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="סגירה"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-end">
              {current.kind !== "alert" && (
                <button
                  type="button"
                  onClick={() => finish(current.kind === "prompt" ? null : false)}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-100"
                >
                  {current.cancelLabel || "ביטול"}
                </button>
              )}
              <button
                type="submit"
                className={`rounded-xl px-5 py-2.5 text-sm font-black text-white ${styles.button}`}
              >
                {current.confirmLabel || (current.kind === "alert" ? "הבנתי" : "אישור")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
