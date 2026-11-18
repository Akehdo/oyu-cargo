import { fixTrackKeyboardLayout } from "../../../shared/utils/trackNumbers";

export function parseTracks(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((track) => fixTrackKeyboardLayout(track.trim()))
    .filter(Boolean);
}
