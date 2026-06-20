# Travel Assistant AI

AI-агент для поиска авиабилетов, отелей и достопримечательностей через MCP-серверы Kiwi, Trivago и Foursquare.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/travel-assistant run dev` — run the frontend (port 20951)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5
- DB: None (in-memory session store)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- AI: OpenAI GPT-4o-mini (via `openai` SDK)
- MCP: Kiwi (flights), Trivago (hotels), Foursquare (places)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas for backend
- `artifacts/travel-assistant/src/App.tsx` — main frontend app (two-panel layout)
- `artifacts/api-server/src/lib/agent.ts` — AI agent with OpenAI tool-calling loop
- `artifacts/api-server/src/lib/mcp.ts` — MCP clients (Kiwi, Trivago, Foursquare)
- `artifacts/api-server/src/routes/chat.ts` — chat API routes
- `artifacts/api-server/src/routes/index.ts` — route registry

## Architecture decisions

- AI agent uses OpenAI function-calling (tools) loop — GPT decides which MCP to call
- All MCP calls are proxied through the backend — API keys never exposed to frontend
- In-memory session store keyed by sessionId (no DB required)
- MCP logs captured per-request and returned alongside AI response for live display
- Russian city names auto-translated to English before Trivago/Foursquare calls

## Product

- Left panel: conversational AI chat in Russian with suggested prompts
- Right panel: live MCP activity log showing every tool call and response
- Supports: flight search (Kiwi), hotel search (Trivago), attractions (Foursquare), combined trip planning

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Kiwi MCP requires dates in dd/mm/yyyy format
- Trivago MCP requires English city names — translation happens in `agent.ts`
- Foursquare API key is passed inside `arguments._apiKey` (not as a header)
- Russian city names with hyphens (нью-йорк) must be quoted as JS object keys

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
