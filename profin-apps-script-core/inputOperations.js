/****************************************************
 * ВВІД ОПЕРАЦІЙ
 * --------------------------------------------------
 * Окремий файл для роботи листа "Ввід операцій".
 *
 * Залежить від першого скрипта:
 * - clean_()
 * - unique_()
 * - getIncomeCategories_()
 * - getExpenseCategories_()
 * - getIncomeArticles_()
 * - getExpenseArticles_()
 ****************************************************/


/****************************************************
 * НАЗВИ ЛИСТІВ
 ****************************************************/

const INPUT_SHEET_NAME = 'Ввід операцій';
const BASE_SHEET_NAME = 'База операцій';
const ASSETS_SHEET_NAME = 'Активи';
const ACCRUAL_SHEET_NAME = 'Нарахування';
const DICT_SHEET_NAME = 'Довідник';
const INPUT_TEMPLATE_SHEET_NAME = '_Шаблон_Ввід_операцій';


/****************************************************
 * ПОЛЯ ФОРМИ
 ****************************************************/

const INPUT = {
  date: 'B4',
  account: 'B5',
  type: 'B6',
  category: 'B7',
  article: 'B8',
  doctor: 'B9',
  patient: 'B10',
  unitPrice: 'B11',
  quantity: 'B12',
  amount: 'B13',
  comment: 'B14',
  transferTo: 'B15',

  status: 'D10:G10',

  packageStart: 'D5',
  packageDuration: 'E5',
  packageMonthlyAmount: 'F5',
  packageAccrualStart: 'G5',

  vaccineName: 'D7',
  vaccinePatient: 'E7',
  vaccineCost: 'F7',
  vaccineSeries: 'G7',

  assetName: 'D9',
  assetCategory: 'E9',
  assetAmortization: 'F9',
  assetStartDate: 'G9',

  storedVaccine: 'D13',
  expiryDate: 'E13',
  newStatus: 'F13',
  actualDate: 'G13',

  inventoryName: 'D15',
 inventorySeries: 'E15',
 inventoryExpiryDate: 'F15',
 inventorySupplier: 'G15'
};
/**
 * ЗАХИСТ КНОПКИ «ПРОВЕСТИ ОПЕРАЦІЮ»
 *
 * Не дозволяє двом паралельним натисканням
 * створити дві однакові операції з різними ID.
 *
 * Кнопка залишається прив’язаною до:
 * postInputOperation
 */
function postInputOperation() {
  const executionLock =
    LockService.getScriptLock();

  /*
   * Не змушуємо друге натискання довго чекати.
   * Якщо операція вже виконується — одразу зупиняємо дубль.
   */
  if (!executionLock.tryLock(1000)) {
    const message =
      '🟡 Операція вже проводиться. ' +
      'Не натискайте кнопку повторно.';

    try {
      showInputStatus_(
        message,
        'warning'
      );
    } catch (error) {
      console.log(error.message);
    }

    SpreadsheetApp
      .getActive()
      .toast(
        message,
        'Повторне натискання заблоковано',
        5
      );

    return {
      ok: false,
      writesNow: false,
      duplicateSubmissionBlocked: true
    };
  }

  try {
    /*
     * Запускаємо весь наявний процес:
     * база, склад, вакцини, нарахування,
     * активи та очищення форми.
     *
     * Блокування утримується до повного завершення.
     */
    return postInputOperationCore_();

  } finally {
    executionLock.releaseLock();
  }
}
/****************************************************
 * КНОПКА "ПРОВЕСТИ ОПЕРАЦІЮ"
 *
 * Підтримує:
 * — звичайні фінансові операції;
 * — активи;
 * — надходження запасів;
 * — вибуття вакцин;
 * — вибуття тестів;
 * — вибуття косметичних товарів.
 ****************************************************/
function postInputOperationCore_(
  providedData,
  options
) {
  const coreOptions =
    options &&
    typeof options === 'object'
      ? options
      : {};

  const isWebMode =
    String(
      coreOptions.mode || ''
    )
      .trim()
      .toUpperCase() === 'WEB';

  const ss =
    coreOptions.spreadsheet ||
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const baseSheet =
    ss.getSheetByName(
      BASE_SHEET_NAME
    );

  if (
    !inputSheet ||
    !baseSheet
  ) {
    if (!isWebMode) {
      showInputStatus_(
        '🔴 Не знайдено лист "Ввід операцій" або "База операцій"',
        'error'
      );

      return;
    }

    return {
      ok: false,
      operationId: '',
      message:
        'Не знайдено лист "Ввід операцій" або "База операцій".'
    };
  }

  const hasProvidedData =
    providedData &&
    typeof providedData === 'object' &&
    !Array.isArray(
      providedData
    );

  if (
    isWebMode &&
    !hasProvidedData
  ) {
    return {
      ok: false,
      operationId: '',
      message:
        'WEB operation data was not provided.'
    };
  }

  const data =
    isWebMode
      ? providedData
      : getInputOperationData_();

  const newClientPreparation =
    isWebMode
      ? {
          ok: true,
          isNewClient: false
        }
      : prepareNewClientForOperation_(
          inputSheet,
          data,
          true
        );

  if (!newClientPreparation.ok) {
    if (!isWebMode) {
      showInputStatus_(
        newClientPreparation.message,
        'error'
      );

      return;
    }

    return {
      ok: false,
      operationId: '',
      message:
        newClientPreparation.message
    };
  }

  /****************************************************
   * РУЧНА СОБІВАРТІСТЬ ВАКЦИНИ
   ****************************************************/

  const manualVaccineUnitCost =
    Number(
      data.vaccineCost
    ) || 0;

  const isVaccineSale =
    data.type === 'Вакцина' &&
    (
      data.category ===
        'Продаж і використання' ||
      data.category ===
        'Продаж на зберігання'
    );

  /****************************************************
   * ПОПЕРЕДНІЙ FEFO-РОЗРАХУНОК ВАКЦИНИ
   ****************************************************/

  if (
    isVaccineSale &&
    typeof planInventoryIssue_ ===
      'function'
  ) {
    try {
      const previewPlan =
        planInventoryIssue_(
          data
        );

      if (
        previewPlan &&
        previewPlan.ok === true &&
        previewPlan.requiresIssue ===
          true
      ) {
        const previewQuantity =
          Number(
            data.vaccineQty ||
            data.quantity
          ) || 1;

        data.vaccineTotalCost =
          Number(
            previewPlan.totalCost
          ) || 0;

        data.vaccineCost =
          previewQuantity > 0
            ? (
                data.vaccineTotalCost /
                previewQuantity
              )
            : 0;

        data.vaccineSeries =
          buildInventoryIssueSeriesPreview_(
            previewPlan
          );

        /*
         * WEB не повинен змінювати
         * ручну форму "Ввід операцій".
         */
        if (!isWebMode) {
          inputSheet
            .getRange(
              INPUT.vaccineSeries
            )
            .clearDataValidations()
            .setNumberFormat('@')
            .setValue(
              data.vaccineSeries
            )
            .setNote(
              buildInventoryIssueSeriesNote_(
                previewPlan
              )
            );
        }
      }

    } catch (error) {
      /*
       * Історична вакцина може ще
       * не мати складської партії.
       */
      data.vaccineCost =
        manualVaccineUnitCost;

      data.vaccineSeries =
        '';

      if (!isWebMode) {
        inputSheet
          .getRange(
            INPUT.vaccineSeries
          )
          .clearContent()
          .clearDataValidations()
          .setNumberFormat('@');
      }
    }
  }

  /****************************************************
   * ВАЛІДАЦІЯ
   ****************************************************/

  const validation =
    validateInputOperation_(
      data
    );

  if (!validation.ok) {
    if (!isWebMode) {
      showInputStatus_(
        validation.message,
        'error'
      );

      return;
    }

    return {
      ok: false,
      operationId: '',
      message:
        validation.message,
      validation:
        validation
    };
  }

  /****************************************************
   * КЛАСИФІКАЦІЯ ОПЕРАЦІЇ
   ****************************************************/

  const isAsset =
    data.type === 'Актив';

  const isInventoryReceipt =
    typeof isInventoryReceiptOperation_ ===
      'function' &&
    isInventoryReceiptOperation_(
      data
    );

  const isInventoryIssue =
    typeof isInventoryIssueOperation_ ===
      'function' &&
    isInventoryIssueOperation_(
      data
    );

  const requiresDocumentLock =
    isAsset ||
    isInventoryReceipt ||
    isInventoryIssue;

  let lock =
    null;

  let baseOperationWritten =
    false;

  let inventoryReceiptWritten =
    false;

  let inventoryIssueWritten =
    false;

  let vaccineRegistryWritten =
    false;

  let inventoryIssuePlan =
    null;

  let inventoryIssueSnapshot =
    [];

  let inventoryIssueResult =
    null;

  let useInventoryIssue =
    false;

  let inventoryIssueFallbackReason =
    '';

  let createdNewClient =
    null;

  try {
    /****************************************************
     * БЛОКУВАННЯ ДОКУМЕНТА
     ****************************************************/

    if (
      requiresDocumentLock
    ) {
      lock =
        LockService
          .getDocumentLock();

      lock.waitLock(
        30000
      );
    }

    /****************************************************
     * ID ОПЕРАЦІЇ
     ****************************************************/

    if (isAsset) {
      assertAssetInputStep2Ready_();

      normalizeAssetInputData_(
        data
      );

      data.id =
        generateUniqueAssetOperationId_(
          data.date
        );

    } else {
      data.id =
        generateOperationId_(
          data.type,
          data.date
        );
    }

    /****************************************************
     * ЗМІНА СТАТУСУ ВАКЦИНИ
     ****************************************************/

    if (
      data.type === 'Вакцина' &&
      data.category ===
        'Зміна статусу'
    ) {
      data.amount =
        0;

      data.unitPrice =
        '';

      data.quantity =
        1;
    }

    /****************************************************
     * ЗНАК ВИТРАТИ
     ****************************************************/

    if (
      data.type === 'Витрати' ||
      data.type === 'Актив'
    ) {
      data.amount =
        -Math.abs(
          Number(
            data.amount
          ) || 0
        );
    }

    /****************************************************
     * ПЛАНУВАННЯ СКЛАДСЬКОГО ВИБУТТЯ
     ****************************************************/

    if (
      isInventoryIssue
    ) {
      try {
        inventoryIssuePlan =
          planInventoryIssue_(
            data
          );

        if (
          !inventoryIssuePlan ||
          inventoryIssuePlan.ok !==
            true ||
          inventoryIssuePlan
            .requiresIssue !==
            true
        ) {
          throw new Error(
            'План складського вибуття не сформовано'
          );
        }

        useInventoryIssue =
          true;

        const issueQuantity =
          Number(
            data.vaccineQty ||
            data.quantity
          ) || 1;

        data.inventoryTotalCost =
          Number(
            inventoryIssuePlan
              .totalCost
          ) || 0;

        data.inventoryUnitCost =
          issueQuantity > 0
            ? (
                data.inventoryTotalCost /
                issueQuantity
              )
            : 0;

        if (isVaccineSale) {
          data.vaccineTotalCost =
            data.inventoryTotalCost;

          data.vaccineCost =
            data.inventoryUnitCost;
        }

        const stockSheet =
          ss.getSheetByName(
            INVENTORY_ISSUE_CONFIG
              .stockSheetName
          );

        if (!stockSheet) {
          throw new Error(
            'Не знайдено лист складу'
          );
        }

        inventoryIssueSnapshot =
          snapshotInventoryIssueRows_(
            stockSheet,
            inventoryIssuePlan
              .allocations
          );

      } catch (inventoryError) {
        inventoryIssueFallbackReason =
          String(
            inventoryError &&
            inventoryError.message
              ? inventoryError.message
              : inventoryError
          );

        if (!isVaccineSale) {
          throw new Error(
            'Продаж запасу не проведено. ' +
            inventoryIssueFallbackReason
          );
        }

        const manualFallbackAllowed =
          typeof isAllowedManualVaccineFallbackError_ ===
            'function' &&
          isAllowedManualVaccineFallbackError_(
            inventoryError
          );

        if (
          !manualFallbackAllowed
        ) {
          throw new Error(
            'Автоматичне складське вибуття не виконано. ' +
            inventoryIssueFallbackReason
          );
        }

        useInventoryIssue =
          false;

        inventoryIssuePlan =
          null;

        inventoryIssueSnapshot =
          [];

        if (
          manualVaccineUnitCost <= 0
        ) {
          throw new Error(
            'Вакцину не знайдено на складі. ' +
            'Вкажіть собівартість одиниці вручну.'
          );
        }

        data.vaccineCost =
          manualVaccineUnitCost;

        data.vaccineTotalCost =
          manualVaccineUnitCost *
          (
            Number(
              data.vaccineQty ||
              data.quantity
            ) || 1
          );

        Logger.log(
          'Дозволений ручний режим вакцини без складського вибуття. Причина: ' +
          inventoryIssueFallbackReason
        );
      }
    }

    /****************************************************
     * КРОК 1 — БАЗА ОПЕРАЦІЙ
     ****************************************************/

    if (data.pendingNewClient) {
      createdNewClient =
        writePendingNewClient_(
          inputSheet,
          data.pendingNewClient
        );
    }

    assertOperationIdIsUnique_(
      data.id
    );

    writeToBaseOperations_(
      data
    );

    baseOperationWritten =
      true;

    /****************************************************
     * КРОК 2А — НАДХОДЖЕННЯ НА СКЛАД
     ****************************************************/

    if (
      isInventoryReceipt
    ) {
      const inventoryReceiptResult =
        writeInventoryReceipt_(
          data
        );

      inventoryReceiptWritten =
        true;

      const stockRow =
        Number(
          inventoryReceiptResult &&
          inventoryReceiptResult.stockRow
        ) || 0;

      if (stockRow < 2) {
        throw new Error(
          'Складське надходження створено, але не отримано номер нового рядка складу.'
        );
      }

      if (
        typeof refreshInterbranchActionValidationForRow_ !==
          'function'
      ) {
        throw new Error(
          'Не знайдено функцію refreshInterbranchActionValidationForRow_().'
        );
      }

      const actionValidationResult =
        refreshInterbranchActionValidationForRow_(
          ss,
          stockRow
        );

      const expectedAction =
        INTERBRANCH_TRANSFER_UI_CONFIG
          .actions
          .transfer;

      if (
        !actionValidationResult ||
        actionValidationResult
          .validationCreated !== true ||
        !Array.isArray(
          actionValidationResult
            .allowedActions
        ) ||
        actionValidationResult
          .allowedActions
          .indexOf(
            expectedAction
          ) === -1
      ) {
        throw new Error(
          'Для нової складської партії не вдалося створити дропдаун «Перемістити».'
        );
      }
    }

    /****************************************************
     * КРОК 2Б — ОБЛІК ВАКЦИН
     ****************************************************/

    if (
      isVaccineSale
    ) {
      writeToVaccineRegistry_(
        data
      );

      vaccineRegistryWritten =
        true;
    }

    /****************************************************
     * КРОК 2В — СКЛАДСЬКЕ ВИБУТТЯ
     ****************************************************/

    if (
      isInventoryIssue &&
      useInventoryIssue
    ) {
      if (
        isVaccineSale
      ) {
        inventoryIssueResult =
          completeVaccineInventoryIssue_(
            data
          );

      } else {
        const rawInventoryIssueResult =
          writeInventoryIssue_(
            data
          );

        inventoryIssueResult =
          buildInventoryIssueCompletionPayload_(
            rawInventoryIssueResult
          );
      }

      if (
        !inventoryIssueResult ||
        inventoryIssueResult.ok !==
          true ||
        inventoryIssueResult
          .requiresIssue !==
          true
      ) {
        throw new Error(
          'Складське вибуття не було підтверджено'
        );
      }

      inventoryIssueWritten =
        true;

      if (
        Array.isArray(
          inventoryIssueResult
            ._rollbackSnapshot
        ) &&
        inventoryIssueResult
          ._rollbackSnapshot
          .length
      ) {
        inventoryIssueSnapshot =
          inventoryIssueResult
            ._rollbackSnapshot;
      }

      data.inventoryTotalCost =
        Number(
          inventoryIssueResult
            .totalCost
        ) ||
        Number(
          data.inventoryTotalCost
        ) ||
        0;

      data.inventoryUnitCost =
        Number(
          inventoryIssueResult
            .averageUnitCost
        ) ||
        Number(
          data.inventoryUnitCost
        ) ||
        0;

      if (
        isVaccineSale
      ) {
        data.vaccineTotalCost =
          data.inventoryTotalCost;

        data.vaccineCost =
          data.inventoryUnitCost;
      }
    }

    /****************************************************
     * ЗМІНА СТАТУСУ ВАКЦИНИ
     ****************************************************/

    if (
      data.type === 'Вакцина' &&
      data.category ===
        'Зміна статусу'
    ) {
      updateVaccineStatusFromInput_(
        data
      );
    }

    /****************************************************
     * ПАКЕТИ
     ****************************************************/

    if (
      data.type === 'Пакет'
    ) {
      createPackageAccruals_(
        data
      );
    }

    /****************************************************
     * НАРАХУВАННЯ СОБІВАРТОСТІ ВАКЦИНИ
     ****************************************************/

    if (
      data.type === 'Вакцина' &&
      data.category ===
        'Продаж і використання'
    ) {
      createVaccineAccrual_(
        data,
        inventoryIssuePlan
      );
    }

    /****************************************************
     * АКТИВИ
     ****************************************************/

    if (isAsset) {
      createAsset_(
        data
      );

      SpreadsheetApp.flush();

      verifyAssetOperationWritten_(
        data
      );
    }

    updateClientTagsAfterOperation_(
      data
    );

    SpreadsheetApp.flush();

  } catch (error) {

    /*
     * Використовуємо той самий rollback,
     * який уже був у доменному ядрі.
     */
    const rollbackErrors =
      [];

    /****************************************************
     * ВІДКАТ ДОЧІРНІХ ВАКЦИННИХ ЗАПИСІВ
     ****************************************************/

    if (
      isVaccineSale &&
      data.id
    ) {
      try {
        rollbackVaccineAuxiliaryRecordsByOperationId_(
          data.id
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'облік вакцин / нарахування: ' +
          rollbackError.message
        );
      }
    }

    /****************************************************
     * ВІДКАТ СКЛАДСЬКОГО ВИБУТТЯ
     ****************************************************/

    if (
      inventoryIssueWritten &&
      data.id
    ) {
      try {
        rollbackInventoryIssue_(
          data.id,
          inventoryIssueSnapshot
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'вибуття складу: ' +
          rollbackError.message
        );
      }
    }

    /****************************************************
     * ВІДКАТ НАДХОДЖЕННЯ
     ****************************************************/

    if (
      inventoryReceiptWritten &&
      data.id
    ) {
      try {
        rollbackInventoryReceiptByOperationId_(
          data.id
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'надходження складу: ' +
          rollbackError.message
        );
      }
    }

    if (createdNewClient) {
      try {
        rollbackPendingNewClient_(
          inputSheet,
          createdNewClient
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'клієнтська база: ' +
          rollbackError.message
        );
      }
    }

    /****************************************************
     * ВІДКАТ БАЗИ ОПЕРАЦІЙ
     ****************************************************/

    if (
      baseOperationWritten &&
      data.id
    ) {
      try {
        rollbackBaseOperationById_(
          data.id
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'база операцій: ' +
          rollbackError.message
        );
      }
    }

    /****************************************************
     * ВІДКАТ АКТИВУ
     ****************************************************/

    if (
      isAsset &&
      data.id
    ) {
      try {
        rollbackAssetOperation_(
          data.id
        );

      } catch (rollbackError) {
        rollbackErrors.push(
          'актив: ' +
          rollbackError.message
        );
      }
    }

    SpreadsheetApp.flush();

    let errorMessage =
      '🔴 Помилка запису: ' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      );

    if (
      rollbackErrors.length
    ) {
      errorMessage +=
        ' / Увага: неповний відкат — ' +
        rollbackErrors.join(
          '; '
        );
    }

    /*
     * У WEB режимі ручну форму
     * та toast не чіпаємо.
     */
    if (!isWebMode) {
      showInputStatus_(
        errorMessage,
        'error'
      );

      SpreadsheetApp
        .getActive()
        .toast(
          errorMessage
        );
    }

    Logger.log(
      JSON.stringify(
        {
          operationId:
            data.id || '',

          originalError:
            error &&
            error.message
              ? error.message
              : String(error),

          isVaccineSale:
            isVaccineSale,

          isInventoryReceipt:
            isInventoryReceipt,

          isInventoryIssue:
            isInventoryIssue,

          useInventoryIssue:
            useInventoryIssue,

          inventoryIssueFallbackReason:
            inventoryIssueFallbackReason,

          baseOperationWritten:
            baseOperationWritten,

          inventoryReceiptWritten:
            inventoryReceiptWritten,

          vaccineRegistryWritten:
            vaccineRegistryWritten,

          inventoryIssueWritten:
            inventoryIssueWritten,

          inventoryIssueResult:
            inventoryIssueResult
              ? {
                  ok:
                    inventoryIssueResult.ok,

                  requiresIssue:
                    inventoryIssueResult
                      .requiresIssue,

                  inventoryType:
                    inventoryIssueResult
                      .inventoryType || '',

                  inventoryName:
                    inventoryIssueResult
                      .inventoryName || '',

                  operationId:
                    inventoryIssueResult
                      .operationId,

                  movementIds:
                    inventoryIssueResult
                      .movementIds || []
                }
              : null,

          rollbackErrors:
            rollbackErrors
        },
        null,
        2
      )
    );

    if (isWebMode) {
      return {
        ok: false,
        operationId:
          data.id || '',
        message:
          errorMessage,
        rollbackErrors:
          rollbackErrors
      };
    }

    return;

  } finally {
    if (lock) {
      try {
        lock.releaseLock();

      } catch (error) {
        Logger.log(
          'Не вдалося звільнити блокування: ' +
          error.message
        );
      }
    }
  }

  /****************************************************
   * ОПЕРАЦІЯ ПОВНІСТЮ ЗАВЕРШЕНА
   ****************************************************/

  /*
   * Ручний режим зберігає
   * попередню поведінку UI.
   *
   * WEB не змінює форму касира.
   */
  if (!isWebMode) {
    SpreadsheetApp
      .getActive()
      .toast(
        'Операцію проведено. ID: ' +
        data.id
      );

    showInputStatus_(
      '🟢 Операцію проведено. ID: ' +
      data.id,
      'success'
    );

    /****************************************************
     * ОЧИЩЕННЯ ФОРМИ
     ****************************************************/

    try {
      clearInputForm_();

    } catch (error) {
      Logger.log(
        'Операцію збережено, але форму не вдалося очистити: ' +
        error.message
      );

      SpreadsheetApp
        .getActive()
        .toast(
          'Операцію збережено, але форму потрібно очистити вручну.'
        );
    }
  }

  /****************************************************
   * ПОВІДОМЛЕННЯ АДМІНІСТРАТОРУ
   ****************************************************/

  if (
    !isWebMode &&
    inventoryIssueResult &&
    inventoryIssueResult
      .requiresIssue === true &&
    inventoryIssueResult
      .userMessage
  ) {
    try {
      SpreadsheetApp
        .getUi()
        .alert(
          'Склад медичних запасів',
          inventoryIssueResult
            .userMessage,
          SpreadsheetApp
            .getUi()
            .ButtonSet
            .OK
        );

    } catch (error) {
      Logger.log(
        'Не вдалося показати складське повідомлення: ' +
        error.message
      );

      SpreadsheetApp
        .getActive()
        .toast(
          inventoryIssueResult
            .userMessage,
          'Склад',
          10
        );
    }
  }

  return {
    ok:
      true,

    operationId:
      data.id,

    inventoryReceiptWritten:
      inventoryReceiptWritten,

    vaccineRegistryWritten:
      vaccineRegistryWritten,

    inventoryIssueWritten:
      inventoryIssueWritten,

    inventoryIssue:
      inventoryIssueResult
  };
}

function rollbackVaccineAuxiliaryRecordsByOperationId_(
  operationId
) {
  const id =
    clean_(operationId);

  if (!id) {
    return {
      registryRowsCleared: 0,
      accrualRowsCleared: 0
    };
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const registrySheet =
    ss.getSheetByName(
      'Облік вакцин'
    );

  const accrualSheet =
    ss.getSheetByName(
      ACCRUAL_SHEET_NAME
    );

  let registryRowsCleared = 0;
  let accrualRowsCleared = 0;

  /*
   * Облік вакцин:
   * ID продажу міститься у колонці B.
   */
  if (
    registrySheet &&
    registrySheet.getLastRow() >= 2
  ) {
    const values =
      registrySheet
        .getRange(
          2,
          2,
          registrySheet.getLastRow() - 1,
          1
        )
        .getDisplayValues()
        .flat();

    values.forEach(
      function(value, index) {
        if (clean_(value) === id) {
          registrySheet
            .getRange(
              index + 2,
              1,
              1,
              9
            )
            .clearContent();

          registryRowsCleared++;
        }
      }
    );
  }

  /*
   * Нарахування:
   * ID операції міститься у колонці A.
   */
  if (
    accrualSheet &&
    accrualSheet.getLastRow() >= 2
  ) {
    const values =
      accrualSheet
        .getRange(
          2,
          1,
          accrualSheet.getLastRow() - 1,
          1
        )
        .getDisplayValues()
        .flat();

    values.forEach(
      function(value, index) {
        if (clean_(value) === id) {
          accrualSheet
            .getRange(
              index + 2,
              1,
              1,
              Math.max(
                accrualSheet.getLastColumn(),
                8
              )
            )
            .clearContent();

          accrualRowsCleared++;
        }
      }
    );
  }

  return {
    registryRowsCleared:
      registryRowsCleared,

    accrualRowsCleared:
      accrualRowsCleared
  };
}

/****************************************************
 * ЗЧИТУВАННЯ ДАНИХ З ФОРМИ
 ****************************************************/

function getInputOperationData_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Ввід операцій"'
    );
  }

  const data = {
    date: sheet
      .getRange(INPUT.date)
      .getValue(),

    account: clean_(
      sheet
        .getRange(INPUT.account)
        .getDisplayValue()
    ),

    transferTo: clean_(
      sheet
        .getRange(INPUT.transferTo)
        .getDisplayValue()
    ),

    type: clean_(
      sheet
        .getRange(INPUT.type)
        .getDisplayValue()
    ),

    category: clean_(
      sheet
        .getRange(INPUT.category)
        .getDisplayValue()
    ),

    article: clean_(
      sheet
        .getRange(INPUT.article)
        .getDisplayValue()
    ),

    doctor: clean_(
      sheet
        .getRange(INPUT.doctor)
        .getDisplayValue()
    ),

      patient: clean_(
      sheet
        .getRange(INPUT.patient)
        .getDisplayValue()
    ),

    patientId: getPatientIdFromCellNote_(
  sheet.getRange(INPUT.patient)
 ),

    unitPrice: numOrBlank_(
      sheet
        .getRange(INPUT.unitPrice)
        .getValue()
    ),

    quantity: numOrBlank_(
      sheet
        .getRange(INPUT.quantity)
        .getValue()
    ),

    amount: numOrBlank_(
      sheet
        .getRange(INPUT.amount)
        .getValue()
    ),

    comment: clean_(
      sheet
        .getRange(INPUT.comment)
        .getDisplayValue()
    ),

    id: '',

    packageStart: sheet
      .getRange(INPUT.packageStart)
      .getValue(),

    packageDuration: numOrBlank_(
      sheet
        .getRange(INPUT.packageDuration)
        .getValue()
    ),

    packageMonthlyAmount: numOrBlank_(
      sheet
        .getRange(INPUT.packageMonthlyAmount)
        .getValue()
    ),

    packageAccrualStart: sheet
      .getRange(INPUT.packageAccrualStart)
      .getValue(),

    vaccineName: clean_(
      sheet
        .getRange(INPUT.vaccineName)
        .getDisplayValue()
    ),

    vaccinePatient: clean_(
      sheet
        .getRange(INPUT.vaccinePatient)
        .getDisplayValue()
    ),

    vaccineQty: numOrBlank_(
      sheet
        .getRange(INPUT.quantity)
        .getValue()
    ),

    vaccineCost: numOrBlank_(
      sheet
        .getRange(INPUT.vaccineCost)
        .getValue()
    ),

    vaccineSeries: clean_(
  sheet
    .getRange(INPUT.vaccineSeries)
    .getDisplayValue()
),

/*
 * Для негайного використання дата використання
 * дорівнює даті самої операції.
 *
 * Для продажу на зберігання фактичної дати
 * використання ще немає.
 */
   vaccineUseDate: '',

    storedVaccineId:
      clean_(
        sheet
          .getRange(INPUT.storedVaccine)
          .getNote()
      ) ||
      clean_(
        sheet
          .getRange(INPUT.storedVaccine)
          .getDisplayValue()
          .split('|')[0]
      ),

    assetName: clean_(
      sheet
        .getRange(INPUT.assetName)
        .getDisplayValue()
    ),

    assetCategory: clean_(
      sheet
        .getRange(INPUT.assetCategory)
        .getDisplayValue()
    ),

    assetAmortization: numOrBlank_(
      sheet
        .getRange(INPUT.assetAmortization)
        .getValue()
    ),

    assetStartDate: sheet
      .getRange(INPUT.assetStartDate)
      .getValue(),

    inventoryName: clean_(
      sheet
        .getRange(INPUT.inventoryName)
        .getDisplayValue()
    ),

    inventorySeries: clean_(
      sheet
        .getRange(INPUT.inventorySeries)
        .getDisplayValue()
    ),

    inventoryExpiryDate: sheet
      .getRange(INPUT.inventoryExpiryDate)
      .getValue(),

    inventorySupplier: clean_(
      sheet
        .getRange(INPUT.inventorySupplier)
        .getDisplayValue()
    )
  };
if (
  data.type === 'Вакцина' &&
  data.category ===
    'Продаж і використання'
) {
  data.vaccineUseDate =
    data.date;
}
  const inventoryType =
    getInventoryTypeFromOperation_(data);

  data.inventoryMinimumStock =
    inventoryType
      ? getDefaultInventoryMinimumStock_(
          inventoryType
        )
      : '';

  return data;
}


/****************************************************
 * ВАЛІДАЦІЯ
 ****************************************************/

// STATUS: PATCHABLE
// BUSINESS RULE VALIDATION
// Перевірка форми "Ввід операцій" перед проведенням.

function validateInputOperation_(data) {
  const errors = [];
  const warnings = [];

  /****************************************************
   * АКТИВИ — НОРМАЛІЗАЦІЯ ДО ЗАГАЛЬНОЇ ВАЛІДАЦІЇ
   ****************************************************/

  if (
    data &&
    data.type === 'Актив'
  ) {
    normalizeAssetInputData_(data);
  }

  /****************************************************
   * СЛУЖБОВІ ОЗНАКИ ОПЕРАЦІЇ
   ****************************************************/

  const isVaccineStatusChange =
    data.type === 'Вакцина' &&
    data.category === 'Зміна статусу';

  const isInventoryReceipt =
    typeof isInventoryReceiptOperation_ === 'function' &&
    isInventoryReceiptOperation_(data);

  const operationDoesNotRequireDoctorPatient =
    isVaccineStatusChange ||
    isInventoryReceipt;

  /****************************************************
   * ІНКАСАЦІЯ
   ****************************************************/

  if (data.type === 'Інкасація') {
    if (!data.transferTo) {
      errors.push(
        'Для інкасації потрібно обрати "На рахунок"'
      );
    }

    if (
      data.account &&
      data.transferTo &&
      data.account === data.transferTo
    ) {
      errors.push(
        'Для інкасації рахунок списання і рахунок зарахування не можуть бути однаковими'
      );
    }
  }

  /****************************************************
   * БАЗОВІ ОБОВ’ЯЗКОВІ ПОЛЯ
   ****************************************************/

  const dateIsValid =
    data.date instanceof Date &&
    !isNaN(data.date.getTime());

  if (!dateIsValid) {
    errors.push('Не заповнено коректну дату');
  }

  /*
   * Для зміни статусу вакцини руху коштів немає,
   * тому рахунок не потрібен.
   */
  if (
    !isVaccineStatusChange &&
    !data.account
  ) {
    errors.push('Не обрано рахунок');
  }

  if (!data.type) {
    errors.push('Не обрано тип операції');
  }

  if (!data.category) {
    errors.push('Не обрано категорію');
  }

  if (!data.article) {
    errors.push('Не обрано статтю');
  }
  const strictInputError =
    getStrictInputValidationError_(
      data
    );

  if (strictInputError) {
    errors.push(strictInputError);
  }
  /*
   * Для зміни статусу вакцини сума примусово дорівнює 0.
   * Для решти операцій сума обов’язкова.
   */
  if (!isVaccineStatusChange) {
    if (
      data.amount === '' ||
      data.amount === null ||
      data.amount === undefined ||
      Number(data.amount) === 0
    ) {
      errors.push('Не заповнено суму');
    }
  }
/*
 * Для звичайного доходу обов’язкові:
 * — ціна за одиницю;
 * — кількість.
 *
 * Для вакцин, пакетів і складських операцій
 * діють окремі правила.
 */
if (data.type === 'Доходи') {
  if (
    data.unitPrice === '' ||
    data.unitPrice === null ||
    data.unitPrice === undefined ||
    Number(data.unitPrice) <= 0
  ) {
    errors.push('Не введено ціну за одиницю');
  }

  if (
    data.quantity === '' ||
    data.quantity === null ||
    data.quantity === undefined ||
    Number(data.quantity) <= 0
  ) {
    errors.push('Не введено кількість');
  }
}
  /****************************************************
   * ЛІКАР І ПАЦІЄНТ
   ****************************************************/

  /*
   * Не потрібні для:
   * — закупівель на склад;
   * — зміни статусу вакцини.
   */
  if (!operationDoesNotRequireDoctorPatient) {
    if (!data.doctor) {
      warnings.push('Не вказано лікаря');
    }

  if (!data.patient) {
  if (data.type === 'Доходи') {
    errors.push(
      'Для операції «Доходи» оберіть пацієнта зі списку.'
    );
  } else {
    warnings.push('Не вказано пацієнта');
  }
}
  }
  if (data.patient && !data.patientId) {
    errors.push(
      'Не вдалося визначити ID клієнта. Оберіть клієнта зі списку повторно.'
    );
  }
  /****************************************************
   * BUSINESS RULE — ДОХОДИ / ЩЕПЛЕННЯ
   ****************************************************/

  if (
    data.type === 'Доходи' &&
    data.category === 'Щеплення'
  ) {
    errors.push(
      'Категорія "Щеплення" недоступна для Типу "Доходи". Використайте Тип операції "Вакцина".'
    );
  }

  /****************************************************
   * ПАКЕТИ
   ****************************************************/

  if (data.type === 'Пакет') {
    const packageStartIsValid =
      data.packageStart instanceof Date &&
      !isNaN(data.packageStart.getTime());

    const packageAccrualStartIsValid =
      data.packageAccrualStart instanceof Date &&
      !isNaN(
        data.packageAccrualStart.getTime()
      );

    const packageDuration =
      Number(data.packageDuration) || 0;

    const packageAmount =
      Number(data.amount) || 0;

    if (!packageStartIsValid) {
      errors.push(
        'Для пакета потрібна коректна дата старту'
      );
    }

    if (
      !Number.isInteger(packageDuration) ||
      packageDuration <= 0
    ) {
      errors.push(
        'Для пакета потрібна коректна тривалість у місяцях'
      );
    }

    if (
      !data.packageMonthlyAmount &&
      packageAmount > 0 &&
      packageDuration > 0
    ) {
      data.packageMonthlyAmount =
        packageAmount / packageDuration;
    }

    if (
      !Number(data.packageMonthlyAmount) ||
      Number(data.packageMonthlyAmount) <= 0
    ) {
      errors.push(
        'Для пакета потрібна коректна сума на місяць'
      );
    }

    if (!packageAccrualStartIsValid) {
      errors.push(
        'Для пакета потрібна коректна дата старту нарахування'
      );
    }

    if (
      packageStartIsValid &&
      packageAccrualStartIsValid &&
      data.packageAccrualStart <
        data.packageStart
    ) {
      warnings.push(
        'Дата старту нарахування раніше за дату старту пакета'
      );
    }

    if (
      packageAmount > 0 &&
      packageDuration > 0 &&
      Number(data.packageMonthlyAmount) > 0
    ) {
      const calculatedTotal =
        Number(data.packageMonthlyAmount) *
        packageDuration;

      const difference =
        Math.abs(
          calculatedTotal -
          packageAmount
        );

      if (difference > 0.01) {
        warnings.push(
          'Сума пакета не збігається з місячною сумою × тривалість'
        );
      }
    }
  }

  /****************************************************
   * СКЛАД — ЗАКУПІВЛЯ ЗАПАСІВ
   ****************************************************/

  if (isInventoryReceipt) {
    const inventoryType =
      getInventoryTypeFromOperation_(data);

    if (!inventoryType) {
      errors.push(
        'Не вдалося визначити тип складського запасу'
      );
    }

    if (!data.inventoryName) {
      errors.push(
        'Для закупівлі потрібно вказати найменування'
      );
    }

    const quantity =
      Number(data.quantity) || 0;

    const unitCost =
      Number(data.unitPrice) || 0;

    const totalAmount =
      Math.abs(
        Number(data.amount) || 0
      );

    if (quantity <= 0) {
      errors.push(
        'Кількість має бути більшою за нуль'
      );
    }

    if (unitCost <= 0) {
      errors.push(
        'Собівартість одиниці має бути більшою за нуль'
      );
    }

    if (totalAmount <= 0) {
      errors.push(
        'Загальна закупівельна вартість має бути більшою за нуль'
      );
    }

    if (
      quantity > 0 &&
      unitCost > 0 &&
      Math.abs(
        totalAmount -
        quantity * unitCost
      ) > 0.01
    ) {
      errors.push(
        'Сума не дорівнює кількості × собівартості одиниці'
      );
    }

    if (!data.inventorySupplier) {
      warnings.push(
        'Не вказано постачальника'
      );
    }

    const expiryDateIsValid =
      data.inventoryExpiryDate instanceof Date &&
      !isNaN(
        data.inventoryExpiryDate.getTime()
      );

    /*
     * Для вакцин і тестів термін придатності обов’язковий.
     * Для косметичного товару він може бути порожнім.
     */
    if (
      (
        inventoryType === 'Вакцина' ||
        inventoryType === 'Тест'
      ) &&
      !expiryDateIsValid
    ) {
      errors.push(
        'Для вакцин і тестів потрібно вказати коректний термін придатності'
      );
    }

    if (
      dateIsValid &&
      expiryDateIsValid &&
      data.inventoryExpiryDate <
        data.date
    ) {
      errors.push(
        'Термін придатності не може бути раніше дати надходження'
      );
    }

    /*
     * Серія для вакцин і тестів потрібна для
     * партійного обліку та списання FEFO.
     */
    if (
      (
        inventoryType === 'Вакцина' ||
        inventoryType === 'Тест'
      ) &&
      !data.inventorySeries
    ) {
      errors.push(
        'Для вакцин і тестів потрібно вказати серію або партію'
      );
    }
  }

  /****************************************************
   * ВАКЦИНИ — ПРОДАЖ І ВИКОРИСТАННЯ / ЗБЕРІГАННЯ
   ****************************************************/

  if (
    data.type === 'Вакцина' &&
    (
      data.category ===
        'Продаж і використання' ||
      data.category ===
        'Продаж на зберігання'
    )
  ) {
    if (!data.vaccineName) {
      errors.push(
        'Для вакцини потрібна назва'
      );
    }

    if (
      !Number(data.vaccineQty) ||
      Number(data.vaccineQty) <= 0
    ) {
      errors.push(
        'Для вакцини потрібна коректна кількість'
      );
    }

    if (
      !Number(data.vaccineCost) ||
      Number(data.vaccineCost) <= 0
    ) {
      errors.push(
        'Для вакцини потрібна коректна собівартість'
      );
    }
 /*
 * Серія визначається автоматично зі складу.
 *
 * Її відсутність не блокує історичний
 * ручний режим, але показує попередження.
 */
 if (!data.vaccineSeries) {
  warnings.push(
    'Серію не визначено автоматично. ' +
    'Перевірте наявність вакцини на складі або ручну собівартість.'
  );
 }
}

  /****************************************************
   * ВАКЦИНИ — ЗМІНА СТАТУСУ
   ****************************************************/

  if (isVaccineStatusChange) {
    const sheet =
      SpreadsheetApp
        .getActiveSpreadsheet()
        .getSheetByName(
          INPUT_SHEET_NAME
        );

    if (!sheet) {
      errors.push(
        'Не знайдено лист "Ввід операцій"'
      );
    } else {
      const selectedStoredVaccine =
        clean_(
          sheet
            .getRange(
              INPUT.storedVaccine
            )
            .getDisplayValue()
        );

      const selectedNewStatus =
        clean_(
          sheet
            .getRange(
              INPUT.newStatus
            )
            .getDisplayValue()
        );

      if (!selectedStoredVaccine) {
        errors.push(
          'Для зміни статусу потрібно обрати вакцину на зберіганні'
        );
      }

      if (!selectedNewStatus) {
        errors.push(
          'Для зміни статусу потрібно обрати новий статус'
        );
      }

      if (
        selectedNewStatus &&
        ![
          'Використано',
          'Списано'
        ].includes(
          selectedNewStatus
        )
      ) {
        errors.push(
          'Новий статус вакцини може бути лише "Використано" або "Списано"'
        );
      }

      const actualDate =
        sheet
          .getRange(
            INPUT.actualDate
          )
          .getValue();

      const actualDateIsValid =
        actualDate instanceof Date &&
        !isNaN(
          actualDate.getTime()
        );

      if (!actualDateIsValid) {
        errors.push(
          'Для зміни статусу потрібно вказати фактичну дату'
        );
      }
    }
  }

  /****************************************************
   * АКТИВИ
   ****************************************************/

  if (data.type === 'Актив') {
    const assetValidation =
      validateAssetInputData_(data);

    assetValidation.errors.forEach(
      function(message) {
        errors.push(message);
      }
    );

    assetValidation.warnings.forEach(
      function(message) {
        warnings.push(message);
      }
    );
  }

  /****************************************************
   * RESULT
   ****************************************************/

  if (errors.length) {
    return {
      ok: false,
      message:
        '🔴 ' +
        errors.join(' / '),
      errors: errors,
      warnings: warnings
    };
  }

  if (warnings.length) {
    return {
      ok: true,
      message:
        '🟡 ' +
        warnings.join(' / '),
      errors: [],
      warnings: warnings
    };
  }

  return {
    ok: true,
    message:
      '🟢 Готово до проведення',
    errors: [],
    warnings: []
  };
}


/****************************************************
 * ЗАПИС У "БАЗА ОПЕРАЦІЙ"
 ****************************************************/

function writeToBaseOperations_(data) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(BASE_SHEET_NAME);

  if (!sheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  /*
   * Фінальна структура має 33 колонки: A:AG.
   */
  const requiredColumns = 33;

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }

  /*
   * Завжди додаємо нову операцію в кінець бази.
   * Не шукаємо перший порожній рядок усередині історичних даних.
   */
  const idColumn = sheet
  .getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1)
  .getDisplayValues()
  .flat();

let lastDataRow = 1;

for (let i = idColumn.length - 1; i >= 0; i--) {
  if (clean_(idColumn[i])) {
    lastDataRow = i + 2;
    break;
  }
}

const targetRow = lastDataRow + 1;

  const createdAt = new Date();

  const createdDate = new Date(
    createdAt.getFullYear(),
    createdAt.getMonth(),
    createdAt.getDate()
  );

  const createdTime = new Date(
    1899,
    11,
    30,
    createdAt.getHours(),
    createdAt.getMinutes(),
    createdAt.getSeconds()
  );

  const rowData = [
    data.id,                    // A  ID
    data.account,               // B  Рахунок
    data.transferTo,            // C  На рахунок
    data.date,                  // D  Дата транзакції

    data.unitPrice,             // E  Ціна за одиницю
    data.quantity,              // F  Кількість
    data.amount,                // G  Сума

    data.doctor,                // H  Лікар
    data.patient,               // I  Пацієнт

    data.type,                  // J  Тип доходу / витрати
    data.category,              // K  Категорія
    data.article,               // L  Стаття
    data.comment,               // M  Коментар

    getMonthText_(data.date),   // N  Місяць оплати
    getMonthText_(data.date),   // O  Місяць нарахування
    data.type,                  // P  Тип обліку

    data.packageStart,          // Q  Дата старту пакету
    data.packageDuration,       // R  Тривалість пакету
    data.packageMonthlyAmount,  // S  Сума на місяць
    data.packageAccrualStart,   // T  Старт нарахування

    data.vaccineName,           // U  Назва вакцини
    data.vaccineQty,            // V  Кількість вакцин
    data.vaccineUseDate,        // W  Дата використання
    data.vaccineCost,           // X  Собівартість вакцини
    data.storedVaccineId || '', // Y  ID вакцини

    data.assetName,             // Z  Назва активу
    data.assetCategory,         // AA Категорія активу
    data.assetAmortization,     // AB Строк амортизації
    data.assetStartDate,        // AC Дата введення в експлуатацію

    'Проведено',                // AD Статус запису
    createdDate,                // AE Дата створення
    createdTime,                // AF Час створення
    getSafeUserEmail_()         // AG Створив користувач
  ];

  sheet
    .getRange(targetRow, 1, 1, rowData.length)
    .setValues([rowData]);
  const patientId = clean_(data.patientId);

  if (patientId) {
    sheet
      .getRange(targetRow, 9)
      .setNote('CLIENT_ID: ' + patientId);
  } else {
    sheet
      .getRange(targetRow, 9)
      .clearNote();
  }
  sheet.getRange(targetRow, 4).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(targetRow, 23).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(targetRow, 29).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(targetRow, 31).setNumberFormat('dd.MM.yyyy');
  sheet.getRange(targetRow, 32).setNumberFormat('HH:mm:ss');
}
/**
 * Видаляє запис із "База операцій"
 * за ID операції.
 *
 * Фізично рядок не видаляється:
 * очищається A:AG, щоб не ламати структуру,
 * формати та історичні діапазони.
 *
 * @param {string} operationId
 * @return {Object}
 */
function rollbackBaseOperationById_(
  operationId
) {
  const normalizedOperationId =
    String(operationId || '').trim();

  if (!normalizedOperationId) {
    throw new Error(
      'Не передано ID для відкату Бази операцій'
    );
  }

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        BASE_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "База операцій"'
    );
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return {
      operationId:
        normalizedOperationId,

      rowsCleared:
        0
    };
  }

  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  const rowsToClear = [];

  ids.forEach(
    function(value, index) {
      if (
        clean_(value) ===
        normalizedOperationId
      ) {
        rowsToClear.push(
          index + 2
        );
      }
    }
  );

  rowsToClear.forEach(
    function(row) {
      sheet
        .getRange(
          row,
          1,
          1,
          33
        )
        .clearContent();
    }
  );

  SpreadsheetApp.flush();

  const stillExists =
    sheet
      .getRange(
        2,
        1,
        Math.max(
          sheet.getLastRow() - 1,
          1
        ),
        1
      )
      .getDisplayValues()
      .flat()
      .some(function(value) {
        return (
          clean_(value) ===
          normalizedOperationId
        );
      });

  if (stillExists) {
    throw new Error(
      'Не вдалося видалити операцію "' +
      normalizedOperationId +
      '" із Бази операцій'
    );
  }

  return {
    operationId:
      normalizedOperationId,

    rowsCleared:
      rowsToClear.length
  };
}
function repairBaseOperationsTechnicalColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('База операцій');

  if (!sheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  const requiredColumns = 33; // A:AG

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }

  const headers = [
    'Назва вакцини',
    'Кількість вакцин',
    'Дата використання',
    'Собівартість вакцини',
    'ID вакцини',
    'Назва активу',
    'Категорія активу',
    'Строк амортизації, років',
    'Дата введення в експлуатацію',
    'Статус запису',
    'Дата створення',
    'Час створення',
    'Створив користувач'
  ];

  sheet
    .getRange(1, 21, 1, headers.length)
    .setValues([headers]);

  /*
   * Визначаємо останній фактичний рядок за колонкою A,
   * а не через getLastRow(), бо внизу є форматовані порожні рядки.
   */
  const physicalLastRow = sheet.getLastRow();

  if (physicalLastRow < 2) return;

  const idValues = sheet
    .getRange(2, 1, physicalLastRow - 1, 1)
    .getDisplayValues()
    .flat();

  let lastDataRow = 1;

  for (let i = idValues.length - 1; i >= 0; i--) {
    if (clean_(idValues[i])) {
      lastDataRow = i + 2;
      break;
    }
  }

  if (lastDataRow < 2) {
    SpreadsheetApp.getActive().toast('У базі немає записів');
    return;
  }

  const rowCount = lastDataRow - 1;

  /*
   * Читаємо всю фактичну базу одним запитом.
   */
  const data = sheet
    .getRange(2, 1, rowCount, requiredColumns)
    .getValues();

  const statusValues = new Set([
    'Проведено',
    'Імпортовано',
    'Чернетка',
    'Скасовано',
    'Видалено'
  ]);

  let repairedRows = 0;

  const repairedData = data.map(row => {
    const type = clean_(row[9]);     // J
    const article = clean_(row[11]); // L

    const oldZ = row[25];  // Z
    const oldAA = row[26]; // AA
    const oldAB = row[27]; // AB
    const oldAC = row[28]; // AC
    const oldAD = row[29]; // AD
    const oldAE = row[30]; // AE
    const oldAF = row[31]; // AF
    const oldAG = row[32]; // AG

    /*
     * Старе зміщення:
     * AC = статус
     * AD = дата й час
     * AE = email
     */
    if (statusValues.has(clean_(oldAC))) {
      if (type === 'Актив') {
        row[25] = article; // Z Назва активу
        row[26] = oldZ;    // AA Категорія
        row[27] = oldAA;   // AB Строк
        row[28] = oldAB;   // AC Дата введення
      } else {
        row[25] = '';
        row[26] = '';
        row[27] = '';
        row[28] = '';
      }

      const timestamp =
        oldAD instanceof Date && !isNaN(oldAD)
          ? oldAD
          : null;

      row[29] = oldAC; // AD Статус

      if (timestamp) {
        row[30] = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate()
        );

        const hasTime =
          timestamp.getHours() !== 0 ||
          timestamp.getMinutes() !== 0 ||
          timestamp.getSeconds() !== 0;

        row[31] = hasTime
          ? new Date(
              1899,
              11,
              30,
              timestamp.getHours(),
              timestamp.getMinutes(),
              timestamp.getSeconds()
            )
          : '';
      } else {
        row[30] = '';
        row[31] = '';
      }

      row[32] =
        looksLikeEmail_(oldAE)
          ? oldAE
          : looksLikeEmail_(oldAF)
            ? oldAF
            : oldAG;

      repairedRows++;
      return row;
    }

    /*
     * Уже частково виправлений запис:
     * AD = статус, AE = дата й час, AF = email.
     */
    if (statusValues.has(clean_(oldAD))) {
      if (oldAE instanceof Date && !isNaN(oldAE)) {
        const timestamp = oldAE;

        row[30] = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate()
        );

        const hasTime =
          timestamp.getHours() !== 0 ||
          timestamp.getMinutes() !== 0 ||
          timestamp.getSeconds() !== 0;

        if (!oldAF || looksLikeEmail_(oldAF)) {
          row[31] = hasTime
            ? new Date(
                1899,
                11,
                30,
                timestamp.getHours(),
                timestamp.getMinutes(),
                timestamp.getSeconds()
              )
            : '';
        }
      }

      if (!oldAG && looksLikeEmail_(oldAF)) {
        row[32] = oldAF;
        row[31] = '';
      }
    }

    return row;
  });

  /*
   * Записуємо всю базу одним пакетним запитом.
   */
  sheet
    .getRange(2, 1, repairedData.length, requiredColumns)
    .setValues(repairedData);

  sheet
    .getRange(2, 29, rowCount, 1)
    .setNumberFormat('dd.MM.yyyy');

  sheet
    .getRange(2, 31, rowCount, 1)
    .setNumberFormat('dd.MM.yyyy');

  sheet
    .getRange(2, 32, rowCount, 1)
    .setNumberFormat('HH:mm:ss');

  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    'Базу виправлено. Оновлено рядків: ' + repairedRows
  );

  Logger.log(
    'Виправлення завершено. Оновлено рядків: ' +
    repairedRows
  );
}


function looksLikeEmail_(value) {
  const text = clean_(value);

  return Boolean(
    text &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
  );
}

// STATUS: PATCHABLE
// SAFETY HELPER
// Безпечно отримує email користувача.
// Якщо Google блокує Session.getActiveUser() при запуску з кнопки,
// повертає порожній рядок і не зупиняє проведення операції.
function getSafeUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}
/****************************************************
 * АКТИВИ
 ****************************************************/

/****************************************************
 * ЗАПИС НОВОГО АКТИВУ
 *
 * У листі "Активи" суми завжди додатні.
 ****************************************************/

function createAsset_(data) {
  assertAssetInputStep2Ready_();

  normalizeAssetInputData_(data);

  const validation =
    validateAssetInputData_(data);

  if (validation.errors.length) {
    throw new Error(
      'Актив не пройшов перевірку: ' +
      validation.errors.join('; ')
    );
  }

  if (!data.id) {
    throw new Error(
      'Не визначено ID операції активу.'
    );
  }

  if (
    assetOperationIdExists_(
      data.id
    )
  ) {
    throw new Error(
      'Актив з ID "' +
      data.id +
      '" уже існує.'
    );
  }

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        ASSETS_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  const quantity =
    assetInputNumber_(
      data.quantity
    );

  const unitPrice =
    Math.abs(
      assetInputNumber_(
        data.unitPrice
      )
    );

  const total =
    Math.abs(
      assetInputNumber_(
        data.amount
      )
    );

  const targetRow =
    findNextFreeAssetRow_(sheet);

  const rowData = [
    data.assetName,          // A Назва
    data.assetCategory,      // B Категорія
    quantity,                // C Кількість
    unitPrice,               // D Ціна одиниці
    total,                   // E Первісна вартість
    data.assetAmortization,  // F Строк, років
    data.assetStartDate,     // G Дата введення
    '',                      // H Джерело фінансування
    '',                      // I Філія
    data.id,                 // J ID операції
    'Активний',              // K Статус
    ''                       // L Дата вибуття
  ];

  sheet
    .getRange(
      targetRow,
      1,
      1,
      rowData.length
    )
    .setValues([rowData]);

  sheet
    .getRange(targetRow, 3)
    .setNumberFormat('0');

  sheet
    .getRange(targetRow, 4, 1, 2)
    .setNumberFormat('#,##0.00');

  sheet
    .getRange(targetRow, 6)
    .setNumberFormat('0');

  sheet
    .getRange(targetRow, 7)
    .setNumberFormat('dd.MM.yyyy');

  sheet
    .getRange(targetRow, 12)
    .setNumberFormat('dd.MM.yyyy');

  const statusRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        ASSET_MODULE_CONFIG.statuses.slice(),
        true
      )
      .setAllowInvalid(false)
      .build();

  sheet
    .getRange(targetRow, 11)
    .setDataValidation(statusRule);

  return {
    id: data.id,
    row: targetRow,
    total: total
  };
}


/****************************************************
 * НАРАХУВАННЯ ПАКЕТУ
 ****************************************************/

function createPackageAccruals_(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCRUAL_SHEET_NAME);
  if (!sheet) return;

  for (let i = 0; i < data.packageDuration; i++) {
    sheet.appendRow([
      data.id,
      'Пакет',
      addMonths_(data.packageAccrualStart || data.packageStart, i),
      data.category,
      data.article,
      data.packageMonthlyAmount,
      data.patient,
      'Нарахування доходу пакету'
    ]);
  }
}


/****************************************************
 * НАРАХУВАННЯ ВАКЦИНИ
 ****************************************************/

function createVaccineAccrual_(
  data,
  inventoryIssuePlan
) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        ACCRUAL_SHEET_NAME
      );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Нарахування"'
    );
  }
  const operationUser =
  getSafeUserEmail_() ||
  Session.getEffectiveUser().getEmail() ||
  'Не визначено';

const operationDateTime = new Date();

  const quantity =
    Number(
      data.vaccineQty ||
      data.quantity
    ) || 1;

  let totalCost = 0;
  let sourceComment = '';

  if (
    inventoryIssuePlan &&
    Number(
      inventoryIssuePlan.totalCost
    ) > 0
  ) {
    totalCost =
      Number(
        inventoryIssuePlan.totalCost
      );

    sourceComment =
      'Списання фактичної FEFO-собівартості вакцини';

  } else {
    totalCost =
      Number(
        data.vaccineCost
      ) * quantity;

    sourceComment =
      'Списання ручної собівартості вакцини';
  }

  if (
    !Number.isFinite(totalCost) ||
    totalCost <= 0
  ) {
    throw new Error(
      'Не визначено собівартість для нарахування вакцини'
    );
  }

  sheet.appendRow([
    data.id,
    'Вакцина',
    data.vaccineUseDate,
    data.category,
    data.article,
    -Math.abs(totalCost),
    data.patient,
    sourceComment,
     operationUser,       // I — хто провів
     operationDateTime    // J — дата і час
  ]);

  return {
    operationId: data.id,
    quantity: quantity,
    totalCost: totalCost,
    source:
      inventoryIssuePlan
        ? 'FEFO'
        : 'manual'
  };
}
// STATUS: PATCHABLE
// SINGLE SOURCE OF TRUTH
// Єдиний список рахунків для B5 і B15.
function getAccountList_() {
  return [
    'Каса, грн',
    'Рахунок А-Банк, грн',
    'Рахунок Моно, грн',
    'Сейф'
  ];
}
// STATUS: PATCHABLE
// Ставить dropdown рахунків тільки для поля "На рахунок" B15.
// Не чіпає всю форму, щоб не ламати лікарів / категорії / статті.
// STATUS: PATCHABLE
// Ставить dropdown рахунків тільки для поля "На рахунок" B15.
// ВАЖЛИВО: allowInvalid(true), щоб Google Sheets не блокував вибір
// через приховані пробіли/символи. Коректність перевіряє validateInputOperation_().
function applyTransferToValidation_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const accountRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(getAccountList_(), true)
    .setAllowInvalid(true)
    .build();

  sheet.getRange(INPUT.transferTo)
    .clearDataValidations()
    .setDataValidation(accountRule);
}
/****************************************************
 * НАЛАШТУВАННЯ ФОРМИ
 ****************************************************/

function setupInputOperationForm() {
  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const dictSheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!sheet || !dictSheet) {
    SpreadsheetApp
      .getActive()
      .toast(
        'Не знайдено лист "Ввід операцій" або "Довідник"'
      );

    return;
  }

  /****************************************************
   * ДАТА ОПЕРАЦІЇ
   ****************************************************/

  sheet
    .getRange(
      INPUT.date
    )
    .setNumberFormat(
      'dd.MM.yyyy'
    )
    .setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireDate()
        .setAllowInvalid(false)
        .build()
    );

  /****************************************************
   * НОВИЙ СТАТУС ВАКЦИНИ
   ****************************************************/

  sheet
    .getRange(
      INPUT.newStatus
    )
    .clearDataValidations()
    .setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          [
            'Використано',
            'Списано'
          ],
          true
        )
        .setAllowInvalid(false)
        .build()
    );

  /****************************************************
   * РАХУНОК
   ****************************************************/

  const accountRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        getAccountList_(),
        true
      )
      .setAllowInvalid(false)
      .build();

  sheet
    .getRange(
      INPUT.account
    )
    .clearDataValidations()
    .setDataValidation(
      accountRule
    );

  /*
   * Інкасація:
   * B5 — з рахунку;
   * B15 — на рахунок.
   */
  applyTransferToValidation_();

  /****************************************************
   * ТИП ОПЕРАЦІЇ
   ****************************************************/

  const typeRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        [
          'Доходи',
          'Витрати',
          'Інкасація',
          'Фінансова діяльність',
          'Актив',
          'Вакцина',
          'Пакет'
        ],
        true
      )
     .setAllowInvalid(false)
      .build();

  sheet
    .getRange(
      INPUT.type
    )
    .clearDataValidations()
    .setDataValidation(
      typeRule
    );

  /****************************************************
   * ЛІКАРІ
   *
   * Окрема функція бере лише суцільний
   * список лікарів із Довідник!F9:F
   * до першої порожньої клітинки.
   ****************************************************/

  setupDoctorDropdown_();

  /****************************************************
   * ГРОШОВІ ФОРМАТИ
   ****************************************************/

  [
    INPUT.unitPrice,
    INPUT.amount,
    INPUT.packageMonthlyAmount,
    INPUT.vaccineCost
  ].forEach(
    function(cell) {
      if (!cell) return;

      sheet
        .getRange(cell)
        .setNumberFormat(
          '#,##0.00'
        );
    }
  );

  /****************************************************
   * ФОРМАТ КІЛЬКОСТІ
   ****************************************************/

  if (INPUT.quantity) {
    sheet
      .getRange(
        INPUT.quantity
      )
      .setNumberFormat(
        '#,##0.00'
      );
  }

  /****************************************************
  /****************************************************
 * ПОЛЯ ДАТ
 ****************************************************/

[
  INPUT.packageStart,
  INPUT.assetStartDate,
  INPUT.actualDate,
  INPUT.inventoryExpiryDate
].forEach(function(cell) {
  if (!cell) return;

  sheet
    .getRange(cell)
    .setNumberFormat(
      'dd.MM.yyyy'
    )
    .setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireDate()
        .setAllowInvalid(false)
        .build()
    );
});

/*
 * Серія вакцини — інформаційне текстове поле.
 */
sheet
  .getRange(
    INPUT.vaccineSeries
  )
  .clearDataValidations()
  .setNumberFormat('@')
  .setNote(
    'Серія визначається автоматично за FEFO'
  );
  /****************************************************
   * ЗАЛЕЖНІ DROPDOWN
   ****************************************************/

  updateInputDependentDropdowns();

  /****************************************************
   * ВИДИМІСТЬ ДИНАМІЧНИХ БЛОКІВ
   ****************************************************/

  updateInputBlocksView_();

  /****************************************************
   * ВІДНОВЛЕННЯ ФОРМАТУВАННЯ
   ****************************************************/

  restoreInputFormats_();

  showInputStatus_(
    '🟢 Форму налаштовано',
    'success'
  );
}
/****************************************************
 * ЗАЛЕЖНІ DROPDOWN
 ****************************************************/

/****************************************************
 * ЗАЛЕЖНІ DROPDOWN
 ****************************************************/

function updateInputDependentDropdowns() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(INPUT_SHEET_NAME);

  const dictSheet =
    ss.getSheetByName(DICT_SHEET_NAME);

  if (!sheet || !dictSheet) return;

  const type = clean_(
    sheet
      .getRange(INPUT.type)
      .getDisplayValue()
  );

  const category = clean_(
    sheet
      .getRange(INPUT.category)
      .getDisplayValue()
  );

  const categoryCell =
    sheet.getRange(INPUT.category);

  const articleCell =
    sheet.getRange(INPUT.article);

  const vaccineNameCell =
    sheet.getRange(INPUT.vaccineName);

  let categories = [];
  let articles = [];

  /****************************************************
   * ДОХОДИ
   ****************************************************/

  if (type === 'Доходи') {
    categories =
      getInputIncomeCategories_(dictSheet)
        .map(function(value) {
          return clean_(value);
        })
        .filter(function(value) {
          return (
            value &&
            value !== 'Щеплення'
          );
        });
  }

  /****************************************************
   * ВИТРАТИ
   ****************************************************/

  if (type === 'Витрати') {
    categories =
      getExpenseCategories_(dictSheet)
        .map(function(value) {
          return clean_(value);
        })
        .filter(function(normalized) {
          if (!normalized) {
            return false;
          }
        if (normalized === 'Косметичні засоби') {
        return false;
        }
          if (normalized === 'Активи') {
            return false;
          }

          if (
            /^\d{4}-\d{2}-\d{2}$/.test(
              normalized
            )
          ) {
            return false;
          }

          return true;
        });
  }

  /****************************************************
   * ФІНАНСОВА ДІЯЛЬНІСТЬ
   ****************************************************/

  if (
    type === 'Фінансова діяльність'
  ) {
    categories = [
      'Отримання позики',
      'Інша фінансова допомога',
      'Продаж основних засобів',
      'Внесок власника'
    ];
  }

  /****************************************************
   * ІНКАСАЦІЯ
   ****************************************************/

  if (type === 'Інкасація') {
    categories = [
      'Внутрішній трансфер'
    ];
  }

  /****************************************************
   * ПАКЕТИ
   ****************************************************/

  if (type === 'Пакет') {
    categories = [
      '6 місяців',
      '12 місяців'
    ];
  }

  /****************************************************
   * ВАКЦИНИ
   ****************************************************/

  if (type === 'Вакцина') {
    categories = [
      'Продаж і використання',
      'Продаж на зберігання',
      'Зміна статусу'
    ];
  }

  /****************************************************
   * АКТИВИ
   ****************************************************/

  if (type === 'Актив') {
    categories =
      getAssetCategories_(ss);
  }

  /****************************************************
   * DROPDOWN КАТЕГОРІЙ
   ****************************************************/

  categoryCell.clearDataValidations();

  if (categories.length) {
    categoryCell.setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          unique_(categories),
          true
        )
       .setAllowInvalid(false)
        .build()
    );
  }

  /****************************************************
   * СТАТТІ
   ****************************************************/

  if (
    category &&
    type !== 'Вакцина'
  ) {
    if (type === 'Доходи') {
      articles =
        getIncomeArticles_(
          dictSheet,
          category
        );
    }

    if (type === 'Витрати') {
      articles =
        getExpenseArticles_(
          dictSheet,
          category
        );
    }

    if (
      type === 'Фінансова діяльність'
    ) {
      articles = [
        category
      ];
    }

    if (type === 'Інкасація') {
      articles = [
        'Внутрішній трансфер'
      ];
    }

    if (type === 'Пакет') {
      articles = [
        'Пакет послуг'
      ];
    }

    if (type === 'Актив') {
      articles =
        getAssetNames_(
          ss,
          category
        );
    }
  }

  /****************************************************
   * ВАКЦИННІ СТАТТІ
   ****************************************************/

  if (
    type === 'Вакцина' &&
    (
      category ===
        'Продаж і використання' ||
      category ===
        'Продаж на зберігання'
    )
  ) {
    articles =
      getVaccineNamesFromRegistry_();
  }

  if (
    type === 'Вакцина' &&
    category === 'Зміна статусу'
  ) {
    articles = [
      'Використано',
      'Списано'
    ];
  }

  /****************************************************
   * DROPDOWN СТАТЕЙ
   ****************************************************/

  articleCell.clearDataValidations();

  if (articles.length) {
    articleCell.setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          unique_(
            articles
              .map(function(value) {
                return clean_(value);
              })
              .filter(Boolean)
          ),
          true
        )
        .setAllowInvalid(
          type === 'Актив'
        )
        .build()
    );
  }

  /****************************************************
   * DROPDOWN НАЗВИ ВАКЦИНИ
   ****************************************************/

  vaccineNameCell.clearDataValidations();

  if (
    type === 'Вакцина' &&
    (
      category ===
        'Продаж і використання' ||
      category ===
        'Продаж на зберігання'
    ) &&
    articles.length
  ) {
    vaccineNameCell.setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          unique_(
            articles
              .map(function(value) {
                return clean_(value);
              })
              .filter(Boolean)
          ),
          true
        )
        .setAllowInvalid(false)
        .build()
    );
  }

  /****************************************************
   * АВТОПІДСТАНОВКА ОДНОЗНАЧНИХ СТАТЕЙ
   ****************************************************/

  if (
    articles.length === 1 &&
    type !== 'Актив'
  ) {
    articleCell.setValue(
      articles[0]
    );
  }

  /****************************************************
   * СИНХРОНІЗАЦІЯ АКТИВУ
   ****************************************************/

  if (
    type === 'Актив' &&
    typeof syncAssetFieldsFromMain_ ===
      'function'
  ) {
    syncAssetFieldsFromMain_();
  }
    /****************************************************
   * DROPDOWN СКЛАДСЬКОГО НАЙМЕНУВАННЯ
   ****************************************************/

    applyInventoryNameValidation_();

  enforceStrictInputSelectors_();
}
  /****************************************************
 * DROPDOWN НАЙМЕНУВАННЯ СКЛАДСЬКОГО ЗАПАСУ
 *
 * Закупка вакцин:
 * — показує список назв вакцин.
 *
 * Інші складські закупівлі:
 * — поки залишає ручне введення.
 ****************************************************/

/****************************************************
 * DROPDOWN НАЙМЕНУВАННЯ СКЛАДСЬКОГО ЗАПАСУ
 *
 * Для "Закупка вакцин":
 * — бере назви вакцин із Довідника;
 * — дозволяє обрати зі списку;
 * — дозволяє вручну ввести нову назву.
 ****************************************************/

/****************************************************
 * DROPDOWN НАЙМЕНУВАННЯ ДЛЯ ЗАКУПКИ ВАКЦИН
 *
 * Джерела:
 * 1. Довідник;
 * 2. Облік вакцин;
 * 3. Склад медичних запасів.
 *
 * Нову назву дозволено вводити вручну.
 ****************************************************/

/****************************************************
 * DROPDOWN НАЙМЕНУВАННЯ СКЛАДСЬКОГО ЗАПАСУ
 *
 * Закупка вакцин:
 * — назви вакцин із чинного реєстру назв.
 *
 * Закупка тестів:
 * — статті доходу категорії "Швидкі тести".
 *
 * Закупка косметичних товарів:
 * — статті доходу категорії "Косметичні засоби".
 ****************************************************/
function applyInventoryNameValidation_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const dictSheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INPUT_SHEET_NAME +
      '"'
    );
  }

  if (!dictSheet) {
    throw new Error(
      'Не знайдено лист "' +
      DICT_SHEET_NAME +
      '"'
    );
  }

  const type =
    clean_(
      inputSheet
        .getRange(INPUT.type)
        .getDisplayValue()
    );

  const category =
    clean_(
      inputSheet
        .getRange(INPUT.category)
        .getDisplayValue()
    );

  const article =
    clean_(
      inputSheet
        .getRange(INPUT.article)
        .getDisplayValue()
    );

  const targetCell =
    inputSheet.getRange(
      INPUT.inventoryName
    );

  /*
   * При кожній зміні прибираємо
   * попередню валідацію і примітку.
   */
  targetCell
    .clearDataValidations()
    .clearNote();

  const isInventoryReceipt =
    type === 'Витрати' &&
    category === 'Медичні витрати' &&
    [
      'Закупка вакцин',
      'Закупка тестів',
      'Закупка косметичних товарів'
    ].includes(article);

  if (!isInventoryReceipt) {
    return {
      ok: true,
      applied: false,
      namesCount: 0,
      reason:
        'Не обрано складську закупівлю'
    };
  }

  const names =
    getInventoryReceiptNameList_(
      article,
      dictSheet
    );

  if (!names.length) {
    targetCell.setNote(
      'Для вибраної складської статті не знайдено найменувань у Довіднику.'
    );

    return {
      ok: false,
      applied: false,
      namesCount: 0,
      article: article,
      reason:
        'Не знайдено найменувань'
    };
  }

  const validation =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        names,
        true
      )
      /*
       * Дозволяємо ввести нову назву,
       * якої ще немає у Довіднику.
       */
      .setAllowInvalid(false)
      .setHelpText(
  'Оберіть нормативну назву вакцини з Довідника'
  )
      .build();
 targetCell
  .setDataValidation(
    validation
  )
  .setNote(
    'Єдине джерело назв: Довідник. Доступно найменувань: ' +
    names.length
  );
  SpreadsheetApp.flush();

  return {
    ok: true,
    applied: true,
    article: article,
    namesCount:
      names.length,
    names: names  
  };
}
/****************************************************
 * СПИСОК НАЙМЕНУВАНЬ ДЛЯ НАДХОДЖЕННЯ
 ****************************************************/
function getInventoryReceiptNameList_(
  purchaseArticle,
  dictSheet
) {
  const article =
    clean_(
      purchaseArticle
    );

  let names = [];

  /****************************************************
   * ВАКЦИНИ
   ****************************************************/

  if (
    article ===
    'Закупка вакцин'
  ) {
    names =
      getInventoryVaccineNameList_();
  }

  /****************************************************
   * ШВИДКІ ТЕСТИ
   *
   * У Довіднику вони вже є як статті
   * категорії доходу "Швидкі тести".
   ****************************************************/

  if (
    article ===
    'Закупка тестів'
  ) {
    names =
      getIncomeArticles_(
        dictSheet,
        'Швидкі тести'
      );
  }

  /****************************************************
   * КОСМЕТИЧНІ ЗАСОБИ
   *
   * Беремо статті категорії доходу
   * "Косметичні засоби".
   ****************************************************/

  if (
    article ===
    'Закупка косметичних товарів'
  ) {
    names =
      getIncomeArticles_(
        dictSheet,
        'Косметичні засоби'
      );
  }

  return unique_(
    names
      .map(function(value) {
        return clean_(value);
      })
      .filter(function(value) {
        return Boolean(value);
      })
      .sort(function(a, b) {
        return a.localeCompare(
          b,
          'uk'
        );
      })
  );
}
/****************************************************
 * ЄДИНИЙ КОНТРОЛЬОВАНИЙ СПИСОК НАЗВ ВАКЦИН
 *
 * Єдине джерело правди:
 * Довідник!C:E
 *
 * C — категорія;
 * D — код;
 * E — нормативна назва вакцини.
 *
 * Склад медичних запасів та Облік вакцин
 * є історичними реєстрами й НЕ формують dropdown.
 ****************************************************/
function getInventoryVaccineNameList_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dictSheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!dictSheet) {
    throw new Error(
      'Не знайдено лист "' +
      DICT_SHEET_NAME +
      '"'
    );
  }

  const lastRow =
    dictSheet.getLastRow();

  if (lastRow < 1) {
    return [];
  }

  const values =
    dictSheet
      .getRange(
        1,
        3,
        lastRow,
        3
      )
      .getDisplayValues();

  const excluded = [
    'Використано',
    'Списано',
    'На зберіганні',
    'Зміна статусу',
    'Послуги медсестри при вакцинації (власна вакцина)'
  ];

  const names = [];

  values.forEach(function(row) {
    const category =
      clean_(row[0]);

    const code =
      clean_(row[1]);

    const name =
      clean_(row[2]);

    if (!name) {
      return;
    }

    const normalizedCategory =
      category.toLowerCase();

    const normalizedCode =
      code.toLowerCase();

    const belongsToVaccineDirectory =
      normalizedCategory.includes(
        'щеплен'
      ) ||
      normalizedCategory.includes(
        'вакцин'
      ) ||
      normalizedCode.includes(
        'вакцин'
      );

    if (
      belongsToVaccineDirectory &&
      !excluded.includes(name)
    ) {
      names.push(name);
    }
  });

  return unique_(
    names
      .map(function(value) {
        return clean_(value);
      })
      .filter(Boolean)
      .sort(function(a, b) {
        return a.localeCompare(
          b,
          'uk'
        );
      })
  );
}
function testInventoryReceiptDropdown_() {
  const result =
    applyInventoryNameValidation_();

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
      result.applied
        ? (
            'Dropdown створено. Найменувань: ' +
            result.namesCount
          )
        : (
            'Dropdown не створено: ' +
            result.reason
          ),
      'Складська закупівля',
      8
    );

  return result;
}
// STATUS: PATCHABLE
// SAFETY HELPER
// Перевіряє, чи редагування зачепило конкретну клітинку.
// Потрібно, бо Google Sheets інколи повертає діапазон, а не точний A1.
function isEditedCell_(e, a1) {
  const target = e.range.getSheet().getRange(a1);

  return (
    e.range.getRow() <= target.getRow() &&
    e.range.getLastRow() >= target.getRow() &&
    e.range.getColumn() <= target.getColumn() &&
    e.range.getLastColumn() >= target.getColumn()
  );
}
/****************************************************
 * ОБРОБКА РЕДАГУВАННЯ ФОРМИ
 ****************************************************/
// STATUS: PATCHABLE
// UI SYNC
// Для типу "Актив" автоматично переносить:
// B8 Стаття → D9 Назва активу
// B7 Категорія → E9 Категорія активу
function syncAssetFieldsFromMain_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const type = clean_(sheet.getRange(INPUT.type).getDisplayValue());

  if (type !== 'Актив') return;

  const category = clean_(sheet.getRange(INPUT.category).getDisplayValue());
  const article = clean_(sheet.getRange(INPUT.article).getDisplayValue());

  sheet.getRange(INPUT.assetName).setValue(article);
  sheet.getRange(INPUT.assetCategory).setValue(category);
}
/****************************************************
 * БЕЗПЕЧНИЙ UI ДЛЯ ЗМІНИ СТАТУСУ ВАКЦИНИ
 *
 * ВАЖЛИВО:
 * — не змінює кольори;
 * — не перемальовує форму;
 * — лише прибирає залишки попередньої операції;
 * — фіксує 1 вакцина = 1 статусна операція;
 * — синхронізує статус і дату.
 ****************************************************/

/****************************************************
 * БЕЗПЕЧНИЙ UI ДЛЯ ЗМІНИ СТАТУСУ ВАКЦИНИ
 * --------------------------------------------------
 * BUSINESS RULE:
 * 1 конкретний ID вакцини =
 * 1 статусна операція =
 * 1 одиниця вакцини.
 *
 * Функція:
 * — НЕ змінює кольори;
 * — НЕ перемальовує форму;
 * — очищає залишки попередньої операції;
 * — встановлює кількість = 1;
 * — встановлює суму = 0;
 * — синхронізує F13 зі Статтею B8;
 * — синхронізує G13 з датою B4;
 * — створює dropdown конкретних вакцин у D13.
 ****************************************************/

function applyVaccineStatusChangeUiSafety_() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INPUT_SHEET_NAME
      );

  if (!sheet) {
    return;
  }

  /****************************************************
   * ВИЗНАЧАЄМО ПОТОЧНИЙ РЕЖИМ
   ****************************************************/

  const type =
    clean_(
      sheet
        .getRange(
          INPUT.type
        )
        .getDisplayValue()
    );

  const category =
    clean_(
      sheet
        .getRange(
          INPUT.category
        )
        .getDisplayValue()
    );

  /*
   * Для інших операцій нічого не робимо.
   */
  if (
    type !== 'Вакцина' ||
    category !== 'Зміна статусу'
  ) {
    return;
  }

  /****************************************************
   * 1. НЕФІНАНСОВА ОПЕРАЦІЯ
   *
   * При зміні статусу не повинні переноситися
   * значення з попередньої фінансової операції.
   ****************************************************/

  [
    INPUT.doctor,
    INPUT.patient,
    INPUT.unitPrice,
    INPUT.transferTo
  ].forEach(
    function(a1) {
      sheet
        .getRange(a1)
        .clearContent();
    }
  );

  /****************************************************
   * 2. ОДНА ОПЕРАЦІЯ = ОДНА ВАКЦИНА
   *
   * Навіть якщо в B12 залишилося старе значення
   * 2, 3 тощо — статусна операція завжди
   * працює тільки з однією конкретною вакциною.
   ****************************************************/

  sheet
    .getRange(
      INPUT.quantity
    )
    .setValue(
      1
    );

  /****************************************************
   * 3. СУМА СТАТУСНОЇ ОПЕРАЦІЇ = 0
   ****************************************************/

  sheet
    .getRange(
      INPUT.amount
    )
    .setValue(
      0
    );

  /****************************************************
   * 4. F13 = СТАТТЯ B8
   *
   * B8 є основним джерелом нового статусу.
   * F13 лише інформаційно його дублює.
   ****************************************************/

  const article =
    clean_(
      sheet
        .getRange(
          INPUT.article
        )
        .getDisplayValue()
    );
    
  if (
    [
      'Використано',
      'Списано'
    ].includes(
      article
    )
  ) {
    sheet
      .getRange(
        INPUT.newStatus
      )
      .setValue(
        article
      );
  } else {
    /*
     * Не залишаємо в F13 старий статус
     * від попередньої операції.
     */
    sheet
      .getRange(
        INPUT.newStatus
      )
      .clearContent();
  }

  /****************************************************
   * 5. G13 = ДАТА ОПЕРАЦІЇ B4
   *
   * Для однієї статусної події
   * не повинно існувати двох різних дат.
   ****************************************************/

  const operationDate =
    sheet
      .getRange(
        INPUT.date
      )
      .getValue();

  if (
    operationDate instanceof Date &&
    !isNaN(
      operationDate.getTime()
    )
  ) {
    sheet
      .getRange(
        INPUT.actualDate
      )
      .setValue(
        operationDate
      )
      .setNumberFormat(
        'dd.MM.yyyy'
      );

  } else {
    sheet
      .getRange(
        INPUT.actualDate
      )
      .clearContent();
  }

  /****************************************************
   * 6. DROPDOWN КОНКРЕТНИХ ВАКЦИН У D13
   *
   * Джерело:
   * "Облік вакцин"
   * тільки статус "На зберіганні".
   ****************************************************/

  if (
    typeof applyStoredVaccineValidation_ ===
      'function'
  ) {
    applyStoredVaccineValidation_();

  } else {
    throw new Error(
      'Не знайдено функцію applyStoredVaccineValidation_().'
    );
  }

  SpreadsheetApp.flush();
}
function handleInputOperationEdit_(e) {
  if (
    !e ||
    !e.range
  ) {
    return;
  }

  const sheet =
    e.range.getSheet();

  if (
    sheet.getName() !==
    INPUT_SHEET_NAME
  ) {
    return;
  }
    if (handleNewClientEntryEdit_(e, sheet)) {
    updateInputStatusLive_();
    return;
  }
    if (
    isEditedCell_(
      e,
      INPUT.article
    )
  ) {
    const strictResult =
      enforceStrictInputSelectors_();

    if (strictResult.clearedInvalidValue) {
      SpreadsheetApp
        .getActive()
        .toast(
          'Стаття не відповідає ' +
            'налаштованому списку.',
          'Ввід операцій',
          5
        );

      updateInputStatusLive_();
      return;
    }
  }
  /****************************************************
   * ТИП ОПЕРАЦІЇ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.type
    )
  ) {
    sheet
      .getRange(INPUT.category)
      .clearContent()
      .clearDataValidations();

    sheet
      .getRange(INPUT.article)
      .clearContent()
      .clearDataValidations();

    updateInputDependentDropdowns();

    const type =
      clean_(
        sheet
          .getRange(INPUT.type)
          .getDisplayValue()
      );

    if (type === 'Інкасація') {
      applyTransferToValidation_();
    }

    clearDynamicBlocksByType_();
    updateInputBlocksView_();
  

    updateVaccineCostFromInventory_();
    applyInventoryNameValidation_();
    updateInputStatusLive_();

    return;
  }

  /****************************************************
   * КАТЕГОРІЯ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.category
    )
  ) {
    sheet
      .getRange(INPUT.article)
      .clearContent()
      .clearDataValidations();

    applyPackageDefaults_();
    updateInputDependentDropdowns();

    clearDynamicBlocksByType_();
    updateInputBlocksView_();

    applyVaccineStatusChangeUiSafety_();

    updateVaccineCostFromInventory_();
    updateInputStatusLive_();

    return;
  }
  
     /****************************************************
   * СТАТТЯ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.article
    )
  ) {
    const type =
      clean_(
        sheet
          .getRange(
            INPUT.type
          )
          .getDisplayValue()
      );

    const category =
      clean_(
        sheet
          .getRange(
            INPUT.category
          )
          .getDisplayValue()
      );

    const article =
      clean_(
        sheet
          .getRange(
            INPUT.article
          )
          .getDisplayValue()
      );
 showSharedExpenseArticleWarning_(
  article
 );
    /****************************************************
     * ВАКЦИНА — ПРОДАЖ
     ****************************************************/

    if (
      type === 'Вакцина' &&
      (
        category ===
          'Продаж і використання' ||
        category ===
          'Продаж на зберігання'
      )
    ) {
      sheet
        .getRange(
          INPUT.vaccineName
        )
        .setValue(
          article
        );

      sheet
        .getRange(
          INPUT.vaccinePatient
        )
        .setValue(
          sheet
            .getRange(
              INPUT.patient
            )
            .getDisplayValue()
        );
    }

    /****************************************************
     * ВАКЦИНА — ЗМІНА СТАТУСУ
     ****************************************************/

    if (
      type === 'Вакцина' &&
      category ===
        'Зміна статусу'
    ) {
      /*
       * Дані продажного блоку тут
       * не використовуються.
       */
      sheet
        .getRange(
          INPUT.vaccineName
        )
        .clearContent();

      sheet
        .getRange(
          INPUT.vaccinePatient
        )
        .clearContent();

      sheet
        .getRange(
          INPUT.vaccineCost
        )
        .clearContent()
        .clearNote();
    }

    /****************************************************
     * АКТИВ
     ****************************************************/

    if (
      type === 'Актив'
    ) {
      syncAssetFieldsFromMain_();
    }

    /****************************************************
     * ОЧИЩЕННЯ / ВИГЛЯД БЛОКІВ
     ****************************************************/

    clearDynamicBlocksByType_();

    updateInputBlocksView_();

    /****************************************************
     * БЕЗПЕЧНИЙ РЕЖИМ ЗМІНИ СТАТУСУ
     *
     * ВАЖЛИВО:
     * викликаємо ПІСЛЯ updateInputBlocksView_(),
     * щоб UI-функції не перетирали одна одну.
     ****************************************************/

    applyVaccineStatusChangeUiSafety_();

    /****************************************************
     * СКЛАДСЬКИЙ DROPDOWN
     ****************************************************/

    applyInventoryNameValidation_();

    /****************************************************
     * СОБІВАРТІСТЬ
     ****************************************************/

    updateVaccineCostFromInventory_();

    /****************************************************
     * LIVE STATUS
     ****************************************************/

    updateInputStatusLive_();

    return;
  }
  /****************************************************
   * ЦІНА АБО КІЛЬКІСТЬ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.unitPrice
    ) ||
    isEditedCell_(
      e,
      INPUT.quantity
    )
  ) {
    updateInputAmount_();

    const type =
      clean_(
        sheet
          .getRange(INPUT.type)
          .getDisplayValue()
      );

    if (type === 'Пакет') {
      applyPackageDefaults_();
    }

    if (type === 'Вакцина') {
      sheet
        .getRange(INPUT.vaccinePatient)
        .setValue(
          sheet
            .getRange(INPUT.patient)
            .getDisplayValue()
        );
    }

    updateVaccineCostFromInventory_();
  }

  /****************************************************
   * ДАТА ОПЕРАЦІЇ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.date
    )
  ) {
    updateVaccineCostFromInventory_();
  }

  /****************************************************
   * ПАЦІЄНТ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.patient
    )
  ) {
        if (handleNewClientOptionSelection_(sheet)) {
      updateInputStatusLive_();
      return;
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

    if (
      type === 'Вакцина' &&
      (
        category ===
          'Продаж і використання' ||
        category ===
          'Продаж на зберігання'
      )
    ) {
      sheet
        .getRange(INPUT.vaccinePatient)
        .setValue(
          sheet
            .getRange(INPUT.patient)
            .getDisplayValue()
        );
    }
  }
    updateInputStatusLive_();
    return;
    /****************************************************
   * ВАКЦИНА НА ЗБЕРІГАННІ
   ****************************************************/

  if (
    isEditedCell_(
      e,
      INPUT.storedVaccine
    )
  ) {
    const selectionIsValid =
      normalizeStoredVaccineSelection_(
        sheet
      );

    if (!selectionIsValid) {
      updateInputStatusLive_();

      return;
    }

    /*
     * Підтягуємо дані конкретної вакцини:
     * строк придатності, статус, дату та ID.
     */
    syncSelectedStoredVaccine_();

    /*
     * Dropdown D13 ОБОВ'ЯЗКОВО залишаємо.
     */
    applyStoredVaccineValidation_();

    SpreadsheetApp.flush();

    updateInputStatusLive_();

    return;
  }
   /*
   * Фінальна синхронізація статусу форми.
   *
   * Потрібна після автоматичного розрахунку B13
   * та після ручного редагування суми.
   */
  SpreadsheetApp.flush();
  updateInputStatusLive_();
}
// STATUS: PATCHABLE
// Рахує суму у формі вводу:
// Ціна за одиницю × Кількість = Сума.
// Джерело клітинок: INPUT.unitPrice, INPUT.quantity, INPUT.amount.
function updateInputAmount_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const unitPrice = numOrBlank_(
    sheet.getRange(INPUT.unitPrice).getValue()
  );

  const quantity = numOrBlank_(
    sheet.getRange(INPUT.quantity).getValue()
  );

  if (unitPrice === '' || quantity === '') {
    sheet.getRange(INPUT.amount).clearContent();
    return;
  }

  sheet.getRange(INPUT.amount).setValue(unitPrice * quantity);
}
/****************************************************
 * LIVE STATUS
 ****************************************************/

function updateInputStatusLive_() {
  const data = getInputOperationData_();
    const newClientPreparation =
    prepareNewClientForOperation_(
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName(INPUT_SHEET_NAME),
      data,
      false
    );

  if (!newClientPreparation.ok) {
    showInputStatus_(
      newClientPreparation.message,
      'error'
    );
    return;
  }
  const validation = validateInputOperation_(data);

  if (!validation.ok) {
    showInputStatus_(validation.message, 'error');
    return;
  }

  if (validation.message.startsWith('🟡')) {
    showInputStatus_(validation.message, 'warning');
    return;
  }

  showInputStatus_('🟢 Готово до проведення', 'success');
}


/****************************************************
 * ВИГЛЯД ДИНАМІЧНИХ БЛОКІВ
 ****************************************************/

// STATUS: PATCHABLE
// Відновлює базовий вигляд динамічних блоків і підсвічує активний блок.
function resetInputBlocksView_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const operationType = clean_(
    sheet
      .getRange(INPUT.type)
      .getDisplayValue()
  );

  const category = clean_(
    sheet
      .getRange(INPUT.category)
      .getDisplayValue()
  );

  const article = clean_(
    sheet
      .getRange(INPUT.article)
      .getDisplayValue()
  );

  const packageRange =
    sheet.getRange('D4:G5');

  const vaccineRange =
    sheet.getRange('D6:G7');

  const assetRange =
    sheet.getRange('D8:G9');

  const transferToRange =
    sheet.getRange('A15:B15');

  const inventoryRange =
    sheet.getRange('D14:G15');

  const moneyFieldsRange =
    sheet.getRange('A11:B14');

  /****************************************************
   * БАЗОВИЙ НЕАКТИВНИЙ ВИГЛЯД
   ****************************************************/

  packageRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999');

  vaccineRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999');

  assetRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999');

  inventoryRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999');

  transferToRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999')
    .setFontStyle('italic');

  moneyFieldsRange
    .setBackground('#ffffff')
    .setFontColor('#000000')
    .setFontStyle('normal');

  /****************************************************
   * ПАКЕТ
   ****************************************************/

  if (operationType === 'Пакет') {
    packageRange
      .setBackground('#fff200')
      .setFontColor('#000000');
  }

  /****************************************************
   * ВАКЦИНА — ПРОДАЖ
   ****************************************************/

  if (
    operationType === 'Вакцина' &&
    (
      category === 'Продаж і використання' ||
      category === 'Продаж на зберігання'
    )
  ) {
    vaccineRange
      .setBackground('#00ff00')
      .setFontColor('#000000');
  }

  /****************************************************
   * АКТИВ
   ****************************************************/

  if (operationType === 'Актив') {
    assetRange
      .setBackground('#18d7e6')
      .setFontColor('#000000');
  }

  /****************************************************
   * ІНКАСАЦІЯ
   ****************************************************/

  if (operationType === 'Інкасація') {
    transferToRange
      .setBackground('#b6d7a8')
      .setFontColor('#000000')
      .setFontStyle('normal');

    moneyFieldsRange
      .setBackground('#f3f3f3')
      .setFontColor('#999999')
      .setFontStyle('italic');
  }

  /****************************************************
   * СКЛАД — ЗАКУПІВЛЯ ЗАПАСІВ
   ****************************************************/

  const inventoryReceiptActive =
    operationType === 'Витрати' &&
    category === 'Медичні витрати' &&
    [
      'Закупка вакцин',
      'Закупка тестів',
      'Закупка косметичних товарів'
    ].includes(article);

  if (inventoryReceiptActive) {
    inventoryRange
      .setBackground('#d9ead3')
      .setFontColor('#000000');
  }
}

function updateInputBlocksView_() {
  resetInputBlocksView_();

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const type = clean_(
    sheet
      .getRange(INPUT.type)
      .getDisplayValue()
  );

  const category = clean_(
    sheet
      .getRange(INPUT.category)
      .getDisplayValue()
  );

  const vaccineStatusRange =
    sheet.getRange('D12:G13');

  const inactiveMoneyFields =
    sheet.getRange('A11:B14');

  /*
   * Блок зміни статусу вакцини
   * за замовчуванням неактивний.
   */
  vaccineStatusRange
    .setBackground('#f3f3f3')
    .setFontColor('#999999');

  if (
    type === 'Вакцина' &&
    category === 'Зміна статусу'
  ) {
    vaccineStatusRange
      .setBackground('#18d7e6')
      .setFontColor('#000000');

    inactiveMoneyFields
      .setBackground('#f3f3f3')
      .setFontColor('#999999')
      .setFontStyle('italic');


    sheet
      .getRange(INPUT.newStatus)
      .clearDataValidations()
      .setValue(
        sheet
          .getRange(INPUT.article)
          .getDisplayValue()
      );

  } else {
    sheet
      .getRange(INPUT.storedVaccine)
      .clearContent()
      .clearDataValidations()
      .clearNote();

    sheet
      .getRange(INPUT.expiryDate)
      .clearContent();

    sheet
      .getRange(INPUT.newStatus)
      .clearContent();

    sheet
      .getRange(INPUT.actualDate)
      .clearContent();
  }

  restoreInputFormats_();
}
/****************************************************
 * ОЧИСТКА ДИНАМІЧНИХ БЛОКІВ
 ****************************************************/

function clearDynamicBlocksByType_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const type = clean_(
    sheet
      .getRange(INPUT.type)
      .getDisplayValue()
  );

  const category = clean_(
    sheet
      .getRange(INPUT.category)
      .getDisplayValue()
  );

  const article = clean_(
    sheet
      .getRange(INPUT.article)
      .getDisplayValue()
  );

  /****************************************************
   * ПАКЕТ
   ****************************************************/

  if (type !== 'Пакет') {
    [
      INPUT.packageStart,
      INPUT.packageDuration,
      INPUT.packageMonthlyAmount,
      INPUT.packageAccrualStart
    ].forEach(function(cell) {
      sheet
        .getRange(cell)
        .clearContent();
    });
  }

  /****************************************************
   * ВАКЦИННІ БЛОКИ
   ****************************************************/

  if (type !== 'Вакцина') {
 [
  INPUT.vaccineName,
  INPUT.vaccinePatient,
  INPUT.vaccineCost,
  INPUT.vaccineSeries,
  INPUT.storedVaccine,
  INPUT.expiryDate,
  INPUT.newStatus,
  INPUT.actualDate
 ].forEach(function(cell) {
  sheet
    .getRange(cell)
    .clearContent();
 });
   sheet
  .getRange(
    INPUT.vaccineSeries
  )
  .clearDataValidations()
  .setNumberFormat('@');
    sheet
      .getRange(INPUT.storedVaccine)
      .clearNote();
  }

  /****************************************************
   * АКТИВ
   ****************************************************/

  if (type !== 'Актив') {
    [
      INPUT.assetName,
      INPUT.assetCategory,
      INPUT.assetAmortization,
      INPUT.assetStartDate
    ].forEach(function(cell) {
      sheet
        .getRange(cell)
        .clearContent();
    });
  }

  /****************************************************
   * СКЛАД
   ****************************************************/

  const inventoryReceiptActive =
    type === 'Витрати' &&
    category === 'Медичні витрати' &&
    [
      'Закупка вакцин',
      'Закупка тестів',
      'Закупка косметичних товарів'
    ].includes(article);

  if (!inventoryReceiptActive) {
    [
      INPUT.inventoryName,
      INPUT.inventorySeries,
      INPUT.inventoryExpiryDate,
      INPUT.inventorySupplier
    ].forEach(function(cell) {
      sheet
        .getRange(cell)
        .clearContent();
    });
  }
}

/****************************************************
 * ПАКЕТИ — АВТОПІДСТАНОВКА ТРИВАЛОСТІ
 ****************************************************/

function applyPackageDefaults_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const type = clean_(sheet.getRange(INPUT.type).getDisplayValue());
  const category = clean_(sheet.getRange(INPUT.category).getDisplayValue());

  if (type !== 'Пакет') return;

  let duration = 0;

  if (category === '6 місяців') duration = 6;
  if (category === '12 місяців') duration = 12;

  if (!isNaN(duration)) {
    sheet.getRange(INPUT.packageDuration).setValue(duration);
  }
  sheet.getRange(INPUT.article).setValue('Пакет послуг');

  if (!sheet.getRange(INPUT.packageStart).getValue()) {
    sheet.getRange(INPUT.packageStart)
      .setValue(sheet.getRange(INPUT.date).getValue());
  }

  recalculatePackageMonthlyAmount_();
}
/************************************************
 * ЛІКАРІ З ДОВІДНИКА
 ************************************************
 *
 * Джерело:
 * Довідник!F9:F18
 *
 * ВАЖЛИВО:
 * Нижче в колонці F є інші довідники,
 * тому беремо лише фіксований діапазон.
 ************************************************/

/************************************************
 * ЛІКАРІ З ДОВІДНИКА
 *
 * Джерело:
 * Довідник!F9:F18
 ************************************************/

function getDoctors_(
  dictSheet
) {
  if (!dictSheet) {
    return [];
  }

  const doctors =
    dictSheet
      .getRange(
        'F9:F18'
      )
      .getDisplayValues()
      .flat()
      .map(function(value) {
        return clean_(
          value
        );
      })
      .filter(function(value) {
        return Boolean(
          value
        );
      });

  return unique_(
    doctors
  );
}

/****************************************************
 * ДОХОДИ БЕЗ СЛУЖБОВИХ І ФІНАНСОВИХ КАТЕГОРІЙ
 ****************************************************/

// STATUS: PATCHABLE
// BUSINESS RULE
// У Типі "Доходи" показуємо тільки реальні статті доходів.
// Службові групи "Дохід операційної діяльності" і
// "Дохід фінансової діяльності" не показуємо у dropdown.
// Фінансові операції вводяться через Тип "Фінансова діяльність".
function getInputIncomeCategories_(dictSheet) {
  const excluded = [
  'Дохід операційної діяльності',
  'Дохід фінансової діяльності',
  'Отримання позики',
  'Інша фінансова допомога',
  'Продаж основних засобів',
  'Внесок власника',
  'Вакцина',
  'Щеплення',
  'Вакцини'
];
  return getIncomeCategories_(dictSheet)
    .map(v => clean_(v))
    .filter(v => v !== '')
    .filter(v => !excluded.includes(v));
}


/****************************************************
 * АКТИВИ — КАТЕГОРІЇ
 ****************************************************/

/****************************************************
 * АКТИВИ — КАТЕГОРІЇ
 *
 * Джерело:
 * Активи!B3:B
 ****************************************************/

function getAssetCategories_(ss) {
  const sheet =
    ss.getSheetByName(
      ASSETS_SHEET_NAME
    );

  if (!sheet) return [];

  if (
    typeof ASSET_MODULE_CONFIG ===
    'undefined'
  ) {
    return [];
  }

  const lastRow =
    findLastAssetDataRow_(sheet);

  if (
    lastRow <
    ASSET_MODULE_CONFIG.startRow
  ) {
    return [];
  }

  const rowCount =
    lastRow -
    ASSET_MODULE_CONFIG.startRow +
    1;

  return unique_(
    sheet
      .getRange(
        ASSET_MODULE_CONFIG.startRow,
        ASSET_MODULE_CONFIG.columns.category,
        rowCount,
        1
      )
      .getDisplayValues()
      .flat()
      .map(value => clean_(value))
      .filter(Boolean)
  );
}


/****************************************************
 * АКТИВИ — НАЗВИ ПО КАТЕГОРІЇ
 *
 * Джерело:
 * Активи!A:B
 ****************************************************/

function getAssetNames_(
  ss,
  categoryValue
) {
  const sheet =
    ss.getSheetByName(
      ASSETS_SHEET_NAME
    );

  if (!sheet) return [];

  if (
    typeof ASSET_MODULE_CONFIG ===
    'undefined'
  ) {
    return [];
  }

  const lastRow =
    findLastAssetDataRow_(sheet);

  if (
    lastRow <
    ASSET_MODULE_CONFIG.startRow
  ) {
    return [];
  }

  const rowCount =
    lastRow -
    ASSET_MODULE_CONFIG.startRow +
    1;

  const data = sheet
    .getRange(
      ASSET_MODULE_CONFIG.startRow,
      ASSET_MODULE_CONFIG.columns.name,
      rowCount,
      2
    )
    .getDisplayValues();

  const selected =
    clean_(categoryValue)
      .toLowerCase();

  return unique_(
    data
      .filter(row => {
        const category =
          clean_(row[1])
            .toLowerCase();

        return (
          category === selected
        );
      })
      .map(row => clean_(row[0]))
      .filter(Boolean)
  );
}

/****************************************************
 * СТАТУС
 ****************************************************/

function showInputStatus_(message, type) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INPUT_SHEET_NAME);
  const range = sheet.getRange(INPUT.status);

  const colors = {
    success: ['#d9ead3', '#274e13'],
    warning: ['#fff2cc', '#7f6000'],
    error: ['#f4cccc', '#990000']
  };

  const color = colors[type] || colors.warning;

  range.merge();
  range.setValue(message);
  range.setBackground(color[0]);
  range.setFontColor(color[1]);
  range.setFontWeight('bold');
}


/****************************************************
 * ОЧИСТКА ФОРМИ
 ****************************************************/

function clearInputForm_() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INPUT_SHEET_NAME
      );

  if (!sheet) return;

  /*
   * Перше очищення всіх полів форми.
   */
  [
    INPUT.date,
    INPUT.account,
    INPUT.type,
    INPUT.category,
    INPUT.article,
    INPUT.doctor,
    INPUT.patient,
    INPUT.unitPrice,
    INPUT.quantity,
    INPUT.amount,
    INPUT.transferTo,
    INPUT.comment,

    INPUT.packageStart,
    INPUT.packageDuration,
    INPUT.packageMonthlyAmount,
    INPUT.packageAccrualStart,

    INPUT.vaccineName,
    INPUT.vaccinePatient,
    INPUT.vaccineCost,
    INPUT.vaccineSeries,

    INPUT.assetName,
    INPUT.assetCategory,
    INPUT.assetAmortization,
    INPUT.assetStartDate,

    INPUT.inventoryName,
    INPUT.inventorySeries,
    INPUT.inventoryExpiryDate,
    INPUT.inventorySupplier,

    INPUT.storedVaccine,
    INPUT.expiryDate,
    INPUT.newStatus,
    INPUT.actualDate
  ].forEach(function(cell) {
    if (!cell) return;

    sheet
      .getRange(cell)
      .clearContent();
  });

  /*
   * Додатково очищаємо примітку,
   * у якій зберігається ID вакцини.
   */
  sheet
    .getRange(
      INPUT.storedVaccine
    )
    .clearNote();
  sheet
    .getRange(INPUT.patient)
    .clearNote();
  /*
   * Видаляємо старі залежні валідації.
   */
  sheet
    .getRange(
      INPUT.category
    )
    .clearDataValidations();

  sheet
    .getRange(
      INPUT.article
    )
    .clearDataValidations();

  sheet
    .getRange(
      INPUT.vaccineName
    )
    .clearDataValidations();

  sheet
    .getRange(
      INPUT.storedVaccine
    )
    .clearDataValidations();

  sheet
    .getRange(
      INPUT.transferTo
    )
    .clearDataValidations();

  /*
   * Відновлюємо базовий вигляд поля
   * "На рахунок".
   */
  sheet
    .getRange('A15:B15')
    .setBackground('#f3f3f3')
    .setFontColor('#999999')
    .setFontStyle('italic');

  /*
   * Заново встановлюємо формати,
   * dropdown та базовий вигляд форми.
   */
  setupInputOperationForm();

  /*
   * ПОВТОРНЕ ОЧИЩЕННЯ ПІСЛЯ SETUP.
   *
   * setupInputOperationForm() може відновити
   * значення з шаблону або під час побудови блоків.
   */
  sheet
    .getRange(
      INPUT.transferTo
    )
    .clearContent();

  sheet
    .getRange('D15:G15')
    .clearContent();

  /*
   * Оновлюємо видимість блоків
   * уже для порожньої форми.
   */
  updateInputBlocksView_();
  if (typeof hideNewClientEntryBlock_ === 'function') {
    hideNewClientEntryBlock_(sheet);
  }
  restoreInputFormats_();

  /*
   * Фінальний захист:
   * після форматування значення складського
   * блоку також мають залишитися порожніми.
   */
  sheet
    .getRange('D15:G15')
    .clearContent();
}
    showInputStatus_(
    '🟢 Форму налаштовано',
    'success'
  );

/****************************************************
 * ВІДНОВЛЕННЯ ФОРМИ
 ****************************************************/

function restoreInputFormValidation() {
  setupInputOperationForm();
  updateInputDependentDropdowns();
  updateInputBlocksView_();
}


/****************************************************
 * ID
 ****************************************************/

// STATUS: PATCHABLE
// Генерує ID операції.
// Дата в ID береться з дати операції, а не з поточної дати запуску скрипта.
/**
 * Генерує гарантовано вільний ID операції.
 *
 * Працює універсально для Бабурки й Альтернативи.
 */
function generateOperationId_(
  type,
  operationDate
) {
  const prefixMap = {
    'Доходи': 'PF',
    'Витрати': 'L',
    'Інкасація': 'INC',
    'Фінансова діяльність': 'FIN',
    'Актив': 'AST',
    'Вакцина': 'VAC',
    'Пакет': 'PKG'
  };

  const prefix =
    prefixMap[type] || 'TX';

  const dateSource =
    operationDate || new Date();

  const datePart =
    Utilities.formatDate(
      new Date(dateSource),
      Session.getScriptTimeZone(),
      'yyyyMMdd'
    );

  const existingIds =
    getExistingBaseOperationIds_();

  /*
   * Спочатку пробуємо випадкові номери,
   * щоб зберегти поточний формат ID.
   */
  for (
    let attempt = 0;
    attempt < 50;
    attempt++
  ) {
    const suffix =
      Math.floor(
        Math.random() * 900
      ) + 100;

    const candidate =
      prefix +
      '-' +
      datePart +
      '-' +
      suffix;

    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  /*
   * Якщо випадковий пошук не дав результату,
   * послідовно знаходимо вільний номер.
   */
  for (
    let suffix = 100;
    suffix <= 999;
    suffix++
  ) {
    const candidate =
      prefix +
      '-' +
      datePart +
      '-' +
      String(suffix)
        .padStart(3, '0');

    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Не вдалося сформувати унікальний ID операції. ' +
    'Для дати ' +
    datePart +
    ' використано всі доступні номери.'
  );
}


/**
 * Читає всі наявні ID з «Бази операцій».
 */
function getExistingBaseOperationIds_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      BASE_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "База операцій".'
    );
  }

  const startRow = 10;
  const lastRow =
    sheet.getLastRow();

  if (lastRow < startRow) {
    return new Set();
  }

  return new Set(
    sheet
      .getRange(
        startRow,
        1,
        lastRow - startRow + 1,
        1
      )
      .getDisplayValues()
      .map(function(row) {
        return String(
          row[0] || ''
        ).trim();
      })
      .filter(Boolean)
  );
}


/**
 * Фінальна перевірка ID безпосередньо перед записом.
 */
function assertOperationIdIsUnique_(
  operationId
) {
  const id =
    String(
      operationId || ''
    ).trim();

  if (!id) {
    throw new Error(
      'Не сформовано ID операції.'
    );
  }

  const existingIds =
    getExistingBaseOperationIds_();

  if (existingIds.has(id)) {
    throw new Error(
      'Операцію не проведено: ID "' +
      id +
      '" уже існує в "Базі операцій".'
    );
  }

  return true;
}


/****************************************************
 * МІСЯЦЬ
 ****************************************************/

function getMonthText_(date) {
  if (!date) return '';
  return Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'MM.yyyy');
}


/****************************************************
 * ДОДАТИ МІСЯЦІ
 ****************************************************/

function addMonths_(date, months) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error(
      'Некоректна дата старту нарахування пакета'
    );
  }

  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  result.setMonth(
    result.getMonth() + Number(months || 0)
  );

  return result;
}
function getVaccineNames_(dictSheet) {
  const lastRow = dictSheet.getLastRow();
  if (lastRow < 1) return [];

  const data = dictSheet.getRange(1, 3, lastRow, 3).getDisplayValues(); 
  // C = Категорія, D = Код, E = Послуга

  return unique_(
    data
      .filter(r => clean_(r[0]) === 'Щеплення')
      .map(r => clean_(r[2]))
      .filter(v => v !== '')
  );
}
// STATUS: PATCHABLE
// Перетворює число з клітинки у Number.
// Якщо клітинка порожня — повертає порожнє значення, а не 0.
function numOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';

  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(',', '.');

  if (cleaned === '') return '';

  const number = Number(cleaned);

  return isNaN(number) ? '' : number;
}
function writeToVaccineRegistry_(data) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('Облік вакцин');

  if (!sheet) {
    throw new Error('Не знайдено лист "Облік вакцин"');
  }

  if (!data || !data.id) {
    throw new Error('Не визначено ID продажу вакцини');
  }

  const allowedCategories = [
    'Продаж і використання',
    'Продаж на зберігання'
  ];

  if (!allowedCategories.includes(clean_(data.category))) {
    throw new Error(
      'Недопустима категорія для запису в "Облік вакцин": ' +
      clean_(data.category)
    );
  }

  const saleId = clean_(data.id);
  const patient =
  clean_(data.vaccinePatient || data.patient) ||
  'Не вказано';
  const vaccineName = clean_(data.vaccineName || data.article);
  const vaccineCost = Number(data.vaccineCost) || 0;
  const quantity = Math.max(1, Math.floor(Number(data.vaccineQty) || 1));
  const planDate = data.vaccineUseDate || data.date || '';
  const comment = clean_(data.comment);
  const operationUser =
  getSafeUserEmail_() ||
  Session.getEffectiveUser().getEmail() ||
  'Не визначено';

const operationDateTime = new Date();
  if (!vaccineName) {
    throw new Error('Не визначено назву вакцини');
  }

  if (!vaccineCost) {
    throw new Error('Не визначено собівартість вакцини');
  }

  const status =
    clean_(data.category) === 'Продаж і використання'
      ? 'Використано'
      : 'На зберіганні';

  const factDate =
    status === 'Використано'
      ? planDate
      : '';

  const existingIds = new Set();

  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    sheet
      .getRange(2, 1, lastRow - 1, 1)
      .getDisplayValues()
      .flat()
      .map(value => clean_(value))
      .filter(Boolean)
      .forEach(id => existingIds.add(id));
  }

  const rows = [];

  for (let index = 1; index <= quantity; index++) {
    const vaccineId =
      Array.isArray(data.vaccineIds) && data.vaccineIds[index - 1]
        ? clean_(data.vaccineIds[index - 1])
        : buildVaccineRegistryId_(saleId, index);

    if (existingIds.has(vaccineId)) {
      continue;
    }

    rows.push([
  vaccineId,            // A
  saleId,               // B
  patient,              // C
  vaccineName,          // D
  vaccineCost,          // E
  status,               // F
  planDate,             // G
  factDate,             // H
  comment,              // I
  '',                   // J
  '',                   // K
  '',                   // L
  '',                   // M
  operationUser,        // N — хто провів
  operationDateTime     // O — дата і час
 ]);

    existingIds.add(vaccineId);
  }

  if (!rows.length) {
    return {
      created: 0,
      skipped: quantity
    };
  }

  sheet
    .getRange(
      sheet.getLastRow() + 1,
      1,
      rows.length,
      15
    )
    .setValues(rows);

  return {
    created: rows.length,
    skipped: quantity - rows.length
  };
}


function buildVaccineRegistryId_(saleId, index) {
  return clean_(saleId) + '-V' + index;
}
function generateVaccineId_(date, index) {
  const datePart = Utilities.formatDate(
    new Date(date || new Date()),
    Session.getScriptTimeZone(),
    'yyyyMMdd'
  );

  const randomPart = Math.floor(Math.random() * 900 + 100);

  return 'VAC-' + datePart + '-' + randomPart + '-' + index;
}
function testDropdown() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Ввід операцій');

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      ['Тест 1', 'Тест 2'],
      true
    )
    .build();

  sheet.getRange('D13').setDataValidation(rule);
}
function recalculatePackageMonthlyAmount_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(INPUT_SHEET_NAME);

  if (!sheet) return;

  const amount = Number(sheet.getRange(INPUT.amount).getValue()) || 0;
  const duration = Number(sheet.getRange(INPUT.packageDuration).getValue()) || 0;

  if (amount && duration) {
    sheet.getRange(INPUT.packageMonthlyAmount).setValue(amount / duration);
  } else {
    sheet.getRange(INPUT.packageMonthlyAmount).clearContent();
  }
}
function restoreInputFormats_() {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        INPUT_SHEET_NAME
      );

  if (!sheet) return;

  const dateRule =
    SpreadsheetApp
      .newDataValidation()
      .requireDate()
      .setAllowInvalid(false)
      .build();

  /*
   * Поля дат.
   */
  [
    INPUT.date,
    INPUT.packageStart,
    INPUT.packageAccrualStart,
    INPUT.assetStartDate,
    INPUT.actualDate,
    INPUT.inventoryExpiryDate
  ].forEach(function(cell) {
    if (!cell) return;

    sheet
      .getRange(cell)
      .setNumberFormat('dd.MM.yyyy')
      .setDataValidation(
        dateRule
      );
  });

  /*
   * Грошові поля.
   */
  [
    INPUT.unitPrice,
    INPUT.amount,
    INPUT.packageMonthlyAmount,
    INPUT.vaccineCost
  ].forEach(function(cell) {
    if (!cell) return;

    sheet
      .getRange(cell)
      .setNumberFormat('#,##0.00');
  });

  /*
   * Кількість.
   */
  sheet
    .getRange(
      INPUT.quantity
    )
    .setNumberFormat('#,##0');

  /*
   * Серія вакцини — текстове поле,
   * а не дата.
   */
  sheet
    .getRange(
      INPUT.vaccineSeries
    )
    .clearDataValidations()
    .setNumberFormat('@');
    sheet.getRange(INPUT.unitPrice).clearDataValidations();
    sheet.getRange(INPUT.quantity).clearDataValidations();
}
/****************************************************
 * SYSTEM RECOVERY — ВВІД ОПЕРАЦІЙ
 * --------------------------------------------------
 * Відновлює лист "Ввід операцій" з прихованого шаблону
 * "_Шаблон_Ввід_операцій".
 *
 * Не чіпає "База операцій".
 ****************************************************/

function repairInputOperationForm() {
  restoreInputSheetFromTemplate_();
  SpreadsheetApp.getActive().toast('Форму вводу примусово відновлено з шаблону');
}


/****************************************************
 * ПЕРЕВІРКА ЦІЛІСНОСТІ ФОРМИ
 ****************************************************/

function checkInputFormIntegrity_(sheet) {
  const checks = [
    { cell: INPUT.date, name: 'Дата' },
    { cell: INPUT.account, name: 'Рахунок' },
    { cell: INPUT.type, name: 'Тип операції' },
    { cell: INPUT.category, name: 'Категорія' },
    { cell: INPUT.article, name: 'Стаття' },
    { cell: INPUT.amount, name: 'Сума' },
    { cell: INPUT.status.split(':')[0], name: 'Статус форми' },
    { cell: INPUT.packageStart, name: 'Блок пакетів' },
    { cell: INPUT.vaccineName, name: 'Блок вакцин' },
    { cell: INPUT.assetName, name: 'Блок активів' },
    { cell: INPUT.inventoryName, name: 'Складський блок' }
  ];

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];

    try {
      sheet.getRange(check.cell);
    } catch (err) {
      return {
        ok: false,
        reason: 'пошкоджено поле "' + check.name + '"'
      };
    }
  }

  const title = clean_(sheet.getRange('D2').getDisplayValue());
  const mainLabel = clean_(sheet.getRange('A4').getDisplayValue());

  if (!title && !mainLabel) {
    return {
      ok: false,
      reason: 'пошкоджено структуру форми'
    };
  }

  return {
    ok: true,
    reason: ''
  };
}


/****************************************************
 * ВІДНОВЛЕННЯ З ШАБЛОНУ
 ****************************************************/

function restoreInputSheetFromTemplate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const oldSheet = ss.getSheetByName(INPUT_SHEET_NAME);
  const templateSheet = ss.getSheetByName(INPUT_TEMPLATE_SHEET_NAME);

  if (!templateSheet) {
    throw new Error('Не знайдено лист "' + INPUT_TEMPLATE_SHEET_NAME + '"');
  }

  templateSheet.showSheet();

  if (oldSheet) {
    ss.deleteSheet(oldSheet);
  }

  const restoredSheet = templateSheet.copyTo(ss);
  restoredSheet.setName(INPUT_SHEET_NAME);

  ss.setActiveSheet(restoredSheet);
  ss.moveActiveSheet(1);

  templateSheet.hideSheet();

  updateInputDependentDropdowns();
  updateInputBlocksView_();
  restoreInputFormats_();

  SpreadsheetApp.flush();
}
function rebuildJuneJuly2026VaccineRegistry() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
 

  const baseSheet = ss.getSheetByName('База операцій');

  if (!baseSheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  let registrySheet = ss.getSheetByName('Облік вакцин');

  if (!registrySheet) {
    registrySheet = ss.insertSheet('Облік вакцин');
  }

  const headers = [
    'ID вакцини',
    'ID продажу',
    'Пацієнт',
    'Вакцина',
    'Собівартість',
    'Статус',
    'Планова дата',
    'Фактична дата',
    'Коментар'
  ];

  // Відновлюємо правильну шапку.
  registrySheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  // Видаляємо старі рядки реєстру, але залишаємо шапку.
  const registryLastRow = registrySheet.getLastRow();

  if (registryLastRow > 1) {
    registrySheet
      .getRange(2, 1, registryLastRow - 1, 9)
      .clearContent();
  }

  const lastRow = baseSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('У листі "База операцій" немає даних');
  }

  /*
   * Читаємо A:AE.
   * Починаємо з другого рядка, оскільки перший рядок — заголовки.
   * Порожні службові рядки автоматично будуть пропущені.
   */
  const baseData = baseSheet
    .getRange(2, 1, lastRow - 1, 31)
    .getValues();

  const startDate = new Date(2026, 5, 1); // 01.06.2026
  const endDate = new Date(2026, 6, 31, 23, 59, 59);

  let processedOperations = 0;
  let createdVaccines = 0;
  let skippedOperations = 0;
  const skippedDetails = [];

  baseData.forEach((row, index) => {
    const sheetRow = index + 2;

    const saleId = clean_(row[0]);          // A
    const operationDate = row[3];           // D
    const patient = clean_(row[8]);         // I
    const type = clean_(row[9]);            // J
    const originalCategory = clean_(row[10]); // K
    const article = clean_(row[11]);        // L
    const comment = clean_(row[12]);        // M
 const storedVaccineName = clean_(row[20]); // U
const articleName = clean_(article);

const excludedVaccineNames = [
  'Використано',
  'Списано',
  'На зберіганні',
  'Зміна статусу',
  'Послуги медсестри при вакцинації (власна вакцина)'
];

const vaccineName =
  storedVaccineName ||
  (!excludedVaccineNames.includes(articleName)
    ? articleName
    : '');

    if (!saleId) return;

    if (!(operationDate instanceof Date) || isNaN(operationDate)) {
      return;
    }

    if (operationDate < startDate || operationDate > endDate) {
      return;
    }

    if (type !== 'Вакцина') {
      return;
    }
  if (!vaccineName || excludedVaccineNames.includes(vaccineName)) {
  skippedOperations++;
  skippedDetails.push(
    'Рядок ' + sheetRow +
    ': службовий запис або не визначено назву вакцини'
  );
  return;
  }
    let category = originalCategory;

    /*
     * Старі червневі записи з категорією "Вакцини"
     * трактуємо як продаж і використання.
     */
    if (category === 'Вакцини') {
      category = 'Продаж і використання';
    }

    if (
      category !== 'Продаж і використання' &&
      category !== 'Продаж на зберігання'
    ) {
      skippedOperations++;
      skippedDetails.push(
        'Рядок ' + sheetRow + ': непідтримувана категорія "' +
        originalCategory + '"'
      );
      return;
    }
    const vaccineQty = Number(row[21]) || 1;      // V
    const vaccineUseDate = row[22];               // W
    const vaccineCost = Number(row[23]) || 0;     // X
    const data = {
      id: saleId,
      date: operationDate,
      category: category,
      article: article,
      patient: patient,
      vaccinePatient: patient,
      vaccineName: vaccineName,
      vaccineQty: vaccineQty,
      vaccineCost: vaccineCost,
      vaccineUseDate: vaccineUseDate,
      comment: comment
    };

    try {
      const result = writeToVaccineRegistry_(data);

      processedOperations++;
      createdVaccines += result.created || 0;
    } catch (error) {
      skippedOperations++;
      skippedDetails.push(
        'Рядок ' + sheetRow + ': ' + error.message
      );
    }
  });

  // Форматування реєстру.
  registrySheet.setFrozenRows(1);

  registrySheet
    .getRange(1, 1, 1, 9)
    .setFontWeight('bold');

  if (registrySheet.getLastRow() > 1) {
    registrySheet
      .getRange(2, 5, registrySheet.getLastRow() - 1, 1)
      .setNumberFormat('#,##0.00');

    registrySheet
      .getRange(2, 7, registrySheet.getLastRow() - 1, 2)
      .setNumberFormat('dd.MM.yyyy');
  }

  registrySheet.autoResizeColumns(1, 9); 

  // Відновлюємо dropdown вакцин на зберіганні.
  if (typeof applyStoredVaccineValidation_ === 'function') {
    applyStoredVaccineValidation_();
  }

  SpreadsheetApp.flush();

  let message =
    'Реєстр вакцин відновлено.\n\n' +
    'Опрацьовано операцій: ' + processedOperations + '\n' +
    'Створено одиниць вакцин: ' + createdVaccines + '\n' +
    'Пропущено операцій: ' + skippedOperations;

  if (skippedDetails.length) {
    Logger.log(
      'Пропущені записи відновлення вакцин:\n' +
      skippedDetails.join('\n')
    );

    message += '\n\nДеталі пропусків записані в журналі виконання Apps Script.';
  }

  SpreadsheetApp.getActive().toast(
  'Реєстр вакцин відновлено. Створено: ' + createdVaccines
);

Logger.log(message);
 }
 function markHistoricalRowsAsImported() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('База операцій');

  if (!sheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  const data = sheet
    .getRange(2, 1, lastRow - 1, 30) // A:AD
    .getDisplayValues();

  const updates = [];
  let updatedCount = 0;

  data.forEach(row => {
    const id = clean_(row[0]);       // A
    const currentStatus = clean_(row[29]); // AD

    const isHistorical =
      id.startsWith('HIST-APR-') ||
      id.startsWith('HIST-MAY-');

    if (id && isHistorical && !currentStatus) {
      updates.push(['Імпортовано']);
      updatedCount++;
    } else {
      updates.push([currentStatus]);
    }
  });

  sheet
    .getRange(2, 30, updates.length, 1) // AD
    .setValues(updates);

  SpreadsheetApp.getActive().toast(
    'Історичні записи позначено. Оновлено: ' + updatedCount
  );

  Logger.log(
    'Позначено історичних записів як "Імпортовано": ' +
    updatedCount
  );
}
/**
 * Встановлює dropdown лікарів у полі INPUT.doctor.
 *
 * Джерело:
 * лист "Довідник", колонка F, починаючи з F9.
 *
 * Читає лише суцільний блок лікарів
 * до першої порожньої клітинки.
 */
function setupDoctorDropdown_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  const directorySheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INPUT_SHEET_NAME +
      '"'
    );
  }

  if (!directorySheet) {
    throw new Error(
      'Не знайдено лист "' +
      DICT_SHEET_NAME +
      '"'
    );
  }

  const doctors =
    getDoctors_(directorySheet);

  const doctorCell =
    inputSheet.getRange(
      INPUT.doctor
    );

  doctorCell.clearDataValidations();

  if (!doctors.length) {
    doctorCell.clearContent();

    throw new Error(
      'У Довідник!F9:F18 не знайдено лікарів'
    );
  }

  const currentValue =
    clean_(
      doctorCell.getDisplayValue()
    );

  if (
    currentValue &&
    !doctors.includes(currentValue)
  ) {
    doctorCell.clearContent();
  }

  const validation =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        doctors,
        true
      )
      .setAllowInvalid(false)
      .setHelpText(
        'Оберіть лікаря зі списку'
      )
      .build();

  doctorCell.setDataValidation(
    validation
  );
}
/****************************************************
 * ВІДНОВЛЕННЯ VALIDATION B8 — СТАТТЯ
 *
 * Безпечне точкове відновлення.
 * Не змінює бізнес-дані.
 * Не перебудовує всю форму.
 ****************************************************/
function repairInputArticleValidation() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Ввід операцій"'
    );
  }

  const articleCell =
    sheet.getRange(
      INPUT.article
    );

  /*
   * Запам'ятовуємо поточне значення B8.
   */
  const currentArticle =
    clean_(
      articleCell.getDisplayValue()
    );

  /*
   * Видаляємо тільки старе правило B8.
   */
  articleCell.clearDataValidations();

  /*
   * Перебудовуємо залежні списки
   * відповідно до поточних B6 + B7.
   */
  updateInputDependentDropdowns();

  SpreadsheetApp.flush();

  /*
   * Перевіряємо, чи validation B8 створилася.
   */
  const rule =
    articleCell.getDataValidation();

  if (!rule) {
    throw new Error(
      'Validation B8 не створена. ' +
      'Перевірте значення Типу B6 та Категорії B7.'
    );
  }

  SpreadsheetApp
    .getActive()
    .toast(
      'Validation B8 відновлено' +
      (
        currentArticle
          ? '. Поточна стаття: ' +
            currentArticle
          : ''
      ),
      'Ввід операцій',
      6
    );

  return {
    ok: true,
    cell: INPUT.article,
    currentArticle: currentArticle,
    businessDataChanged: false
  };
}
function auditD13Validation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const cell = sheet.getRange('D13');

  const value = String(cell.getDisplayValue());
  const validation = cell.getDataValidation();

  console.log('Аркуш: ' + sheet.getName());
  console.log('D13: [' + value + ']');
  console.log('Довжина значення: ' + value.length);
  console.log('Фон клітинки: ' + cell.getBackground());

  if (!validation) {
    console.log('ВАЛІДАЦІЯ В D13 ВІДСУТНЯ');
    return;
  }

  const type = validation.getCriteriaType();
  const args = validation.getCriteriaValues();

  console.log('Тип валідації: ' + type);
  console.log(
    'Відхиляти неправильне значення: ' +
    validation.getAllowInvalid()
  );

  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    const options = args[0].map(String);
    const exactMatch = options.includes(value);

    console.log('Кількість варіантів: ' + options.length);
    console.log('Точний збіг D13 зі списком: ' + exactMatch);

    options.forEach((option, index) => {
      if (option.includes('VAC-20260803-159-V2')) {
        console.log('Знайдений пункт №' + (index + 1) + ': [' + option + ']');
        console.log('Довжина пункту: ' + option.length);
        console.log('Рівність із D13: ' + (option === value));
      }
    });
  }

  if (type === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
    const sourceRange = args[0];
    const options = sourceRange
      .getDisplayValues()
      .flat()
      .map(String)
      .filter(Boolean);

    console.log('Джерело dropdown: ' + sourceRange.getA1Notation());
    console.log('Аркуш джерела: ' + sourceRange.getSheet().getName());
    console.log('Кількість варіантів: ' + options.length);
    console.log('Точний збіг D13 зі списком: ' + options.includes(value));
  }

  const conditionalRules = sheet
    .getConditionalFormatRules()
    .filter(rule =>
      rule.getRanges().some(range =>
        range.getRow() <= 13 &&
        range.getLastRow() >= 13 &&
        range.getColumn() <= 4 &&
        range.getLastColumn() >= 4
      )
    );

  console.log(
    'Правил умовного форматування, що охоплюють D13: ' +
    conditionalRules.length
  );
}
function showSharedExpenseArticleWarning_(
  article
) {
  const normalizedArticle = clean_(article)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const sharedExpenseArticles = [
    'маркетинг',
    'утилізація',
    'утилизация'
  ];

  if (
    sharedExpenseArticles.indexOf(
      normalizedArticle
    ) === -1
  ) {
    return;
  }

  SpreadsheetApp.getUi().alert(
    'Перевірте розподіл витрати',
    [
      'Стаття: ' + article,
      '',
      'Ця витрата може бути спільною ' +
        'для двох філій.',
      '',
      'Рекомендація:',
      '• внести 50% у поточній філії;',
      '• інші 50% внести окремою операцією ' +
        'в іншій філії.',
      '',
      'За потреби використайте погоджений ' +
        'інший відсоток розподілу.'
    ].join('\n'),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
function getStrictInputOperationTypes_() {
  return [
    'Доходи',
    'Витрати',
    'Інкасація',
    'Фінансова діяльність',
    'Актив',
    'Вакцина',
    'Пакет'
  ];
}


function getStrictInputCategories_(
  type
) {
  const normalizedType =
    clean_(type);

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dictSheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!dictSheet) {
    throw new Error(
      'Не знайдено лист «' +
        DICT_SHEET_NAME +
        '».'
    );
  }

  let categories = [];

  if (normalizedType === 'Доходи') {
    categories =
      getInputIncomeCategories_(
        dictSheet
      )
        .map(clean_)
        .filter(function(value) {
          return (
            value &&
            value !== 'Щеплення'
          );
        });
  }

if (normalizedType === 'Витрати') {
  categories =
    getExpenseCategories_(dictSheet)
      .map(clean_)
      .filter(function(value) {
        return (
          value &&
          value !== 'Активи' &&
          value !== 'Косметичні засоби' &&
          !/^\d{4}-\d{2}-\d{2}$/.test(value)
        );
      });
}

  if (
    normalizedType ===
    'Фінансова діяльність'
  ) {
    categories = [
      'Отримання позики',
      'Інша фінансова допомога',
      'Продаж основних засобів',
      'Внесок власника'
    ];
  }

  if (normalizedType === 'Інкасація') {
    categories = [
      'Внутрішній трансфер'
    ];
  }

  if (normalizedType === 'Пакет') {
    categories = [
      '6 місяців',
      '12 місяців'
    ];
  }

  if (normalizedType === 'Вакцина') {
    categories = [
      'Продаж і використання',
      'Продаж на зберігання',
      'Зміна статусу'
    ];
  }

  if (normalizedType === 'Актив') {
    categories =
      getAssetCategories_(ss);
  }

  return unique_(
    categories
      .map(clean_)
      .filter(Boolean)
  );
}


function getStrictInputArticles_(
  type,
  category
) {
  const normalizedType =
    clean_(type);

  const normalizedCategory =
    clean_(category);

  /*
   * Назва нового активу вводиться вручну.
   * Це не стаття P&L-мепінгу.
   */
  if (normalizedType === 'Актив') {
    return null;
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dictSheet =
    ss.getSheetByName(
      DICT_SHEET_NAME
    );

  if (!dictSheet) {
    throw new Error(
      'Не знайдено лист «' +
        DICT_SHEET_NAME +
        '».'
    );
  }

  let articles = [];

  if (normalizedType === 'Доходи') {
    articles =
      getIncomeArticles_(
        dictSheet,
        normalizedCategory
      );
  }

  if (normalizedType === 'Витрати') {
    articles =
      getExpenseArticles_(
        dictSheet,
        normalizedCategory
      );
  }

  if (
    normalizedType ===
    'Фінансова діяльність'
  ) {
    articles = [
      normalizedCategory
    ];
  }

  if (normalizedType === 'Інкасація') {
    articles = [
      'Внутрішній трансфер'
    ];
  }

  if (normalizedType === 'Пакет') {
    articles = [
      'Пакет послуг'
    ];
  }

  if (
    normalizedType === 'Вакцина' &&
    (
      normalizedCategory ===
        'Продаж і використання' ||
      normalizedCategory ===
        'Продаж на зберігання'
    )
  ) {
    articles =
      getVaccineNamesFromRegistry_();
  }

  if (
    normalizedType === 'Вакцина' &&
    normalizedCategory ===
      'Зміна статусу'
  ) {
    articles = [
      'Використано',
      'Списано'
    ];
  }

  return unique_(
    articles
      .map(clean_)
      .filter(Boolean)
  );
}


function buildStrictInputListRule_(
  values,
  helpText
) {
  return SpreadsheetApp
    .newDataValidation()
    .requireValueInList(
      values,
      true
    )
    .setAllowInvalid(false)
    .setHelpText(helpText)
    .build();
}


function enforceStrictInputSelectors_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      INPUT_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
        INPUT_SHEET_NAME +
        '».'
    );
  }

  const typeCell =
    sheet.getRange(INPUT.type);

  const categoryCell =
    sheet.getRange(INPUT.category);

  const articleCell =
    sheet.getRange(INPUT.article);

  const allowedTypes =
    getStrictInputOperationTypes_();

  const type =
    clean_(
      typeCell.getDisplayValue()
    );

  let clearedInvalidValue = false;

  typeCell.setDataValidation(
    buildStrictInputListRule_(
      allowedTypes,
      'Оберіть тип операції зі списку.'
    )
  );

  if (
    type &&
    allowedTypes.indexOf(type) === -1
  ) {
    typeCell.clearContent();

    categoryCell
      .clearContent()
      .clearDataValidations();

    articleCell
      .clearContent()
      .clearDataValidations();

    return {
      ok: false,
      clearedInvalidValue: true,
      field: INPUT.type
    };
  }

  if (!type) {
    categoryCell
      .clearContent()
      .clearDataValidations();

    articleCell
      .clearContent()
      .clearDataValidations();

    return {
      ok: true,
      clearedInvalidValue: false
    };
  }

  const allowedCategories =
    getStrictInputCategories_(type);

  const category =
    clean_(
      categoryCell.getDisplayValue()
    );

  categoryCell.setDataValidation(
    buildStrictInputListRule_(
      allowedCategories,
      'Оберіть категорію зі списку.'
    )
  );

  if (
    category &&
    allowedCategories.indexOf(category) === -1
  ) {
    categoryCell.clearContent();

    articleCell
      .clearContent()
      .clearDataValidations();

    return {
      ok: false,
      clearedInvalidValue: true,
      field: INPUT.category
    };
  }

  if (!category) {
    articleCell
      .clearContent()
      .clearDataValidations();

    return {
      ok: true,
      clearedInvalidValue: false
    };
  }

  const allowedArticles =
    getStrictInputArticles_(
      type,
      category
    );

  /*
   * Для нового активу B8 — назва активу.
   */
  if (allowedArticles === null) {
    articleCell.clearDataValidations();

    return {
      ok: true,
      clearedInvalidValue: false,
      manualAssetNameAllowed: true
    };
  }

  const article =
    clean_(
      articleCell.getDisplayValue()
    );

  if (!allowedArticles.length) {
    articleCell
      .clearContent()
      .clearDataValidations()
      .setNote(
        'Для цієї категорії немає ' +
          'налаштованих статей. ' +
          'Спочатку додайте їх у Довідник.'
      );

    return {
      ok: false,
      clearedInvalidValue: true,
      field: INPUT.article
    };
  }

  articleCell
    .setDataValidation(
      buildStrictInputListRule_(
        allowedArticles,
        'Оберіть статтю лише зі списку.'
      )
    )
    .setNote(
      'Стаття мапінгу: обирається ' +
        'лише зі списку.'
    );

  if (
    article &&
    allowedArticles.indexOf(article) === -1
  ) {
    articleCell.clearContent();

    return {
      ok: false,
      clearedInvalidValue: true,
      field: INPUT.article
    };
  }

  return {
    ok: true,
    clearedInvalidValue: false,
    allowedArticlesCount:
      allowedArticles.length
  };
}


function getStrictInputValidationError_(
  data
) {
  const allowedTypes =
    getStrictInputOperationTypes_();

  if (
    data.type &&
    allowedTypes.indexOf(
      clean_(data.type)
    ) === -1
  ) {
    return (
      'Тип операції потрібно обрати ' +
      'зі списку.'
    );
  }

  if (!data.type) {
    return '';
  }

  const allowedCategories =
    getStrictInputCategories_(
      data.type
    );

  if (
    data.category &&
    allowedCategories.indexOf(
      clean_(data.category)
    ) === -1
  ) {
    return (
      'Категорію потрібно обрати ' +
      'зі списку.'
    );
  }

  if (!data.category) {
    return '';
  }

  const allowedArticles =
    getStrictInputArticles_(
      data.type,
      data.category
    );

  /*
   * Новий актив має ручну назву.
   */
  if (allowedArticles === null) {
    return '';
  }

  if (!allowedArticles.length) {
    return (
      'Для обраної категорії не ' +
      'налаштовано жодної статті.'
    );
  }

  if (
    allowedArticles.indexOf(
      clean_(data.article)
    ) === -1
  ) {
    return (
      'Статтю потрібно обрати ' +
      'зі списку.'
    );
  }

  return '';
}
/****************************************************
 * ProFin OS — історичні теги клієнтів
 *
 * Правила: «Довідник», колонка C — тип/категорія,
 * колонка E — тег клієнта.
 ****************************************************/

const CLIENT_TAGS_CONFIG = {
  dictionarySheetName: 'Довідник',

  dictionaryFirstDataRow: 32,
  dictionaryLastDataRow: 39,
  dictionaryKeyColumn: 9,   // I
  dictionaryTagColumn: 10,  // J

  clientsSheetName: 'Клієнтська база',
  clientsHeaderRow: 4,
  clientsFirstDataRow: 5,
  clientIdColumn: 1,
  clientTagsColumn: 15,
  clientTagsHeader: 'Теги клієнта',

  separator: ' · '
};


/**
 * Повертає теги операції за контрольованим довідником.
 * Зіставляє і тип, і категорію, щоб підтримати:
 * — «Вакцина» як тип операції;
 * — «Довідки», «НСЗУ» тощо як категорії.
 */
function getClientTagsForOperation_(data) {
  if (!data || !clean_(data.patientId)) {
    return [];
  }

  const rules = getClientTagRules_();

  const operationKeys = [
    clean_(data.type),
    clean_(data.category)
  ].filter(function(value) {
    return Boolean(value);
  });

  const tags = [];

  operationKeys.forEach(function(key) {
    const ruleTags = rules[key] || [];

    ruleTags.forEach(function(tag) {
      if (tags.indexOf(tag) === -1) {
        tags.push(tag);
      }
    });
  });

  return tags;
}


/**
 * Зчитує правила з «Довідник»:
 * C — тип / категорія операції;
 * E — тег або кілька тегів через « · ».
 */
function getClientTagRules_() {
  const config = CLIENT_TAGS_CONFIG;
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(config.dictionarySheetName);

  if (!sheet) {
    throw new Error('Не знайдено лист «Довідник».');
  }

  const lastRow = Math.min(
  sheet.getLastRow(),
  config.dictionaryLastDataRow
 );

  if (lastRow < config.dictionaryFirstDataRow) {
    return {};
  }

  const rows = sheet.getRange(
    config.dictionaryFirstDataRow,
    config.dictionaryKeyColumn,
    lastRow - config.dictionaryFirstDataRow + 1,
    config.dictionaryTagColumn - config.dictionaryKeyColumn + 1
  ).getDisplayValues();

  const rules = {};

  rows.forEach(function(row) {
    const key = clean_(row[0]);
    const tags = splitClientTags_(row[
      config.dictionaryTagColumn -
      config.dictionaryKeyColumn
    ]);

    if (!key || !tags.length) {
      return;
    }

    rules[key] = tags;
  });

  return rules;
}


/**
 * Додає до картки лише нові теги.
 * Історичні теги не стираються наступними операціями.
 */
function updateClientTagsAfterOperation_(data) {
  const tagsToAdd = getClientTagsForOperation_(data);

  if (!tagsToAdd.length) {
    return {
      ok: true,
      changed: false,
      reason: 'NO_TAG_FOR_OPERATION'
    };
  }

  const config = CLIENT_TAGS_CONFIG;
  const clientsSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(config.clientsSheetName);

  if (!clientsSheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  ensureClientTagsColumn_(clientsSheet);

  const clientRow = findClientRowById_(
    clientsSheet,
    clean_(data.patientId)
  );

  if (!clientRow) {
    throw new Error(
      'Не знайдено клієнта з ID «' +
      clean_(data.patientId) +
      '» у «Клієнтська база».'
    );
  }

  const tagsCell = clientsSheet.getRange(
    clientRow,
    config.clientTagsColumn
  );

  const currentTags = splitClientTags_(
    tagsCell.getDisplayValue()
  );

  tagsToAdd.forEach(function(tag) {
    if (currentTags.indexOf(tag) === -1) {
      currentTags.push(tag);
    }
  });

  tagsCell.setValue(
    currentTags.join(config.separator)
  );

  return {
    ok: true,
    changed: true,
    clientId: clean_(data.patientId),
    tags: currentTags
  };
}


/**
 * Створює заголовок O4 лише якщо колонка ще порожня.
 * Не перезаписує сторонні дані.
 */
function ensureClientTagsColumn_(clientsSheet) {
  const config = CLIENT_TAGS_CONFIG;
  const headerCell = clientsSheet.getRange(
    config.clientsHeaderRow,
    config.clientTagsColumn
  );

  const currentHeader = clean_(
    headerCell.getDisplayValue()
  );

  if (
    currentHeader &&
    currentHeader !== config.clientTagsHeader
  ) {
    throw new Error(
      'Колонка O у «Клієнтська база» уже має заголовок «' +
      currentHeader +
      '». Очікується «' +
      config.clientTagsHeader +
      '».'
    );
  }

  if (!currentHeader) {
    headerCell
      .setValue(config.clientTagsHeader)
      .setFontWeight('bold');
  }
}


/**
 * Шукає конкретного клієнта лише за його CLIENT_ID.
 */
function findClientRowById_(clientsSheet, clientId) {
  const config = CLIENT_TAGS_CONFIG;
  const lastRow = clientsSheet.getLastRow();

  if (lastRow < config.clientsFirstDataRow) {
    return 0;
  }

  const ids = clientsSheet.getRange(
    config.clientsFirstDataRow,
    config.clientIdColumn,
    lastRow - config.clientsFirstDataRow + 1,
    1
  ).getDisplayValues().flat();

  const index = ids.indexOf(clientId);

  return index >= 0
    ? config.clientsFirstDataRow + index
    : 0;
}


/**
 * Підтримує один або кілька тегів у клітинці.
 */
function splitClientTags_(value) {
  const config = CLIENT_TAGS_CONFIG;

  return String(value || '')
    .split(config.separator)
    .map(function(tag) {
      return clean_(tag);
    })
    .filter(function(tag) {
      return Boolean(tag);
    });
}
/****************************************************
 * ProFin OS — аудит історичних тегів клієнтів
 *
 * Читає лише проведені операції з CLIENT_ID.
 * За замовчуванням нічого не записує.
 ****************************************************/

/**
 * Сухий аудит: показує, які теги можна відновити
 * з історичних операцій без змін у таблиці.
 */
function auditHistoricalClientTags() {
  return rebuildHistoricalClientTags_(false);
}


/**
 * Записує підтверджені історичні теги в «Клієнтська база».
 * Запускати лише після перевірки результату аудиту.
 */
function applyHistoricalClientTags_() {
  return rebuildHistoricalClientTags_(true);
}


function rebuildHistoricalClientTags_(writesNow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName(BASE_SHEET_NAME);
  const clientsSheet = ss.getSheetByName(
    CLIENT_TAGS_CONFIG.clientsSheetName
  );

  if (!baseSheet) {
    throw new Error('Не знайдено лист «База операцій».');
  }

  if (!clientsSheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  const firstDataRow = 2;
  const lastRow = baseSheet.getLastRow();

  if (lastRow < firstDataRow) {
    return {
      ok: true,
      writesNow: Boolean(writesNow),
      message: 'У «База операцій» немає записів для аналізу.'
    };
  }

  /*
   * I:AD:
   * I  — Пацієнт, у примітці CLIENT_ID;
   * J  — Тип;
   * K  — Категорія;
   * AD — Статус запису.
   */
  const rowCount = lastRow - firstDataRow + 1;
  const values = baseSheet.getRange(
    firstDataRow,
    9,
    rowCount,
    22
  ).getDisplayValues();

  const patientNotes = baseSheet.getRange(
    firstDataRow,
    9,
    rowCount,
    1
  ).getNotes();

  const tagsByClientId = {};
  const unresolvedClientIds = [];

  let scannedRows = 0;
  let conductedRows = 0;
  let linkedRows = 0;
  let taggedRows = 0;

  values.forEach(function(row, index) {
    scannedRows++;

    const status = clean_(row[21]);

    if (status !== 'Проведено') {
      return;
    }

    conductedRows++;

    const clientId = getClientIdFromBasePatientNote_(
      patientNotes[index][0]
    );

    if (!clientId) {
      return;
    }

    linkedRows++;

    const tags = getClientTagsForOperation_({
      patientId: clientId,
      type: clean_(row[1]),
      category: clean_(row[2])
    });

    if (!tags.length) {
      return;
    }

    taggedRows++;

    if (!tagsByClientId[clientId]) {
      tagsByClientId[clientId] = [];
    }

    tags.forEach(function(tag) {
      if (tagsByClientId[clientId].indexOf(tag) === -1) {
        tagsByClientId[clientId].push(tag);
      }
    });
  });

  const result = writeHistoricalClientTags_(
    clientsSheet,
    tagsByClientId,
    Boolean(writesNow)
  );

  unresolvedClientIds = result.unresolvedClientIds;

  return {
    ok: true,
    writesNow: Boolean(writesNow),

    scannedRows: scannedRows,
    conductedRows: conductedRows,
    linkedRows: linkedRows,
    taggedRows: taggedRows,

    clientsWithTags: Object.keys(tagsByClientId).length,
    updatedClients: result.updatedClients,
    unresolvedClientIds: unresolvedClientIds,

    tagsPreview: Object.keys(tagsByClientId)
      .sort()
      .slice(0, 30)
      .map(function(clientId) {
        return {
          clientId: clientId,
          tags: tagsByClientId[clientId].join(
            CLIENT_TAGS_CONFIG.separator
          )
        };
      })
  };
}


/**
 * Визначає CLIENT_ID лише з примітки в колонці «Пацієнт».
 * ПІБ і дата народження не використовуються для зіставлення.
 */
function getClientIdFromBasePatientNote_(note) {
  const match = String(note || '')
    .match(/CLIENT_ID:\s*(CL-[A-Z0-9-]+)/i);

  return match ? match[1] : '';
}


/**
 * У режимі аудиту лише звіряє клієнтів.
 * У режимі застосування — записує зібрані теги.
 */
function writeHistoricalClientTags_(
  clientsSheet,
  tagsByClientId,
  writesNow
) {
  const config = CLIENT_TAGS_CONFIG;

  ensureClientTagsColumn_(clientsSheet);

  const lastRow = clientsSheet.getLastRow();

  if (lastRow < config.clientsFirstDataRow) {
    return {
      updatedClients: 0,
      unresolvedClientIds: Object.keys(tagsByClientId)
    };
  }

  const rowCount = lastRow - config.clientsFirstDataRow + 1;

  const clientIds = clientsSheet.getRange(
    config.clientsFirstDataRow,
    config.clientIdColumn,
    rowCount,
    1
  ).getDisplayValues().flat();

  const clientRowsById = {};

  clientIds.forEach(function(clientId, index) {
    const cleanId = clean_(clientId);

    if (cleanId) {
      clientRowsById[cleanId] =
        config.clientsFirstDataRow + index;
    }
  });

  const unresolvedClientIds = [];
  let updatedClients = 0;

  Object.keys(tagsByClientId).forEach(function(clientId) {
    const clientRow = clientRowsById[clientId];

    if (!clientRow) {
      unresolvedClientIds.push(clientId);
      return;
    }

    if (!writesNow) {
      updatedClients++;
      return;
    }

    clientsSheet.getRange(
      clientRow,
      config.clientTagsColumn
    ).setValue(
      tagsByClientId[clientId].join(config.separator)
    );

    updatedClients++;
  });

  return {
    updatedClients: updatedClients,
    unresolvedClientIds: unresolvedClientIds
  };
}
/****************************************************
 * ProFin OS — новий клієнт у складі операції
 * Один сценарій: створення клієнта + проведення операції.
 ****************************************************/

const CLIENT_ENTRY_UI_CONFIG = {
  inputSheetName: 'Ввід операцій',
  clientsSheetName: 'Клієнтська база',

  patientCellA1: 'B10',
  doctorCellA1: 'B9',
  newClientOption: '➕ Новий клієнт',
  pendingClientNote: 'NEW_CLIENT_PENDING',
  clientsFirstDataRow: 5,

  blockRangeA1: 'D16:G21',
  titleRangeA1: 'D16:G16',

  childNameLabelRangeA1: 'D17:E17',
  childNameCellRangeA1: 'F17:G17',

  birthDateLabelRangeA1: 'D18:E18',
  birthDateCellRangeA1: 'F18:G18',

  trustedPersonLabelRangeA1: 'D19:E19',
  trustedPersonCellRangeA1: 'F19:G19',

  trustedPhoneLabelRangeA1: 'D20:E20',
  trustedPhoneCellRangeA1: 'F20:G20',

  hintRangeA1: 'D21:G21'
};


function handleNewClientOptionSelection_(sheet) {
  const config = CLIENT_ENTRY_UI_CONFIG;
  const patientCell = sheet.getRange(config.patientCellA1);
  const selectedValue = clean_(patientCell.getDisplayValue());

  if (selectedValue !== config.newClientOption) {
    if (selectedValue) {
      applySelectedPatientId_(sheet, selectedValue);
    } else {
      patientCell.clearNote();
    }

    hideNewClientEntryBlock_(sheet);
    return false;
  }

  patientCell
    .clearContent()
    .setNote(config.pendingClientNote);

  showNewClientEntryBlock_(sheet);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Заповніть картку клієнта. Він буде створений разом з операцією після натискання «Провести операцію».',
    'Новий клієнт',
    7
  );

  return true;
}


function handleNewClientEntryEdit_(e, sheet) {
  const config = CLIENT_ENTRY_UI_CONFIG;

  const clientFields = [
    config.childNameCellRangeA1,
    config.birthDateCellRangeA1,
    config.trustedPersonCellRangeA1,
    config.trustedPhoneCellRangeA1
  ];

  if (
    clientFields.some(function(a1) {
      return isEditedCell_(e, a1);
    })
  ) {
    updateNewClientHint_(sheet);
    return true;
  }

  return false;
}


function showNewClientEntryBlock_(sheet) {
  const config = CLIENT_ENTRY_UI_CONFIG;
  const blockRange = sheet.getRange(config.blockRangeA1);

  blockRange.breakApart();
  blockRange.clearContent();
  blockRange.clearDataValidations();

  blockRange
    .setBackground('#e2f0d9')
    .setFontColor('#000000')
    .setHorizontalAlignment('left')
    .setBorder(
      true, true, true, true, true, true,
      '#6aa84f',
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet.getRange(config.titleRangeA1)
    .merge()
    .setValue('➕ Новий клієнт буде створений разом з операцією')
    .setBackground('#6aa84f')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  setClientLabel_(sheet, config.childNameLabelRangeA1, 'ПІБ дитини *');
  setClientInput_(sheet, config.childNameCellRangeA1);

  setClientLabel_(sheet, config.birthDateLabelRangeA1, 'Дата народження *');

  sheet.getRange(config.birthDateCellRangeA1)
    .merge()
    .setBackground('#ffffff')
    .setNumberFormat('dd.MM.yyyy')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireDate()
        .setAllowInvalid(false)
        .build()
    );

  setClientLabel_(
    sheet,
    config.trustedPersonLabelRangeA1,
    'ПІБ довіреної особи *'
  );
  setClientInput_(sheet, config.trustedPersonCellRangeA1);

  setClientLabel_(
    sheet,
    config.trustedPhoneLabelRangeA1,
    'Телефон довіреної особи *'
  );
  setClientInput_(sheet, config.trustedPhoneCellRangeA1);

  updateNewClientHint_(sheet);
}


function setClientLabel_(sheet, rangeA1, text) {
  sheet.getRange(rangeA1)
    .merge()
    .setValue(text)
    .setFontWeight('bold');
}


function setClientInput_(sheet, rangeA1) {
  sheet.getRange(rangeA1)
    .merge()
    .setBackground('#ffffff')
    .setHorizontalAlignment('left');
}


function updateNewClientHint_(sheet) {
  const result = getNewClientFormData_(sheet);
  const range = sheet.getRange(CLIENT_ENTRY_UI_CONFIG.hintRangeA1);

  range.breakApart().merge();

  if (!result.ok) {
    range
      .setValue('Заповніть: ' + result.errors.join('; ') + '.')
      .setBackground('#e2f0d9')
      .setFontColor('#38761d')
      .setFontStyle('italic');
    return;
  }

  const duplicates = findClientDuplicates_(
    result.client.name,
    result.client.birthDate
  );

  range
    .setValue(
      duplicates.length
        ? '⚠ Є збіг ПІБ + дати народження. Клієнт буде створений із позначкою для звірки.'
        : 'Клієнта буде створено разом з операцією після натискання зеленої кнопки.'
    )
    .setBackground(duplicates.length ? '#fff2cc' : '#e2f0d9')
    .setFontColor(duplicates.length ? '#7f6000' : '#38761d')
    .setFontStyle('italic');
}


function prepareNewClientForOperation_(sheet, data, reserveId) {
  const config = CLIENT_ENTRY_UI_CONFIG;
  const patientCell = sheet.getRange(config.patientCellA1);

  if (String(patientCell.getNote() || '') !== config.pendingClientNote) {
    return {
      ok: true,
      isNewClient: false
    };
  }

  const result = getNewClientFormData_(sheet);

  if (!result.ok) {
    return {
      ok: false,
      message: '🔴 Не заповнено картку нового клієнта: ' +
        result.errors.join('; ') + '.'
    };
  }

  const client = result.client;
  const clientId = reserveId
    ? generateClientId_(
        SpreadsheetApp.getActiveSpreadsheet()
          .getSheetByName(config.clientsSheetName)
      )
    : 'PENDING_NEW_CLIENT';

  data.patient = client.name + ' · ' + formatClientBirthDate_(client.birthDate);
  data.patientId = clientId;

  if (reserveId) {
    data.pendingNewClient = {
      id: clientId,
      name: client.name,
      birthDate: client.birthDate,
      doctor: client.doctor,
      trustedPerson: client.trustedPerson,
      trustedPhone: client.trustedPhone
    };
  }

  return {
    ok: true,
    isNewClient: true
  };
}


function getNewClientFormData_(sheet) {
  const config = CLIENT_ENTRY_UI_CONFIG;

  const client = {
    name: cleanClientDisplayText_(
      sheet.getRange(config.childNameCellRangeA1).getDisplayValue()
    ),
    birthDate: sheet.getRange(config.birthDateCellRangeA1).getValue(),
    doctor: cleanClientDisplayText_(
      sheet.getRange(config.doctorCellA1).getDisplayValue()
    ),
    trustedPerson: cleanClientDisplayText_(
      sheet.getRange(config.trustedPersonCellRangeA1).getDisplayValue()
    ),
    trustedPhone: String(
      sheet.getRange(config.trustedPhoneCellRangeA1).getDisplayValue() || ''
    ).trim()
  };

  const errors = [];

  if (!client.name) errors.push('ПІБ дитини');
  if (
    !(client.birthDate instanceof Date) ||
    isNaN(client.birthDate.getTime())
  ) {
    errors.push('дату народження');
  }
  if (!client.doctor) errors.push('лікаря в B9');
  if (!client.trustedPerson) errors.push('ПІБ довіреної особи');
  if (!client.trustedPhone) errors.push('телефон довіреної особи');

  return {
    ok: errors.length === 0,
    errors: errors,
    client: client
  };
}


function writePendingNewClient_(sheet, client) {
  const clientsSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CLIENT_ENTRY_UI_CONFIG.clientsSheetName);

  if (!clientsSheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  let targetRow = 0;
  let clientWritten = false;

  try {
    const duplicates = findClientDuplicates_(
      client.name,
      client.birthDate
    );

    targetRow = getNextClientRow_(clientsSheet);

    clientsSheet.getRange(targetRow, 1, 1, 14).setValues([[
      client.id,
      '',
      client.name,
      client.birthDate,
      '',
      '',
      client.doctor,
      client.trustedPerson,
      client.trustedPhone,
      'Активний',
      'Ввід операцій',
      duplicates.length ? 'Потребує звірки дубліката' : '',
      new Date(),
      getClientCreator_()
    ]]);

    clientWritten = true;

    clientsSheet.getRange(targetRow, 4)
      .setNumberFormat('dd.MM.yyyy');

    clientsSheet.getRange(targetRow, 6)
      .setNumberFormat('@');

    clientsSheet.getRange(targetRow, 9)
      .setNumberFormat('@');

    refreshPatientDropdown_();

    sheet.getRange(CLIENT_ENTRY_UI_CONFIG.patientCellA1)
      .setValue(
        client.name +
        ' · ' +
        formatClientBirthDate_(client.birthDate)
      )
      .setNote('CLIENT_ID: ' + client.id);

    return {
      clientId: client.id,
      row: targetRow
    };

  } catch (error) {
    if (clientWritten && targetRow) {
      try {
        clientsSheet
          .getRange(targetRow, 1, 1, 14)
          .clearContent();

        refreshPatientDropdown_();

      } catch (rollbackError) {
        Logger.log(
          'Не вдалося відкочити створення клієнта: ' +
          rollbackError.message
        );
      }

      sheet
        .getRange(CLIENT_ENTRY_UI_CONFIG.patientCellA1)
        .clearContent()
        .setNote(CLIENT_ENTRY_UI_CONFIG.pendingClientNote);
    }

    throw error;
  }
}


function rollbackPendingNewClient_(sheet, createdClient) {
  if (!createdClient || !createdClient.clientId) {
    return;
  }

  const clientsSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CLIENT_ENTRY_UI_CONFIG.clientsSheetName);

  if (!clientsSheet) {
    return;
  }

  const firstRow = CLIENT_ENTRY_UI_CONFIG.clientsFirstDataRow;
  const lastRow = clientsSheet.getLastRow();

  if (lastRow >= firstRow) {
    const ids = clientsSheet
      .getRange(firstRow, 1, lastRow - firstRow + 1, 1)
      .getDisplayValues()
      .flat();

    const index = ids.indexOf(createdClient.clientId);

    if (index >= 0) {
      clientsSheet
        .getRange(firstRow + index, 1, 1, 14)
        .clearContent();
    }
  }

  refreshPatientDropdown_();

  sheet.getRange(CLIENT_ENTRY_UI_CONFIG.patientCellA1)
    .clearContent()
    .setNote(CLIENT_ENTRY_UI_CONFIG.pendingClientNote);
}


function findClientDuplicates_(childName, birthDate) {
  const config = CLIENT_ENTRY_UI_CONFIG;
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(config.clientsSheetName);

  if (!sheet || sheet.getLastRow() < config.clientsFirstDataRow) {
    return [];
  }

  return sheet
    .getRange(
      config.clientsFirstDataRow,
      1,
      sheet.getLastRow() - config.clientsFirstDataRow + 1,
      4
    )
    .getValues()
    .filter(function(row) {
      return (
        normalizeClientText_(row[2]) === normalizeClientText_(childName) &&
        formatClientBirthDate_(row[3]) === formatClientBirthDate_(birthDate)
      );
    });
}


function applySelectedPatientId_(sheet, patientLabel) {
  const config = CLIENT_ENTRY_UI_CONFIG;
  const clientsSheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(config.clientsSheetName);

  const patientCell = sheet.getRange(config.patientCellA1);

  if (!clientsSheet) {
    patientCell.clearNote();
    return;
  }

  const rows = clientsSheet
    .getRange(
      config.clientsFirstDataRow,
      1,
      Math.max(clientsSheet.getLastRow() - config.clientsFirstDataRow + 1, 1),
      4
    )
    .getValues()
    .filter(function(row) {
      return String(row[0] || '').trim();
    });

  const matches = rows.filter(function(row) {
    return (
      normalizeClientText_(row[2]) +
      ' · ' +
      formatClientBirthDate_(row[3])
    ) === normalizeClientText_(patientLabel);
  });

  if (matches.length === 1) {
    patientCell.setNote('CLIENT_ID: ' + String(matches[0][0]).trim());
  } else {
    patientCell.clearNote();
  }
}


function getPatientIdFromCellNote_(range) {
  const match = String(
    range.getNote() || ''
  ).match(
    /CLIENT_ID:\s*([^\r\n]+)/i
  );

  return match
    ? String(match[1]).trim()
    : '';
}


function getNextClientRow_(sheet) {
  const firstRow = CLIENT_ENTRY_UI_CONFIG.clientsFirstDataRow;
  const lastRow = sheet.getLastRow();

  if (lastRow < firstRow) return firstRow;

  const ids = sheet
    .getRange(firstRow, 1, lastRow - firstRow + 1, 1)
    .getDisplayValues()
    .flat();

  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i]).trim()) return firstRow + i + 1;
  }

  return firstRow;
}


function generateClientId_(clientsSheet) {
  if (!clientsSheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  const datePart = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd-HHmmss'
  );

  return 'CL-' + datePart + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}


function getClientCreator_() {
  try {
    return Session.getActiveUser().getEmail() || 'Адміністратор ProFin';
  } catch (error) {
    return 'Адміністратор ProFin';
  }
}


function cleanClientDisplayText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}


function normalizeClientText_(value) {
  return cleanClientDisplayText_(value).toLowerCase();
}


function hideNewClientEntryBlock_(sheet) {
  const blockRange = sheet.getRange(CLIENT_ENTRY_UI_CONFIG.blockRangeA1);

  blockRange.breakApart();
  blockRange.clearContent();
  blockRange.clearDataValidations();

  blockRange
    .setBackground('#ffffff')
    .setFontColor('#000000')
    .setFontStyle('normal')
    .setFontWeight('normal')
    .setHorizontalAlignment('left')
    .setBorder(false, false, false, false, false, false);
}
function repairInputNumericFieldsValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Ввід операцій');

  if (!sheet) {
    throw new Error('Лист «Ввід операцій» не знайдено.');
  }

  sheet
    .getRange('B11')
    .clearDataValidations()
    .setNumberFormat('#,##0.00');

  sheet
    .getRange('B12')
    .clearDataValidations()
    .setNumberFormat('0.00');

  SpreadsheetApp.flush();

  return {
    ok: true,
    repaired: [
      'Ввід операцій!B11 — Ціна за одиницю',
      'Ввід операцій!B12 — Кількість'
    ],
    valuesPreserved: true
  };
}