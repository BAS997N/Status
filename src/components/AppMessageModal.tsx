import React, { useEffect } from "react";
import {
  AlertCircle,
  CheckCircle,
  Info,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export type AppMessageType =
  | "success"
  | "error"
  | "info";

interface AppMessageModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: AppMessageType;
  onClose: () => void;
}

export default function AppMessageModal({
  isOpen,
  title,
  message,
  type = "info",
  onClose,
}: AppMessageModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Enter") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const headerClass =
    type === "success"
      ? "bg-emerald-700"
      : type === "error"
      ? "bg-rose-700"
      : "bg-blue-700";

  const buttonClass =
    type === "success"
      ? "bg-emerald-700 hover:bg-emerald-800"
      : type === "error"
      ? "bg-rose-700 hover:bg-rose-800"
      : "bg-blue-700 hover:bg-blue-800";

  const Icon =
    type === "success"
      ? CheckCircle
      : type === "error"
      ? AlertCircle
      : Info;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[14000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm"
          dir="rtl"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 15 }}
            transition={{ duration: 0.15 }}
            onClick={(event) => event.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden text-right"
          >
            <div
              className={`p-4 text-white flex items-center justify-between gap-3 ${headerClass}`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5 shrink-0" />

                <h3 className="text-sm font-black">
                  {title}
                </h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-white opacity-80 hover:opacity-100 cursor-pointer"
                aria-label="סגור הודעה"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-700 font-bold leading-relaxed whitespace-pre-line">
                {message}
              </p>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className={`px-5 py-2 text-white rounded-lg text-xs font-black transition cursor-pointer ${buttonClass}`}
              >
                אישור
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
