/****************************************************
 * PROFIN OS — АКТИВИ
 * КРОК 5. ІНТЕГРАЦІЯ АМОРТИЗАЦІЇ З P&L
 *
 * ПРАВИЛА:
 * 1. Джерело — модуль "Активи".
 * 2. Для кожного P&L береться його місяць.
 * 3. У P&L амортизація записується зі знаком мінус.
 * 4. EBITDA не змінюється.
 * 5. EBIT = EBITDA + амортизація.
 * 6. Чистий прибуток = EBIT + фінансові видатки.
 * 7. Cash Flow і "База операцій" не змінюються.
 ****************************************************/

const PL_ASSET_DEPRECIATION_CONFIG = Object.freeze({
  rowLabels: Object.freeze({
    total: [
      'Амортизація'
    ],

    equipment: [
      'Амортизація обладнання'
    ],

    furniture: [
      'Амортизація меблів'
    ],

    intangible: [
      'Амортизація НМА'
    ],

    ebitda: [
      'Операційний прибуток (EBITDA)'
    ],

    ebit: [
      'Операційний прибуток (EBIT)'
    ],

    financialExpenses: [
      'Видатки фінансової діяльності'
    ],

    netProfit: [
      'Фінансовий результат Чистий прибуток',
      'Фінансовий результат: Чистий прибуток',
      'Чистий прибуток'
    ]
  }),

  /*
   * Категорії з цими словами потрапляють
   * до амортизації меблів.
   */
  furnitureKeywords: Object.freeze([
    'мебл'
  ]),

  /*
   * Категорії з цими словами потрапляють
   * до амортизації НМА.
   */
  intangibleKeywords: Object.freeze([
    'нма',
    'нематеріаль'
  ]),

  tolerance: 0.01
});

/****************************************************
 * НОРМАЛІЗАЦІЯ НАЗВ РЯДКІВ P&L
 *
 * Прибирає:
 * - нерозривні пробіли;
 * - переноси рядків;
 * - повторні пробіли;
 * - різницю регістру.
 ****************************************************/

/****************************************************
 * НОРМАЛІЗАЦІЯ НАЗВ РЯДКІВ P&L
 *
 * Прибирає також невидимі Unicode-символи,
 * які можуть залишатися після копіювання тексту.
 ****************************************************/

function plAssetDepNormalizeLabel_(value) {
  let text = String(
    value === null ||
    value === undefined
      ? ''
      : value
  );

  /*
   * Уніфікуємо сумісні Unicode-символи.
   */
  if (
    typeof text.normalize === 'function'
  ) {
    text = text.normalize('NFKC');
  }

  return text
    /*
     * Керівні та невидимі символи.
     */
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
      ''
    )
    .replace(/\u00A0/g, ' ')
    /*
     * Різні види тире.
     */
    .replace(/[‐-‒–—−]/g, '-')
    /*
     * Дужки не повинні впливати на пошук.
     */
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


/****************************************************
 * ПРЯМИЙ ПОШУК РЯДКА НА ЛИСТІ P&L
 *
 * Спочатку шукає в колонці C, де розміщені
 * назви поточного P&L.
 *
 * Якщо не знайдено — перевіряє A:D,
 * щоб підтримати можливе майбутнє зміщення макета.
 ****************************************************/

/****************************************************
 * ЧИТАННЯ НАЗВ РЯДКІВ P&L
 *
 * Читаємо B:D:
 * - B — код;
 * - C — основна назва;
 * - D — резерв на випадок об’єднаних клітинок.
 ****************************************************/

function plAssetDepReadLabelRows_(sheet) {
  if (!sheet) return [];

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return [];
  }

  const firstColumn = 2; // B
  const width = Math.min(
    3,
    sheet.getLastColumn() -
      firstColumn +
      1
  );

  if (width <= 0) {
    return [];
  }

  const values = sheet
    .getRange(
      1,
      firstColumn,
      lastRow,
      width
    )
    .getDisplayValues();

  return values.map(
    (rowValues, index) => {
      const cells =
        rowValues
          .map(
            plAssetDepNormalizeLabel_
          )
          .filter(Boolean);

      return {
        row: index + 1,
        cells: cells,
        text: cells.join(' | ')
      };
    }
  );
}


/****************************************************
 * ПОШУК ПЕРШОГО РЯДКА ЗА УМОВОЮ
 ****************************************************/

function plAssetDepFindFirstRow_(
  labelRows,
  predicate,
  minRow,
  maxRow
) {
  const from =
    Number(minRow) || 1;

  const to =
    Number(maxRow) ||
    Number.MAX_SAFE_INTEGER;

  for (
    let index = 0;
    index < labelRows.length;
    index++
  ) {
    const item =
      labelRows[index];

    if (
      item.row < from ||
      item.row > to
    ) {
      continue;
    }

    if (predicate(item)) {
      return item.row;
    }
  }

  return 0;
}


/****************************************************
 * ПОШУК ОСТАННЬОГО РЯДКА ЗА УМОВОЮ
 ****************************************************/

function plAssetDepFindLastRow_(
  labelRows,
  predicate,
  minRow,
  maxRow
) {
  const from =
    Number(minRow) || 1;

  const to =
    Number(maxRow) ||
    Number.MAX_SAFE_INTEGER;

  for (
    let index =
      labelRows.length - 1;
    index >= 0;
    index--
  ) {
    const item =
      labelRows[index];

    if (
      item.row < from ||
      item.row > to
    ) {
      continue;
    }

    if (predicate(item)) {
      return item.row;
    }
  }

  return 0;
}


/****************************************************
 * ПЕРЕВІРКА, ЧИ ОКРЕМА КЛІТИНКА РЯДКА
 * ДОРІВНЮЄ НАЗВІ
 ****************************************************/

function plAssetDepRowHasExactCell_(
  item,
  expected
) {
  const target =
    plAssetDepNormalizeLabel_(
      expected
    );

  return item.cells.some(
    cell => cell === target
  );
}


/****************************************************
 * СТРУКТУРНЕ ВИЗНАЧЕННЯ РЯДКІВ P&L
 *
 * Не залежить від:
 * - прихованих символів;
 * - дужок;
 * - точного написання EBITDA;
 * - номерів рядків.
 ****************************************************/

function plAssetDepResolveRowsByStructure_(
  sheet
) {
  const labelRows =
    plAssetDepReadLabelRows_(
      sheet
    );

  /*
   * Загальний рядок амортизації.
   */
  const total =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        plAssetDepRowHasExactCell_(
          item,
          'Амортизація'
        )
    );

  /*
   * Деталізація амортизації.
   */
  const equipment =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'амортизац'
        ) &&
        item.text.includes(
          'обладнан'
        ),
      total
        ? total + 1
        : 1
    );

  const furniture =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'амортизац'
        ) &&
        item.text.includes(
          'мебл'
        ),
      equipment
        ? equipment + 1
        : 1
    );

  const intangible =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'амортизац'
        ) &&
        (
          item.text.includes('нма') ||
          item.text.includes(
            'нематеріаль'
          )
        ),
      furniture
        ? furniture + 1
        : 1
    );

  /*
   * EBITDA — останній рядок
   * "Операційний прибуток" перед блоком амортизації.
   *
   * Це працює навіть якщо текст EBITDA
   * містить змішані латинські/кириличні символи.
   */
  const ebitda =
    plAssetDepFindLastRow_(
      labelRows,
      item =>
        item.text.includes(
          'операційний прибуток'
        ),
      1,
      total
        ? total - 1
        : Number.MAX_SAFE_INTEGER
    );

  /*
   * EBIT — перший рядок
   * "Операційний прибуток" після деталізації.
   */
  const ebit =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'операційний прибуток'
        ),
      intangible
        ? intangible + 1
        : (
            total
              ? total + 1
              : 1
          )
    );

  /*
   * Фінансові видатки мають бути після EBIT.
   */
  const financialExpenses =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'видатки фінансової діяльності'
        ),
      ebit
        ? ebit + 1
        : 1
    );

  /*
   * Чистий прибуток шукаємо за унікальною
   * українською частиною назви.
   */
  const netProfit =
    plAssetDepFindFirstRow_(
      labelRows,
      item =>
        item.text.includes(
          'чистий прибуток'
        ),
      ebit
        ? ebit + 1
        : 1
    );

  return {
    total: total,
    equipment: equipment,
    furniture: furniture,
    intangible: intangible,
    ebitda: ebitda,
    ebit: ebit,
    financialExpenses:
      financialExpenses,
    netProfit: netProfit,
    labelRows: labelRows
  };
}
/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ І РЯДКІВ P&L
 ****************************************************/

/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ І РЯДКІВ P&L
 *
 * Аргумент rows залишено для сумісності,
 * але технічні рядки шукаються безпосередньо
 * на листі, а не через карту getPLRows_().
 ****************************************************/
/****************************************************
 * ТЕСТ ПОШУКУ РЯДКІВ P&L
 *
 * Нічого не записує.
 ****************************************************/

/****************************************************
 * ТЕСТ СТРУКТУРНОГО ПОШУКУ РЯДКІВ P&L
 *
 * Нічого не записує.
 ****************************************************/

function testPLAssetRowDetectionStep5() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  /*
   * Беремо лист точно за назвою,
   * без додаткового посередника.
   */
  const sheet =
    ss.getSheetByName('P&L');

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "P&L".'
    );
  }

  const resolvedRows =
    assertPLAssetDepreciationIntegrationReady_(
      sheet,
      null
    );

  const result = {
    spreadsheetName:
      ss.getName(),

    sheetName:
      sheet.getName(),

    sheetId:
      sheet.getSheetId(),

    rows:
      resolvedRows,

    expectedCoreRows: {
      ebitda: 92,
      total: 94,
      equipment: 95,
      furniture: 96,
      intangible: 97,
      ebit: 98
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
      'Структуру P&L визначено',
      'P&L / Активи',
      6
    );

  return result;
}
/****************************************************
 * ПЕРЕВІРКА ЗАЛЕЖНОСТЕЙ І СТРУКТУРИ P&L
 ****************************************************/

function assertPLAssetDepreciationIntegrationReady_(
  sheet,
  rows
) {
  if (
    typeof getMonthlyDepreciationBreakdown_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено getMonthlyDepreciationBreakdown_(). ' +
      'Спочатку завершіть крок 4 модуля активів.'
    );
  }

  if (
    typeof calculateAssetDepreciationForPeriod_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено calculateAssetDepreciationForPeriod_().'
    );
  }

  if (!sheet) {
    throw new Error(
      'Не передано лист P&L.'
    );
  }

  const detected =
    plAssetDepResolveRowsByStructure_(
      sheet
    );

  const resolved = {
    total:
      detected.total,

    equipment:
      detected.equipment,

    furniture:
      detected.furniture,

    intangible:
      detected.intangible,

    ebitda:
      detected.ebitda,

    ebit:
      detected.ebit,

    financialExpenses:
      detected.financialExpenses,

    netProfit:
      detected.netProfit
  };

  const names = {
    total:
      'Амортизація',

    equipment:
      'Амортизація обладнання',

    furniture:
      'Амортизація меблів',

    intangible:
      'Амортизація НМА',

    ebitda:
      'Операційний прибуток (EBITDA)',

    ebit:
      'Операційний прибуток (EBIT)',

    financialExpenses:
      'Видатки фінансової діяльності',

    netProfit:
      'Фінансовий результат: Чистий прибуток'
  };

  const missing =
    Object.keys(resolved)
      .filter(
        key => !resolved[key]
      );

  if (missing.length) {
    /*
     * Записуємо фактично прочитані назви,
     * щоб наступна помилка була діагностичною.
     */
    const nearbyRows =
      detected.labelRows
        .filter(
          item =>
            item.row >= 85 &&
            item.row <= 115 &&
            item.text
        )
        .map(
          item => ({
            row: item.row,
            text: item.text
          })
        );

    Logger.log(
      JSON.stringify(
        {
          sheetName:
            sheet.getName(),

          sheetId:
            sheet.getSheetId(),

          lastRow:
            sheet.getLastRow(),

          missing:
            missing,

          rows85to115:
            nearbyRows
        },
        null,
        2
      )
    );

    throw new Error(
      'У P&L не визначено рядки: ' +
      missing
        .map(
          key => names[key]
        )
        .join('; ') +
      '. Деталі записано в журнал виконання.'
    );
  }

  const rowNumbers =
    Object.values(resolved);

  const uniqueRows =
    new Set(rowNumbers);

  if (
    uniqueRows.size !==
    rowNumbers.length
  ) {
    throw new Error(
      'Структурний пошук визначив один рядок для кількох показників: ' +
      JSON.stringify(resolved)
    );
  }

  return resolved;
}


/****************************************************
 * ВИЗНАЧЕННЯ МІСЯЦЯ P&L
 ****************************************************/

function plAssetDepResolvePeriodDate_(
  period
) {
  if (
    period instanceof Date &&
    !isNaN(period.getTime())
  ) {
    return new Date(
      period.getFullYear(),
      period.getMonth(),
      1
    );
  }

  if (
    period &&
    period.startDate instanceof Date &&
    !isNaN(period.startDate.getTime())
  ) {
    return new Date(
      period.startDate.getFullYear(),
      period.startDate.getMonth(),
      1
    );
  }

  if (
    period &&
    Number.isInteger(
      Number(period.month)
    ) &&
    Number.isInteger(
      Number(period.year)
    )
  ) {
    return new Date(
      Number(period.year),
      Number(period.month) - 1,
      1
    );
  }

  throw new Error(
    'Не вдалося визначити місяць для амортизації P&L.'
  );
}


/****************************************************
 * РОЗПОДІЛ КАТЕГОРІЙ
 ****************************************************/

function plAssetDepClassifyCategory_(
  category
) {
  const normalized =
    plAssetDepNormalize_(
      category
    );

  const isIntangible =
    PL_ASSET_DEPRECIATION_CONFIG
      .intangibleKeywords
      .some(keyword =>
        normalized.includes(keyword)
      );

  if (isIntangible) {
    return 'intangible';
  }

  const isFurniture =
    PL_ASSET_DEPRECIATION_CONFIG
      .furnitureKeywords
      .some(keyword =>
        normalized.includes(keyword)
      );

  if (isFurniture) {
    return 'furniture';
  }

  /*
   * Побутова техніка, обладнання, техніка
   * та інші фізичні активи за замовчуванням
   * потрапляють в обладнання.
   */
  return 'equipment';
}


/****************************************************
 * РОЗРАХУНОК РОЗПОДІЛУ ЗА ПЕРІОД
 *
 * Повертає додатні аналітичні суми
 * і від’ємні значення для запису в P&L.
 ****************************************************/

function calculatePLAssetDepreciationForPeriod_(
  period
) {
  const month =
    plAssetDepResolvePeriodDate_(
      period
    );

  const breakdown =
    getMonthlyDepreciationBreakdown_(
      month
    );

  let equipment = 0;
  let furniture = 0;
  let intangible = 0;

  Object.keys(
    breakdown.byCategory || {}
  ).forEach(category => {
    const amount =
      plAssetDepRoundMoney_(
        breakdown.byCategory[category]
      );

    const bucket =
      plAssetDepClassifyCategory_(
        category
      );

    if (bucket === 'furniture') {
      furniture += amount;
      return;
    }

    if (bucket === 'intangible') {
      intangible += amount;
      return;
    }

    equipment += amount;
  });

  equipment =
    plAssetDepRoundMoney_(
      equipment
    );

  furniture =
    plAssetDepRoundMoney_(
      furniture
    );

  intangible =
    plAssetDepRoundMoney_(
      intangible
    );

  const total =
    plAssetDepRoundMoney_(
      breakdown.total
    );

  /*
   * Захист від різниці в одну копійку
   * через округлення категорій.
   *
   * Коригування додається до обладнання,
   * щоб сума компонентів точно дорівнювала total.
   */
  const componentTotal =
    plAssetDepRoundMoney_(
      equipment +
      furniture +
      intangible
    );

  const roundingDifference =
    plAssetDepRoundMoney_(
      total -
      componentTotal
    );

  equipment =
    plAssetDepRoundMoney_(
      equipment +
      roundingDifference
    );

  const finalComponentTotal =
    plAssetDepRoundMoney_(
      equipment +
      furniture +
      intangible
    );

  if (
    Math.abs(
      finalComponentTotal -
      total
    ) >
    PL_ASSET_DEPRECIATION_CONFIG
      .tolerance
  ) {
    throw new Error(
      'Розподіл амортизації за категоріями не збігається із загальною сумою.'
    );
  }

  return {
    period:
      month,

    periodText:
      Utilities.formatDate(
        month,
        Session.getScriptTimeZone(),
        'MM.yyyy'
      ),

    /*
     * Додатні аналітичні суми.
     */
    total:
      total,

    equipment:
      equipment,

    furniture:
      furniture,

    intangible:
      intangible,

    /*
     * Від’ємні значення для P&L.
     */
    expenseTotal:
      -Math.abs(total),

    expenseEquipment:
      -Math.abs(equipment),

    expenseFurniture:
      -Math.abs(furniture),

    expenseIntangible:
      -Math.abs(intangible),

    byCategory:
      breakdown.byCategory || {},

    rows:
      breakdown.rows || []
  };
}


/****************************************************
 * ЗАПИС АМОРТИЗАЦІЇ В P&L
 *
 * Викликається після чинного розрахунку
 * технічних підсумків.
 ****************************************************/

function writePLAssetDepreciationForPeriod_(
  sheet,
  rows,
  period
) {
  const resolvedRows =
    assertPLAssetDepreciationIntegrationReady_(
      sheet,
      rows
    );

  const calculation =
    calculatePLAssetDepreciationForPeriod_(
      period
    );

  const ebitda =
    Number(
      sheet
        .getRange(
          resolvedRows.ebitda,
          period.factCol
        )
        .getValue()
    ) || 0;

  /*
   * Зберігаємо знак фінансових видатків,
   * який уже сформував чинний модуль P&L.
   */
  const financialExpenses =
    Number(
      sheet
        .getRange(
          resolvedRows.financialExpenses,
          period.factCol
        )
        .getValue()
    ) || 0;

  const ebit =
    plAssetDepRoundMoney_(
      ebitda +
      calculation.expenseTotal
    );

  const netProfit =
    plAssetDepRoundMoney_(
      ebit +
      financialExpenses
    );

  const values = {
    total:
      calculation.expenseTotal,

    equipment:
      calculation.expenseEquipment,

    furniture:
      calculation.expenseFurniture,

    intangible:
      calculation.expenseIntangible,

    ebit:
      ebit,

    netProfit:
      netProfit
  };

  const rowsToWrite = [
    {
      key: 'equipment',
      row: resolvedRows.equipment
    },
    {
      key: 'furniture',
      row: resolvedRows.furniture
    },
    {
      key: 'intangible',
      row: resolvedRows.intangible
    },
    {
      key: 'total',
      row: resolvedRows.total
    },
    {
      key: 'ebit',
      row: resolvedRows.ebit
    },
    {
      key: 'netProfit',
      row: resolvedRows.netProfit
    }
  ];

  /*
   * Робимо знімок клітинок.
   * Якщо контроль після запису не пройде,
   * значення буде відновлено.
   */
  const snapshot =
    plAssetDepSnapshotRows_(
      sheet,
      period,
      rowsToWrite
    );

  try {
    rowsToWrite.forEach(item => {
      plAssetDepWritePLRowByNumber_(
        sheet,
        item.row,
        period,
        values[item.key]
      );
    });

    SpreadsheetApp.flush();

    verifyPLAssetDepreciationWrite_(
      sheet,
      period,
      resolvedRows,
      {
        calculation:
          calculation,

        ebitda:
          ebitda,

        financialExpenses:
          financialExpenses,

        expectedEbit:
          ebit,

        expectedNetProfit:
          netProfit
      }
    );

  } catch (error) {
    plAssetDepRestoreRows_(
      sheet,
      period,
      snapshot
    );

    SpreadsheetApp.flush();

    throw new Error(
      'Амортизацію не записано в P&L. ' +
      'Попередні значення відновлено. Причина: ' +
      error.message
    );
  }

  return {
    period:
      calculation.periodText,

    equipment:
      calculation.expenseEquipment,

    furniture:
      calculation.expenseFurniture,

    intangible:
      calculation.expenseIntangible,

    total:
      calculation.expenseTotal,

    ebitda:
      ebitda,

    ebit:
      ebit,

    financialExpenses:
      financialExpenses,

    netProfit:
      netProfit
  };
}


/****************************************************
 * ЗАПИС ФАКТУ ТА ВІДХИЛЕННЯ
 * ЗА НОМЕРОМ РЯДКА
 ****************************************************/

function plAssetDepWritePLRowByNumber_(
  sheet,
  row,
  period,
  fact
) {
  const plan =
    Number(
      sheet
        .getRange(
          row,
          period.planCol
        )
        .getValue()
    ) || 0;

  const factValue =
    plAssetDepRoundMoney_(
      fact
    );

  const variance =
    plAssetDepRoundMoney_(
      factValue -
      plan
    );

  sheet
    .getRange(
      row,
      period.factCol
    )
    .setValue(
      factValue
    );

  sheet
    .getRange(
      row,
      period.varianceCol
    )
    .setValue(
      variance
    );
}


/****************************************************
 * КОНТРОЛЬ ПІСЛЯ ЗАПИСУ
 ****************************************************/

function verifyPLAssetDepreciationWrite_(
  sheet,
  period,
  resolvedRows,
  expected
) {
  const readFact = row =>
    plAssetDepRoundMoney_(
      sheet
        .getRange(
          row,
          period.factCol
        )
        .getValue()
    );

  const actualEquipment =
    readFact(
      resolvedRows.equipment
    );

  const actualFurniture =
    readFact(
      resolvedRows.furniture
    );

  const actualIntangible =
    readFact(
      resolvedRows.intangible
    );

  const actualTotal =
    readFact(
      resolvedRows.total
    );

  const actualEbit =
    readFact(
      resolvedRows.ebit
    );

  const actualNetProfit =
    readFact(
      resolvedRows.netProfit
    );

  const componentTotal =
    plAssetDepRoundMoney_(
      actualEquipment +
      actualFurniture +
      actualIntangible
    );

  const errors = [];

  if (
    !plAssetDepMoneyEqual_(
      actualEquipment,
      expected.calculation
        .expenseEquipment
    )
  ) {
    errors.push(
      'не збігається амортизація обладнання'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      actualFurniture,
      expected.calculation
        .expenseFurniture
    )
  ) {
    errors.push(
      'не збігається амортизація меблів'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      actualIntangible,
      expected.calculation
        .expenseIntangible
    )
  ) {
    errors.push(
      'не збігається амортизація НМА'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      actualTotal,
      expected.calculation
        .expenseTotal
    )
  ) {
    errors.push(
      'не збігається загальна амортизація'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      componentTotal,
      actualTotal
    )
  ) {
    errors.push(
      'сума компонентів не дорівнює загальній амортизації'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      actualEbit,
      expected.expectedEbit
    )
  ) {
    errors.push(
      'неправильно перераховано EBIT'
    );
  }

  if (
    !plAssetDepMoneyEqual_(
      actualNetProfit,
      expected.expectedNetProfit
    )
  ) {
    errors.push(
      'неправильно перераховано чистий прибуток'
    );
  }

  if (errors.length) {
    throw new Error(
      errors.join('; ')
    );
  }

  return true;
}


/****************************************************
 * ЗНІМОК КЛІТИНОК ПЕРЕД ЗАПИСОМ
 ****************************************************/

function plAssetDepSnapshotRows_(
  sheet,
  period,
  rowsToWrite
) {
  return rowsToWrite.map(item => {
    const factCell =
      sheet.getRange(
        item.row,
        period.factCol
      );

    const varianceCell =
      sheet.getRange(
        item.row,
        period.varianceCol
      );

    return {
      row:
        item.row,

      factValue:
        factCell.getValue(),

      factFormula:
        factCell.getFormula(),

      varianceValue:
        varianceCell.getValue(),

      varianceFormula:
        varianceCell.getFormula()
    };
  });
}


/****************************************************
 * ВІДНОВЛЕННЯ ЗНІМКА
 ****************************************************/

function plAssetDepRestoreRows_(
  sheet,
  period,
  snapshot
) {
  snapshot.forEach(item => {
    const factCell =
      sheet.getRange(
        item.row,
        period.factCol
      );

    const varianceCell =
      sheet.getRange(
        item.row,
        period.varianceCol
      );

    if (item.factFormula) {
      factCell.setFormula(
        item.factFormula
      );
    } else {
      factCell.setValue(
        item.factValue
      );
    }

    if (item.varianceFormula) {
      varianceCell.setFormula(
        item.varianceFormula
      );
    } else {
      varianceCell.setValue(
        item.varianceValue
      );
    }
  });
}


/****************************************************
 * СУХИЙ ТЕСТ КРОКУ 5
 *
 * Нічого не записує в P&L.
 ****************************************************/

function testPLAssetDepreciationIntegrationStep5() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    findSheetByName_(
      ss,
      PL_REPORT_SHEET_NAME
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "P&L".'
    );
  }

  const rows =
    getPLRows_(
      sheet
    );

  const resolvedRows =
    assertPLAssetDepreciationIntegrationReady_(
      sheet,
      rows
    );

  const calculation =
    calculatePLAssetDepreciationForPeriod_(
      new Date(
        2026,
        5,
        1
      )
    );

  const componentTotal =
    plAssetDepRoundMoney_(
      calculation.equipment +
      calculation.furniture +
      calculation.intangible
    );

  if (
    !plAssetDepMoneyEqual_(
      componentTotal,
      calculation.total
    )
  ) {
    throw new Error(
      'Сухий тест: компоненти амортизації не дорівнюють загальній сумі.'
    );
  }

  const result = {
    period:
      calculation.periodText,

    total:
      calculation.total,

    equipment:
      calculation.equipment,

    furniture:
      calculation.furniture,

    intangible:
      calculation.intangible,

    expenseForPL:
      calculation.expenseTotal,

    rows:
      resolvedRows,

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
      'Сухий тест кроку 5 пройдено. P&L не змінено.',
      'P&L / Активи',
      8
    );

  return result;
}


/****************************************************
 * ДОПОМІЖНІ ФУНКЦІЇ
 ****************************************************/

function plAssetDepNormalize_(
  value
) {
  if (
    typeof normalizePL_ ===
    'function'
  ) {
    return normalizePL_(
      value
    );
  }

  return String(
    value || ''
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


function plAssetDepNumber_(
  value
) {
  if (
    typeof value === 'number'
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


function plAssetDepRoundMoney_(
  value
) {
  const number =
    plAssetDepNumber_(
      value
    );

  return Math.round(
    (
      number +
      Number.EPSILON
    ) * 100
  ) / 100;
}


function plAssetDepMoneyEqual_(
  first,
  second
) {
  return (
    Math.abs(
      plAssetDepRoundMoney_(first) -
      plAssetDepRoundMoney_(second)
    ) <=
    PL_ASSET_DEPRECIATION_CONFIG
      .tolerance
  );
}