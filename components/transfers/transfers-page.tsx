"use client";

import { UkrainianDatePicker } from "@/components/ukrainian-date-picker";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  X
} from "lucide-react";

import { getApiErrorMessage } from "@/lib/client/api-client";
import { getInventory } from "@/lib/client/inventory-api";

import {
  acceptTransfer,
  createTransfer,
  getTransferInbox,
  getTransferOutbox,
  getTransferWorkspaceSettings,
  previewTransfer,
  returnTransfer
} from "@/lib/client/operational-commands-api";

import type {
  InventoryLotItem
} from "@/lib/contracts/inventory";

import type {
  IncomingTransferItem,
  OutgoingTransferItem,
  TransferPlanResult,
  TransferRouteOption
} from "@/lib/contracts/operational-commands";

import css from "./transfers-page.module.css";


// ============================================================
// Types
// ============================================================

type TransfersPageProps = {
  active: boolean;
  contextKey: string;
};

type TransferTab =
  | "outgoing"
  | "sent"
  | "incoming";

type LotAction =
  | "stock"
  | "move";

type IncomingAction =
  | "ACCEPT"
  | "RETURN";

type TransferConfirmation = {
  item: IncomingTransferItem;
  action: IncomingAction;
} | null;


// ============================================================
// Formatting and validation helpers
// ============================================================

const quantityFormatter = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 3
});

function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return value;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

function getTodayLocal(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function createIdempotencyKey(): string {
  return `transfer-${crypto.randomUUID()}`;
}

function hasTransferableStock(lot: InventoryLotItem): boolean {
  return (
    Number.isFinite(lot.availableQuantity) &&
    lot.availableQuantity > 0
  );
}


// ============================================================
// Outgoing lots table
// ============================================================

type OutgoingLotsProps = {
  lots: InventoryLotItem[];
  filter: string;
  loading: boolean;
  working: boolean;
  hasRoutes: boolean;
  actions: Record<string, LotAction>;
  onFilterChange: (value: string) => void;
  onActionChange: (lotId: string, action: LotAction) => void;
  onExecute: (lot: InventoryLotItem) => void;
};

function OutgoingLotsTable({
  lots,
  filter,
  loading,
  working,
  hasRoutes,
  actions,
  onFilterChange,
  onActionChange,
  onExecute
}: OutgoingLotsProps) {
  return (
    <>
      <div className={css.search}>
        <Search size={17} />

        <input
          aria-label="Пошук партій"
          placeholder="Пошук за назвою, серією або lot-ID..."
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
      </div>

      {!hasRoutes && (
        <div className={css.note}>
          Немає активного маршруту відправлення.
          Маршрути беруться тільки з Neon transfer_routes.
        </div>
      )}

      <div className={css.tableScroll}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Найменування</th>
              <th>Lot-ID / серія</th>
              <th>Термін</th>
              <th>Залишок</th>
              <th>Статус</th>
              <th>Дія</th>
            </tr>
          </thead>

          <tbody>
            {lots.map((lot) => {
              const canTransfer = hasTransferableStock(lot);
              const selectedAction = actions[lot.lotId] ?? "stock";

              const actionDisabled =
                !canTransfer ||
                !hasRoutes ||
                working;

              return (
                <tr key={lot.lotId}>
                  <td>
                    <strong>{lot.inventoryName}</strong>
                    <small>{lot.inventoryType}</small>
                  </td>

                  <td>
                    <code>{lot.lotId}</code>
                    <small>{lot.series || "Без серії"}</small>
                  </td>

                  <td>{formatDate(lot.expiryDate)}</td>

                  <td className={css.quantity}>
                    {formatQuantity(lot.availableQuantity)}
                  </td>

                  <td>{lot.status}</td>

                  <td>
                    <div className={css.rowActions}>
                      <select
                        aria-label={`Дія з партією ${lot.lotId}`}
                        value={selectedAction}
                        disabled={actionDisabled}
                        onChange={(event) => {
                          const action: LotAction =
                            event.target.value === "move"
                              ? "move"
                              : "stock";

                          onActionChange(lot.lotId, action);
                        }}
                      >
                        <option value="stock">На складі</option>

                        {canTransfer && (
                          <option value="move">Перемістити</option>
                        )}
                      </select>

                      {selectedAction === "move" && (
                        <button
                          type="button"
                          className={css.secondary}
                          disabled={actionDisabled}
                          onClick={() => onExecute(lot)}
                        >
                          Виконати дію
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {lots.length === 0 && !loading && (
        <div className={css.empty}>
          Партій за цим запитом не знайдено.
        </div>
      )}
    </>
  );
}


// ============================================================
// Sent transfers table
// ============================================================

type SentTransfersProps = {
  items: OutgoingTransferItem[];
  loading: boolean;
};

function SentTransfersTable({
  items,
  loading
}: SentTransfersProps) {
  return (
    <>
      <div className={css.tableScroll}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Transfer ID</th>
              <th>Товар / партія</th>
              <th>Одержувач</th>
              <th>Кількість</th>
              <th>Статус</th>
              <th>Контроль двох журналів</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={`${item.routeId}:${item.transferId}`}>
                <td>
                  <code>{item.transferId}</code>
                </td>

                <td>
                  <strong>{item.inventoryName}</strong>
                  <small>{item.sourceLotId}</small>
                </td>

                <td>{item.destinationBranch}</td>

                <td className={css.quantity}>
                  {formatQuantity(item.quantity)}
                </td>

                <td>{item.status}</td>

                <td>
                  {item.pairedVerified
                    ? "ID і кількість збігаються"
                    : "Потрібна звірка — не повторюйте передачу"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className={css.empty}>
          Зареєстрованих вихідних передач немає.
        </div>
      )}
    </>
  );
}


// ============================================================
// Incoming transfers table
// ============================================================

type IncomingTransfersProps = {
  items: IncomingTransferItem[];
  loading: boolean;
  working: boolean;
  writeEnabled: boolean;
  hasRoutes: boolean;
  onConfirm: (
    item: IncomingTransferItem,
    action: IncomingAction
  ) => void;
};

function IncomingTransfersTable({
  items,
  loading,
  working,
  writeEnabled,
  hasRoutes,
  onConfirm
}: IncomingTransfersProps) {
  const buttonsDisabled = !writeEnabled || working;

  return (
    <>
      {!hasRoutes && (
        <div className={css.note}>
          Для цієї філії ще немає активного вхідного маршруту.
        </div>
      )}

      <div className={css.tableScroll}>
        <table className={css.table}>
          <thead>
            <tr>
              <th>Передача / партія</th>
              <th>Товар</th>
              <th>Відправник</th>
              <th>Кількість</th>
              <th>Статус</th>
              <th>Дії</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={`${item.routeId}:${item.transferId}`}>
                <td>
                  <code>{item.transferId}</code>
                  <small>{item.sourceLotId}</small>
                </td>

                <td>
                  <strong>{item.inventoryName}</strong>

                  <small>
                    {item.series || "Без серії"} · до{" "}
                    {formatDate(item.expiryDate)}
                  </small>
                </td>

                <td>{item.sourceBranch}</td>

                <td className={css.quantity}>
                  {formatQuantity(item.quantity)}
                </td>

                <td>{item.status}</td>

                <td>
                  <div className={css.rowActions}>
                    {item.canAccept && (
                      <button
                        type="button"
                        className={css.primary}
                        disabled={buttonsDisabled}
                        onClick={() => onConfirm(item, "ACCEPT")}
                      >
                        Прийняти
                      </button>
                    )}

                    {item.canReturn && (
                      <button
                        type="button"
                        className={css.secondary}
                        disabled={buttonsDisabled}
                        onClick={() => onConfirm(item, "RETURN")}
                      >
                        Повернути
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && !loading && (
        <div className={css.empty}>
          <PackageCheck size={28} />
          Вхідних переміщень поки немає.
        </div>
      )}
    </>
  );
}


// ============================================================
// Transfer creation dialog
// ============================================================

type TransferDialogProps = {
  lot: InventoryLotItem;
  routes: TransferRouteOption[];
  routeId: string;
  quantity: string;
  operationDate: string;
  plan: TransferPlanResult | null;
  working: boolean;
  writeEnabled: boolean;
  onClose: () => void;
  onRouteChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onVerify: () => void;
  onConfirm: () => void;
};

function TransferDialog({
  lot,
  routes,
  routeId,
  quantity,
  operationDate,
  plan,
  working,
  writeEnabled,
  onClose,
  onRouteChange,
  onQuantityChange,
  onDateChange,
  onVerify,
  onConfirm
}: TransferDialogProps) {
  const selectedRoute = routes.find(
    (route) => route.routeId === routeId
  );

  const numericQuantity = Number(quantity);

  const canVerify =
    Boolean(selectedRoute) &&
    quantity.trim() !== "" &&
    Number.isFinite(numericQuantity) &&
    numericQuantity > 0 &&
    numericQuantity <= lot.availableQuantity &&
    Boolean(operationDate) &&
    !working;

  const canConfirm =
    plan !== null &&
    writeEnabled &&
    !working;

  return (
    <div
      className={css.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Оформити міжфілійне переміщення"
        className={css.dialog}
      >
        <div className={css.dialogHeader}>
          <h3>Перемістити партію</h3>

          <button
            type="button"
            aria-label="Закрити"
            disabled={working}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className={css.detail}>
          <span>Найменування</span>
          <strong>{lot.inventoryName}</strong>

          <span>Lot-ID</span>
          <code>{lot.lotId}</code>

          <span>Серія</span>
          <strong>{lot.series || "—"}</strong>

          <span>Придатна до</span>
          <strong>{formatDate(lot.expiryDate)}</strong>

          <span>Доступно</span>
          <strong>{formatQuantity(lot.availableQuantity)}</strong>
        </div>

        <label className={css.label}>
          Філія-одержувач

          <select
            value={routeId}
            disabled={working}
            onChange={(event) => onRouteChange(event.target.value)}
          >
            {routes.map((route) => (
              <option
                key={route.routeId}
                value={route.routeId}
              >
                {route.counterpartyLocationName}
              </option>
            ))}
          </select>
        </label>

        <div className={css.fields}>
          <label className={css.label}>
            Кількість

            <input
              type="number"
              min="0.001"
              step="any"
              max={lot.availableQuantity}
              value={quantity}
              disabled={working}
              onChange={(event) => {
                onQuantityChange(event.target.value);
              }}
            />
          </label>

          <label className={css.label}>
            Дата

            <UkrainianDatePicker
              value={operationDate}
              disabled={working}
              onChange={onDateChange}
              ariaLabel="Дата переміщення"
            />
          </label>
        </div>

        {plan && (
          <div className={css.plan} role="status">
            <strong>
              <CheckCircle2 size={18} />
              План перевірено — жодного запису ще не створено
            </strong>

            <p>
              Передача: {formatQuantity(plan.quantity)} од.
              з «{plan.sourceBranch}» до «{plan.destinationBranch}».
            </p>

            <p>
              Залишок: {formatQuantity(plan.sourceBalanceBefore)}
              {" → "}
              {formatQuantity(plan.sourceBalanceAfter)}
            </p>

            {plan.warnings.map((warning, index) => (
              <p key={index}>
                ⚠ {warning}
              </p>
            ))}

            <small>
              Після підтвердження у філії-одержувача буде
              створена заблокована партія до приймання.
              Вартість адміністратору не показується.
            </small>
          </div>
        )}

        <div className={css.buttons}>
          <button
            type="button"
            className={css.secondary}
            disabled={working}
            onClick={onClose}
          >
            Закрити
          </button>

          <button
            type="button"
            className={css.secondary}
            disabled={!canVerify}
            onClick={onVerify}
          >
            {working ? "Перевірка..." : "Перевірити план"}
          </button>

          <button
            type="button"
            className={css.primary}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {working ? "Виконання..." : "Підтвердити передачу"}
          </button>
        </div>
      </section>
    </div>
  );
}


// ============================================================
// Incoming confirmation dialog
// ============================================================

type ConfirmationDialogProps = {
  confirmation: NonNullable<TransferConfirmation>;
  working: boolean;
  writeEnabled: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function ConfirmationDialog({
  confirmation,
  working,
  writeEnabled,
  onClose,
  onConfirm
}: ConfirmationDialogProps) {
  const { item, action } = confirmation;
  const isAccept = action === "ACCEPT";

  return (
    <div className={css.overlay} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Підтвердження вхідного переміщення"
        className={css.dialog}
      >
        <div className={css.dialogHeader}>
          <h3>
            {isAccept
              ? "Прийняти передачу"
              : "Повернути відправнику"}
          </h3>

          <button
            type="button"
            aria-label="Закрити"
            disabled={working}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className={css.detail}>
          <span>Transfer ID</span>
          <code>{item.transferId}</code>

          <span>Товар</span>
          <strong>{item.inventoryName}</strong>

          <span>Звідки</span>
          <strong>{item.sourceBranch}</strong>

          <span>Кількість</span>
          <strong>{formatQuantity(item.quantity)}</strong>
        </div>

        <p>
          {isAccept
            ? "Підтвердження приймання розблокує партію лише після перевірки обох таблиць."
            : "Повернення доступне лише до приймання та має відновити залишок відправника після перевірки обох таблиць."}
        </p>

        <div className={css.buttons}>
          <button
            type="button"
            className={css.secondary}
            disabled={working}
            onClick={onClose}
          >
            Скасувати
          </button>

          <button
            type="button"
            className={css.primary}
            disabled={working || !writeEnabled}
            onClick={onConfirm}
          >
            {working ? "Виконання..." : "Підтвердити дію"}
          </button>
        </div>
      </section>
    </div>
  );
}


// ============================================================
// Main transfers page
// ============================================================

export function TransfersPage({
  active,
  contextKey
}: TransfersPageProps) {
  // Navigation

  const [tab, setTab] = useState<TransferTab>("outgoing");

  // Server data

  const [routes, setRoutes] = useState<TransferRouteOption[]>([]);
  const [lots, setLots] = useState<InventoryLotItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingTransferItem[]>([]);
  const [sent, setSent] = useState<OutgoingTransferItem[]>([]);

  const [writeEnabled, setWriteEnabled] = useState(false);

  // UI state

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");

  // PATCH 55.9.7 — незалежні помилки джерел.
  const [loadFailures, setLoadFailures] = useState({
    inventory: false,
    inbox: false,
    outbox: false
  });

  const [refreshKey, setRefreshKey] = useState(0);

  // Transfer form

  const [lotActions, setLotActions] = useState<
    Record<string, LotAction>
  >({});

  const [selectedLot, setSelectedLot] =
    useState<InventoryLotItem | null>(null);

  const [routeId, setRouteId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const [operationDate, setOperationDate] =
    useState(getTodayLocal());

  const [plan, setPlan] =
    useState<TransferPlanResult | null>(null);

  const [confirmation, setConfirmation] =
    useState<TransferConfirmation>(null);

  // Stable keys prevent duplicate writes after network errors.

  const transferKeyRef = useRef<string | null>(null);

  const incomingKeysRef = useRef<Map<string, string>>(
    new Map()
  );


  // ----------------------------------------------------------
  // Derived data
  // ----------------------------------------------------------

  const outgoingRoutes = useMemo(
    () => routes.filter((route) => route.direction === "OUTGOING"),
    [routes]
  );

  const incomingRoutes = useMemo(
    () => routes.filter((route) => route.direction === "INCOMING"),
    [routes]
  );

  const selectedRoute = useMemo(
    () => outgoingRoutes.find((route) => route.routeId === routeId),
    [outgoingRoutes, routeId]
  );

  const filteredLots = useMemo(() => {
    const search = filter.trim().toLocaleLowerCase("uk-UA");

    if (!search) {
      return lots;
    }

    return lots.filter((lot) => {
      const searchableFields = [
        lot.lotId,
        lot.inventoryName,
        lot.series ?? "",
        lot.status
      ];

      return searchableFields.some((value) =>
        value.toLocaleLowerCase("uk-UA").includes(search)
      );
    });
  }, [lots, filter]);

  const pendingIncomingCount = useMemo(
    () => incoming.filter((item) => item.canAccept).length,
    [incoming]
  );


  // ----------------------------------------------------------
  // Form helpers
  // ----------------------------------------------------------

  const closeTransferForm = useCallback(() => {
    setSelectedLot(null);
    setPlan(null);
    setRouteId("");
    setQuantity("1");
    setOperationDate(getTodayLocal());

    transferKeyRef.current = null;
  }, []);

  const refreshData = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  function updateTransferForm(update: () => void) {
    update();

    setPlan(null);
    transferKeyRef.current = null;
  }

  function beginTransfer(lot: InventoryLotItem) {
    closeTransferForm();

    setError("");
    setNotice("");

    setSelectedLot(lot);
    setRouteId(outgoingRoutes[0]?.routeId ?? "");

    setQuantity(
      String(Math.min(lot.availableQuantity, 1))
    );
  }

  function changeLotAction(
    lotId: string,
    action: LotAction
  ) {
    setLotActions((current) => ({
      ...current,
      [lotId]: action
    }));
  }


  // ----------------------------------------------------------
  // Load data from the server
  // ----------------------------------------------------------

    // PATCH 55.9.7
  // Незалежне завантаження чотирьох джерел.

  useEffect(() => {
    if (!active) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError("");
    setWriteEnabled(false);

    setLoadFailures({
      inventory: false,
      inbox: false,
      outbox: false
    });

    Promise.allSettled([
      getTransferWorkspaceSettings(controller.signal),
      getInventory(controller.signal),
      getTransferInbox(controller.signal),
      getTransferOutbox(controller.signal)
    ])
      .then(([settings, inventory, inbox, outbox]) => {
        if (cancelled) {
          return;
        }

        const errors: string[] = [];

        // 1. Маршрути
        if (settings.status === "fulfilled") {
          setRoutes(settings.value.routes);
        } else {
          setRoutes([]);

          errors.push(
            "Маршрути: " +
            getApiErrorMessage(
              settings.reason,
              "не вдалося завантажити маршрути."
            )
          );
        }

        // 2. Склад
        if (inventory.status === "fulfilled") {
          setLots(inventory.value.items);
        } else {
          setLots([]);

          errors.push(
            "Склад: " +
            getApiErrorMessage(
              inventory.reason,
              "дані складу недоступні."
            )
          );
        }

        // 3. Вхідні переміщення
        if (inbox.status === "fulfilled") {
          setIncoming(inbox.value.items);
        } else {
          setIncoming([]);

          errors.push(
            "Вхідні переміщення: " +
            getApiErrorMessage(
              inbox.reason,
              "не вдалося отримати вхідні передачі."
            )
          );
        }

        // 4. Відправлені переміщення
        if (outbox.status === "fulfilled") {
          setSent(outbox.value.items);
        } else {
          setSent([]);

          errors.push(
            "Відправлені переміщення: " +
            getApiErrorMessage(
              outbox.reason,
              "не вдалося отримати журнал передач."
            )
          );
        }

        setLoadFailures({
          inventory: inventory.status === "rejected",
          inbox: inbox.status === "rejected",
          outbox: outbox.status === "rejected"
        });

        // Запис дозволено тільки коли всі джерела
        // успішно завантажилися і сервер явно дозволив.
        const allLoaded =
          settings.status === "fulfilled" &&
          inventory.status === "fulfilled" &&
          inbox.status === "fulfilled" &&
          outbox.status === "fulfilled";

        setWriteEnabled(
          allLoaded &&
          settings.status === "fulfilled" &&
          settings.value.writeEnabled === true
        );

        setError(errors.join(" | "));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, contextKey, refreshKey]);


  // ----------------------------------------------------------
  // Reset UI after switching the active location
  // ----------------------------------------------------------

  useEffect(() => {
    closeTransferForm();

    setConfirmation(null);
    setFilter("");
    setLotActions({});
    setRoutes([]);
    setLots([]);
    setIncoming([]);
    setSent([]);
    setWriteEnabled(false);

    incomingKeysRef.current.clear();
  }, [contextKey, closeTransferForm]);


  // ----------------------------------------------------------
  // Preview transfer without writing data
  // ----------------------------------------------------------

  async function verifyTransferPlan() {
    if (!selectedLot || !selectedRoute || working) {
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const result = await previewTransfer({
        input: {
          routeId,
          sourceLotId: selectedLot.lotId,
          quantity: Number(quantity),
          operationDate
        }
      });

      if (result.sourceLotId !== selectedLot.lotId) {
        throw new Error("План повернув іншу партію.");
      }

      setPlan(result);
      transferKeyRef.current = createIdempotencyKey();
    } catch (cause) {
    setError(
    getApiErrorMessage(
      cause,
      "Не вдалося перевірити план переміщення."
    )
  );

  setPlan(null);
} finally {
  setWorking(false);
}
  }


  // ----------------------------------------------------------
  // Confirm outgoing transfer
  // ----------------------------------------------------------

  async function confirmTransfer() {
    if (
      !selectedLot ||
      !selectedRoute ||
      !plan ||
      !writeEnabled ||
      working
    ) {
      return;
    }

    setWorking(true);
    setError("");

    if (!transferKeyRef.current) {
      transferKeyRef.current = createIdempotencyKey();
    }

    try {
      const response = await createTransfer({
        idempotencyKey: transferKeyRef.current,

        input: {
          routeId,
          sourceLotId: selectedLot.lotId,
          quantity: plan.quantity,
          expectedSourceBalance: plan.sourceBalanceBefore,
          operationDate: plan.operationDate
        }
      });

      setNotice(
        `Передачу ${response.result.transferId} оформлено. ` +
        "Статус: очікує приймання у філії-одержувача."
      );

      closeTransferForm();
      refreshData();
    } catch (cause) {
      setError(
     getApiErrorMessage(
    cause,
    "Не вдалося підтвердити передачу."
     ) +
    " Перевірте стан переміщення перед повтором; " +
    "той самий ключ буде використано повторно."
    );
    } finally {
      setWorking(false);
    }
  }


  // ----------------------------------------------------------
  // Confirm incoming transfer or return
  // ----------------------------------------------------------

  async function confirmIncomingAction() {
    if (!confirmation || !writeEnabled || working) {
      return;
    }

    const { item, action } = confirmation;

    const keyId = `${action}:${item.transferId}`;

    let idempotencyKey = incomingKeysRef.current.get(keyId);

    if (!idempotencyKey) {
      idempotencyKey = createIdempotencyKey();
      incomingKeysRef.current.set(keyId, idempotencyKey);
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      if (action === "ACCEPT") {
        await acceptTransfer({
          idempotencyKey,

          input: {
            routeId: item.routeId,
            transferId: item.transferId
          }
        });

        setNotice(
          `Передачу ${item.transferId} прийнято. ` +
          "Залишок перевіряється доменним ядром."
        );
      } else {
        await returnTransfer({
          idempotencyKey,

          input: {
            routeId: item.routeId,
            transferId: item.transferId
          }
        });

        setNotice(
          `Передачу ${item.transferId} повернуто відправнику ` +
          "після контрольованої перевірки."
        );
      }

      incomingKeysRef.current.delete(keyId);

      setConfirmation(null);
      refreshData();
    } catch (cause) {
      setError(
      getApiErrorMessage(
      cause,
      "Не вдалося завершити операцію з передачею."
      ) +
      " Якщо був таймаут, перевірте стан ID перед повтором."
      );
    } finally {
      setWorking(false);
    }
  }


  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  if (!active) {
    return null;
  }

  return (
    <section className={css.page}>
      <header className={css.header}>
        <div>
          <span className={css.eyebrow}>
            TRF-101 · КОНТРОЛЬОВАНІ ПЕРЕМІЩЕННЯ
          </span>

          <h2>
            <ArrowLeftRight size={24} />
            Переміщення між філіями
          </h2>

          <p>
            Передача і приймання складських партій
            через чинне ядро ProFin OS.
          </p>
        </div>

        <button
          type="button"
          className={css.secondary}
          disabled={loading || working}
          onClick={refreshData}
        >
          <RefreshCw
            size={16}
            className={loading ? css.spin : ""}
          />

          {loading ? "Оновлення..." : "Оновити"}
        </button>
      </header>


      {/* Summary */}

      <div className={css.summary}>
        <div>
          <Boxes size={19} />
          <strong>{lots.length}</strong>
          <span>партій поточної філії</span>
        </div>

        <div>
          <Clock3 size={19} />
          <strong>{pendingIncomingCount}</strong>
          <span>очікують приймання</span>
        </div>

        <div>
          <ShieldCheck size={19} />

          <strong>
            {writeEnabled
              ? "Підтвердження дозволено"
              : "Лише перегляд і план"}
          </strong>

          <span>захищений режим</span>
        </div>
      </div>


      {/* Messages */}

      {!writeEnabled && (
        <div className={css.note}>
          <CircleAlert size={18} />

          Запис вимкнений до TEST-перевірки обох філій.
          Перевіряти план можна без жодного списання.
        </div>
      )}

      {error && (
        <div role="alert" className={css.error}>
          <CircleAlert size={18} />
          {error}

          <button
            type="button"
            aria-label="Закрити повідомлення"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className={css.success}>
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}


      {/* Navigation */}

      <nav
        className={css.tabs}
        aria-label="Види переміщень"
      >
        <button
          type="button"
          className={tab === "outgoing" ? css.current : ""}
          onClick={() => setTab("outgoing")}
        >
          На відправлення
        </button>

        <button
          type="button"
          className={tab === "sent" ? css.current : ""}
          onClick={() => setTab("sent")}
        >
          Відправлені
          <span>{sent.length}</span>
        </button>

        <button
          type="button"
          className={tab === "incoming" ? css.current : ""}
          onClick={() => setTab("incoming")}
        >
          Вхідні переміщення
          <span>{pendingIncomingCount}</span>
        </button>
            </nav>

      {/* PATCH 55.9.7 — помилка поточного розділу */}

      {(
        (tab === "outgoing" && loadFailures.inventory) ||
        (tab === "sent" && loadFailures.outbox) ||
        (tab === "incoming" && loadFailures.inbox)
      ) && (
        <div className={css.note} role="status">
          Дані цього розділу тимчасово недоступні.
          Деталі помилки показані вище.
          Спробуйте натиснути «Оновити».
        </div>
      )}

      {/* Tab content */}

          {tab === "outgoing" && !loadFailures.inventory && (
        <OutgoingLotsTable
          lots={filteredLots}
          filter={filter}
          loading={loading}
          working={working}
          hasRoutes={outgoingRoutes.length > 0}
          actions={lotActions}
          onFilterChange={setFilter}
          onActionChange={changeLotAction}
          onExecute={beginTransfer}
        />
      )}

        {tab === "sent" && !loadFailures.outbox && (
        <SentTransfersTable
          items={sent}
          loading={loading}
        />
      )}

        {tab === "incoming" && !loadFailures.inbox && (
        <IncomingTransfersTable
          items={incoming}
          loading={loading}
          working={working}
          writeEnabled={writeEnabled}
          hasRoutes={incomingRoutes.length > 0}
          onConfirm={(item, action) => {
            setConfirmation({ item, action });
          }}
        />
      )}


      {/* Outgoing transfer dialog */}

      {selectedLot && (
        <TransferDialog
          lot={selectedLot}
          routes={outgoingRoutes}
          routeId={routeId}
          quantity={quantity}
          operationDate={operationDate}
          plan={plan}
          working={working}
          writeEnabled={writeEnabled}
          onClose={closeTransferForm}
          onRouteChange={(value) => {
            updateTransferForm(() => setRouteId(value));
          }}
          onQuantityChange={(value) => {
            updateTransferForm(() => setQuantity(value));
          }}
          onDateChange={(value) => {
            updateTransferForm(() => setOperationDate(value));
          }}
          onVerify={verifyTransferPlan}
          onConfirm={confirmTransfer}
        />
      )}


      {/* Incoming transfer confirmation */}

      {confirmation && (
        <ConfirmationDialog
          confirmation={confirmation}
          working={working}
          writeEnabled={writeEnabled}
          onClose={() => setConfirmation(null)}
          onConfirm={confirmIncomingAction}
        />
      )}
    </section>
  );
}
