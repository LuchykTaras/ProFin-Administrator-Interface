export type Operation = {
  time: string;
  type: string;
  id: string;
  description: string;
  amount: string;
  tone: "positive" | "negative" | "neutral";
  status: "Проведено" | "В дорозі" | "Скасовано";
  location: string;
  user: string;
};

export const operations: Operation[] = [
  {
    time: "10:31",
    type: "Продаж",
    id: "OP-2026-08-20-0056",
    description: "Чек №56",
    amount: "+1 250.00 ₴",
    tone: "positive",
    status: "Проведено",
    location: "Основна",
    user: "Андрій",
  },
  {
    time: "10:15",
    type: "Продаж",
    id: "OP-2026-08-20-0055",
    description: "Чек №55",
    amount: "+890.00 ₴",
    tone: "positive",
    status: "Проведено",
    location: "Основна",
    user: "Андрій",
  },
  {
    time: "10:02",
    type: "Повернення",
    id: "OP-2026-08-20-0004",
    description: "Повернення №4",
    amount: "-320.00 ₴",
    tone: "negative",
    status: "Проведено",
    location: "Основна",
    user: "Андрій",
  },
  {
    time: "09:48",
    type: "Продаж",
    id: "OP-2026-08-20-0054",
    description: "Чек №54",
    amount: "+2 150.00 ₴",
    tone: "positive",
    status: "Проведено",
    location: "Основна",
    user: "Андрій",
  },
  {
    time: "09:30",
    type: "Переміщення",
    id: "TRF-2026-08-20-0003",
    description: "Передача товару",
    amount: "—",
    tone: "neutral",
    status: "В дорозі",
    location: "Основна → Склад 2",
    user: "Андрій",
  },
  {
    time: "09:12",
    type: "Коригування",
    id: "ADJ-2026-08-20-0001",
    description: "Коригування залишків",
    amount: "-150.00 ₴",
    tone: "negative",
    status: "Проведено",
    location: "Основна",
    user: "Андрій",
  }
];

export const inventory = [
  { name: "Кава зерно 1 кг", lot: "LOT-24081", expiry: "12.01.2027", qty: 85, unit: "шт" },
  { name: "Молоко 2.5% 1 л", lot: "LOT-24102", expiry: "02.09.2026", qty: 42, unit: "шт" },
  { name: "Цукор 1 кг", lot: "LOT-24073", expiry: "14.05.2027", qty: 120, unit: "шт" }
];
