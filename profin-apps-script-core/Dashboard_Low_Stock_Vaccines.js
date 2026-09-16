const PF_LOW_VAX = {
  sourceSheet: 'Склад медичних запасів',
  dashboardSheet: 'Дашборд',
  directorySheet: 'Довідник',
  directoryThresholdRange: 'F39:G41',
  outputStartRow: 162,
  outputEndRow: 197,
  outputStartCol: 2, // B
  outputCols: 6,    // B:G
    headers: {
    type: 'Тип запасу',
    name: 'Найменування',
    date: 'Дата надходження',
    status: 'Статус',
    sold: 'Продано / використано',
    storage: 'Передано на зберігання',
    writeoff: 'Списано',
    balance: 'Поточний залишок'
  }
};

/**
 * Сухий тест. Нічого не записує.
 */
function previewDashboardLowStockVaccines() {
  const result = pfBuildLowStockVaccines_();

  const report = {
    ok: true,
    rule: 'Усі незакриті вакцини із сумарним залишком > 0; залишок < 10 підсвічується червоним',
    dateFilterUsed: false,
    rows: result.rows,
    noCellsWritten: true
  };

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Оновлює таблицю вакцин на Дашборді.
 *
 * B — назва вакцини
 * C — порожньо
 * D — передано на зберігання
 * E — продано / використано
 * F — списано
 * G — поточний залишок
 */
function refreshDashboardLowStockVaccines(options) {
  options = options || {};
  const showToast = options.showToast !== false;

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName(PF_LOW_VAX.dashboardSheet);
  let target = null;
  let snapshot = null;
  let visibilitySnapshot = null;

  try {
    if (!dashboard) {
      throw new Error('Не знайдено лист "' + PF_LOW_VAX.dashboardSheet + '".');
    }
   const thresholds = pfReadInventoryThresholds_();
    pfAssertLowStockDashboardArea_(dashboard);

      const result = pfBuildLowStockVaccines_(
      options.period || null);
    const capacity =
  PF_LOW_VAX.outputEndRow -
  PF_LOW_VAX.outputStartRow +
  1;

  const visibleRows =
  result.rows.length + 1;

  if (visibleRows > capacity) {
  throw new Error(
    'У блоці Дашборду недостатньо рядків. ' +
    'Потрібно ' +
    visibleRows +
    ', доступно ' +
    capacity +
    '. Зелена лінія не переміщувалась.'
  );
}

    target = dashboard.getRange(
      PF_LOW_VAX.outputStartRow,
      PF_LOW_VAX.outputStartCol,
      capacity,
      PF_LOW_VAX.outputCols
    );

    snapshot = pfSnapshotRange_(target);
 visibilitySnapshot =
  pfSnapshotRowsVisibility_(
    dashboard,
    PF_LOW_VAX.outputStartRow,
    capacity
  );
    const output = Array.from({ length: capacity }, function () {
      return ['', '', '', '', '', ''];
    });

    result.rows.forEach(function (item, i) {
      output[i] = [
        item.name,
        '',
        item.transferredToStorage,
        item.soldUsed,
        item.writtenOff,
        item.currentBalance
      ];
    });
 dashboard.showRows(
  PF_LOW_VAX.outputStartRow,
  capacity
 );
    // Один пакетний запис очищає старі рядки та записує нові,
    // але не змінює форматування клітинок.
    target.setValues(output);
    SpreadsheetApp.flush();
 pfApplyLowStockRowsVisibility_(
  dashboard,
  PF_LOW_VAX.outputStartRow,
  capacity,
  visibleRows
);

SpreadsheetApp.flush();
      const report = {
      ok: true,
      sourceSheet: PF_LOW_VAX.sourceSheet,
      targetSheet: PF_LOW_VAX.dashboardSheet,
      thresholds: thresholds.byType,
      thresholdSource: thresholds.sourceRange,

      period: result.period,
      dateFilterUsed: result.dateFilterUsed,

      vaccineRowsRead: result.vaccineRowsRead,
      rowsExcludedByPeriod: result.rowsExcludedByPeriod,
      rowsExcludedClosed: result.rowsExcludedClosed,

      rowsWritten: result.rows.length,
      visibleRows: visibleRows,
      hiddenRows: capacity - visibleRows,
      targetRange: target.getA1Notation(),
      noSourceCellsWritten: true
    };

    Logger.log(JSON.stringify(report, null, 2));

    // При окремому ручному запуску показуємо повідомлення.
    // Глобальний фільтр передає { showToast: false },
    // тому користувач отримує одне загальне повідомлення.
    if (showToast) {
      ss.toast(
       'Оновлено всі вакцини з позитивним залишком: ' + result.rows.length,
        'Дашборд',
        5
      );
    }

    return report;
  } catch (error) {
    // Відкат лише власного блоку Дашборду.
    if (target && snapshot) {
      try {
        target.setValues(snapshot);
        SpreadsheetApp.flush();
      } catch (restoreError) {
        Logger.log('Помилка відкату: ' + restoreError.message);
      }
    }
 if (visibilitySnapshot) {
  try {
    pfRestoreRowsVisibility_(
      dashboard,
      PF_LOW_VAX.outputStartRow,
      visibilitySnapshot
    );
  } catch (restoreVisibilityError) {
    Logger.log(
      'Помилка відновлення видимості рядків: ' +
      restoreVisibilityError.message
    );
  }
 }
    Logger.log(error.stack || error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Read-only агрегація всіх партій вакцин за найменуванням.
 */
function pfBuildLowStockVaccines_(period) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PF_LOW_VAX.sourceSheet);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      PF_LOW_VAX.sourceSheet +
      '".'
    );
  }

  const header = pfFindVaccineHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const hasPeriod = !!(
    period &&
    period.from &&
    period.to
  );

  const periodFrom = hasPeriod
    ? pfVaxDateOnly_(period.from)
    : null;

  const periodTo = hasPeriod
    ? pfVaxDateOnly_(period.to)
    : null;

  if (
    hasPeriod &&
    (!periodFrom || !periodTo)
  ) {
    throw new Error(
      'Модуль вакцин отримав некоректний період.'
    );
  }

  if (
    hasPeriod &&
    periodFrom.getTime() > periodTo.getTime()
  ) {
    throw new Error(
      'У модулі вакцин дата початку пізніше за дату завершення.'
    );
  }

  const resultPeriod = hasPeriod
    ? {
        mode: period.mode || 'RANGE',
        from: Utilities.formatDate(
          periodFrom,
          Session.getScriptTimeZone(),
          'dd.MM.yyyy'
        ),
        to: Utilities.formatDate(
          periodTo,
          Session.getScriptTimeZone(),
          'dd.MM.yyyy'
        ),
        source: period.source || ''
      }
    : null;

  if (lastRow <= header.row) {
    return {
      rows: [],
      period: resultPeriod,
      dateFilterUsed: hasPeriod,
      vaccineRowsRead: 0,
      rowsExcludedByPeriod: 0,
      rowsExcludedClosed: 0
    };
  }

  const values = sheet.getRange(
    header.row + 1,
    1,
    lastRow - header.row,
    lastCol
  ).getValues();

  const vaccineKey =
    pfNormalizeVaxText_('Вакцина');

  const closedStatusKey =
    pfNormalizeVaxText_('Закрита');

  const grouped = new Map();

  let vaccineRowsRead = 0;
  let rowsExcludedByPeriod = 0;
  let rowsExcludedClosed = 0;

  values.forEach(function (row, i) {
    if (
      pfNormalizeVaxText_(
        row[header.col.type]
      ) !== vaccineKey
    ) {
      return;
    }

    vaccineRowsRead++;

    const sheetRow =
      header.row + 1 + i;

    /*
     * Рядки зі статусом «Закрита» взагалі
     * не беруть участі в агрегації.
     */
    const status =
      pfNormalizeVaxText_(
        row[header.col.status]
      );

    if (status === closedStatusKey) {
      rowsExcludedClosed++;
      return;
    }

    /*
     * При запуску з глобальної кнопки враховуємо
     * лише партії, дата надходження яких входить
     * у вибраний календарний період.
     */
    if (hasPeriod) {
      const receiptDate =
        pfVaxDateOnly_(
          row[header.col.date]
        );

      if (!receiptDate) {
        throw new Error(
          'Некоректна або порожня дата надходження ' +
          'у рядку ' +
          sheetRow +
          '.'
        );
      }

      if (
        receiptDate.getTime() <
          periodFrom.getTime() ||
        receiptDate.getTime() >
          periodTo.getTime()
      ) {
        rowsExcludedByPeriod++;
        return;
      }
    }

    const name =
      String(
        row[header.col.name] || ''
      ).trim();

    if (!name) {
      throw new Error(
        'У рядку ' +
        sheetRow +
        ' вакцина не має найменування.'
      );
    }

    const key =
      pfNormalizeVaxText_(name);

    const item =
      grouped.get(key) || {
        name: name,
        soldUsed: 0,
        transferredToStorage: 0,
        writtenOff: 0,
        currentBalance: 0
      };

    item.soldUsed +=
      pfVaxNumber_(
        row[header.col.sold],
        sheetRow,
        PF_LOW_VAX.headers.sold
      );

    item.transferredToStorage +=
      pfVaxNumber_(
        row[header.col.storage],
        sheetRow,
        PF_LOW_VAX.headers.storage
      );

    item.writtenOff +=
      pfVaxNumber_(
        row[header.col.writeoff],
        sheetRow,
        PF_LOW_VAX.headers.writeoff
      );

    item.currentBalance +=
      pfVaxNumber_(
        row[header.col.balance],
        sheetRow,
        PF_LOW_VAX.headers.balance
      );

    grouped.set(key, item);
  });

  const rows =
    Array.from(grouped.values())
      .map(function (item) {
        item.soldUsed =
          pfRoundVaxQty_(
            item.soldUsed
          );

        item.transferredToStorage =
          pfRoundVaxQty_(
            item.transferredToStorage
          );

        item.writtenOff =
          pfRoundVaxQty_(
            item.writtenOff
          );

        item.currentBalance =
          pfRoundVaxQty_(
            item.currentBalance
          );

        return item;
      })
 /*
 * У список потрапляють усі незакриті вакцини
 * із позитивним сумарним залишком.
 *
 * threshold більше не фільтрує список.
 * Він використовується лише для червоної
 * візуальної підсвітки залишків менше 10.
 */
 .filter(function (item) {
  return item.currentBalance > 0;
 })
     

      .sort(function (a, b) {
        return (
          a.currentBalance -
            b.currentBalance ||
          a.name.localeCompare(
            b.name,
            'uk'
          )
        );
      });

  return {
    rows: rows,
    period: resultPeriod,
    dateFilterUsed: hasPeriod,
    vaccineRowsRead: vaccineRowsRead,
    rowsExcludedByPeriod: rowsExcludedByPeriod,
    rowsExcludedClosed: rowsExcludedClosed
  };
}

function pfFindVaccineHeaders_(sheet) {
  const scanRows = Math.min(10, Math.max(sheet.getLastRow(), 1));
  const display = sheet.getRange(1, 1, scanRows, sheet.getLastColumn()).getDisplayValues();
  const required = PF_LOW_VAX.headers;

  for (let r = 0; r < display.length; r++) {
    const map = {};

    display[r].forEach(function (value, col) {
      map[pfNormalizeVaxText_(value)] = col;
    });

    const indexes = {};
    let ok = true;

    Object.keys(required).forEach(function (key) {
      const normalizedHeader = pfNormalizeVaxText_(required[key]);
      if (map[normalizedHeader] === undefined) {
        ok = false;
      } else {
        indexes[key] = map[normalizedHeader];
      }
    });

    if (ok) return { row: r + 1, col: indexes };
  }

  throw new Error(
    'Не знайдено всі заголовки на листі "' + sheet.getName() + '": ' +
    Object.keys(required).map(function (key) { return required[key]; }).join('; ')
  );
}

function pfAssertLowStockDashboardArea_(sheet) {
  const target = sheet.getRange(
    PF_LOW_VAX.outputStartRow,
    PF_LOW_VAX.outputStartCol,
    PF_LOW_VAX.outputEndRow - PF_LOW_VAX.outputStartRow + 1,
    PF_LOW_VAX.outputCols
  );

  if (target.getMergedRanges().length) {
    throw new Error('Діапазон ' + target.getA1Notation() + ' містить об’єднані клітинки.');
  }

  const section = pfNormalizeVaxText_(sheet.getRange('A157').getDisplayValue());
  const balance = pfNormalizeVaxText_(sheet.getRange('G159').getDisplayValue());

  if (section.indexOf('вакцин') === -1 || balance.indexOf('залишок') === -1) {
    throw new Error('Структура блоку вакцин змінилася. Перевірте A157 і G159.');
  }
}

function pfSnapshotRange_(range) {
  const values = range.getValues();
  const formulas = range.getFormulas();

  return values.map(function (row, r) {
    return row.map(function (value, c) {
      return formulas[r][c] || value;
    });
  });
}
function pfSnapshotRowsVisibility_(
  sheet,
  startRow,
  numRows
) {
  const states = [];

  for (
    let i = 0;
    i < numRows;
    i++
  ) {
    states.push(
      sheet.isRowHiddenByUser(
        startRow + i
      )
    );
  }

  return states;
}


function pfApplyLowStockRowsVisibility_(
  sheet,
  startRow,
  capacity,
  visibleRows
) {
  sheet.showRows(
    startRow,
    capacity
  );

  const hiddenRows =
    capacity - visibleRows;

  if (hiddenRows > 0) {
    sheet.hideRows(
      startRow + visibleRows,
      hiddenRows
    );
  }
}


function pfRestoreRowsVisibility_(
  sheet,
  startRow,
  states
) {
  if (
    !states ||
    !states.length
  ) {
    return;
  }

  let index = 0;

  while (
    index < states.length
  ) {
    const hidden =
      states[index];

    let end =
      index + 1;

    while (
      end < states.length &&
      states[end] === hidden
    ) {
      end++;
    }

    const count =
      end - index;

    if (hidden) {
      sheet.hideRows(
        startRow + index,
        count
      );
    } else {
      sheet.showRows(
        startRow + index,
        count
      );
    }

    index = end;
  }
}
function pfReadInventoryThresholds_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PF_LOW_VAX.directorySheet);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      PF_LOW_VAX.directorySheet +
      '".'
    );
  }

  const range = sheet.getRange(
    PF_LOW_VAX.directoryThresholdRange
  );

  const rows = range.getDisplayValues();
  const byType = {};
  const byKey = {};

  rows.forEach(function (row, index) {
    const type = String(row[0] || '').trim();

    if (!type) return;

    const rawThreshold = String(row[1] || '')
      .replace(/\u00A0/g, ' ')
      .replace(',', '.');

    const match = rawThreshold.match(
      /-?\d+(?:\.\d+)?/
    );

    if (!match) {
      throw new Error(
        'Некоректний мінімальний залишок у ' +
        PF_LOW_VAX.directorySheet +
        '!' +
        PF_LOW_VAX.directoryThresholdRange +
        ', рядок ' +
        (index + 1) +
        '.'
      );
    }

    const threshold = Number(match[0]);

    if (!Number.isFinite(threshold) || threshold < 0) {
      throw new Error(
        'Мінімальний залишок не може бути від’ємним: ' +
        type
      );
    }

    const key = pfNormalizeVaxText_(type);

    if (
      Object.prototype.hasOwnProperty.call(
        byKey,
        key
      )
    ) {
      throw new Error(
        'Тип запасу дублюється у довіднику: ' +
        type
      );
    }

    byType[type] = threshold;
    byKey[key] = threshold;
  });

  ['Вакцина', 'Тест', 'Товар'].forEach(function (type) {
    const key = pfNormalizeVaxText_(type);

    if (
      !Object.prototype.hasOwnProperty.call(
        byKey,
        key
      )
    ) {
      throw new Error(
        'У довіднику відсутній тип запасу: ' +
        type
      );
    }
  });

  return {
    sourceSheet: PF_LOW_VAX.directorySheet,
    sourceRange: PF_LOW_VAX.directoryThresholdRange,
    byType: byType,
    byKey: byKey
  };
}

function pfGetInventoryThreshold_(
  type,
  thresholds
) {
  const key = pfNormalizeVaxText_(type);

  if (
    !thresholds ||
    !thresholds.byKey ||
    !Object.prototype.hasOwnProperty.call(
      thresholds.byKey,
      key
    )
  ) {
    throw new Error(
      'Не знайдено мінімальний залишок для типу: ' +
      type
    );
  }

  return thresholds.byKey[key];
}
function pfVaxNumber_(value, row, header) {
  if (value === '' || value == null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const parsed = Number(
    String(value).replace(/\u00A0/g, '').replace(/\s/g, '').replace(',', '.')
  );

  if (!Number.isFinite(parsed)) {
    throw new Error(
      'Некоректна кількість у рядку ' + row + ', колонка "' + header + '".'
    );
  }

  return parsed;
}

function pfVaxDateOnly_(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  const text = String(
    value == null ? '' : value
  )
    .replace(/\u00A0/g, ' ')
    .trim();

  if (!text) {
    return null;
  }

  let match = text.match(
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/
  );

  if (match) {
    const date = new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

    if (
      date.getFullYear() === Number(match[3]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[1])
    ) {
      return date;
    }

    return null;
  }

  match = text.match(
    /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/
  );

  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    if (
      date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[3])
    ) {
      return date;
    }
  }

  return null;
}

function pfNormalizeVaxText_(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('uk-UA');
}

function pfRoundVaxQty_(value) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
function dashboardInventoryThresholdsAuditV1() {
  const thresholds = pfReadInventoryThresholds_();

  const report = {
    ok: true,
    sourceSheet: thresholds.sourceSheet,
    sourceRange: thresholds.sourceRange,
    thresholds: thresholds.byType,
    noCellsWritten: true
  };

  Logger.log(
    JSON.stringify(report, null, 2)
  );

  return report;
}