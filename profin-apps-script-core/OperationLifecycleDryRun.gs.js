/**
 * PROFIN OS — OPERATION LIFECYCLE, КРОК 2
 * Бабурка: автономний dry-run без записів.
 *
 * МЕТА:
 * — знайти всі наслідки операції за operationId;
 * — визначити залежні партії, рухи та операції;
 * — перевірити складський баланс;
 * — зафіксувати контрольну суму стану;
 * — нічого не записувати й не очищати.
 */


/**
 * Контрольний запуск для чотирьох відомих операцій.
 *
 * Нічого не змінює.
 */
function previewOperationLifecycleStep2Baburka() {
  const operationIds = [
    'L-20260723-472',
    'L-20260728-667',
    'L-20260806-541',
    'TRF-ALT-BAB-20260810-123415-EC360F'
  ];

  const results = operationIds.map(
    function(operationId) {
      return analyzeOperationById_(
        operationId,
        {
          branch: 'Бабурка'
        }
      );
    }
  );

  const result = {
    ok: results.every(
      function(item) {
        return item.ok === true;
      }
    ),

    test:
      'previewOperationLifecycleStep2Baburka',

    writesNow:
      false,

    operationCount:
      results.length,

    results:
      results
  };

  Logger.log(
    'OL2_SUMMARY: ' +
    JSON.stringify(result)
  );

  return result;
}


/**
 * Аналізує одну операцію та її залежності.
 *
 * @param {string} operationId
 * @param {Object=} options
 * @return {Object}
 */
function analyzeOperationById_(
  operationId,
  options
) {
  const id =
    ol2Normalize_(
      operationId
    );

  if (!id) {
    throw new Error(
      'Не передано operationId.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const expectedBranch =
    ol2Normalize_(
      options &&
      options.branch
    );

  /*
   * Захист від випадкового запуску
   * в іншому файлі.
   */
  if (
    expectedBranch &&
    ol2Normalize_(
      ss.getName()
    )
      .toLowerCase()
      .indexOf(
        expectedBranch.toLowerCase()
      ) === -1
  ) {
    throw new Error(
      'Dry-run дозволено лише для філії «' +
      expectedBranch +
      '».'
    );
  }

  const names = {
    base:
      'База операцій',

    stock:
      'Склад медичних запасів',

    movement:
      'Рух складу',

    registry:
      'Облік вакцин',

    accrual:
      'Нарахування',

    transfer:
      'Переміщення між філіями',

    assets:
      'Активи'
  };

  const sheets = {};

  Object.keys(names).forEach(
    function(key) {
      sheets[key] =
        ss.getSheetByName(
          names[key]
        );
    }
  );

  /*
   * Обов’язкові листи.
   */
  [
    'base',
    'stock',
    'movement',
    'registry',
    'accrual',
    'transfer'
  ].forEach(
    function(key) {
      if (!sheets[key]) {
        throw new Error(
          'Не знайдено лист «' +
          names[key] +
          '».'
        );
      }
    }
  );

  /*
   * Зчитування даних.
   *
   * Жодних setValue(), clear(),
   * appendRow() або інших записів.
   */
  const baseRows =
    ol2ReadRows_(
      sheets.base,
      2,
      33
    );

  const stockRows =
    ol2ReadRows_(
      sheets.stock,
      3,
      28
    );

  const movementRows =
    ol2ReadRows_(
      sheets.movement,
      2,
      12
    );

  const registryRows =
    ol2ReadRows_(
      sheets.registry,
      2,
      13
    );

  const accrualRows =
    ol2ReadRows_(
      sheets.accrual,
      2,
      10
    );

  const transferRows =
    ol2ReadRows_(
      sheets.transfer,
      2,
      18
    );

  const assetRows =
    sheets.assets
      ? ol2ReadRows_(
          sheets.assets,
          3,
          12
        )
      : [];

  /*
   * Первинний запис у Базі операцій.
   * A — operationId.
   */
  const baseMatches =
    ol2Where_(
      baseRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

  /*
   * Прямий міжфілійний документ.
   * A — transferId.
   */
  const directTransferMatches =
    ol2Where_(
      transferRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

  /*
   * Партії складу:
   * A — lotId;
   * B — operationId надходження.
   */
  const stockMatches =
    ol2Where_(
      stockRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id ||

          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

 /*
 * Для міжфілійної передачі беремо партію
 * відповідно до ролі поточної філії:
 *
 * джерело — колонка E;
 * одержувач — колонка F.
 *
 * Це не дозволяє змішувати сусідні передачі,
 * які використовували одну вихідну партію.
 */
const directTransferLotIds =
  directTransferMatches.reduce(
    function(result, row) {
      const sourceBranch =
        ol2Normalize_(
          row.values[2]
        );

      const receiverBranch =
        ol2Normalize_(
          row.values[3]
        );

      const sourceLotId =
        ol2Normalize_(
          row.values[4]
        );

      const receiverLotId =
        ol2Normalize_(
          row.values[5]
        );

      const branchKey =
        expectedBranch
          .toLowerCase();

      if (
        branchKey &&
        receiverBranch
          .toLowerCase() ===
          branchKey
      ) {
        /*
         * Поточна філія — одержувач.
         * Аналізуємо лише вхідну партію F.
         */
        result.push(
          receiverLotId
        );

      } else if (
        branchKey &&
        sourceBranch
          .toLowerCase() ===
          branchKey
      ) {
        /*
         * Поточна філія — джерело.
         * Аналізуємо лише вихідну партію E.
         */
        result.push(
          sourceLotId
        );

      } else {
        /*
         * Резервний режим, якщо роль філії
         * неможливо визначити.
         */
        result.push(
          sourceLotId
        );

        result.push(
          receiverLotId
        );
      }

      return result;
    },
    []
  );


const lotIds =
  ol2Unique_(
    stockMatches
      .map(
        function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        }
      )
      .concat(
        directTransferLotIds
      )
  );
  /*
   * Рухи складу:
   * B — operationId;
   * F — lotId.
   */
  const movementMatches =
    ol2Where_(
      movementRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[5]
            )
          ) !== -1
        );
      }
    );

  /*
   * Операції, що використали знайдену партію.
   */
  const dependentOperationIds =
    ol2Unique_(
      movementMatches
        .map(
          function(row) {
            return ol2Normalize_(
              row.values[1]
            );
          }
        )
        .filter(
          function(value) {
            return (
              value &&
              value !== id
            );
          }
        )
    );

  const allRelatedOperationIds =
    ol2Unique_(
      [id].concat(
        dependentOperationIds
      )
    );

  const movementIds =
    ol2Unique_(
      movementMatches.map(
        function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        }
      )
    );

  /*
   * Усі передачі, пов’язані
   * з операцією або її партіями.
   */
  const relatedTransferMatches =
    ol2Where_(
      transferRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[4]
            )
          ) !== -1 ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[5]
            )
          ) !== -1
        );
      }
    );

  /*
   * Облік вакцин:
   * B — ID продажу;
   * J — lotId;
   * M — ID вихідного руху.
   */
  const registryMatches =
    ol2Where_(
      registryRows,
      function(row) {
        return (
          allRelatedOperationIds.indexOf(
            ol2Normalize_(
              row.values[1]
            )
          ) !== -1 ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[9]
            )
          ) !== -1 ||

          movementIds.indexOf(
            ol2Normalize_(
              row.values[12]
            )
          ) !== -1
        );
      }
    );

  /*
   * Нарахування:
   * A — operationId.
   */
  const accrualMatches =
    ol2Where_(
      accrualRows,
      function(row) {
        const accrualId =
          ol2Normalize_(
            row.values[0]
          );

        return allRelatedOperationIds.some(
          function(relatedId) {
            return (
              accrualId === relatedId ||

              accrualId.indexOf(
                'VST|' +
                relatedId +
                '|'
              ) === 0
            );
          }
        );
      }
    );

  /*
   * Активи:
   * J — operationId.
   */
  const assetMatches =
    ol2Where_(
      assetRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[9]
          ) === id
        );
      }
    );

  /*
   * Перевірка кількісного балансу партій:
   *
   * I  — отримано;
   * L  — продано/використано;
   * M  — передано на зберігання;
   * N  — списано;
   * O  — поточний залишок;
   * AB — передано між філіями.
   */
  const stockChecks =
    stockMatches.map(
      function(row) {
        const received =
          ol2Number_(
            row.values[8]
          );

        const sold =
          ol2Number_(
            row.values[11]
          );

        const stored =
          ol2Number_(
            row.values[12]
          );

        const writtenOff =
          ol2Number_(
            row.values[13]
          );

        const balance =
          ol2Number_(
            row.values[14]
          );

        const transferred =
          ol2Number_(
            row.values[27]
          );

        const expected =
          received -
          sold -
          stored -
          writtenOff -
          transferred;

        return {
          row:
            row.row,

          lotId:
            ol2Normalize_(
              row.values[0]
            ),

          received:
            received,

          soldOrUsed:
            sold,

          stored:
            stored,

          writtenOff:
            writtenOff,

          transferred:
            transferred,

          currentBalance:
            balance,

          expectedBalance:
            expected,

          balanceOk:
            Math.abs(
              balance -
              expected
            ) <= 0.000001
        };
      }
    );

  const evidenceCount =
    baseMatches.length +
    stockMatches.length +
    movementMatches.length +
    registryMatches.length +
    accrualMatches.length +
    relatedTransferMatches.length +
    assetMatches.length;

  const dependencyCount =
    stockMatches.length +
    movementMatches.length +
    registryMatches.length +
    accrualMatches.length +
    relatedTransferMatches.length +
    assetMatches.length;

  /*
   * Попередня класифікація.
   *
   * SAFE_SIMPLE_CANDIDATE ще не означає,
   * що операцію вже можна скасовувати.
   */
  let status =
    'NOT_FOUND';

  if (evidenceCount > 0) {
    status =
      dependencyCount === 0
        ? 'SAFE_SIMPLE_CANDIDATE'
        : 'BLOCKED_DEPENDENCY';
  }

  /*
   * Контрольна сума всіх знайдених записів.
   * Використовується для виявлення зміни стану
   * між dry-run і майбутнім виконанням.
   */
  const fingerprintSource = {
    base:
      baseMatches,

    stock:
      stockMatches,

    movements:
      movementMatches,

    registry:
      registryMatches,

    accruals:
      accrualMatches,

    transfers:
      relatedTransferMatches,

    assets:
      assetMatches
  };

  return {
    ok:
      true,

    writesNow:
      false,

    operationId:
      id,

    status:
      status,

    baseRows:
      ol2RowNumbers_(
        baseMatches
      ),

    stockRows:
      ol2RowNumbers_(
        stockMatches
      ),

    movementRows:
      ol2RowNumbers_(
        movementMatches
      ),

    registryRows:
      ol2RowNumbers_(
        registryMatches
      ),

    accrualRows:
      ol2RowNumbers_(
        accrualMatches
      ),

    transferRows:
      ol2RowNumbers_(
        relatedTransferMatches
      ),

    assetRows:
      ol2RowNumbers_(
        assetMatches
      ),

    lotIds:
      lotIds,

    dependentOperationIds:
      dependentOperationIds,

    stockChecks:
      stockChecks,

    allStockBalancesValid:
      stockChecks.every(
        function(item) {
          return (
            item.balanceOk === true
          );
        }
      ),

    checksum:
      ol2Checksum_(
        fingerprintSource
      )
  };
}


/**
 * Читає робочі рядки листа.
 *
 * Тільки getValues().
 */
function ol2ReadRows_(
  sheet,
  firstRow,
  maxColumns
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <
    firstRow
  ) {
    return [];
  }

  const columnCount =
    Math.min(
      Math.max(
        sheet.getLastColumn(),
        1
      ),
      maxColumns
    );

  return sheet
    .getRange(
      firstRow,
      1,
      lastRow - firstRow + 1,
      columnCount
    )
    .getValues()
    .map(
      function(values, index) {
        return {
          row:
            firstRow +
            index,

          values:
            values
        };
      }
    );
}


/**
 * Фільтр масиву рядків.
 */
function ol2Where_(
  rows,
  predicate
) {
  return rows.filter(
    predicate
  );
}


/**
 * Повертає лише номери рядків.
 */
function ol2RowNumbers_(
  rows
) {
  return rows.map(
    function(item) {
      return item.row;
    }
  );
}


/**
 * Видаляє порожні значення та дублікати.
 */
function ol2Unique_(
  values
) {
  return Array.from(
    new Set(
      values.filter(
        function(value) {
          return value;
        }
      )
    )
  );
}


/**
 * Нормалізація тексту.
 */
function ol2Normalize_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .replace(
      /\u00A0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


/**
 * Безпечне число.
 */
function ol2Number_(
  value
) {
  const number =
    Number(
      value
    );

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/**
 * SHA-256 контрольна сума.
 */
function ol2Checksum_(
  value
) {
  const bytes =
    Utilities.computeDigest(
      Utilities
        .DigestAlgorithm
        .SHA_256,

      JSON.stringify(
        value
      ),

      Utilities
        .Charset
        .UTF_8
    );

  return bytes
    .map(
      function(byte) {
        return (
          '0' +
          (
            (
              byte +
              256
            ) %
            256
          )
            .toString(16)
        ).slice(-2);
      }
    )
    .join('');
}
/**
 * CT-01 — проста фінансова операція без залежностей.
 *
 * Нічого не записує і не скасовує.
 */
function previewSafeSimpleOperationStep2Baburka() {
  const operationId =
    'PF-20260818-628';

  const result =
    analyzeOperationById_(
      operationId,
      {
        branch: 'Бабурка'
      }
    );

  const summary = {
    ok:
      result.ok === true &&
      result.writesNow === false &&
      result.status ===
        'SAFE_SIMPLE_CANDIDATE',

    test:
      'previewSafeSimpleOperationStep2Baburka',

    writesNow:
      false,

    operationId:
      operationId,

    result:
      result
  };

  Logger.log(
    'OL2_SAFE_SIMPLE: ' +
    JSON.stringify(
      summary
    )
  );

  return summary;
}
/**
 * КРОК 3А — DRY-RUN СКАСУВАННЯ ПРОСТОЇ ОПЕРАЦІЇ.
 *
 * Нічого не записує.
 * Формує точний план майбутньої зміни
 * та перевіряє незмінність контрольного стану.
 */
function previewSimpleCancellationPlanStep3Baburka() {
  const operationId =
    'PF-20260818-628';

  const expectedChecksum =
    '2ae900a5f1180cdbbe2ad7992f3c1d3ffbe6e03323d5acbe812d3dac16a97eef';

  const analysis =
    analyzeOperationById_(
      operationId,
      {
        branch: 'Бабурка'
      }
    );

  const errors = [];

  if (
    !analysis ||
    analysis.ok !== true
  ) {
    errors.push(
      'Аналіз операції не пройдено.'
    );
  }

  if (
    analysis.status !==
    'SAFE_SIMPLE_CANDIDATE'
  ) {
    errors.push(
      'Операція більше не є простою: ' +
      analysis.status
    );
  }

  if (
    analysis.checksum !==
    expectedChecksum
  ) {
    errors.push(
      'Контрольна сума змінилася після CT-01.'
    );
  }

  if (
    !Array.isArray(
      analysis.baseRows
    ) ||
    analysis.baseRows.length !== 1
  ) {
    errors.push(
      'Очікувався рівно один рядок у Базі операцій.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName(
      'База операцій'
    );

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист «База операцій».'
    );
  }

  const baseRow =
    analysis.baseRows.length === 1
      ? analysis.baseRows[0]
      : 0;

  let currentStatus = '';
  let statusCell = '';

  if (baseRow > 0) {
    /*
     * AD — статус операції.
     */
    statusCell =
      'AD' +
      baseRow;

    currentStatus =
      ol2Normalize_(
        baseSheet
          .getRange(
            baseRow,
            30
          )
          .getDisplayValue()
      );

    if (
      currentStatus !==
      'Проведено'
    ) {
      errors.push(
        'Поточний статус операції: «' +
        currentStatus +
        '». Очікувався статус «Проведено».'
      );
    }
  }

  /*
   * Виконання ще заблоковане,
   * оскільки звіти та дашборди поки
   * не виключають статус «Скасовано».
   */
  const executionBlockers = [
    'CASH_FLOW_STATUS_FILTER_REQUIRED',
    'PL_STATUS_FILTER_REQUIRED',
    'DASHBOARD_STATUS_FILTER_REQUIRED',
    'AUDIT_LOG_REQUIRED'
  ];

  const result = {
    ok:
      errors.length === 0,

    test:
      'previewSimpleCancellationPlanStep3Baburka',

    writesNow:
      false,

    operationId:
      operationId,

    checksumExpected:
      expectedChecksum,

    checksumActual:
      analysis.checksum,

    checksumMatched:
      analysis.checksum ===
      expectedChecksum,

    currentState: {
      sheet:
        'База операцій',

      row:
        baseRow,

      statusCell:
        statusCell,

      currentStatus:
        currentStatus
    },

    proposedChange: {
      sheet:
        'База операцій',

      row:
        baseRow,

      statusCell:
        statusCell,

      before:
        currentStatus,

      after:
        'Скасовано'
    },

    dependencyStatus:
      analysis.status,

    executionBlockers:
      executionBlockers,

    readyForExecution:
      false,

    readyForReportFilterStep:
      errors.length === 0,

    errors:
      errors
  };

  Logger.log(
    'OL3_CANCEL_PLAN: ' +
    JSON.stringify(
      result
    )
  );

  return result;
}