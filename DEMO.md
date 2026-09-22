# Workflows as code: try the demo

This branch, `demo/workflows-as-code`, is `master` plus every workflows-as-code PR merged together.
It shows the product as it looks once the PRs land. It is never merged itself.

The PRs are listed in the team message that points here. Each one stands on its own; this branch only saves you the merging.

## Start

```bash
git fetch origin demo/workflows-as-code
git checkout demo/workflows-as-code
pnpm install --frozen-lockfile
pnpm --filter=@posthog/workflows build
hogli start
```

The branch adds four workflows migrations (`0026` to `0029`). `hogli start` applies them.
If your local database already has other branches' rows for `0026` or `0027`, run `DEBUG=1 python manage.py migrate --skip-orphan-check`.

Log in, open **Workflows**, then the **Channels** tab, and add an email sender if the project has none. Verify it, or mark it verified in the Django admin on a local instance.

## Credentials

The CLI reads three variables. Make a personal API key with the `hog_flow:write` scope, or a project secret API key with the same scope, and export it:

```bash
export POSTHOG_CLI_API_KEY=<your key>
export POSTHOG_CLI_PROJECT_ID=<your project id>
export POSTHOG_CLI_HOST=http://localhost:8010
```

Nothing is written anywhere. With none of the three set, the CLI falls back to the credentials file that `posthog-cli login` writes.

## The loop

Run these from the repository root. `F` is the example workflow that ships with the repository.

```bash
alias posthog-workflows='node products/workflows/packages/workflows/dist/cli/main.js'
F=products/workflows/workflows/welcome-new-signups.ts
```

1. Read the file: `cat $F`. It is one declarative record: a trigger, a delay, a branch and an email step.

2. The sender id in `from: { integrationIds: [...] }` comes from the **Channels** tab. Expand the domain and click the copy icon after the sender. The tooltip reads "Copy integration ID". Paste the number into the file.

3. Check the file offline. Exit code 0, no credentials needed:

   ```bash
   env -u POSTHOG_CLI_API_KEY -u POSTHOG_CLI_PROJECT_ID posthog-workflows check $F
   ```

4. Check it against the project. It prints `would create`:

   ```bash
   posthog-workflows check $F
   ```

5. Push. It prints `created`, `version 1` and the URL:

   ```bash
   posthog-workflows push $F
   ```

6. Open the URL. The header carries the badge **Managed by code**. Hover **Save**: the reason names the file. The **History** tab shows `v1`. The workflows list shows the badge after the name.

7. Edit, commit, check, push. The check prints the diff. The push prints `updated` and `version 2`:

   ```bash
   sed -i '' "s/delay('1d', { name: 'Wait a day' })/delay('3d', { name: 'Wait three days' })/" $F
   git commit -qam 'feat(workflows): wait three days before the welcome email'
   posthog-workflows check $F
   posthog-workflows push $F
   ```

8. Reload the editor: the step reads `Wait three days`. **History** shows `v2` live.

9. Roll back with git. The push prints `updated` and `version 3`, and `Wait a day` is back:

   ```bash
   git revert --no-edit HEAD
   posthog-workflows push $F
   ```

10. Push with nothing changed. It prints `unchanged` and the version stays:

    ```bash
    posthog-workflows push $F
    ```

11. Push as CI would, with a project secret API key. Same output. The new revision has no author, because a project key is not a person.

12. The repository scripts, over every file in the folder:

    ```bash
    pnpm --filter=@posthog/workflows repo:check
    pnpm --filter=@posthog/workflows repo:push
    ```

## Try it from another repository

Pack the package and install the tarball in any repository:

```bash
cd products/workflows/packages/workflows
pnpm build && pnpm pack --pack-destination /tmp
cd <your repository>
pnpm add /tmp/posthog-workflows-0.0.0.tgz
pnpm exec posthog-workflows init workflows/welcome.ts
pnpm exec posthog-workflows check workflows/welcome.ts
pnpm exec posthog-workflows push workflows/welcome.ts
```

## Known limits

- A push accepts any sender id without checking that the sender exists. A wrong id fails at send time.
- The step panel is not visually read-only yet. You can type into a field; the value is not saved, and Save carries the reason. The full read-only editor is a later PR.
- An email step needs the plugin-server running, because the email template comes from it.

## More

- The package and CLI: `products/workflows/packages/workflows/README.md`, including "Common questions".
- The repository's own workflows and the CI job: `products/workflows/workflows/README.md`.
- Contributor notes: "Code-managed workflows" and "Pushing a workflow from CI" in `products/workflows/CONTRIBUTING.md`.
