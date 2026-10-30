export const CLIENT_DIRECTORY_CONTRACT_VERSION =
  "PROFIN_CLIENT_DIRECTORY_V1" as const;

export type ClientDirectoryItem = {
  clientId: string;
  displayName: string;
  birthDate: string | null;
  phone: string | null;
  guardianName: string | null;
  doctorName: string | null;
  tag: string | null;
};

export type ClientDirectoryData = {
  version: typeof CLIENT_DIRECTORY_CONTRACT_VERSION;
  sourceSheet: "Клієнтська база";
  locationId: string;
  checkedAt: string;
  query: string;
  offset: number;
  limit: number;
  total: number;
  items: ClientDirectoryItem[];
};
