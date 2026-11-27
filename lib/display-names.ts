/**
 * Відображувані назви для вебінтерфейсу.
 * Не змінює ID філій, ключі рахунків і дані, що надсилаються на сервер.
 */
export function getLocationDisplayName(locationName: string): string {
  const normalized = locationName
    .trim()
    .replace(/\s+/g, " ")
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

export function getBankDisplayName(value: string): string {
  return value.replace(/А[-\s]*Банк/gi, "Приват банк");
}
