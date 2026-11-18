import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";

type TrackTextareaProps = {
  value: string;
  onChange: (value: string) => void;
};

export function TrackTextarea({
  value,
  onChange,
}: TrackTextareaProps): JSX.Element {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(fixTrackKeyboardLayout(event.target.value))}
      placeholder="По одному в строке или через запятую"
      rows={6}
    />
  );
}
