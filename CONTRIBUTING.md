# Contributing

Cocurdex is pre-release. Bug reports and small, focused fixes are welcome.
Larger features need an issue and explicit agreement on scope before a pull
request.
Participation in this repository is governed by
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Contribution terms

By submitting a pull request, patch, or other contribution, you agree that:

- You have the right to submit the contribution. It is your original work, or
  you have permission to contribute it.
- You license the contribution under the [Functional Source License, Version
  1.1, ALv2 Future License](LICENSE.md) (`FSL-1.1-ALv2`), the same terms that
  cover this repository.
- softmeta LLC may use the contribution in any Cocurdex product or service,
  including hosted offerings and other commercial distribution, under those
  terms.
- You retain copyright in your contribution.
- This license does not grant you any right to the Cocurdex name, logo, or
  other trademarks, which remain with softmeta LLC.

If you cannot agree, do not submit the contribution. A separate written
agreement with softmeta LLC takes precedence over these terms.

## Before you start

1. Search existing issues and pull requests to avoid duplicate work.
2. For anything beyond a small bug fix, open an issue first and wait for
   agreement on the approach. Filing an issue is not approval.
3. Do not report security vulnerabilities in a public issue. Use this
   repository's private reporting process in [SECURITY.md](SECURITY.md) so
   maintainers can fix the issue before disclosure.
4. Do not commit secrets, access tokens, real user data, or user/agent
   transcripts. Test fixtures must be synthetic.

## Local development

You need Node.js 22 and the pnpm version pinned by this repository. macOS is
the primary platform; Windows and Linux follow.

```bash
pnpm install
pnpm --filter @cocurdex/desktop typecheck
pnpm --filter @cocurdex/desktop test
pnpm --filter @cocurdex/desktop dev
```

The desktop app starts the local daemon. The desktop does not require a Cocurdex
cloud account or `apps/api`.

After changing TypeScript, run typecheck on the touched packages and
`pnpm exec biome check --write` on the changed files.

## Pull requests

- Keep the change focused. Do not mix unrelated refactors or formatting.
- Use [Conventional Commits](https://www.conventionalcommits.org/) in commit
  subjects (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Explain what changed and why.
- Add or update tests for behavior changes.
- If the pull request changes UI, include before and after screenshots.

Opening a pull request does not create an obligation to merge it. Large
drive-by features are likely to be closed.

## Desktop releases

Maintainers ship the macOS app from GitHub Actions
(`.github/workflows/release-macos.yml`). Pushing a `v*.*.*` tag on `main` is
enough; the tag can be created locally.

1. Merge the work into `main` through a pull request. GitHub release notes list
   **merged PRs between the previous tag and this one**. Direct pushes (including
   tagging `dev` without a PR into `main`) produce only a compare link. Do not
   merge an entire integration branch as one PR titled `Dev`. Titles that start
   with `chore:`, `ci:`, `docs:`, or `test:` get `skip-changelog`
   automatically so `.github/release.yml` omits them from notes. Add the label
   yourself only for a user-facing title you still want hidden.
2. Set the version in `apps/desktop/package.json` (not the repo root
   `package.json`). The tag must be `v` plus that version, for example `v0.1.7`.
3. Tag a commit that is already on `main` (it does not have to be `HEAD`) and
   push that tag only. The workflow rejects tags that are not ancestors of
   `origin/main`.

   ```bash
   git checkout main
   git pull
   git tag v0.1.7
   git push origin v0.1.7
   ```

   Creating the tag in the GitHub UI is equivalent. A local tag that is never
   pushed does not start the workflow. Do not `git push --tags`.

The workflow drafts the GitHub release with `--generate-notes`. electron-builder
uploads the Apple Silicon DMG, zip, and `latest-mac.yml` onto that draft.
Notarization is verified, then the workflow publishes the release. Auto-update
clients still read published releases (`build-assets/app-update.yml`), not
drafts. Do not run `pnpm --filter @cocurdex/desktop dist:mac:arm64:release`
locally for a production ship. Production packages are Apple Silicon only.
