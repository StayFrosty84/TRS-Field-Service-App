# Deployment

How and where this app ships. The live site is GitHub Pages on the **`trs`** remote
(`StayFrosty84/TRS-Field-Service-App`). There are two channels plus a landing page, all
served from the one Pages site.

## Channels at a glance

| Path | Source | Updated by |
|------|--------|-----------|
| `/beta/` | `trs/main` HEAD | **every push** to `main` (automatic) |
| `/stable/` | latest **non-prerelease** GitHub Release | publishing a full release |
| `/` | landing page | with each deploy |

The two-channel logic lives in [`deploy.yml`](../.github/workflows/deploy.yml) **on the
`trs/main` branch**. Triggers: `push` to `main`, `release: published`, and
`workflow_dispatch`.

## Ship to beta

```bash
git push trs main
```

The push-triggered Pages run rebuilds and deploys `/beta/` in ~2 minutes. That's the whole
flow — beta tracks `main`.

> Pushing to `trs/main` is a push to the default branch, so Claude Code's auto-mode
> classifier will prompt for confirmation. That's expected: **beta = main**.

## Promote to stable

`/stable/` builds from the latest **full** (non-prerelease) GitHub Release; a prerelease
does not touch it. So promotion = cut a full release from the commit you want stable to serve.

**Stable is a curated subset of beta, not a snapshot of `main`.** Some features are kept
beta-only (currently **Google Drive sync**). Those excluded features live only on `main`, so
stable is cut from a dedicated **`stable-wave2`** branch = `main` minus the beta-only code —
*not* from `main` directly. Keep the two in sync each promotion:

```bash
# 1. Fold the new beta work into the stable branch, then re-remove the beta-only bits
git checkout stable-wave2
git merge main            # resolve so src/lib/sync/* + CloudSync stay OUT
npm run icons && npx vitest run && npm run build   # verify green
git push trs stable-wave2

# 2. Cut a FULL release targeting that branch (this becomes /stable/'s source)
gh release create v3.3.0 --target stable-wave2 --title "v3.3.0 — stable" --notes "…"

# 3. Trigger a main-ref Pages run so /stable/ rebuilds from the new release tag
gh workflow run deploy.yml --ref main
```

Step 3 is required: the `release: published` run fires on a tag ref, which the
`github-pages` environment rejects (see the gotcha below). A `main`-ref run (push or
`workflow_dispatch`) re-queries `releases/latest` and rebuilds `/stable/` from it.

- **Versioning:** `vMAJOR.MINOR.PATCH`. Stable: **`v3.2.0`**; beta (`main`): `3.2.0-beta.1`.
- Use `--target <branch>` (e.g. `stable-wave2`). A short commit SHA fails with
  `Release.target_commitish is invalid` — pass the branch name, not the SHA.
- Beta milestone that does NOT touch `/stable/`:
  `gh release create v3.3.0-beta.1 --target main --prerelease …`

## Gotcha: the cosmetic release-run "failure"

When you publish a release, the `release: published` trigger starts a second Pages run.
The `github-pages` environment only permits the **`main`** branch, so that
tag-ref run is **rejected and shows as failed**. This is expected and harmless — the actual
content already deployed via the push run (and the release run's build step still ran).
**Don't try to "fix" it** by re-running; it will fail again by design.

## Remotes

| Remote | Repo | Role |
|--------|------|------|
| `trs` | `StayFrosty84/TRS-Field-Service-App` | **ship here** (beta + stable) |
| `origin` | `alexanderabitar-star/field-service-app` | personal mirror |
| `v2`, `v3` | archived `StayFrosty84` repos | read-only history |

## Local vs. canonical workflow

The `deploy.yml` checked out on a typical **local** branch (e.g. `stable-wave1`) is the
older **single-channel** version: push to `main` → one site at `/<repo>/`. That's the
`origin` (personal mirror) variant. The **canonical two-channel flow described above lives
on `trs/main`** — treat that as the source of truth for deployment.
