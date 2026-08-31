# ProFin OS — VS Code Prototype

Це frontend-прототип вебкабінету касира на Next.js + TypeScript.

## Що реалізовано

- Дизайн у стилі погодженого макету.
- **Розділу "Звіти" немає.**
- Навігація:
  - Каса
  - Журнал операцій
  - Склад
  - Переміщення
  - Повернення
  - Коригування
  - Мій доступ
- Каса:
  - операційні KPI без P&L / Cash Flow / Dashboard;
  - швидкі дії;
  - останні операції;
  - пошук;
  - оперативні залишки складу;
  - повідомлення;
  - статус API.
- "Нова операція":
  - форма;
  - review перед write;
  - блокування повторної submit;
  - operationId після успіху.
- `/api/health` — приклад стандартизованої server-side відповіді.
- Responsive layout.

## Важливо по архітектурі

У прототипі дані mock. Клієнтський браузер НЕ повинен напряму писати в Google Sheets.

Наступний шар:

UI -> Next.js server API -> ProFin OS Apps Script domain core -> Google Sheets

У write endpoint потрібно додати:
- session/RBAC;
- projectId/locationId із server-side session;
- idempotencyKey;
- requestId;
- validation;
- підпис server-to-server;
- AuditEvent;
- retry тільки для retryable помилок.

## Запуск у Visual Studio Code

1. Встановіть Node.js 20+.
2. Розпакуйте ZIP.
3. Відкрийте папку у VS Code.
4. У Terminal:

```bash
npm install
npm run dev
```

5. Відкрийте:

```text
http://localhost:3000
```

## Production build

```bash
npm run build
npm start
```
