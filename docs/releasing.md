# Releasing KetAtlas

The npm package and executable are both **ketatlas**. Releases come from `develop` and use the stable `latest` distribution tag.

## One-time setup

Add a GitHub Actions repository secret named **NPM_PUBLISH_TOKEN** in **Settings → Secrets and variables → Actions**. Use an npm granular access token with package **Read and write** permissions for `ketatlas` and **Bypass two-factor authentication** enabled. Keep its expiry current. The local `.env.local` file is ignored by Git and is never loaded by CI.

Only the publish step receives the token. Pull requests, verification, and registry checks do not receive it. The publish job also requests an OIDC identity to attach npm provenance; publishing authentication uses the repository secret. See [GitHub's npm publishing guide](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages).

## Release through develop

On your feature branch, bump the package and lockfile together:

```sh
npm version patch --no-git-tag-version
```

Use `minor` or `major` when appropriate. Move the relevant changelog entries under the new version, commit both version files with the changes, and merge the pull request into `develop`.

The [CI workflow](../.github/workflows/ci.yml) runs on pull requests and branch pushes. Automatic publishing runs on pushes to `develop`, including merge commits, squash merges, and direct pushes. An explicit workflow dispatch on `develop` can retry an unpublished release after a workflow fix:

1. Formatting, configuration audits, unit tests, browser tests, and a packed-install test must pass.
2. The version must increase from `package.json` at the push event's previous commit. The lockfile must agree. Automatic releases accept stable `major.minor.patch` versions; prereleases fail with an explanation.
3. The version must be absent from npm and greater than npm's current `latest`. An unchanged or already published version is skipped. Version decreases, registry failures, and mismatched version files fail the job.
4. The publish job downloads and publishes the exact `.tgz` archive that passed the packed-install test, with public access and provenance.
5. CI checks that the version is visible on npm and records the result in the workflow summary.

Publish jobs are queued and run one at a time. The npm check happens after entering the queue, so an older run cannot move `latest` backwards. The first push creating `develop` has no previous commit; it uses the npm comparison instead. Pushing the existing `0.1.0` release therefore skips publication.

## Verify locally

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:package
npm run format:check
npm pack --dry-run
```

The package test creates a real archive, invokes its CLI through `npm exec` without a registry lookup, scaffolds a project outside the repository, audits it, and starts its JSON viewer. This catches missing files and reliance on a maintainer checkout.

## Retry a failed release

For a missing or expired repository secret, fix the secret and rerun the failed workflow. If the workflow itself needed a fix in a later commit, dispatch the updated workflow on `develop` with the **previous commit SHA from the original failed release push**:

```sh
gh workflow run ci.yml --ref develop -f before_sha=<original-40-character-before-sha>
```

The supplied SHA must be an ancestor of the checked-out release commit. The version must still increase from that baseline, all verification runs again, and npm must not already contain that version. This retry uses the same tested archive and provenance path; it does not disable release gates.

If npm already accepted the version, the rerun skips publication. Check npm before changing the version after a timeout: a publish may have succeeded even if the final visibility check failed.

Do not reuse a published version for changed package contents. Bump the version again for the next release. A failed verification must be fixed and all checks rerun before publishing.

After a successful release, verify outside the checkout with the released version:

```sh
npx ketatlas@0.1.1 --version
npx ketatlas@0.1.1 scaffold /tmp/ketatlas-release-check
npx ketatlas@0.1.1 audit /tmp/ketatlas-release-check/atlas.json --strict
npx ketatlas@0.1.1 serve /tmp/ketatlas-release-check/atlas.json
```

## Token maintenance

GitHub Actions secrets do not refresh when a local token changes. Replace the repository secret before the token expires. npm has announced changes to direct publishing with bypass-2FA tokens targeted for January 2027; migrate publishing authentication to [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) before that change takes effect. See the [npm announcement](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/).
