import { X } from "lucide-react";
import { PropsWithChildren, ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useTelegramBackButton } from "../telegram/useBackButton";

type ModalProps = PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  /** "sheet" slides from the bottom on phones; "dialog" is a small centered box. */
  variant?: "sheet" | "dialog";
}>;

export function Modal({
  open,
  title,
  onClose,
  footer,
  variant = "sheet",
  children,
}: ModalProps): JSX.Element | null {
  const titleId = useId();
  useTelegramBackButton(open, onClose, 10);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={`modal-backdrop modal-${variant}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button ghost"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
