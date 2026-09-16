/**
 * ОДНОРАЗОВА СИНХРОНІЗАЦІЯ — КРОК 1, DRY-RUN.
 *
 * Нічого не записує і не очищає.
 * Лише знаходить похідні операції без підтвердження
 * у «Базі операцій» та перевіряє їхні залежності.
 */
function previewOrphanOperationRollback() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheetNames = {
    base: 'База операцій',
    stock: 'Склад медичних запасів',
    movement: 'Рух складу',
    registry: 'Облік вакцин',
    accrual: 'Нарахування',
    transfers: 'Переміщення між філіями',
    assets: 'Активи'
  };

  const sheets = {};

  Object.keys(sheetNames).forEach(
    function(key) {
      sheets[key] =
        ss.getSheetByName(
          sheetNames[key]
        );
    }
  );

  [
    'base',
    'stock',
    'movement',
    'registry',
    'accrual',
    'transfers'
  ].forEach(
    function(key) {
      if (!sheets[key]) {
        throw new Error(
          'Не знайдено лист «' +
          sheetNames[key] +
          '».'
        );
      }
    }
  );

  function normalize(value) {
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

  function readIdSet(
    sheet,
    column,
    firstDataRow
  ) {
    const result = new Set();
    const lastRow =
      sheet.getLastRow();

    if (lastRow < firstDataRow) {
      return result;
    }

    sheet
      .getRange(
        firstDataRow,
        column,
        lastRow - firstDataRow + 1,
        1
      )
      .getDisplayValues()
      .flat()
      .forEach(
        function(value) {
          const id =
            normalize(value);

          if (id) {
            result.add(id);
          }
        }
      );

    return result;
  }

  function getRows(sheet) {
    const lastRow =
      sheet.getLastRow();

    const lastColumn =
      sheet.getLastColumn();

    if (
      lastRow < 1 ||
      lastColumn < 1
    ) {
      return [];
    }

    return sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getDisplayValues();
  }

  function getVstParent(
    operationId
  ) {
    const id =
      normalize(operationId);

    if (
      id.indexOf('VST|') !== 0
    ) {
      return '';
    }

    const parts =
      id.split('|');

    return parts.length >= 2
      ? normalize(parts[1])
      : '';
  }

  const baseIds =
    readIdSet(
      sheets.base,
      1,
      2
    );

  const transferIds =
    readIdSet(
      sheets.transfers,
      1,
      2
    );

  const candidates = {};

  function ensureCandidate(
    rootId
  ) {
    const id =
      normalize(rootId);

    if (!id) {
      return null;
    }

    if (!candidates[id]) {
      candidates[id] = {
        operationId: id,
        evidence: [],
        lotIds: [],
        confirmedDependents: []
      };
    }

    return candidates[id];
  }

  function addEvidence(
    rootId,
    sheetName,
    row,
    recordType,
    details
  ) {
    const candidate =
      ensureCandidate(rootId);

    if (!candidate) {
      return;
    }

    candidate.evidence.push({
      sheet: sheetName,
      row: row,
      recordType: recordType,
      details: details || ''
    });
  }

  /*
   * НАРАХУВАННЯ
   * ID операції — колонка A.
   */
  const accrualRows =
    getRows(sheets.accrual);

  for (
  let index = 1;
  index < accrualRows.length;
  index++
) {
    const operationId =
      normalize(
        accrualRows[index][0]
      );

    if (
      operationId &&
      !baseIds.has(operationId)
    ) {
      addEvidence(
        operationId,
        sheetNames.accrual,
        index + 1,
        'Нарахування',
        normalize(
          accrualRows[index][4]
        )
      );
    }
  }

  /*
   * ОБЛІК ВАКЦИН
   * ID продажу — колонка B.
   */
  const registryRows =
    getRows(sheets.registry);

  for (
    let index = 1;
    index < registryRows.length;
    index++
  ) {
    const saleId =
      normalize(
        registryRows[index][1]
      );

    if (
      saleId &&
      !baseIds.has(saleId)
    ) {
      addEvidence(
        saleId,
        sheetNames.registry,
        index + 1,
        'Запис вакцини',
        normalize(
          registryRows[index][3]
        )
      );
    }
  }

  /*
   * АКТИВИ
   * ID операції — колонка J.
   */
  if (sheets.assets) {
    const assetRows =
      getRows(sheets.assets);

    for (
      let index = 2;
      index < assetRows.length;
      index++
    ) {
      const operationId =
        normalize(
          assetRows[index][9]
        );

      if (
        operationId &&
        !baseIds.has(operationId)
      ) {
        addEvidence(
          operationId,
          sheetNames.assets,
          index + 1,
          'Актив',
          normalize(
            assetRows[index][0]
          )
        );
      }
    }
  }

  /*
   * СКЛАД МЕДИЧНИХ ЗАПАСІВ
   *
   * A — ID партії.
   * B — ID операції надходження.
   *
   * Рядок 2 є пошуковим,
   * тому перевірка починається з рядка 3.
   */
  const stockRows =
    getRows(sheets.stock);

  for (
    let index = 2;
    index < stockRows.length;
    index++
  ) {
    const lotId =
      normalize(
        stockRows[index][0]
      );

    const receiptId =
      normalize(
        stockRows[index][1]
      );

    if (
      receiptId &&
      !baseIds.has(receiptId) &&
      !transferIds.has(receiptId)
    ) {
      const candidate =
        ensureCandidate(
          receiptId
        );

      if (
        lotId &&
        candidate.lotIds
          .indexOf(lotId) === -1
      ) {
        candidate.lotIds.push(
          lotId
        );
      }

      addEvidence(
        receiptId,
        sheetNames.stock,
        index + 1,
        'Партія надходження',
        lotId +
          ' | ' +
          normalize(
            stockRows[index][3]
          )
      );
    }
  }

  /*
   * РУХ СКЛАДУ
   *
   * B — ID операції.
   *
   * TRF підтверджується реєстром
   * переміщень.
   *
   * VST підтверджується батьківським
   * VAC у «Базі операцій».
   */
  const movementRows =
    getRows(sheets.movement);

  for (
    let index = 1;
    index < movementRows.length;
    index++
  ) {
    const technicalId =
      normalize(
        movementRows[index][1]
      );

    if (!technicalId) {
      continue;
    }

    const vstParent =
      getVstParent(
        technicalId
      );

    let rootId = '';

    if (vstParent) {
      if (
        !baseIds.has(vstParent)
      ) {
        rootId =
          vstParent;
      }

    } else if (
      !baseIds.has(technicalId) &&
      !transferIds.has(technicalId)
    ) {
      rootId =
        technicalId;
    }

    if (rootId) {
      addEvidence(
        rootId,
        sheetNames.movement,
        index + 1,
        vstParent
          ? 'Похідний VST-рух'
          : 'Складський рух',
        technicalId +
          ' | ' +
          normalize(
            movementRows[index][4]
          ) +
          ' | ' +
          normalize(
            movementRows[index][6]
          )
      );
    }
  }

  /*
   * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ.
   *
   * Якщо партію непідтвердженого
   * надходження використовує операція,
   * яка є у базі або реєстрі переміщень,
   * автоматичний відкат блокується.
   */
  Object.keys(candidates)
    .forEach(
      function(operationId) {
        const candidate =
          candidates[operationId];

        candidate.lotIds
          .forEach(
            function(lotId) {
              for (
                let index = 1;
                index <
                  movementRows.length;
                index++
              ) {
                const movementLotId =
                  normalize(
                    movementRows[index][5]
                  );

                const movementOperationId =
                  normalize(
                    movementRows[index][1]
                  );

                if (
                  !movementOperationId ||
                  movementLotId !== lotId
                ) {
                  continue;
                }

                if (
                  movementOperationId ===
                  operationId
                ) {
                  continue;
                }

                const vstParent =
                  getVstParent(
                    movementOperationId
                  );

                const confirmed =
                  baseIds.has(
                    movementOperationId
                  ) ||
                  transferIds.has(
                    movementOperationId
                  ) ||
                  (
                    vstParent &&
                    baseIds.has(
                      vstParent
                    )
                  );

                if (confirmed) {
                  candidate
                    .confirmedDependents
                    .push({
                      sheet:
                        sheetNames.movement,

                      row:
                        index + 1,

                      operationId:
                        movementOperationId,

                      lotId:
                        lotId,

                      movementType:
                        normalize(
                          movementRows[index][6]
                        )
                    });
                }
              }
            }
          );

        candidate.status =
          candidate
            .confirmedDependents
            .length
            ? 'BLOCKED_DEPENDENCY'
            : 'SAFE_ROLLBACK';
      }
    );

  const items =
    Object.keys(candidates)
      .sort()
      .map(
        function(operationId) {
          return candidates[
            operationId
          ];
        }
      );

  const result = {
    ok: true,

    test:
      'previewOrphanOperationRollback',

    writesNow:
      false,

    baseOperationCount:
      baseIds.size,

    transferDocumentCount:
      transferIds.size,

    candidateCount:
      items.length,

    safeRollbackCount:
      items.filter(
        function(item) {
          return (
            item.status ===
            'SAFE_ROLLBACK'
          );
        }
      ).length,

    blockedDependencyCount:
      items.filter(
        function(item) {
          return (
            item.status ===
            'BLOCKED_DEPENDENCY'
          );
        }
      ).length,

    candidates:
      items
  };

  const compactSummary = {
  ok: true,
  test: result.test,
  writesNow: false,
  baseOperationCount:
    result.baseOperationCount,
  transferDocumentCount:
    result.transferDocumentCount,
  candidateCount:
    result.candidateCount,
  safeRollbackCount:
    result.safeRollbackCount,
  blockedDependencyCount:
    result.blockedDependencyCount
};

Logger.log(
  'SUMMARY: ' +
  JSON.stringify(
    compactSummary
  )
);

items.forEach(
  function(item) {
    Logger.log(
      'CANDIDATE: ' +
      JSON.stringify({
        operationId:
          item.operationId,

        status:
          item.status,

        evidence:
          item.evidence.map(
            function(evidence) {
              return (
                evidence.sheet +
                '!' +
                evidence.row +
                ' | ' +
                evidence.recordType +
                ' | ' +
                evidence.details
              );
            }
          ),

        lotIds:
          item.lotIds,

        confirmedDependents:
          item.confirmedDependents.map(
            function(dependent) {
              return (
                dependent.operationId +
                ' | ' +
                dependent.lotId +
                ' | ' +
                dependent.movementType
              );
            }
          )
      })
    );
  }
);

return compactSummary;
}