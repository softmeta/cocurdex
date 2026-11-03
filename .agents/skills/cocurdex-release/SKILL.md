---
name: cocurdex-release
description: Decide what Cocurdex needs to release and ship it end to end — the app (desktop, iOS, Android), the relay, or the push gateway. Use when the user asks what needs releasing, whether to release, or says 发版 / 发测试版 / 发正式版 / 转正 / 出个 beta / 要不要发版 / 哪些要发 / cut a release / ship a release / promote the beta / release the desktop app / release the relay.
---

# Cocurdex release

## Release lines

Each line ships from its own tag; pushing the tag is the only thing that starts its build. A tag
names an `origin/main` commit, so a release never needs its own PR or branch.

| line | tag | workflow | ships |
| --- | --- | --- | --- |
| app | `v<version>` | `release.yml` | desktop (macOS, Windows, Linux), iOS TestFlight, Android Play internal and APKs |
| relay | `relay-v<version>` | `relay-release.yml` | relay binaries, with the desktop renderer built in as the web client |
| push | `push-v<version>` | `push-release.yml` | push gateway |

The tag is the version. The Release workflow stamps it into `apps/desktop/package.json` before each
build (`release.mjs stamp`); the `version` committed there is a dev placeholder, so never bump it.

The relay and push lines tag an `origin/main` commit by hand with `git tag relay-vX.Y.Z <commit>`
and push it; once its workflow publishes, deploy the relay on the host with
`deploy-cocurdex-relay deploy relay-vX.Y.Z`.

## Decide first

Start every release question with:

```bash
node scripts/release.mjs status
```

It lists, for each line, what merged on `origin/main` since the line's last tag, skipping tests,
docs, and Markdown, and flags risk signals: `schema migration`, `mobile native`, and
`CLI or skill contract`. Read the listed PRs, then recommend per line:

- **Release** when a pending change fixes a bug users hit, or changes behavior users see.
- **Hold** when every pending change is internal (refactors, tooling, unreleased features behind a flag).
- **Beta first** for the app line when a change carries a `schema migration`, a `mobile native`
  change, or a broad behavior change. A low-risk batch of fixes may go straight to stable.
- **Relay after the app.** The relay's web client calls the daemon of the user's own app. Release the
  relay once the matching app reaches stable, so the web client never calls RPC methods the
  installed daemon lacks.

Present the recommendation with the PR list, and release only after the user agrees, unless they
already asked for a specific release.

## Channels

| | beta, e.g. `v0.1.42-beta.10` | stable, e.g. `v0.1.42` |
| --- | --- | --- |
| GitHub release | prerelease | full release |
| macOS feed files | `latest-mac.yml` + `beta-mac.yml` | `latest-mac.yml` |
| desktop update reaches | apps on the `test` update channel | apps on the default `stable` channel |
| mobile | new TestFlight and Play internal build | none built; promote the beta's build in App Store Connect and Play Console |

The desktop channel setting lives in `app-update-channel.json`; `stable` refuses prereleases.

Channels are versions, not branches. There is no long-lived beta or stable branch: work merges to
`main`, a beta tags a `main` commit, and promotion tags that same commit again.

## Commands

```bash
node scripts/release.mjs tag beta [patch|minor|major]   # next beta.N, or beta.1 of a new line
node scripts/release.mjs promote                        # stable tag on the latest beta's commit
node scripts/release.mjs tag stable [patch|minor|major] # new stable line without a beta
```

All accept `--dry-run`, which prints the tag and commit without pushing. Each fetches `origin`
first and refuses a tag that already exists.

- `tag beta` tags the `origin/main` tip. With an open beta line (`v0.1.42-beta.9`) it cuts
  `v0.1.42-beta.10`; after a stable (`v0.1.42`) it opens `v0.1.43-beta.1`.
- `promote` tags the latest beta's commit with its stable version, so stable ships exactly what beta
  users ran; anything merged after that beta waits for the next line. The workflow rebuilds desktop
  with the stable version, skips the mobile builds (store versions and build numbers would repeat
  the beta's), and copies the beta's APKs to the stable release.
- `tag stable` refuses while a beta line is open; promote it or cut another beta.
- A fix for a beta is a new beta: merge it, then `tag beta`. It soaks again before promotion.

## Process

1. Run `status` and agree on what to release with the user.
2. Make sure everything to ship is merged and the latest `main` CI run is green
   (`gh run list --workflow=ci.yml --branch main --limit 1`).
3. When the release carries changes under `apps/mobile/` or the packages it uses, run the iOS
   flows on this Apple Silicon Mac from a checkout of the commit to tag:

   ```bash
   pnpm --filter @cocurdex/mobile-e2e flows -- --platform ios --build
   ```

   CI runs only the Android flows, so this is the release's iOS coverage. A failure blocks the
   tag: fix it on `main` first. The runner needs `applesimutils` (`brew tap wix/brew && brew
   install applesimutils`), which Maestro uses to grant notification permission.
4. Run the command with `--dry-run`, check the tag and commit, then run it for real.
5. Verify:

   ```bash
   gh run list --workflow=release.yml --limit 1
   gh run watch <run-id> --exit-status
   gh release view v<version> --json isDraft,isPrerelease,assets
   ```

   The workflow builds macOS arm64/x64, Windows x64, Linux x64, and, unless promoting, iOS and
   Android, then publishes; expect about 15 minutes. Success is `isDraft: false` with the platform
   artifacts, the APKs, `latest*.yml`, and `mac-update-*.json`. A beta publishes as a prerelease.

## Pitfalls

- **The tagged commit must be on `origin/main`.** The `Validate release tag` job rejects a tag on
  a branch commit; merge first.
- **Never re-point or delete a published tag.** Ship a fix as the next beta or patch instead.
- **A failed job on a tag** is retried with `gh run rerun <run-id> --failed`; do not push a new tag
  for the same commit.
