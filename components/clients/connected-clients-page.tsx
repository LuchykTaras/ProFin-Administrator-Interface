"use client";

import { useEffect, useRef, useState } from "react";
import { ClientsPage } from "@/components/clients/clients-page";
import { NewClientStandaloneA83 } from "@/components/clients/new-client-standalone-a83";
import { getClientDirectoryPage } from "@/lib/client/client-directory-api";
import { getApiErrorMessage } from "@/lib/client/api-client";
import type { ClientDirectoryItem } from "@/lib/contracts/client-directory";

const PAGE_SIZE = 50;

type Props = {
  active: boolean;
  contextKey: string;
  refreshKey: number;
  canCreateClient: boolean;
  onCreateClient: () => void; // Existing cash-operation callback: NOT used here.
  onAdapterReady: () => void; // Compatibility with existing page.tsx.
  onClientCreated?: () => void;
  onDirectoryReadStatus?: (ready: boolean) => void;
};

export function ConnectedClientsPage({
  active,
  contextKey,
  refreshKey,
  canCreateClient,
  onClientCreated,
  onDirectoryReadStatus
}: Props) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [clients, setClients] = useState<ClientDirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
    const [createdMessage, setCreatedMessage] = useState("");

  /*
   * PATCH A8.5.1
   * Stable directory status callback.
   *
   * Prevents parent re-renders from
   * restarting client-directory requests.
   */
  const directoryStatusRef =
    useRef(onDirectoryReadStatus);

  useEffect(() => {
    directoryStatusRef.current =
      onDirectoryReadStatus;
  }, [onDirectoryReadStatus]);

  useEffect(() => {
    if (!active) setStandaloneOpen(false);
  }, [active, contextKey]);

    useEffect(() => {
    if (!active) {
      directoryStatusRef.current?.(false);

      setClients([]);
      setTotal(0);
      setLoading(false);
      setLoaded(false);
      return;
    }

    const controller = new AbortController();

    directoryStatusRef.current?.(false);

    setClients([]);
    setTotal(0);
    setError("");
    setLoading(true);
    setLoaded(false);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await getClientDirectoryPage({
            query, offset, limit: PAGE_SIZE, signal: controller.signal
          });
                    if (controller.signal.aborted) return;

          setClients(data.items);
          setTotal(data.total);
          setLoaded(true);

          /*
           * PATCH A8.5.1
           * Confirm successful directory read.
           */
          directoryStatusRef.current?.(true);
                } catch (reason) {
          if (controller.signal.aborted) return;

          /*
           * PATCH A8.5.1
           * Directory request failed.
           */
          directoryStatusRef.current?.(false);

          setError(getApiErrorMessage(
            reason,
            "Не вдалося завантажити клієнтів філії."
          ));
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, contextKey, refreshKey, localRefreshKey, query, offset]);

  function changeQuery(next: string) {
    if (standaloneOpen) return;
    setCreatedMessage("");
    setLoaded(false);
    setQuery(next);
    setOffset(0);
  }

  function changeOffset(next: number) {
    if (standaloneOpen) return;
    setLoaded(false);
    setOffset(next);
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
        canCreateClient={canCreateClient && loaded && !loading && !error}
        searchDisabled={standaloneOpen}
        onCreateClient={() => setStandaloneOpen(true)}
      />
      {createdMessage && <p role="status" style={{color:"#087d61",padding:12}}>
        {createdMessage}
      </p>}
      <NewClientStandaloneA83
        open={active && standaloneOpen}
        onClose={() => setStandaloneOpen(false)}
        onSuccess={result => {
          setStandaloneOpen(false);
          // Search the newly created ID instead of re-fetching all 3854 clients.
          setQuery(result.clientId);
          setOffset(0);
          setLoaded(false);
          setLocalRefreshKey(value => value + 1);
          setCreatedMessage(`\u041a\u043b\u0456\u0454\u043d\u0442\u0430 \u0441\u0442\u0432\u043e\u0440\u0435\u043d\u043e: ${result.clientId}`);
          onClientCreated?.();
        }}
      />
      {active && !loading && !error && total > PAGE_SIZE && (
        <nav aria-label="Client directory pages"
          style={{display:"flex",justifyContent:"center",alignItems:"center",
            gap:16,marginTop:16}}>
          <button type="button" disabled={offset === 0 || standaloneOpen}
            onClick={() => changeOffset(Math.max(0, offset - PAGE_SIZE))}>
            Попередні
          </button>
          <span>{offset + 1} - {Math.min(offset + clients.length, total)} із {total}</span>
          <button type="button" disabled={offset + PAGE_SIZE >= total || standaloneOpen}
            onClick={() => changeOffset(offset + PAGE_SIZE)}>
            Наступні
          </button>
        </nav>
      )}
    </>
  );
}
