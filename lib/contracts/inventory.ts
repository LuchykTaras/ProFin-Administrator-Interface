export const INVENTORY_CONTRACT_VERSION =
  "PROFIN_INVENTORY_READ_V1" as const;


export type InventoryLotItem = {
  /*
   * Стабільний ID конкретної партії.
   *
   * Для переміщення передається
   * саме lotId, а не назва товару.
   */
  lotId: string;


  /*
   * Тип запасу:
   * вакцина / тест /
   * косметичний товар / інше.
   *
   * Значення приходить
   * з domain core.
   */
  inventoryType:
    string | null;


  /*
   * Відображувана назва
   * номенклатури.
   */
  inventoryName:
    string;


  /*
   * Серія / номер партії,
   * якщо використовується
   * конкретним domain profile.
   */
  series:
    string | null;


  /*
   * YYYY-MM-DD або null,
   * якщо строк придатності
   * для позиції не застосовується.
   */
  expiryDate:
    string | null;


  /*
   * Реальний доступний залишок
   * конкретної партії.
   *
   * Frontend його не
   * перераховує.
   */
  availableQuantity:
    number;


  unit:
    string | null;


  /*
   * Статус визначає domain core.
   *
   * Не вводимо frontend enum,
   * щоб UI не дублював
   * бізнес-правила складу.
   */
  status:
    string;


  /*
   * Trusted location
   * поточної партії.
   */
  locationId:
    string;

  locationName:
    string;
};


export type InventoryData = {
  version:
    typeof INVENTORY_CONTRACT_VERSION;


  /*
   * Інформаційне поле.
   * Browser не використовує
   * його для routing.
   */
  sourceSheet:
    string;


  checkedAt:
    string;


  timezone:
    string;


  locationId:
    string;

  locationName:
    string;


  total:
    number;


  items:
    InventoryLotItem[];
};