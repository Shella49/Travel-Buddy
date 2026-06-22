# ✈️ Travel Assistant AI

ИИ-ассистент для поиска авиабилетов, отелей и достопримечательностей. Использует реальные MCP-серверы (Kiwi, Trivago, Foursquare) и GPT-4o-mini для обработки запросов на естественном языке.

---

## Структура проекта

```
/
├── artifacts/
│   ├── travel-assistant/        ← ФРОНТЕНД (React + Vite)
│   │   └── src/
│   │       ├── App.tsx          — главный компонент, весь UI чата
│   │       ├── index.css        — глобальные стили + CSS-переменные темы
│   │       └── components/ui/   — UI-компоненты (shadcn/ui)
│   │
│   └── api-server/              ← БЭКЕНД (Express + OpenAI)
│       └── src/
│           ├── index.ts         — точка входа, запуск сервера
│           ├── app.ts           — Express приложение, middleware
│           ├── routes/
│           │   ├── chat.ts      — POST /api/chat, история сессии
│           │   └── health.ts    — GET /api/health
│           └── lib/
│               ├── agent.ts     — GPT-агент, системный промпт, tool-calling
│               ├── mcp.ts       — MCP-клиенты: Kiwi, Trivago, Foursquare
│               └── logger.ts    — pino логгер
│
├── lib/                         — общие пакеты воркспейса
├── pnpm-workspace.yaml          — конфигурация монорепо
└── package.json                 — корневые скрипты
```

---

## Архитектура

```
Браузер
  │  React UI (wouter, TanStack Query)
  │  POST /api/chat  ←→  GET /api/chat/history
  ▼
Express API (порт из $PORT)
  │
  ├── GPT-4o-mini (OpenAI SDK)
  │     └── tool_calling: search_flights / search_hotels / search_places / search_trip
  │
  ├── Kiwi MCP  (https://mcp.kiwi.com)          — авиабилеты
  ├── Trivago MCP  (https://mcp.trivago.com/mcp) — отели
  └── Foursquare MCP  (https://gateway.pipeworx.io/foursquare/mcp) — места
```

**Как работает один запрос:**
1. Пользователь пишет в чат → фронтенд отправляет `POST /api/chat { message, sessionId }`
2. Express передаёт сообщение в `runAgent()` с историей сессии
3. GPT выбирает нужный инструмент (`search_hotels` и т.д.) и формирует аргументы
4. MCP-клиент делает HTTP-запросы к Kiwi/Trivago/Foursquare, парсит ответ
5. Результат возвращается GPT → GPT форматирует красивый ответ на русском
6. Ответ + MCP-логи возвращаются на фронтенд, лог-панель обновляется в реальном времени

---

## Стек технологий

### Фронтенд (`artifacts/travel-assistant/`)

| Библиотека | Назначение |
|---|---|
| **React 19** | UI-фреймворк |
| **Vite 7** | сборщик, dev-сервер |
| **Tailwind CSS 4** | стилизация |
| **shadcn/ui** (Radix UI) | готовые UI-компоненты (кнопки, тосты и т.д.) |
| **TanStack Query v5** | запросы к API, кэширование (`useSendMessage`, `useGetChatHistory`) |
| **wouter** | клиентский роутинг |
| **react-markdown + remark-gfm** | рендер Markdown в ответах ИИ |
| **lucide-react** | иконки |

### Бэкенд (`artifacts/api-server/`)

| Библиотека | Назначение |
|---|---|
| **Express 5** | HTTP-сервер, роуты |
| **openai** (SDK) | общение с GPT-4o-mini, tool_calling |
| **pino + pino-http** | структурированное логирование |
| **esbuild** | сборка TypeScript → JavaScript |
| **cors, cookie-parser** | middleware |

---

## Переменные окружения

Создайте файл `.env` в корне проекта:

```env
# Обязательно
OPENAI_API_KEY=sk-...           # https://platform.openai.com/api-keys

# Обязательно для поиска мест
FOURSQUARE_API_KEY=...          # https://developer.foursquare.com

# Для локального запуска (см. ниже)
PORT=8080                       # порт бэкенда
VITE_PORT=5173                  # порт фронтенда
BASE_PATH=/                     # базовый путь Vite
```

---

## Запуск локально (Windows, VSCode)

> ⚠️ **Важно:** проект разработан в Linux-окружении Replit. Для запуска на Windows нужно выполнить несколько подготовительных шагов.

### Требования

- [Node.js 20+](https://nodejs.org/) (LTS)
- [pnpm 10+](https://pnpm.io/installation) — `npm install -g pnpm`
- Git

### Шаг 1 — Клонировать репозиторий

```bash
git clone https://github.com/ВАШ_ЛОГИН/ВАШ_РЕПО.git
cd ВАШ_РЕПО
```

### Шаг 2 — Исправить конфиг pnpm для Windows

Файл `pnpm-workspace.yaml` содержит строки, которые блокируют esbuild на Windows.
Откройте файл и **удалите или закомментируйте** эти строки в секции `overrides`:

```yaml
# Удалите или закомментируйте эти строки:
"esbuild>@esbuild/win32-arm64": "-"
"esbuild>@esbuild/win32-ia32": "-"
"esbuild>@esbuild/win32-x64": "-"
```

### Шаг 3 — Упростить Vite конфиг для локального запуска

Файл `artifacts/travel-assistant/vite.config.ts` требует переменные `PORT` и `BASE_PATH`.
Замените его содержимое на локальную версию:

```ts
// artifacts/travel-assistant/vite.config.ts  (локальная версия)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
```

> Прокси `/api` → `localhost:8080` позволяет фронтенду обращаться к бэкенду без CORS-проблем.

### Шаг 4 — Создать файл `.env`

В корне проекта:

```env
OPENAI_API_KEY=sk-...
FOURSQUARE_API_KEY=...
```

В папке `artifacts/api-server/` создайте `.env`:

```env
PORT=8080
OPENAI_API_KEY=sk-...
FOURSQUARE_API_KEY=...
```

### Шаг 5 — Установить зависимости

```bash
pnpm install
```

### Шаг 6 — Запустить бэкенд

Откройте первый терминал в VSCode (`Ctrl+~`):

```bash
cd artifacts/api-server
pnpm run dev
```

Бэкенд запустится на `http://localhost:8080`

### Шаг 7 — Запустить фронтенд

Откройте второй терминал:

```bash
cd artifacts/travel-assistant
pnpm run dev
```

Фронтенд запустится на `http://localhost:5173`

Откройте браузер: **http://localhost:5173**

---

## API бэкенда

| Метод | URL | Описание |
|---|---|---|
| `POST` | `/api/chat` | Отправить сообщение. Body: `{ message: string, sessionId?: string }` |
| `GET` | `/api/chat/history` | Получить историю. Query: `?sessionId=...` |
| `DELETE` | `/api/chat/history` | Очистить историю. Query: `?sessionId=...` |
| `GET` | `/api/health` | Проверка работоспособности сервера |

---

## Как добавить новый источник данных

1. Создайте новый MCP-клиент в `artifacts/api-server/src/lib/mcp.ts` по образцу `KiwiMcpClient`
2. Добавьте новый инструмент в массив `tools` в `agent.ts`
3. Обработайте вызов инструмента в цикле `for (const tc of msg.tool_calls)` в `runAgent()`
4. Добавьте описание формата ответа в системный промпт

---

## Возможные проблемы

| Проблема | Решение |
|---|---|
| `Cannot find package 'esbuild'` | Удалите win32-строки из `pnpm-workspace.yaml` (Шаг 2) |
| `PORT environment variable is required` | Задайте `PORT=8080` в `.env` бэкенда |
| `BASE_PATH environment variable is required` | Используйте упрощённый vite.config.ts (Шаг 3) |
| Ошибки CORS | Убедитесь что прокси настроен в vite.config (Шаг 3) |
| GPT не отвечает | Проверьте `OPENAI_API_KEY` в `.env` |
