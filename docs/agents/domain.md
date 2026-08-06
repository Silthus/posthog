# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**: a root `CONTEXT-MAP.md` points at one `CONTEXT.md` per context, because the monorepo holds many independently owned products under `products/*` plus shared packages under `packages/*` and `services/*`.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context. Read each one relevant to the topic, not all of them.
- **`docs/adr/`** — system-wide decisions. Read the ADRs that touch the area you're about to work in.
- **`products/<product>/docs/adr/`** — decisions scoped to a single product. Check these too whenever you work inside a product.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## These are not the same as AGENTS.md

The repo already carries `AGENTS.md` files at the root and in several subtrees. Those state **rules** — what to do and what not to do. `CONTEXT.md` and ADRs state **domain language and decisions** — what the words mean and why a design is the way it is. They complement each other; neither replaces the other, and a rule does not belong in a `CONTEXT.md`.

## File structure

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
│   ├── 0001-....md
│   └── 0002-....md
└── products/
    ├── <product-a>/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← product-specific decisions
    └── <product-b>/
        ├── CONTEXT.md
        └── docs/adr/
```

Contexts are not limited to `products/*`. A shared package (`packages/quill`), a service (`services/mcp`), or a cross-cutting subsystem can be a context too when it has its own vocabulary. Add it to `CONTEXT-MAP.md` the same way.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in that context's `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Watch for terms that mean different things in different contexts. That is normal in a multi-context repo, and the right fix is to name the context, not to force one definition across both.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
