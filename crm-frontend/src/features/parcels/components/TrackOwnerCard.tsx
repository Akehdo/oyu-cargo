import { UserRound } from "lucide-react";
import { formatDate } from "../../../shared/utils/date";
import type { TrackOwner } from "../../clients/types";

type TrackOwnerCardProps = {
  owner: TrackOwner;
  onClientOpen: (code: number) => void;
};

/** Who the track belongs to: client code and registration number. */
export function TrackOwnerCard({
  owner,
  onClientOpen,
}: TrackOwnerCardProps): JSX.Element {
  const { client } = owner;

  return (
    <div className="track-owner">
      <div className="track-owner-icon">
        <UserRound size={18} />
      </div>
      <div className="track-owner-body">
        <span className="track-owner-label">
          {owner.source === "client_track"
            ? "Клиент добавил посылку к себе"
            : "Клиент по выдаче"}
        </span>
        <button
          className="track-owner-code"
          type="button"
          title="Открыть карточку клиента"
          onClick={() => onClientOpen(owner.code)}
        >
          Код {owner.code}
        </button>
        {client ? (
          <dl>
            <div>
              <dt>Имя</dt>
              <dd>{client.name}</dd>
            </div>
            <div>
              <dt>Номер регистрации</dt>
              <dd>{client.phone ?? "—"}</dd>
            </div>
            {owner.track_comment && (
              <div>
                <dt>Товар</dt>
                <dd>{owner.track_comment}</dd>
              </div>
            )}
            {owner.track_added_at && (
              <div>
                <dt>Трек добавлен</dt>
                <dd>{formatDate(owner.track_added_at)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <small>Клиент не зарегистрирован в приложении.</small>
        )}
      </div>
    </div>
  );
}
