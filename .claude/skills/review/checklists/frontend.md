# Frontend checklist

Applies when the diff touches `frontend/src/`. Conventions — see `rules/frontend.md`.

- **FE-1** Every user-facing string goes through `t('key')`; no hardcoded JSX text, no `t('key') || 'fallback'`.
- **FE-2** Every new key exists in both `frontend/src/locales/fr.json` and `en.json`.
- **FE-3** No `as any` in new `.ts`/`.tsx`.
- **FE-4** A new component has a co-located `Component.test.tsx`.
- **FE-5** A UI acceptance criterion has a browser screenshot in the evidence table.
- **FE-6** No UX anti-pattern from `rules/frontend.md` (modal for a simple action, toast, tabs where a scroll works, confirmation for a reversible action…).
- **FE-7** API types match the backend `*Out` schemas.
