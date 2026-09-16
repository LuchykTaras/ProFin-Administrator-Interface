/****************************************************
 * PROFIN OS — ПОШУК ТОВАРУ НА СКЛАДІ
 *
 * D2 — dropdown пошуку.
 * До списку потрапляють лише унікальні товари,
 * у яких поточний залишок у колонці O більший за 0.
 *
 * Технічне джерело dropdown — прихована колонка AC.
 * Обліковий діапазон A:AB не змінюється.
 ****************************************************/

const INVENTORY_PRODUCT_SEARCH_CONFIG =
  Object.freeze({
    sheetName: 'Склад медичних запасів',
    searchCell: 'D2',
    firstDataRow: 3,

    lotIdColumn: 1,            // A
    productNameColumn: 4,      // D
    currentBalanceColumn: 15,  // O
    statusColumn: 17,          // Q
    helperColumn: 29,          // AC

    showAllOption:
      '↩ ПОКАЗАТИ ВЕСЬ СКЛАД',

    showClosedOption:
      '◉ ПОКАЗАТИ ЗАКРИТІ ПАРТІЇ'
  });

/****************************************************
 * КРОК 1 — СУХИЙ АУДИТ
 *
 * Нічого не записує.
 * Не змінює видимість рядків.
 ****************************************************/

function auditInventoryProductSearchDryRun() {
  const sheet =
    getInventoryProductSearchSheet_();

  const lastDataRow =
    getInventoryProductSearchLastDataRow_(
      sheet
    );

  const availableProducts =
    getAvailableInventoryProductNames_(
      sheet,
      lastDataRow
    );

  const result = {
    ok: true,

    sheet:
      sheet.getName(),

    searchCell:
      INVENTORY_PRODUCT_SEARCH_CONFIG
        .searchCell,

    sourceRule:
      'Назва у D, ID партії у A та залишок O > 0',

    firstDataRow:
      INVENTORY_PRODUCT_SEARCH_CONFIG
        .firstDataRow,

    lastDataRow:
      lastDataRow,

    availableProducts:
      availableProducts,

    availableProductsCount:
      availableProducts.length,

    technicalColumn:
      'AC',

    businessValuesChanged:
      false,

    rowsHidden:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/****************************************************
 * КРОК 2 — ОДНОРАЗОВЕ НАЛАШТУВАННЯ
 *
 * Змінює тільки:
 * — D2: dropdown;
 * — AC2:AC: технічний список;
 * — видимість колонки AC;
 * — видимість складських рядків.
 ****************************************************/

function setupInventoryProductSearch() {
  const sheet =
    getInventoryProductSearchSheet_();

  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    ensureInventoryProductSearchHelperColumn_(
      sheet
    );

    const maxRows =
      sheet.getMaxRows();

    const helperRange =
      sheet.getRange(
        2,
        config.helperColumn,
        maxRows - 1,
        1
      );

    /*
     * Очищається тільки технічна колонка AC.
     */
    helperRange.clearContent();

    /*
 * AC2 — активний склад.
 * AC3 — закриті партії.
 * AC4 — список товарів із позитивним залишком.
 */
sheet
  .getRange(
    2,
    config.helperColumn
  )
  .setValue(
    config.showAllOption
  );

sheet
  .getRange(
    3,
    config.helperColumn
  )
  .setValue(
    config.showClosedOption
  );

sheet
  .getRange(
    4,
    config.helperColumn
  )
  '=IFERROR(' +
  'SORT(' +
    'UNIQUE(' +
      'FILTER(' +
        '$D$3:$D;' +
        '$A$3:$A<>"";' +
        '((($O$3:$O>0)+($X$3:$X="Очікує приймання"))>0);' +
        '$D$3:$D<>""' +
      ')' +
    ')' +
  ');' +
  '""' +
')'

SpreadsheetApp.flush();

    const searchCell =
      sheet.getRange(
        config.searchCell
      );

      const validation =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInRange(
          helperRange,
          true
        )
        .setAllowInvalid(false)
        .build();

  searchCell
  .setDataValidation(validation)
  .setNote(
    '«Показати весь склад» показує лише партії з позитивним залишком. ' +
    'Закриті та нульові партії доступні окремою командою.'
  );

    const availableProducts =
      getAvailableInventoryProductNames_(
        sheet,
        getInventoryProductSearchLastDataRow_(
          sheet
        )
      );

    const currentValue =
      normalizeInventoryProductSearchText_(
        searchCell.getDisplayValue()
      );

    if (
  !currentValue ||
  (
    currentValue !== config.showAllOption &&
    currentValue !== config.showClosedOption &&
    !availableProducts.includes(currentValue)
  )
 ) {
  searchCell.setValue(
    config.showAllOption
  );
 }

    /*
     * Приховуємо технічну колонку AC.
     */
    sheet.hideColumns(
      config.helperColumn
    );
    formatInventoryProductSearchCell_(
      searchCell,
      searchCell.getDisplayValue()
    );
    const filterResult =
      applyInventoryProductSearchFilter_(
        sheet,
        searchCell.getDisplayValue()
      );

    const result = {
      ok: true,

      sheet:
        sheet.getName(),

      searchCell:
        config.searchCell,

      availableProducts:
        availableProducts,

      filter:
        filterResult,

      businessRangeChanged:
        false,

      technicalRangeChanged:
        'AC2:AC' + maxRows
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
        'Пошук товару на складі налаштовано.',
        'Склад',
        5
      );

    return result;

  } finally {
    lock.releaseLock();
  }
}


/****************************************************
 * ОБРОБНИК ЗМІНИ D2
 *
 * Підключається до чинного onEdit(e).
 ****************************************************/

function handleInventoryProductSearchEdit_(e) {
  if (
    !e ||
    !e.range
  ) {
    return false;
  }

  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  const sheet =
    e.range.getSheet();

  if (
    sheet.getName() !==
      config.sheetName ||
    e.range.getA1Notation() !==
      config.searchCell
  ) {
    return false;
  }

  const selectedValue =
    e.range.getDisplayValue();

  formatInventoryProductSearchCell_(
    e.range,
    selectedValue
  );

  applyInventoryProductSearchFilter_(
    sheet,
    selectedValue
  );

  return true;
}


/****************************************************
 * ЗАСТОСУВАННЯ ФІЛЬТРА
 ****************************************************/

function applyInventoryProductSearchFilter_(
  sheet,
  selectedValue
) {
  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  const selected =
    normalizeInventoryProductSearchText_(
      selectedValue
    ) || config.showAllOption;

  const lastDataRow =
    getInventoryProductSearchLastDataRow_(
      sheet
    );

  if (
    lastDataRow <
    config.firstDataRow
  ) {
    return {
      selected: selected,
      visibleRows: 0,
      hiddenRows: 0
    };
  }

  const rowCount =
    lastDataRow -
    config.firstDataRow +
    1;

  sheet.showRows(
    config.firstDataRow,
    rowCount
  );

  /*
   * Читаємо A:X:
   * A — ID партії;
   * D — найменування;
   * O — поточний залишок;
   * Q — статус партії;
   * X — статус переміщення.
   */
  const values =
    sheet
      .getRange(
        config.firstDataRow,
        1,
        rowCount,
        24
      )
      .getValues();

  const rowsToHide = [];
  let visibleRows = 0;

  values.forEach(
    function(row, index) {
      const lotId =
        normalizeInventoryProductSearchText_(
          row[config.lotIdColumn - 1]
        );

      const productName =
        normalizeInventoryProductSearchText_(
          row[config.productNameColumn - 1]
        );

      const currentBalance =
        parseInventoryProductSearchNumber_(
          row[config.currentBalanceColumn - 1]
        );

      const lotStatus =
        normalizeInventoryProductSearchText_(
          row[config.statusColumn - 1]
        ).toLowerCase();

      const transferStatus =
        normalizeInventoryProductSearchText_(
          row[23] // X — статус переміщення
        ).toLowerCase();

      /*
       * Це не закрита партія:
       * вона має нульовий залишок лише тому, що ще очікує
       * рішення «Прийняти» або «Повернути».
       */
      const isIncomingPending =
        lotStatus === 'заблокована' &&
        transferStatus === 'очікує приймання';

      const isClosed =
        !isIncomingPending &&
        (
          currentBalance <= 0 ||
          lotStatus === 'закрита' ||
          lotStatus === 'скасовано'
        );

      let mustShow = false;

      /*
       * «Весь склад»:
       * — усі активні партії з залишком;
       * — усі вхідні партії, що очікують приймання.
       */
      if (
        selected ===
        config.showAllOption
      ) {
        mustShow =
          Boolean(lotId) &&
          (
            currentBalance > 0 ||
            isIncomingPending
          );
      }

      /*
       * Історія: тільки справді закриті партії.
       */
      else if (
        selected ===
        config.showClosedOption
      ) {
        mustShow =
          Boolean(lotId) &&
          isClosed;
      }

      /*
       * Пошук товару:
       * показує активні партії та очікування приймання
       * саме за обраним найменуванням.
       */
      else {
        mustShow =
          Boolean(lotId) &&
          productName === selected &&
          (
            currentBalance > 0 ||
            isIncomingPending
          );
      }

      if (mustShow) {
        visibleRows++;
      } else {
        rowsToHide.push(
          config.firstDataRow + index
        );
      }
    }
  );

  hideInventoryProductSearchRows_(
    sheet,
    rowsToHide
  );

  return {
    selected: selected,

    mode:
      selected === config.showClosedOption
        ? 'CLOSED_LOTS'
        : selected === config.showAllOption
          ? 'ACTIVE_AND_PENDING_LOTS'
          : 'PRODUCT_SEARCH',

    visibleRows: visibleRows,
    hiddenRows: rowsToHide.length
  };
}


/****************************************************
 * СКИДАННЯ ФІЛЬТРА
 ****************************************************/

function resetInventoryProductSearch() {
  const sheet =
    getInventoryProductSearchSheet_();

  const value =
    INVENTORY_PRODUCT_SEARCH_CONFIG
      .showAllOption;

  sheet
    .getRange(
      INVENTORY_PRODUCT_SEARCH_CONFIG
        .searchCell
    )
    .setValue(
      value
    );
  formatInventoryProductSearchCell_(
    sheet.getRange(
      INVENTORY_PRODUCT_SEARCH_CONFIG
        .searchCell
    ),
    value
  );
  return applyInventoryProductSearchFilter_(
    sheet,
    value
  );
}


/****************************************************
 * ПОШУК ЛИСТА СКЛАДУ
 ****************************************************/

function getInventoryProductSearchSheet_() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INVENTORY_PRODUCT_SEARCH_CONFIG
          .sheetName
      );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
      INVENTORY_PRODUCT_SEARCH_CONFIG
        .sheetName +
      '».'
    );
  }

  return sheet;
}


/****************************************************
 * ПЕРЕВІРКА ТЕХНІЧНОЇ КОЛОНКИ AC
 ****************************************************/

function ensureInventoryProductSearchHelperColumn_(
  sheet
) {
  const requiredColumn =
    INVENTORY_PRODUCT_SEARCH_CONFIG
      .helperColumn;

  const currentMaxColumns =
    sheet.getMaxColumns();

  if (
    currentMaxColumns <
      requiredColumn
  ) {
    sheet.insertColumnsAfter(
      currentMaxColumns,
      requiredColumn -
        currentMaxColumns
    );
  }
}


/****************************************************
 * ОСТАННІЙ РЯДОК РЕАЛЬНОЇ ПАРТІЇ
 *
 * Визначається за ID у колонці A.
 ****************************************************/

function getInventoryProductSearchLastDataRow_(
  sheet
) {
  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  const physicalLastRow =
    sheet.getLastRow();

  if (
    physicalLastRow <
      config.firstDataRow
  ) {
    return (
      config.firstDataRow - 1
    );
  }

  const rowCount =
    physicalLastRow -
    config.firstDataRow +
    1;

  const lotIds =
    sheet
      .getRange(
        config.firstDataRow,
        config.lotIdColumn,
        rowCount,
        1
      )
      .getDisplayValues()
      .flat();

  for (
    let index =
      lotIds.length - 1;
    index >= 0;
    index--
  ) {
    if (
      normalizeInventoryProductSearchText_(
        lotIds[index]
      )
    ) {
      return (
        config.firstDataRow +
        index
      );
    }
  }

  return (
    config.firstDataRow - 1
  );
}


/****************************************************
 * СПИСОК УНІКАЛЬНИХ НАЯВНИХ ТОВАРІВ
 ****************************************************/

function getAvailableInventoryProductNames_(
  sheet,
  lastDataRow
) {
  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  if (
    lastDataRow <
    config.firstDataRow
  ) {
    return [];
  }

  const rowCount =
    lastDataRow -
    config.firstDataRow +
    1;

  /*
   * Читаємо A:X:
   * D — назва;
   * O — залишок;
   * Q — статус партії;
   * X — статус переміщення.
   */
  const values =
    sheet
      .getRange(
        config.firstDataRow,
        1,
        rowCount,
        24
      )
      .getValues();

  const uniqueProducts = {};

  values.forEach(
    function(row) {
      const productName =
        normalizeInventoryProductSearchText_(
          row[config.productNameColumn - 1]
        );

      const currentBalance =
        parseInventoryProductSearchNumber_(
          row[config.currentBalanceColumn - 1]
        );

      const lotStatus =
        normalizeInventoryProductSearchText_(
          row[config.statusColumn - 1]
        ).toLowerCase();

      const transferStatus =
        normalizeInventoryProductSearchText_(
          row[23]
        ).toLowerCase();

      const isIncomingPending =
        lotStatus === 'заблокована' &&
        transferStatus === 'очікує приймання';

      if (
        productName &&
        (
          currentBalance > 0 ||
          isIncomingPending
        )
      ) {
        uniqueProducts[productName] = true;
      }
    }
  );

  return Object
    .keys(uniqueProducts)
    .sort(
      function(first, second) {
        return first.localeCompare(
          second,
          'uk'
        );
      }
    );
}


/****************************************************
 * ПАКЕТНЕ ПРИХОВУВАННЯ РЯДКІВ
 ****************************************************/

function hideInventoryProductSearchRows_(
  sheet,
  rows
) {
  if (!rows.length) {
    return;
  }

  let groupStart =
    rows[0];

  let previousRow =
    rows[0];

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const currentRow =
      rows[index];

    if (
      currentRow ===
        previousRow + 1
    ) {
      previousRow =
        currentRow;

      continue;
    }

    sheet.hideRows(
      groupStart,
      previousRow -
        groupStart +
        1
    );

    groupStart =
      currentRow;

    previousRow =
      currentRow;
  }

  /*
   * Приховуємо останню групу.
   */
  sheet.hideRows(
    groupStart,
    previousRow -
      groupStart +
      1
  );
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ТЕКСТУ
 ****************************************************/

function normalizeInventoryProductSearchText_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/****************************************************
 * ПЕРЕТВОРЕННЯ ЗАЛИШКУ НА ЧИСЛО
 ****************************************************/

function parseInventoryProductSearchNumber_(
  value
) {
  if (
    typeof value ===
      'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const normalized =
    String(
      value || ''
    )
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  const number =
    Number(
      normalized
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}
function formatInventoryProductSearchCell_(
  range,
  selectedValue
) {
  const selected =
    normalizeInventoryProductSearchText_(
      selectedValue
    );

  const config =
    INVENTORY_PRODUCT_SEARCH_CONFIG;

  const isCommand =
    selected === config.showAllOption ||
    selected === config.showClosedOption;

  range
    .setFontWeight(
      isCommand
        ? 'bold'
        : 'normal'
    )
    .setFontColor(
      selected === config.showClosedOption
        ? '#9AA0A6'
        : '#202124'
    );
}