/**
 * ============================================================
 * OPERATION LIFECYCLE ANALYZER — АЛЬТЕРНАТИВА.БАБУРКА
 * ============================================================
 *
 * Виробничий аналізатор операцій та їхніх залежностей.
 *
 * Нічого не записує і не змінює.
 * Використовується:
 * - контрольованим скасуванням;
 * - коригуванням операцій;
 * - скасуванням вакцин;
 * - каскадним скасуванням складських надходжень.
 */


/**
 * Аналізує операцію за ID.
 *
 * @param {string} operationId ID операції.
 * @param {Object=} options Додаткові параметри.
 * @return {Object} Стан операції та знайдені залежності.
 */
function analyzeOperationById_(
  operationId,
  options
) {
  const id =
    ol2Normalize_(operationId);

  if (!id) {
    throw new Error(
      'Не передано ID операції.'
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
   * Додаткова перевірка філії.
   * Виконується лише тоді, коли branch передано явно.
   */
  if (
    expectedBranch &&
    ol2Normalize_(ss.getName())
      .toLowerCase()
      .indexOf(
        expectedBranch.toLowerCase()
      ) === -1
  ) {
    throw new Error(
      'Операцію дозволено обробляти лише у філії «' +
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

  Object.keys(names)
    .forEach(function(key) {
      sheets[key] =
        ss.getSheetByName(
          names[key]
        );
    });

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
  ].forEach(function(key) {
    if (!sheets[key]) {
      throw new Error(
        'Не знайдено лист «' +
        names[key] +
        '».'
      );
    }
  });

  /*
   * Читаємо робочі діапазони.
   */
  const baseRows =
    ol2ReadRows_(
      sheets.base,
      10,
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
      15
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
   * Основний рядок у Базі операцій.
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
   * Пряме міжфілійне переміщення.
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
   * Партії, створені операцією або тотожні ID.
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
   * Усі пов’язані ID партій.
   */
  const lotIds =
    ol2Unique_(
      stockMatches
        .map(function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        })
        .concat(
          directTransferMatches
            .reduce(
              function(result, row) {
                result.push(
                  ol2Normalize_(
                    row.values[4]
                  )
                );

                result.push(
                  ol2Normalize_(
                    row.values[5]
                  )
                );

                return result;
              },
              []
            )
        )
    );

  /*
   * Рухи самої операції або її партій.
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
   * Інші операції, які використовували пов’язані партії.
   */
  const dependentOperationIds =
    ol2Unique_(
      movementMatches
        .map(function(row) {
          return ol2Normalize_(
            row.values[1]
          );
        })
        .filter(function(value) {
          return (
            value &&
            value !== id
          );
        })
    );

  const allRelatedOperationIds =
    ol2Unique_(
      [id].concat(
        dependentOperationIds
      )
    );

  const movementIds =
    ol2Unique_(
      movementMatches
        .map(function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        })
    );

  /*
   * Пов’язані міжфілійні переміщення.
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
   * Записи реєстру вакцин.
   */
  const registryMatches =
    ol2Where_(
      registryRows,
      function(row) {
        return (
          allRelatedOperationIds
            .indexOf(
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
   * Пов’язані нарахування.
   */
  const accrualMatches =
    ol2Where_(
      accrualRows,
      function(row) {
        const accrualId =
          ol2Normalize_(
            row.values[0]
          );

        return allRelatedOperationIds
          .some(function(relatedId) {
            return (
              accrualId === relatedId ||

              accrualId.indexOf(
                'VST|' +
                relatedId +
                '|'
              ) === 0
            );
          });
      }
    );

  /*
   * Пов’язані активи.
   * У листі "Активи" ID операції знаходиться в колонці J.
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
   * Контроль складських балансів.
   */
  const stockChecks =
    stockMatches.map(
      function(row) {
        const received =
          ol2Number_(
            row.values[8]
          );

        const soldOrUsed =
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

        const currentBalance =
          ol2Number_(
            row.values[14]
          );

        const transferred =
          ol2Number_(
            row.values[27]
          );

        const expectedBalance =
          received -
          soldOrUsed -
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
            soldOrUsed,

          stored:
            stored,

          writtenOff:
            writtenOff,

          transferred:
            transferred,

          currentBalance:
            currentBalance,

          expectedBalance:
            expectedBalance,

          balanceOk:
            Math.abs(
              currentBalance -
              expectedBalance
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

  let status =
    'NOT_FOUND';

  if (evidenceCount > 0) {
    status =
      dependencyCount === 0
        ? 'SAFE_SIMPLE_CANDIDATE'
        : 'BLOCKED_DEPENDENCY';
  }

  /*
   * Дані, з яких формується checksum.
   * Якщо операція зміниться між відкриттям і виконанням,
   * контрольований запис буде заблоковано.
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
 */
function ol2ReadRows_(
  sheet,
  firstRow,
  maxColumns
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < firstRow) {
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
    .map(function(values, index) {
      return {
        row:
          firstRow + index,

        values:
          values
      };
    });
}


/**
 * Фільтрує набір прочитаних рядків.
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
 * Повертає номери рядків.
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
 * Повертає унікальні непорожні значення.
 */
function ol2Unique_(
  values
) {
  return Array.from(
    new Set(
      values.filter(
        function(value) {
          return Boolean(value);
        }
      )
    )
  );
}


/**
 * Нормалізує текстові значення та ID.
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
 * Безпечно перетворює значення на число.
 */
function ol2Number_(
  value
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


/**
 * Формує контрольну SHA-256 суму стану операції.
 */
function ol2Checksum_(
  value
) {
  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(value),
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(function(byte) {
      return (
        '0' +
        (
          (byte + 256) %
          256
        ).toString(16)
      ).slice(-2);
    })
    .join('');
}