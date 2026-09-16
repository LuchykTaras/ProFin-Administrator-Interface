/****************************************************
 * PROFIN OS — ВИБУТТЯ ЗАПАСІВ
 * ЕТАП 1. СУХИЙ ПЛАНУВАЛЬНИК
 *
 * ПРИЗНАЧЕННЯ:
 * 1. Визначає, чи є операція вибуттям запасу.
 * 2. Визначає тип руху.
 * 3. Знаходить доступні партії.
 * 4. Сортує партії за FEFO.
 * 5. Формує план списання.
 * 6. Розраховує фактичну собівартість.
 *
 * ВАЖЛИВО:
 * - нічого не записує;
 * - не змінює "База операцій";
 * - не змінює "Склад медичних запасів";
 * - не змінює "Рух складу";
 * - не змінює "Облік вакцин";
 * - не змінює "Нарахування".
 ****************************************************/


/****************************************************
 * КОНФІГУРАЦІЯ ВИБУТТЯ ЗАПАСІВ
 *
 * Підтримує:
 * — вакцини;
 * — швидкі тести;
 * — косметичні товари.
 ****************************************************/

const INVENTORY_ISSUE_CONFIG =
  Object.freeze({
    stockSheetName:
      'Склад медичних запасів',

    /*
     * Індекси колонок у масиві getValues().
     * Відлік починається з 0.
     *
     * Структура листа:
     * A:S — 19 колонок.
     */
    stockColumns:
      Object.freeze({
        lotId:
          0,  // A ID партії

        receiptOperationId:
          1,  // B ID операції надходження

        inventoryType:
          2,  // C Тип запасу

        inventoryName:
          3,  // D Найменування

        series:
          4,  // E Серія

        expiryDate:
          5,  // F Термін придатності

        receiptDate:
          6,  // G Дата надходження

        supplier:
          7,  // H Постачальник

        received:
          8,  // I Прийнято

        unitCost:
          9,  // J Собівартість одиниці

        totalPurchaseCost:
          10, // K Загальна закупівельна вартість

        soldOrUsed:
          11, // L Продано / використано

        transferredToStorage:
          12, // M Передано на зберігання

        writtenOff:
          13, // N Списано

        currentBalance:
          14, // O Поточний залишок

        minimumStock:
          15, // P Мінімальний залишок

        status:
          16, // Q Статус

        user:
          17, // R Користувач

        createdAt:
          18  // S Дата і час створення
      }),

    /*
     * Типи запасів.
     */
    inventoryTypes:
      Object.freeze({
        vaccine:
          'Вакцина',

        test:
          'Тест',

        product:
          'Товар'
      }),

    /*
     * Старе поле залишаємо для сумісності
     * з уже створеними вакцинними тестами.
     */
    inventoryType:
      'Вакцина',

    /*
     * Категорії вакцинних операцій.
     */
    issueCategories:
      Object.freeze({
        saleAndUse:
          'Продаж і використання',

        saleToStorage:
          'Продаж на зберігання',

        statusChange:
          'Зміна статусу',

        quickTests:
          'Швидкі тести',

        cosmetics:
          'Косметичні засоби'
      }),

    /*
     * Типи рухів повинні точно відповідати
     * назвам у листі "Рух складу".
     */
    movementTypes:
      Object.freeze({
        saleAndUse:
          'Продаж і використання',

        saleToStorage:
          'Передано на зберігання',

        sale:
          'Продаж',

        noMovement:
          'Без руху'
      }),

    /*
     * Допуск для порівняння чисел.
     */
    tolerance:
      0.000001
  });


/****************************************************
 * НОРМАЛІЗАЦІЯ ТЕКСТУ
 ****************************************************/

function inventoryIssueNormalize_(
  value
) {
  let text =
    String(
      value === null ||
      value === undefined
        ? ''
        : value
    );

  if (
    typeof text.normalize ===
    'function'
  ) {
    text =
      text.normalize(
        'NFKC'
      );
  }

  return text
    .replace(
      /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
      ''
    )
    .replace(
      /\u00A0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim()
    .toLowerCase();
}


/****************************************************
 * БЕЗПЕЧНЕ ЧИТАННЯ ЧИСЛА
 ****************************************************/

function inventoryIssueNumber_(
  value
) {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const text =
    String(value || '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  const number =
    Number(text);

  return Number.isFinite(number)
    ? number
    : 0;
}


/****************************************************
 * ОКРУГЛЕННЯ ГРОШЕЙ
 ****************************************************/

function inventoryIssueRoundMoney_(
  value
) {
  return Math.round(
    (
      inventoryIssueNumber_(
        value
      ) +
      Number.EPSILON
    ) * 100
  ) / 100;
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ДАТИ
 ****************************************************/

function inventoryIssueDateOnly_(
  value
) {
  if (
    !(
      value instanceof Date
    ) ||
    isNaN(
      value.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
}


/****************************************************
 * ЄДИНИЙ КЛАСИФІКАТОР ВИБУТТЯ ЗАПАСІВ
 *
 * Визначає:
 * — чи повинна операція списати запас;
 * — тип запасу;
 * — найменування;
 * — тип складського руху;
 * — лічильник партії, який потрібно змінити.
 ****************************************************/
function getInventoryIssueDescriptor_(
  data
) {
  if (!data) {
    return {
      isIssue:
        false,

      inventoryType:
        '',

      inventoryName:
        '',

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .noMovement,

      stockCounter:
        '',

      stockColumn:
        0,

      reason:
        'Не передано дані операції'
    };
  }

  const type =
    inventoryIssueNormalize_(
      data.type
    );

  const category =
    inventoryIssueNormalize_(
      data.category
    );

  /*
   * Найменування запасу при продажу
   * береться зі статті операції.
   *
   * inventoryName залишено резервно
   * для технічних тестів і майбутніх модулів.
   */
  const inventoryName =
    String(
      data.article ||
      data.inventoryName ||
      ''
    ).trim();

  /****************************************************
   * 1. ВАКЦИНА:
   * ПРОДАЖ І НЕГАЙНЕ ВИКОРИСТАННЯ
   ****************************************************/

  if (
    type ===
      inventoryIssueNormalize_(
        'Вакцина'
      ) &&
    category ===
      inventoryIssueNormalize_(
        INVENTORY_ISSUE_CONFIG
          .issueCategories
          .saleAndUse
      )
  ) {
    return {
      isIssue:
        true,

      inventoryType:
        INVENTORY_ISSUE_CONFIG
          .inventoryTypes
          .vaccine,

      inventoryName:
        inventoryName,

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .saleAndUse,

      stockCounter:
        'soldOrUsed',

      /*
       * L — Продано / використано.
       */
      stockColumn:
        12,

      reason:
        ''
    };
  }

  /****************************************************
   * 2. ВАКЦИНА:
   * ПРОДАЖ НА ЗБЕРІГАННЯ
   ****************************************************/

  if (
    type ===
      inventoryIssueNormalize_(
        'Вакцина'
      ) &&
    category ===
      inventoryIssueNormalize_(
        INVENTORY_ISSUE_CONFIG
          .issueCategories
          .saleToStorage
      )
  ) {
    return {
      isIssue:
        true,

      inventoryType:
        INVENTORY_ISSUE_CONFIG
          .inventoryTypes
          .vaccine,

      inventoryName:
        inventoryName,

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .saleToStorage,

      stockCounter:
        'transferredToStorage',

      /*
       * M — Передано на зберігання.
       */
      stockColumn:
        13,

      reason:
        ''
    };
  }

  /****************************************************
   * 3. ВАКЦИНА:
   * ЗМІНА СТАТУСУ
   *
   * Не створює повторного первинного вибуття.
   * Для неї працює окремий модуль
   * "Використання зі зберігання".
   ****************************************************/

  if (
    type ===
      inventoryIssueNormalize_(
        'Вакцина'
      ) &&
    category ===
      inventoryIssueNormalize_(
        INVENTORY_ISSUE_CONFIG
          .issueCategories
          .statusChange
      )
  ) {
    return {
      isIssue:
        false,

      inventoryType:
        INVENTORY_ISSUE_CONFIG
          .inventoryTypes
          .vaccine,

      inventoryName:
        inventoryName,

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .noMovement,

      stockCounter:
        '',

      stockColumn:
        0,

      reason:
        'Зміна статусу не створює повторного первинного вибуття'
    };
  }

  /****************************************************
   * 4. ПРОДАЖ ШВИДКИХ ТЕСТІВ
   *
   * Форма:
   * Тип операції — Доходи
   * Категорія — Швидкі тести
   * Стаття — конкретне найменування тесту
   ****************************************************/

  if (
    type ===
      inventoryIssueNormalize_(
        'Доходи'
      ) &&
    category ===
      inventoryIssueNormalize_(
        INVENTORY_ISSUE_CONFIG
          .issueCategories
          .quickTests
      )
  ) {
    return {
      isIssue:
        true,

      inventoryType:
        INVENTORY_ISSUE_CONFIG
          .inventoryTypes
          .test,

      inventoryName:
        inventoryName,

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .sale,

      stockCounter:
        'soldOrUsed',

      /*
       * L — Продано / використано.
       */
      stockColumn:
        12,

      reason:
        ''
    };
  }

  /****************************************************
   * 5. ПРОДАЖ КОСМЕТИЧНИХ ЗАСОБІВ
   *
   * Форма:
   * Тип операції — Доходи
   * Категорія — Косметичні засоби
   * Стаття — конкретне найменування товару
   ****************************************************/

  if (
    type ===
      inventoryIssueNormalize_(
        'Доходи'
      ) &&
    category ===
      inventoryIssueNormalize_(
        INVENTORY_ISSUE_CONFIG
          .issueCategories
          .cosmetics
      )
  ) {
    return {
      isIssue:
        true,

      inventoryType:
        INVENTORY_ISSUE_CONFIG
          .inventoryTypes
          .product,

      inventoryName:
        inventoryName,

      movementType:
        INVENTORY_ISSUE_CONFIG
          .movementTypes
          .sale,

      stockCounter:
        'soldOrUsed',

      /*
       * L — Продано / використано.
       */
      stockColumn:
        12,

      reason:
        ''
    };
  }

  /****************************************************
   * ІНШІ ОПЕРАЦІЇ
   ****************************************************/

  return {
    isIssue:
      false,

    inventoryType:
      '',

    inventoryName:
      inventoryName,

    movementType:
      INVENTORY_ISSUE_CONFIG
        .movementTypes
        .noMovement,

    stockCounter:
      '',

    stockColumn:
      0,

    reason:
      'Операція не є складським вибуттям'
  };
}


/****************************************************
 * ЧИ Є ОПЕРАЦІЯ ВИБУТТЯМ
 ****************************************************/
function isInventoryIssueOperation_(
  data
) {
  return Boolean(
    getInventoryIssueDescriptor_(
      data
    ).isIssue
  );
}


/****************************************************
 * ПАРАМЕТРИ ВИБУТТЯ
 *
 * Збережена стара назва функції,
 * щоб не змінювати інші модулі.
 ****************************************************/
function getInventoryIssueType_(
  data
) {
  return getInventoryIssueDescriptor_(
    data
  );
}
/****************************************************
 * ЧИТАННЯ ДОСТУПНИХ ПАРТІЙ
 *
 * Вакцина визначається за:
 * data.article — назва вакцини в операції.
 *
 * Партії:
 * - мають збіг назви;
 * - мають поточний залишок > 0;
 * - не повинні бути простроченими
 *   на дату операції.
 *
 * @return {Object}
 ****************************************************/

/****************************************************
 * ЧИТАННЯ ДОСТУПНИХ ПАРТІЙ
 *
 * Підтримує:
 * — Вакцина;
 * — Тест;
 * — Товар.
 *
 * Правило вибору:
 * 1. FEFO — партія з найближчим терміном придатності.
 * 2. Якщо термін не вказаний — FIFO за датою надходження.
 *
 * Партія допускається до вибуття, якщо:
 * — збігається тип запасу;
 * — збігається найменування;
 * — поточний залишок більший за нуль;
 * — термін придатності не минув;
 * — дата надходження не пізніша за дату операції.
 ****************************************************/
function getAvailableInventoryLots_(
  data
) {
  if (!data) {
    throw new Error(
      'Не передано дані операції'
    );
  }

  const issueType =
    getInventoryIssueType_(
      data
    );

  /*
   * Найменування під час продажу
   * міститься у полі "Стаття".
   *
   * inventoryName залишене резервно
   * для тестів та інших модулів.
   */
  const inventoryName =
    String(
      data.article ||
      data.inventoryName ||
      ''
    ).trim();

  if (!inventoryName) {
    throw new Error(
      'Не визначено найменування запасу в полі "Стаття"'
    );
  }

  /*
   * Для звичайної операції тип визначає
   * єдиний класифікатор:
   *
   * Вакцина / Тест / Товар.
   *
   * Резервне значення "Вакцина"
   * збережене для старих тестових функцій,
   * які викликають пошук без type/category.
   */
  const expectedInventoryType =
    issueType.inventoryType ||
    data.inventoryType ||
    INVENTORY_ISSUE_CONFIG
      .inventoryType;

  if (!expectedInventoryType) {
    throw new Error(
      'Не визначено тип складського запасу'
    );
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INVENTORY_ISSUE_CONFIG
        .stockSheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_ISSUE_CONFIG
        .stockSheetName +
      '"'
    );
  }

  const operationDate =
    inventoryIssueDateOnly_(
      data.date
    ) ||
    inventoryIssueDateOnly_(
      new Date()
    );

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return {
      inventoryType:
        expectedInventoryType,

      inventoryName:
        inventoryName,

      /*
       * Поле залишене для сумісності
       * з вакцинними функціями.
       */
      vaccineName:
        inventoryName,

      operationDate:
        operationDate,

      availableLots: [],

      expiredLots: [],

      futureReceiptLots: [],

      totalAvailable:
        0
    };
  }

  const width =
    19;

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        width
      )
      .getValues();

  const columns =
    INVENTORY_ISSUE_CONFIG
      .stockColumns;

  const expectedName =
    inventoryIssueNormalize_(
      inventoryName
    );

  const expectedType =
    inventoryIssueNormalize_(
      expectedInventoryType
    );

  const availableLots = [];
  const expiredLots = [];
  const futureReceiptLots = [];

  values.forEach(
    function(
      rowValues,
      index
    ) {
      const sheetRow =
        index + 2;

      const lotId =
        String(
          rowValues[
            columns.lotId
          ] || ''
        ).trim();

      if (!lotId) {
        return;
      }

      /****************************************************
       * ПЕРЕВІРКА ТИПУ ЗАПАСУ
       ****************************************************/

      const rowInventoryType =
        inventoryIssueNormalize_(
          rowValues[
            columns.inventoryType
          ]
        );

      if (
        rowInventoryType !==
        expectedType
      ) {
        return;
      }

      /****************************************************
       * ПЕРЕВІРКА НАЙМЕНУВАННЯ
       ****************************************************/

      const rowInventoryName =
        inventoryIssueNormalize_(
          rowValues[
            columns.inventoryName
          ]
        );

      if (
        rowInventoryName !==
        expectedName
      ) {
        return;
      }

      /****************************************************
       * ПЕРЕВІРКА ЗАЛИШКУ
       ****************************************************/

      const currentBalance =
        inventoryIssueNumber_(
          rowValues[
            columns.currentBalance
          ]
        );

      if (
        currentBalance <=
        INVENTORY_ISSUE_CONFIG
          .tolerance
      ) {
        return;
      }

      const expiryDate =
        inventoryIssueDateOnly_(
          rowValues[
            columns.expiryDate
          ]
        );

      const receiptDate =
        inventoryIssueDateOnly_(
          rowValues[
            columns.receiptDate
          ]
        );

      const lot = {
        sheetRow:
          sheetRow,

        lotId:
          lotId,

        receiptOperationId:
          String(
            rowValues[
              columns.receiptOperationId
            ] || ''
          ).trim(),

        inventoryType:
          String(
            rowValues[
              columns.inventoryType
            ] || ''
          ).trim(),

        inventoryName:
          String(
            rowValues[
              columns.inventoryName
            ] || ''
          ).trim(),

        series:
          String(
            rowValues[
              columns.series
            ] || ''
          ).trim(),

        expiryDate:
          expiryDate,

        receiptDate:
          receiptDate,

        supplier:
          String(
            rowValues[
              columns.supplier
            ] || ''
          ).trim(),

        unitCost:
          inventoryIssueRoundMoney_(
            rowValues[
              columns.unitCost
            ]
          ),

        currentBalance:
          currentBalance,

        soldOrUsed:
          inventoryIssueNumber_(
            rowValues[
              columns.soldOrUsed
            ]
          ),

        transferredToStorage:
          inventoryIssueNumber_(
            rowValues[
              columns
                .transferredToStorage
            ]
          ),

        writtenOff:
          inventoryIssueNumber_(
            rowValues[
              columns.writtenOff
            ]
          ),

        status:
          String(
            rowValues[
              columns.status
            ] || ''
          ).trim()
      };

      /****************************************************
       * ЗАБОРОНА ПРОДАЖУ РАНІШЕ НАДХОДЖЕННЯ
       ****************************************************/

      const receivedAfterOperation =
        receiptDate &&
        operationDate &&
        receiptDate.getTime() >
          operationDate.getTime();

      if (
        receivedAfterOperation
      ) {
        futureReceiptLots.push(
          lot
        );

        return;
      }

      /****************************************************
       * ЗАБОРОНА ВИКОРИСТАННЯ ПРОСТРОЧЕНОЇ ПАРТІЇ
       ****************************************************/

      const isExpired =
        expiryDate &&
        operationDate &&
        expiryDate.getTime() <
          operationDate.getTime();

      if (isExpired) {
        expiredLots.push(
          lot
        );

        return;
      }

      availableLots.push(
        lot
      );
    }
  );

  /****************************************************
   * FEFO / FIFO
   *
   * 1. Найближчий термін придатності.
   * 2. Якщо термін однаковий або відсутній —
   *    найстаріша дата надходження.
   * 3. Якщо дати однакові —
   *    найменший номер рядка.
   ****************************************************/

  availableLots.sort(
    function(
      first,
      second
    ) {
      const farFuture =
        new Date(
          9999,
          11,
          31
        ).getTime();

      const firstExpiry =
        first.expiryDate
          ? first.expiryDate
              .getTime()
          : farFuture;

      const secondExpiry =
        second.expiryDate
          ? second.expiryDate
              .getTime()
          : farFuture;

      if (
        firstExpiry !==
        secondExpiry
      ) {
        return (
          firstExpiry -
          secondExpiry
        );
      }

      const firstReceipt =
        first.receiptDate
          ? first.receiptDate
              .getTime()
          : farFuture;

      const secondReceipt =
        second.receiptDate
          ? second.receiptDate
              .getTime()
          : farFuture;

      if (
        firstReceipt !==
        secondReceipt
      ) {
        return (
          firstReceipt -
          secondReceipt
        );
      }

      return (
        first.sheetRow -
        second.sheetRow
      );
    }
  );

  const totalAvailable =
    availableLots.reduce(
      function(
        total,
        lot
      ) {
        return (
          total +
          lot.currentBalance
        );
      },
      0
    );

  return {
    inventoryType:
      expectedInventoryType,

    inventoryName:
      inventoryName,

    /*
     * Зворотна сумісність
     * із вакцинною інтеграцією.
     */
    vaccineName:
      inventoryName,

    operationDate:
      operationDate,

    availableLots:
      availableLots,

    expiredLots:
      expiredLots,

    futureReceiptLots:
      futureReceiptLots,

    totalAvailable:
      totalAvailable
  };
}


/****************************************************
 * ФОРМУВАННЯ ПЛАНУ ВИБУТТЯ
 *
 * Не змінює жодних даних.
 *
 * @return {Object}
 ****************************************************/

/****************************************************
 * ФОРМУВАННЯ ПЛАНУ ВИБУТТЯ
 *
 * Підтримує:
 * — вакцини;
 * — швидкі тести;
 * — косметичні товари.
 *
 * Не змінює жодних даних.
 ****************************************************/
function planInventoryIssue_(
  data
) {
  if (!data) {
    throw new Error(
      'Не передано дані операції'
    );
  }

  /****************************************************
   * 1. КЛАСИФІКАЦІЯ ОПЕРАЦІЇ
   ****************************************************/

  const issueType =
    getInventoryIssueType_(
      data
    );

  /*
   * Операції, які не є первинним
   * складським вибуттям, повертають
   * безпечний порожній план.
   */
  if (
    !issueType ||
    issueType.isIssue !== true
  ) {
    return {
      ok:
        true,

      requiresIssue:
        false,

      operationId:
        data.id || '',

      inventoryType:
        issueType
          ? issueType.inventoryType || ''
          : '',

      inventoryName:
        issueType
          ? issueType.inventoryName || ''
          : '',

      /*
       * Поле залишене для сумісності
       * з вакцинною інтеграцією.
       */
      vaccineName:
        issueType
          ? issueType.inventoryName || ''
          : '',

      reason:
        issueType
          ? issueType.reason || ''
          : 'Операція не є складським вибуттям',

      movementType:
        issueType
          ? issueType.movementType
          : INVENTORY_ISSUE_CONFIG
              .movementTypes
              .noMovement,

      stockCounter:
        '',

      stockColumn:
        0,

      requestedQuantity:
        0,

      totalAvailableBefore:
        0,

      totalAvailableAfter:
        0,

      totalCost:
        0,

      allocations: [],

      expiredLotsIgnored: [],

      futureReceiptLotsIgnored: [],

      fefoApplied:
        false,

      noCellsWritten:
        true
    };
  }

  /****************************************************
   * 2. КІЛЬКІСТЬ ВИБУТТЯ
   ****************************************************/

  const requestedQuantity =
    inventoryIssueNumber_(
      data.quantity
    );

  if (
    requestedQuantity <=
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Кількість вибуття має бути більшою за нуль'
    );
  }

  /****************************************************
   * 3. ДОСТУПНІ ПАРТІЇ
   ****************************************************/

  const lotsResult =
    getAvailableInventoryLots_(
      data
    );

  const inventoryType =
    issueType.inventoryType ||
    lotsResult.inventoryType ||
    '';

  const inventoryName =
    issueType.inventoryName ||
    lotsResult.inventoryName ||
    String(
      data.article ||
      data.inventoryName ||
      ''
    ).trim();

  /****************************************************
   * 4. ЖОДНОЇ ДОСТУПНОЇ ПАРТІЇ
   ****************************************************/

  if (
    !Array.isArray(
      lotsResult.availableLots
    ) ||
    lotsResult.availableLots
      .length === 0
  ) {
    /*
     * Є партія з відповідною назвою,
     * але вона надійшла пізніше дати
     * поточної операції.
     */
    if (
      Array.isArray(
        lotsResult.futureReceiptLots
      ) &&
      lotsResult.futureReceiptLots
        .length > 0
    ) {
      const firstFutureLot =
        lotsResult.futureReceiptLots[0];

      const receiptDateText =
        firstFutureLot.receiptDate
          instanceof Date &&
        !isNaN(
          firstFutureLot
            .receiptDate
            .getTime()
        )
          ? Utilities.formatDate(
              firstFutureLot.receiptDate,
              Session.getScriptTimeZone(),
              'dd.MM.yyyy'
            )
          : 'не визначено';

      throw new Error(
        'Запас "' +
        inventoryName +
        '" не може бути списаний на дату операції. ' +
        'Найраніше надходження цієї партії: ' +
        receiptDateText
      );
    }

    /*
     * Відповідні партії є,
     * але всі вони прострочені.
     */
    if (
      Array.isArray(
        lotsResult.expiredLots
      ) &&
      lotsResult.expiredLots
        .length > 0
    ) {
      throw new Error(
        'Усі доступні партії запасу "' +
        inventoryName +
        '" типу "' +
        inventoryType +
        '" прострочені на дату операції'
      );
    }

    throw new Error(
      'Не знайдено доступних партій запасу "' +
      inventoryName +
      '" типу "' +
      inventoryType +
      '"'
    );
  }

  /****************************************************
   * 5. ПЕРЕВІРКА ЗАГАЛЬНОГО ЗАЛИШКУ
   ****************************************************/

  if (
    lotsResult.totalAvailable +
    INVENTORY_ISSUE_CONFIG
      .tolerance <
    requestedQuantity
  ) {
    throw new Error(
      'Недостатньо залишку запасу "' +
      inventoryName +
      '". Потрібно: ' +
      requestedQuantity +
      ', доступно: ' +
      lotsResult.totalAvailable
    );
  }

  /****************************************************
   * 6. РОЗПОДІЛ ЗА FEFO / FIFO
   ****************************************************/

  let quantityToAllocate =
    requestedQuantity;

  const allocations = [];

  lotsResult.availableLots.forEach(
    function(lot) {
      if (
        quantityToAllocate <=
        INVENTORY_ISSUE_CONFIG
          .tolerance
      ) {
        return;
      }

      const allocatedQuantity =
        Math.min(
          inventoryIssueNumber_(
            lot.currentBalance
          ),
          quantityToAllocate
        );

      if (
        allocatedQuantity <=
        INVENTORY_ISSUE_CONFIG
          .tolerance
      ) {
        return;
      }

      const unitCost =
        inventoryIssueRoundMoney_(
          lot.unitCost
        );

      const allocationCost =
        inventoryIssueRoundMoney_(
          allocatedQuantity *
          unitCost
        );

      allocations.push({
        sheetRow:
          lot.sheetRow,

        lotId:
          lot.lotId,

        receiptOperationId:
          lot.receiptOperationId || '',

        inventoryType:
          lot.inventoryType ||
          inventoryType,

        inventoryName:
          lot.inventoryName ||
          inventoryName,

        series:
          lot.series || '',

        expiryDate:
          lot.expiryDate || null,

        receiptDate:
          lot.receiptDate || null,

        supplier:
          lot.supplier || '',

        balanceBefore:
          inventoryIssueNumber_(
            lot.currentBalance
          ),

        quantity:
          allocatedQuantity,

        balanceAfter:
          inventoryIssueNumber_(
            lot.currentBalance -
            allocatedQuantity
          ),

        unitCost:
          unitCost,

        totalCost:
          allocationCost
      });

      quantityToAllocate =
        inventoryIssueNumber_(
          quantityToAllocate -
          allocatedQuantity
        );
    }
  );

  /****************************************************
   * 7. КОНТРОЛЬ ПОВНОТИ РОЗПОДІЛУ
   ****************************************************/

  if (
    quantityToAllocate >
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Не вдалося повністю розподілити кількість вибуття між партіями. ' +
      'Не розподілено: ' +
      quantityToAllocate
    );
  }

  if (!allocations.length) {
    throw new Error(
      'Не сформовано жодної складської алокації для запасу "' +
      inventoryName +
      '"'
    );
  }

  /****************************************************
   * 8. ЗАГАЛЬНА СОБІВАРТІСТЬ
   ****************************************************/

  const totalCost =
    inventoryIssueRoundMoney_(
      allocations.reduce(
        function(
          total,
          item
        ) {
          return (
            total +
            inventoryIssueNumber_(
              item.totalCost
            )
          );
        },
        0
      )
    );

  if (
    !Number.isFinite(
      totalCost
    ) ||
    totalCost < 0
  ) {
    throw new Error(
      'Не вдалося розрахувати собівартість вибуття запасу "' +
      inventoryName +
      '"'
    );
  }

  /****************************************************
   * 9. ВИЗНАЧЕННЯ МЕТОДУ ВИБОРУ
   ****************************************************/

  const hasExpiryDates =
    allocations.some(
      function(item) {
        return (
          item.expiryDate
            instanceof Date &&
          !isNaN(
            item.expiryDate
              .getTime()
          )
        );
      }
    );

  const selectionMethod =
    hasExpiryDates
      ? 'FEFO'
      : 'FIFO';

  /****************************************************
   * 10. ФІНАЛЬНИЙ ПЛАН
   ****************************************************/

  return {
    ok:
      true,

    requiresIssue:
      true,

    operationId:
      data.id || '',

    inventoryType:
      inventoryType,

    inventoryName:
      inventoryName,

    /*
     * Зворотна сумісність:
     * вакцинні модулі продовжують
     * отримувати старе поле.
     */
    vaccineName:
      inventoryName,

    requestedQuantity:
      requestedQuantity,

    movementType:
      issueType.movementType,

    stockCounter:
      issueType.stockCounter,

    stockColumn:
      issueType.stockColumn,

    totalAvailableBefore:
      lotsResult.totalAvailable,

    totalAvailableAfter:
      inventoryIssueNumber_(
        lotsResult.totalAvailable -
        requestedQuantity
      ),

    totalCost:
      totalCost,

    averageUnitCost:
      requestedQuantity > 0
        ? inventoryIssueRoundMoney_(
            totalCost /
            requestedQuantity
          )
        : 0,

    allocations:
      allocations,

    expiredLotsIgnored:
      (
        lotsResult.expiredLots ||
        []
      ).map(
        function(lot) {
          return {
            lotId:
              lot.lotId,

            inventoryType:
              lot.inventoryType,

            inventoryName:
              lot.inventoryName,

            series:
              lot.series,

            expiryDate:
              lot.expiryDate,

            balance:
              lot.currentBalance
          };
        }
      ),

    futureReceiptLotsIgnored:
      (
        lotsResult.futureReceiptLots ||
        []
      ).map(
        function(lot) {
          return {
            lotId:
              lot.lotId,

            inventoryType:
              lot.inventoryType,

            inventoryName:
              lot.inventoryName,

            series:
              lot.series,

            receiptDate:
              lot.receiptDate,

            balance:
              lot.currentBalance
          };
        }
      ),

    selectionMethod:
      selectionMethod,

    /*
     * Для старих перевірок залишаємо
     * ознаку fefoApplied.
     *
     * Для товару без терміну придатності
     * вона буде false, бо застосовано FIFO.
     */
    fefoApplied:
      selectionMethod === 'FEFO',

    fifoApplied:
      selectionMethod === 'FIFO',

    noCellsWritten:
      true
  };
}


/****************************************************
 * СУХИЙ ТЕСТ КЛАСИФІКАЦІЇ
 *
 * Не читає і не змінює склад.
 ****************************************************/

function testInventoryIssueClassificationDryRun() {
  const cases = [
    {
      name:
        'Продаж і використання',

      data: {
        type:
          'Вакцина',

        category:
          'Продаж і використання'
      },

      expectedIssue:
        true,

      expectedMovement:
        'Продаж і використання'
    },

    {
      name:
        'Продаж на зберігання',

      data: {
        type:
          'Вакцина',

        category:
          'Продаж на зберігання'
      },

      expectedIssue:
        true,

      expectedMovement:
        'Передано на зберігання'
    },

    {
      name:
        'Зміна статусу',

      data: {
        type:
          'Вакцина',

        category:
          'Зміна статусу'
      },

      expectedIssue:
        false,

      expectedMovement:
        'Без руху'
    },

    {
      name:
        'Звичайні доходи',

      data: {
        type:
          'Доходи',

        category:
          'Консультація'
      },

      expectedIssue:
        false,

      expectedMovement:
        'Без руху'
    }
  ];

  const results =
    cases.map(
      function(testCase) {
        const actual =
          getInventoryIssueType_(
            testCase.data
          );

        const passed =
          actual.isIssue ===
            testCase.expectedIssue &&
          actual.movementType ===
            testCase.expectedMovement;

        return {
          name:
            testCase.name,

          passed:
            passed,

          expectedIssue:
            testCase.expectedIssue,

          actualIssue:
            actual.isIssue,

          expectedMovement:
            testCase.expectedMovement,

          actualMovement:
            actual.movementType,

          reason:
            actual.reason || ''
        };
      }
    );

  const ok =
    results.every(
      function(item) {
        return item.passed === true;
      }
    );

  const result = {
    ok:
      ok,

    test:
      'testInventoryIssueClassificationDryRun',

    results:
      results,

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? 'Класифікація вибуття пройшла сухий тест'
        : 'Є помилки класифікації вибуття. Перевірте журнал.',
      'Склад',
      7
    );

  return result;
}


/****************************************************
 * СУХИЙ ТЕСТ ПЛАНУВАННЯ
 *
 * Бере першу доступну вакцину зі складу
 * і планує вибуття 1 одиниці.
 *
 * Нічого не записує.
 ****************************************************/

function testInventoryIssuePlanningDryRun() {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INVENTORY_ISSUE_CONFIG
        .stockSheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_ISSUE_CONFIG
        .stockSheetName +
      '"'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'У складі немає партій для сухого тесту'
    );
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        19
      )
      .getValues();

  const columns =
    INVENTORY_ISSUE_CONFIG
      .stockColumns;

  const today =
    inventoryIssueDateOnly_(
      new Date()
    );

  const testLot =
    values.find(
      function(rowValues) {
        const lotId =
          String(
            rowValues[
              columns.lotId
            ] || ''
          ).trim();

        const inventoryType =
          inventoryIssueNormalize_(
            rowValues[
              columns.inventoryType
            ]
          );

        const name =
          String(
            rowValues[
              columns.inventoryName
            ] || ''
          ).trim();

        const balance =
          inventoryIssueNumber_(
            rowValues[
              columns.currentBalance
            ]
          );

        const expiryDate =
          inventoryIssueDateOnly_(
            rowValues[
              columns.expiryDate
            ]
          );

        const notExpired =
          !expiryDate ||
          !today ||
          expiryDate.getTime() >=
            today.getTime();

        return (
          lotId &&
          inventoryType ===
            inventoryIssueNormalize_(
              INVENTORY_ISSUE_CONFIG
                .inventoryType
            ) &&
          name &&
          balance >= 1 &&
          notExpired
        );
      }
    );

  if (!testLot) {
    throw new Error(
      'Не знайдено доступної непростроченої вакцини із залишком не менше 1'
    );
  }

  const vaccineName =
    String(
      testLot[
        columns.inventoryName
      ] || ''
    ).trim();

  const data = {
    id:
      'DRY-ISSUE-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ),

    date:
      today,

    type:
      'Вакцина',

    category:
      'Продаж і використання',

    article:
      vaccineName,

    quantity:
      1
  };

  const plan =
    planInventoryIssue_(
      data
    );

  if (
    !plan.ok ||
    !plan.requiresIssue ||
    plan.requestedQuantity !== 1 ||
    plan.allocations.length < 1
  ) {
    throw new Error(
      'Сухий план вибуття сформовано некоректно'
    );
  }

  const result = {
    ok:
      true,

    test:
      'testInventoryIssuePlanningDryRun',

    data:
      data,

    plan:
      plan,

    checks: {
      operationRecognized:
        plan.requiresIssue === true,

      quantityPlanned:
        plan.requestedQuantity === 1,

      atLeastOneLotSelected:
        plan.allocations.length >= 1,

      costCalculated:
        plan.totalCost >= 0,

      fefoApplied:
        plan.fefoApplied === true,

      noCellsWritten:
        plan.noCellsWritten === true
    },

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      'Сухий план вибуття сформовано. Дані не змінено.',
      'Склад',
      8
    );

  return result;
}
/****************************************************
 * СУХИЙ ТЕСТ FEFO НА ДВОХ ПАРТІЯХ
 *
 * Очікування:
 * 1. знаходить щонайменше дві партії
 *    "Тестова вакцина FEFO";
 * 2. запитує більше, ніж є у першій партії;
 * 3. першу партію використовує повністю;
 * 4. решту бере з другої партії;
 * 5. нічого не записує.
 ****************************************************/

function testInventoryIssueFefoTwoLotsDryRun() {
  const today =
    inventoryIssueDateOnly_(
      new Date()
    );

  const vaccineName =
    'Тестова вакцина FEFO';

  const lookupData = {
    date:
      today,

    article:
      vaccineName
  };

  const lotsResult =
    getAvailableInventoryLots_(
      lookupData
    );

  if (
    lotsResult.availableLots.length < 2
  ) {
    throw new Error(
      'Для тесту FEFO потрібно щонайменше дві доступні партії вакцини "' +
      vaccineName +
      '". Зараз знайдено: ' +
      lotsResult.availableLots.length
    );
  }

  const firstLot =
    lotsResult.availableLots[0];

  const secondLot =
    lotsResult.availableLots[1];

  if (
    secondLot.currentBalance <
    1
  ) {
    throw new Error(
      'У другої партії недостатньо залишку для тесту'
    );
  }

  /*
   * Запитуємо всю першу партію
   * плюс одну одиницю з другої.
   */
  const requestedQuantity =
    firstLot.currentBalance + 1;

  const data = {
    id:
      'DRY-FEFO-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ),

    date:
      today,

    type:
      'Вакцина',

    category:
      'Продаж і використання',

    article:
      vaccineName,

    quantity:
      requestedQuantity
  };

  const plan =
    planInventoryIssue_(
      data
    );

  const firstAllocation =
    plan.allocations[0] || null;

  const secondAllocation =
    plan.allocations[1] || null;

  const checks = {
    issueRecognized:
      plan.requiresIssue === true,

    twoLotsUsed:
      plan.allocations.length >= 2,

    firstFefoLotSelected:
      firstAllocation &&
      firstAllocation.lotId ===
        firstLot.lotId,

    firstLotUsedCompletely:
      firstAllocation &&
      Math.abs(
        firstAllocation.quantity -
        firstLot.currentBalance
      ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

    firstLotBalanceBecomesZero:
      firstAllocation &&
      Math.abs(
        firstAllocation.balanceAfter
      ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

    secondLotSelectedNext:
      secondAllocation &&
      secondAllocation.lotId ===
        secondLot.lotId,

    oneUnitTakenFromSecond:
      secondAllocation &&
      Math.abs(
        secondAllocation.quantity - 1
      ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

    requestedQuantityMatched:
      Math.abs(
        plan.requestedQuantity -
        requestedQuantity
      ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

    fefoApplied:
      plan.fefoApplied === true,

    noCellsWritten:
      plan.noCellsWritten === true
  };

  const ok =
    Object.keys(checks)
      .every(function(key) {
        return Boolean(
          checks[key]
        );
      });

  const result = {
    ok:
      ok,

    test:
      'testInventoryIssueFefoTwoLotsDryRun',

    vaccineName:
      vaccineName,

    requestedQuantity:
      requestedQuantity,

    availableLotsBefore:
      lotsResult.availableLots.map(
        function(lot) {
          return {
            lotId:
              lot.lotId,

            series:
              lot.series,

            expiryDate:
              lot.expiryDate,

            currentBalance:
              lot.currentBalance,

            unitCost:
              lot.unitCost
          };
        }
      ),

    plan:
      plan,

    checks:
      checks,

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? 'FEFO на двох партіях перевірено'
        : 'FEFO-тест не пройдено',
      'Склад',
      8
    );

  if (!ok) {
    throw new Error(
      'Сухий тест FEFO на двох партіях не пройдено. Перевірте журнал.'
    );
  }

  return result;
}
/****************************************************
 * СУХИЙ ТЕСТ НЕГАТИВНИХ СЦЕНАРІЇВ ВИБУТТЯ
 *
 * Перевіряє:
 * 1. Недостатній залишок.
 * 2. Вакцина не знайдена.
 * 3. "Зміна статусу" не створює вибуття.
 *
 * Нічого не записує і не змінює.
 ****************************************************/

function testInventoryIssueNegativeScenariosDryRun() {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INVENTORY_ISSUE_CONFIG
        .stockSheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_ISSUE_CONFIG
        .stockSheetName +
      '"'
    );
  }

  const vaccineName =
    'Тестова вакцина FEFO';

  const today =
    inventoryIssueDateOnly_(
      new Date()
    );

  /*
   * Робимо знімок складу до тесту.
   */
  const beforeValues =
    sheet
      .getDataRange()
      .getValues();

  const beforeSnapshot =
    JSON.stringify(
      beforeValues
    );

  const results = {
    insufficientStock: {
      passed: false,
      expectedError:
        'Недостатньо залишку',
      actualError: ''
    },

    vaccineNotFound: {
      passed: false,
      expectedError:
        'Не знайдено доступних партій',
      actualError: ''
    },

    statusChangeNoIssue: {
      passed: false,
      actualPlan: null
    }
  };

  /****************************************************
   * СЦЕНАРІЙ 1
   * НЕДОСТАТНІЙ ЗАЛИШОК
   ****************************************************/

  const lotsResult =
    getAvailableInventoryLots_({
      date:
        today,

      article:
        vaccineName
    });

  if (
    lotsResult.totalAvailable <=
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Немає доступного залишку "' +
      vaccineName +
      '" для тесту недостатньої кількості'
    );
  }

  const excessiveQuantity =
    lotsResult.totalAvailable + 1;

  try {
    planInventoryIssue_({
      id:
        'DRY-NEGATIVE-STOCK-' +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          'yyyyMMdd-HHmmss'
        ),

      date:
        today,

      type:
        'Вакцина',

      category:
        'Продаж і використання',

      article:
        vaccineName,

      quantity:
        excessiveQuantity
    });

    /*
     * Якщо помилки не було —
     * захист недостатнього залишку не працює.
     */
    results
      .insufficientStock
      .actualError =
        'Помилка не виникла';

  } catch (error) {
    const message =
      String(
        error &&
        error.message
          ? error.message
          : error
      );

    results
      .insufficientStock
      .actualError =
        message;

    results
      .insufficientStock
      .passed =
        message.includes(
          'Недостатньо залишку'
        );
  }

  /****************************************************
   * СЦЕНАРІЙ 2
   * ВАКЦИНА НЕ ЗНАЙДЕНА
   ****************************************************/

  const missingVaccineName =
    'TEST-VACCINE-NOT-FOUND-' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    );

  try {
    planInventoryIssue_({
      id:
        'DRY-NEGATIVE-NOT-FOUND-' +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          'yyyyMMdd-HHmmss'
        ),

      date:
        today,

      type:
        'Вакцина',

      category:
        'Продаж і використання',

      article:
        missingVaccineName,

      quantity:
        1
    });

    results
      .vaccineNotFound
      .actualError =
        'Помилка не виникла';

  } catch (error) {
    const message =
      String(
        error &&
        error.message
          ? error.message
          : error
      );

    results
      .vaccineNotFound
      .actualError =
        message;

    results
      .vaccineNotFound
      .passed =
        message.includes(
          'Не знайдено доступних партій'
        );
  }

  /****************************************************
   * СЦЕНАРІЙ 3
   * ЗМІНА СТАТУСУ — БЕЗ ВИБУТТЯ
   ****************************************************/

  const statusChangePlan =
    planInventoryIssue_({
      id:
        'DRY-NEGATIVE-STATUS-' +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          'yyyyMMdd-HHmmss'
        ),

      date:
        today,

      type:
        'Вакцина',

      category:
        'Зміна статусу',

      article:
        vaccineName,

      quantity:
        1
    });

  results
    .statusChangeNoIssue
    .actualPlan =
      statusChangePlan;

  results
    .statusChangeNoIssue
    .passed =
      statusChangePlan.ok === true &&
      statusChangePlan
        .requiresIssue === false &&
      statusChangePlan
        .movementType ===
        'Без руху' &&
      Array.isArray(
        statusChangePlan.allocations
      ) &&
      statusChangePlan
        .allocations
        .length === 0 &&
      Number(
        statusChangePlan.totalCost
      ) === 0;

  /****************************************************
   * КОНТРОЛЬ ВІДСУТНОСТІ ЗМІН
   ****************************************************/

  SpreadsheetApp.flush();

  const afterValues =
    sheet
      .getDataRange()
      .getValues();

  const afterSnapshot =
    JSON.stringify(
      afterValues
    );

  const noCellsWritten =
    beforeSnapshot ===
    afterSnapshot;

  const allScenariosPassed =
    results
      .insufficientStock
      .passed &&
    results
      .vaccineNotFound
      .passed &&
    results
      .statusChangeNoIssue
      .passed;

  const result = {
    ok:
      allScenariosPassed &&
      noCellsWritten,

    test:
      'testInventoryIssueNegativeScenariosDryRun',

    vaccineName:
      vaccineName,

    availableStock:
      lotsResult.totalAvailable,

    excessiveQuantity:
      excessiveQuantity,

    scenarios:
      results,

    noCellsWritten:
      noCellsWritten
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      result.ok
        ? 'Негативні сценарії вибуття перевірено'
        : 'Негативний тест не пройдено',
      'Склад',
      8
    );

  if (!result.ok) {
    throw new Error(
      'Не всі негативні сценарії пройдено. Перевірте журнал виконання.'
    );
  }

  return result;
}
/****************************************************
 * РЕАЛЬНИЙ ЗАПИС ВИБУТТЯ ЗАПАСІВ
 *
 * Поки не підключений до postInputOperation().
 *
 * Послідовність:
 * 1. Формує план FEFO.
 * 2. Робить знімок партій.
 * 3. Оновлює показники партій.
 * 4. Створює рухи складу.
 * 5. Перевіряє результат.
 * 6. При помилці повністю відновлює стан.
 ****************************************************/


/**
 * Проводить складське вибуття.
 *
 * @param {Object} data
 * @return {Object}
 */
/****************************************************
 * РЕАЛЬНИЙ ЗАПИС ВИБУТТЯ ЗАПАСІВ
 *
 * Підтримує:
 * — вакцини;
 * — швидкі тести;
 * — косметичні товари.
 *
 * Послідовність:
 * 1. Формує план FEFO / FIFO.
 * 2. Перевіряє відсутність дубля руху.
 * 3. Робить знімок складських партій.
 * 4. Оновлює лічильники й залишки.
 * 5. Створює окремий рух по кожній партії.
 * 6. Перевіряє фактично записані дані.
 * 7. При помилці повністю відновлює склад.
 ****************************************************/
function writeInventoryIssue_(
  data
) {
  if (!data) {
    throw new Error(
      'Не передано дані операції вибуття'
    );
  }

  if (!data.id) {
    throw new Error(
      'Не визначено ID операції вибуття'
    );
  }

  const operationId =
    String(
      data.id || ''
    ).trim();

  /****************************************************
   * 1. ПЛАН ВИБУТТЯ
   ****************************************************/

  const plan =
    planInventoryIssue_(
      data
    );

  /*
   * Операція не потребує первинного
   * складського вибуття.
   */
  if (
    !plan ||
    plan.requiresIssue !== true
  ) {
    return {
      ok:
        true,

      requiresIssue:
        false,

      operationId:
        operationId,

      inventoryType:
        plan
          ? plan.inventoryType || ''
          : '',

      inventoryName:
        plan
          ? plan.inventoryName || ''
          : '',

      /*
       * Зворотна сумісність
       * із вакцинними функціями.
       */
      vaccineName:
        plan
          ? (
              plan.vaccineName ||
              plan.inventoryName ||
              ''
            )
          : '',

      reason:
        plan
          ? plan.reason || ''
          : 'Операція не потребує складського вибуття',

      movementType:
        plan
          ? plan.movementType || ''
          : '',

      requestedQuantity:
        0,

      totalCost:
        0,

      averageUnitCost:
        0,

      movementsCreated:
        0,

      movementRows: [],

      movementIds: [],

      movements: [],

      allocations: [],

      _rollbackSnapshot: []
    };
  }

  /****************************************************
   * 2. КОНТРОЛЬ ПЛАНУ
   ****************************************************/

  if (
    !plan.inventoryType
  ) {
    throw new Error(
      'У плані вибуття не визначено тип запасу'
    );
  }

  if (
    !plan.inventoryName
  ) {
    throw new Error(
      'У плані вибуття не визначено найменування запасу'
    );
  }

  if (
    !Array.isArray(
      plan.allocations
    ) ||
    !plan.allocations.length
  ) {
    throw new Error(
      'У плані вибуття не сформовано складські партії'
    );
  }

  /****************************************************
   * 3. РОБОЧІ ЛИСТИ
   ****************************************************/

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_ISSUE_CONFIG
        .stockSheetName
    );

  const movementSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME
    );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_ISSUE_CONFIG
        .stockSheetName +
      '"'
    );
  }

  if (!movementSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME +
      '"'
    );
  }

  /****************************************************
   * 4. ЗАХИСТ ВІД ПОВТОРНОГО ПРОВЕДЕННЯ
   ****************************************************/

  assertInventoryIssueNotExists_(
    movementSheet,
    operationId
  );

  /****************************************************
   * 5. ЗНІМОК ПАРТІЙ ДЛЯ ВІДКАТУ
   ****************************************************/

  const stockSnapshot =
    snapshotInventoryIssueRows_(
      stockSheet,
      plan.allocations
    );

  const createdMovementRows = [];
  const createdMovements = [];
  const enrichedAllocations = [];

  try {
    /****************************************************
     * 6. ОНОВЛЕННЯ СКЛАДСЬКИХ ПАРТІЙ
     ****************************************************/

    plan.allocations.forEach(
      function(allocation) {
        updateInventoryLotForIssue_(
          stockSheet,
          allocation,
          plan
        );
      }
    );

    /****************************************************
     * 7. СТВОРЕННЯ РУХІВ
     *
     * Кожна FEFO/FIFO-алокація
     * створює окремий рядок руху.
     ****************************************************/

    plan.allocations.forEach(
      function(
        allocation,
        index
      ) {
        const movementResult =
          writeInventoryIssueMovement_(
            movementSheet,
            data,
            plan,
            allocation,
            index + 1
          );

        const movementRow =
          Number(
            movementResult &&
            movementResult.row
          ) || 0;

        if (
          movementRow < 2
        ) {
          throw new Error(
            'Не визначено рядок створеного складського руху для партії "' +
            allocation.lotId +
            '"'
          );
        }

        createdMovementRows.push(
          movementRow
        );

        /*
         * Фактично читаємо створений рядок:
         *
         * A — ID руху;
         * B — ID операції;
         * C — дата;
         * D — тип запасу;
         * E — найменування;
         * F — ID партії.
         */
        const movementValues =
          movementSheet
            .getRange(
              movementRow,
              1,
              1,
              6
            )
            .getDisplayValues()[0];

        const movementId =
          String(
            (
              movementResult &&
              (
                movementResult.movementId ||
                movementResult.id
              )
            ) ||
            movementValues[0] ||
            ''
          ).trim();

        const recordedOperationId =
          String(
            movementValues[1] || ''
          ).trim();

        const recordedInventoryType =
          String(
            movementValues[3] || ''
          ).trim();

        const recordedInventoryName =
          String(
            movementValues[4] || ''
          ).trim();

        const recordedLotId =
          String(
            movementValues[5] || ''
          ).trim();

        const expectedLotId =
          String(
            allocation.lotId || ''
          ).trim();

        /****************************************************
         * 8. ПЕРЕВІРКА СТВОРЕНОГО РУХУ
         ****************************************************/

        if (!movementId) {
          throw new Error(
            'У створеному русі не визначено ID руху. Рядок: ' +
            movementRow
          );
        }

        if (
          recordedOperationId !==
          operationId
        ) {
          throw new Error(
            'ID операції у складському русі не відповідає операції. ' +
            'Очікується: "' +
            operationId +
            '", записано: "' +
            recordedOperationId +
            '"'
          );
        }

        if (
          inventoryIssueNormalize_(
            recordedInventoryType
          ) !==
          inventoryIssueNormalize_(
            plan.inventoryType
          )
        ) {
          throw new Error(
            'Тип запасу у складському русі не відповідає плану. ' +
            'Очікується: "' +
            plan.inventoryType +
            '", записано: "' +
            recordedInventoryType +
            '"'
          );
        }

        if (
          inventoryIssueNormalize_(
            recordedInventoryName
          ) !==
          inventoryIssueNormalize_(
            plan.inventoryName
          )
        ) {
          throw new Error(
            'Найменування у складському русі не відповідає плану. ' +
            'Очікується: "' +
            plan.inventoryName +
            '", записано: "' +
            recordedInventoryName +
            '"'
          );
        }

        if (
          recordedLotId !==
          expectedLotId
        ) {
          throw new Error(
            'Складський рух пов’язаний не з тією партією. ' +
            'Очікується: "' +
            expectedLotId +
            '", записано: "' +
            recordedLotId +
            '"'
          );
        }

        const duplicateMovementId =
          createdMovements.some(
            function(item) {
              return (
                item.movementId ===
                movementId
              );
            }
          );

        if (
          duplicateMovementId
        ) {
          throw new Error(
            'Створено дубль ID складського руху: "' +
            movementId +
            '"'
          );
        }

        /****************************************************
         * 9. НОРМАЛІЗАЦІЯ РЕЗУЛЬТАТУ
         ****************************************************/

        const quantity =
          inventoryIssueNumber_(
            allocation.quantity
          );

        const unitCost =
          inventoryIssueRoundMoney_(
            allocation.unitCost
          );

        const totalCost =
          inventoryIssueRoundMoney_(
            allocation.totalCost ||
            quantity * unitCost
          );

        const movement = {
          movementId:
            movementId,

          movementRow:
            movementRow,

          operationId:
            operationId,

          inventoryType:
            plan.inventoryType,

          inventoryName:
            plan.inventoryName,

          /*
           * Поле потрібне для чинної
           * вакцинної інтеграції.
           */
          vaccineName:
            plan.inventoryName,

          lotId:
            expectedLotId,

          movementType:
            plan.movementType,

          series:
            allocation.series || '',

          expiryDate:
            allocation.expiryDate || null,

          receiptDate:
            allocation.receiptDate || null,

          quantity:
            quantity,

          unitCost:
            unitCost,

          totalCost:
            totalCost
        };

        createdMovements.push(
          movement
        );

        enrichedAllocations.push(
          Object.assign(
            {},
            allocation,
            {
              movementId:
                movementId,

              movementRow:
                movementRow,

              operationId:
                operationId,

              inventoryType:
                plan.inventoryType,

              inventoryName:
                plan.inventoryName,

              /*
               * Зворотна сумісність
               * з Обліком вакцин.
               */
              vaccineName:
                plan.inventoryName,

              movementType:
                plan.movementType
            }
          )
        );
      }
    );

    SpreadsheetApp.flush();

    /****************************************************
     * 10. ФІНАЛЬНА ПЕРЕВІРКА
     ****************************************************/

    verifyInventoryIssueWrite_(
      stockSheet,
      movementSheet,
      data,
      plan
    );

    /****************************************************
     * 11. УСПІШНИЙ РЕЗУЛЬТАТ
     ****************************************************/

    return {
      ok:
        true,

      requiresIssue:
        true,

      operationId:
        operationId,

      inventoryType:
        plan.inventoryType,

      inventoryName:
        plan.inventoryName,

      /*
       * Старе поле зберігаємо,
       * щоб не зламати:
       * — completeVaccineInventoryIssue_();
       * — Облік вакцин;
       * — вакцинне повідомлення.
       */
      vaccineName:
        plan.inventoryName,

      movementType:
        plan.movementType,

      stockCounter:
        plan.stockCounter,

      stockColumn:
        plan.stockColumn,

      selectionMethod:
        plan.selectionMethod || '',

      requestedQuantity:
        plan.requestedQuantity,

      totalCost:
        inventoryIssueRoundMoney_(
          plan.totalCost
        ),

      averageUnitCost:
        Number(
          plan.requestedQuantity
        ) > 0
          ? inventoryIssueRoundMoney_(
              plan.totalCost /
              plan.requestedQuantity
            )
          : 0,

      movementsCreated:
        createdMovements.length,

      movementRows:
        createdMovements.map(
          function(item) {
            return item.movementRow;
          }
        ),

      movementIds:
        createdMovements.map(
          function(item) {
            return item.movementId;
          }
        ),

      /*
       * Повний контракт фактично
       * створених складських рухів.
       */
      movements:
        createdMovements,

      /*
       * Кожна алокація містить
       * movementId та movementRow.
       */
      allocations:
        enrichedAllocations,

      /*
       * Знімок передається зовнішньому
       * модулю для контрольованого відкату.
       */
      _rollbackSnapshot:
        stockSnapshot
    };

  } catch (error) {
    /****************************************************
     * 12. ВИДАЛЕННЯ СТВОРЕНИХ РУХІВ
     ****************************************************/

    createdMovementRows
      .slice()
      .reverse()
      .forEach(
        function(row) {
          try {
            clearInventoryMovementRow_(
              row
            );

          } catch (cleanupError) {
            Logger.log(
              'Не вдалося очистити рух вибуття, рядок ' +
              row +
              ': ' +
              cleanupError.message
            );
          }
        }
      );

    /****************************************************
     * 13. ВІДНОВЛЕННЯ СКЛАДСЬКИХ ПАРТІЙ
     ****************************************************/

    try {
      restoreInventoryIssueRows_(
        stockSheet,
        stockSnapshot
      );

    } catch (restoreError) {
      Logger.log(
        'Критична помилка відновлення складу: ' +
        restoreError.message
      );
    }

    SpreadsheetApp.flush();

    throw new Error(
      'Вибуття запасів не проведено. ' +
      'Попередній стан відновлено. Причина: ' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      )
    );
  }
}


/**
 * Забороняє повторне проведення вибуття
 * за тим самим ID операції.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} movementSheet
 * @param {string} operationId
 */
function assertInventoryIssueNotExists_(
  movementSheet,
  operationId
) {
  const exists =
    inventoryValueExists_(
      movementSheet,
      2,
      operationId
    );

  if (exists) {
    throw new Error(
      'Рух складу для операції "' +
      operationId +
      '" уже існує'
    );
  }
}


/**
 * Робить знімок змінюваних рядків складу.
 *
 * Зберігає L:Q:
 * L — Продано / використано
 * M — Передано на зберігання
 * N — Списано
 * O — Поточний залишок
 * P — Мінімальний залишок
 * Q — Статус
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Object>} allocations
 * @return {Array<Object>}
 */
function snapshotInventoryIssueRows_(
  sheet,
  allocations
) {
  return allocations.map(
    function(allocation) {
      const values =
        sheet
          .getRange(
            allocation.sheetRow,
            12,
            1,
            6
          )
          .getValues()[0];

      return {
        row:
          allocation.sheetRow,

        values:
          values
      };
    }
  );
}


/**
 * Відновлює партії зі знімка.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Object>} snapshot
 */
function restoreInventoryIssueRows_(
  sheet,
  snapshot
) {
  snapshot.forEach(
    function(item) {
      sheet
        .getRange(
          item.row,
          12,
          1,
          6
        )
        .setValues([
          item.values
        ]);
    }
  );
}


/**
 * Оновлює одну партію за планом вибуття.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} allocation
 * @param {Object} plan
 */
function updateInventoryLotForIssue_(
  sheet,
  allocation,
  plan
) {
  const row =
    allocation.sheetRow;

  const soldOrUsedCell =
    sheet.getRange(
      row,
      12
    );

  const transferredCell =
    sheet.getRange(
      row,
      13
    );

  const balanceCell =
    sheet.getRange(
      row,
      15
    );

  const minimumCell =
    sheet.getRange(
      row,
      16
    );

  const statusCell =
    sheet.getRange(
      row,
      17
    );

  const soldOrUsedBefore =
    inventoryIssueNumber_(
      soldOrUsedCell.getValue()
    );

  const transferredBefore =
    inventoryIssueNumber_(
      transferredCell.getValue()
    );

  if (
    plan.stockCounter ===
    'soldOrUsed'
  ) {
    soldOrUsedCell.setValue(
      soldOrUsedBefore +
      allocation.quantity
    );
  }

  if (
    plan.stockCounter ===
    'transferredToStorage'
  ) {
    transferredCell.setValue(
      transferredBefore +
      allocation.quantity
    );
  }

  const balanceAfter =
    inventoryIssueNumber_(
      allocation.balanceAfter
    );

  balanceCell.setValue(
    balanceAfter
  );

  const minimumStock =
    inventoryIssueNumber_(
      minimumCell.getValue()
    );

  statusCell.setValue(
    resolveInventoryLotStatus_(
      balanceAfter,
      minimumStock
    )
  );
}


/**
 * Визначає статус партії.
 *
 * @param {number} balance
 * @param {number} minimumStock
 * @return {string}
 */
function resolveInventoryLotStatus_(
  balance,
  minimumStock
) {
  const normalizedBalance =
    inventoryIssueNumber_(
      balance
    );

  const normalizedMinimum =
    inventoryIssueNumber_(
      minimumStock
    );

  if (
    normalizedBalance <=
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    return 'Закрита';
  }

  if (
    normalizedMinimum > 0 &&
    normalizedBalance <=
    normalizedMinimum
  ) {
    return 'Низький залишок';
  }

  return 'Активна';
}


/**
 * Створює один рух вибуття.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Object} data
 * @param {Object} plan
 * @param {Object} allocation
 * @param {number} sequence
 * @return {Object}
 */
/****************************************************
 * СТВОРЕННЯ ОДНОГО РУХУ ВИБУТТЯ
 *
 * Підтримує:
 * — Вакцина;
 * — Тест;
 * — Товар.
 *
 * Один рядок руху створюється
 * для кожної FEFO/FIFO-алокації.
 ****************************************************/
function writeInventoryIssueMovement_(
  sheet,
  data,
  plan,
  allocation,
  sequence
) {
  if (!sheet) {
    throw new Error(
      'Не передано лист "Рух складу"'
    );
  }

  if (!data || !data.id) {
    throw new Error(
      'Не визначено ID операції складського вибуття'
    );
  }

  if (!plan) {
    throw new Error(
      'Не передано план складського вибуття'
    );
  }

  if (!allocation) {
    throw new Error(
      'Не передано складську алокацію'
    );
  }

  const inventoryType =
    String(
      plan.inventoryType ||
      allocation.inventoryType ||
      ''
    ).trim();

  const inventoryName =
    String(
      plan.inventoryName ||
      plan.vaccineName ||
      allocation.inventoryName ||
      data.article ||
      ''
    ).trim();

  const lotId =
    String(
      allocation.lotId || ''
    ).trim();

  const movementType =
    String(
      plan.movementType || ''
    ).trim();

  const quantity =
    inventoryIssueNumber_(
      allocation.quantity
    );

  const unitCost =
    inventoryIssueRoundMoney_(
      allocation.unitCost
    );

  const totalCost =
    inventoryIssueRoundMoney_(
      allocation.totalCost ||
      quantity * unitCost
    );

  /****************************************************
   * КОНТРОЛЬ ОБОВ’ЯЗКОВИХ ДАНИХ
   ****************************************************/

  if (!inventoryType) {
    throw new Error(
      'Не визначено тип запасу для складського руху'
    );
  }

  if (!inventoryName) {
    throw new Error(
      'Не визначено найменування запасу для складського руху'
    );
  }

  if (!lotId) {
    throw new Error(
      'Не визначено ID партії для складського руху'
    );
  }

  if (!movementType) {
    throw new Error(
      'Не визначено тип складського руху'
    );
  }

  if (
    quantity <=
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Кількість складського вибуття має бути більшою за нуль'
    );
  }

  if (
    unitCost < 0 ||
    totalCost < 0
  ) {
    throw new Error(
      'Собівартість складського вибуття не може бути від’ємною'
    );
  }

  /****************************************************
   * ВИЗНАЧЕННЯ НОВОГО РЯДКА
   ****************************************************/

  const targetRow =
    findNextInventoryDataRow_(
      sheet
    );

  const movementId =
    buildInventoryIssueMovementId_(
      data.id,
      sequence
    );

  const userEmail =
    typeof getSafeUserEmail_ ===
      'function'
      ? getSafeUserEmail_()
      : '';

  const createdAt =
    new Date();

  /****************************************************
   * СТРУКТУРА «РУХ СКЛАДУ» A:L
   ****************************************************/

  const rowData = [
    movementId,       // A ID руху
    data.id,          // B ID операції
    data.date,        // C Дата
    inventoryType,    // D Тип запасу
    inventoryName,    // E Найменування
    lotId,            // F ID партії
    movementType,     // G Тип руху
    quantity,         // H Кількість
    unitCost,         // I Собівартість одиниці
    totalCost,        // J Загальна собівартість
    userEmail,        // K Користувач
    createdAt         // L Дата і час створення
  ];

  sheet
    .getRange(
      targetRow,
      1,
      1,
      rowData.length
    )
    .setValues([
      rowData
    ]);

  /****************************************************
   * ФОРМАТИ
   ****************************************************/

  sheet
    .getRange(
      targetRow,
      3
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    );

  sheet
    .getRange(
      targetRow,
      8
    )
    .setNumberFormat(
      '#,##0.00'
    );

  sheet
    .getRange(
      targetRow,
      9,
      1,
      2
    )
    .setNumberFormat(
      '#,##0.00'
    );

  sheet
    .getRange(
      targetRow,
      12
    )
    .setNumberFormat(
      'dd.MM.yyyy HH:mm:ss'
    );

  /****************************************************
   * ПЕРЕВІРКА ФАКТИЧНОГО ЗАПИСУ
   ****************************************************/

  const writtenValues =
    sheet
      .getRange(
        targetRow,
        1,
        1,
        10
      )
      .getDisplayValues()[0];

  const writtenMovementId =
    String(
      writtenValues[0] || ''
    ).trim();

  const writtenOperationId =
    String(
      writtenValues[1] || ''
    ).trim();

  const writtenInventoryType =
    String(
      writtenValues[3] || ''
    ).trim();

  const writtenInventoryName =
    String(
      writtenValues[4] || ''
    ).trim();

  const writtenLotId =
    String(
      writtenValues[5] || ''
    ).trim();

  if (
    writtenMovementId !==
    movementId
  ) {
    throw new Error(
      'Після запису не збігається ID складського руху'
    );
  }

  if (
    writtenOperationId !==
    String(data.id).trim()
  ) {
    throw new Error(
      'Після запису не збігається ID операції складського руху'
    );
  }

  if (
    inventoryIssueNormalize_(
      writtenInventoryType
    ) !==
    inventoryIssueNormalize_(
      inventoryType
    )
  ) {
    throw new Error(
      'Після запису не збігається тип запасу'
    );
  }

  if (
    inventoryIssueNormalize_(
      writtenInventoryName
    ) !==
    inventoryIssueNormalize_(
      inventoryName
    )
  ) {
    throw new Error(
      'Після запису не збігається найменування запасу'
    );
  }

  if (
    writtenLotId !==
    lotId
  ) {
    throw new Error(
      'Після запису не збігається ID партії'
    );
  }

  return {
    ok:
      true,

    row:
      targetRow,

    movementId:
      movementId,

    operationId:
      String(
        data.id
      ).trim(),

    inventoryType:
      inventoryType,

    inventoryName:
      inventoryName,

    /*
     * Залишено для сумісності
     * з вакцинною інтеграцією.
     */
    vaccineName:
      inventoryName,

    lotId:
      lotId,

    movementType:
      movementType,

    quantity:
      quantity,

    unitCost:
      unitCost,

    totalCost:
      totalCost
  };
}


/**
 * Формує ID руху вибуття.
 *
 * @param {string} operationId
 * @param {number} sequence
 * @return {string}
 */
function buildInventoryIssueMovementId_(
  operationId,
  sequence
) {
  return (
    String(operationId || '').trim() +
    '-MOV-OUT-' +
    Number(sequence || 1)
  );
}


/**
 * Перевіряє результат запису вибуття.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} stockSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} movementSheet
 * @param {Object} data
 * @param {Object} plan
 */
function verifyInventoryIssueWrite_(
  stockSheet,
  movementSheet,
  data,
  plan
) {
  const movementLastRow =
    movementSheet.getLastRow();

  const operationIds =
    movementLastRow >= 2
      ? movementSheet
          .getRange(
            2,
            2,
            movementLastRow - 1,
            1
          )
          .getDisplayValues()
          .flat()
      : [];

  const movementCount =
    operationIds.filter(
      function(value) {
        return (
          String(value || '').trim() ===
          String(data.id || '').trim()
        );
      }
    ).length;

  if (
    movementCount !==
    plan.allocations.length
  ) {
    throw new Error(
      'Кількість створених рухів не відповідає плану'
    );
  }

  plan.allocations.forEach(
    function(allocation) {
      const actualBalance =
        inventoryIssueNumber_(
          stockSheet
            .getRange(
              allocation.sheetRow,
              15
            )
            .getValue()
        );

      if (
        Math.abs(
          actualBalance -
          allocation.balanceAfter
        ) >
        INVENTORY_ISSUE_CONFIG
          .tolerance
      ) {
        throw new Error(
          'Не збігається залишок партії "' +
          allocation.lotId +
          '"'
        );
      }
    }
  );

  return true;
}


/****************************************************
 * ВІДКАТ ВИБУТТЯ ЗА ID ОПЕРАЦІЇ
 *
 * Використовуватиметься під час інтеграції
 * з postInputOperation().
 *
 * @param {string} operationId
 * @param {Array<Object>} stockSnapshot
 * @return {Object}
 */
function rollbackInventoryIssue_(
  operationId,
  stockSnapshot
) {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_ISSUE_CONFIG
        .stockSheetName
    );

  const movementSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .MOVEMENT_SHEET_NAME
    );

  const movementsCleared =
    clearInventoryRowsByValue_(
      movementSheet,
      2,
      operationId,
      INVENTORY_CONFIG
        .MOVEMENT_HEADERS
        .length
    );

  if (
    stockSnapshot &&
    stockSnapshot.length
  ) {
    restoreInventoryIssueRows_(
      stockSheet,
      stockSnapshot
    );
  }

  SpreadsheetApp.flush();

  return {
    operationId:
      operationId,

    movementsCleared:
      movementsCleared,

    stockRowsRestored:
      stockSnapshot
        ? stockSnapshot.length
        : 0
  };
}
/****************************************************
 * КОНТРОЛЬОВАНИЙ ТЕСТ РЕАЛЬНОГО ВИБУТТЯ
 * З АВТОМАТИЧНИМ ВІДКАТОМ
 *
 * Очікування:
 * - списує 3 одиниці "Тестова вакцина FEFO";
 * - використовує дві партії за FEFO;
 * - створює два рухи;
 * - загальна собівартість = 650;
 * - після перевірки відновлює склад;
 * - видаляє створені рухи.
 ****************************************************/

/****************************************************
 * CONTROLLED TEST — ЗАПИС ВИБУТТЯ ТА ВІДКАТ
 * --------------------------------------------------
 * Тест самостійно:
 * 1. створює дві тимчасові FEFO-партії;
 * 2. планує вибуття 3 одиниць;
 * 3. створює складські рухи;
 * 4. перевіряє залишки та собівартість;
 * 5. виконує відкат;
 * 6. видаляє всі тестові дані.
 *
 * Після завершення у робочих листах
 * не повинно залишитися жодного тестового запису.
 ****************************************************/
function testInventoryIssueWriteAndRollback() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const lock =
    LockService.getDocumentLock();

  const timeZone =
    Session.getScriptTimeZone();

  const token =
    Utilities.formatDate(
      new Date(),
      timeZone,
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Math.floor(
      Math.random() * 900 + 100
    );

  const testOperationId =
    'TEST-ISSUE-' + token;

  const vaccineName =
    'TEST FEFO VACCINE ' + token;

  const firstLotId =
    'TEST-LOT-A-' + token;

  const secondLotId =
    'TEST-LOT-B-' + token;

  const firstSeries =
    'TEST-SERIES-A-' + token;

  const secondSeries =
    'TEST-SERIES-B-' + token;

  const testLotIds = [
    firstLotId,
    secondLotId
  ];

  let stockSheet = null;
  let movementSheet = null;

  let stockSnapshot = [];
  let plan = null;
  let writeResult = null;
  let rollbackResult = null;

  let checksAfterWrite = {};
  let checksAfterRollback = {};

  let finalResult = null;

  const cleanupResult = {
    attempted: false,
    movementsRemaining: null,
    testLotsRemaining: null,
    errors: [],
    ok: false
  };

  lock.waitLock(30000);

  try {
    stockSheet =
      ss.getSheetByName(
        INVENTORY_ISSUE_CONFIG
          .stockSheetName
      );

    movementSheet =
      ss.getSheetByName(
        INVENTORY_CONFIG
          .MOVEMENT_SHEET_NAME
      );

    if (!stockSheet) {
      throw new Error(
        'Не знайдено лист "' +
        INVENTORY_ISSUE_CONFIG
          .stockSheetName +
        '"'
      );
    }

    if (!movementSheet) {
      throw new Error(
        'Не знайдено лист "' +
        INVENTORY_CONFIG
          .MOVEMENT_SHEET_NAME +
        '"'
      );
    }

    const today =
      inventoryIssueDateOnly_(
        new Date()
      );

    const firstExpiryDate =
      new Date(today);

    firstExpiryDate.setDate(
      firstExpiryDate.getDate() + 30
    );

    const secondExpiryDate =
      new Date(today);

    secondExpiryDate.setDate(
      secondExpiryDate.getDate() + 60
    );

    const createdAt =
      new Date();

    const userEmail =
      typeof getSafeUserEmail_ === 'function'
        ? getSafeUserEmail_()
        : '';

    /*
     * Перша партія:
     * 1 одиниця × 150 грн = 150 грн.
     *
     * Має бути вибрана першою,
     * оскільки має найкоротший термін.
     */
    const firstLotRow = [
      firstLotId,                       // A ID партії
      'TEST-RECEIPT-A-' + token,        // B ID операції надходження
      'Вакцина',                        // C Тип запасу
      vaccineName,                      // D Найменування
      firstSeries,                      // E Серія
      firstExpiryDate,                  // F Термін придатності
      today,                            // G Дата надходження
      'TEST SUPPLIER',                  // H Постачальник
      1,                                // I Прийнято
      150,                              // J Собівартість одиниці
      150,                              // K Загальна закупівельна вартість
      0,                                // L Продано / використано
      0,                                // M Передано на зберігання
      0,                                // N Списано
      1,                                // O Поточний залишок
      0,                                // P Мінімальний залишок
      'Активна',                        // Q Статус
      userEmail,                        // R Користувач
      createdAt                         // S Дата і час створення
    ];

    /*
     * Друга партія:
     * 2 одиниці × 250 грн = 500 грн.
     *
     * Загальна тестова собівартість:
     * 150 + 500 = 650 грн.
     */
    const secondLotRow = [
      secondLotId,
      'TEST-RECEIPT-B-' + token,
      'Вакцина',
      vaccineName,
      secondSeries,
      secondExpiryDate,
      today,
      'TEST SUPPLIER',
      2,
      250,
      500,
      0,
      0,
      0,
      2,
      0,
      'Активна',
      userEmail,
      createdAt
    ];

    /*
     * Створюємо тимчасові партії
     * в перших двох рядках після фактичних даних.
     */
    const testStartRow =
      Math.max(
        stockSheet.getLastRow() + 1,
        2
      );

    const requiredLastRow =
      testStartRow + 1;

    if (
      stockSheet.getMaxRows() <
      requiredLastRow
    ) {
      stockSheet.insertRowsAfter(
        stockSheet.getMaxRows(),
        requiredLastRow -
          stockSheet.getMaxRows()
      );
    }

    stockSheet
      .getRange(
        testStartRow,
        1,
        2,
        19
      )
      .setValues([
        firstLotRow,
        secondLotRow
      ]);

    stockSheet
      .getRange(
        testStartRow,
        6,
        2,
        2
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    stockSheet
      .getRange(
        testStartRow,
        10,
        2,
        2
      )
      .setNumberFormat(
        '#,##0.00'
      );

    stockSheet
      .getRange(
        testStartRow,
        19,
        2,
        1
      )
      .setNumberFormat(
        'dd.MM.yyyy HH:mm:ss'
      );

    SpreadsheetApp.flush();

    const data = {
      id:
        testOperationId,

      date:
        today,

      type:
        'Вакцина',

      category:
        'Продаж і використання',

      article:
        vaccineName,

      quantity:
        3
    };

    /*
     * ЕТАП 1. Сухий план.
     */
    plan =
      planInventoryIssue_(
        data
      );

    if (
      !plan ||
      plan.ok !== true ||
      plan.requiresIssue !== true
    ) {
      throw new Error(
        'Не вдалося сформувати план тестового вибуття'
      );
    }

    if (
      !Array.isArray(
        plan.allocations
      ) ||
      plan.allocations.length !== 2
    ) {
      throw new Error(
        'Очікується дві FEFO-алокації. Фактично: ' +
        (
          plan.allocations
            ? plan.allocations.length
            : 0
        )
      );
    }

    const firstAllocation =
      plan.allocations[0];

    const secondAllocation =
      plan.allocations[1];

    const planningChecks = {
      firstLotSelected:
        firstAllocation.lotId ===
        firstLotId,

      secondLotSelected:
        secondAllocation.lotId ===
        secondLotId,

      firstLotQuantity:
        Math.abs(
          inventoryIssueNumber_(
            firstAllocation.quantity
          ) - 1
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      secondLotQuantity:
        Math.abs(
          inventoryIssueNumber_(
            secondAllocation.quantity
          ) - 2
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      firstSeriesCorrect:
        firstAllocation.series ===
        firstSeries,

      secondSeriesCorrect:
        secondAllocation.series ===
        secondSeries,

      firstCostCorrect:
        Math.abs(
          inventoryIssueNumber_(
            firstAllocation.unitCost
          ) - 150
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      secondCostCorrect:
        Math.abs(
          inventoryIssueNumber_(
            secondAllocation.unitCost
          ) - 250
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      totalCostCorrect:
        Math.abs(
          inventoryIssueNumber_(
            plan.totalCost
          ) - 650
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance
    };

    const planningChecksPassed =
      Object.keys(
        planningChecks
      ).every(
        function(key) {
          return Boolean(
            planningChecks[key]
          );
        }
      );

    if (!planningChecksPassed) {
      throw new Error(
        'FEFO-план тестових партій некоректний: ' +
        JSON.stringify(
          planningChecks
        )
      );
    }

    /*
     * Знімок L:Q перед реальним записом.
     */
    stockSnapshot =
      snapshotInventoryIssueRows_(
        stockSheet,
        plan.allocations
      );

    const beforeMovements =
      inventoryIssueCountMovementsByOperationId_(
        movementSheet,
        testOperationId
      );

    if (beforeMovements !== 0) {
      throw new Error(
        'До тесту вже існують рухи з ID "' +
        testOperationId +
        '"'
      );
    }

    /*
     * ЕТАП 2. Реальний тестовий запис.
     */
    writeResult =
      writeInventoryIssue_(
        data
      );

    SpreadsheetApp.flush();

    const afterWriteMovements =
      inventoryIssueCountMovementsByOperationId_(
        movementSheet,
        testOperationId
      );

    const firstActualBalance =
      inventoryIssueNumber_(
        stockSheet
          .getRange(
            firstAllocation.sheetRow,
            15
          )
          .getValue()
      );

    const secondActualBalance =
      inventoryIssueNumber_(
        stockSheet
          .getRange(
            secondAllocation.sheetRow,
            15
          )
          .getValue()
      );

    const firstSoldOrUsed =
      inventoryIssueNumber_(
        stockSheet
          .getRange(
            firstAllocation.sheetRow,
            12
          )
          .getValue()
      );

    const secondSoldOrUsed =
      inventoryIssueNumber_(
        stockSheet
          .getRange(
            secondAllocation.sheetRow,
            12
          )
          .getValue()
      );

    const snapshotFirstSoldOrUsed =
      inventoryIssueNumber_(
        stockSnapshot[0]
          .values[0]
      );

    const snapshotSecondSoldOrUsed =
      inventoryIssueNumber_(
        stockSnapshot[1]
          .values[0]
      );

    checksAfterWrite = {
      writeOk:
        writeResult &&
        writeResult.ok === true,

      requiresIssue:
        writeResult &&
        writeResult.requiresIssue === true,

      twoMovementsCreated:
        afterWriteMovements === 2,

      resultMovementCount:
        writeResult &&
        writeResult.movementsCreated === 2,

      firstBalanceUpdated:
        Math.abs(
          firstActualBalance -
          firstAllocation.balanceAfter
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      secondBalanceUpdated:
        Math.abs(
          secondActualBalance -
          secondAllocation.balanceAfter
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      firstCounterUpdated:
        Math.abs(
          firstSoldOrUsed -
          (
            snapshotFirstSoldOrUsed +
            firstAllocation.quantity
          )
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      secondCounterUpdated:
        Math.abs(
          secondSoldOrUsed -
          (
            snapshotSecondSoldOrUsed +
            secondAllocation.quantity
          )
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

      totalCostCorrect:
        writeResult &&
        Math.abs(
          inventoryIssueNumber_(
            writeResult.totalCost
          ) - 650
        ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance
    };

    const writeChecksPassed =
      Object.keys(
        checksAfterWrite
      ).every(
        function(key) {
          return Boolean(
            checksAfterWrite[key]
          );
        }
      );

    if (!writeChecksPassed) {
      throw new Error(
        'Реальний запис не пройшов контроль: ' +
        JSON.stringify(
          checksAfterWrite
        )
      );
    }

    /*
     * ЕТАП 3. Штатний відкат.
     */
    rollbackResult =
      rollbackInventoryIssue_(
        testOperationId,
        stockSnapshot
      );

    SpreadsheetApp.flush();

    const movementsAfterRollback =
      inventoryIssueCountMovementsByOperationId_(
        movementSheet,
        testOperationId
      );

    const stockRestored =
      inventoryIssueVerifySnapshotRestored_(
        stockSheet,
        stockSnapshot
      );

    checksAfterRollback = {
      movementsRemoved:
        movementsAfterRollback === 0,

      stockRestored:
        stockRestored === true,

      rollbackMovementCount:
        rollbackResult &&
        rollbackResult.movementsCleared === 2,

      rollbackStockRows:
        rollbackResult &&
        rollbackResult.stockRowsRestored === 2
    };

    const rollbackChecksPassed =
      Object.keys(
        checksAfterRollback
      ).every(
        function(key) {
          return Boolean(
            checksAfterRollback[key]
          );
        }
      );

    if (!rollbackChecksPassed) {
      throw new Error(
        'Відкат не пройшов контроль: ' +
        JSON.stringify(
          checksAfterRollback
        )
      );
    }

    finalResult = {
      ok:
        true,

      test:
        'testInventoryIssueWriteAndRollback',

      operationId:
        testOperationId,

      vaccineName:
        vaccineName,

      planningChecks:
        planningChecks,

      plan:
        plan,

      writeResult:
        writeResult,

      checksAfterWrite:
        checksAfterWrite,

      rollbackResult:
        rollbackResult,

      checksAfterRollback:
        checksAfterRollback
    };

  } catch (error) {
    finalResult = {
      ok:
        false,

      test:
        'testInventoryIssueWriteAndRollback',

      operationId:
        testOperationId,

      vaccineName:
        vaccineName,

      error:
        String(
          error &&
          error.message
            ? error.message
            : error
        ),

      plan:
        plan,

      writeResult:
        writeResult,

      checksAfterWrite:
        checksAfterWrite,

      rollbackResult:
        rollbackResult,

      checksAfterRollback:
        checksAfterRollback
    };

  } finally {
    cleanupResult.attempted =
      true;

    /*
     * Незалежно від результату тесту:
     * 1. видаляємо всі рухи тестової операції;
     * 2. повертаємо L:Q;
     * 3. прибираємо тестові партії.
     */
    try {
      if (movementSheet) {
        clearInventoryRowsByValue_(
          movementSheet,
          2,
          testOperationId,
          INVENTORY_CONFIG
            .MOVEMENT_HEADERS
            .length
        );
      }
    } catch (error) {
      cleanupResult.errors.push(
        'Не очищено тестові рухи: ' +
        error.message
      );
    }

    try {
      if (
        stockSheet &&
        stockSnapshot &&
        stockSnapshot.length
      ) {
        restoreInventoryIssueRows_(
          stockSheet,
          stockSnapshot
        );
      }
    } catch (error) {
      cleanupResult.errors.push(
        'Не відновлено тестові залишки: ' +
        error.message
      );
    }

    try {
      if (stockSheet) {
        const stockWidth =
          (
            INVENTORY_CONFIG
              .STOCK_HEADERS &&
            INVENTORY_CONFIG
              .STOCK_HEADERS.length
          )
            ? INVENTORY_CONFIG
                .STOCK_HEADERS.length
            : 19;

        testLotIds.forEach(
          function(lotId) {
            clearInventoryRowsByValue_(
              stockSheet,
              1,
              lotId,
              stockWidth
            );
          }
        );
      }
    } catch (error) {
      cleanupResult.errors.push(
        'Не очищено тестові партії: ' +
        error.message
      );
    }

    try {
      SpreadsheetApp.flush();

      cleanupResult.movementsRemaining =
        movementSheet
          ? inventoryIssueCountMovementsByOperationId_(
              movementSheet,
              testOperationId
            )
          : null;

      let testLotsRemaining = 0;

      if (stockSheet) {
        const lastRow =
          stockSheet.getLastRow();

        if (lastRow >= 2) {
          const lotValues =
            stockSheet
              .getRange(
                2,
                1,
                lastRow - 1,
                1
              )
              .getDisplayValues();

          lotValues.forEach(
            function(row) {
              if (
                testLotIds.indexOf(
                  String(
                    row[0] || ''
                  ).trim()
                ) !== -1
              ) {
                testLotsRemaining++;
              }
            }
          );
        }
      }

      cleanupResult.testLotsRemaining =
        testLotsRemaining;

      cleanupResult.ok =
        cleanupResult
          .errors.length === 0 &&
        cleanupResult
          .movementsRemaining === 0 &&
        cleanupResult
          .testLotsRemaining === 0;

    } catch (error) {
      cleanupResult.errors.push(
        'Не вдалося перевірити фінальний стан: ' +
        error.message
      );

      cleanupResult.ok =
        false;
    }

    try {
      lock.releaseLock();
    } catch (error) {
      cleanupResult.errors.push(
        'Не вдалося звільнити блокування: ' +
        error.message
      );

      cleanupResult.ok =
        false;
    }
  }

  if (!finalResult) {
    finalResult = {
      ok:
        false,

      test:
        'testInventoryIssueWriteAndRollback',

      operationId:
        testOperationId,

      error:
        'Тест завершився без сформованого результату'
    };
  }

  finalResult.cleanup =
    cleanupResult;

  /*
   * Тест не може вважатися успішним,
   * якщо тимчасові дані не прибрані.
   */
  if (!cleanupResult.ok) {
    finalResult.ok =
      false;

    finalResult.cleanupError =
      cleanupResult.errors.join(
        ' | '
      ) ||
      'Після тесту залишилися тимчасові дані';
  }

  Logger.log(
    JSON.stringify(
      finalResult,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      finalResult.ok
        ? 'Запис, FEFO і відкат перевірено успішно'
        : 'Тест не пройдено. Перевірте журнал.',
      'Склад',
      8
    );

  return finalResult;
}


/**
 * Рахує рухи складу за ID операції.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} operationId
 * @return {number}
 */
function inventoryIssueCountMovementsByOperationId_(
  sheet,
  operationId
) {
  if (!sheet) {
    return 0;
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const expected =
    String(
      operationId || ''
    ).trim();

  if (!expected) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        2,
        2,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  return values.filter(
    function(value) {
      return (
        String(value || '').trim() ===
        expected
      );
    }
  ).length;
}


/**
 * Перевіряє, що рядки складу
 * повністю відновлені зі знімка.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Object>} snapshot
 * @return {boolean}
 */
function inventoryIssueVerifySnapshotRestored_(
  sheet,
  snapshot
) {
  if (
    !sheet ||
    !snapshot ||
    !snapshot.length
  ) {
    return false;
  }

  return snapshot.every(
    function(item) {
      const actualValues =
        sheet
          .getRange(
            item.row,
            12,
            1,
            6
          )
          .getValues()[0];

      return actualValues.every(
        function(value, index) {
          const expected =
            item.values[index];

          if (
            typeof value === 'number' ||
            typeof expected === 'number'
          ) {
            return (
              Math.abs(
                inventoryIssueNumber_(
                  value
                ) -
                inventoryIssueNumber_(
                  expected
                )
              ) <=
              INVENTORY_ISSUE_CONFIG
                .tolerance
            );
          }

          if (
            value instanceof Date &&
            expected instanceof Date
          ) {
            return (
              value.getTime() ===
              expected.getTime()
            );
          }

          return (
            String(
              value === null ||
              value === undefined
                ? ''
                : value
            ) ===
            String(
              expected === null ||
              expected === undefined
                ? ''
                : expected
            )
          );
        }
      );
    }
  );
}
/**
 * Автоматично розраховує і показує у формі
 * фактичну FEFO-собівартість вибраної вакцини.
 *
 * Нічого не списує і не створює рухів.
 *
 * Поле INPUT.vaccineCost містить загальну
 * собівартість усієї вибраної кількості.
 *
 * @return {Object}
 */
/**
 * Гібридне заповнення собівартості вакцини.
 *
 * Якщо склад уже заповнений:
 * — розраховує FEFO-собівартість;
 * — автоматично записує її у форму.
 *
 * Якщо партію не знайдено:
 * — не очищає ручне значення;
 * — дозволяє адміністратору ввести собівартість вручну.
 *
 * Нічого не списує зі складу.
 */
function updateVaccineCostFromInventory_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  if (!sheet) {
    return {
      ok: false,
      calculated: false,
      reason:
        'Не знайдено лист вводу'
    };
  }

  const type =
    clean_(
      sheet
        .getRange(INPUT.type)
        .getDisplayValue()
    );

  const category =
    clean_(
      sheet
        .getRange(INPUT.category)
        .getDisplayValue()
    );

  const article =
    clean_(
      sheet
        .getRange(INPUT.article)
        .getDisplayValue()
    );

  const quantity =
    inventoryIssueNumber_(
      sheet
        .getRange(INPUT.quantity)
        .getValue()
    );

  const operationDate =
    sheet
      .getRange(INPUT.date)
      .getValue();

  const costCell =
    sheet.getRange(
      INPUT.vaccineCost
    );

  const seriesCell =
    sheet.getRange(
      INPUT.vaccineSeries
    );

  const currentNote =
    String(
      costCell.getNote() || ''
    );

  const hadAutomaticCost =
    currentNote.indexOf(
      'AUTO_FEFO_COST'
    ) === 0;

  const isVaccineSale =
    type === 'Вакцина' &&
    (
      category ===
        'Продаж і використання' ||
      category ===
        'Продаж на зберігання'
    );

  if (!isVaccineSale) {
    if (hadAutomaticCost) {
      costCell.clearContent();
    }

    costCell.clearNote();

    seriesCell
      .clearContent()
      .clearNote()
      .clearDataValidations();

    return {
      ok: true,
      calculated: false,
      manualAllowed: true
    };
  }

  if (
    !article ||
    quantity <= 0
  ) {
    if (hadAutomaticCost) {
      costCell.clearContent();
    }

    costCell.clearNote();

    seriesCell
      .clearContent()
      .clearNote()
      .clearDataValidations();

    return {
      ok: true,
      calculated: false,
      manualAllowed: true,
      reason:
        'Не вибрано вакцину або кількість'
    };
  }

  try {
    const plan =
      planInventoryIssue_({
        id:
          'FORM-PREVIEW',

        date:
          operationDate instanceof Date &&
          !isNaN(
            operationDate.getTime()
          )
            ? operationDate
            : new Date(),

        type:
          type,

        category:
          category,

        article:
          article,

        quantity:
          quantity
      });

    if (
      !plan ||
      !plan.ok ||
      !plan.requiresIssue
    ) {
      throw new Error(
        'FEFO-план не сформовано'
      );
    }

    const unitCost =
      quantity > 0
        ? Number(plan.totalCost) /
          quantity
        : 0;

    const costExplanation =
      typeof buildVaccineCostPlanNote_ ===
        'function'
        ? buildVaccineCostPlanNote_(
            plan
          )
        : (
            'Загальна FEFO-собівартість: ' +
            plan.totalCost
          );

    const seriesText =
      buildInventoryIssueSeriesPreview_(
        plan
      );

    const seriesNote =
      buildInventoryIssueSeriesNote_(
        plan
      );

    costCell
      .setValue(unitCost)
      .setNumberFormat('#,##0.00')
      .setNote(
        'AUTO_FEFO_COST\n' +
        costExplanation
      );

    seriesCell
      .clearDataValidations()
      .setNumberFormat('@')
      .setValue(
        seriesText
      )
      .setNote(
        seriesNote
      );

    return {
      ok: true,
      calculated: true,
      manualAllowed: true,
      source:
        'inventory-fefo',
      unitCost:
        unitCost,
      totalCost:
        plan.totalCost,
      series:
        seriesText,
      plan:
        plan
    };

  } catch (error) {
    if (hadAutomaticCost) {
      costCell.clearContent();
    }

    costCell.clearNote();

    seriesCell
      .clearContent()
      .clearDataValidations()
      .setNumberFormat('@')
      .setNote(
        'Серію не визначено автоматично: ' +
        String(
          error &&
          error.message
            ? error.message
            : error
        )
      );

    return {
      ok: true,
      calculated: false,
      manualAllowed: true,
      source:
        'manual',
      reason:
        String(
          error &&
          error.message
            ? error.message
            : error
        )
    };
  }
}

/**
 * Формує пояснювальну примітку до поля
 * автоматичної собівартості.
 *
 * @param {Object} plan
 * @return {string}
 */
function buildVaccineCostPlanNote_(
  plan
) {
  if (
    !plan ||
    !Array.isArray(
      plan.allocations
    )
  ) {
    return '';
  }

  const lines = [
    'Автоматична FEFO-собівартість:',
    ''
  ];

  plan.allocations.forEach(
    function(item) {
      const series =
        item.series
          ? ' / серія ' +
            item.series
          : '';

      lines.push(
        item.quantity +
        ' × ' +
        inventoryIssueRoundMoney_(
          item.unitCost
        ) +
        ' = ' +
        inventoryIssueRoundMoney_(
          item.totalCost
        ) +
        series
      );
    }
  );

  lines.push('');
  lines.push(
    'Разом: ' +
    inventoryIssueRoundMoney_(
      plan.totalCost
    )
  );

  return lines.join(
    '\n'
  );
}
/****************************************************
 * INVENTORY ISSUE COMPLETION PAYLOAD
 * --------------------------------------------------
 * Формує стабільний контракт результату вибуття
 * для наступних модулів:
 * - Облік вакцин;
 * - База операцій;
 * - повідомлення адміністратору;
 * - подальший контрольований відкат.
 *
 * Нічого не записує у таблицю.
 ****************************************************/

/****************************************************
 * INVENTORY ISSUE COMPLETION PAYLOAD
 * --------------------------------------------------
 * Формує стабільний підсумковий результат
 * складського вибуття для:
 *
 * — вакцин;
 * — швидких тестів;
 * — косметичних товарів;
 * — повідомлення адміністратору;
 * — контрольованого відкату;
 * — вакцинного реєстру.
 *
 * Нічого не записує у таблицю.
 ****************************************************/
function buildInventoryIssueCompletionPayload_(
  issueResult
) {
  if (
    !issueResult ||
    issueResult.ok !== true
  ) {
    throw new Error(
      'Не передано успішний результат складського вибуття'
    );
  }

  const operationId =
    String(
      issueResult.operationId || ''
    ).trim();

  const inventoryType =
    String(
      issueResult.inventoryType || ''
    ).trim();

  const inventoryName =
    String(
      issueResult.inventoryName ||
      issueResult.vaccineName ||
      ''
    ).trim();

  /****************************************************
   * ОПЕРАЦІЯ БЕЗ СКЛАДСЬКОГО ВИБУТТЯ
   ****************************************************/

  if (
    issueResult.requiresIssue !== true
  ) {
    return {
      ok:
        true,

      requiresIssue:
        false,

      operationId:
        operationId,

      inventoryType:
        inventoryType,

      inventoryName:
        inventoryName,

      /*
       * Зворотна сумісність
       * із вакцинними функціями.
       */
      vaccineName:
        inventoryName,

      reason:
        issueResult.reason || '',

      movementType:
        String(
          issueResult.movementType || ''
        ).trim(),

      selectionMethod:
        String(
          issueResult.selectionMethod || ''
        ).trim(),

      requestedQuantity:
        0,

      totalCost:
        0,

      averageUnitCost:
        0,

      movementIds: [],

      movementRows: [],

      lotIds: [],

      series: [],

      expiryDates: [],

      allocations: [],

      primaryLotId:
        '',

      primaryMovementId:
        '',

      primarySeries:
        '',

      primaryExpiryDate:
        null,

      primaryUnitCost:
        0,

      userMessage:
        '',

      _rollbackSnapshot:
        issueResult._rollbackSnapshot || []
    };
  }

  /****************************************************
   * КОНТРОЛЬ ID ОПЕРАЦІЇ
   ****************************************************/

  if (!operationId) {
    throw new Error(
      'У результаті вибуття не визначено ID операції'
    );
  }

  /****************************************************
   * КОНТРОЛЬ ТИПУ ТА НАЙМЕНУВАННЯ
   ****************************************************/

  if (!inventoryType) {
    throw new Error(
      'У результаті вибуття не визначено тип запасу'
    );
  }

  if (!inventoryName) {
    throw new Error(
      'У результаті вибуття не визначено найменування запасу'
    );
  }

  /****************************************************
   * ФАКТИЧНО СТВОРЕНІ РУХИ
   ****************************************************/

  const movements =
    Array.isArray(
      issueResult.movements
    )
      ? issueResult.movements
      : [];

  if (!movements.length) {
    throw new Error(
      'У результаті вибуття відсутні створені складські рухи'
    );
  }

  /****************************************************
   * НОРМАЛІЗАЦІЯ РУХІВ
   ****************************************************/

  const normalizedMovements =
    movements.map(
      function(
        item,
        index
      ) {
        const movementId =
          String(
            item.movementId || ''
          ).trim();

        const lotId =
          String(
            item.lotId || ''
          ).trim();

        const itemInventoryType =
          String(
            item.inventoryType ||
            inventoryType
          ).trim();

        const itemInventoryName =
          String(
            item.inventoryName ||
            item.vaccineName ||
            inventoryName
          ).trim();

        const movementType =
          String(
            item.movementType ||
            issueResult.movementType ||
            ''
          ).trim();

        if (!movementId) {
          throw new Error(
            'Не визначено ID складського руху для алокації №' +
            (index + 1)
          );
        }

        if (!lotId) {
          throw new Error(
            'Не визначено ID партії для алокації №' +
            (index + 1)
          );
        }

        if (!itemInventoryType) {
          throw new Error(
            'Не визначено тип запасу для алокації №' +
            (index + 1)
          );
        }

        if (!itemInventoryName) {
          throw new Error(
            'Не визначено найменування запасу для алокації №' +
            (index + 1)
          );
        }

        if (
          inventoryIssueNormalize_(
            itemInventoryType
          ) !==
          inventoryIssueNormalize_(
            inventoryType
          )
        ) {
          throw new Error(
            'Тип запасу в алокації №' +
            (index + 1) +
            ' не відповідає загальному результату'
          );
        }

        if (
          inventoryIssueNormalize_(
            itemInventoryName
          ) !==
          inventoryIssueNormalize_(
            inventoryName
          )
        ) {
          throw new Error(
            'Найменування запасу в алокації №' +
            (index + 1) +
            ' не відповідає загальному результату'
          );
        }

        const quantity =
          inventoryIssueNumber_(
            item.quantity
          );

        if (
          quantity <=
          INVENTORY_ISSUE_CONFIG
            .tolerance
        ) {
          throw new Error(
            'Некоректна кількість у складському русі №' +
            (index + 1)
          );
        }

        const unitCost =
          inventoryIssueRoundMoney_(
            item.unitCost
          );

        const totalCost =
          inventoryIssueRoundMoney_(
            item.totalCost ||
            quantity * unitCost
          );

        if (
          unitCost < 0 ||
          totalCost < 0
        ) {
          throw new Error(
            'Некоректна собівартість у складському русі №' +
            (index + 1)
          );
        }

        return {
          movementId:
            movementId,

          movementRow:
            Number(
              item.movementRow
            ) || 0,

          operationId:
            operationId,

          inventoryType:
            itemInventoryType,

          inventoryName:
            itemInventoryName,

          /*
           * Старе поле залишене
           * для вакцинного реєстру.
           */
          vaccineName:
            itemInventoryName,

          lotId:
            lotId,

          movementType:
            movementType,

          series:
            String(
              item.series || ''
            ).trim(),

          expiryDate:
            item.expiryDate || null,

          receiptDate:
            item.receiptDate || null,

          quantity:
            quantity,

          unitCost:
            unitCost,

          totalCost:
            totalCost
        };
      }
    );

  /****************************************************
   * КОНТРОЛЬ ДУБЛІВ РУХІВ
   ****************************************************/

  const movementIds =
    normalizedMovements.map(
      function(item) {
        return item.movementId;
      }
    );

  const uniqueMovementIds =
    Array.from(
      new Set(
        movementIds
      )
    );

  if (
    uniqueMovementIds.length !==
    movementIds.length
  ) {
    throw new Error(
      'У результаті вибуття виявлено дублікати ID складських рухів'
    );
  }

  /****************************************************
   * ФАКТИЧНА КІЛЬКІСТЬ
   ****************************************************/

  const calculatedQuantity =
    normalizedMovements.reduce(
      function(
        total,
        item
      ) {
        return (
          total +
          item.quantity
        );
      },
      0
    );

  const expectedQuantity =
    inventoryIssueNumber_(
      issueResult.requestedQuantity
    );

  if (
    expectedQuantity <=
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'У результаті вибуття не визначено коректну кількість'
    );
  }

  if (
    Math.abs(
      calculatedQuantity -
      expectedQuantity
    ) >
    INVENTORY_ISSUE_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Кількість у створених рухах не відповідає кількості операції. ' +
      'Очікується: ' +
      expectedQuantity +
      ', у рухах: ' +
      calculatedQuantity
    );
  }

  /****************************************************
   * ФАКТИЧНА СОБІВАРТІСТЬ
   ****************************************************/

  const calculatedTotalCost =
    inventoryIssueRoundMoney_(
      normalizedMovements.reduce(
        function(
          total,
          item
        ) {
          return (
            total +
            item.totalCost
          );
        },
        0
      )
    );

  const expectedTotalCost =
    inventoryIssueRoundMoney_(
      issueResult.totalCost
    );

  if (
    Math.abs(
      calculatedTotalCost -
      expectedTotalCost
    ) >
    0.01
  ) {
    throw new Error(
      'Собівартість складських рухів не відповідає результату вибуття. ' +
      'Очікується: ' +
      expectedTotalCost +
      ', у рухах: ' +
      calculatedTotalCost
    );
  }

  /****************************************************
   * ОСНОВНА ПАРТІЯ
   *
   * Перша партія після сортування
   * FEFO або FIFO.
   ****************************************************/

  const firstMovement =
    normalizedMovements[0];

  /****************************************************
   * ФІНАЛЬНИЙ КОНТРАКТ
   ****************************************************/

  const payload = {
    ok:
      true,

    requiresIssue:
      true,

    operationId:
      operationId,

    inventoryType:
      inventoryType,

    inventoryName:
      inventoryName,

    /*
     * Зворотна сумісність:
     * вакцинна інтеграція продовжує
     * отримувати vaccineName.
     */
    vaccineName:
      inventoryName,

    movementType:
      String(
        issueResult.movementType || ''
      ).trim(),

    selectionMethod:
      String(
        issueResult.selectionMethod || ''
      ).trim(),

    requestedQuantity:
      expectedQuantity,

    totalCost:
      calculatedTotalCost,

    averageUnitCost:
      calculatedQuantity > 0
        ? inventoryIssueRoundMoney_(
            calculatedTotalCost /
            calculatedQuantity
          )
        : 0,

    movementIds:
      normalizedMovements.map(
        function(item) {
          return item.movementId;
        }
      ),

    movementRows:
      normalizedMovements.map(
        function(item) {
          return item.movementRow;
        }
      ),

    lotIds:
      normalizedMovements.map(
        function(item) {
          return item.lotId;
        }
      ),

    series:
      normalizedMovements.map(
        function(item) {
          return item.series;
        }
      ),

    expiryDates:
      normalizedMovements.map(
        function(item) {
          return item.expiryDate;
        }
      ),

    primaryLotId:
      firstMovement.lotId,

    primaryMovementId:
      firstMovement.movementId,

    primarySeries:
      firstMovement.series,

    primaryExpiryDate:
      firstMovement.expiryDate,

    primaryUnitCost:
      firstMovement.unitCost,

    allocations:
      normalizedMovements,

    /*
     * Знімок використовується
     * для контрольованого відкату.
     */
    _rollbackSnapshot:
      Array.isArray(
        issueResult._rollbackSnapshot
      )
        ? issueResult._rollbackSnapshot
        : []
  };

  /****************************************************
   * ПОВІДОМЛЕННЯ КОРИСТУВАЧУ
   ****************************************************/

  payload.userMessage =
    buildInventoryIssueUserMessage_(
      payload
    );

  return payload;
}


/****************************************************
 * ПОВІДОМЛЕННЯ АДМІНІСТРАТОРУ
 ****************************************************/

/****************************************************
 * ПОВІДОМЛЕННЯ АДМІНІСТРАТОРУ
 *
 * Формує повідомлення після успішного
 * складського вибуття для:
 * — вакцини;
 * — тесту;
 * — косметичного товару.
 ****************************************************/
function buildInventoryIssueUserMessage_(
  payload
) {
  if (
    !payload ||
    payload.requiresIssue !== true
  ) {
    return '';
  }

  const inventoryType =
    String(
      payload.inventoryType || ''
    ).trim();

  const inventoryName =
    String(
      payload.inventoryName ||
      payload.vaccineName ||
      ''
    ).trim();

  const movementType =
    String(
      payload.movementType || ''
    ).trim();

  const quantity =
    inventoryIssueNumber_(
      payload.requestedQuantity
    );

  const selectionMethod =
    String(
      payload.selectionMethod || ''
    ).trim();

  const allocations =
    Array.isArray(
      payload.allocations
    )
      ? payload.allocations
      : [];

  /****************************************************
   * ЗАГОЛОВОК ЗАЛЕЖНО ВІД ТИПУ ЗАПАСУ
   ****************************************************/

  let title =
    'Видати зі складу запас';

  if (
    inventoryIssueNormalize_(
      inventoryType
    ) ===
    inventoryIssueNormalize_(
      'Вакцина'
    )
  ) {
    if (
      inventoryIssueNormalize_(
        movementType
      ) ===
      inventoryIssueNormalize_(
        'Передано на зберігання'
      )
    ) {
      title =
        'Передати вакцину на зберігання';

    } else {
      title =
        'Видати зі складу вакцину';
    }
  }

  if (
    inventoryIssueNormalize_(
      inventoryType
    ) ===
    inventoryIssueNormalize_(
      'Тест'
    )
  ) {
    title =
      'Списано зі складу швидкий тест';
  }

  if (
    inventoryIssueNormalize_(
      inventoryType
    ) ===
    inventoryIssueNormalize_(
      'Товар'
    )
  ) {
    title =
      'Списано зі складу косметичний товар';
  }

  /****************************************************
   * ОСНОВНА ЧАСТИНА ПОВІДОМЛЕННЯ
   ****************************************************/

  const lines = [
    title,
    '',
    'Найменування: ' +
      (
        inventoryName ||
        'Не визначено'
      ),
    'Тип запасу: ' +
      (
        inventoryType ||
        'Не визначено'
      ),
    'Тип руху: ' +
      (
        movementType ||
        'Не визначено'
      ),
    'Кількість: ' +
      quantity
  ];

  if (selectionMethod) {
    lines.push(
      'Метод вибору партії: ' +
      selectionMethod
    );
  }

  /****************************************************
   * ОДНА ПАРТІЯ
   ****************************************************/

  if (
    allocations.length === 1
  ) {
    const item =
      allocations[0];

    const lotId =
      String(
        item.lotId || ''
      ).trim();

    const series =
      String(
        item.series || ''
      ).trim();

    lines.push('');

    if (lotId) {
      lines.push(
        'ID партії: ' +
        lotId
      );
    }

    /*
     * Для вакцин і тестів серія важлива.
     * Для косметичного товару може бути відсутня.
     */
    if (series) {
      lines.push(
        'Серія / партія: ' +
        series
      );
    }

    if (
      item.expiryDate
        instanceof Date &&
      !isNaN(
        item.expiryDate.getTime()
      )
    ) {
      lines.push(
        'Термін придатності: ' +
        formatInventoryIssueDateForMessage_(
          item.expiryDate
        )
      );
    }

    lines.push(
      'Собівартість одиниці: ' +
        formatInventoryIssueMoney_(
          item.unitCost
        ) +
        ' грн'
    );

    lines.push(
      'Загальна собівартість: ' +
        formatInventoryIssueMoney_(
          item.totalCost
        ) +
        ' грн'
    );
  }

  /****************************************************
   * КІЛЬКА ПАРТІЙ
   ****************************************************/

  if (
    allocations.length > 1
  ) {
    lines.push('');
    lines.push(
      'Списання виконано з кількох партій:'
    );

    allocations.forEach(
      function(
        item,
        index
      ) {
        const series =
          String(
            item.series || ''
          ).trim();

        const lotId =
          String(
            item.lotId || ''
          ).trim();

        let lotLabel =
          series
            ? 'серія ' + series
            : lotId
              ? 'партія ' + lotId
              : 'партія не визначена';

        let line =
          (index + 1) +
          '. ' +
          lotLabel +
          ' — ' +
          inventoryIssueNumber_(
            item.quantity
          ) +
          ' од. × ' +
          formatInventoryIssueMoney_(
            item.unitCost
          ) +
          ' грн';

        if (
          item.expiryDate
            instanceof Date &&
          !isNaN(
            item.expiryDate.getTime()
          )
        ) {
          line +=
            ' / до ' +
            formatInventoryIssueDateForMessage_(
              item.expiryDate
            );
        }

        lines.push(
          line
        );
      }
    );

    lines.push('');

    lines.push(
      'Загальна собівартість: ' +
        formatInventoryIssueMoney_(
          payload.totalCost
        ) +
        ' грн'
    );
  }

  /****************************************************
   * РЕЗЕРВНИЙ ВАРІАНТ
   ****************************************************/

  if (!allocations.length) {
    lines.push('');

    lines.push(
      'Загальна собівартість: ' +
        formatInventoryIssueMoney_(
          payload.totalCost
        ) +
        ' грн'
    );
  }

  return lines.join(
    '\n'
  );
}


/****************************************************
 * ФОРМАТ ДАТИ ДЛЯ ПОВІДОМЛЕННЯ
 ****************************************************/

function formatInventoryIssueDateForMessage_(
  value
) {
  if (
    !(
      value instanceof Date
    ) ||
    isNaN(
      value.getTime()
    )
  ) {
    return 'Не вказано';
  }

  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


/****************************************************
 * ФОРМАТ ГРОШЕЙ ДЛЯ ПОВІДОМЛЕННЯ
 ****************************************************/

function formatInventoryIssueMoney_(
  value
) {
  return inventoryIssueRoundMoney_(
    value
  ).toLocaleString(
    'uk-UA',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
}
/****************************************************
 * DRY TEST — INVENTORY ISSUE COMPLETION PAYLOAD
 * --------------------------------------------------
 * Перевіряє формування підсумкового контракту
 * після складського FEFO-вибуття.
 *
 * Не читає та не змінює робочі листи.
 ****************************************************/
function testInventoryIssueCompletionPayloadDryRun() {
  const expiryDate =
    new Date(
      2029,
      2,
      21
    );

  const issueResult = {
    ok:
      true,

    requiresIssue:
      true,

    operationId:
      'TEST-COMPLETION-001',

    vaccineName:
      'Інфанрикс гекса',

    movementType:
      'Продаж і використання',

    requestedQuantity:
      1,

    totalCost:
      1641.43,

    movements: [
      {
        movementId:
          'TEST-COMPLETION-001-MOV-OUT-1',

        movementRow:
          10,

        operationId:
          'TEST-COMPLETION-001',

        lotId:
          'L-20260722-741-LOT-1',

        vaccineName:
          'Інфанрикс гекса',

        movementType:
          'Продаж і використання',

        series:
          'A21CE808B',

        expiryDate:
          expiryDate,

        quantity:
          1,

        unitCost:
          1641.43,

        totalCost:
          1641.43
      }
    ],

    _rollbackSnapshot: [
      {
        row:
          2,

        values: [
          0,
          0,
          0,
          1,
          2,
          'Активна'
        ]
      }
    ]
  };

  const payload =
    buildInventoryIssueCompletionPayload_(
      issueResult
    );

  const checks = {
    payloadOk:
      payload.ok === true,

    requiresIssue:
      payload.requiresIssue === true,

    operationIdCorrect:
      payload.operationId ===
      'TEST-COMPLETION-001',

    vaccineCorrect:
      payload.vaccineName ===
      'Інфанрикс гекса',

    movementIdCorrect:
      payload.primaryMovementId ===
      'TEST-COMPLETION-001-MOV-OUT-1',

    lotIdCorrect:
      payload.primaryLotId ===
      'L-20260722-741-LOT-1',

    seriesCorrect:
      payload.primarySeries ===
      'A21CE808B',

    expiryDateCorrect:
      payload.primaryExpiryDate instanceof Date &&
      payload.primaryExpiryDate.getTime() ===
        expiryDate.getTime(),

    quantityCorrect:
      Math.abs(
        payload.requestedQuantity - 1
      ) <=
        INVENTORY_ISSUE_CONFIG
          .tolerance,

    costCorrect:
      Math.abs(
        payload.totalCost -
        1641.43
      ) <= 0.01,

    averageCostCorrect:
      Math.abs(
        payload.averageUnitCost -
        1641.43
      ) <= 0.01,

    oneMovementCreated:
      payload.movementIds.length === 1,

    messageCreated:
      payload.userMessage.includes(
        'Інфанрикс гекса'
      ) &&
      payload.userMessage.includes(
        'A21CE808B'
      ) &&
      payload.userMessage.includes(
        '21.03.2029'
      ),

    rollbackSnapshotPreserved:
      Array.isArray(
        payload._rollbackSnapshot
      ) &&
      payload._rollbackSnapshot.length === 1
  };

  const ok =
    Object.keys(
      checks
    ).every(
      function(key) {
        return Boolean(
          checks[key]
        );
      }
    );

  const result = {
    ok:
      ok,

    test:
      'testInventoryIssueCompletionPayloadDryRun',

    checks:
      checks,

    payload:
      payload,

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? 'Контракт результату вибуття перевірено'
        : 'Контракт результату містить помилки',
      'Склад',
      8
    );

  return result;
}
/****************************************************
 * ЧИ ДОЗВОЛЕНИЙ РУЧНИЙ РЕЖИМ ВАКЦИНИ
 * --------------------------------------------------
 * Ручний режим допускається лише тоді,
 * коли вакцина ще не заведена на склад.
 *
 * Технічні помилки, пошкодження структури
 * або недостатній залишок не приховуються.
 ****************************************************/
function isAllowedManualVaccineFallbackError_(
  error
) {
  const message =
    String(
      error &&
      error.message
        ? error.message
        : error || ''
    );

  return message.includes(
    'Не знайдено доступних партій вакцини'
  );
}
/****************************************************
 * СЕРІЯ FEFO ДЛЯ ФОРМИ
 ****************************************************/
function buildInventoryIssueSeriesPreview_(
  plan
) {
  if (
    !plan ||
    !Array.isArray(
      plan.allocations
    ) ||
    !plan.allocations.length
  ) {
    return '';
  }

  return plan.allocations
    .map(function(item) {
      const series =
        String(
          item.series || ''
        ).trim() ||
        'Без серії';

      const quantity =
        inventoryIssueNumber_(
          item.quantity
        );

      if (
        plan.allocations.length > 1
      ) {
        return (
          series +
          ' — ' +
          quantity +
          ' од.'
        );
      }

      return series;
    })
    .join('; ');
}


/****************************************************
 * ПРИМІТКА ДО СЕРІЇ У ФОРМІ
 ****************************************************/
function buildInventoryIssueSeriesNote_(
  plan
) {
  if (
    !plan ||
    !Array.isArray(
      plan.allocations
    )
  ) {
    return '';
  }

  const lines = [
    'Автоматичний вибір FEFO:'
  ];

  plan.allocations.forEach(
    function(item) {
      const expiryDate =
        item.expiryDate instanceof Date &&
        !isNaN(
          item.expiryDate.getTime()
        )
          ? Utilities.formatDate(
              item.expiryDate,
              Session.getScriptTimeZone(),
              'dd.MM.yyyy'
            )
          : 'не вказано';

      lines.push(
        (
          item.series ||
          'Без серії'
        ) +
        ' — ' +
        item.quantity +
        ' од.; термін: ' +
        expiryDate
      );
    }
  );

  return lines.join('\n');
}
/****************************************************
 * СУХИЙ ТЕСТ КЛАСИФІКАЦІЇ ВИБУТТЯ
 *
 * Перевіряє:
 * — продаж і використання вакцини;
 * — продаж вакцини на зберігання;
 * — зміну статусу вакцини;
 * — продаж швидкого тесту;
 * — продаж косметичного товару;
 * — звичайну операцію без складського вибуття.
 *
 * Нічого не записує у таблицю.
 ****************************************************/
function testInventoryIssueClassificationDryRun() {
  const cases = [
    {
      name:
        'Вакцина — продаж і використання',

      data: {
        type:
          'Вакцина',

        category:
          'Продаж і використання',

        article:
          'Тестова вакцина'
      },

      expected: {
        isIssue:
          true,

        inventoryType:
          'Вакцина',

        movementType:
          'Продаж і використання',

        stockCounter:
          'soldOrUsed'
      }
    },

    {
      name:
        'Вакцина — продаж на зберігання',

      data: {
        type:
          'Вакцина',

        category:
          'Продаж на зберігання',

        article:
          'Тестова вакцина'
      },

      expected: {
        isIssue:
          true,

        inventoryType:
          'Вакцина',

        movementType:
          'Передано на зберігання',

        stockCounter:
          'transferredToStorage'
      }
    },

    {
      name:
        'Вакцина — зміна статусу',

      data: {
        type:
          'Вакцина',

        category:
          'Зміна статусу',

        article:
          'Використано'
      },

      expected: {
        isIssue:
          false,

        inventoryType:
          'Вакцина',

        movementType:
          'Без руху',

        stockCounter:
          ''
      }
    },

    {
      name:
        'Швидкий тест — продаж',

      data: {
        type:
          'Доходи',

        category:
          'Швидкі тести',

        article:
          'Тест на грип + Covid'
      },

      expected: {
        isIssue:
          true,

        inventoryType:
          'Тест',

        movementType:
          'Продаж',

        stockCounter:
          'soldOrUsed'
      }
    },

    {
      name:
        'Косметичний товар — продаж',

      data: {
        type:
          'Доходи',

        category:
          'Косметичні засоби',

        article:
          'Тестовий косметичний засіб'
      },

      expected: {
        isIssue:
          true,

        inventoryType:
          'Товар',

        movementType:
          'Продаж',

        stockCounter:
          'soldOrUsed'
      }
    },

    {
      name:
        'Звичайний дохід — без вибуття',

      data: {
        type:
          'Доходи',

        category:
          'Консультації',

        article:
          'Консультація лікаря'
      },

      expected: {
        isIssue:
          false,

        inventoryType:
          '',

        movementType:
          'Без руху',

        stockCounter:
          ''
      }
    }
  ];

  const results =
    cases.map(
      function(testCase) {
        const actual =
          getInventoryIssueType_(
            testCase.data
          );

        const checks = {
          isIssue:
            actual.isIssue ===
            testCase.expected.isIssue,

          inventoryType:
            String(
              actual.inventoryType || ''
            ) ===
            testCase.expected.inventoryType,

          movementType:
            String(
              actual.movementType || ''
            ) ===
            testCase.expected.movementType,

          stockCounter:
            String(
              actual.stockCounter || ''
            ) ===
            testCase.expected.stockCounter
        };

        const passed =
          Object.keys(checks)
            .every(
              function(key) {
                return (
                  checks[key] === true
                );
              }
            );

        return {
          name:
            testCase.name,

          passed:
            passed,

          checks:
            checks,

          expected:
            testCase.expected,

          actual: {
            isIssue:
              actual.isIssue,

            inventoryType:
              actual.inventoryType || '',

            inventoryName:
              actual.inventoryName || '',

            movementType:
              actual.movementType || '',

            stockCounter:
              actual.stockCounter || '',

            stockColumn:
              actual.stockColumn || 0,

            reason:
              actual.reason || ''
          }
        };
      }
    );

  const ok =
    results.every(
      function(item) {
        return (
          item.passed === true
        );
      }
    );

  const result = {
    ok:
      ok,

    test:
      'testInventoryIssueClassificationDryRun',

    results:
      results,

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? 'Класифікація вибуття пройшла сухий тест'
        : 'Класифікація має помилки. Перевірте журнал виконання.',
      'Склад',
      8
    );

  if (!ok) {
    throw new Error(
      'Сухий тест класифікації не пройдено. Перевірте журнал виконання.'
    );
  }

  return result;
}
/****************************************************
 * СУХИЙ ТЕСТ ПЛАНУВАННЯ ПРОДАЖУ ТЕСТУ
 *
 * Перевіряє:
 * — класифікацію як тип "Тест";
 * — пошук партії;
 * — дату надходження;
 * — FEFO;
 * — кількість 2;
 * — фактичну собівартість;
 * — відсутність записів у робочих листах.
 *
 * Нічого не змінює.
 ****************************************************/
function testQuickTestIssuePlanningDryRun() {
  const testDate =
    new Date(
      2026,
      6,
      29
    );

  const data = {
    id:
      'DRY-TEST-ISSUE-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ),

    date:
      testDate,

    type:
      'Доходи',

    category:
      'Швидкі тести',

    article:
      'Тест на грип + Covid',

    quantity:
      2
  };

  /****************************************************
   * КЛАСИФІКАЦІЯ
   ****************************************************/

  const descriptor =
    getInventoryIssueType_(
      data
    );

  const classificationChecks = {
    recognizedAsIssue:
      descriptor.isIssue === true,

    inventoryTypeIsTest:
      descriptor.inventoryType ===
      'Тест',

    inventoryNameCorrect:
      descriptor.inventoryName ===
      'Тест на грип + Covid',

    movementTypeIsSale:
      descriptor.movementType ===
      'Продаж',

    stockCounterCorrect:
      descriptor.stockCounter ===
      'soldOrUsed',

    stockColumnCorrect:
      Number(
        descriptor.stockColumn
      ) === 12
  };

  const classificationOk =
    Object.keys(
      classificationChecks
    ).every(
      function(key) {
        return (
          classificationChecks[key] ===
          true
        );
      }
    );

  if (!classificationOk) {
    throw new Error(
      'Продаж швидкого тесту класифіковано некоректно: ' +
      JSON.stringify(
        classificationChecks
      )
    );
  }

  /****************************************************
   * СУХИЙ ПЛАН
   ****************************************************/

  const plan =
    planInventoryIssue_(
      data
    );

  const allocatedQuantity =
    Array.isArray(
      plan.allocations
    )
      ? plan.allocations.reduce(
          function(
            total,
            item
          ) {
            return (
              total +
              inventoryIssueNumber_(
                item.quantity
              )
            );
          },
          0
        )
      : 0;

  const firstAllocation =
    plan.allocations &&
    plan.allocations.length
      ? plan.allocations[0]
      : null;

  const checks = {
    planOk:
      plan.ok === true,

    requiresIssue:
      plan.requiresIssue === true,

    inventoryTypeIsTest:
      plan.inventoryType ===
      'Тест',

    inventoryNameCorrect:
      plan.inventoryName ===
      'Тест на грип + Covid',

    movementTypeIsSale:
      plan.movementType ===
      'Продаж',

    requestedQuantityCorrect:
      Math.abs(
        inventoryIssueNumber_(
          plan.requestedQuantity
        ) - 2
      ) <=
      INVENTORY_ISSUE_CONFIG
        .tolerance,

    allocatedQuantityCorrect:
      Math.abs(
        allocatedQuantity - 2
      ) <=
      INVENTORY_ISSUE_CONFIG
        .tolerance,

    atLeastOneLotSelected:
      Array.isArray(
        plan.allocations
      ) &&
      plan.allocations.length >= 1,

    firstLotHasId:
      Boolean(
        firstAllocation &&
        firstAllocation.lotId
      ),

    firstLotTypeIsTest:
      Boolean(
        firstAllocation &&
        firstAllocation.inventoryType ===
          'Тест'
      ),

    firstLotNameCorrect:
      Boolean(
        firstAllocation &&
        firstAllocation.inventoryName ===
          'Тест на грип + Covid'
      ),

    totalCostCalculated:
      Number(
        plan.totalCost
      ) > 0,

    fefoApplied:
      plan.fefoApplied === true,

    noCellsWritten:
      plan.noCellsWritten === true
  };

  const ok =
    Object.keys(
      checks
    ).every(
      function(key) {
        return (
          checks[key] === true
        );
      }
    );

  const result = {
    ok:
      ok,

    test:
      'testQuickTestIssuePlanningDryRun',

    data:
      data,

    descriptor:
      descriptor,

    classificationChecks:
      classificationChecks,

    plan:
      plan,

    checks:
      checks,

    noCellsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      ok
        ? (
            'Сухий план тесту сформовано. Собівартість: ' +
            inventoryIssueRoundMoney_(
              plan.totalCost
            ) +
            ' грн'
          )
        : 'Сухий тест планування не пройдено. Перевірте журнал.',
      'Склад',
      10
    );

  if (!ok) {
    throw new Error(
      'Сухий тест планування продажу швидкого тесту не пройдено. Перевірте журнал виконання.'
    );
  }

  return result;
}