# i18n Patterns

> Auto-load when editing any frontend file with user-visible strings (`.tsx`, `.ts` in `frontend/src/`).

The app is bilingual: **French (fr) and English (en)**. French is the default locale.

- All user-facing strings must use `react-i18next` — never hardcode text directly in JSX
- Use the `useTranslation` hook: `const { t } = useTranslation()`
- Translation keys live in `frontend/src/locales/fr.json` and `frontend/src/locales/en.json`
- When adding a new component or page, add all string keys to both locale files before opening the PR
- Key naming: flat dot-notation scoped by feature — e.g. `journal.addNote`, `journal.emptyTitle`, `auth.login`
- Never use inline fallback strings like `t('key') || 'fallback'` — if the key is missing, the translation file is broken; fix it
