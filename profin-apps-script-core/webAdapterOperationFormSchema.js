/****************************************************
 * PROFIN OS
 * WEB ADAPTER — OPERATION FORM SCHEMA
 * --------------------------------------------------
 * PATCH 37.4
 *
 * READ-ONLY thin adapter.
 *
 * ВАЖЛИВО:
 * - workbook приходить тільки з trustedRoute;
 * - browser не передає spreadsheetId;
 * - категорії/статті/рахунки/лікарі/пацієнти
 *   беруться з чинного domain core;
 * - B4:B15 не є джерелом web-state;
 * - цей файл нічого не записує у workbook.
 ****************************************************/


var PROFIN_WEB_OPERATION_FORM_SCHEMA_VERSION =
  'PROFIN_WEB_OPERATION_FORM_SCHEMA_PATCH_37_4_2026';


/****************************************************
 * ENTRY POINT
 ****************************************************/

function profinWebAdapterGetOperationFormSchema_(
  request,
  trustedRoute
) {
  if (
    !request ||
    !request.payload ||
    typeof request.payload !==
      'object' ||
    Array.isArray(
      request.payload
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'FORM_SCHEMA_PAYLOAD_REQUIRED',
      'Не передано параметри форми операції.',
      'request.payload must be an object.',
      false
    );
  }


  if (
    !trustedRoute ||
    !trustedRoute.spreadsheet
  ) {
    throw profinWebAdapterError_(
      500,
      'TRUSTED_WORKBOOK_REQUIRED',
      'Не вдалося визначити активну річну таблицю.',
      'trustedRoute.spreadsheet is missing.',
      false
    );
  }


  var spreadsheet =
    trustedRoute.spreadsheet;


  var payload =
    request.payload;


  var operationType =
    profinWebFormSchemaClean_(
      payload.operationType ||
      payload.type
    );


  var category =
    profinWebFormSchemaClean_(
      payload.category
    );


  var article =
    profinWebFormSchemaClean_(
      payload.article
    );


  var previousSpreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();


  try {
    /*
     * Чинні strict domain helpers
     * використовують getActiveSpreadsheet().
     *
     * Активуємо ТІЛЬКИ workbook,
     * уже перевірений HMAC + annual route.
     */
    SpreadsheetApp.setActiveSpreadsheet(
      spreadsheet
    );


    if (
      typeof resetCodeRegistryCache_ ===
        'function'
    ) {
      resetCodeRegistryCache_();
    }


    profinWebFormSchemaRequireFunction_(
      'getStrictInputOperationTypes_',
      typeof getStrictInputOperationTypes_
    );


    profinWebFormSchemaRequireFunction_(
      'getStrictInputCategories_',
      typeof getStrictInputCategories_
    );


    profinWebFormSchemaRequireFunction_(
      'getStrictInputArticles_',
      typeof getStrictInputArticles_
    );


    profinWebFormSchemaRequireFunction_(
      'getAccountList_',
      typeof getAccountList_
    );


    profinWebFormSchemaRequireFunction_(
      'getDoctors_',
      typeof getDoctors_
    );


    /**************************************************
     * DOMAIN OPTIONS
     *
     * PATCH 37.4 STABLE BASELINE:
     * усі довідникові дані читаються без CacheService
     * та без відкладеного завантаження dependent options.
     *
     * Це повертає поведінку до стабільного стану,
     * у якому getOperationFormSchemaWeb вже працював,
     * а createOperationWeb проходив у реальний domain core.
     **************************************************/

    var operationTypes =
      profinWebFormSchemaNormalizeStringList_(
        getStrictInputOperationTypes_()
      );


    profinWebFormSchemaAssertAllowed_(
      operationType,
      operationTypes,
      'INVALID_OPERATION_TYPE',
      'Обраний тип операції недоступний.'
    );


    var accounts =
      profinWebFormSchemaNormalizeStringList_(
        getAccountList_()
      );


    var categories =
      operationType
        ? profinWebFormSchemaNormalizeStringList_(
            getStrictInputCategories_(
              operationType
            )
          )
        : [];


    profinWebFormSchemaAssertAllowed_(
      category,
      categories,
      'INVALID_OPERATION_CATEGORY',
      'Обрана категорія недоступна для цього типу операції.'
    );


    var rawArticles =
      operationType &&
      category
        ? getStrictInputArticles_(
            operationType,
            category
          )
        : [];


    var articleMode =
      rawArticles === null
        ? 'MANUAL'
        : 'LIST';


    var articles =
      rawArticles === null
        ? []
        : profinWebFormSchemaNormalizeStringList_(
            rawArticles
          );


    if (
      article &&
      articleMode === 'LIST'
    ) {
      profinWebFormSchemaAssertAllowed_(
        article,
        articles,
        'INVALID_OPERATION_ARTICLE',
        'Обрана стаття недоступна для цього сценарію.'
      );
    }


    var dictionarySheet =
      spreadsheet.getSheetByName(
        'Довідник'
      );


    if (!dictionarySheet) {
      throw profinWebAdapterError_(
        409,
        'DOMAIN_DICTIONARY_MISSING',
        'Не знайдено системний довідник.',
        'Sheet "Довідник" is missing.',
        false
      );
    }


    var doctors =
      profinWebFormSchemaNormalizeStringList_(
        getDoctors_(
          dictionarySheet
        )
      );


    var patients =
      profinWebFormSchemaGetPatients_(
        spreadsheet
      );


    var inventoryNames =
      [];


    if (
      typeof getInventoryReceiptNameList_ ===
        'function'
    ) {
      inventoryNames =
        profinWebFormSchemaNormalizeStringList_(
          getInventoryReceiptNameList_(
            article,
            dictionarySheet
          )
        );
    }


    var storedVaccines =
      profinWebFormSchemaGetStoredVaccines_();


    var newStatuses =
      profinWebFormSchemaNormalizeStringList_(
        getStrictInputArticles_(
          'Вакцина',
          'Зміна статусу'
        ) || []
      );


    var scenario =
      profinWebFormSchemaResolveScenario_(
        operationType,
        category,
        article
      );


    var sections =
      profinWebFormSchemaBuildSections_(
        scenario
      );


    var controls =
      profinWebFormSchemaBuildControls_({
        request:
          request,

        operationType:
          operationType,

        category:
          category,

        article:
          article,

        articleMode:
          articleMode,

        operationTypes:
          operationTypes,

        accounts:
          accounts,

        categories:
          categories,

        articles:
          articles,

        doctors:
          doctors,

        patients:
          patients,

        inventoryNames:
          inventoryNames,

        storedVaccines:
          storedVaccines,

        newStatuses:
          newStatuses,

        scenario:
          scenario
      });


    var schemaMaterial = {
      version:
        PROFIN_WEB_OPERATION_FORM_SCHEMA_VERSION,

      selected: {
        operationType:
          operationType || null,

        category:
          category || null,

        article:
          article || null
      },

      operationTypes:
        operationTypes,

      sections:
        sections,

      controls:
        controls
    };


    return {
      version:
        PROFIN_WEB_OPERATION_FORM_SCHEMA_VERSION,

      schemaChecksum:
        profinWebFormSchemaChecksum_(
          schemaMaterial
        ),

      source:
        'DOMAIN',

      domainOptionsReady:
        true,

      selected: {
        operationType:
          operationType || null,

        category:
          category || null,

        article:
          article || null
      },

      operationTypes:
        operationTypes,

      sections:
        sections,

      controls:
        controls,

      canSubmit:
        Boolean(
          operationType &&
          scenario.webWriteEnabled
        ),

      unavailableReason:
        !operationType
          ? null
          : scenario.unavailableReason,

      checkedAt:
        new Date()
          .toISOString()
    };

  } finally {
    if (
      previousSpreadsheet &&
      previousSpreadsheet.getId() !==
        spreadsheet.getId()
    ) {
      try {
        SpreadsheetApp.setActiveSpreadsheet(
          previousSpreadsheet
        );
      } catch (restoreError) {
        console.log(
          '[PATCH37_4_SCHEMA_RESTORE] ' +
          String(
            restoreError &&
            restoreError.message
              ? restoreError.message
              : restoreError
          )
        );
      }
    }
  }
}


/****************************************************
 * PATIENTS
 ****************************************************/

function profinWebFormSchemaGetPatients_(
  spreadsheet
) {
  if (
    typeof buildPatientDropdownRows_ !==
      'function'
  ) {
    return [];
  }


  var sheetName =
    typeof PROF_IN_CLIENTS_CONFIG !==
      'undefined' &&
    PROF_IN_CLIENTS_CONFIG &&
    PROF_IN_CLIENTS_CONFIG.clientsSheetName
      ? PROF_IN_CLIENTS_CONFIG.clientsSheetName
      : 'Клієнтська база';


  var clientsSheet =
    spreadsheet.getSheetByName(
      sheetName
    );


  if (!clientsSheet) {
    return [];
  }


  var rows =
    buildPatientDropdownRows_(
      clientsSheet
    );


  if (!Array.isArray(rows)) {
    return [];
  }


  var result =
    [];


  var used =
    {};


  rows.forEach(
    function(row) {
      if (!Array.isArray(row)) {
        return;
      }


      var label =
        profinWebFormSchemaClean_(
          row[0]
        );


      var id =
        profinWebFormSchemaClean_(
          row[1]
        );


      /*
       * "Новий клієнт" має порожній ID.
       * createOperationWeb зараз приймає
       * лише існуючий patientId.
       */
      if (
        !label ||
        !id ||
        used[id]
      ) {
        return;
      }


      used[id] =
        true;


      result.push({
        value:
          id,

        label:
          label
      });
    }
  );


  return result;
}


/****************************************************
 * STORED VACCINES
 ****************************************************/

function profinWebFormSchemaGetStoredVaccines_() {
  if (
    typeof getStoredVaccinesForDropdown_ !==
      'function'
  ) {
    return [];
  }


  var values =
    getStoredVaccinesForDropdown_();


  if (!Array.isArray(values)) {
    return [];
  }


  return values
    .map(
      function(value) {
        var label =
          profinWebFormSchemaClean_(
            value
          );


        var id =
          label
            ? profinWebFormSchemaClean_(
                label.split('|')[0]
              )
            : '';


        if (
          !id ||
          !label
        ) {
          return null;
        }


        return {
          value:
            id,

          label:
            label
        };
      }
    )
    .filter(
      function(item) {
        return Boolean(item);
      }
    );
}


/****************************************************
 * SCENARIO
 ****************************************************/

function profinWebFormSchemaResolveScenario_(
  operationType,
  category,
  article
) {
  var isPackage =
    operationType ===
      'Пакет';


  var isVaccine =
    operationType ===
      'Вакцина';


  var isVaccineSale =
    isVaccine &&
    (
      category ===
        'Продаж і використання' ||
      category ===
        'Продаж на зберігання'
    );


  var isVaccineStatus =
    isVaccine &&
    category ===
      'Зміна статусу';


  var isAsset =
    operationType ===
      'Актив';


  var isTransfer =
    operationType ===
      'Інкасація';


  var isInventoryReceipt =
    typeof isInventoryReceiptOperation_ ===
      'function'
      ? isInventoryReceiptOperation_({
          type:
            operationType,

          category:
            category,

          article:
            article
        })
      : false;


  var webWriteEnabled =
    true;


  var unavailableReason =
    null;


  /*
   * Ці два сценарії прямо заблоковані
   * у webAdapterCreateOperation.js.
   */
  if (isAsset) {
    webWriteEnabled =
      false;

    unavailableReason =
      'Веб-проведення активів ще не підключене.';
  }


  if (isVaccineStatus) {
    webWriteEnabled =
      false;

    unavailableReason =
      'Веб-зміна статусу вакцини ще не підключена.';
  }


  return {
    isPackage:
      isPackage,

    isVaccine:
      isVaccine,

    isVaccineSale:
      isVaccineSale,

    isVaccineStatus:
      isVaccineStatus,

    isAsset:
      isAsset,

    isTransfer:
      isTransfer,

    isInventoryReceipt:
      isInventoryReceipt,

    webWriteEnabled:
      webWriteEnabled,

    unavailableReason:
      unavailableReason
  };
}


/****************************************************
 * SECTIONS
 ****************************************************/

function profinWebFormSchemaBuildSections_(
  scenario
) {
  return [
    {
      id:
        'basic',

      title:
        'Основні дані',

      order:
        10,

      visible:
        true,

      domainControlled:
        true
    },

    {
      id:
        'package',

      title:
        'Пакет',

      order:
        20,

      visible:
        scenario.isPackage,

      domainControlled:
        true
    },

    {
      id:
        'vaccine',

      title:
        'Вакцина',

      order:
        30,

      visible:
        scenario.isVaccineSale,

      domainControlled:
        true
    },

    {
      id:
        'inventory',

      title:
        'Склад',

      order:
        40,

      visible:
        scenario.isInventoryReceipt,

      domainControlled:
        true
    },

    {
      id:
        'asset',

      title:
        'Актив',

      order:
        50,

      visible:
        scenario.isAsset,

      domainControlled:
        true
    },

    {
      id:
        'vaccine-status',

      title:
        'Статус вакцини',

      order:
        60,

      visible:
        scenario.isVaccineStatus,

      domainControlled:
        true
    }
  ];
}


/****************************************************
 * CONTROLS
 ****************************************************/

function profinWebFormSchemaBuildControls_(
  context
) {
  var scenario =
    context.scenario;


  var timezone =
    context.request &&
    context.request.context &&
    context.request.context.timezone
      ? String(
          context.request.context.timezone
        )
      : Session.getScriptTimeZone();


  var currentDate =
    Utilities.formatDate(
      new Date(),
      timezone,
      'yyyy-MM-dd'
    );


  var typeSelected =
    Boolean(
      context.operationType
    );


  var categorySelected =
    Boolean(
      context.category
    );


  var articleSelected =
    Boolean(
      context.article
    );


  var articleIsManual =
    context.articleMode ===
      'MANUAL';


  return [
    profinWebFormSchemaControl_(
      'date',
      'Дата операції',
      'date',
      'basic',
      10,
      true,
      true,
      true,
      [],
      currentDate
    ),

    profinWebFormSchemaControl_(
      'account',
      'Рахунок',
      'select',
      'basic',
      20,
      true,
      true,
      context.accounts.length > 0,
      context.accounts,
      null
    ),

    profinWebFormSchemaControl_(
      'type',
      'Тип операції',
      'select',
      'basic',
      30,
      true,
      true,
      true,
      context.operationTypes,
      context.operationType || null
    ),

    profinWebFormSchemaControl_(
      'category',
      'Категорія',
      'select',
      'basic',
      40,
      true,
      true,
      typeSelected &&
        context.categories.length > 0,
      context.categories,
      context.category || null
    ),

    profinWebFormSchemaControl_(
      'article',
      scenario.isAsset
        ? 'Назва активу'
        : 'Стаття',
      articleIsManual
        ? 'text'
        : 'select',
      'basic',
      50,
      true,
      true,
      typeSelected &&
        categorySelected &&
        (
          articleIsManual ||
          context.articles.length > 0
        ),
      articleIsManual
        ? []
        : context.articles,
      context.article || null
    ),

    profinWebFormSchemaControl_(
      'doctor',
      'Лікар',
      'select',
      'basic',
      60,
      false,
      !scenario.isVaccineStatus &&
        !scenario.isInventoryReceipt,
      context.doctors.length > 0,
      context.doctors,
      null
    ),

    profinWebFormSchemaControl_(
      'patient',
      'Пацієнт',
      'entity-select',
      'basic',
      70,
      false,
      !scenario.isVaccineStatus &&
        !scenario.isInventoryReceipt,
      context.patients.length > 0,
      context.patients,
      null
    ),

    profinWebFormSchemaControl_(
      'unitPrice',
      'Ціна за одиницю',
      'number',
      'basic',
      80,
      false,
      !scenario.isVaccineStatus,
      true,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'quantity',
      'Кількість',
      'number',
      'basic',
      90,
      false,
      !scenario.isVaccineStatus,
      true,
      [],
      '1'
    ),

    profinWebFormSchemaControl_(
      'amount',
      'Сума',
      'number',
      'basic',
      100,
      !scenario.isVaccineStatus,
      !scenario.isVaccineStatus,
      true,
      [],
      scenario.isVaccineStatus
        ? '0'
        : null
    ),

    profinWebFormSchemaControl_(
      'transferTo',
      'На рахунок',
      'select',
      'basic',
      110,
      scenario.isTransfer,
      scenario.isTransfer,
      scenario.isTransfer &&
        context.accounts.length > 0,
      context.accounts,
      null
    ),

    profinWebFormSchemaControl_(
      'comment',
      'Коментар',
      'textarea',
      'basic',
      120,
      false,
      true,
      true,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'packageStart',
      'Дата старту пакета',
      'date',
      'package',
      210,
      scenario.isPackage,
      scenario.isPackage,
      scenario.isPackage,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'packageDuration',
      'Тривалість пакета, міс.',
      'number',
      'package',
      220,
      scenario.isPackage,
      scenario.isPackage,
      scenario.isPackage,
      [],
      context.category ===
        '6 місяців'
        ? '6'
        : (
            context.category ===
              '12 місяців'
              ? '12'
              : null
          )
    ),

    profinWebFormSchemaControl_(
      'packageMonthlyAmount',
      'Сума на місяць',
      'number',
      'package',
      230,
      scenario.isPackage,
      scenario.isPackage,
      scenario.isPackage,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'packageAccrualStart',
      'Старт нарахування',
      'date',
      'package',
      240,
      scenario.isPackage,
      scenario.isPackage,
      scenario.isPackage,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'vaccineName',
      'Назва вакцини',
      'readonly',
      'vaccine',
      310,
      false,
      scenario.isVaccineSale,
      false,
      [],
      context.article || null
    ),

    profinWebFormSchemaControl_(
      'vaccinePatient',
      'Пацієнт вакцини',
      'readonly',
      'vaccine',
      320,
      false,
      scenario.isVaccineSale,
      false,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'vaccineCost',
      'Собівартість вакцини',
      'number',
      'vaccine',
      330,
      false,
      scenario.isVaccineSale,
      scenario.isVaccineSale,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'vaccineSeries',
      'Серія',
      'readonly',
      'vaccine',
      340,
      false,
      scenario.isVaccineSale,
      false,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'inventoryName',
      'Найменування',
      'select',
      'inventory',
      410,
      scenario.isInventoryReceipt,
      scenario.isInventoryReceipt,
      scenario.isInventoryReceipt &&
        articleSelected &&
        context.inventoryNames.length > 0,
      context.inventoryNames,
      null
    ),

    profinWebFormSchemaControl_(
      'inventorySeries',
      'Серія / партія',
      'text',
      'inventory',
      420,
      false,
      scenario.isInventoryReceipt,
      scenario.isInventoryReceipt,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'inventoryExpiryDate',
      'Термін придатності',
      'date',
      'inventory',
      430,
      false,
      scenario.isInventoryReceipt,
      scenario.isInventoryReceipt,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'inventorySupplier',
      'Постачальник',
      'text',
      'inventory',
      440,
      false,
      scenario.isInventoryReceipt,
      scenario.isInventoryReceipt,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'assetName',
      'Назва активу',
      'readonly',
      'asset',
      510,
      false,
      scenario.isAsset,
      false,
      [],
      context.article || null
    ),

    profinWebFormSchemaControl_(
      'assetCategory',
      'Категорія активу',
      'readonly',
      'asset',
      520,
      false,
      scenario.isAsset,
      false,
      [],
      context.category || null
    ),

    profinWebFormSchemaControl_(
      'assetAmortization',
      'Строк амортизації, років',
      'number',
      'asset',
      530,
      scenario.isAsset,
      scenario.isAsset,
      scenario.isAsset,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'assetStartDate',
      'Дата введення в експлуатацію',
      'date',
      'asset',
      540,
      scenario.isAsset,
      scenario.isAsset,
      scenario.isAsset,
      [],
      null
    ),

    profinWebFormSchemaControl_(
      'storedVaccineId',
      'Вакцина на зберіганні',
      'entity-select',
      'vaccine-status',
      610,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus &&
        context.storedVaccines.length > 0,
      context.storedVaccines,
      null
    ),

    profinWebFormSchemaControl_(
      'newStatus',
      'Новий статус',
      'select',
      'vaccine-status',
      620,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus,
      context.newStatuses,
      context.article || null
    ),

    profinWebFormSchemaControl_(
      'actualDate',
      'Фактична дата',
      'date',
      'vaccine-status',
      630,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus,
      scenario.isVaccineStatus,
      [],
      currentDate
    )
  ];
}


function profinWebFormSchemaControl_(
  key,
  label,
  kind,
  section,
  order,
  required,
  visible,
  enabled,
  options,
  defaultValue
) {
  return {
    key:
      key,

    label:
      label,

    kind:
      kind,

    section:
      section,

    order:
      order,

    required:
      Boolean(required),

    visible:
      Boolean(visible),

    enabled:
      Boolean(enabled),

    options:
      Array.isArray(options)
        ? options
        : [],

    defaultValue:
      defaultValue === null ||
      typeof defaultValue ===
        'undefined'
        ? null
        : String(defaultValue),

    source:
      'DOMAIN'
  };
}


/****************************************************
 * HELPERS
 ****************************************************/

function profinWebFormSchemaRequireFunction_(
  name,
  actualType
) {
  if (
    actualType !==
      'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'DOMAIN_FORM_SCHEMA_HELPER_MISSING',
      'Доменний контракт форми недоступний.',
      'Required domain helper is missing: ' +
        name,
      false
    );
  }
}


function profinWebFormSchemaAssertAllowed_(
  value,
  allowed,
  code,
  userMessage
) {
  if (!value) {
    return;
  }


  if (
    allowed.indexOf(value) !==
      -1
  ) {
    return;
  }


  throw profinWebAdapterError_(
    400,
    code,
    userMessage,
    'Unsupported value: ' +
      value,
    false
  );
}


function profinWebFormSchemaNormalizeStringList_(
  values
) {
  if (!Array.isArray(values)) {
    return [];
  }


  var result =
    [];


  var used =
    {};


  values.forEach(
    function(value) {
      var normalized =
        profinWebFormSchemaClean_(
          value
        );


      if (
        !normalized ||
        used[normalized]
      ) {
        return;
      }


      used[normalized] =
        true;


      result.push(
        normalized
      );
    }
  );


  return result;
}


function profinWebFormSchemaClean_(
  value
) {
  return String(
    value === null ||
    typeof value ===
      'undefined'
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


function profinWebFormSchemaChecksum_(
  value
) {
  var digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(value),
      Utilities.Charset.UTF_8
    );


  return digest
    .map(
      function(byte) {
        var normalized =
          byte < 0
            ? byte + 256
            : byte;


        var hex =
          normalized
            .toString(16);


        return hex.length === 1
          ? '0' + hex
          : hex;
      }
    )
    .join('');
}
