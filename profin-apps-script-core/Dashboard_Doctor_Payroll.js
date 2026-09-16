/**************************************************************
 * PROFIN OS
 * DASHBOARD — DOCTOR PAYROLL
 *
 * Джерело:
 *   База операцій
 *
* Вихід:
*   Дашборд!D36:G42
 *
 * D — деклараційні пацієнти, 40%
 * E — консультації, 40%
 * F — інші послуги, 40%
 * G — D + E + F
 *
 * STATUS: EXPERIMENTAL
 **************************************************************/

const PF_DOCTOR_PAYROLL = {

  sourceSheet:
    'База операцій',

  dashboardSheet:
    'Дашборд',

  doctorRange:
  'B36:B42',

  outputRange:
  'D36:G42',

  rate:
    0.40,

  namedRanges: {
    from:
      'DASH_DATE_FROM',

    to:
      'DASH_DATE_TO'
  },

  headers: {
    id:
      'ID',

    date:
      'Дата транзакції',

    amount:
      'Сума',

    doctor:
      'Лікар',

    type:
      'Тип Доходи / Витрати',

    category:
      'Категорія',

    article:
      'Стаття',

    status:
      'Статус запису'
  },

  incomeType:
    'Доходи',

  /*
   * Перша колонка D.
   */
  declarationArticle:
    'Огляд деклараційних пацієнтів в часи приватного прийому',

  /*
   * Друга колонка E.
   *
   * Усе з категорії "Консультація",
   * КРІМ деклараційного огляду,
   * який уже потрапив у D.
   */
  consultationCategory:
    'Консультація',

  /*
   * Третя колонка F.
   *
   * "Інші послуги" =
   * інші доходи лікаря,
   * але НЕ продаж товару / вакцини.
   *
   * Якщо пізніше вирішимо, що якась
   * категорія теж не повинна давати 40%,
   * достатньо додати її сюди.
   */
  excludedOtherCategories: [
    'Вакцини',
    'Косметичні засоби'
  ],

  /*
   * Валідні виробничі записи.
   *
   * Порожній статус залишений для
   * старих історичних рядків.
   */
  allowedStatuses: [
    '',
    'Проведено',
    'Імпортовано'
  ],

  /*
   * Нормалізація історичних варіантів ПІБ.
   *
   * ВАЖЛИВО:
   * Малинок + Малинюк зараз вважаються
   * однією особою.
   */
  doctorAliases: {
    'карпенко':
      'карпенко',

    'волошина':
      'волошина',

    'волошиа':
      'волошина',

    'волошина о в':
      'волошина',

    'малинок':
      'малинюк',

    'малинюк':
      'малинюк',

    'зайцева':
      'зайцева',

    'нечипас':
      'нечипас',

    'баденко':
  'баденко',

  'тавер':
  'тавер'
  }
};


/**************************************************************
 * 1. СУХИЙ ТЕСТ
 *
 * НІЧОГО НЕ ЗАПИСУЄ.
 **************************************************************/
function previewDashboardDoctorPayroll(options) {

  const result =
    pfBuildDoctorPayroll_(
      options || {}
    );

  const report = {

    ok:
      true,

    mode:
      'DRY_RUN',

    sourceSheet:
      PF_DOCTOR_PAYROLL.sourceSheet,

    period: {
      from:
        pfDoctorPayrollFormatDate_(
          result.period.from
        ),

      to:
        pfDoctorPayrollFormatDate_(
          result.period.to
        )
    },

    rate:
      PF_DOCTOR_PAYROLL.rate,

    doctors:
      result.rows,

    totalAccrual:
      result.totalAccrual,

    sourceRowsRead:
      result.sourceRowsRead,

    incomeRowsInPeriod:
      result.incomeRowsInPeriod,

    matchedDoctorRows:
      result.matchedDoctorRows,

    excludedRows:
      result.excludedRows,

    noCellsWritten:
      true
  };

  Logger.log(
    'previewDashboardDoctorPayroll: ' +
    JSON.stringify(
      report,
      null,
      2
    )
  );

  return report;
}


/**************************************************************
 * 2. ЗАПИС У ДАШБОРД
 *
 * Записує тільки:
*   Дашборд!D36:G42
 *
 * База операцій НЕ змінюється.
 **************************************************************/
function refreshDashboardDoctorPayroll(options) {

  options =
    options || {};

  const showToast =
    options.showToast !== false;

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(
    30000
  );

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const dashboard =
    ss.getSheetByName(
      PF_DOCTOR_PAYROLL
        .dashboardSheet
    );

  let target =
    null;

  let snapshot =
    null;

  try {

    if (!dashboard) {
      throw new Error(
        'Не знайдено лист "' +
        PF_DOCTOR_PAYROLL.dashboardSheet +
        '".'
      );
    }

    /*
     * Перевіряємо структуру
     * ДО будь-якого запису.
     */
    pfAssertDoctorPayrollDashboard_(
      dashboard
    );

       const payrollOptions =
      Object.assign(
        {},
        options
      );

    if (
      !payrollOptions.from ||
      !payrollOptions.to
    ) {
      const rawCentralPeriod =
        dashboardCentralPeriodV1Build_();

      const centralPeriod =
        rawCentralPeriod.period ||
        rawCentralPeriod;

      payrollOptions.from =
        dashboardDoctorPayrollExplainParseDateV1_(
          centralPeriod.from
        );

      payrollOptions.to =
        dashboardDoctorPayrollExplainParseDateV1_(
          centralPeriod.to
        );
    }

    const result =
      pfBuildDoctorPayroll_(
        payrollOptions
      );

    target =
      dashboard.getRange(
        PF_DOCTOR_PAYROLL
          .outputRange
      );

    snapshot =
      pfDoctorPayrollSnapshot_(
        target
      );

    /*
     * Результат:
     *
     * D declaration
     * E consultations
     * F other services
     * G total
     */
    const output =
      result.rows.map(
        function (doctor) {

          return [
            doctor.declarationAccrual,
            doctor.consultationAccrual,
            doctor.otherServicesAccrual,
            doctor.totalAccrual
          ];
        }
      );

    if (
      output.length !==
      target.getNumRows()
    ) {

      throw new Error(
        'Кількість лікарів (' +
        output.length +
        ') не відповідає кількості рядків ' +
        target.getA1Notation() +
        ' (' +
        target.getNumRows() +
        ').'
      );
    }

    /*
     * Один пакетний запис.
     * Жодних setValue() у циклі.
     */
    target.setValues(
      output
    );

    SpreadsheetApp.flush();

    const report = {

      ok:
        true,

      sourceSheet:
        PF_DOCTOR_PAYROLL.sourceSheet,

      targetSheet:
        PF_DOCTOR_PAYROLL.dashboardSheet,

      targetRange:
        target.getA1Notation(),

      period: {
        from:
          pfDoctorPayrollFormatDate_(
            result.period.from
          ),

        to:
          pfDoctorPayrollFormatDate_(
            result.period.to
          )
      },

      rate:
        PF_DOCTOR_PAYROLL.rate,

      doctorsWritten:
        result.rows.length,

      totalAccrual:
        result.totalAccrual,

      sourceRowsRead:
        result.sourceRowsRead,

      incomeRowsInPeriod:
        result.incomeRowsInPeriod,

      matchedDoctorRows:
        result.matchedDoctorRows,

      noSourceCellsWritten:
        true
    };

    Logger.log(
      'refreshDashboardDoctorPayroll: ' +
      JSON.stringify(
        report,
        null,
        2
      )
    );

    if (showToast) {

      ss.toast(
        'Нарахування лікарям оновлено: ' +
        pfDoctorPayrollMoney_(
          result.totalAccrual
        ) +
        ' грн',
        'Дашборд',
        5
      );
    }

    return report;

  } catch (error) {

    /*
     * Якщо щось пішло не так —
     * повертаємо тільки наш
     * D36:G41.
     */
    if (
      target &&
      snapshot
    ) {

      try {

        target.setValues(
          snapshot
        );

        SpreadsheetApp.flush();

      } catch (
        restoreError
      ) {

        Logger.log(
          'Помилка відкату блоку лікарів: ' +
          restoreError.message
        );
      }
    }

    Logger.log(
      error.stack ||
      error.message
    );

    throw error;

  } finally {

    lock.releaseLock();
  }
}


/**************************************************************
 * 3. ЯДРО РОЗРАХУНКУ
 *
 * Read-only.
 *
 * Нічого не записує.
 **************************************************************/
function pfBuildDoctorPayroll_(options) {

  options =
    options || {};

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const source =
    ss.getSheetByName(
      PF_DOCTOR_PAYROLL
        .sourceSheet
    );

  const dashboard =
    ss.getSheetByName(
      PF_DOCTOR_PAYROLL
        .dashboardSheet
    );

  if (!source) {
    throw new Error(
      'Не знайдено лист "' +
      PF_DOCTOR_PAYROLL.sourceSheet +
      '".'
    );
  }

  if (!dashboard) {
    throw new Error(
      'Не знайдено лист "' +
      PF_DOCTOR_PAYROLL.dashboardSheet +
      '".'
    );
  }

  const period =
    pfDoctorPayrollResolvePeriod_(
      options
    );

  const headers =
    pfDoctorPayrollFindHeaders_(
      source
    );

  /*
   * Список лікарів беремо
   * безпосередньо з Дашборду.
   *
   * Тому зміна порядку лікарів
   * у B36:B41 не зламає відповідність.
   */
  const doctorValues =
    dashboard
      .getRange(
        PF_DOCTOR_PAYROLL
          .doctorRange
      )
      .getDisplayValues();

  const doctors =
    doctorValues.map(
      function (row) {

        const displayName =
          String(
            row[0] || ''
          ).trim();

        if (!displayName) {
          throw new Error(
            'У діапазоні ' +
            PF_DOCTOR_PAYROLL.doctorRange +
            ' знайдено порожнє ім’я лікаря.'
          );
        }

        return {

          name:
            displayName,

          key:
            pfDoctorPayrollDoctorKey_(
              displayName
            ),

          declarationRevenue:
            0,

          consultationRevenue:
            0,

          otherServicesRevenue:
            0,

          sourceRows:
            0
        };
      }
    );

  const doctorMap =
    new Map();

  doctors.forEach(
    function (doctor) {

      if (
        doctorMap.has(
          doctor.key
        )
      ) {
        throw new Error(
          'Після нормалізації дублюється лікар "' +
          doctor.name +
          '".'
        );
      }

      doctorMap.set(
        doctor.key,
        doctor
      );
    }
  );

  const lastRow =
    source.getLastRow();

  const lastCol =
    source.getLastColumn();

  if (
    lastRow <=
    headers.row
  ) {

    return {
      period:
        period,

      rows:
        doctors.map(
          pfDoctorPayrollFinalizeDoctor_
        ),

      totalAccrual:
        0,

      sourceRowsRead:
        0,

      incomeRowsInPeriod:
        0,

      matchedDoctorRows:
        0,

      excludedRows:
        0
    };
  }

  const values =
    source
      .getRange(
        headers.row + 1,
        1,
        lastRow - headers.row,
        lastCol
      )
      .getValues();

  const seenIds =
    new Set();

  let incomeRowsInPeriod =
    0;

  let matchedDoctorRows =
    0;

  let excludedRows =
    0;

  values.forEach(
    function (row, index) {

      const sheetRow =
        headers.row +
        1 +
        index;

      /*
       * 1. Тільки доходи.
       */
      const operationType =
        pfDoctorPayrollNormalize_(
          row[
            headers.col.type
          ]
        );

      if (
        operationType !==
        pfDoctorPayrollNormalize_(
          PF_DOCTOR_PAYROLL
            .incomeType
        )
      ) {
        return;
      }


      /*
       * 2. Валідний статус.
       */
      const status =
        pfDoctorPayrollNormalize_(
          row[
            headers.col.status
          ]
        );

      const statusAllowed =
        PF_DOCTOR_PAYROLL
          .allowedStatuses
          .some(
            function (
              allowedStatus
            ) {

              return (
                status ===
                pfDoctorPayrollNormalize_(
                  allowedStatus
                )
              );
            }
          );

      if (!statusAllowed) {

        excludedRows++;

        return;
      }


      /*
       * 3. Дата повинна бути
       * всередині вибраного періоду.
       */
      const transactionDate =
        pfDoctorPayrollDateOnly_(
          row[
            headers.col.date
          ]
        );

      if (!transactionDate) {

        throw new Error(
          'Некоректна дата у рядку ' +
          sheetRow +
          ', колонка "' +
          PF_DOCTOR_PAYROLL
            .headers.date +
          '".'
        );
      }

      if (
        transactionDate.getTime() <
        period.from.getTime() ||

        transactionDate.getTime() >
        period.to.getTime()
      ) {
        return;
      }

      incomeRowsInPeriod++;


      /*
       * 4. Перевірка дубльованого ID.
       */
      const operationId =
        String(
          row[
            headers.col.id
          ] || ''
        ).trim();

      if (operationId) {

        if (
          seenIds.has(
            operationId
          )
        ) {

          throw new Error(
            'Дубль ID "' +
            operationId +
            '" у Базі операцій.'
          );
        }

        seenIds.add(
          operationId
        );
      }


      /*
       * 5. Лікар.
       */
      const rawDoctor =
        row[
          headers.col.doctor
        ];

      if (
        rawDoctor === '' ||
        rawDoctor == null
      ) {
        return;
      }

      const doctorKey =
        pfDoctorPayrollDoctorKey_(
          rawDoctor
        );

      const doctor =
        doctorMap.get(
          doctorKey
        );

      /*
       * На Дашборд рахуємо тільки
       * лікарів із B36:B41.
       */
      if (!doctor) {
        return;
      }


      /*
       * 6. Сума доходу.
       */
      const amount =
        pfDoctorPayrollNumber_(
          row[
            headers.col.amount
          ],
          sheetRow
        );


      /*
       * 7. Визначаємо,
       * у яку з трьох колонок
       * потрапляє запис.
       */
      const category =
        pfDoctorPayrollNormalize_(
          row[
            headers.col.category
          ]
        );

      const article =
        pfDoctorPayrollNormalize_(
          row[
            headers.col.article
          ]
        );

      const declarationKey =
        pfDoctorPayrollNormalize_(
          PF_DOCTOR_PAYROLL
            .declarationArticle
        );

      const consultationKey =
        pfDoctorPayrollNormalize_(
          PF_DOCTOR_PAYROLL
            .consultationCategory
        );


      /*
       * D:
       * деклараційні пацієнти.
       */
      if (
        article ===
        declarationKey
      ) {

        doctor
          .declarationRevenue +=
          amount;

        doctor.sourceRows++;

        matchedDoctorRows++;

        return;
      }


      /*
       * E:
       * решта консультацій.
       */
      if (
        category ===
        consultationKey
      ) {

        doctor
          .consultationRevenue +=
          amount;

        doctor.sourceRows++;

        matchedDoctorRows++;

        return;
      }


      /*
       * F:
       * інші послуги.
       *
       * Продаж вакцин / товарів
       * сюди НЕ включаємо.
       */
      const excludedCategory =
        PF_DOCTOR_PAYROLL
          .excludedOtherCategories
          .some(
            function (
              excluded
            ) {

              return (
                category ===
                pfDoctorPayrollNormalize_(
                  excluded
                )
              );
            }
          );

      if (
        excludedCategory
      ) {

        excludedRows++;

        return;
      }


      doctor
        .otherServicesRevenue +=
        amount;

      doctor.sourceRows++;

      matchedDoctorRows++;

    }
  );


  /*
   * 40% розраховуємо ТІЛЬКИ
   * після повної агрегації доходу.
   *
   * Не округлюємо кожну операцію
   * окремо.
   */
  const rows =
    doctors.map(
      pfDoctorPayrollFinalizeDoctor_
    );

  const totalAccrual =
    pfDoctorPayrollRoundMoney_(
      rows.reduce(
        function (
          total,
          doctor
        ) {

          return (
            total +
            doctor.totalAccrual
          );
        },
        0
      )
    );

  return {

    period:
      period,

    rows:
      rows,

    totalAccrual:
      totalAccrual,

    sourceRowsRead:
      values.length,

    incomeRowsInPeriod:
      incomeRowsInPeriod,

    matchedDoctorRows:
      matchedDoctorRows,

    excludedRows:
      excludedRows
  };
}


/**************************************************************
 * 4. ФІНАЛІЗАЦІЯ ОДНОГО ЛІКАРЯ
 **************************************************************/
function pfDoctorPayrollFinalizeDoctor_(
  doctor
) {

  const rate =
    PF_DOCTOR_PAYROLL.rate;

  const declarationAccrual =
    pfDoctorPayrollRoundMoney_(
      doctor
        .declarationRevenue *
      rate
    );

  const consultationAccrual =
    pfDoctorPayrollRoundMoney_(
      doctor
        .consultationRevenue *
      rate
    );

  const otherServicesAccrual =
    pfDoctorPayrollRoundMoney_(
      doctor
        .otherServicesRevenue *
      rate
    );

  const totalAccrual =
    pfDoctorPayrollRoundMoney_(
      declarationAccrual +
      consultationAccrual +
      otherServicesAccrual
    );

  return {

    name:
      doctor.name,

    declarationRevenue:
      pfDoctorPayrollRoundMoney_(
        doctor.declarationRevenue
      ),

    declarationAccrual:
      declarationAccrual,

    consultationRevenue:
      pfDoctorPayrollRoundMoney_(
        doctor.consultationRevenue
      ),

    consultationAccrual:
      consultationAccrual,

    otherServicesRevenue:
      pfDoctorPayrollRoundMoney_(
        doctor.otherServicesRevenue
      ),

    otherServicesAccrual:
      otherServicesAccrual,

    totalAccrual:
      totalAccrual,

    sourceRows:
      doctor.sourceRows
  };
}


/**************************************************************
 * 5. ПЕРІОД
 *
 * За замовчуванням:
 * DASH_DATE_FROM / DASH_DATE_TO.
 *
 * Можна тестувати вручну:
 *
 * previewDashboardDoctorPayroll({
 *   from: new Date(2026, 6, 1),
 *   to:   new Date(2026, 6, 30)
 * });
 **************************************************************/
function pfDoctorPayrollResolvePeriod_(
  options
) {

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  let from =
    options.from || null;

  let to =
    options.to || null;

  if (
    !from ||
    !to
  ) {

    const fromRange =
      ss.getRangeByName(
        PF_DOCTOR_PAYROLL
          .namedRanges.from
      );

    const toRange =
      ss.getRangeByName(
        PF_DOCTOR_PAYROLL
          .namedRanges.to
      );

    if (
      !fromRange ||
      !toRange
    ) {

      throw new Error(
        'Не знайдено named ranges ' +
        PF_DOCTOR_PAYROLL
          .namedRanges.from +
        ' / ' +
        PF_DOCTOR_PAYROLL
          .namedRanges.to +
        '.'
      );
    }

    from =
      fromRange.getValue();

    to =
      toRange.getValue();
  }

  from =
    pfDoctorPayrollDateOnly_(
      from
    );

  to =
    pfDoctorPayrollDateOnly_(
      to
    );

  if (
    !from ||
    !to
  ) {

    throw new Error(
      'Не визначено коректний період для нарахувань лікарям.'
    );
  }

  if (
    from.getTime() >
    to.getTime()
  ) {

    throw new Error(
      'Дата початку періоду більша за дату завершення.'
    );
  }

  return {
    from:
      from,

    to:
      to
  };
}


/**************************************************************
 * 6. ПОШУК ЗАГОЛОВКІВ
 **************************************************************/
function pfDoctorPayrollFindHeaders_(
  sheet
) {

  const required =
    PF_DOCTOR_PAYROLL.headers;

  const scanRows =
    Math.min(
      10,
      Math.max(
        sheet.getLastRow(),
        1
      )
    );

  const display =
    sheet
      .getRange(
        1,
        1,
        scanRows,
        sheet.getLastColumn()
      )
      .getDisplayValues();

  for (
    let rowIndex = 0;
    rowIndex < display.length;
    rowIndex++
  ) {

    const map =
      {};

    display[
      rowIndex
    ].forEach(
      function (
        value,
        columnIndex
      ) {

        map[
          pfDoctorPayrollNormalize_(
            value
          )
        ] =
          columnIndex;
      }
    );

    const indexes =
      {};

    let allFound =
      true;

    Object.keys(
      required
    ).forEach(
      function (
        key
      ) {

        const headerKey =
          pfDoctorPayrollNormalize_(
            required[
              key
            ]
          );

        if (
          map[
            headerKey
          ] === undefined
        ) {

          allFound =
            false;

        } else {

          indexes[
            key
          ] =
            map[
              headerKey
            ];
        }
      }
    );

    if (allFound) {

      return {
        row:
          rowIndex + 1,

        col:
          indexes
      };
    }
  }

  throw new Error(
    'Не знайдено всі необхідні заголовки на листі "' +
    sheet.getName() +
    '".'
  );
}


/**************************************************************
 * 7. ПЕРЕВІРКА СТРУКТУРИ ДАШБОРДУ
 **************************************************************/
function pfAssertDoctorPayrollDashboard_(
  dashboard
) {

  const doctorRange =
    dashboard.getRange(
      PF_DOCTOR_PAYROLL
        .doctorRange
    );

  const outputRange =
    dashboard.getRange(
      PF_DOCTOR_PAYROLL
        .outputRange
    );

  if (
    doctorRange
      .getMergedRanges()
      .length
  ) {

    throw new Error(
      PF_DOCTOR_PAYROLL.doctorRange +
      ' містить об’єднані клітинки.'
    );
  }

  if (
    outputRange
      .getMergedRanges()
      .length
  ) {

    throw new Error(
      PF_DOCTOR_PAYROLL.outputRange +
      ' містить об’єднані клітинки.'
    );
  }

  const declarationHeader =
    pfDoctorPayrollNormalize_(
      dashboard
        .getRange(
          'D25'
        )
        .getDisplayValue()
    );

  const consultationHeader =
    pfDoctorPayrollNormalize_(
      dashboard
        .getRange(
          'E25'
        )
        .getDisplayValue()
    );

  const otherHeader =
    pfDoctorPayrollNormalize_(
      dashboard
        .getRange(
          'F25'
        )
        .getDisplayValue()
    );

  const totalHeader =
    pfDoctorPayrollNormalize_(
      dashboard
        .getRange(
          'G25'
        )
        .getDisplayValue()
    );

  if (
    declarationHeader
      .indexOf(
        'декларац'
      ) === -1 ||

    consultationHeader
      .indexOf(
        'консультац'
      ) === -1 ||

    otherHeader
      .indexOf(
        'інші послуги'
      ) === -1 ||

    totalHeader
      .indexOf(
        'загальна сума'
      ) === -1
  ) {

    throw new Error(
      'Структура таблиці лікарів змінилася. Перевірте D25:G25.'
    );
  }
}


/**************************************************************
 * 8. НОРМАЛІЗАЦІЯ ПІБ
 **************************************************************/
function pfDoctorPayrollDoctorKey_(
  value
) {

  const normalized =
    pfDoctorPayrollNormalize_(
      value
    )
      .replace(
        /[.,]/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      )
      .trim();

  return (
    PF_DOCTOR_PAYROLL
      .doctorAliases[
        normalized
      ] ||
    normalized
  );
}


/**************************************************************
 * 9. ЗАГАЛЬНА НОРМАЛІЗАЦІЯ ТЕКСТУ
 **************************************************************/
function pfDoctorPayrollNormalize_(
  value
) {

  return String(
    value == null
      ? ''
      : value
  )
    .normalize(
      'NFKC'
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
    .toLocaleLowerCase(
      'uk-UA'
    );
}


/**************************************************************
 * 10. ЧИСЛО
 **************************************************************/
function pfDoctorPayrollNumber_(
  value,
  row
) {

  if (
    value === '' ||
    value == null
  ) {
    return 0;
  }

  if (
    typeof value ===
      'number' &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }

  const parsed =
    Number(
      String(
        value
      )
        .replace(
          /\u00A0/g,
          ''
        )
        .replace(
          /\s/g,
          ''
        )
        .replace(
          ',',
          '.'
        )
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {

    throw new Error(
      'Некоректна сума у рядку ' +
      row +
      '.'
    );
  }

  return parsed;
}


/**************************************************************
 * 11. ДАТА БЕЗ ЧАСУ
 **************************************************************/
function pfDoctorPayrollDateOnly_(
  value
) {

  if (
    Object.prototype
      .toString
      .call(
        value
      ) !==
      '[object Date]' ||
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


/**************************************************************
 * 12. SNAPSHOT
 **************************************************************/
function pfDoctorPayrollSnapshot_(
  range
) {

  const values =
    range.getValues();

  const formulas =
    range.getFormulas();

  return values.map(
    function (
      row,
      rowIndex
    ) {

      return row.map(
        function (
          value,
          columnIndex
        ) {

          return (
            formulas[
              rowIndex
            ][
              columnIndex
            ] ||
            value
          );
        }
      );
    }
  );
}


/**************************************************************
 * 13. ОКРУГЛЕННЯ
 **************************************************************/
function pfDoctorPayrollRoundMoney_(
  value
) {

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
      100
    ) /
    100
  );
}


/**************************************************************
 * 14. ФОРМАТ ДАТИ ДЛЯ ЖУРНАЛУ
 **************************************************************/
function pfDoctorPayrollFormatDate_(
  date
) {

  return Utilities.formatDate(
    date,
    Session
      .getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


/**************************************************************
 * 15. ФОРМАТ СУМИ ДЛЯ TOAST
 **************************************************************/
function pfDoctorPayrollMoney_(
  value
) {

  return (
    Math.round(
      Number(value) *
      100
    ) /
    100
  )
    .toFixed(
      2
    );
}

function dashboardDoctorPayrollSourceAudit() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      'Нарахування'
    );


  if (!sheet) {

    throw new Error(
      'Не знайдено лист "Нарахування".'
    );
  }


  const lastRow =
    sheet.getLastRow();


  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 1 ||
    lastColumn < 1
  ) {

    const emptyResult = {

      ok:
        true,

      mode:
        'STEP_11_3A_DOCTOR_PAYROLL_SOURCE_AUDIT',

      sheet:
        sheet.getName(),

      empty:
        true,

      lastRow:
        lastRow,

      lastColumn:
        lastColumn,

      headers:
        [],

      sampleRows:
        [],

      noCellsWritten:
        true,

      noChartsModified:
        true,

      noTriggersModified:
        true
    };


    Logger.log(
      'dashboardDoctorPayrollSourceAudit: ' +
      JSON.stringify(
        emptyResult,
        null,
        2
      )
    );


    return emptyResult;
  }


  const values =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getValues();


  const displayValues =
    sheet
      .getRange(
        1,
        1,
        lastRow,
        lastColumn
      )
      .getDisplayValues();


  const headers =
    displayValues[0]
      .map(
        function(value, index) {

          return {

            column:
              index + 1,

            a1Column:
              dashboardDoctorPayrollColumnLetter_(
                index + 1
              ),

            header:
              String(
                value || ''
              ).trim()
          };
        }
      );


  const sampleRows =
    [];


  for (
    let rowIndex = 1;

    rowIndex < displayValues.length &&
    sampleRows.length < 20;

    rowIndex++
  ) {

    const row =
      displayValues[rowIndex];


    const hasData =
      row.some(
        function(value) {

          return String(
            value || ''
          ).trim() !== '';
        }
      );


    if (!hasData) {
      continue;
    }


    sampleRows.push({

      sourceRow:
        rowIndex + 1,

      values:
        row
    });
  }


  const result = {

    ok:
      true,

    mode:
      'STEP_11_3A_DOCTOR_PAYROLL_SOURCE_AUDIT',

    sheet:
      sheet.getName(),

    empty:
      false,

    lastRow:
      lastRow,

    lastColumn:
      lastColumn,

    headers:
      headers,

    sampleRows:
      sampleRows,

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardDoctorPayrollSourceAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


function dashboardDoctorPayrollColumnLetter_(
  column
) {

  let value =
    Number(
      column
    );


  let result =
    '';


  while (
    value > 0
  ) {

    const remainder =
      (
        value - 1
      ) % 26;


    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;


    value =
      Math.floor(
        (
          value - 1
        ) / 26
      );
  }


  return result;
}

function dashboardDoctorPayrollTaxonomyAudit() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();


  const sheet =
    ss.getSheetByName(
      'Нарахування'
    );


  if (!sheet) {

    throw new Error(
      'Не знайдено лист "Нарахування".'
    );
  }


  const lastRow =
    sheet.getLastRow();


  const lastColumn =
    sheet.getLastColumn();


  if (
    lastRow < 2 ||
    lastColumn < 10
  ) {

    throw new Error(
      'Лист "Нарахування" не містить очікуваної структури A:J.'
    );
  }


  const range =
    sheet.getRange(
      1,
      1,
      lastRow,
      lastColumn
    );


  const values =
    range.getValues();


  const displayValues =
    range.getDisplayValues();


  /*
   * За результатом STEP 11.3A:
   *
   * A ID операції
   * B Тип нарахування
   * C Місяць / дата нарахування
   * D Категорія
   * E Стаття
   * F Сума
   * G Пацієнт
   * H Коментар
   * I Хто провів операцію
   * J Дата і час операції
   */
  const IDX = {

    id: 0,
    type: 1,
    date: 2,
    category: 3,
    article: 4,
    amount: 5,
    patient: 6,
    comment: 7,
    operator: 8,
    createdAt: 9
  };


  const typeStats =
    Object.create(null);


  const categoryStats =
    Object.create(null);


  const articleStats =
    Object.create(null);


  const doctorCandidates =
    [];


  let nonEmptyRows =
    0;


  let validAmountRows =
    0;


  let invalidAmountRows =
    0;


  function clean(value) {

    return String(
      value === undefined ||
      value === null
        ? ''
        : value
    )
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }


  function normalize(value) {

    return clean(
      value
    ).toLowerCase();
  }


  function numberValue(value) {

    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {

      return value;
    }


    const text =
      clean(
        value
      )
        .replace(/\s/g, '')
        .replace(',', '.');


    if (!text) {

      return null;
    }


    const parsed =
      Number(
        text
      );


    return Number.isFinite(parsed)
      ? parsed
      : null;
  }


  function addStat(
    map,
    key,
    amount
  ) {

    const normalizedKey =
      clean(
        key
      ) || '(порожньо)';


    if (!map[normalizedKey]) {

      map[normalizedKey] = {

        value:
          normalizedKey,

        rows:
          0,

        total:
          0
      };
    }


    map[normalizedKey].rows++;


    if (
      amount !== null &&
      Number.isFinite(amount)
    ) {

      map[normalizedKey].total +=
        amount;
    }
  }


  function statArray(map) {

    return Object.keys(map)
      .map(
        function(key) {

          return {

            value:
              map[key].value,

            rows:
              map[key].rows,

            total:
              Math.round(
                (
                  Number(
                    map[key].total
                  ) +
                  Number.EPSILON
                ) *
                100
              ) / 100
          };
        }
      )
      .sort(
        function(first, second) {

          return (
            second.rows -
            first.rows
          );
        }
      );
  }


  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {

    const rawRow =
      values[rowIndex];


    const displayRow =
      displayValues[rowIndex];


    const hasData =
      displayRow.some(
        function(value) {

          return clean(
            value
          ) !== '';
        }
      );


    if (!hasData) {

      continue;
    }


    nonEmptyRows++;


    const type =
      clean(
        displayRow[IDX.type]
      );


    const category =
      clean(
        displayRow[IDX.category]
      );


    const article =
      clean(
        displayRow[IDX.article]
      );


    const comment =
      clean(
        displayRow[IDX.comment]
      );


    const patient =
      clean(
        displayRow[IDX.patient]
      );


    const operator =
      clean(
        displayRow[IDX.operator]
      );


    const amount =
      numberValue(
        rawRow[IDX.amount]
      );


    if (amount === null) {

      invalidAmountRows++;

    } else {

      validAmountRows++;
    }


    addStat(
      typeStats,
      type,
      amount
    );


    addStat(
      categoryStats,
      category,
      amount
    );


    addStat(
      articleStats,
      article,
      amount
    );


    /*
     * =========================================================
     * BROAD DOCTOR CANDIDATE DETECTOR
     *
     * Це НЕ бізнес-правило.
     * Це тільки diagnostic search.
     * =========================================================
     */

    const searchableText =
      normalize(
        [
          type,
          category,
          article,
          comment,
          patient
        ].join(
          ' | '
        )
      );


    const reasons =
      [];


    if (
      searchableText.indexOf(
        'лікар'
      ) !== -1
    ) {

      reasons.push(
        'contains:лікар'
      );
    }


    if (
      searchableText.indexOf(
        'зарплат'
      ) !== -1
    ) {

      reasons.push(
        'contains:зарплат'
      );
    }


    if (
      searchableText.indexOf(
        'бонус'
      ) !== -1
    ) {

      reasons.push(
        'contains:бонус'
      );
    }


    if (
      searchableText.indexOf(
        'консультац'
      ) !== -1
    ) {

      reasons.push(
        'contains:консультац'
      );
    }


    if (
      searchableText.indexOf(
        'декларац'
      ) !== -1
    ) {

      reasons.push(
        'contains:декларац'
      );
    }


    if (
      reasons.length > 0
    ) {

      doctorCandidates.push({

        sourceRow:
          rowIndex + 1,

        id:
          clean(
            displayRow[IDX.id]
          ),

        date:
          clean(
            displayRow[IDX.date]
          ),

        type:
          type,

        category:
          category,

        article:
          article,

        amount:
          amount,

        patient:
          patient,

        comment:
          comment,

        operator:
          operator,

        reasons:
          reasons
      });
    }
  }


  const result = {

    ok:
      true,

    mode:
      'STEP_11_3B_DOCTOR_PAYROLL_TAXONOMY_AUDIT',

    sheet:
      sheet.getName(),

    nonEmptyRows:
      nonEmptyRows,

    validAmountRows:
      validAmountRows,

    invalidAmountRows:
      invalidAmountRows,

    /*
     * Повна фактична таксономія.
     */
    types:
      statArray(
        typeStats
      ),

    categories:
      statArray(
        categoryStats
      ),

    articles:
      statArray(
        articleStats
      ),

    /*
     * Лише кандидати.
     *
     * Це ще НЕ остаточний payroll dataset.
     */
    doctorCandidateCount:
      doctorCandidates.length,

    doctorCandidates:
      doctorCandidates,

    /*
     * Важлива structural warning:
     * за STEP 11.3A окремої
     * колонки "Лікар" немає.
     */
    explicitDoctorColumnFound:
      false,

    doctorIdentityStatus:
      'UNKNOWN — окремої колонки "Лікар" у Нарахування немає',

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardDoctorPayrollTaxonomyAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}

/**
 * ============================================================
 * STEP 11.3C
 * DOCTOR PAYROLL SOURCE DISCOVERY AUDIT
 *
 * READ ONLY.
 *
 * Шукає у всій книзі потенційні джерела
 * даних для "Нарахування лікарям".
 *
 * Нічого НЕ записує.
 * ============================================================
 */
function dashboardDoctorPayrollSourceDiscoveryAudit() {

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();


  const sheets =
    ss.getSheets();


  const keywords = [
    'лікар',
    'нарахув',
    'зарплат',
    'бонус',
    'декларац',
    'консультац',
    'приватн',
    'послуг'
  ];


  const normalize =
    function(value) {

      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      )
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };


  const reports =
    [];


  sheets.forEach(
    function(sheet) {

      const lastRow =
        sheet.getLastRow();


      const lastColumn =
        sheet.getLastColumn();


      if (
        lastRow < 1 ||
        lastColumn < 1
      ) {

        return;
      }


      const values =
        sheet
          .getRange(
            1,
            1,
            lastRow,
            lastColumn
          )
          .getDisplayValues();


      /*
       * ======================================================
       * 1. HEADER DISCOVERY
       *
       * Перевіряємо перші 5 рядків,
       * бо не у всіх листах header обов'язково row 1.
       * ======================================================
       */
      const headerMatches =
        [];


      const headerProbeRows =
        Math.min(
          5,
          values.length
        );


      for (
        let rowIndex = 0;
        rowIndex < headerProbeRows;
        rowIndex++
      ) {

        for (
          let columnIndex = 0;
          columnIndex < lastColumn;
          columnIndex++
        ) {

          const cellText =
            normalize(
              values[rowIndex][columnIndex]
            );


          if (!cellText) {

            continue;
          }


          const matchedKeywords =
            keywords.filter(
              function(keyword) {

                return (
                  cellText.indexOf(
                    keyword
                  ) !== -1
                );
              }
            );


          if (
            matchedKeywords.length
          ) {

            headerMatches.push({

              row:
                rowIndex + 1,

              column:
                columnIndex + 1,

              a1:
                sheet
                  .getRange(
                    rowIndex + 1,
                    columnIndex + 1
                  )
                  .getA1Notation(),

              value:
                values[rowIndex][columnIndex],

              keywords:
                matchedKeywords
            });
          }
        }
      }


      /*
       * ======================================================
       * 2. ROW CONTENT DISCOVERY
       * ======================================================
       */
      let matchedRowCount =
        0;


      const rowSamples =
        [];


      for (
        let rowIndex = 0;
        rowIndex < values.length;
        rowIndex++
      ) {

        const row =
          values[rowIndex];


        const searchable =
          normalize(
            row.join(
              ' | '
            )
          );


        if (!searchable) {

          continue;
        }


        const matchedKeywords =
          keywords.filter(
            function(keyword) {

              return (
                searchable.indexOf(
                  keyword
                ) !== -1
              );
            }
          );


        if (
          matchedKeywords.length === 0
        ) {

          continue;
        }


        matchedRowCount++;


        /*
         * Не засмічуємо Logger сотнями рядків.
         * З кожного листа максимум 25 прикладів.
         */
        if (
          rowSamples.length < 25
        ) {

          const nonEmptyCells =
            [];


          row.forEach(
            function(value, columnIndex) {

              const cleaned =
                String(
                  value === undefined ||
                  value === null
                    ? ''
                    : value
                ).trim();


              if (
                cleaned !== ''
              ) {

                nonEmptyCells.push({

                  column:
                    columnIndex + 1,

                  value:
                    cleaned
                });
              }
            }
          );


          rowSamples.push({

            sourceRow:
              rowIndex + 1,

            keywords:
              matchedKeywords,

            cells:
              nonEmptyCells.slice(
                0,
                15
              )
          });
        }
      }


      /*
       * ======================================================
       * 3. SOURCE SCORE
       * ======================================================
       */

      let score =
        0;


      headerMatches.forEach(
        function(match) {

          const normalizedHeader =
            normalize(
              match.value
            );


          if (
            normalizedHeader.indexOf(
              'лікар'
            ) !== -1
          ) {

            score +=
              100;
          }


          if (
            normalizedHeader.indexOf(
              'нарахув'
            ) !== -1
          ) {

            score +=
              80;
          }


          if (
            normalizedHeader.indexOf(
              'сума'
            ) !== -1
          ) {

            score +=
              10;
          }
        }
      );


      score +=
        Math.min(
          matchedRowCount,
          50
        );


      /*
       * Порожні за змістом листи
       * до результату не додаємо.
       */
      if (
        headerMatches.length === 0 &&
        matchedRowCount === 0
      ) {

        return;
      }


      reports.push({

        sheet:
          sheet.getName(),

        lastRow:
          lastRow,

        lastColumn:
          lastColumn,

        score:
          score,

        headerMatches:
          headerMatches,

        matchedRowCount:
          matchedRowCount,

        rowSamples:
          rowSamples
      });
    }
  );


  reports.sort(
    function(first, second) {

      return (
        second.score -
        first.score
      );
    }
  );


  const result = {

    ok:
      true,

    mode:
      'STEP_11_3C_DOCTOR_PAYROLL_SOURCE_DISCOVERY',

    sheetsScanned:
      sheets.length,

    candidateSheets:
      reports.length,

    candidates:
      reports,

    /*
     * Відомий результат STEP 11.3B.
     */
    currentAccrualSheetStatus:
      'Нарахування містить тільки vaccine accrual/write-off rows',

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noCacheCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardDoctorPayrollSourceDiscoveryAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}
function dashboardDoctorPayrollBaseOperationsHeaderAuditV1() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      PF_DOCTOR_PAYROLL.sourceSheet
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
      PF_DOCTOR_PAYROLL.sourceSheet +
      '».'
    );
  }

  const lastRow =
    Math.max(
      sheet.getLastRow(),
      1
    );

  const lastColumn =
    Math.max(
      sheet.getLastColumn(),
      1
    );

  const scanRows =
    Math.min(
      10,
      lastRow
    );

  const values =
    sheet
      .getRange(
        1,
        1,
        scanRows,
        lastColumn
      )
      .getDisplayValues();

  const normalize =
    function(value) {
      return String(
        value === undefined ||
        value === null
          ? ''
          : value
      )
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

  const expectedHeaders =
    Object.keys(
      PF_DOCTOR_PAYROLL.headers
    ).map(
      function(key) {
        return {
          field: key,
          expected:
            PF_DOCTOR_PAYROLL
              .headers[key]
        };
      }
    );

  const scannedRows =
    values
      .map(
        function(row, rowIndex) {
          const cells =
            row
              .map(
                function(value, columnIndex) {
                  return {
                    column:
                      columnIndex + 1,
                    value:
                      String(value || '').trim()
                  };
                }
              )
              .filter(
                function(cell) {
                  return cell.value !== '';
                }
              );

          const matches =
            expectedHeaders
              .map(
                function(header) {
                  const found =
                    cells.find(
                      function(cell) {
                        return (
                          normalize(
                            cell.value
                          ) ===
                          normalize(
                            header.expected
                          )
                        );
                      }
                    );

                  return found
                    ? {
                        field:
                          header.field,
                        expected:
                          header.expected,
                        column:
                          found.column,
                        actual:
                          found.value
                      }
                    : null;
                }
              )
              .filter(
                function(item) {
                  return item !== null;
                }
              );

          return {
            row:
              rowIndex + 1,
            cells:
              cells,
            matchedHeaders:
              matches
          };
        }
      )
      .filter(
        function(item) {
          return item.cells.length > 0;
        }
      );

  const result = {
    ok: true,
    mode:
      'R0_DOCTOR_PAYROLL_BASE_OPERATIONS_HEADER_AUDIT',
    sheet:
      sheet.getName(),
    dimensions: {
      lastRow:
        lastRow,
      lastColumn:
        lastColumn
    },
    expectedHeaders:
      expectedHeaders,
    scannedRows:
      scannedRows,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollBaseOperationsHeaderAuditV1: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function dashboardDoctorPayrollCentralPeriodPreviewV1() {
  const period =
    dashboardCentralPeriodV1Build_();

  const result =
    pfBuildDoctorPayroll_({
      from:
        period.from,
      to:
        period.to
    });

  const report = {
    ok: true,
    mode:
      'R0_DOCTOR_PAYROLL_CENTRAL_PERIOD',
    period: {
      mode:
        period.mode,
      from:
        pfDoctorPayrollFormatDate_(
          result.period.from
        ),
      to:
        pfDoctorPayrollFormatDate_(
          result.period.to
        )
    },
    rate:
      PF_DOCTOR_PAYROLL.rate,
    doctors:
      result.rows,
    totalAccrual:
      result.totalAccrual,
    sourceRowsRead:
      result.sourceRowsRead,
    incomeRowsInPeriod:
      result.incomeRowsInPeriod,
    matchedDoctorRows:
      result.matchedDoctorRows,
    excludedRows:
      result.excludedRows,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollCentralPeriodPreviewV1: ' +
    JSON.stringify(
      report,
      null,
      2
    )
  );

  return report;
}
function dashboardDoctorPayrollControlTotalAuditV1() {
  const period =
    dashboardCentralPeriodV1Build_();

  const payroll =
    pfBuildDoctorPayroll_({
      from:
        period.from,
      to:
        period.to
    });

  const dashboard =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        PF_DOCTOR_PAYROLL.dashboardSheet
      );

  const dashboardValue =
    Number(
      dashboard
        .getRange('G12')
        .getValue()
    ) || 0;

  const payrollTotal =
    Number(
      payroll.totalAccrual
    ) || 0;

  const result = {
    ok: true,
    mode:
      'R0_DOCTOR_PAYROLL_CONTROL_TOTAL',
    period: {
      mode:
        period.mode,
      from:
        pfDoctorPayrollFormatDate_(
          payroll.period.from
        ),
      to:
        pfDoctorPayrollFormatDate_(
          payroll.period.to
        )
    },
    payrollPreviewTotal:
      payrollTotal,
    dashboardDisplayedTotal:
      dashboardValue,
    difference:
      Math.round(
        (
          payrollTotal -
          dashboardValue
        ) * 100
      ) / 100,
    rate:
      PF_DOCTOR_PAYROLL.rate,
    sourceRowsRead:
      payroll.sourceRowsRead,
    matchedDoctorRows:
      payroll.matchedDoctorRows,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollControlTotalAuditV1: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function dashboardDoctorPayrollExplainDifferenceV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName('База операцій');
  const dashboard = ss.getSheetByName('Дашборд');

  if (!source || !dashboard) {
    throw new Error('Не знайдено необхідний лист.');
  }

  const rawPeriod = dashboardCentralPeriodV1Build_();
  const period = rawPeriod.period || rawPeriod;

  const from = dashboardDoctorPayrollExplainParseDateV1_(
    period.from
  );
  const to = dashboardDoctorPayrollExplainParseDateV1_(
    period.to
  );

  to.setHours(23, 59, 59, 999);

  const values = source
    .getRange(
      1,
      1,
      source.getLastRow(),
      source.getLastColumn()
    )
    .getValues();

  const headers = values[0].map(function(value) {
    return String(value || '').trim();
  });

  const col = function(header) {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(
        'Не знайдено заголовок: ' + header
      );
    }

    return index;
  };

  const columns = {
    date: col('Дата транзакції'),
    amount: col('Сума'),
    doctor: col('Лікар'),
    type: col('Тип Доходи / Витрати'),
    category: col('Категорія'),
    article: col('Стаття'),
    status: col('Статус запису')
  };

  const dashboardDoctors = dashboard
    .getRange('B36:B42')
    .getDisplayValues()
    .flat()
    .map(function(value) {
      return dashboardDoctorPayrollExplainNormalizeV1_(value);
    })
    .filter(Boolean);

  const allowedStatuses = [
    '',
    'проведено',
    'імпортовано'
  ];

  const excludedCategories = [
    'вакцини',
    'косметичні засоби'
  ];

  const declarationArticle =
    dashboardDoctorPayrollExplainNormalizeV1_(
      'Огляд деклараційних пацієнтів в часи приватного прийому'
    );

  const rows = [];
  const included = [];
  const excluded = [];

  values.slice(1).forEach(function(row, offset) {
    const sheetRow = offset + 2;

    const date = dashboardDoctorPayrollExplainParseDateV1_(
      row[columns.date]
    );

    if (!date || date < from || date > to) {
      return;
    }

    const type = dashboardDoctorPayrollExplainNormalizeV1_(
      row[columns.type]
    );

    if (type !== 'доходи') {
      return;
    }

    const amount = dashboardDoctorPayrollExplainNumberV1_(
      row[columns.amount]
    );

    const doctor = String(
      row[columns.doctor] || ''
    ).trim();

    const category = dashboardDoctorPayrollExplainNormalizeV1_(
      row[columns.category]
    );

    const article = dashboardDoctorPayrollExplainNormalizeV1_(
      row[columns.article]
    );

    const status = dashboardDoctorPayrollExplainNormalizeV1_(
      row[columns.status]
    );

    let reason = '';

    if (!Number.isFinite(amount)) {
      reason = 'INVALID_AMOUNT';
    } else if (!allowedStatuses.includes(status)) {
      reason = 'STATUS_EXCLUDED';
    } else if (!doctor) {
      reason = 'NO_DOCTOR';
    } else if (excludedCategories.includes(category)) {
      reason = 'EXCLUDED_CATEGORY';
    }

    const item = {
      sheetRow: sheetRow,
      date: dashboardDoctorPayrollExplainFormatDateV1_(date),
      doctor: doctor,
      category: row[columns.category] || '',
      article: row[columns.article] || '',
      amount: amount,
      accrual: Number.isFinite(amount)
        ? amount * 0.4
        : 0,
      status: row[columns.status] || '',
      reason: reason || 'INCLUDED'
    };

    rows.push(item);

    if (reason) {
      excluded.push(item);
    } else {
      included.push(item);
    }
  });

  const byReason = {};

  excluded.forEach(function(item) {
    byReason[item.reason] =
      (byReason[item.reason] || 0) + 1;
  });

  const byDoctor = {};

  included.forEach(function(item) {
    const doctor = item.doctor || 'Без лікаря';

    if (!byDoctor[doctor]) {
      byDoctor[doctor] = {
        revenue: 0,
        accrual: 0,
        rows: 0
      };
    }

    byDoctor[doctor].revenue += item.amount;
    byDoctor[doctor].accrual += item.accrual;
    byDoctor[doctor].rows++;
  });

  const includedRevenue = included.reduce(
    function(sum, item) {
      return sum + item.amount;
    },
    0
  );

  const includedAccrual = included.reduce(
    function(sum, item) {
      return sum + item.accrual;
    },
    0
  );

  const excludedRevenue = excluded.reduce(
    function(sum, item) {
      return sum + item.amount;
    },
    0
  );

  const excludedAccrual = excluded.reduce(
    function(sum, item) {
      return sum + item.accrual;
    },
    0
  );

   const result = {
    ok: true,
    test: 'dashboardDoctorPayrollExplainDifferenceV1',
    changesMade: false,
    period: {
      mode: period.mode,
      from: dashboardDoctorPayrollExplainFormatDateV1_(from),
      to: dashboardDoctorPayrollExplainFormatDateV1_(to)
    },
    rate: 0.4,
    dashboardDisplayedTotal: dashboard
      .getRange('G12')
      .getValue(),
    payrollCalculatedTotal: includedAccrual,
    differenceToDashboard:
      includedAccrual -
      Number(dashboard.getRange('G12').getValue() || 0),
    incomeRowsInPeriod: rows.length,
    includedRows: included.length,
    excludedRows: excluded.length,
    includedRevenue: includedRevenue,
    includedAccrual: includedAccrual,
    excludedRevenue: excludedRevenue,
    excludedAccrual: excludedAccrual,
    excludedByReason: byReason,
    byDoctor: byDoctor,
    excludedDetails: excluded,
    dashboardDoctors: dashboardDoctors,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  console.log(
    JSON.stringify(result, null, 2)
  );

  return result;
}

function dashboardDoctorPayrollExplainNormalizeV1_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function dashboardDoctorPayrollExplainNumberV1_(value) {
  if (typeof value === 'number') {
    return value;
  }

  const text = String(value || '')
    .replace(/\s/g, '')
    .replace(',', '.');

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : NaN;
}


function dashboardDoctorPayrollExplainParseDateV1_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return new Date(value.getTime());
  }

  const text = String(value || '').trim();

  const match = text.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
  );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );
  }

  const date = new Date(value);

  return isNaN(date.getTime())
    ? null
    : date;
}


function dashboardDoctorPayrollExplainFormatDateV1_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}
function dashboardDoctorPayrollPnlRowAuditV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pl = ss.getSheetByName('P&L');

  if (!pl) {
    throw new Error('Не знайдено лист «P&L».');
  }

  const lastRow = Math.max(pl.getLastRow(), 1);
  const lastColumn = Math.max(pl.getLastColumn(), 26);

  const displayValues = pl
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  const formulas = pl
    .getRange(1, 1, lastRow, lastColumn)
    .getFormulas();

  let metricRow = -1;

  for (let i = 0; i < displayValues.length; i++) {
  const code = String(displayValues[i][1] || '')
  .trim()
  .toLowerCase();

const label = String(displayValues[i][2] || '')
  .trim()
  .toLowerCase();

    if (
      code === 'var-01-01' ||
      label === 'зарплата лікарів'
    ) {
      metricRow = i + 1;
      break;
    }
  }

  if (metricRow === -1) {
    throw new Error(
      'У P&L не знайдено рядок «Зарплата лікарів».'
    );
  }

  const rowValues = displayValues[metricRow - 1];
  const rowFormulas = formulas[metricRow - 1];

  const row = rowValues.map(function(value, index) {
    return {
      column: index + 1,
      a1: pl
        .getRange(metricRow, index + 1)
        .getA1Notation(),
      value: value,
      formula: rowFormulas[index] || ''
    };
  });

  const julyCell = pl.getRange(metricRow, 26);

  const result = {
    ok: true,
    test: 'dashboardDoctorPayrollPnlRowAuditV1',
    sheet: 'P&L',
    metricRow: metricRow,
    metricCode: rowValues[1],
    metricLabel: rowValues[2],
    julyCell: julyCell.getA1Notation(),
    julyValue: julyCell.getValue(),
    julyDisplayValue: julyCell.getDisplayValue(),
    julyFormula: julyCell.getFormula(),
    row: row,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollPnlRowAuditV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
function dashboardDoctorPayrollPnlSourceAuditV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const plSheet =
    findSheetByName_(
      ss,
      'P&L'
    );

  const baseSheet =
    findSheetByName_(
      ss,
      'База операцій'
    );

  const accrualSheet =
    findSheetByName_(
      ss,
      'Нарахування'
    );

  const mappingSheet =
    findSheetByName_(
      ss,
      'Мапінг'
    );

  if (!plSheet || !baseSheet || !mappingSheet) {
    throw new Error(
      'Не знайдено необхідний лист. ' +
      'P&L=' + Boolean(plSheet) +
      ', База операцій=' + Boolean(baseSheet) +
      ', Мапінг=' + Boolean(mappingSheet)
    );
  }

  const rawPeriod = dashboardCentralPeriodV1Build_();
  const period = rawPeriod.period || rawPeriod;

  const from = dashboardDoctorPayrollExplainParseDateV1_(
    period.from
  );

  const to = dashboardDoctorPayrollExplainParseDateV1_(
    period.to
  );

  to.setHours(23, 59, 59, 999);

  const mapping = getPLMapping_(mappingSheet);

  const baseStatusById =
    getPLBaseStatusByOperationId_(baseSheet);

  let operations =
    getPLOperationsFromBase_(baseSheet);

  if (accrualSheet) {
    operations = operations.concat(
      getPLOperationsFromAccruals_(
        accrualSheet,
        baseStatusById
      )
    );
  }

  const periodOperations = operations.filter(function(op) {
    return (
      op.date &&
      op.date >= from &&
      op.date <= to
    );
  });

  const sourceRows = periodOperations
    .filter(function(op) {
      return operationBelongsToPLRow_(
        op,
        'Зарплата лікарів',
        mapping
      );
    })
    .map(function(op) {
      return {
        id: op.id,
        date: dashboardDoctorPayrollExplainFormatDateV1_(
          op.date
        ),
        amount: op.amount,
        type: op.type,
        category: op.category,
        article: op.article,
        source: op.source,
        mappedGroup: getMappedPLGroup_(
          op,
          mapping
        )
      };
    });

  const sourceTotal = sourceRows.reduce(
    function(sum, row) {
      return sum + Number(row.amount || 0);
    },
    0
  );

  const pnlRow = 26;
  const pnlCell = plSheet.getRange('Z26');

  const result = {
    ok: true,
    test: 'dashboardDoctorPayrollPnlSourceAuditV1',
    period: {
      mode: period.mode,
      from: dashboardDoctorPayrollExplainFormatDateV1_(
        from
      ),
      to: dashboardDoctorPayrollExplainFormatDateV1_(
        to
      )
    },
    pnlMetric: {
      row: pnlRow,
      code: plSheet.getRange('B26').getDisplayValue(),
      label: plSheet.getRange('C26').getDisplayValue(),
      cell: 'P&L!Z26',
      value: pnlCell.getValue(),
      formula: pnlCell.getFormula()
    },
    periodOperationsRead: periodOperations.length,
    sourceRowsForPnlSalary: sourceRows,
    sourceRowsCount: sourceRows.length,
    sourceTotal: sourceTotal,
    sourceTotalAbs: Math.abs(sourceTotal),
    differenceToPnl:
      Math.abs(sourceTotal) -
      Math.abs(Number(pnlCell.getValue() || 0)),
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollPnlSourceAuditV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
function dashboardDoctorPayrollActualVsAccrualAuditV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const plSheet =
    findSheetByName_(ss, 'P&L');

  const baseSheet =
    findSheetByName_(ss, 'База операцій');

  const accrualSheet =
    findSheetByName_(ss, 'Нарахування');

  const mappingSheet =
    findSheetByName_(ss, 'Мапінг');

  if (!plSheet || !baseSheet || !mappingSheet) {
    throw new Error(
      'Не знайдено P&L, Базу операцій або Мапінг.'
    );
  }

  const rawPeriod =
    dashboardCentralPeriodV1Build_();

  const period =
    rawPeriod.period || rawPeriod;

  const from =
    dashboardDoctorPayrollExplainParseDateV1_(
      period.from
    );

  const to =
    dashboardDoctorPayrollExplainParseDateV1_(
      period.to
    );

  to.setHours(23, 59, 59, 999);

  const mapping =
    getPLMapping_(mappingSheet);

  const baseStatusById =
    getPLBaseStatusByOperationId_(
      baseSheet
    );

  let operations =
    getPLOperationsFromBase_(
      baseSheet
    );

  if (accrualSheet) {
    operations = operations.concat(
      getPLOperationsFromAccruals_(
        accrualSheet,
        baseStatusById
      )
    );
  }

  const periodOperations =
    operations.filter(function(op) {
      return (
        op.date &&
        op.date >= from &&
        op.date <= to
      );
    });

  const pnlSalaryRows =
    periodOperations
      .filter(function(op) {
        return operationBelongsToPLRow_(
          op,
          'Зарплата лікарів',
          mapping
        );
      })
      .map(function(op) {
        return {
          id: op.id,
          date:
            dashboardDoctorPayrollExplainFormatDateV1_(
              op.date
            ),
          amount: op.amount,
          type: op.type,
          category: op.category,
          article: op.article,
          source: op.source,
          mappedGroup:
            getMappedPLGroup_(
              op,
              mapping
            )
        };
      });

  const pnlSourceTotal =
    pnlSalaryRows.reduce(
      function(sum, row) {
        return sum + Number(row.amount || 0);
      },
      0
    );

  const plValues =
    plSheet
      .getDataRange()
      .getDisplayValues();

  const plFormulas =
    plSheet
      .getDataRange()
      .getFormulas();

  let metricRow = -1;

  for (let i = 0; i < plValues.length; i++) {
    const code =
      String(plValues[i][1] || '')
        .trim()
        .toLowerCase();

    const label =
      String(plValues[i][2] || '')
        .trim()
        .toLowerCase();

    if (
      code === 'var-01-01' ||
      label === 'зарплата лікарів'
    ) {
      metricRow = i + 1;
      break;
    }
  }

  if (metricRow === -1) {
    throw new Error(
      'Не знайдено рядок «Зарплата лікарів» у P&L.'
    );
  }

  const monthNumber =
    from.getMonth() + 1;

  const monthRow =
    plSheet
      .getRange(6, 1, 1, plSheet.getLastColumn())
      .getValues()[0];

  const headerRow =
    plSheet
      .getRange(7, 1, 1, plSheet.getLastColumn())
      .getDisplayValues()[0];

    let factColumn = -1;

  for (
    let index = 0;
    index < monthRow.length;
    index++
  ) {
    const month =
      Number(monthRow[index]);

    if (month !== monthNumber) {
      continue;
    }

    const factIndex =
      index + 2;

    const factHeader =
      String(headerRow[factIndex] || '')
        .trim()
        .toLowerCase();

    if (
      factHeader.indexOf('факт') !== -1
    ) {
      factColumn =
        factIndex + 1;

      break;
    }
  }
  if (factColumn === -1) {
    throw new Error(
      'Не знайдено фактичну колонку P&L для вибраного місяця.'
    );
  }

  const pnlCell =
    plSheet.getRange(
      metricRow,
      factColumn
    );

  const payroll =
    pfBuildDoctorPayroll_({
      from: from,
      to: to
    });

  const result = {
    ok: true,
    test:
      'dashboardDoctorPayrollActualVsAccrualAuditV1',

    period: {
      mode: period.mode,
      from:
        dashboardDoctorPayrollExplainFormatDateV1_(
          from
        ),
      to:
        dashboardDoctorPayrollExplainFormatDateV1_(
          to
        )
    },

    pnl: {
      row: metricRow,
      code: plValues[metricRow - 1][1],
      label: plValues[metricRow - 1][2],
      factCell: 'P&L!' + pnlCell.getA1Notation(),
      value: pnlCell.getValue(),
      formula:
        plFormulas[metricRow - 1][factColumn - 1] || ''
    },

    pnlSourceRows: pnlSalaryRows,
    pnlSourceRowsCount: pnlSalaryRows.length,
    pnlSourceTotal: pnlSourceTotal,
    pnlValue: pnlCell.getValue(),
    differenceSourceToPnl:
      pnlSourceTotal -
      Number(pnlCell.getValue() || 0),

    calculatedAccrual:
      payroll.totalAccrual,

    actualSalaryMinusAccrual:
      Math.abs(Number(pnlCell.getValue() || 0)) -
      Number(payroll.totalAccrual || 0),

    payrollRows:
      payroll.rows,

    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorPayrollActualVsAccrualAuditV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
function dashboardDoctorExpensesAuditV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const plSheet =
    findSheetByName_(ss, 'P&L');

  const baseSheet =
    findSheetByName_(ss, 'База операцій');

  const accrualSheet =
    findSheetByName_(ss, 'Нарахування');

  const mappingSheet =
    findSheetByName_(ss, 'Мапінг');

  if (!plSheet || !baseSheet || !mappingSheet) {
    throw new Error(
      'Не знайдено P&L, Базу операцій або Мапінг.'
    );
  }

  const rawPeriod =
    dashboardCentralPeriodV1Build_();

  const period =
    rawPeriod.period || rawPeriod;

  const from =
    dashboardDoctorPayrollExplainParseDateV1_(
      period.from
    );

  const to =
    dashboardDoctorPayrollExplainParseDateV1_(
      period.to
    );

  to.setHours(23, 59, 59, 999);

  const mapping =
    getPLMapping_(mappingSheet);

  const baseStatusById =
    getPLBaseStatusByOperationId_(
      baseSheet
    );

  let operations =
    getPLOperationsFromBase_(
      baseSheet
    );

  if (accrualSheet) {
    operations = operations.concat(
      getPLOperationsFromAccruals_(
        accrualSheet,
        baseStatusById
      )
    );
  }

  const doctorExpenseRows =
    operations
      .filter(function(op) {
        const dateIsInPeriod =
          op.date &&
          op.date >= from &&
          op.date <= to;

        const isExpense =
          String(op.type || '')
            .trim()
            .toLowerCase() === 'витрати';

        const category =
          String(op.category || '')
            .trim()
            .toLowerCase();

        const article =
          String(op.article || '')
            .trim()
            .toLowerCase();

        const isDoctorCategory =
          category === 'лікарі';

        const isDoctorArticle =
          [
            'зарплата лікарів',
            'бонуси лікарям',
            'податки на зарплату лікарів',
            'податки на зарплату лікарям'
          ].indexOf(article) !== -1;

        return (
          dateIsInPeriod &&
          isExpense &&
          (
            isDoctorCategory ||
            isDoctorArticle
          )
        );
      })
      .map(function(op) {
        return {
          id: op.id,
          date:
            dashboardDoctorPayrollExplainFormatDateV1_(
              op.date
            ),
          amount: Number(op.amount || 0),
          amountAbs: Math.abs(
            Number(op.amount || 0)
          ),
          category: op.category,
          article: op.article,
          source: op.source,
          mappedGroup:
            getMappedPLGroup_(
              op,
              mapping
            )
        };
      });

  const byArticle = {};

  doctorExpenseRows.forEach(function(row) {
    const article =
      String(row.article || '')
        .trim() || 'Без статті';

    if (!byArticle[article]) {
      byArticle[article] = {
        amount: 0,
        transactions: 0
      };
    }

    byArticle[article].amount += row.amountAbs;
    byArticle[article].transactions++;
  });

  const sourceExpenseTotal =
    doctorExpenseRows.reduce(
      function(sum, row) {
        return sum + row.amount;
      },
      0
    );

  const sourceExpenseTotalAbs =
    Math.abs(sourceExpenseTotal);

  const plValues =
    plSheet
      .getDataRange()
      .getDisplayValues();

  const plFormulas =
    plSheet
      .getDataRange()
      .getFormulas();

  const findPlRowByLabel =
    function(label) {
      const target =
        String(label || '')
          .trim()
          .toLowerCase();

      for (
        let index = 0;
        index < plValues.length;
        index++
      ) {
        const current =
          String(plValues[index][2] || '')
            .trim()
            .toLowerCase();

        if (current === target) {
          return index + 1;
        }
      }

      return -1;
    };

  const categoryRow =
    findPlRowByLabel('Лікарі');

  const detailLabels = [
    'Зарплата лікарів',
    'Бонуси лікарям',
    'Податки на зарплату лікарів',
    'Податки на зарплату лікарям'
  ];

  const detailRows = [];

  detailLabels.forEach(function(label) {
    const row =
      findPlRowByLabel(label);

    if (
      row !== -1 &&
      !detailRows.some(function(item) {
        return item.row === row;
      })
    ) {
      detailRows.push({
        row: row,
        label: label
      });
    }
  });

  const monthNumber =
    from.getMonth() + 1;

  const monthRow =
    plSheet
      .getRange(
        6,
        1,
        1,
        plSheet.getLastColumn()
      )
      .getValues()[0];

  const headerRow =
    plSheet
      .getRange(
        7,
        1,
        1,
        plSheet.getLastColumn()
      )
      .getDisplayValues()[0];

  let factColumn = -1;

  for (
    let index = 0;
    index < monthRow.length;
    index++
  ) {
    if (
      Number(monthRow[index]) !== monthNumber
    ) {
      continue;
    }

    const factIndex =
      index + 2;

    const factHeader =
      String(headerRow[factIndex] || '')
        .trim()
        .toLowerCase();

    if (
      factHeader.indexOf('факт') !== -1
    ) {
      factColumn =
        factIndex + 1;

      break;
    }
  }

  if (factColumn === -1) {
    throw new Error(
      'Не знайдено фактичну колонку P&L.'
    );
  }

  const getPnlCellInfo =
    function(row) {
      if (row === -1) {
        return null;
      }

      const cell =
        plSheet.getRange(row, factColumn);

      return {
        row: row,
        cell:
          'P&L!' +
          cell.getA1Notation(),
        value: cell.getValue(),
        displayValue:
          cell.getDisplayValue(),
        formula: cell.getFormula()
      };
    };

  const pnlDetails =
    detailRows.map(function(item) {
      return {
        label: item.label,
        value: getPnlCellInfo(item.row)
      };
    });

  const pnlDetailTotal =
    pnlDetails.reduce(
      function(sum, item) {
        return sum +
          Number(
            item.value &&
            item.value.value || 0
          );
      },
      0
    );

  const pnlCategory =
    getPnlCellInfo(categoryRow);

  const result = {
    ok: true,
    test:
      'dashboardDoctorExpensesAuditV1',

    period: {
      mode: period.mode,
      from:
        dashboardDoctorPayrollExplainFormatDateV1_(
          from
        ),
      to:
        dashboardDoctorPayrollExplainFormatDateV1_(
          to
        )
    },

    source: {
      rows: doctorExpenseRows,
      rowsCount: doctorExpenseRows.length,
      total: sourceExpenseTotal,
      totalAbs: sourceExpenseTotalAbs,
      byArticle: byArticle
    },

    pnl: {
      category: pnlCategory,
      details: pnlDetails,
      detailsTotal: pnlDetailTotal
    },

    comparison: {
      sourceTotalAbs: sourceExpenseTotalAbs,
      pnlCategoryAbs: Math.abs(
        Number(
          pnlCategory &&
          pnlCategory.value || 0
        )
      ),
      pnlDetailsAbs: Math.abs(
        pnlDetailTotal
      ),
      differenceSourceToPnl:
        sourceExpenseTotalAbs -
        Math.abs(
          Number(
            pnlCategory &&
            pnlCategory.value || 0
          )
        ),
      differenceDetailsToCategory:
        Math.abs(pnlDetailTotal) -
        Math.abs(
          Number(
            pnlCategory &&
            pnlCategory.value || 0
          )
        )
    },

    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true,
    noTriggersModified: true
  };

  Logger.log(
    'dashboardDoctorExpensesAuditV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}