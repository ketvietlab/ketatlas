# Releasing KetAtlas

The npm package name and executable are both **ketatlas**. The package is ESM, includes TypeScript declarations, and ships the CLI, viewer modules, styles, fonts, licenses, schema and templates. Development dependencies, examples, test results and the sibling mobile project are not required at runtime.

## Verify the exact package

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:package
npm run format:check
npm pack --dry-run
```

The package test creates a real archive, invokes its CLI through `npm exec` without a registry lookup, scaffolds a project outside the repository, audits it, and starts its JSON viewer. This catches missing files and accidental reliance on a maintainer checkout.

## Publish

An npm release is an explicit maintainer action. Confirm npm ownership of the unscoped `ketatlas` name and authenticate with an account allowed to publish it. Do not put credentials in repository files.

For interactive publishing, [configure two-factor authentication on your npm account](https://docs.npmjs.com/configuring-two-factor-authentication/) and complete the verification requested during publication. A successful `npm whoami` confirms login but does not guarantee that publishing authentication requirements are met. Keep recovery codes and credentials private.

```sh
npm whoami
npm publish --access public
```

Bump `package.json` and `package-lock.json` together before subsequent releases, record the change in `CHANGELOG.md`, and tag the released commit. A Git push alone does not publish npm. The CI workflow verifies pushes and pull requests; it does not publish automatically.

After publishing, verify the registry distribution outside the checkout:

```sh
npx ketatlas@0.1.0 --version
npx ketatlas@0.1.0 scaffold /tmp/ketatlas-release-check
npx ketatlas@0.1.0 audit /tmp/ketatlas-release-check/atlas.json --strict
npx ketatlas@0.1.0 serve /tmp/ketatlas-release-check/atlas.json
```

Before publication, use `npx --yes --package=github:ketvietlab/ketatlas ketatlas ...` or a local `.tgz` archive. Pin a commit or released version for reproducible team workflows.
