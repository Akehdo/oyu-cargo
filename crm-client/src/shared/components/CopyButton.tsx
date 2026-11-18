import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copyText } from "../utils/clipboard";

type CopyButtonProps = {
  text: string;
  /** Visible label; without it the button is icon-only. */
  label?: string;
  copiedLabel?: string;
  title?: string;
  className?: string;
};

export function CopyButton({
  text,
  label,
  copiedLabel = "Скопировано",
  title,
  className = "",
}: CopyButtonProps): JSX.Element {
  const buttonTitle = title ?? label ?? "Скопировать";
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<number>();

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleClick = async () => {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const icon = state === "copied" ? <Check size={18} /> : <Copy size={18} />;
  const baseClass = label ? "secondary-button" : "icon-button";

  return (
    <button
      type="button"
      className={`${baseClass} copy-button ${state === "copied" ? "is-copied" : ""} ${className}`.trim()}
      title={buttonTitle}
      aria-label={label ? undefined : buttonTitle}
      onClick={handleClick}
    >
      {icon}
      {label ? (
        <span>
          {state === "copied"
            ? copiedLabel
            : state === "failed"
              ? "Не удалось"
              : label}
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? copiedLabel : ""}
      </span>
    </button>
  );
}
