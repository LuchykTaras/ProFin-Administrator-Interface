/**************************************************************
 * PROFIN OS 2026
 * DASHBOARD VISUAL LAYOUT LOCK
 *
 * Призначення:
 * - запам'ятовує еталонний вигляд листа "Дашборд";
 * - повертає на місце Drawings / кнопки;
 * - повертає на місце OverGridImage / PNG-діаграми;
 * - повертає на місце EmbeddedChart;
 * - відновлює ширини колонок A:L;
 * - відновлює висоти рядків 1:230;
 * - відновлює gridlines / frozen rows / frozen columns;
 *
 * НЕ:
 * - не змінює бізнес-дані;
 * - не читає "Базу операцій";
 * - не змінює P&L;
 * - не змінює Cash Flow;
 * - не перебудовує діаграми;
 * - не видаляє об'єкти;
 * - не створює тригери.
 **************************************************************/

const DASHBOARD_VISUAL_LOCK_CONFIG = Object.freeze({
  version:
    'PROFIN_DASHBOARD_VISUAL_LOCK_V2_AH_2026',

  sheetName:
    'Дашборд',

  /*
   * ФАКТИЧНЕ полотно поточного
   * робочого Дашборду.
   *
   * За результатом сканування книги:
   * A:H = 8 колонок.
   *
   * A:L буде використовуватися
   * окремо для Dashboard_v2.
   */
  firstColumn:
    1,

  lastColumn:
    8,

  firstRow:
    1,

  lastRow:
    230,

  /*
   * НОВИЙ snapshot.
   *
   * Не використовуємо старий V1,
   * де були записані A:L.
   */
  propertyKey:
    'PROFIN_DASHBOARD_VISUAL_LAYOUT_V2_AH',

  lockTimeoutMs:
    5000
});


/**************************************************************
 * PUBLIC
 *
 * ЗАПУСТИТИ ОДИН РАЗ ПІСЛЯ ТОГО,
 * ЯК ВСІ ЕЛЕМЕНТИ ВИСТАВЛЕНІ ПРАВИЛЬНО.
 **************************************************************/
function dashboardVisualLayoutCapture() {
  const result =
    dashboardVisualLayoutCapture_();

  Logger.log(
    'dashboardVisualLayoutCapture: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      'Візуальний макет Дашборду зафіксовано.',
      'ProFin OS',
      5
    );

  return result;
}


/**************************************************************
 * PUBLIC
 *
 * РУЧНЕ ВІДНОВЛЕННЯ ЕТАЛОННОГО ВИГЛЯДУ.
 **************************************************************/
function dashboardVisualLayoutRestore() {
  const result =
    dashboardVisualLayoutRestore_({
      source: 'MANUAL',
      silent: false
    });

  Logger.log(
    'dashboardVisualLayoutRestore: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**************************************************************
 * PUBLIC
 *
 * READ-ONLY АУДИТ.
 * НІЧОГО НЕ ЗМІНЮЄ.
 **************************************************************/
function dashboardVisualLayoutAudit() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    DASHBOARD_VISUAL_LOCK_CONFIG;

  const sheet =
    ss.getSheetByName(
      config.sheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.sheetName +
      '».'
    );
  }

  const drawings =
    sheet.getDrawings();

  const images =
    sheet.getImages();

  const charts =
    sheet.getCharts();

  const hasSnapshot =
    Boolean(
      PropertiesService
        .getDocumentProperties()
        .getProperty(
          config.propertyKey
        )
    );

  const result = {
    ok: true,

    mode: 'READ_ONLY_AUDIT',

    version:
      config.version,

    sheet:
      sheet.getName(),

    drawings:
      drawings.length,

    images:
      images.length,

    charts:
      charts.length,

    frozenRows:
      sheet.getFrozenRows(),

    frozenColumns:
      sheet.getFrozenColumns(),

    snapshotExists:
      hasSnapshot,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardVisualLayoutAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**************************************************************
 * PRIVATE
 *
 * ВИКЛИКАЄТЬСЯ З ІСНУЮЧОГО onOpen().
 **************************************************************/
function dashboardVisualLayoutOnOpen_() {
  try {
    return dashboardVisualLayoutRestore_({
      source: 'ON_OPEN',
      silent: true
    });

  } catch (error) {

    console.error(
      'dashboardVisualLayoutOnOpen_: ' +
      error.message
    );

    return {
      ok: false,
      source: 'ON_OPEN',
      error:
        error.message
    };
  }
}


/**************************************************************
 * PRIVATE
 *
 * ЗБЕРЕЖЕННЯ ЕТАЛОННОГО СТАНУ.
 **************************************************************/
function dashboardVisualLayoutCapture_() {
  const config =
    DASHBOARD_VISUAL_LOCK_CONFIG;

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування документа.'
    );
  }

  try {
    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const sheet =
      ss.getSheetByName(
        config.sheetName
      );

    if (!sheet) {
      throw new Error(
        'Не знайдено лист «' +
        config.sheetName +
        '».'
      );
    }

    const snapshot = {
      version:
        config.version,

      spreadsheetId:
        ss.getId(),

      sheetId:
        sheet.getSheetId(),

      sheetName:
        sheet.getName(),

      capturedAt:
        new Date().toISOString(),

      grid: {
        frozenRows:
          sheet.getFrozenRows(),

        frozenColumns:
          sheet.getFrozenColumns(),

        columnWidths:
          dashboardVisualCaptureColumnWidths_(
            sheet
          ),

        rowHeights:
          dashboardVisualCaptureRowHeights_(
            sheet
          )
      },

      drawings:
        dashboardVisualCaptureDrawings_(
          sheet
        ),

      images:
        dashboardVisualCaptureImages_(
          sheet
        ),

      charts:
        dashboardVisualCaptureCharts_(
          sheet
        )
    };

    /*
     * Стан gridlines через API не має
     * окремого getHiddenGridlines().
     *
     * Для твого Дашборду вони повинні
     * бути приховані, тому це є
     * частиною Visual Contract.
     */
    snapshot.grid.hiddenGridlines =
      true;

    PropertiesService
      .getDocumentProperties()
      .setProperty(
        config.propertyKey,
        JSON.stringify(snapshot)
      );

    return {
      ok: true,

      mode:
        'CAPTURE_VISUAL_CONTRACT',

      version:
        config.version,

      sheet:
        sheet.getName(),

      drawingsCaptured:
        snapshot.drawings.length,

      imagesCaptured:
        snapshot.images.length,

      chartsCaptured:
        snapshot.charts.length,

      columnsCaptured:
        snapshot.grid
          .columnWidths.length,

      rowsCaptured:
        snapshot.grid
          .rowHeights.length,

      noBusinessDataChanged:
        true
    };

  } finally {
    lock.releaseLock();
  }
}


/**************************************************************
 * PRIVATE
 *
 * ГОЛОВНИЙ RESTORE.
 **************************************************************/
function dashboardVisualLayoutRestore_(
  options
) {
  const config =
    DASHBOARD_VISUAL_LOCK_CONFIG;

  const opts =
    options || {};

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        'DOCUMENT_LOCK_BUSY'
    };
  }

  try {
    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const sheet =
      ss.getSheetByName(
        config.sheetName
      );

    if (!sheet) {
      throw new Error(
        'Не знайдено лист «' +
        config.sheetName +
        '».'
      );
    }

    const json =
      PropertiesService
        .getDocumentProperties()
        .getProperty(
          config.propertyKey
        );

    if (!json) {
      return {
        ok: false,
        skipped: true,

        reason:
          'VISUAL_SNAPSHOT_NOT_FOUND',

        action:
          'Запусти dashboardVisualLayoutCapture() один раз.'
      };
    }

    const snapshot =
      JSON.parse(json);

    if (
      snapshot.sheetId !==
      sheet.getSheetId()
    ) {
      throw new Error(
        'Збережений Visual Contract належить іншому листу.'
      );
    }

    /*
     * 1. Спочатку геометрія сітки.
     *
     * Від ширини колонок і висоти
     * рядків залежить фактичне
     * візуальне положення об'єктів.
     */
    dashboardVisualRestoreGrid_(
  sheet,
  snapshot.grid
);

/*
 * ВАЖЛИВО:
 * спочатку фізично застосовуємо
 * ширини колонок і висоти рядків.
 *
 * Лише після цього перевіряємо
 * координати Drawings.
 */
SpreadsheetApp.flush();

/*
 * 2. Кнопки / Drawing / UX shapes.
 */
const drawingsResult =
  dashboardVisualRestoreDrawings_(
    sheet,
    snapshot.drawings || []
  );
    /*
     * 3. PNG та інші OverGridImage.
     */
    const imagesResult =
      dashboardVisualRestoreImages_(
        sheet,
        snapshot.images || []
      );

    /*
     * 4. Справжні EmbeddedChart.
     */
    const chartsResult =
      dashboardVisualRestoreCharts_(
        sheet,
        snapshot.charts || []
      );

    SpreadsheetApp.flush();

    const result = {
      ok:
        drawingsResult.ok &&
        imagesResult.ok &&
        chartsResult.ok,

      mode:
        'RESTORE_VISUAL_CONTRACT',

      source:
        opts.source || 'UNKNOWN',

      version:
        snapshot.version,

      sheet:
        sheet.getName(),

      drawings:
        drawingsResult,

      images:
        imagesResult,

      charts:
        chartsResult,

      sheetChanged:
        false,

      noActiveSheetSwitch:
        true,

      noBusinessDataChanged:
        true
    };

    if (
      !opts.silent &&
      result.ok
    ) {
      ss.toast(
        'Макет Дашборду відновлено.',
        'ProFin OS',
        4
      );
    }

    return result;

  } finally {
    lock.releaseLock();
  }
}


/**************************************************************
 * GRID — CAPTURE
 **************************************************************/
function dashboardVisualCaptureColumnWidths_(
  sheet
) {
  const config =
    DASHBOARD_VISUAL_LOCK_CONFIG;

  const result = [];

  for (
    let col = config.firstColumn;
    col <= config.lastColumn;
    col++
  ) {
    result.push({
      column:
        col,

      width:
        sheet.getColumnWidth(col)
    });
  }

  return result;
}


function dashboardVisualCaptureRowHeights_(
  sheet
) {
  const config =
    DASHBOARD_VISUAL_LOCK_CONFIG;

  const result = [];

  for (
    let row = config.firstRow;
    row <= config.lastRow;
    row++
  ) {
    result.push({
      row:
        row,

      height:
        sheet.getRowHeight(row)
    });
  }

  return result;
}


/**************************************************************
 * GRID — RESTORE
 **************************************************************/
function dashboardVisualRestoreGrid_(
  sheet,
  grid
) {
  if (!grid) {
    return;
  }

  /*
   * Ширини колонок.
   */
  (grid.columnWidths || [])
    .forEach(function(item) {
      sheet.setColumnWidth(
        item.column,
        item.width
      );
    });

  /*
   * Висоти рядків.
   */
  (grid.rowHeights || [])
    .forEach(function(item) {
      sheet.setRowHeight(
        item.row,
        item.height
      );
    });

  /*
   * Gridlines.
   */
  sheet.setHiddenGridlines(
    grid.hiddenGridlines !== false
  );

  /*
   * Freeze.
   */
  sheet.setFrozenRows(
    Number(
      grid.frozenRows || 0
    )
  );

  sheet.setFrozenColumns(
    Number(
      grid.frozenColumns || 0
    )
  );
}


/**************************************************************
 * DRAWINGS / КНОПКИ — CAPTURE
 **************************************************************/
function dashboardVisualCaptureDrawings_(
  sheet
) {
  return sheet
    .getDrawings()
    .map(
      function(
        drawing,
        index
      ) {
        const info =
          drawing.getContainerInfo();

        return {
          index:
            index,

          anchorRow:
            info.getAnchorRow(),

          anchorColumn:
            info.getAnchorColumn(),

          offsetX:
            info.getOffsetX(),

          offsetY:
            info.getOffsetY(),

          width:
            drawing.getWidth(),

          height:
            drawing.getHeight(),

          zIndex:
            drawing.getZIndex(),

          onAction:
            drawing.getOnAction() || ''
        };
      }
    );
}


/**************************************************************
 * DRAWINGS / КНОПКИ — RESTORE
 **************************************************************/
function dashboardVisualRestoreDrawings_(
  sheet,
  saved
) {
  const current =
    sheet.getDrawings();

  const used =
    new Set();

  let restored = 0;
  let missing = 0;

  let positionWrites = 0;
  let sizeWrites = 0;

  /*
   * Допуск у 1 px.
   *
   * Через мікрорізницю рендеру
   * не будемо повторно викликати
   * setPosition() при кожному onOpen.
   */
  const PIXEL_TOLERANCE = 1;

  saved.forEach(
    function(expected) {

      const match =
        dashboardVisualFindBestDrawing_(
          current,
          used,
          expected
        );

      if (!match) {
        missing++;
        return;
      }

      used.add(
        match.index
      );

      const drawing =
        match.object;

      /*
       * -----------------------------------------------------
       * 1. ПЕРЕВІРКА РОЗМІРУ
       * -----------------------------------------------------
       *
       * Розмір змінюємо тільки тоді,
       * коли він реально відрізняється
       * від еталонного snapshot.
       */
      const currentWidth =
        drawing.getWidth();

      const currentHeight =
        drawing.getHeight();

      const widthChanged =
        Number.isFinite(expected.width) &&
        Math.abs(
          currentWidth -
          expected.width
        ) > PIXEL_TOLERANCE;

      const heightChanged =
        Number.isFinite(expected.height) &&
        Math.abs(
          currentHeight -
          expected.height
        ) > PIXEL_TOLERANCE;

      if (
        widthChanged
      ) {
        drawing.setWidth(
          expected.width
        );

        sizeWrites++;
      }

      if (
        heightChanged
      ) {
        drawing.setHeight(
          expected.height
        );

        sizeWrites++;
      }

      /*
       * -----------------------------------------------------
       * 2. ПЕРЕВІРКА ПОЗИЦІЇ
       * -----------------------------------------------------
       *
       * setPosition() НЕ викликаємо
       * безумовно.
       *
       * Якщо кнопка вже знаходиться
       * на своєму місці — нічого
       * з нею не робимо.
       */
      const info =
        drawing.getContainerInfo();

      const anchorChanged =
        info.getAnchorRow() !==
          expected.anchorRow ||
        info.getAnchorColumn() !==
          expected.anchorColumn;

      const offsetChanged =
        Math.abs(
          info.getOffsetX() -
          expected.offsetX
        ) > PIXEL_TOLERANCE ||
        Math.abs(
          info.getOffsetY() -
          expected.offsetY
        ) > PIXEL_TOLERANCE;

      if (
        anchorChanged ||
        offsetChanged
      ) {
        drawing.setPosition(
          expected.anchorRow,
          expected.anchorColumn,
          expected.offsetX,
          expected.offsetY
        );

        positionWrites++;
      }

      /*
       * -----------------------------------------------------
       * 3. МАКРОС КНОПКИ
       * -----------------------------------------------------
       *
       * Стару логіку залишаємо.
       */
      if (
        expected.onAction
      ) {
        const currentAction =
          drawing.getOnAction() || '';

        if (
          currentAction !==
          expected.onAction
        ) {
          drawing.setOnAction(
            expected.onAction
          );
        }
      }

      /*
       * -----------------------------------------------------
       * 4. Z-INDEX
       * -----------------------------------------------------
       *
       * Стару логіку також
       * залишаємо без змін.
       */
      if (
        Number.isFinite(
          expected.zIndex
        )
      ) {
        try {
          if (
            drawing.getZIndex() !==
            expected.zIndex
          ) {
            drawing.setZIndex(
              expected.zIndex
            );
          }
        } catch (error) {
          /*
           * Z-index не є критичним.
           */
        }
      }

      restored++;
    }
  );

  return {
    ok:
      missing === 0,

    expected:
      saved.length,

    current:
      current.length,

    restored:
      restored,

    missing:
      missing,

    extra:
      Math.max(
        0,
        current.length -
        saved.length
      ),

    /*
     * Тепер координати відновлюються
     * тільки при реальному зміщенні.
     */
    drawingGeometryMode:
      'RESTORE_ONLY_IF_DRIFTED',

    positionWrites:
      positionWrites,

    sizeWrites:
      sizeWrites
  };
}


function dashboardVisualFindBestDrawing_(
  drawings,
  used,
  expected
) {
  let best = null;
  let bestScore =
    Number.POSITIVE_INFINITY;

  drawings.forEach(
    function(drawing, index) {
      if (
        used.has(index)
      ) {
        return;
      }

      const info =
        drawing.getContainerInfo();

      let score =
        dashboardVisualPositionDistance_(
          info.getAnchorRow(),
          info.getAnchorColumn(),
          info.getOffsetX(),
          info.getOffsetY(),
          expected
        );

      /*
       * Якщо в Drawing є макрос,
       * це дуже сильний ідентифікатор
       * кнопки.
       */
      const currentAction =
        drawing.getOnAction() || '';

      if (
        expected.onAction &&
        currentAction ===
          expected.onAction
      ) {
        score -= 1000000;
      }

      /*
       * Враховуємо розмір.
       */
      score +=
        Math.abs(
          drawing.getWidth() -
          expected.width
        );

      score +=
        Math.abs(
          drawing.getHeight() -
          expected.height
        );

      if (
        score < bestScore
      ) {
        bestScore = score;

        best = {
          index:
            index,

          object:
            drawing
        };
      }
    }
  );

  return best;
}


/**************************************************************
 * OVER-GRID IMAGES / PNG — CAPTURE
 **************************************************************/
function dashboardVisualCaptureImages_(
  sheet
) {
  return sheet
    .getImages()
    .map(
      function(
        image,
        index
      ) {
        const anchor =
          image.getAnchorCell();

        return {
          index:
            index,

          anchorRow:
            anchor.getRow(),

          anchorColumn:
            anchor.getColumn(),

          offsetX:
            image
              .getAnchorCellXOffset(),

          offsetY:
            image
              .getAnchorCellYOffset(),

          width:
            image.getWidth(),

          height:
            image.getHeight(),

          script:
            image.getScript() || '',

          altTitle:
            image
              .getAltTextTitle() ||
            '',

          altDescription:
            image
              .getAltTextDescription() ||
            ''
        };
      }
    );
}


/**************************************************************
 * OVER-GRID IMAGES / PNG — RESTORE
 **************************************************************/
function dashboardVisualRestoreImages_(
  sheet,
  saved
) {
  const current =
    sheet.getImages();

  const used =
    new Set();

  let restored = 0;
  let missing = 0;

  saved.forEach(
    function(expected) {
      const match =
        dashboardVisualFindBestImage_(
          current,
          used,
          expected
        );

      if (!match) {
        missing++;
        return;
      }

      used.add(
        match.index
      );

      const image =
        match.object;

      image
        .setAnchorCell(
          sheet.getRange(
            expected.anchorRow,
            expected.anchorColumn
          )
        )
        .setAnchorCellXOffset(
          expected.offsetX
        )
        .setAnchorCellYOffset(
          expected.offsetY
        )
        .setWidth(
          expected.width
        )
        .setHeight(
          expected.height
        );

      /*
       * Якщо PNG використовується
       * як кнопка — повертаємо script.
       */
      if (
        expected.script
      ) {
        image.assignScript(
          expected.script
        );
      }

      restored++;
    }
  );

  return {
    ok:
      missing === 0,

    expected:
      saved.length,

    current:
      current.length,

    restored:
      restored,

    missing:
      missing,

    extra:
      Math.max(
        0,
        current.length -
        saved.length
      )
  };
}


function dashboardVisualFindBestImage_(
  images,
  used,
  expected
) {
  let best = null;
  let bestScore =
    Number.POSITIVE_INFINITY;

  images.forEach(
    function(image, index) {
      if (
        used.has(index)
      ) {
        return;
      }

      const anchor =
        image.getAnchorCell();

      let score =
        dashboardVisualPositionDistance_(
          anchor.getRow(),
          anchor.getColumn(),
          image.getAnchorCellXOffset(),
          image.getAnchorCellYOffset(),
          expected
        );

      /*
       * Якщо script однаковий —
       * сильний сигнал, що це той
       * самий UX image.
       */
      const script =
        image.getScript() || '';

      if (
        expected.script &&
        script === expected.script
      ) {
        score -= 1000000;
      }

      /*
       * Alt-text використовується
       * тільки як додатковий сигнал.
       */
      const title =
        image.getAltTextTitle() || '';

      if (
        expected.altTitle &&
        title === expected.altTitle
      ) {
        score -= 500000;
      }

      /*
       * Розмір.
       */
      score +=
        Math.abs(
          image.getWidth() -
          expected.width
        );

      score +=
        Math.abs(
          image.getHeight() -
          expected.height
        );

      if (
        score < bestScore
      ) {
        bestScore =
          score;

        best = {
          index:
            index,

          object:
            image
        };
      }
    }
  );

  return best;
}


/**************************************************************
 * EMBEDDED CHART — CAPTURE
 **************************************************************/
function dashboardVisualCaptureCharts_(
  sheet
) {
  return sheet
    .getCharts()
    .map(
      function(
        chart,
        index
      ) {
        const info =
          chart.getContainerInfo();

        const options =
          chart.getOptions();

        return {
          index:
            index,

          chartId:
            chart.getChartId(),

          anchorRow:
            info.getAnchorRow(),

          anchorColumn:
            info.getAnchorColumn(),

          offsetX:
            info.getOffsetX(),

          offsetY:
            info.getOffsetY(),

          width:
            dashboardVisualSafeChartOption_(
              options,
              'width'
            ),

          height:
            dashboardVisualSafeChartOption_(
              options,
              'height'
            )
        };
      }
    );
}


function dashboardVisualSafeChartOption_(
  options,
  key
) {
  try {
    const value =
      options.get(key);

    return (
      typeof value === 'number'
        ? value
        : null
    );

  } catch (error) {
    return null;
  }
}


/**************************************************************
 * EMBEDDED CHART — RESTORE
 **************************************************************/
function dashboardVisualRestoreCharts_(
  sheet,
  saved
) {
  const current =
    sheet.getCharts();

  let restored = 0;
  let missing = 0;

  saved.forEach(
    function(expected) {
      let chart = null;

      /*
       * chartId — стабільний
       * ідентифікатор EmbeddedChart.
       */
      if (
        expected.chartId !== null &&
        expected.chartId !== undefined
      ) {
        chart =
          current.find(
            function(candidate) {
              return (
                candidate.getChartId() ===
                expected.chartId
              );
            }
          );
      }

      /*
       * Fallback для старого об'єкта.
       */
      if (
        !chart &&
        current[
          expected.index
        ]
      ) {
        chart =
          current[
            expected.index
          ];
      }

      if (!chart) {
        missing++;
        return;
      }

      let builder =
        chart
          .modify()
          .setPosition(
            expected.anchorRow,
            expected.anchorColumn,
            expected.offsetX,
            expected.offsetY
          );

      if (
        typeof expected.width ===
        'number'
      ) {
        builder =
          builder.setOption(
            'width',
            expected.width
          );
      }

      if (
        typeof expected.height ===
        'number'
      ) {
        builder =
          builder.setOption(
            'height',
            expected.height
          );
      }

      const updated =
        builder.build();

      sheet.updateChart(
        updated
      );

      restored++;
    }
  );

  return {
    ok:
      missing === 0,

    expected:
      saved.length,

    current:
      current.length,

    restored:
      restored,

    missing:
      missing,

    extra:
      Math.max(
        0,
        current.length -
        saved.length
      )
  };
}


/**************************************************************
 * HELPER
 **************************************************************/
function dashboardVisualPositionDistance_(
  row,
  column,
  offsetX,
  offsetY,
  expected
) {
  /*
   * Рядок/колонка мають набагато
   * більшу вагу за pixel offset.
   */
  return (
    Math.abs(
      row -
      expected.anchorRow
    ) * 100000 +

    Math.abs(
      column -
      expected.anchorColumn
    ) * 100000 +

    Math.abs(
      offsetX -
      expected.offsetX
    ) +

    Math.abs(
      offsetY -
      expected.offsetY
    )
  );
}