/****************************************************
 * P&L TECHNICAL TOTALS
 * --------------------------------------------------
 * Єдине місце для розрахунку підсумкових рядків P&L:
 * - Операційний дохід
 * - Валовий дохід
 * - Змінні витрати
 * - Постійні витрати
 * - EBITDA
 * - EBIT
 * - Чистий прибуток
 * - Показники на людину
 * - Рентабельність
 ****************************************************/

function calculatePLTechnicalTotals_(sheet, rows, period, revenue) {
  const variableExpenses = sumPLDetailRowsBetweenLabels_(
    sheet,
    rows,
    'Змінні (прямі) витрати',
    'Постійніі (операційні) витрати OPEX',
    period.factCol
  );

  const fixedExpensesStartLabel =
  getPLRow_(rows, 'Постійніі (операційні) витрати OPEX')
    ? 'Постійніі (операційні) витрати OPEX'
    : 'Постійні (операційні) витрати OPEX';

const fixedExpenses = sumPLDetailRowsBetweenLabels_(
  sheet,
  rows,
  fixedExpensesStartLabel,
  'Загальні витрати періоду (по основним статтям + податки + змінні витрати)',
  period.factCol
);

  const totalPeriodExpenses = variableExpenses + fixedExpenses;
  const grossIncome = revenue + variableExpenses;
  const ebitda = revenue + totalPeriodExpenses;

  const depreciation = sumPLRowsByLabels_(sheet, rows, period, [
    'Амортизація обладнання',
    'Амортизація меблів',
    'Амортизація НМА'
  ]);

  const ebit = ebitda + depreciation;

  const financialExpenses = sumPLDetailRowsBetweenLabels_(
    sheet,
    rows,
    'Видатки фінансової діяльності',
    'Фінансовий результат Чистий прибуток',
    period.factCol
  );

  const netProfit = ebit + financialExpenses;

  const teamCount = getPLTeamCount_(sheet, rows, period);
  const incomePerPerson = teamCount ? revenue / teamCount : 0;
  const expensePerPerson = teamCount ? Math.abs(totalPeriodExpenses) / teamCount : 0;

  const salesProfitability = revenue ? netProfit / revenue : 0;
  const expenseProfitability = totalPeriodExpenses
    ? netProfit / Math.abs(totalPeriodExpenses)
    : 0;

  return {
    revenue,
    variableExpenses,
    fixedExpenses,
    totalPeriodExpenses,
    grossIncome,
    depreciation,
    ebitda,
    ebit,
    financialExpenses,
    netProfit,
    teamCount,
    incomePerPerson,
    expensePerPerson,
    salesProfitability,
    expenseProfitability
  };
}

function writePLTechnicalTotals_(sheet, rows, period, totals) {
  writePLRow_(sheet, rows, period, 'Операційний дохід', totals.revenue);
  writePLRow_(sheet, rows, period, 'Кількість людей в команді', totals.teamCount);
  writePLRow_(sheet, rows, period, 'Валовий дохід', totals.grossIncome);
  writePLRow_(sheet, rows, period, 'Змінні (прямі) витрати', totals.variableExpenses);
  writePLRow_(sheet, rows, period, 'Постійніі (операційні) витрати OPEX', totals.fixedExpenses);
  writePLRow_(sheet, rows, period, 'Постійні (операційні) витрати OPEX', totals.fixedExpenses); 

  writePLRow_(
    sheet,
    rows,
    period,
    'Загальні витрати періоду (по основним статтям + податки + змінні витрати)',
    totals.totalPeriodExpenses
  );

  writePLRow_(sheet, rows, period, 'Амортизація', totals.depreciation);
  writePLRow_(sheet, rows, period, 'Операційний прибуток (EBITDA)', totals.ebitda);
  writePLRow_(sheet, rows, period, 'Операційний прибуток (EBIT)', totals.ebit);
  writePLRow_(sheet, rows, period, 'Видатки фінансової діяльності', totals.financialExpenses);
  writePLRow_(sheet, rows, period, 'Фінансовий результат Чистий прибуток', totals.netProfit);

  writePLRow_(sheet, rows, period, 'Дохід на людину', totals.incomePerPerson);
  writePLRow_(sheet, rows, period, 'Витрати на людину', totals.expensePerPerson);
  writePLRow_(sheet, rows, period, 'Рентабельність продажів %', totals.salesProfitability);
  writePLRow_(sheet, rows, period, 'Рентабельність видатків %', totals.expenseProfitability);
}
