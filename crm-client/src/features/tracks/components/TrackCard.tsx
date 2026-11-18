import { Trash2 } from "lucide-react";
import { getStatusMeta } from "../../../config/statuses";
import type { ClientTrack } from "../../../shared/api/types";
import { CopyButton } from "../../../shared/components/CopyButton";
import { formatDateTime } from "../../../shared/utils/format";
import { TrackProgress } from "./TrackProgress";

export function TrackCard({
  track,
  onDelete,
}: {
  track: ClientTrack;
  onDelete?: (track: ClientTrack) => void;
}): JSX.Element {
  const meta = getStatusMeta(track.status);
  const date = formatDateTime(track.status_updated_at ?? track.created_at);

  return (
    <article className="card track-card">
      <header className="track-header">
        <div className="track-number">
          <strong>{track.track_number}</strong>
          <CopyButton text={track.track_number} title="Скопировать трек-номер" className="small" />
        </div>
        {onDelete && !track.archived ? (
          <button
            type="button"
            className="icon-button ghost small danger-hover"
            title="Удалить трек"
            aria-label="Удалить трек"
            onClick={() => onDelete(track)}
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </header>

      {track.comment ? <p className="track-comment">{track.comment}</p> : null}

      <div className="track-status-row">
        <span className={`badge tone-${meta.tone}`}>{meta.label}</span>
        {date ? <span className="muted small">{date}</span> : null}
      </div>

      <TrackProgress status={track.status} />
    </article>
  );
}
