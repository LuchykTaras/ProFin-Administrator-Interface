const PF_DASHBOARD_NONVAX_CONFIG = Object.freeze({
  sourceSheet: 'Склад медичних запасів',
  directorySheet: 'Довідник',
  dashboardSheet: 'Дашборд',

  directoryThresholdRange: 'F39:G41',

  headerRow: 202,
  dataStartRow: 203,

  scanStartCol: 1,
  scanCols: 7,

  allowedTypes: Object.freeze([
    'Тест',
    'Товар'
  ]),

  closedStatus: 'Закрита',

  lowStockColor: '#ea9999',
  normalStockColor: '#f3f3f3',
});


function previewDashboardProductsTests() {
  const thresholds =
    pfNptReadThresholds_();

  const dashboard =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet
      );

  if (!dashboard) {
    throw new Error(
      'Не знайдено лист "' +
      PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet +
      '".'
    );
  }

  const separatorRow =
    pfNptFindGreenSeparatorRow_(
      dashboard
    );

  const columns =
    pfNptFindDashboardColumns_(
      dashboard
    );

  const result =
    pfNptBuildRows_(
      null,
      thresholds
    );

  const capacity =
    separatorRow -
    PF_DASHBOARD_NONVAX_CONFIG.dataStartRow;

  const report = {
    ok: true,
    sourceSheet:
      PF_DASHBOARD_NONVAX_CONFIG.sourceSheet,
    dashboardSheet:
      PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet,
    headerRow:
      PF_DASHBOARD_NONVAX_CONFIG.headerRow,
    dataStartRow:
      PF_DASHBOARD_NONVAX_CONFIG.dataStartRow,
    separatorRow: separatorRow,
    capacity: capacity,
    columns: columns,
    thresholds: thresholds.byType,
    rows: result.rows,
    rowsCount: result.rows.length,
    noCellsWritten: true
  };

  Logger.log(
    JSON.stringify(report, null, 2)
  );

  return report;
}


function refreshDashboardProductsTests(options) {
  options = options || {};

  const showToast =
    options.showToast !== false;

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dashboard =
    ss.getSheetByName(
      PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet
    );

  const columnSnapshots = [];
  let visibilitySnapshot = null;

  try {
    if (!dashboard) {
      throw new Error(
        'Не знайдено лист "' +
        PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet +
        '".'
      );
    }

    const thresholds =
      pfNptReadThresholds_();

    const separatorRow =
      pfNptFindGreenSeparatorRow_(
        dashboard
      );

    const columns =
      pfNptFindDashboardColumns_(
        dashboard
      );

    const result =
      pfNptBuildRows_(
        options.period || null,
        thresholds
      );

    const capacity =
      separatorRow -
      PF_DASHBOARD_NONVAX_CONFIG.dataStartRow;

    const visibleRows =
      result.rows.length + 1;

    if (visibleRows > capacity) {
      throw new Error(
        'У блоці недостатньо рядків. ' +
        'Потрібно: ' +
        visibleRows +
        ', доступно: ' +
        capacity +
        '. Зелена лінія не переміщувалась.'
      );
    }

    const startRow =
      PF_DASHBOARD_NONVAX_CONFIG.dataStartRow;

    visibilitySnapshot =
      pfNptSnapshotRowsVisibility_(
        dashboard,
        startRow,
        capacity
      );

    const writableColumns = [
  {
    key: 'name',
    column: columns.name
  },
  {
    key: 'sold',
    column: columns.sold
  },
  {
    key: 'balance',
    column: columns.balance
  },
  {
    key: 'warning',
    column: columns.warning
  }
];

if (columns.received) {
  writableColumns.splice(1, 0, {
    key: 'received',
    column: columns.received
  });
}

    if (columns.writtenOff) {
      writableColumns.push({
        key: 'writtenOff',
        column: columns.writtenOff
      });
    }

    writableColumns.forEach(function (item) {
      const range =
        dashboard.getRange(
          startRow,
          item.column,
          capacity,
          1
        );

      columnSnapshots.push({
        range: range,
        snapshot:
          pfNptSnapshotColumn_(
            range
          )
      });
    });

    const balanceRange =
      dashboard.getRange(
        startRow,
        columns.balance,
        capacity,
        1
      );

    const balanceSnapshot =
      pfNptSnapshotColumn_(
        balanceRange
      );

    columnSnapshots.push({
      range: balanceRange,
      snapshot: balanceSnapshot
    });

    dashboard.showRows(
      startRow,
      capacity
    );

    writableColumns.forEach(function (item) {
      const values =
        Array.from(
          { length: capacity },
          function (_, index) {
            const row =
              result.rows[index];

            if (!row) {
              return [''];
            }

            return [
              row[item.key] == null
                ? ''
                : row[item.key]
            ];
          }
        );

      dashboard
        .getRange(
          startRow,
          item.column,
          capacity,
          1
        )
        .setValues(values);
    });

    const balanceBackgrounds =
      Array.from(
        { length: capacity },
        function (_, index) {
          const row =
            result.rows[index];

          if (
            row &&
            row.isLowStock
          ) {
            return [
              PF_DASHBOARD_NONVAX_CONFIG
                .lowStockColor
            ];
          }

          return [
            PF_DASHBOARD_NONVAX_CONFIG
              .normalStockColor
          ];
        }
      );

    balanceRange.setBackgrounds(
      balanceBackgrounds
    );

    pfNptApplyRowsVisibility_(
      dashboard,
      startRow,
      capacity,
      visibleRows
    );

    SpreadsheetApp.flush();

    const report = {
      ok: true,
      sourceSheet:
        PF_DASHBOARD_NONVAX_CONFIG.sourceSheet,
      targetSheet:
        PF_DASHBOARD_NONVAX_CONFIG.dashboardSheet,
      period: result.period,
      dateFilterUsed:
        result.dateFilterUsed,
      thresholds:
        thresholds.byType,
      separatorRow: separatorRow,
      rowsWritten:
        result.rows.length,
      visibleRows: visibleRows,
      hiddenRows:
        capacity - visibleRows,
      capacity: capacity,
      noSourceCellsWritten: true
    };

    Logger.log(
      JSON.stringify(report, null, 2)
    );

    if (showToast) {
      ss.toast(
        'Оновлено тестів і товарів: ' +
        result.rows.length,
        'Дашборд',
        5
      );
    }

    return report;

  } catch (error) {
    columnSnapshots.forEach(function (item) {
      try {
        pfNptRestoreColumn_(
          item.range,
          item.snapshot
        );
      } catch (restoreError) {
        Logger.log(
          'Помилка відновлення колонки: ' +
          restoreError.message
        );
      }
    });

    if (visibilitySnapshot) {
      try {
        pfNptRestoreRowsVisibility_(
          dashboard,
          PF_DASHBOARD_NONVAX_CONFIG
            .dataStartRow,
          visibilitySnapshot
        );
      } catch (restoreVisibilityError) {
        Logger.log(
          'Помилка відновлення рядків: ' +
          restoreVisibilityError.message
        );
      }
    }

    Logger.log(
      error.stack || error.message
    );

    throw error;

  } finally {
    lock.releaseLock();
  }
}


function pfNptBuildRows_(period, thresholds) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      PF_DASHBOARD_NONVAX_CONFIG.sourceSheet
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      PF_DASHBOARD_NONVAX_CONFIG.sourceSheet +
      '".'
    );
  }

  const headers =
    pfNptFindSourceHeaders_(
      sheet
    );

  const lastRow =
    sheet.getLastRow();

  const lastCol =
    sheet.getLastColumn();

  const hasPeriod = !!(
    period &&
    period.from &&
    period.to
  );

  const periodFrom =
    hasPeriod
      ? pfNptDateOnly_(period.from)
      : null;

  const periodTo =
    hasPeriod
      ? pfNptDateOnly_(period.to)
      : null;

  if (
    hasPeriod &&
    (!periodFrom || !periodTo)
  ) {
    throw new Error(
      'Некоректний період для блоку тестів і товарів.'
    );
  }

  if (
    hasPeriod &&
    periodFrom.getTime() >
    periodTo.getTime()
  ) {
    throw new Error(
      'Дата початку періоду пізніше дати завершення.'
    );
  }

  const resultPeriod =
    hasPeriod
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

  if (lastRow <= headers.row) {
    return {
      rows: [],
      period: resultPeriod,
      dateFilterUsed: hasPeriod
    };
  }

  const values =
    sheet
      .getRange(
        headers.row + 1,
        1,
        lastRow - headers.row,
        lastCol
      )
      .getValues();

  const allowedTypeKeys =
    PF_DASHBOARD_NONVAX_CONFIG
      .allowedTypes
      .map(function (type) {
        return pfNptNormalize_(type);
      });

  const closedStatusKey =
    pfNptNormalize_(
      PF_DASHBOARD_NONVAX_CONFIG.closedStatus
    );

  const grouped = new Map();

  values.forEach(function (row, index) {
    const type =
      String(
        row[headers.col.type] || ''
      ).trim();

    const typeKey =
      pfNptNormalize_(type);

    if (
      allowedTypeKeys.indexOf(typeKey) === -1
    ) {
      return;
    }

    const statusKey =
      pfNptNormalize_(
        row[headers.col.status]
      );

    if (
      statusKey === closedStatusKey
    ) {
      return;
    }

    const sheetRow =
      headers.row + 1 + index;

    if (hasPeriod) {
      const receiptDate =
        pfNptDateOnly_(
          row[headers.col.date]
        );

      if (!receiptDate) {
        throw new Error(
          'Некоректна дата надходження у рядку ' +
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
        return;
      }
    }

    const name =
      String(
        row[headers.col.name] || ''
      ).trim();

    if (!name) {
      throw new Error(
        'Порожнє найменування у рядку ' +
        sheetRow +
        '.'
      );
    }

    const key =
      typeKey +
      '|' +
      pfNptNormalize_(name);

    const item =
      grouped.get(key) || {
        type: type,
        name: name,
        received: 0,
        sold: 0,
        writtenOff: 0,
        balance: 0
      };

    item.received +=
      pfNptNumber_(
        row[headers.col.received],
        sheetRow,
        'Прийнято'
      );

    item.sold +=
      pfNptNumber_(
        row[headers.col.sold],
        sheetRow,
        'Продано / використано'
      );

    item.writtenOff +=
      pfNptNumber_(
        row[headers.col.writtenOff],
        sheetRow,
        'Списано'
      );

    item.balance +=
      pfNptNumber_(
        row[headers.col.balance],
        sheetRow,
        'Поточний залишок'
      );

    grouped.set(key, item);
  });

  const rows =
    Array.from(grouped.values())
      .map(function (item) {
        item.received =
          pfNptRound_(item.received);

        item.sold =
          pfNptRound_(item.sold);

        item.writtenOff =
          pfNptRound_(item.writtenOff);

        item.balance =
          pfNptRound_(item.balance);

        const threshold =
          pfNptGetThreshold_(
            item.type,
            thresholds
          );

        item.isLowStock =
          item.balance > 0 &&
          item.balance < threshold;

        item.warning =
          item.isLowStock
            ? 'Поповнити'
            : '';

        return item;
      })
      .filter(function (item) {
        return item.balance > 0;
      })
      .sort(function (a, b) {
        return (
          a.balance - b.balance ||
          a.name.localeCompare(
            b.name,
            'uk'
          )
        );
      });

  return {
    rows: rows,
    period: resultPeriod,
    dateFilterUsed: hasPeriod
  };
}


function pfNptReadThresholds_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      PF_DASHBOARD_NONVAX_CONFIG.directorySheet
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      PF_DASHBOARD_NONVAX_CONFIG.directorySheet +
      '".'
    );
  }

  const rows =
    sheet
      .getRange(
        PF_DASHBOARD_NONVAX_CONFIG
          .directoryThresholdRange
      )
      .getDisplayValues();

  const byType = {};
  const byKey = {};

  rows.forEach(function (row, index) {
    const type =
      String(row[0] || '').trim();

    if (!type) return;

    const match =
      String(row[1] || '')
        .replace(/\u00A0/g, ' ')
        .replace(',', '.')
        .match(/-?\d+(?:\.\d+)?/);

    if (!match) {
      throw new Error(
        'Некоректний поріг у ' +
        PF_DASHBOARD_NONVAX_CONFIG
          .directorySheet +
        '!' +
        PF_DASHBOARD_NONVAX_CONFIG
          .directoryThresholdRange +
        ', рядок ' +
        (index + 1) +
        '.'
      );
    }

    const value =
      Number(match[0]);

    const key =
      pfNptNormalize_(type);

    byType[type] = value;
    byKey[key] = value;
  });

  ['Вакцина', 'Тест', 'Товар']
    .forEach(function (type) {
      const key =
        pfNptNormalize_(type);

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
    sourceSheet:
      PF_DASHBOARD_NONVAX_CONFIG.directorySheet,
    sourceRange:
      PF_DASHBOARD_NONVAX_CONFIG
        .directoryThresholdRange,
    byType: byType,
    byKey: byKey
  };
}


function pfNptGetThreshold_(type, thresholds) {
  const key =
    pfNptNormalize_(type);

  if (
    !thresholds ||
    !thresholds.byKey ||
    !Object.prototype.hasOwnProperty.call(
      thresholds.byKey,
      key
    )
  ) {
    throw new Error(
      'Не знайдено поріг для типу: ' +
      type
    );
  }

  return thresholds.byKey[key];
}


function pfNptFindSourceHeaders_(sheet) {
  const scanRows =
    Math.min(10, sheet.getLastRow());

  const display =
    sheet
      .getRange(
        1,
        1,
        scanRows,
        sheet.getLastColumn()
      )
      .getDisplayValues();

  const required = {
    type: 'Тип запасу',
    name: 'Найменування',
    date: 'Дата надходження',
    status: 'Статус',
    received: 'Прийнято',
    sold: 'Продано / використано',
    writtenOff: 'Списано',
    balance: 'Поточний залишок'
  };

  for (let r = 0; r < display.length; r++) {
    const map = {};

    display[r].forEach(function (value, col) {
      map[pfNptNormalize_(value)] = col;
    });

    const columns = {};
    let valid = true;

    Object.keys(required).forEach(function (key) {
      const normalized =
        pfNptNormalize_(required[key]);

      if (
        map[normalized] === undefined
      ) {
        valid = false;
      } else {
        columns[key] = map[normalized];
      }
    });

    if (valid) {
      return {
        row: r + 1,
        col: columns
      };
    }
  }

  throw new Error(
    'Не знайдено необхідні заголовки на листі "' +
    sheet.getName() +
    '".'
  );
}


function pfNptFindDashboardColumns_(sheet) {
  if (PF_DASHBOARD_NONVAX_CONFIG.headerRow === 202) {
  return {
    name: 2,        // B
    received: null, // колонки немає
    sold: 4,        // D
    writtenOff: 5,  // E
    balance: 6,     // F
    warning: 7      // G
  };
 }
  const display =
    sheet
      .getRange(
        PF_DASHBOARD_NONVAX_CONFIG.headerRow,
        1,
        1,
        sheet.getLastColumn()
      )
      .getDisplayValues()[0];

  function findColumn(aliases) {
    const normalizedAliases =
      aliases.map(function (value) {
        return pfNptNormalize_(value);
      });

    for (
      let col = 0;
      col < display.length;
      col++
    ) {
      if (
        normalizedAliases.indexOf(
          pfNptNormalize_(display[col])
        ) !== -1
      ) {
        return col + 1;
      }
    }

    return null;
  }

  const columns = {
    name: findColumn([
      'Найменування',
      'Назва'
    ]),
    received: findColumn([
      'Надійшло',
      'Прийнято'
    ]),
    sold: findColumn([
      'Продано',
      'Продано / використано'
    ]),
    writtenOff: findColumn([
      'Списано',
      'Списання'
    ]),
    balance: findColumn([
      'Залишок',
      'Поточний залишок'
    ]),
    warning: findColumn([
      'Попередження'
    ])
  };

  ['name', 'received', 'sold', 'balance', 'warning']
    .forEach(function (key) {
      if (!columns[key]) {
        throw new Error(
          'У рядку ' +
          PF_DASHBOARD_NONVAX_CONFIG.headerRow +
          ' не знайдено заголовок для колонки "' +
          key +
          '".'
        );
      }
    });

  return columns;
}


function pfNptFindGreenSeparatorRow_(sheet) {
  const startRow =
    PF_DASHBOARD_NONVAX_CONFIG.dataStartRow;

  const rowsToScan =
    sheet.getMaxRows() - startRow + 1;

  const backgrounds =
    sheet
      .getRange(
        startRow,
        PF_DASHBOARD_NONVAX_CONFIG.scanStartCol,
        rowsToScan,
        PF_DASHBOARD_NONVAX_CONFIG.scanCols
      )
      .getBackgrounds();

  for (
    let i = 0;
    i < backgrounds.length;
    i++
  ) {
    const greenCount =
      backgrounds[i]
        .filter(function (color) {
          return pfNptIsGreen_(color);
        })
        .length;

    if (greenCount >= 5) {
      return startRow + i;
    }
  }

  throw new Error(
    'Не знайдено зелену лінію після рядка ' +
    startRow +
    '.'
  );
}


function pfNptIsGreen_(color) {
  const value =
    String(color || '').toLowerCase();

  if (
    !/^#[0-9a-f]{6}$/.test(value)
  ) {
    return false;
  }

  const r =
    parseInt(value.slice(1, 3), 16);

  const g =
    parseInt(value.slice(3, 5), 16);

  const b =
    parseInt(value.slice(5, 7), 16);

  return (
    g >= 90 &&
    g > r * 1.35 &&
    g > b * 1.05
  );
}


function pfNptApplyRowsVisibility_(
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


function pfNptSnapshotRowsVisibility_(
  sheet,
  startRow,
  count
) {
  const states = [];

  for (let i = 0; i < count; i++) {
    states.push(
      sheet.isRowHiddenByUser(
        startRow + i
      )
    );
  }

  return states;
}


function pfNptRestoreRowsVisibility_(
  sheet,
  startRow,
  states
) {
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


function pfNptSnapshotColumn_(range) {
  const values =
    range.getValues();

  const formulas =
    range.getFormulas();

  return {
    values: values.map(function (row, r) {
      return row.map(function (value, c) {
        return formulas[r][c] || value;
      });
    }),
    backgrounds:
      range.getBackgrounds()
  };
}


function pfNptRestoreColumn_(
  range,
  snapshot
) {
  range.setValues(
    snapshot.values
  );

  range.setBackgrounds(
    snapshot.backgrounds
  );
}


function pfNptNormalize_(value) {
  return String(
    value == null ? '' : value
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function pfNptNumber_(value, row, header) {
  if (
    value === '' ||
    value == null
  ) {
    return 0;
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const match =
    String(value)
      .replace(/\u00A0/g, '')
      .replace(',', '.')
      .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    throw new Error(
      'Некоректна кількість у рядку ' +
      row +
      ', поле "' +
      header +
      '".'
    );
  }

  const parsed =
    Number(match[0]);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      'Некоректна кількість у рядку ' +
      row +
      ', поле "' +
      header +
      '".'
    );
  }

  return parsed;
}


function pfNptDateOnly_(value) {
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

  const text =
    String(
      value == null ? '' : value
    ).trim();

  let match =
    text.match(
      /^(\d{2})\.(\d{2})\.(\d{4})$/
    );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );
  }

  match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  }

  const parsed =
    new Date(text);

  if (
    isNaN(parsed.getTime())
  ) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}


function pfNptRound_(value) {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}