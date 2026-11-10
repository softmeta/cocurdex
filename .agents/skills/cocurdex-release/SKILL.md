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

Never tag by hand when the script can: `release.mjs` owns the version arithmetic, the order, and
the checks between steps.

## Release with `plan` and `run`

A release request (发版, 发测试版, what needs releasing) starts with:

```bash
node scripts/release.mjs plan            # add --json to read it programmatically
```

The plan is deterministic. For `origin/main` it prints the steps in order, the lines it does not
release and why, and notes. It blocks everything while the `ci.yml` push run on the main tip is not a
completed success. Its rules:

- **app**: with shipped app changes since the last app tag, cut the next beta at the main tip. When
  those changes touch `apps/mobile/`, run the iOS flows first (CI runs only Android); on a host that
  is not an Apple Silicon Mac the app is held instead.
- **promotion is manual.** The plan only notes that the latest beta can be promoted. Pass
  `--promote` only when the user asks for stable (转正, 发正式版, promote); it tags the latest beta's
  commit unchanged and goes first, so later betas open the next line.
- **relay**: released and then deployed after the app steps, only when every daemon RPC method its
  web client calls (a method name in the renderer sources) exists in the stable app's
  `packages/rpc/src/method-scopes.ts`, after any promotion in the same plan. Otherwise it is held and
  the reason names the missing methods and whether promoting the open beta would unblock it.
- **push**: never cuts the first push gateway release (that needs a host and APNs credentials); after
  one exists, pending changes get the next patch.

Read the plan, then judge only what it cannot see, and hold a line with `--skip <line,...>` when:

- every pending change of a line is internal (refactors, tooling, a dependency bump with no
  user-visible effect), so a release would ship nothing users notice;
- the relay's web client changed a field it reads or sends on an existing RPC method that the stable
  daemon does not provide and does not degrade cleanly on (the method check sees names, not fields).

When a release was requested, do not ask the user to confirm the plan: execute it and report.

```bash
node scripts/release.mjs run [--skip relay] [--promote]
```

`run` rebuilds the plan from fresh facts and executes the steps in order: it runs the iOS flows from
this checkout (which must be a clean checkout of the main tip; the runner needs `applesimutils`:
`brew tap wix/brew && brew install applesimutils`), pushes each tag, waits for its workflow, checks
that the GitHub release published (a prerelease for a beta, with assets), and deploys the relay with
`ssh cocurdex-relay deploy-cocurdex-relay deploy <tag>`. It stops at the first failure and reports
which step failed. A step that failed before its tag was pushed (the iOS flows) is fixed on `main`
and the whole `run` repeated. Once a tag is pushed, the plan moves past it, so a failed workflow on
that tag is retried with `gh run rerun <run-id> --failed`, and a failed relay deploy with the same
`ssh` command; then run again for the remaining steps. Report the tags, the runs, and the relay deploy
commands, then check the deployed relay read-only (version, `systemctl status`, recent logs).

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

## Lower-level commands

`run` uses these; reach for them only to repair a release by hand.

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

## What a published app release contains

The Release workflow builds macOS arm64/x64, Windows x64, Linux x64, and, unless promoting, iOS and
Android, then publishes; expect about 15 minutes. Success is `isDraft: false` with the platform
artifacts, the APKs, `latest*.yml`, and `mac-update-*.json`. A beta publishes as a prerelease.

## Scheduled beta

`scheduled-beta.yml` runs daily at 19:00 UTC (04:00 UTC+9) and runs
`release.mjs tag beta --if-pending`: it cuts the next app beta only when the `origin/main` tip has a
completed, green `ci.yml` push run and a shipped app file changed since the last app tag; otherwise
it logs why and stops. It pushes the tag with the `RELEASE_TAG_DEPLOY_KEY` deploy key from the
`release` environment, which the "Protect release tags" ruleset lets bypass, so the tag push starts
`release.yml` like a hand-pushed tag. Run it now with
`gh workflow run scheduled-beta.yml [-f dry_run=true]`.

It cannot run the iOS flows, so a scheduled beta carrying `apps/mobile/` changes ships
to TestFlight on Android CI coverage alone. Before promoting such a beta, run the iOS flows on its
commit; when they fail, fix on `main` and let the next beta pick it up. It never promotes and never
releases the relay or the push gateway; those go through `run`.

## Pitfalls

- **The tagged commit must be on `origin/main`.** The `Validate release tag` job rejects a tag on
  a branch commit; merge first.
- **Never re-point or delete a published tag.** Ship a fix as the next beta or patch instead.
- **A failed job on a tag** is retried with `gh run rerun <run-id> --failed`; do not push a new tag
  for the same commit.
