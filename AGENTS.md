## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five-label triage vocabulary is used. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context layout. See `docs/agents/domain.md`.

### Frontend code

- Declare application functions and React components as `const name = () => {}`.
- React Error Boundaries are the sole exception: React requires them to be class components.
- JSX event properties reference named handlers; do not place handler bodies inline.
- Keep HTML in `frontend/src/ui/` components.
- Put tests in the owning module's `__test__/` directory and structure them as Given, When, Then.
- Do not create generic `utils`, `common`, or `constants` modules. Keep each fact with its owning domain or adapter.
- Validate untrusted input once at its adapter seam. Internal modules rely on typed invariants instead of silent fallbacks.
- Keep serializable application state in Redux. Keep keys, sockets, timers, listeners and cryptographic sessions outside Redux.
