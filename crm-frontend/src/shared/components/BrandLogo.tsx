type BrandLogoProps = {
  size?: "sm" | "lg";
};

/** OYU Cargo text mark: a big "OYU" with letter-spaced "CARGO" underneath. */
export function BrandLogo({ size = "sm" }: BrandLogoProps): JSX.Element {
  return (
    <span className={`brand-logo brand-logo-${size}`} aria-label="OYU Cargo">
      <b>OYU</b>
      <small>CARGO</small>
    </span>
  );
}
