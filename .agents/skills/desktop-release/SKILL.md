---
name: desktop-release
description: Ship a Cocurdex desktop release end to end — bump the apps/desktop version, open and merge the release PR, then tag main to trigger the Release workflow. Use when the user says 发版 / 发测试版 / 发正式版 / 出个 beta / cut a release / ship a release / release the desktop app.
---

# Desktop release

A release is four moves: bump → PR → merge → tag. Pushing the tag is the only thing
that starts the build; `workflow_dispatch` is not used for releases.

## Invariants

- The version lives in exactly one place: `apps/desktop/package.json`.
- Never commit or push on `main`. Work on a branch; reuse the current one if it is not `main`.
- The bump is its own commit, `chore(desktop): bump version to <version>`, made on the branch and merged through the PR — not on `main` after merge.
- The tag is `v<version>`, must equal `apps/desktop/package.json`, and the tagged commit must be an ancestor of `origin/main`.
- Tags are lightweight (`git tag <name> <commit>`), matching every existing release tag.
- Merge with a merge commit (`gh pr merge --merge`). History is merge commits, and the tag goes on that merge commit.
- Never bypass a required CI check. Fix the failure; do not weaken a test to make it pass.
- Every review thread is resolved before the merge: fixed, or answered with a reason and then resolved.

## Beta vs stable

Both run the identical pipeline. The version suffix is the only difference, and it decides
who receives the build — not just how it is labelled.

| | beta, e.g. `0.1.42-beta.10` | stable, e.g. `0.1.42` |
| --- | --- | --- |
| `bump` kind | `bump beta` | `bump release` |
| GitHub release | prerelease | full release |
| macOS feed files | `latest-mac.yml` + `beta-mac.yml` | `latest-mac.yml` |
| Who gets the update | apps on the `test` update channel | apps on the default `stable` channel |

The desktop app's channel setting lives in `app-update-channel.json`; `stable` is the default and
refuses prereleases, so a beta only reaches users who switched to `test`. Promote a beta with
`bump release` on the same line — never by editing or re-pointing a tag.

## Process

### 1. Land the work

Commit any uncommitted changes in logical groups first (English, conventional commits).

### 2. Bump

```bash
node scripts/release.mjs bump beta      # 0.1.42-beta.9 -> 0.1.42-beta.10
node scripts/release.mjs bump release   # 0.1.42-beta.10 -> 0.1.42
```

Refuses on `main` and on a dirty tree. `--dry-run` prints the next version without writing or committing.

### 3. Push and open the PR

```bash
git push origin <branch>
gh pr create --base main --head <branch> --title "..." --body-file <file>
```

### 4. Clear review, wait for CI, merge

Review comes before the merge. Read every thread, then either fix it or resolve it with a reason.
A PR is not ready to merge while any thread is open.

```bash
gh api graphql -f query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      reviewDecision
      reviewThreads(first:100){nodes{id isResolved isOutdated path line
        comments(first:20){nodes{databaseId author{login} body}}}}
    }
  }
}' -F owner=<owner> -F repo=<repo> -F pr=<n>
```

For each unresolved thread:

- **Fixable** → fix it, push, and resolve the thread once the fix is in.
- **Not fixable or deliberately declined** → reply with the reason, then resolve it. Never resolve a
  thread you have not answered.

```bash
gh api repos/<owner>/<repo>/pulls/<n>/comments/<commentId>/replies -f body="<reason>"
gh api graphql -f query='
mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<threadId>
```

`isOutdated: true` means the diff moved past the comment; check whether the fix already landed
before resolving. Re-run the query until every thread reports `isResolved: true`.

Then wait for CI and merge:

```bash
gh pr checks <n> --watch --interval 30
gh pr view <n> --json mergeable,mergeStateStatus,reviewDecision
gh pr merge <n> --merge
```

CI runs the full workspace suite (`pnpm test`), not just the packages you touched. Run the
affected packages' tests locally before pushing, but expect the whole suite to be the gate.
Merge only when every review thread is resolved and every required check is green.

### 5. Tag

```bash
node scripts/release.mjs check     # clean tree, version on main, tag name free
node scripts/release.mjs tag       # lightweight tag at the origin/main tip, then push
```

Pushing the tag triggers `.github/workflows/release.yml`.

### 6. Verify

```bash
gh run list --workflow=release.yml --limit 1
gh release view v<version> --json isDraft,isPrerelease,assets
```

The workflow builds macOS arm64/x64, Windows x64, and Linux x64, then publishes. Expect about
11 minutes. Success is `isDraft: false` with the platform artifacts plus `latest*.yml` and
`mac-update-*.json`. A version with a prerelease suffix publishes as a GitHub prerelease.

## Pitfalls

- **Branch behind `main`.** GitHub reports `mergeStateStatus: BEHIND` when the branch lacks main's
  merge commits. Updating the branch (through GitHub or `git merge origin/main`) creates a merge
  commit on the branch; if you hold local unpushed commits, rebase them onto the updated remote
  (`git rebase origin/<branch>`) before pushing.
- **Tagging before the merge fails.** The `Validate release tag` job requires the tagged commit to
  be an ancestor of `origin/main`, so a branch-tip tag is rejected.
- **Version/tag mismatch fails.** `v<package.json version>` must match exactly, prerelease suffix
  included.
- **Never tag from a stale checkout.** `release.mjs` fetches `origin/main` and tags its tip; do not
  tag a local `main` you have not fetched.

## Script

`scripts/release.mjs` — subcommands `bump <beta|release|patch|minor|major>`, `check`, and `tag`;
all accept `--dry-run`.
