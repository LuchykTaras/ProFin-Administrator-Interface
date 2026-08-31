"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Filter,
  History,
  LogOut,
  Menu,
  PackageCheck,
  PackageMinus,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  WalletCards,
  ChevronDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { OperationModal } from "../components/operationmodal";
import { inventory, operations } from "../lib/mock";

type NavKey =
  | "cash"
  | "journal"
  | "inventory"
  | "transfers"
  | "returns"
  | "corrections"
  | "access";

const navItems: Array<{
  key: NavKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { key: "cash", label: "Каса", icon: WalletCards },
  { key: "journal", label: "Журнал операцій", icon: ClipboardList },
  { key: "inventory", label: "Склад", icon: Boxes },
  { key: "transfers", label: "Переміщення", icon: ArrowLeftRight },
  { key: "returns", label: "Повернення", icon: RotateCcw },
  { key: "corrections", label: "Коригування", icon: PencilLine },
  { key: "access", label: "Мій доступ", icon: UserRound },
];

function AppLogo() {
  return (
    <div className="brand">
      <div className="brand-bars"><span /><span /><span /></div>
      <span>ProFin OS</span>
    </div>
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="status-pill">
      <span className="status-dot" />
      {children}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  accent = "green",
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string;
  helper: string;
  accent?: "green" | "orange" | "red" | "blue";
}) {
  return (
    <article className={`metric-card accent-${accent}`}>
      <div className="metric-label">
        <Icon size={19} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <span className="metric-helper">{helper}</span>
      <div className="metric-bars" aria-hidden="true">
        {[7, 12, 8, 15, 10, 17, 12, 20, 14, 24, 18].map((h, i) => (
          <span key={i} style={{ height: `${h}px` }} />
        ))}
      </div>
    </article>
  );
}

function QuickAction({
  icon: Icon,
  title,
  subtitle,
  tone,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className={`quick-icon ${tone}`}><Icon size={24} /></span>
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </button>
  );
}

export default function Home() {
  const [active, setActive] = useState<NavKey>("cash");
  const [query, setQuery] = useState("");
  const [operationModal, setOperationModal] = useState(false);

  const filteredOperations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return operations;
    return operations.filter((op) =>
      [op.id, op.type, op.description, op.user, op.location]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <AppLogo />

        <nav className="nav">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={active === key ? "nav-item active" : "nav-item"}
            >
              <Icon size={20} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="session-card">
          <div className="session-title">
            <ShieldCheck size={18} />
            <strong>Сесія активна</strong>
          </div>
          <span>Остання активність:</span>
          <span>20.08.2026 10:31</span>
        </div>

        <div className="sidebar-footer">
          <span>ProFin OS v1.0.0</span>
          <span>© 2026</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-menu" aria-label="Меню">
              <Menu size={21} />
            </button>
            <h1>{navItems.find((item) => item.key === active)?.label ?? "Каса"}</h1>
          </div>

          <div className="topbar-controls">
            <button className="selector">
              <Building2 size={17} />
              <span>Філія: Основна</span>
              <ChevronDown size={16} />
            </button>
            <button className="selector">
              <CalendarDays size={17} />
              <span>20.08.2026</span>
              <ChevronDown size={16} />
            </button>
            <button className="bell">
              <Bell size={20} />
              <span>3</span>
            </button>
            <button className="profile">
              <span className="avatar">А</span>
              <span><strong>Андрій</strong><small>Касир</small></span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        {active === "cash" && (
          <div className="dashboard">
            <section className="metric-grid">
              <MetricCard
                icon={ClipboardList}
                label="Операцій сьогодні"
                value="56"
                helper="Штатні операції поточної локації"
              />
              <MetricCard
                icon={History}
                label="Очікують дії"
                value="4"
                helper="Повернення / коригування"
                accent="orange"
              />
              <MetricCard
                icon={ArrowLeftRight}
                label="Переміщення"
                value="3"
                helper="1 документ у дорозі"
                accent="blue"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Низький залишок"
                value="18"
                helper="Позицій потребують уваги"
                accent="red"
              />
            </section>

            <section className="quick-section card">
              <div className="section-heading"><h2>Швидкі дії</h2></div>
              <div className="quick-grid">
                <QuickAction
                  icon={Plus}
                  title="Нова операція"
                  subtitle="Створити"
                  tone="green"
                  onClick={() => setOperationModal(true)}
                />
                <QuickAction
                  icon={RotateCcw}
                  title="Повернення"
                  subtitle="За operationId"
                  tone="blue"
                  onClick={() => setActive("returns")}
                />
                <QuickAction
                  icon={ArrowLeftRight}
                  title="Переміщення"
                  subtitle="Між локаціями"
                  tone="purple"
                  onClick={() => setActive("transfers")}
                />
                <QuickAction
                  icon={PencilLine}
                  title="Коригування"
                  subtitle="За політикою"
                  tone="orange"
                  onClick={() => setActive("corrections")}
                />
                <QuickAction icon={ArrowUpFromLine} title="Внесення" subtitle="До каси" tone="lime" />
                <QuickAction icon={PackageMinus} title="Списання" subtitle="Зі складу" tone="red" />
              </div>
            </section>

            <div className="content-grid">
              <section className="card operations-card">
                <div className="section-heading">
                  <div>
                    <h2>Останні операції</h2>
                    <p>Тільки дозволені операції поточної локації</p>
                  </div>

                  <div className="table-actions">
                    <label className="search-box">
                      <Search size={16} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="ID або опис"
                      />
                    </label>
                    <button className="small-button"><Filter size={16} />Фільтри</button>
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Час</th>
                        <th>Тип</th>
                        <th>№ операції</th>
                        <th>Опис</th>
                        <th>Сума</th>
                        <th>Статус</th>
                        <th>Локація</th>
                        <th>Користувач</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOperations.map((op) => (
                        <tr key={op.id}>
                          <td>{op.time}</td>
                          <td>{op.type}</td>
                          <td className="id-cell">{op.id}</td>
                          <td>{op.description}</td>
                          <td className={`amount ${op.tone}`}>{op.amount}</td>
                          <td>
                            <span className={op.status === "В дорозі" ? "table-status transit" : "table-status"}>
                              {op.status}
                            </span>
                          </td>
                          <td>{op.location}</td>
                          <td>{op.user}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button className="text-link" onClick={() => setActive("journal")}>
                  Переглянути всі операції →
                </button>
              </section>

              <aside className="right-column">
                <section className="card inventory-card">
                  <div className="section-heading compact">
                    <h2>Склад — оперативні залишки</h2>
                    <button className="text-link" onClick={() => setActive("inventory")}>
                      Переглянути склад
                    </button>
                  </div>

                  <div className="inventory-kpis">
                    <div><span>Позицій</span><strong>1 248</strong></div>
                    <div><span>Низький залишок</span><strong className="orange-text">18</strong></div>
                    <div><span>Відсутні</span><strong className="red-text">5</strong></div>
                  </div>

                  <div className="mini-table">
                    <div className="mini-head">
                      <span>Найменування</span><span>Партія</span><span>Залишок</span>
                    </div>
                    {inventory.map((item) => (
                      <div className="mini-row" key={item.lot}>
                        <span>{item.name}</span>
                        <span>{item.lot}</span>
                        <span>{item.qty} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="card notifications">
                  <div className="section-heading compact"><h2>Повідомлення</h2></div>

                  <div className="notification-item">
                    <span className="notification-icon red"><ShieldCheck size={19} /></span>
                    <div><strong>Резервні коди 2FA</strong><span>Оновіть резервні коди для безпеки</span></div>
                    <time>23.08.2026</time>
                  </div>

                  <div className="notification-item">
                    <span className="notification-icon orange"><PackageCheck size={19} /></span>
                    <div><strong>Низький залишок</strong><span>5 позицій потребують поповнення</span></div>
                    <time>21.08.2026</time>
                  </div>

                  <div className="notification-item">
                    <span className="notification-icon green"><Activity size={19} /></span>
                    <div><strong>Система працює</strong><span>Остання перевірка без помилок</span></div>
                    <time>20.08.2026</time>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}

        {active !== "cash" && (
          <section className="placeholder-page card">
            <div className="placeholder-icon">
              {active === "journal" ? <ClipboardList size={34} />
                : active === "inventory" ? <Boxes size={34} />
                : active === "transfers" ? <ArrowLeftRight size={34} />
                : active === "returns" ? <RotateCcw size={34} />
                : active === "corrections" ? <PencilLine size={34} />
                : <UserRound size={34} />}
            </div>

            <span className="eyebrow">Prototype route</span>
            <h2>{navItems.find((item) => item.key === active)?.label}</h2>
            <p>
              Цей розділ уже підключений до навігації. Його можна розширювати
              окремим майстром і server-side API, не даючи браузеру прямого доступу
              до Google Sheets.
            </p>

            {active === "journal" && (
              <div className="placeholder-demo">
                <label className="search-box large">
                  <Search size={18} />
                  <input placeholder="Точний пошук за operationId" />
                </label>
                <div className="demo-chips">
                  <button>Дата</button><button>Тип</button><button>Статус</button><button>Автор</button>
                </div>
              </div>
            )}

            {active === "inventory" && (
              <div className="inventory-full">
                {inventory.map((item) => (
                  <article key={item.lot}>
                    <div><strong>{item.name}</strong><span>{item.lot}</span></div>
                    <div><span>Строк</span><strong>{item.expiry}</strong></div>
                    <div><span>Доступно</span><strong>{item.qty} {item.unit}</strong></div>
                    <span className="table-status">Доступно</span>
                  </article>
                ))}
              </div>
            )}

            {active === "access" && (
              <div className="access-card">
                <div><span>Користувач</span><strong>Андрій</strong></div>
                <div><span>Роль</span><strong>Касир</strong></div>
                <div><span>Локація</span><strong>Основна</strong></div>
                <div><span>Сесія</span><StatusPill>Активна</StatusPill></div>
                <button className="danger-button"><LogOut size={18} />Вийти</button>
              </div>
            )}
          </section>
        )}

        <footer className="system-footer">
          <div className="footer-segment">
            <span className="footer-label">Підключення</span>
            <div className="footer-items">
              <StatusPill><Database size={14} />API</StatusPill>
              <StatusPill><FileSpreadsheet size={14} />Google Sheets</StatusPill>
            </div>
          </div>

          <div className="footer-segment">
            <span className="footer-label">Поточний контекст</span>
            <strong>ProFin OS 2026 — Основна</strong>
            <small>Рік: 2026</small>
          </div>

          <div className="footer-segment">
            <span className="footer-label">Стан системи</span>
            <StatusPill>Усі сервіси працюють</StatusPill>
            <small>Остання перевірка: 10:30</small>
          </div>

          <div className="footer-segment">
            <span className="footer-label">API статус</span>
            <div className="api-grid">
              <span>API: <b>OK</b></span>
              <span>DB: <b>MOCK</b></span>
              <span>Apps Script: <b>MOCK</b></span>
            </div>
          </div>
        </footer>
      </main>

      {operationModal && <OperationModal onClose={() => setOperationModal(false)} />}
    </div>
  );
}
