/**
 * ============================================================
 * ПЕРСОНАЛЬНА АВТОРИЗАЦІЯ — АЛЬТЕРНАТИВА.БАБУРКА
 * ============================================================
 *
 * Файл використовується лише для перевірки та отримання
 * персонального посилання авторизації користувача.
 *
 * Не змінює дані таблиці та логіку переміщень.
 */


/**
 * Загальна перевірка авторизації поточного користувача.
 *
 * Запускати вручну з редактора Apps Script
 * під акаунтом користувача, у якого виникає помилка.
 */
function authorizeCurrentUserBaburka() {
  const authInfo = ScriptApp.getAuthorizationInfo(
    ScriptApp.AuthMode.FULL
  );

  const status = authInfo.getAuthorizationStatus();

  console.log('Проєкт: АЛЬТЕРНАТИВА.БАБУРКА');
  console.log('Статус авторизації: ' + status);

  if (
    status === ScriptApp.AuthorizationStatus.REQUIRED
  ) {
    const authorizationUrl = authInfo.getAuthorizationUrl();

    console.log('ПОТРІБНА АВТОРИЗАЦІЯ');
    console.log('Відкрийте посилання:');
    console.log(authorizationUrl);

    return authorizationUrl;
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'Не знайдено прив’язану Google-таблицю. ' +
      'Відкрийте Apps Script через Розширення → Apps Script ' +
      'саме з таблиці «ProFin OS 2026 — Бабурка».'
    );
  }

  console.log('Авторизацію вже надано.');
  console.log('Таблиця: ' + spreadsheet.getName());
  console.log('ID таблиці: ' + spreadsheet.getId());

  return 'AUTHORIZED';
}


/**
 * Перевірка конкретних дозволів:
 * 1. доступ до Google Sheets;
 * 2. доступ до контейнерного інтерфейсу для showModalDialog().
 *
 * Саме цю функцію запускати, якщо користувач бачить помилку:
 * "нет разрешения на вызов функции Ui.showModalDialog".
 */
function getUiAuthorizationLinkBaburka() {
  const requiredScopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.container.ui'
  ];

  const authInfo = ScriptApp.getAuthorizationInfo(
    ScriptApp.AuthMode.FULL,
    requiredScopes
  );

  const status = authInfo.getAuthorizationStatus();
  const authorizedScopes = authInfo.getAuthorizedScopes() || [];
  const authorizationUrl = authInfo.getAuthorizationUrl();

  console.log('Проєкт: АЛЬТЕРНАТИВА.БАБУРКА');
  console.log('Статус авторизації: ' + status);
  console.log(
    'Уже надані дозволи: ' +
    JSON.stringify(authorizedScopes)
  );

  const missingScopes = requiredScopes.filter(
    scope => !authorizedScopes.includes(scope)
  );

  if (missingScopes.length > 0) {
    console.log(
      'Відсутні дозволи: ' +
      JSON.stringify(missingScopes)
    );
  } else {
    console.log(
      'Обидва необхідні дозволи присутні.'
    );
  }

  if (authorizationUrl) {
    console.log('ПОСИЛАННЯ ДЛЯ АВТОРИЗАЦІЇ:');
    console.log(authorizationUrl);

    return authorizationUrl;
  }

  console.log(
    'Apps Script вважає, що додаткова авторизація не потрібна.'
  );

  return 'AUTHORIZATION_NOT_REQUIRED';
}