---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.ts"
---

# Frontend (auto-loaded)

Full context: [`domains/frontend.md`](../domains/frontend.md), [`patterns/frontend-component-patterns.md`](../patterns/frontend-component-patterns.md), [`patterns/i18n-patterns.md`](../patterns/i18n-patterns.md).

## Critical reminders

- **i18n:** every user-facing string via `t('key')`. New key MUST land in BOTH `frontend/src/locales/fr.json` AND `en.json`. Never `t('key') || 'fallback'`.
- **Components:** functional only, TS strict, co-locate tests (`Component.tsx` + `Component.test.tsx`). No `as any`.
- **shadcn:** compose primitives, customize via Tailwind tokens. Don't fight defaults.
- **Typography:** Outfit for body, JetBrains Mono ONLY for data (prices, SKUs, timestamps, counts).
- **UX:** sidebar nav (no top-nav), no modals for simple actions, no toasts, optimistic updates for reversible actions. Stream don't spin.
- **Microcopy:** verb-first labels ("Save store", not "Click to save"). Inline errors with retry, never generic "Oops".

## Didactic mode

This is Victor's first React project. When introducing a non-obvious React/TS concept (context vs props, hook deps, derived state, scope isolation), explain in 2-3 sentences first. Use backend analogies when helpful.
