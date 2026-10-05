export const CLIENT_BIRTHDAYS_CONTRACT_VERSION =
  "PROFIN_CLIENT_BIRTHDAYS_V1" as const;


export type ClientBirthdayItem = {
  clientId: string;

  name: string;

  birthDate: string;

  doctor: string | null;

  nextBirthday: string;

  daysUntil: number;

  ageTurning: number;
};


export type ClientBirthdaysData = {
  version:
    typeof CLIENT_BIRTHDAYS_CONTRACT_VERSION;

  sourceSheet:
    "Клієнтська база";

  checkedAt: string;

  timezone: string;

  daysAhead: number;

  todayCount: number;

  total: number;

  items:
    ClientBirthdayItem[];
};