import { Loader2, Search, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PanelHeader } from "../../../shared/components/PanelHeader";
import { ApiError } from "../../../shared/api/http";
import { formatDate } from "../../../shared/utils/date";
import { readableError } from "../../../shared/utils/errors";
import { useAuth } from "../../auth/context/AuthContext";
import {
  getClientCardRequest,
  resetClientPasswordRequest,
  searchClientsRequest,
} from "../api/clientsApi";
import { ClientCardView } from "../components/ClientCardView";
import type { ClientCard, ListClientsResponse } from "../types";

type ClientsPageProps = {
  codeToOpen: number | null;
  onCodeOpened: () => void;
};

export function ClientsPage({
  codeToOpen,
  onCodeOpened,
}: ClientsPageProps): JSX.Element {
  const { api } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ListClientsResponse | null>(null);
  const [card, setCard] = useState<ClientCard | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    userId: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const listRequest = useRef(0);
  const cardRequest = useRef(0);

  const loadList = useCallback(
    async (q: string, nextPage: number) => {
      const current = ++listRequest.current;
      setLoadingList(true);
      try {
        const payload = await searchClientsRequest(api, q, nextPage);
        if (current === listRequest.current) {
          setResults(payload);
        }
      } catch (err) {
        if (current === listRequest.current) {
          setError(readableError(err));
        }
      } finally {
        if (current === listRequest.current) {
          setLoadingList(false);
        }
      }
    },
    [api],
  );

  const openCard = useCallback(
    async (code: number) => {
      const current = ++cardRequest.current;
      setCard(null);
      setLoadingCard(true);
      setError("");
      setNotice("");
      setTemporaryPassword(null);
      try {
        const payload = await getClientCardRequest(api, code);
        if (current === cardRequest.current) {
          setCard(payload);
          requestAnimationFrame(() =>
            document
              .getElementById("client-card")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
        }
      } catch (err) {
        if (current !== cardRequest.current) {
          return;
        }
        setCard(null);
        if (err instanceof ApiError && err.status === 404) {
          setNotice(`Клиент с кодом ${code} не найден.`);
        } else {
          setError(readableError(err));
        }
      } finally {
        if (current === cardRequest.current) {
          setLoadingCard(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    void loadList("", 1);
  }, [loadList]);

  useEffect(() => {
    if (codeToOpen !== null) {
      setQuery(String(codeToOpen));
      void openCard(codeToOpen);
      onCodeOpened();
    }
  }, [codeToOpen, onCodeOpened, openCard]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const q = query.trim();
    setPage(1);
    void loadList(q, 1);
    // A 5-digit query is a client code: open the card right away, even for
    // codes that only exist in old issuances.
    if (/^\d{5}$/.test(q)) {
      void openCard(Number(q));
    }
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    void loadList(query.trim(), nextPage);
  };

  const resetPassword = async () => {
    const client = card?.client;
    if (!client) {
      return;
    }
    if (
      !window.confirm(
        `Сбросить пароль клиента ${client.name} (${client.code})? Старый пароль перестанет работать.`,
      )
    ) {
      return;
    }

    const current = cardRequest.current;
    setResetting(true);
    setTemporaryPassword(null);
    setError("");
    try {
      const { password } = await resetClientPasswordRequest(
        api,
        client.user_id,
      );
      if (current === cardRequest.current) {
        setTemporaryPassword({ userId: client.user_id, password });
      }
    } catch (err) {
      if (current === cardRequest.current) setError(readableError(err));
    } finally {
      setResetting(false);
    }
  };

  const meta = results?.meta;

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <div className="eyebrow">Клиентская база</div>
          <h1>Клиенты</h1>
        </div>
      </header>

      <section className="single-column-grid">
        <div className="panel search-panel">
          <PanelHeader icon={<Search size={18} />} title="Поиск клиента" />
          <form onSubmit={submit} className="search-form">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Код, телефон или имя"
              inputMode="search"
            />
            <button
              className="icon-button"
              disabled={loadingList || loadingCard}
              type="submit"
              title="Найти"
            >
              {loadingList || loadingCard ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <Search size={18} />
              )}
            </button>
          </form>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div id="client-card">
        {card && (
          <ClientCardView
            card={card}
            resettingPassword={resetting}
            temporaryPassword={
              temporaryPassword && temporaryPassword.userId === card.client?.user_id
                ? temporaryPassword.password
                : ""
            }
            onResetPassword={resetPassword}
          />
        )}
      </div>

      <div className="panel list-panel">
        <PanelHeader
          icon={<Users size={18} />}
          title="Зарегистрированные клиенты"
          meta={meta ? `${meta.total}` : undefined}
        />
        {loadingList && !results ? (
          <div className="table-state">
            <Loader2 className="spin" size={18} />
            Загрузка
          </div>
        ) : !results || results.items.length === 0 ? (
          <div className="table-state">Клиенты не найдены.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Имя</th>
                  <th>Телефон</th>
                  <th>Текущие посылки</th>
                  <th>Регистрация</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map((client) => (
                  <tr
                    className="clickable-row"
                    key={client.user_id}
                    onClick={() => void openCard(client.code)}
                  >
                    <td>
                      <button
                        className="entity-id-link client-code-link"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openCard(client.code);
                        }}
                      >
                        {client.code}
                      </button>
                    </td>
                    <td>{client.name}</td>
                    <td>{client.phone ?? "—"}</td>
                    <td>{client.active_tracks}</td>
                    <td>{formatDate(client.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.total_pages > 1 && (
          <div className="pagination">
            <button
              className="ghost-button"
              type="button"
              disabled={page <= 1 || loadingList}
              onClick={() => changePage(page - 1)}
            >
              Назад
            </button>
            <span>
              {page} / {meta.total_pages}
            </span>
            <button
              className="ghost-button"
              type="button"
              disabled={page >= meta.total_pages || loadingList}
              onClick={() => changePage(page + 1)}
            >
              Вперёд
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
