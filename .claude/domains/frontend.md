# Frontend

> Business context for the React SPA. Read before editing anything in `frontend/`. Cross-references: i18n patterns and component patterns live in `.claude/patterns/`.

Victor's first React project. Background: Express/Mongoose APIs in JS (2019–2021), no frontend, no TS, no CSS.
Comfortable with: ES6+ (arrow functions, destructuring, async/await, modules), yarn, Chrome DevTools.
New to: TypeScript, React, CSS/layout, frontend architecture.
Explain all of: TS syntax, React concepts, CSS/Tailwind patterns. Reintroduce ES6 concepts when relevant (don't assume instant recall after 5 years). Skip only basic JS and yarn.

## Didactic workflow

The goal is to ship good code AND build Victor's React mental model. Follow this pattern on every frontend task:

**Before writing code** — if a non-obvious React concept drives the implementation (context vs props, component boundaries, hook dependencies, derived state), explain it in 2–3 sentences *before* touching any file. Don't explain everything — only what's relevant to the decision being made.

**While writing code** — when a pattern is used for the first time or in a non-obvious way, add a one-line inline comment explaining *why*, not *what*. Examples:
- `// useCallback so this doesn't re-register the Escape listener on every render`
- `// eslint-disable-next-line — intentionally only re-run when panel opens, not on every sku change`

**After a non-trivial change** — if a React concept came up that Victor likely hasn't seen before (scope isolation between components, hook dependency rules, context vs prop drilling, optimistic updates, derived state), explain it in plain language after the code is done. Use the backend analogy if it helps (e.g. "context is like a request-scoped singleton — any component in the tree can read it without passing it down").

**What to explain vs skip:**
- Explain: hook rules, component scope isolation, state vs derived values, context mechanics, why `useCallback`/`useMemo` matter here
- Skip: JSX syntax, basic useState, things already explained in a prior session unless it comes up again in a confusing way
- If unsure: explain it — better to over-explain than leave Victor copying patterns he doesn't understand

Concepts to explain when they come up:

- TypeScript: generics, type vs interface, union types, type narrowing, `as const`
- React: component lifecycle, rendering model, virtual DOM
- React hooks: useState, useEffect, useContext, useCallback, useMemo — what they do and when to use each
- Props vs state vs context
- React Router patterns
- CSS: box model, flexbox, grid — via Tailwind utility classes
- shadcn/ui: how to add components, customize themes, compose them

## Stack & tooling

Stack: React 19 + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui

- Package manager: yarn (classic v1 — Victor used it in 2019-2021, stick with familiar)
- Node.js: v24.10.0 (local bare-metal dev, NOT Docker — hot reload matters)
- UI components: shadcn/ui (copy-paste, not a dependency — industry standard)
- Testing: Vitest + React Testing Library
- Linting: ESLint + Prettier
- Routing: React Router (when needed)
- State: start with React built-ins (useState, useContext) — no Redux/Zustand until proven necessary
- HTTP client: fetch API with a thin wrapper — no axios

## Frontend dev workflow

- Develop bare-metal (`yarn dev` on Mac), NOT in Docker — fast hot reload
- Docker only for CI and prod builds
- Desktop-first layout (1200px+), dark mode default — no responsive breakpoints yet
- VSCode with TS/React extensions
- **Visual review:** Claude cannot take screenshots. When working on UI together, always ask Victor to open the page in a browser (`open <file>` or `yarn dev`) and paste a screenshot into the chat. Reading HTML/CSS is not a substitute — rendered output is the ground truth for visual feedback.

## Design direction

- Premium, warm, approachable — upscale wine bar mood, not terminal/developer aesthetic
- Typography: Outfit Variable for all body/heading text, JetBrains Mono only for data values (prices, SKUs, timestamps, counts)
- Rounded corners (--radius: 0.625rem / 10px), subtle warm borders
- Generous whitespace, no clutter
- Color palette: golden amber (#c89248) on warm near-black (#08080c) — warm-tinted borders (rgba(255,255,255,0.06)), accent glow on hover
- Sidebar: slightly darker bg than main, "C" brand mark with amber gradient, Phosphor icons on nav items, active indicator bar
- Wine cards: warm gradient overlay, tags as pills, price in mono, inline actions (Watch, Cellar, Journal)
- shadcn/ui + Tailwind CSS (Phosphor icons, Outfit + JetBrains Mono fonts)

## Design reference — `ui/`

`ui/` contains standalone HTML mockups organized by feature (chat/, search/, watches/, stores/, journal/, cellar/, etc.). Screenshots in `ui/screenshots/`. These serve the same role as Figma files — **visual direction, not implementation specs.**

- **Do:** Match the feel, layout intent, color usage, and information hierarchy
- **Don't:** Pixel-match the mockups or replicate their CSS patterns — they use inline styles and flat HTML, the React app uses component composition, theme tokens, and Tailwind utilities
- When a mockup shows a pattern that exists in a shared component (WineCard, availability dots, tag pills), reuse the component — don't duplicate the HTML
- When a mockup adds complexity that doesn't justify a new component (one-off layout, decorative detail), skip it
- Good frontend engineering (reusable components, theme tokens, semantic HTML, accessibility) always wins over visual fidelity to the mockup

## UX reference apps

- Perplexity — chat as primary surface, structured data inline in conversation, secondary nav for everything else
- Linear — dense scannable lists, optimistic mutations, sidebar nav (model for watches/stores views)
- ChatGPT desktop — conversation history sidebar, token-by-token streaming; avoid its empty home screen filler

## UX principles

UX matters as much as code quality. Don't just make it work — make it feel right. The app is friendly and approachable (it's a sommelier helping you discover wine), but the UI is sharp and efficient. Think warm personality, cold interface.

- **Chat is home** — the sommelier conversation is the default landing after login. Watches, stores, and settings are secondary surfaces in a sidebar.
- **Structured data in chat** — when the sommelier references a wine, it renders as an interactive element in the conversation, not a link to another page.
- **Sidebar, not top-nav** — persistent collapsible sidebar: new chat, history, watches, saved stores. Always accessible, never behind a hamburger on desktop.
- **Stream, don't spin** — AI responses render token-by-token. List data uses skeleton rows on first load. Mutations (save store, add watch) are optimistic. Spinners only for unpredictable waits (geolocation).
- **One-line-scannable lists** — list items: max 2 lines. Line 1: name (bold mono). Line 2: 2-3 secondary attributes (muted). Actions right-aligned. No third line.
- **Empty states are onboarding** — tell the user what to do next: "Ask the sommelier for a recommendation." Never sad illustrations or generic "nothing here" messages.
- **Errors are inline and recoverable** — errors appear next to what failed, with a retry action. Friendly but direct: "Couldn't load stores — retry" not "Oops, something went wrong!"
- **No confirmation for reversible actions** — removing a watch or unsaving a store happens instantly (optimistic). Only confirm destructive, irreversible actions.
- **New page only for new context** — adding a watch, saving a store, viewing a wine card: inline or panel. A new route only for full context switches (chat → store finder).

## UX anti-patterns (don't do these)

- No modals/dialogs for simple actions — use inline UI
- No wizard flows or multi-step forms
- No tooltip tours or onboarding overlays
- No toast notifications — feedback is inline, next to the action
- No animations or transitions unless explicitly requested
- No dropdown menus for 2-3 actions — show them directly
- No tabs when a single scrollable view works
- No pagination when the list is under ~50 items — just render them all
- No icons without labels — text is clearer than mystery icons
- No separate "detail page" for items that fit in a card or expandable row

## Microcopy

- Tone: friendly, direct, concise — like a knowledgeable friend, not a corporate app
- Labels: short and specific ("My Watches", "Edit", "Remove") — no verbose explanations
- Button text: verb-first ("Save store", "Remove") — never "Click here to..."
- Loading: "Loading..." text is fine, keep it simple
- Errors: state what failed + offer a fix ("Couldn't reach the server — retry")
