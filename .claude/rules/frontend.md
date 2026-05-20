---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.ts"
  - "frontend/src/locales/**"
---

# Frontend

> Single source of truth for React 19 + Vite + Tailwind + shadcn — UX bible, didactic workflow, component conventions, i18n. Read whenever editing anything in `frontend/src/`.

## Developer context

Victor's first React project. Background: Express/Mongoose APIs in JS (2019–2021), no frontend, no TS, no CSS. Comfortable with: ES6+, yarn, Chrome DevTools. New to: TypeScript, React, CSS/layout, frontend architecture.

Explain all of: TS syntax, React concepts, CSS/Tailwind patterns. Reintroduce ES6 concepts when relevant. Skip only basic JS and yarn.

## Didactic workflow

Goal: ship good code AND build Victor's React mental model.

- **Before writing code** — if a non-obvious React concept drives the implementation (context vs props, component boundaries, hook dependencies, derived state), explain in 2-3 sentences first.
- **While writing code** — when a pattern is used for the first time or non-obviously, add a one-line `// why` comment. Examples:
  - `// useCallback so this doesn't re-register the Escape listener on every render`
  - `// eslint-disable-next-line — intentionally only re-run when panel opens`
- **After a non-trivial change** — if a React concept came up Victor likely hasn't seen, explain in plain language. Use backend analogies when helpful.

Explain: hook rules, scope isolation, state vs derived values, context mechanics, useCallback/useMemo rationale, TS generics/unions/narrowing, React lifecycle, virtual DOM, React Router, CSS box model/flexbox/grid, shadcn composition.
Skip: JSX syntax, basic useState, things already explained.

## Stack & tooling

- React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui
- yarn classic v1
- Node v24.10.0 (local bare-metal, NOT Docker — hot reload matters)
- Vitest + React Testing Library
- ESLint + Prettier
- React Router (when needed)
- State: React built-ins (useState, useContext) — no Redux/Zustand until proven necessary
- HTTP: fetch with thin wrapper — no axios

## Component conventions

- Functional only (no class components)
- TS strict mode. No `as any` casts.
- Co-locate tests: `Component.tsx` + `Component.test.tsx`
- API types match backend Pydantic `*Out` schemas
- shadcn primitives as building blocks — customize via Tailwind tokens, don't fight defaults

## i18n (bilingual fr/en, fr default)

- ALL user-facing strings via `t('key')` from `react-i18next`. Never hardcode JSX text.
- Use `const { t } = useTranslation()` hook
- Keys in BOTH `frontend/src/locales/fr.json` AND `en.json` before opening the PR
- Key naming: flat dot-notation scoped by feature — `journal.addNote`, `auth.login`
- Never `t('key') || 'fallback'` — fix the missing translation file instead

## Dev workflow

- `yarn dev` on Mac, NOT in Docker (hot reload)
- Docker only for CI and prod builds
- Desktop-first 1200px+, dark mode default
- **Visual review:** Claude cannot take screenshots. Always ask Victor to open the page (`yarn dev`) and paste a screenshot. Reading HTML/CSS is not a substitute.

## Design direction

- Premium, warm, approachable — upscale wine bar mood, not terminal aesthetic
- Typography: Outfit Variable for body/heading; JetBrains Mono ONLY for data (prices, SKUs, timestamps, counts)
- Rounded corners (--radius: 0.625rem / 10px), subtle warm borders
- Generous whitespace, no clutter
- Palette: golden amber (#c89248) on warm near-black (#08080c); warm-tinted borders (rgba(255,255,255,0.06)); accent glow on hover
- Sidebar: slightly darker than main, "C" brand mark with amber gradient, Phosphor icons, active indicator bar
- Wine cards: warm gradient overlay, tags as pills, price in mono, inline actions

## Mockups (`ui/`)

Standalone HTML mockups organized by feature. Visual direction, NOT implementation specs.
- **Do:** match feel, layout intent, color usage, information hierarchy
- **Don't:** pixel-match or replicate inline-style CSS — React app uses components, theme tokens, Tailwind utilities
- Reuse shared components (WineCard, availability dots, tag pills); don't duplicate HTML
- Skip mockup complexity that doesn't justify a new component
- Good engineering > visual fidelity

## UX reference apps

- Perplexity — chat as primary surface, structured data inline in conversation
- Linear — dense scannable lists, optimistic mutations, sidebar nav
- ChatGPT desktop — conversation history sidebar, token-by-token streaming; avoid its empty home screen filler

## UX principles

- **Chat is home** — sommelier conversation is default landing. Watches/stores/settings are secondary surfaces in sidebar.
- **Structured data in chat** — wine references render as interactive elements in conversation, not links to other pages.
- **Sidebar, not top-nav** — persistent collapsible: new chat, history, watches, saved stores. Always accessible.
- **Stream, don't spin** — AI responses render token-by-token. List data uses skeleton rows. Mutations are optimistic.
- **One-line-scannable lists** — max 2 lines per item: name (bold mono) on line 1, 2-3 muted attributes on line 2, right-aligned actions.
- **Empty states are onboarding** — "Ask the sommelier for a recommendation." Never sad illustrations.
- **Errors inline and recoverable** — "Couldn't load stores — retry" not "Oops, something went wrong!"
- **No confirmation for reversible actions** — optimistic removal. Confirm only destructive irreversibles.
- **New page only for new context** — inline or panel for adding watches, saving stores, viewing wine cards. New route only for full context switches.

## UX anti-patterns (don't do)

- No modals/dialogs for simple actions
- No wizards / multi-step forms
- No tooltip tours or onboarding overlays
- No toast notifications — feedback inline next to action
- No animations unless explicitly requested
- No dropdown menus for 2-3 actions
- No tabs when a scrollable view works
- No pagination under ~50 items
- No icons without labels
- No separate detail page for items that fit in a card

## Microcopy

- Tone: friendly, direct, concise — knowledgeable friend, not corporate app
- Labels: short and specific ("My Watches", "Edit", "Remove")
- Buttons: verb-first ("Save store", "Remove") — never "Click here to..."
- Loading: "Loading..." is fine
- Errors: state what failed + offer fix
