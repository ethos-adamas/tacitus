# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root: it points to one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that affect the whole system.
- **`frontend/docs/adr/`** and **`backend/docs/adr/`**: read ADRs for the relevant context.

If any of these files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

```text
/
├── CONTEXT-MAP.md
├── docs/adr/              ← system-wide decisions
├── frontend/
│   ├── CONTEXT.md
│   └── docs/adr/          ← frontend decisions
└── backend/
    ├── CONTEXT.md
    └── docs/adr/          ← backend decisions
```

## Use the glossary's vocabulary

When output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept isn't in the glossary, reconsider whether it belongs to the project vocabulary or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly instead of silently overriding it.
