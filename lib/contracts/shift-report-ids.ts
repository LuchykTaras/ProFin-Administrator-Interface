export function isShiftReportIdForDate(
  id: string | undefined,
  date: string
): boolean {
  const base = `SHIFT-${date.replace(/-/g, "")}`;

  if (id === base) return true;

  const match = new RegExp(
    `^${base}-V([0-9]{4})$`
  ).exec(id ?? "");

  return match !== null &&
    Number(match[1]) >= 2;
}