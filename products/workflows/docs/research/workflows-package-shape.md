# The npm package for workflows as code: structure, build, publishing, and install

Research note for [ticket 70](https://github.com/Silthus/posthog/issues/70), a child of [map 68](https://github.com/Silthus/posthog/issues/68).
Nothing is built here. This note finds facts and lists options. It makes no decision.

- Question: how does the npm package get built, published, and pulled into a customer's project, new or existing?
- Repository source: this repository at `f637db96f1fc853ea6a83694f02b94ab690bdcaf` (`origin/master`, committed 2026-09-17). Every repository claim cites a file and a line.
- External source: every external claim carries a URL. All external pages were read on 2026-09-21.
- Location: `products/workflows/docs/research/` already holds one note, `read-only-code-managed-workflows.md`. This note joins it.

## Summary

Nine findings decide the shape of the package.

1. **The repo has no publishable-CLI precedent.** Three `package.json` files declare a `bin`. All three are `private` or sit in a workspace the root install excludes. No package in this tree publishes a `bin` to npm today (section 1.4).
2. **`products/<product>/packages/<lib>/` is the sanctioned home for a product-owned library or CLI.** `docs/internal/monorepo-layout.md:75` names it. Top-level `packages/` is reserved for genuinely shared code (`monorepo-layout.md:88-89`).
3. **`pnpm-workspace.yaml` does not reach a nested product package.** `products/*` matches one level only (`pnpm-workspace.yaml:18`). A new nested path has to be added by hand, and the layout doc says so (`monorepo-layout.md:92`).
4. **`product:lint` would not object to a publishable package under `products/workflows/`.** No check reads a nested `package.json`, and no check forbids an extra top-level directory in a product (section 1.5).
5. **The repo has three OIDC trusted-publishing precedents, not two.** `publish-quill-npm.yml`, `build-hogql-parser-npm.yml`, and the `publish-npm` job in `release-cli.yml` all publish to npm with `id-token: write`, `NODE_AUTH_TOKEN: ''`, and `NPM_CONFIG_PROVENANCE: true`. `publish-hogli.yml` is the same pattern against PyPI (section 2).
6. **`@posthog/cli` on npm is already a wrapper for the Rust CLI.** cargo-dist builds it from `cli/`, and `release-cli.yml` publishes it. It is not source in this tree (section 3.4).
7. **`@posthog/wizard` depends on `jiti`.** The customer-facing bootstrap precedent already ships a runtime TypeScript loader (section 3.3).
8. **Node strips types by default from v22.18.0 and v23.6.0, and no CI runner ships bun.** The `ubuntu-24.04` runner image has Node 22.23.2 on the PATH and 24.20.0 cached. Requiring bun would mean an extra CI step for every customer (section 3.5).
9. **Convex commits its generated directory and says so in one sentence.** "this code should be committed to the repo (your code won't typecheck without it!)". Prisma v7 makes the output path required and suggests a `postinstall` hook. The two named models disagree (section 4).

## 1. Repository structure

### 1.1 `packages/quill`: vite plus vite-plugin-dts

`packages/quill` is a workspace of six sub-packages under `packages/quill/packages/*`. Three publish and three do not.

| Package                     | Build script                                                                                        | Published                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `@posthog/quill-primitives` | `packages/quill/packages/primitives/package.json:33` `"build": "vite build"`                        | no, `"private": true` (`:4`)                     |
| `@posthog/quill-components` | `packages/quill/packages/components/package.json:36`                                                | no, `"private": true` (`:4`)                     |
| `@posthog/quill-blocks`     | `packages/quill/packages/blocks/package.json:30`                                                    | no, `"private": true` (`:4`)                     |
| `@posthog/quill-charts`     | `packages/quill/packages/charts/package.json:32`                                                    | yes, `publishConfig.access: "public"` (`:28-30`) |
| `@posthog/quill-tokens`     | `packages/quill/packages/tokens/package.json:36` `"build": "tsx src/build.ts && vite build"`        | yes (`:32-34`)                                   |
| `@posthog/quill`            | `packages/quill/packages/quill/package.json:42` `"build": "tsx scripts/build-css.ts && vite build"` | yes (`:38-40`)                                   |

The root aggregates the builds: `packages/quill/package.json:9` runs `pnpm -r --filter '@posthog/quill-*' --filter '@posthog/quill' build`.

Type emission does not come from `tsc`. Every sub-package calls `vite-plugin-dts` with a dedicated build config, for example `packages/quill/packages/primitives/vite.config.ts:11-14` (`tsconfigPath: resolve(__dirname, 'tsconfig.build.json')`). That build config sets both `"noEmit": true` and `"declaration": true` (`packages/quill/packages/primitives/tsconfig.build.json:6,11`), so the plugin owns the `.d.ts` output.

The aggregate package solves the private-dependency problem by bundling the types. `packages/quill/packages/quill/vite.config.ts:38-39` sets `rollupTypes: true` and `bundledPackages: ['@posthog/quill-primitives', '@posthog/quill-components', '@posthog/quill-blocks']`. A consumer therefore never resolves a package that was never published.

The `exports` map is the same four-condition shape everywhere, for example `packages/quill/packages/primitives/package.json:22-28`: `types`, `import`, `require`, `default`, pointing at `dist/index.d.ts`, `dist/index.js`, `dist/index.cjs`, `dist/index.js`. `main`, `module`, and `types` are also set at the top level (`:19-21`). `files` is `["dist"]` (`:12-14`), except `tokens`, which ships `["src", "dist"]` (`packages/quill/packages/tokens/package.json:10-13`).

React is a peer dependency, not a dependency: `^18.3.1 || ^19.0.0` (`packages/quill/packages/primitives/package.json:54-57`). Real runtime dependencies are declared as `dependencies` when the vite build keeps them external, and the reason is recorded in the config (`packages/quill/packages/charts/vite.config.ts:6-13`).

Tests have no per-package runner. There is no `vitest.config` or `jest.config` under `packages/quill/packages/*`. The `*.test.ts` files sit next to the source and the root Jest config reaches them: `frontend/jest.config.ts:90-91` adds `packages/quill/packages/charts/src` and `.../components/src` to `roots`, and `frontend/package.json:39` runs `jest --testPathPattern='(frontend/|products/|common/|packages/quill/|packages/llm-normalizer/)'`.

No `package.json` under `packages/quill` declares a `bin`.

### 1.2 `packages/llm-normalizer`: no build at all

The whole manifest is 13 lines. It is `"private": true` (`packages/llm-normalizer/package.json:4`) and its `main` and `exports` point at raw TypeScript: `"main": "src/index.ts"` (`:5`) and `"." : "./src/index.ts"` (`:7`).

- There is no `scripts` block, so there is no build.
- `packages/llm-normalizer/tsconfig.json:9` sets `"noEmit": true`. No declaration file is produced. Consumers type against the source.
- The only dependency is `yaml: catalog:` (`:10-11`).
- Tests are co-located (`packages/llm-normalizer/src/validateRecipe.test.ts`) and run through the root Jest config, which maps the package name straight to source (`frontend/jest.config.ts:223-224`).
- Consumers use `workspace:*`: `frontend/package.json:84` and `services/mcp/package.json:53`.

This is the cheap shape, and it works only because every consumer is inside this repo and runs the code through a bundler. It cannot be published as it stands.

### 1.3 What `pnpm-workspace.yaml` needs

The `packages:` list is explicit, 30 entries, `pnpm-workspace.yaml:1-31`. The relevant lines:

```yaml
10      - packages/llm-normalizer
11      - packages/quill
12      - packages/quill/apps/*
13      - packages/quill/packages/*
18      - products/*
20      - '!products/desktop'
```

Two facts follow.

- `packages/quill` needed three entries, one for the root and two for the nested globs (`:11-13`). A nested layout is not free.
- `products/*` (`:18`) matches direct children only. `products/workflows/packages/foo` is not a workspace member today. `docs/internal/monorepo-layout.md:92` states the rule: "pnpm-workspace.yaml globs are explicit (products/\*, packages/quill, …) and don't yet match nested products/<product>/packages/\* or a new top-level packages/<name>/ — so register the package's path there when you add it, or workspace:\* deps, filters, and scripts won't resolve."

The evidence for that caveat is in the tree. Neither `products/canvas/packages/canvas_builder` nor `products/visual_review/cli` appears anywhere in `pnpm-workspace.yaml`, and both exist on disk.

The file also carries `overrides` that pin `typescript: 6.0.3` (`pnpm-workspace.yaml:52`), a `catalog:` block (`:136-185`), and a `minimumReleaseAge` block whose exclude list already names `@posthog/*` because those are "released by our own workflows" (`:187-189`).

### 1.4 Every `bin` in the repo

A grep for `"bin"` across every non-`node_modules` `package.json` returns exactly three hits.

| Path                                                   | `bin`                                                | Name                                | State                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `products/visual_review/cli/package.json:5`            | `{ "vr": "./dist/cli/src/index.js" }`                | `@posthog/visual-review-cli` (`:2`) | `"private": true` (`:4`), built with `tsc` (`:10`), tested with `vitest run` (`:12`) |
| `products/desktop/packages/agent/package.json:140-142` | `{ "agent-server": "./dist/server/bin.js" }`         | `@posthog/agent` (`:2`)             | built with `tsup` (`:155`), inside the excluded desktop workspace                    |
| `products/desktop/packages/harness/package.json:6-9`   | `{ "harness": "dist/cli.js", "hog": "dist/cli.js" }` | `@posthog/harness` (`:2`)           | built with `tsup` (`:85`), inside the excluded desktop workspace                     |

`products/visual_review/cli` is the closest structural precedent: a product-owned directory with a `bin`, a `tsc` build, and its own tests. It is not published.

There is no `@posthog/wizard`, `@posthog/cli`, `posthog-cli`, or hogli npm package in this tree. `products/wizard/package.json:2` is `@posthog/products-wizard`, the in-app product UI, and has no `bin`.

### 1.5 Whether the package can live under `products/workflows/`

The layout doc says yes, in two places.

- `docs/internal/monorepo-layout.md:75` and `:120` both list `products/<product>/packages/<lib>/ — a library or CLI the product owns`.
- `docs/internal/monorepo-layout.md:88-89` gives the decision rule: "Owned by one product → products/<product>/packages/<name>/ (the default…)", "Genuinely shared across more than one product/service → top-level packages/<name>/".
- `products/README.md:54` lists `packages/` in the product folder structure as "optional: a library/CLI this product owns".

`products/workflows/` exists and is a full product, with `backend/`, `frontend/`, `mcp/`, `skills/`, `manifest.tsx`, `product.yaml`, and a root `package.json` named `@posthog/products-workflows` that has no `bin` and only a `backend:test` script.

### 1.6 What `product:lint` would say

The implementation is `tools/hogli-commands/hogli_commands/product/checks.py`, with the check list at `checks.py:1267`. The checks that could plausibly fire, and what they actually do:

- `PackageJsonScriptsCheck` (`checks.py:502`) validates the presence and content of `backend:test` and `backend:contract-check` on the **product root** `package.json`. It does not read the `name` field, does not forbid a `bin`, and does not restrict the script list. The rules it enforces are quoted in `products/README.md:157-163`.
- `MisplacedFilesCheck` (`checks.py:613`) carries an explicit comment that only root-level files are checked and "Directory names are deliberately not…" (`:617-623`). Nothing forbids a new `packages/` directory inside a product.
- `TachCheck` (`checks.py:686`) and `IsolationChainCheck` (`checks.py:724`) enforce cross-product import boundaries through `tach.toml`. Both are Python-only. A TypeScript package is outside their scope.
- `ImportSurfaceCheck` (`checks.py:442`), `BackendPackageMarkerCheck` (`:327`), `FacadeShapeCheck` (`:1014`), `FileFolderConflictsCheck` (`:647`): all scoped to the Python `backend/` tree.

No check reads a nested `package.json`. The `@posthog/products-<name>` naming convention in `products/README.md:191` is documentation, not lint.

So `product:lint` is silent on a publishable package under `products/workflows/`. The two mechanical tasks are the `pnpm-workspace.yaml` entry (`monorepo-layout.md:92`) and, if a CI workflow is added, `hogli lint:workflows`.

## 2. Publishing

### 2.1 `publish-quill-npm.yml`

- Trigger: `workflow_dispatch` only, with one required `tag` input, `alpha` or `latest`, default `alpha` (`.github/workflows/publish-quill-npm.yml:4-13`). No tag push, no release event.
- Environment and runner: `environment: Release`, `runs-on: ubuntu-24.04`, `timeout-minutes: 15` (`:34-36`).
- Permissions: top-level `contents: read` (`:15-16`), job-level adds `id-token: write` (`:37-39`). OIDC trusted publishing.
- Concurrency: `group: ${{ github.workflow }}`, `cancel-in-progress: false`, and the file records that this matters because of a version-bump race (`:18-24`).
- Version source: not `package.json`, not the tag. The workflow queries npm with `npm view <pkg> versions --json`, takes the semver max across all dist-tags, then bumps `patch` for `latest` or `prerelease` otherwise (`:58-112`, bump logic at `:74-103`). The repo `package.json` version is only the seed for a package that has never been published.
- Build: `pnpm install --frozen-lockfile` with three filters (`:114-115`), then `pnpm quill:build` (`:117-118`).
- Publish: `pnpm pack` first, then `npm publish "$TARBALL" --tag "$NPM_TAG" --access public`, three sequential steps, not a matrix (`:134-178`). Packing first is what resolves the `workspace:` and `catalog:` specifiers.
- Auth: `NODE_AUTH_TOKEN: ''` is set deliberately and `NPM_CONFIG_PROVENANCE: true` is set per publish step (`:142-152`). No `NPM_TOKEN` secret.
- Toolchain: `pnpm/action-setup@v6.0.8` (`:44`), Node from `.nvmrc` through `actions/setup-node@v6.2.0` (`:50-53`), then `npm install -g npm@11.6.4` because the bundled npm is too old for OIDC (`:55-56`).

### 2.2 `publish-hogli.yml`

This is the same pattern against a different registry.

- Trigger: `push` on tags matching `hogli-v*`, plus `workflow_dispatch` for re-runs, with the job guarded by `if: startsWith(github.ref, 'refs/tags/hogli-v')` so a dispatch from a branch is a no-op (`.github/workflows/publish-hogli.yml:3-23`).
- Registry: PyPI, through `uv publish dist/*.whl dist/*.tar.gz` (`:85-86`), with OIDC. Job permissions are `id-token: write` and `attestations: write` (`:27-30`), and a separate step runs `actions/attest-build-provenance` (`:78-83`).
- Version source: read from `tools/hogli/pyproject.toml` and checked against the tag. The job fails when they disagree (`:42-52`).
- Build and verify: `uv build tools/hogli --out-dir dist` (`:62-63`), `uvx twine check` (`:65-66`), then install the built wheel into a scratch venv as a smoke test (`:68-76`).
- Environment: `pypi-hogli` (`:26`), `runs-on: ubuntu-22.04`, `timeout-minutes: 10` (`:24-25`).
- It also cuts a GitHub Release with the artifacts and changelog-derived notes (`:88-95`).

### 2.3 Two more npm publishers the map notes do not name

**`build-hogql-parser-npm.yml`** publishes `common/hogql_parser` to npm on `pull_request` when that path changes (`:3-6`), with `id-token: write` at job level (`:112-114`), `registry-url: https://registry.npmjs.org` (`:128`), and `npm publish --access public` (`:131`). It then opens a PR that bumps `frontend/package.json` to the new version (`:174-201`).

**`release-cli.yml`** has a `publish-npm` job (`:1036-1075`) that is the closest precedent of all, because the thing it publishes is a CLI. It:

- runs on `ubuntu-22.04` with `timeout-minutes: 10` (`:1041-1042`);
- sets `permissions: id-token: write` (`:1047-1048`);
- checks out with `sparse-checkout: .nvmrc` and cone mode off (`:1053-1055`), so the job clones almost nothing;
- downloads the artifacts cargo-dist built, then runs `setup-node` with `node-version-file: .nvmrc` and `registry-url: 'https://registry.npmjs.org'` (`:1062-1064`);
- upgrades npm with `npm install -g npm@11.6.4` under the step name "Ensure modern npm (OIDC support)" (`:1065-1066`);
- iterates the release plan JSON, selects every artifact ending `-npm-package.tar.gz`, and runs `npm publish --access public "./npm/${pkg}"` with `NPM_CONFIG_PROVENANCE: true` and `NODE_AUTH_TOKEN: ''` (`:1067-1075`).

The release train around it is Sampo changesets, not changesets.js. `cli/RELEASING.md:3-4` says releases "are prepared with [Sampo](https://github.com/bruits/sampo) changesets and published by the `Release CLI` workflow's [`cargo-dist`](https://github.com/axodotdev/cargo-dist) jobs", and `cli/RELEASING.md:24` says the workflow "publishes the npm package". `cli/RELEASING.md:26` adds "Do not run `sampo publish`; cargo-dist owns publishing for `posthog-cli`."

There is no `.changeset/` directory and no `@changesets/cli` dependency anywhere in the repo. The only changeset mechanism is Sampo, scoped to `cli/.sampo/changesets/*.md` (`.github/workflows/release-cli.yml:6`, `:12`).

`publish-replay-anonymizer-crate.yml` and `publish-symbol-data-crate.yml` publish to crates.io, not npm.

### 2.4 What a third package copies, and what it needs that none of them have

Copyable from `publish-quill-npm.yml` without change: the `id-token: write` plus `NODE_AUTH_TOKEN: ''` plus `NPM_CONFIG_PROVENANCE: true` triple, the `npm install -g npm@11.6.4` step, `node-version-file: .nvmrc`, `environment: Release`, the `pnpm pack` then `npm publish <tarball>` order, and the `concurrency` block.

npm's own requirements match what the workflows do: trusted publishing "requires npm CLI version 11.5.1 or later and Node version 22.14.0 or higher", the workflow "must include `id-token: write`", npm "automatically generates provenance attestations" so `--provenance` is not needed, and no npm token is required for the publish itself (https://docs.npmjs.com/trusted-publishers, read 2026-09-21). The same page says the trusted publisher is registered on npmjs.com against an organization or user, a repository, a **workflow filename** ("Enter only the filename, not the full path"), and an optional environment name.

Four things no existing workflow supplies.

1. **A registered trusted publisher for the new workflow filename.** The npmjs.com config keys on the filename, so a new file needs a new registration. That is a human step on npmjs.com, not a repository change. `publish-hogli.yml` needed the same for PyPI.
2. **The package name and scope.** Map 68 puts publishing under `@posthog/*` out of scope until the workflows team agrees, and `pnpm-workspace.yaml:187-189` already excludes `@posthog/*` from the release-age delay, which only matters for a name in that scope.
3. **A version source that suits a semver-visible SDK.** The quill workflow derives the version from npm and bumps it. `publish-hogli.yml` reads the version from the package and matches it to the tag. A customer-facing SDK whose changelog matters is closer to the second, and `release-cli.yml` shows the third option, a changeset tool that writes the bump into the repo.
4. **A published `bin`.** No workflow in this repo has ever published a package with a `bin`, so nothing here proves the install path. `@posthog/cli` does prove it, but its npm package is built by cargo-dist from Rust, not from a `package.json` in this tree (section 3.4).

## 3. The CLI entry: running the customer's TypeScript

### 3.1 What Node does on its own

From https://nodejs.org/api/typescript.html (read 2026-09-21):

- Type stripping was added in v22.6.0 behind a flag, enabled by default in v23.6.0 and v22.18.0, and became stable in v25.2.0 and v24.12.0. The `--experimental-strip-types` flag no longer exists; `--no-strip-types` disables the feature.
- "Node.js will replace TypeScript syntax with whitespace, and no type checking is performed."
- `--experimental-transform-types` was added in v22.7.0 and **removed in v26.0.0**.
- Unsupported syntax errors out: enum declarations, namespaces with runtime code, parameter properties, import aliases, and decorators.
- `tsconfig.json` is ignored, "including: Path aliases" and downlevelling.
- File extensions are mandatory in imports: `import './file.ts'` works, `import './file'` errors.
- `import type` is mandatory for type-only imports; a plain `import { Type } from './module.ts'` is a runtime error.
- The page recommends `"erasableSyntaxOnly": true`, which "restricts your code to only TypeScript syntax that can be stripped without code generation", alongside `"target": "esnext"`, `"module": "nodenext"`, `"rewriteRelativeImportExtensions": true`, and `"verbatimModuleSyntax": true`.

Native stripping is therefore usable, but it constrains the customer's file: extensions in imports, no enums, no path aliases, and `import type` discipline.

### 3.2 The loaders

**jiti** (https://github.com/unjs/jiti, read 2026-09-21; npm `jiti@2.7.0`, published 2026-05-05). Pure JavaScript, no native build step, and the npm manifest declares **no dependencies at all**. It uses Babel as a lazily loaded default transformer, caches transpiled output to `node_modules/.cache/jiti` or the temp directory, and does not type check. The programmatic API is `createJiti(import.meta.url)` and `jiti.import(id)`. It also ships its own `bin` (`jiti`).

**tsx** (npm `tsx@4.23.15`, published 2026-09-20). `engines.node` is `>=18.0.0` and its only dependency is `esbuild ~0.28.0`. The README tagline is "TypeScript Execute (tsx): The easiest way to run TypeScript in Node.js" (https://github.com/privatenumber/tsx). esbuild transpiles and does not type check. The details of its scoped `tsImport` and `register`/`unregister` API are **unverified**: `https://tsx.is/node` and `https://tsx.is/node/ts-import` both failed to fetch on 2026-09-21 with a TLS certificate error, and the GitHub README page did not render the body.

Practical difference for a shipped `bin`: jiti adds one pure-JS dependency with no platform binaries, tsx adds esbuild, which is a platform-specific binary with a postinstall step. `pnpm-workspace.yaml:113-134` lists `esbuild` under `onlyBuiltDependencies`, which is evidence that the build step is real and has to be allowed.

**bun** would remove the loader question entirely, and the prototype used it (`products/workflows/prototypes/workflows-as-code/package.json` scripts all start `bun run`). Section 3.5 is the cost.

### 3.3 What `@posthog/wizard` does

`@posthog/wizard@2.76.0`, published 2026-09-18 (npm registry metadata, read 2026-09-21).

- `bin` is `{"wizard": "dist/bin.js"}`, `type` is `module`, `main` is `dist/index.js`, and `types` is absent. It ships a CLI, not a typed library.
- `engines` is `{"node": ">=22.22.0", "npm": ">=3.10.7"}`.
- `repository` is `https://github.com/PostHog/wizard`, a separate repository. Only backend support for it lives in this tree, for example `posthog/api/wizard/`.
- Its description is "The PostHog wizard helps you to configure your project".
- It has 35 runtime dependencies. Three matter here: **`jiti ^2.7.0`**, `magicast ^0.2.10`, and `recast ^0.23.3`. jiti is the runtime TypeScript loader. magicast and recast are AST-level source rewriters, which is the same job the prototype's `sdk/identity.ts` does when it writes the id back into the `workflow({...})` call.

So the customer-facing precedent already bundles a loader rather than requiring one, and already carries the tooling for surgical source edits.

The exact files `npx @posthog/wizard` writes into a project are **unverified**. https://www.npmjs.com/package/@posthog/wizard returned HTTP 403 to an automated fetch on 2026-09-21, and the `PostHog/wizard` repository was not read.

### 3.4 An npm wrapper for the Rust CLI already exists

`@posthog/cli@0.18.3`, published 2026-09-16 (npm registry metadata, read 2026-09-21).

- `bin` is `{"posthog-cli": "run-posthog-cli.js"}`, a JavaScript shim.
- `scripts.postinstall` is `node ./install.js`, and the only runtime dependency is `detect-libc ^2.1.2`.
- The manifest carries `supportedPlatforms`, `glibcMinimum: {major: 2, series: 35}`, and `preferUnplugged: true`.
- `engines` is `{"node": ">=14.14", "npm": ">=6"}`, far looser than anything else here, because the shim does no real work.
- `_from` is `file:npm/posthog-cli-npm-package.tar.gz`, resolved under `/home/runner/work/posthog/posthog/`. The tarball is a CI artifact, not a directory in this tree.

The generator is cargo-dist, configured in two lines: `cli/Cargo.toml:92-93`, `[package.metadata.dist]` with `npm-package = "cli"`. The crate is `posthog-cli` at version `0.18.3` (`cli/Cargo.toml:6-7`), matching the npm version exactly.

One more detail from `cli/RELEASING.md:33-34`: the release workflow "builds `services/mcp` into `cli/lib/posthog-api-cli.mjs` before cargo-dist packages artifacts", so the Rust CLI already ships a bundled Node script inside its archive.

### 3.5 Which runtimes a customer's CI actually has

From the `ubuntu-24.04` GitHub Actions runner image manifest (`images/ubuntu/Ubuntu2404-Readme.md` in `actions/runner-images`, read 2026-09-21):

- Language and Runtime: `Node.js 22.23.2`. Python 3.12.3, Ruby 3.2.3, and others are listed. **Bun is not listed. Deno is not listed.**
- Package Management: `Npm 10.9.8`, `Yarn 1.22.22`. **pnpm is not listed** at the top level.
- Cached Tools, Node.js: `22.23.2` and `24.20.0`.

Consequences.

- `node` on the PATH is 22.23.2, which is past v22.18.0, so native type stripping is on by default without a flag.
- npm on the PATH is 10.9.8, below the 11.5.1 that trusted publishing needs. That is exactly why both publish workflows run `npm install -g npm@11.6.4`.
- bun would need `oven-sh/setup-bun` or an install script in every customer's job. No workflow in this repository uses bun today: there is no `bun.lock` or `bunfig.toml` outside `node_modules`, and a word-boundary grep for `bun` across `.github/workflows/*.yml` returns nothing. The only trace is one devDependency, `"@types/bun": "1.3.14"` at `products/desktop/packages/agent/package.json:173`, with no matching source usage.

This repo's own pins are stricter than the runner default: `.nvmrc:1` is `v24.13.0` and `package.json:122-125` sets `"engines": {"node": ">=24 <25"}` with `"packageManager": "pnpm@10.29.3"`. A customer's project will not share those.

### 3.6 What this repo already does to run TypeScript

- `nodejs/package.json:17` `"start:dev": "NODE_ENV=dev tsx watch src/index.ts"` uses a loader in development. `nodejs/package.json:18` `"start:dist": "node dist/index.js"` runs compiled JavaScript in production, built by `"typescript:compile": "tsc -b && tsc-alias"` (`:21`).
- `tsx` is a devDependency in ten places, including `nodejs/package.json:201`, `products/visual_review/cli/package.json:24`, `services/mcp/package.json:98`, and `packages/quill/packages/quill/package.json:59`.
- `ts-node` is a devDependency at `nodejs/package.json:198` and `frontend/package.json:360`, and the root `tsconfig.json:82-86` carries a `"ts-node"` override block. That is what lets Jest load `frontend/jest.config.ts`.
- `@swc-node/register` at `common/hogvm/typescript/package.json:43` is the only loader-registration usage in the tree.
- **`jiti` appears nowhere in the repo.** Neither do `esbuild-register`, `unbuild`, or `bun-types`.
- No script in this repository dynamically imports a user-supplied `.ts` file at runtime. Every `.ts` config that gets loaded rides on `ts-node` (Jest) or a bundler's own esbuild loader (Vite, Vitest, Playwright). There is no in-repo precedent for the thing the workflows CLI has to do.

## 4. Adding it to an existing project

### 4.1 Convex, the model Michael named

From https://docs.convex.dev/cli (read 2026-09-21), the first `npx convex dev` creates:

- a `convex/` directory, "the home for your query and mutation functions";
- `.env.local`, holding `CONVEX_DEPLOYMENT`, described as "the main configuration for your Convex project".

It then "watches the local filesystem. When you change a function or the schema, the new versions are pushed to your dev deployment and the generated types in `convex/_generated` are updated."

The one sentence that decides the generated-directory question, from the same page: "this code should be committed to the repo (your code won't typecheck without it!)".

`npx convex codegen` regenerates `convex/_generated` without a deployment push, and "The generated code in the `convex/_generated` directory includes types required for a TypeScript typecheck."

The directory holds five files (https://docs.convex.dev/generated-api/, read 2026-09-21): `api.js` and `api.d.ts`, `dataModel.d.ts`, and `server.js` and `server.d.ts`. The rationale on that page: "Convex uses code generation to create code that is specific to your app's data model and API."

Two things the Convex docs do **not** say, so they are unverified: whether `convex dev` writes `.gitignore` entries, and whether it creates a `convex.json`.

The quickstart (https://docs.convex.dev/quickstart/react, read 2026-09-21) reduces the whole install to two commands, `npm install convex` then `npx convex dev`, and the first run "will prompt you to log in with GitHub, create a project, and save your production and deployment URLs". `convex@1.46.0` (published 2026-09-16) declares `bin: {"convex": "bin/main.js"}` and `engines.node >=20.0.0`.

### 4.2 Prisma, the contrasting model

From https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/generating-prisma-client (read 2026-09-21):

- "prisma generate creates Prisma Client from the models and generator configuration in your schema.prisma file."
- "In Prisma ORM v7, the output field is required", with the example `output = "./generated"`. Earlier versions defaulted to `node_modules/.prisma/client`. The generated code now lands in the customer's tree by default, not inside `node_modules`.
- The customer imports from that path: `import { PrismaClient } from "./generated/client"`.
- Regeneration is needed "after changing your Prisma schema, updating generator configuration, enabling features that affect the client API, or pulling schema changes from another branch or teammate".
- On automation: "In many projects it also makes sense to run `prisma generate` in `postinstall` or before your production build so deployments always use a current client." The wording is a suggestion, not a requirement.

The Prisma pages read on 2026-09-21 give **no** guidance on committing or gitignoring the output directory. That is the clearest difference from Convex, which states the commit rule in one parenthesis.

### 4.3 What an `init` in an existing project would have to write

Facts, not a design. Combining the two models above with what the prototype already needs:

- **A directory for workflow sources.** Convex writes `convex/`. The prototype kept its example at `example/onboarding.workflow.ts` and its tsconfig `include` was `["sdk", "example", "dev"]` (prototype `tsconfig.json`).
- **A config file, or no config file.** Convex uses `.env.local` with a single variable and does not require a config file in the quickstart. Prisma requires a schema file and now requires an `output` field in it.
- **A generated directory, if there is one.** Map 68 lists "Template inputs and generated types" as not yet specified, so whether v1 generates anything is open. If it does, Convex's rule is to commit it and Prisma's newer rule is to put it in the customer's tree at a path they name.
- **`.gitignore` entries, or not.** Convex's committed-generated-code rule means it does not need one for `_generated`. No primary source read here documents either tool writing `.gitignore` entries, so that part is unverified for both.
- **A `package.json` edit, or not.** Prisma's docs suggest a `postinstall` script. Nothing in the Convex docs read here adds a script.
- **Nothing that conflicts with an existing `tsconfig.json`.** Neither tool's docs describe replacing the customer's tsconfig. Convex relies on its generated `.d.ts` files being reachable from the customer's existing config; Node's own recommended options (section 3.1) would be additions, not replacements.

### 4.4 Starting from nothing

The only primary fact available: Convex's quickstart assumes a project already exists and starts from `npm install convex`, so `npx convex dev` in a truly empty directory is not a documented path. Prisma's own bootstrap command (`prisma init`) was **not read** on 2026-09-21, so what it writes into an empty directory is unverified.

What the repository does say is that `@posthog/wizard` is the in-house precedent for dropping files into a repository (map 68 Notes, "Packaging precedents"), and section 3.3 shows it carries `magicast` and `recast` for that. Its exact behavior in an empty directory is unverified.

## 5. Type checking the customer's files

Three separate facts.

**No loader type checks.** Node's stripping performs no type checking (https://nodejs.org/api/typescript.html). jiti "does not perform type checking" (https://github.com/unjs/jiti). tsx transpiles with esbuild, which does not type check either. A type error in a workflow file therefore reaches the CLI as either a runtime error or, worse, silently wrong data. Reporting a type error **before** loading means running a type checker, which means `tsc` or the TypeScript compiler API.

**No package in this repo ships a tsconfig preset to outside consumers, but one exists internally.** `@posthog/tsconfig` lives at `products/desktop/tooling/typescript/package.json:1-13` and exports `./base.json`, `./node-package.json`, and `./react-package.json`. Nine desktop packages depend on it with `"@posthog/tsconfig": "workspace:*"`, for example `products/desktop/packages/core/package.json:37`, and extend it by name, for example `products/desktop/packages/core/tsconfig.json:2` (`"extends": "@posthog/tsconfig/base.json"`). Its `base.json` is a small, strict, bundler-oriented config: `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict`, `isolatedModules`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `skipLibCheck`, `noEmit`.

That package is the working proof that a shipped tsconfig preset is a normal shape here. It is inside the excluded desktop workspace, so it is not published either.

**The root tsconfig is not a preset for this purpose.** There is no `tsconfig.base.json` at the repo root. About 45 `products/*/tsconfig.json` files extend the root `tsconfig.json` (for example `products/wizard/tsconfig.json:2`), and the root config's `compilerOptions` are frontend-shaped: `jsx: react-jsx`, `lib: ["dom", "es2023"]`, `moduleResolution: bundler`, `noEmit: true` (`tsconfig.json:2-56`). Its `include` list (`tsconfig.json:57-68`) covers `frontend/**/*`, `products/**/frontend/**/*`, and `products/**/manifest.tsx`, so product-owned CLI TypeScript is not type checked by it even when a product tsconfig extends it. `nodejs/` and the desktop tree each keep an independent tsconfig tree.

The version constraint is worth noting: `pnpm-workspace.yaml:52` pins `typescript: 6.0.3` as a workspace override. A published preset would have to state a compatible `typescript` peer range for the customer's own version.

## Open options

The facts leave these open. Each is a choice, not a finding.

**Where the package lives.**

1. `products/workflows/packages/<name>/` — sanctioned by `monorepo-layout.md:75`, silent to `product:lint`, needs a hand-written `pnpm-workspace.yaml` entry, and has two in-tree structural precedents that are both private.
2. Top-level `packages/<name>/` — matches the two publishing precedents (`packages/quill`, `packages/llm-normalizer`) but contradicts the ownership rule at `monorepo-layout.md:88-89` unless the package is genuinely shared.

**How it builds.**

1. vite plus `vite-plugin-dts` with a `tsconfig.build.json`, copying quill exactly, including `rollupTypes` if any internal package is bundled.
2. `tsc` alone, copying `products/visual_review/cli/package.json:10`.
3. `tsup`, copying the desktop packages.
4. No build, shipping `.ts` like `packages/llm-normalizer` — ruled out for anything published, since consumers outside this repo have no bundler.

**How it versions.**

1. Derive from npm and bump, like `publish-quill-npm.yml:74-103`.
2. Read from the manifest and match a pushed tag, like `publish-hogli.yml:42-52`.
3. Sampo changesets that write the bump into the repo, like `cli/RELEASING.md:6-13`.

**How the `bin` runs the customer's TypeScript.**

1. Native Node stripping, no dependency, with the section 3.1 constraints pushed onto the customer's file (extensions in imports, no enums, no path aliases) and a floor of Node 22.18.
2. Bundle `jiti` — zero transitive dependencies, pure JS, and the `@posthog/wizard` precedent.
3. Bundle `tsx` — adds esbuild and its platform binary, but is the loader already in this repo ten times over.
4. Require `bun` — zero package weight, but no CI runner image ships it and this repository uses it nowhere.
5. Ship a compiled artifact and never load customer TypeScript at run time, which changes the authoring model rather than the loader.

**What the generated directory does, if there is one.**

1. Commit it and say so, like Convex.
2. Put it at a customer-named path and suggest a `postinstall` regeneration, like Prisma v7.
3. Have none in v1, which map 68 leaves open under "Template inputs and generated types".

**How a type error is reported before load.**

1. Run `tsc --noEmit` as a child process against the customer's own tsconfig, which needs `typescript` present in their project.
2. Depend on `typescript` and drive the compiler API in-process, which fixes the version but adds weight.
3. Ship a tsconfig preset the customer extends, copying `@posthog/tsconfig` (`products/desktop/tooling/typescript/`), and leave the checking to their existing `tsc` step.
4. Do not type check at all, and let the SDK's runtime validation catch what it can, which is what the prototype did (`bunx tsc --noEmit` was a separate script, not part of emit or push).

## Unverified

Recorded so nobody treats these as settled.

- What `npx @posthog/wizard` writes into an existing project. The npm page returned HTTP 403 to an automated fetch on 2026-09-21 and the `PostHog/wizard` repository was not read. Only the manifest was read.
- tsx's scoped `tsImport` and `register`/`unregister` API. `https://tsx.is/node` and `https://tsx.is/node/ts-import` both failed with a TLS certificate error on 2026-09-21.
- Whether `npx convex dev` writes `.gitignore` entries, and whether it creates a `convex.json`.
- Whether Prisma's docs take a position on committing the generated output directory. The two pages read on 2026-09-21 do not.
- What `prisma init` writes into an empty directory.
- Whether `products/visual_review/cli` resolves as a pnpm workspace member through some path other than `pnpm-workspace.yaml`. It does not appear in that file, and `products/*` matches one level only.
- Whether the `macos-*` and `windows-*` runner images ship bun. Only `ubuntu-24.04` was read.
