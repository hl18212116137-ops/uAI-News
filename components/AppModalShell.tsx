"use client";

import type { ReactNode } from "react";

export type AppModalShellProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  backdropClassName?: string;
  /** Backdrop only covers the area to the right of this offset in px (e.g. sidebar width). */
  contentInsetLeft?: number;
  disableBackdropClick?: boolean;
  backdropAriaLabel?: string;
  /** `large` uses `.modal-panel-lg` (stronger shadow). */
  panelVariant?: "default" | "large";
  /** Optional `id` of the dialog title element (accessibility). */
  ariaLabelledBy?: string;
};

/**
 * Centered modal: shared backdrop + panel shell. Use `.modal-backdrop` / `.modal-panel*` from globals.css.
 */
export default function AppModalShell({
  isOpen,
  onClose,
  children,
  panelClassName = "",
  backdropClassName = "",
  contentInsetLeft = 0,
  disableBackdropClick = false,
  backdropAriaLabel = "关闭对话框",
  panelVariant = "default",
  ariaLabelledBy,
}: AppModalShellProps) {
  if (!isOpen) return null;

  const panelBase = panelVariant === "large" ? "modal-panel-lg" : "modal-panel";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={backdropAriaLabel}
        className={[
          "modal-backdrop absolute z-0",
          contentInsetLeft > 0 ? "top-0 right-0 bottom-0" : "inset-0",
          backdropClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        style={contentInsetLeft > 0 ? { left: contentInsetLeft } : undefined}
        onClick={disableBackdropClick ? undefined : onClose}
        disabled={disableBackdropClick}
      />
      <div
        className={[
          panelBase,
          "relative z-[1] w-full modal-panel-enter",
          panelClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
    </div>
  );
}
