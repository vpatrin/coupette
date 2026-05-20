# Frontend Component Patterns

> Auto-load when editing any `.tsx` / `.ts` file in `frontend/src/`. For UX bible see [`domains/frontend.md`](../domains/frontend.md). For i18n see [`i18n-patterns.md`](./i18n-patterns.md).

## Patterns to follow

- Functional components only (no class components)
- TypeScript strict mode
- Co-locate tests next to source files (`Component.tsx` + `Component.test.tsx`)
- Keep components small and focused (same philosophy as Python functions)
- API types should match backend Pydantic schemas (`*Out` → TypeScript interfaces — see [`pydantic-patterns.md`](./pydantic-patterns.md))
- Use shadcn/ui components as building blocks — customize via Tailwind, don't fight the defaults

## Stack constraints

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui

- State: React built-ins (`useState`, `useContext`) — no Redux/Zustand until proven necessary
- HTTP: fetch API with thin wrapper — no axios
- Routing: React Router (when needed)
- Testing: Vitest + React Testing Library
