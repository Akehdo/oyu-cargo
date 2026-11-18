import { brand } from "../../config/content";

type LogoProps = {
  size?: "sm" | "lg";
  className?: string;
};

/** Text logo: big "OYU" with letter-spaced "CARGO" underneath. */
export function Logo({ size = "sm", className = "" }: LogoProps): JSX.Element {
  return (
    <span
      className={`logo logo-${size} ${className}`.trim()}
      aria-label={brand.name}
    >
      <span className="logo-mark">{brand.logoMark}</span>
      <span className="logo-caption">{brand.logoCaption}</span>
    </span>
  );
}
