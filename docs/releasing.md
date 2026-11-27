# Releasing KetAtlas

The public `ketvietlab/ketatlas` repository is the source and release home after cutover. The npm package and executable are both `ketatlas`. The open-source snapshot and releases starting with 1.0.0 use MIT. Previously published archives retain their original licenses.

## Prepare the public repository

The GitHub owner must protect `develop` with required pull request review and the CI verification job, and disable force pushes and branch deletion. Configure the `npm-publish` environment with required reviewers and allow deployments only from `develop`. Leave the repository variable `NPM_RELEASE_ENABLED` unset until the source import is complete.

The npm maintainer must add and verify a [Trusted Publisher](https://docs.npmjs.com/trusted-publishers/#for-github-actions) for `ketatlas` with organization `ketvietlab`, repository `ketatlas`, workflow filename `ci.yml`, and environment `npm-publish`. Enable **Allow npm publish** under Allowed actions and confirm it is enabled after saving. A new publisher can stage releases by default, and this workflow uses direct publication. It uses OIDC on a GitHub-hosted runner with Node 24 and needs no npm token. Keep exactly one active publishing authority during the handoff.

The demo is separate. The GitHub and Cloudflare owners must restrict the `demo-production` environment to protected `develop`, configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` there, and confirm project `ketatlas-demo`, production branch `develop`, and routing for `atlas.ketsuite.com`. Set the repository variable `DEMO_DEPLOY_ENABLED` to `true` only after those checks and approval. CI builds the demo even when deployment is disabled.

## Cut over the source

1. Obtain approval for the exact source snapshot. Freeze private releases and validate an independent private backup of Git history, refs, and repository metadata. Confirm rights and attribution for assets and prototype-derived code.
2. Export the reviewed import commit as a plain tracked-file snapshot. Scan the exact export for secrets and review its file list and license provenance. In a checkout with only the public remote, start the import branch from public `develop`, apply the snapshot as a new commit and verify its parent and tree. Keep private branches, tags, and Git history in the private repository. The source import leaves both package files at 0.6.1 to establish the version baseline. The public npm archive of 0.6.1 is unchanged.
3. Open a public import pull request only after authorization. Verify hosted CI, the packed install, and the demo build, then merge through protected `develop` with both deployment variables still unset. Confirm the original public head is an ancestor and the import's `package.json` exists on `develop`. The public source tree supersedes the documentation-only export.
4. Verify the npm environment and Trusted Publisher configuration, including **Allow npm publish**. Once authorized, enable `NPM_RELEASE_ENABLED` and open the separate 1.0.0 release pull request based on the imported source. Merge it only after review and green CI. Approve the protected environment deployment for the verified release commit.
5. Confirm the npm version, `latest` tag, archive integrity and provenance. Repeat the smoke check outside the checkout from the registry archive. When demo deployment is authorized, confirm the production URL serves the intended commit and synthetic examples, and retain the last working deployment for rollback. Archive the private repository only after recovery and cutover checks pass.

If any check fails before publication, pause the cutover and repair or revert through the public pull request process. If npm already accepted a version, preserve its immutability and use an authorized dist-tag correction or a subsequent release.

## Release through develop

Bump the package and lockfile together with `npm version patch --no-git-tag-version` (or `minor` or `major`) and update the changelog and versioned consumer examples.

The [CI workflow](../.github/workflows/ci.yml) verifies branch pushes and pull requests without publishing credentials. The release job runs only in the enabled public repository on `develop`, after verification and the protected environment gate. It checks the stable version increase against the push's previous commit, verifies agreement with the lockfile, and checks npm for duplicates and downgrades. The job reads registry state after entering the release queue so older runs cannot move `latest` backwards.

The job publishes the exact tarball exercised by the packed-install test. It then checks that npm's `latest` points to the expected version, that the registry integrity matches the tarball, and that provenance metadata is present. Review the [npm provenance](https://docs.npmjs.com/generating-provenance-statements/) link for the public repository, workflow, and release commit before declaring cutover complete.

## Verify locally

```sh
npm ci
npx playwright install chromium
npm run format:check
npm run check
npm run test:package
npm run build:demo
```

The pack test builds minified CLI and browser assets, checks the archive excludes implementation source and source maps, and installs it offline into an isolated directory. It exercises the executable, scaffolding, audit, and viewer. The demo includes compiled browser assets, licenses, and synthetic examples.

## Retry a failed release

If the workflow configuration is unchanged, rerun the failed workflow. If npm already accepted that version, the workflow downloads the tested archive and verifies the latest tag, integrity, and provenance without publishing again. After a workflow fix, request a fresh verification using the previous commit SHA from the original release push:

```sh
gh workflow run ci.yml --repo ketvietlab/ketatlas --ref develop -f before_sha=<original-40-character-before-sha>
```

The supplied SHA must be an ancestor of the checked-out release with a lower package version. If the verification keeps failing, inspect the registry and the tested archive. Correct published contents in a new version.

For the first public release, run the installed CLI outside the source checkout after 1.0.0 is visible:

```sh
npx --yes ketatlas@1.0.0 --version
npx --yes ketatlas@1.0.0 scaffold ./ketatlas-release-check
npx --yes ketatlas@1.0.0 audit ./ketatlas-release-check --strict
npx --yes ketatlas@1.0.0 serve ./ketatlas-release-check
```
