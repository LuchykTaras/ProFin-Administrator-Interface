"use client";

import { useEffect, useState } from "react";
import { ClientsPage } from "@/components/clients/clients-page";
import { getClientDirectoryPage } from "@/lib/client/client-directory-api";
import { getApiErrorMessage } from "@/lib/client/api-client";
import type { ClientDirectoryItem } from "@/lib/contracts/client-directory";

const PAGE_SIZE = 50;

type Props = {
  active: boolean;
  contextKey: string;
  refreshKey: number;
  canCreateClient: boolean;
  onCreateClient: () => void;
};

export function ConnectedClientsPage({
  active, contextKey, refreshKey, canCreateClient, onCreateClient
}: Props) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [clients, setClients] = useState<ClientDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) {
      setClients([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setClients([]);
    setTotal(0);
    setError("");
    setLoading(true);

    const task = setTimeout(() => {
      void (async () => {
        try {
          const data = await getClientDirectoryPage({
            query, offset, limit: PAGE_SIZE, signal: controller.signal
          });
          if (controller.signal.aborted) return;
          // The server verified locationId against the current session.
          setClients(data.items);
          setTotal(data.total);
        } catch (reason) {
          if (controller.signal.aborted) return;
          setError(getApiErrorMessage(
            reason, "Не вдалося завантажити клієнтів поточної філії."
          ));
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, query ? 250 : 0);

    return () => {
      clearTimeout(task);
      controller.abort();
    };
  }, [active, contextKey, refreshKey, query, offset]);

  function changeQuery(next: string) {
    setQuery(next);
    setOffset(0);
  }

  return (
    <>
      <ClientsPage
        active={active}
        clients={clients}
        loading={loading}
        error={error}
        totalCount={total}
        serverSearchQuery={query}
        onSearchQueryChange={changeQuery}
        canCreateClient={canCreateClient}
        onCreateClient={onCreateClient}
      />
      {active && !loading && !error && total > PAGE_SIZE && (
        <nav aria-label="Сторінки клієнтської бази"
             style={{ display: "flex", justifyContent: "center",
                      alignItems: "center", gap: 16, marginTop: 16 }}>
          <button type="button" disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            Попередні
          </button>
          <span>{offset + 1}–{Math.min(offset + clients.length, total)} із {total}</span>
          <button type="button" disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}>
            Наступні
          </button>
        </nav>
      )}
    </>
  );
}
