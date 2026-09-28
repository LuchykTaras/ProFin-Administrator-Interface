# ProFin OS 2026 — Administrator Interface

Вебкабінет адміністратора ProFin OS на **Next.js + TypeScript**, підключений до server-side API, Neon, Apps Script domain core та річної Google-таблиці.

Проєкт є веб-обкладинкою над чинним доменним ядром ProFin OS і не дублює фінансову, складську або облікову бізнес-логіку у frontend.

## Поточна архітектура

```text
Browser
  ↓
Next.js UI
  ↓
Next.js Server API
  ↓
Session / RBAC / trusted route
  ↓
Neon route registry
  ↓
Apps Script Web Adapter
  ↓
ProFin OS Domain Core
  ↓
Google Sheets

Браузер не визначає напряму:
- spreadsheetId;
- projectId;
- locationId;
- активний фінансовий рік;
- роль користувача;
- Google credentials;
- Apps Script secrets.
Контекст визначається server-side через сесію та route registry.
Поточний маршрут
Поточний кабінет працює з річним контуром:
ProFin OS 2026 — Альтернатива Бабурка

Маршрутизація виконується через Neon year_registry.
Для активного маршруту визначаються:
- projectId;
- locationId;
- financialYear;
- spreadsheetId;
- schemaVersion;
- статус маршруту.
Frontend не містить hard-coded Google Spreadsheet ID.
Що реалізовано
Авторизація та доступ
- server-side session;
- ролі користувачів;
- перевірка дозволених дій;
- блокування / розблокування користувачів;
- аудит адміністративних дій;
- контроль активної сесії.
Каса
Головний робочий екран адміністратора:
- операції за сьогодні;
- операції, що очікують дій;
- переміщення;
- низький залишок;
- швидкі дії;
- останні операції;
- оперативний складський стан.
Без відображення власницьких:
- P&L;
- Cash Flow;
- Dashboard;
- службових аркушів;
- формул Google Sheets.
Швидкі операції
Підтримується server-driven форма для типів операцій:
- Доходи;
- Витрати;
- Інкасація;
- Фінансова діяльність;
- Актив;
- Вакцина;
- Пакет.
Структура форми отримується із domain core.
Frontend не зберігає власний спрощений набір бізнес-правил.
Залежно від операції domain schema визначає:
- доступні категорії;
- статті;
- рахунки;
- лікарів;
- пацієнтів;
- required-поля;
- conditional sections;
- доступність проведення.
Операція «Актив»
Форма підтримує:
- назву активу;
- категорію активу;
- строк амортизації;
- дату введення в експлуатацію.
WEB payload передається через:
/api/operations/create
        ↓
createOperationWeb
        ↓
Apps Script Web Adapter
        ↓
postInputOperationCore_
        ↓
asset domain core

Бізнес-правила активів залишаються в Apps Script domain core.
Скасування операції
У вебкабінеті підключена дія:
Скасувати операцію

Скасування виконується за operationId.
Сценарій:
Web UI
  ↓
POST /api/operations/cancel
  ↓
cancelOperation
  ↓
Apps Script domain core
  ↓
Google Sheets

Проведений запис не видаляється фізично.
Застосовується чинна доменна політика скасування та залежностей.
Google Sheets
Google Sheets залишаються джерелом операційних фактів.
Основні контури:
- Ввід операцій;
- База операцій;
- Клієнтська база;
- Склад медичних запасів;
- Рух складу;
- Облік вакцин;
- Нарахування;
- Активи;
- інші domain-листи ProFin OS.
Вебкабінет не виконує довільні прямі записи у діапазони Google Sheets.
Усі write-операції проходять через Apps Script domain core.
Apps Script
Apps Script використовується як domain adapter та доменне ядро.
Основні web-adapter модулі включають:
webAdapterCreateOperation
webAdapterOperationFormSchema
webAdapterOperationalCommands
webAdapterIdempotency
webAdapterReplayGuard
webAdapterSchemaGuard
webAdapterSecurity

Domain logic не переноситься у Next.js.
Захист write-операцій
Для write-сценаріїв використовуються:
- server-side session;
- RBAC;
- trusted route;
- HMAC / server-to-server validation;
- timestamp;
- nonce;
- payload hash;
- requestId;
- idempotencyKey;
- operationId;
- ScriptLock;
- audit;
- schema guard;
- post-condition;
- rollback для критичних domain-сценаріїв.
Повторний submit з тим самим idempotency key не повинен створювати дубль операції.
Neon
Neon використовується як серверний контрольний шар.
Зокрема зберігаються:
- користувачі;
- сесії;
- ролі;
- audit events;
- route registry;
- конфігурація річних контурів.
Маршрут Google-таблиці визначається через:
projectId
+
locationId
+
financialYear

а не передається браузером.
Принцип одного вебкабінету
ProFin OS використовує один frontend для кількох бізнес-маршрутів.
Модель:
User
  ↓
Session
  ↓
Project / Location / Year
  ↓
Route Registry
  ↓
Google Spreadsheet
  ↓
Domain Profile
  ↓
UI Profile

Нові таблиці та наступні фінансові роки повинні підключатися через конфігурацію маршруту без створення окремої копії frontend.
Основні правила
1. Frontend не дублює бізнес-логіку Apps Script.
2. Browser не отримує Google credentials або trusted spreadsheetId.
3. Google Sheets залишаються джерелом фінансових та операційних фактів.
4. Проведені операції не видаляються фізично.
5. Усі критичні write-операції мають idempotency та audit.
6. Зміна одного route не повинна змінювати domain profile іншого route.
7. WEB-операція повинна мати той самий бізнес-результат, що й відповідна операція у чинному ProFin OS.
Локальний запуск
Потрібен:
Node.js 20+

Відкрити корінь проєкту у Visual Studio Code.
Встановити залежності:
npm install

Запустити development server:
npm run dev

Відкрити:
http://localhost:3000

Production build
Перевірка production build:
npm run build

Запуск production build:
npm start

Deployment
Frontend розгортається через Vercel.
Apps Script Web App має окремий versioned deployment.
Після зміни production Apps Script:
Save
→ Deploy
→ Manage deployments
→ Edit
→ New version
→ Deploy

Існуючий /exec URL при оновленні того самого deployment зберігається.
Статус проєкту
Проєкт знаходиться на етапі підключення повного набору робочих сценаріїв ProFin OS до вебкабінету.
Базова архітектура:
Next.js
+
Neon
+
Apps Script
+
Google Sheets
