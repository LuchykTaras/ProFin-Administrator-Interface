"use client";

import { CheckCircle2, Copy, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

export function OperationModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: "Продаж",
    amount: "",
    account: "Каса — Основна",
    category: "Продаж товару",
    note: "",
  });

  const operationId = "OP-2026-08-20-0057";

  function submit() {
    if (submitting) return;
    setSubmitting(true);
    setTimeout(() => {
      setStep("done");
      setSubmitting(false);
    }, 500);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Нова операція</span>
            <h2>
              {step === "form"
                ? "Введіть дані"
                : step === "review"
                  ? "Перевірте перед проведенням"
                  : "Операцію проведено"}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрити">
            <X size={20} />
          </button>
        </div>

        {step === "form" && (
          <>
            <div className="form-grid">
              <label>
                Тип операції
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option>Продаж</option>
                  <option>Надходження</option>
                  <option>Списання</option>
                  <option>Повернення</option>
                </select>
              </label>

              <label>
                Сума, ₴
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </label>

              <label>
                Рахунок
                <select
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                >
                  <option>Каса — Основна</option>
                  <option>Каса — Склад 2</option>
                </select>
              </label>

              <label>
                Стаття
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option>Продаж товару</option>
                  <option>Послуга</option>
                  <option>Інше надходження</option>
                </select>
              </label>

              <label className="full-width">
                Коментар
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Необов'язково"
                  rows={3}
                />
              </label>
            </div>

            <div className="modal-footer">
              <button className="secondary-button" onClick={onClose}>
                Скасувати
              </button>
              <button
                className="primary-button"
                onClick={() => setStep("review")}
                disabled={!form.amount}
              >
                Далі
              </button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div className="review-card">
              <div><span>Дата</span><strong>20.08.2026</strong></div>
              <div><span>Тип</span><strong>{form.type}</strong></div>
              <div><span>Сума</span><strong>{form.amount} ₴</strong></div>
              <div><span>Рахунок</span><strong>{form.account}</strong></div>
              <div><span>Стаття</span><strong>{form.category}</strong></div>
              <div><span>Локація</span><strong>Основна</strong></div>
            </div>

            <div className="modal-note">
              <ShieldCheck size={18} />
              Кнопка «Провести» блокується під час запиту, щоб не створити дубль.
            </div>

            <div className="modal-footer">
              <button className="secondary-button" onClick={() => setStep("form")}>
                Назад
              </button>
              <button className="primary-button" onClick={submit} disabled={submitting}>
                {submitting ? "Проводимо…" : "Провести"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="success-view">
            <span className="success-icon"><CheckCircle2 size={34} /></span>
            <h3>Готово</h3>
            <p>Операцію успішно створено.</p>

            <div className="operation-id">
              <span>{operationId}</span>
              <button
                className="icon-button"
                onClick={() => navigator.clipboard?.writeText(operationId)}
                aria-label="Скопіювати ID"
              >
                <Copy size={18} />
              </button>
            </div>

            <div className="modal-footer centered">
              <button className="secondary-button" onClick={onClose}>
                Закрити
              </button>
              <button className="primary-button" onClick={() => setStep("form")}>
                Створити наступну
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
