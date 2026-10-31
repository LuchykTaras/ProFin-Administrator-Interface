"use client";

import { useRef, useState, type CSSProperties } from "react";
import { submitClientA83 } from "@/lib/client/client-create-a83";
import { ApiClientError, getApiErrorMessage } from "@/lib/client/api-client";
import type { CreateClientA83Input, ClientCreateA83DryRun, ClientCreateA83Committed } from "@/lib/contracts/client-create-a83";
import { UkrainianDatePicker } from "@/components/ukrainian-date-picker";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: ClientCreateA83Committed) => void;
};

const EMPTY: CreateClientA83Input = {
  name: "", birthDate: "", trustedPerson: "", trustedPhone: ""
};

export function NewClientStandaloneA83({open, onClose, onSuccess}: Props) {
  const [form, setForm] = useState<CreateClientA83Input>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ClientCreateA83DryRun | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  if (!open) return null;

  function edit<K extends keyof CreateClientA83Input>(field: K, value: string) {
    if (busyRef.current || unknownOutcome) return;
    keyRef.current = null;
    setPreview(null);
    setError("");
    setForm(prev => ({...prev, [field]: value}));
  }

  function close() {
    if (busyRef.current || unknownOutcome) return;
    keyRef.current = null;
    setForm(EMPTY);
    setPreview(null);
    setError("");
    onClose();
  }

  async function submit(mode: "DRY_RUN" | "COMMIT") {
    if (busyRef.current) return;
    if (mode === "COMMIT" && !preview?.readyForCommit) return;
    const key = keyRef.current ?? `profin-client-prod-${crypto.randomUUID()}`;
    keyRef.current = key;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitClientA83({mode, client: form}, key);
      if (result.mode === "DRY_RUN") {
        setPreview(result);
        return;
      }
      keyRef.current = null;
      setUnknownOutcome(false);
      setForm(EMPTY);
      setPreview(null);
      onSuccess(result);
      onClose();
    } catch (reason) {
      const uncertain = mode === "COMMIT" && reason instanceof ApiClientError &&
        (reason.status === 0 || reason.status >= 500);
      setUnknownOutcome(uncertain);
      setError(getApiErrorMessage(reason,
        "Виконання не підтверджено. Повторіть із тим самим ключем."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid #cad8d4", font: "inherit", marginTop: 4
  };

  return (
    <div role="presentation" style={{position:"fixed",inset:0,background:"#061b16b8",
      zIndex:1000,display:"grid",placeItems:"center",padding:16}}>
      <section role="dialog" aria-modal="true" aria-label="Додати клієнта у Бабурку"
        style={{width:"min(540px, 100%)",background:"white",color:"#18302a",
          borderRadius:14,padding:24,boxShadow:"0 22px 50px #0003"}}>
        <h2 style={{fontSize:22,marginTop:0}}>Новий клієнт — Бабурка</h2>
        <p style={{fontSize:13,color:"#596f68"}}>
          Підключення до справжньої таблиці Бабурки. Спочатку перевірка без запису, потім окреме збереження без фінансової операції.
        </p>
        <form onSubmit={e=>{e.preventDefault();void submit("DRY_RUN");}}>
          <label style={{display:"block",marginTop:12}}>ПІБ дитини *
            <input required value={form.name} style={inputStyle}
              disabled={busy || unknownOutcome} onChange={e=>edit("name", e.target.value)}/>
          </label>
          <label style={{display:"block",marginTop:12}}>Дата народження *
            <div style={{marginTop:6}}>
              <UkrainianDatePicker value={form.birthDate}
                onChange={value=>edit("birthDate",value)}
                disabled={busy || unknownOutcome} ariaLabel="Дата народження" />
            </div>
          </label>
          <label style={{display:"block",marginTop:12}}>ПІБ довіреної особи *
            <input required value={form.trustedPerson} style={inputStyle}
              disabled={busy || unknownOutcome}
              onChange={e=>edit("trustedPerson",e.target.value)}/>
          </label>
          <label style={{display:"block",marginTop:12}}>Телефон довіреної особи *
            <input required type="tel" value={form.trustedPhone} style={inputStyle}
              placeholder="+380XXXXXXXXX" disabled={busy || unknownOutcome}
              onChange={e=>edit("trustedPhone",e.target.value)}/>
          </label>
          {error && <div role="alert" style={{marginTop:14,color:"#aa2525"}}>{error}</div>}
          {unknownOutcome && <p style={{fontSize:12,color:"#aa2525"}}>
            Результат запису невідомий. Не змінюй поля. Повтори той самий запит
            з тим самим idempotency key, щоб уникнути дубля.
          </p>}
          {preview && !unknownOutcome && (
            <p role="status" style={{fontSize:13,color:preview.readyForCommit?"#17694c":"#895a05"}}>
              {preview.duplicateFound
                ? "У базі вже є клієнт із такими ПІБ і датою народження. Запис заборонено."
                : !preview.destinationFree
                  ? "Наступний рядок зайнятий. Потрібна перевірка бази."
                  : !preview.ledgerReady
                    ? "Ще не створено службовий журнал захисту від повторних записів."
                    : !preview.writeEnabled
                      ? "Dry-run успішний. Реальне збереження ще вимкнене адміністратором."
                      : "Dry-run успішний. Можна зберігати клієнта у справжню базу."}
            </p>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap",marginTop:22}}>
            <button type="button" onClick={close} disabled={busy || unknownOutcome}>
              Скасувати
            </button>
            <button type="submit" disabled={busy || unknownOutcome || !form.name.trim() ||
              !form.birthDate || !form.trustedPerson.trim() || !form.trustedPhone.trim()}>
              {busy ? "Перевіряємо..." : "Перевірити без запису"}
            </button>
            <button type="button" onClick={() => void submit("COMMIT")}
              disabled={busy || !preview?.readyForCommit ||
                (!unknownOutcome && (!form.name.trim() || !form.birthDate ||
                  !form.trustedPerson.trim() || !form.trustedPhone.trim()))}
              style={{background:preview?.readyForCommit?"#087d61":"#b7c7c2",color:"white",
                border:0,borderRadius:8,padding:"10px 14px"}}>
              {busy ? "Виконується..." : unknownOutcome
                ? "Повторити той самий запит" : "Зберегти клієнта"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
