# frontend-app-observer

Локальный **веб-интерфейс** к базе Observer: список проектов, снимки анализа (`snapshots`), диагностика пути к SQLite. Работает вместе с CLI **observer-agent** (в репозитории лежит каталог `observer-agent/`).

## Возможности

- Просмотр проектов и снимков из `metrics.db`
- Диагностика: путь к БД, `OBSERVER_DATA_DIR`, счётчики записей, ошибки чтения
- Удаление проекта из БД через UI (с подтверждением)
- Dev API на Vite: чтение и удаление через **sql.js** (без нативного `better-sqlite3` в Node dev)

## Требования

- **Node.js** 18+ (для dev и сборки; версию лучше совмещать с той, под которой собран/запускается `observer-agent`)

## Установка

```bash
npm install
```

## Запуск UI (разработка)

```bash
npm run dev
```

Откройте в браузере адрес из консоли (обычно `http://localhost:5173`). Данные подтягиваются с маршрутов `/api/health`, `/api/projects`, и т.д. (см. `vite-plugin-observer-api.ts`).

## Откуда берётся база

По умолчанию используется каталог данных Observer:

| Платформа | Путь по умолчанию |
|-----------|-------------------|
| Windows   | `%USERPROFILE%\.observer-agent\data\metrics.db` |
| macOS/Linux | `~/.observer-agent/data/metrics.db` |

Чтобы UI смотрел **в тот же каталог**, что и анализ в другом терминале, в **корне этого проекта** создайте `.env.local`:

```env
OBSERVER_DATA_DIR=C:\Users\<вы>\.observer-agent
```

(абсолютный путь или относительный к корню проекта — см. `vite.config.ts`). После изменения `.env.local` перезапустите `npm run dev`.

## Запись данных (анализ проектов)

Снимки в БД появляются после **`observer analyze`** по нужному репозиторию.

Из корня **frontend-app-observer** (если лежит вложенный `observer-agent`):

```bash
npm run observer
```

Анализируется текущая директория (`.`). Чтобы проанализировать другой проект:

```bash
node observer-agent/apps/cli/bin/run.mjs analyze "C:\путь\к\репозиторию"
```

Либо установите/свяжите глобально CLI из репозитория **observer-agent** и вызывайте `observer analyze …` оттуда — главное, чтобы **`OBSERVER_DATA_DIR`** у анализа и у Vite совпадали, если вы его задаёте.

## Скрипты npm

| Скрипт | Назначение |
|--------|------------|
| `npm run dev` | Vite dev-сервер + API к `metrics.db` |
| `npm run build` | Продакшен-сборка в `dist/` |
| `npm run preview` | Локальный просмотр сборки |
| `npm run check` | `svelte-check` + TypeScript |
| `npm run knip` | Поиск неиспользуемого кода (при настроенном Knip) |
| `npm run observer` | `analyze` для текущей папки через вложенный CLI |

## Структура `src/`

| Путь | Описание |
|------|----------|
| `App.svelte` | Состояние и сценарии (загрузка, выбор проекта, удаление) |
| `lib/types.ts` | Типы данных API |
| `lib/format.ts` | Форматирование (размеры, имя папки из пути) |
| `lib/api/observer-client.ts` | HTTP-клиент к dev API |
| `components/observer/` | UI: шапка, баннеры, список проектов, снимки, модалка удаления |
| `app.css` | Общие стили «оболочки» страницы |

Плагин Vite с маршрутами API: **`vite-plugin-observer-api.ts`** (корень репозитория).

## Если в UI пусто или 500 на `/api/projects`

- Убедитесь, что файл `metrics.db` существует по пути из блока «База найдена» / `GET /api/health`.
- Проверьте **одинаковый** `OBSERVER_DATA_DIR` у Vite (`.env.local`) и у терминала, где запускали `analyze`.
- На Windows при смене версии Node иногда помогает `npm install` в этом проекте (sql.js без пересборки нативных модулей).
