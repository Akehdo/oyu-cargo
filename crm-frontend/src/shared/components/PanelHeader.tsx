import { ReactNode } from "react";

type PanelHeaderProps = {
  icon: ReactNode;
  title: string;
  meta?: string;
};

export function PanelHeader({
  icon,
  title,
  meta,
}: PanelHeaderProps): JSX.Element {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
      {meta && <span>{meta}</span>}
    </div>
  );
}
