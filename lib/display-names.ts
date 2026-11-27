/**
 * Назви лише для вебінтерфейсу.
 * Ключі рахунків, ідентифікатори філій та історичні дані не змінюються.
 */
export const PRIVAT_BANK_EFFECTIVE_DATE = "2026-11-27";

export function getLocationDisplayName(locationName: string): string {
  const normalized = locationName.trim().replace(/\s+/g, " ")
    .toLocaleLowerCase("uk-UA");

  switch (normalized) {
    case "основна":
    case "бабурка":
      return "Бабурка";
    case "альтернатива бабурка":
    case "альтернатива":
      return "Альтернатива";
    default:
      return locationName;
  }
}

function normalizeDate(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const ua = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (ua) return `${ua[3]}-${ua[2].padStart(2, "0")}-${ua[1].padStart(2, "0")}`;

  return null;
}

/**
 * Дата — дата операції/звіту (не дата відкриття сторінки).
 * До дати переходу історична назва залишається без змін.
 * Коли дата не передана, показуємо актуальну назву для нової форми.
 */
export function getBankDisplayName(value: string, date?: string | null): string {
  if (date) {
    const key = normalizeDate(date);
    if (!key || key < PRIVAT_BANK_EFFECTIVE_DATE) return value;
  }

  return value
    .replace(/А[-–—\s]*Банк/giu, "Приват Банк")
    .replace(/Приват\s+банк/giu, "Приват Банк");
}
