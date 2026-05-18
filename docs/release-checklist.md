# Release Checklist

This document is for maintainers preparing a public GitHub and npm release.

## Required Accounts

- GitHub account with permission to create or push to the target repository.
- npm account with permission to publish the `gatewaycheck` package name.
- Two-factor authentication configured where required by GitHub or npm.
- Optional but recommended: a confirmed GitHub repository URL before final npm publish, so `package.json` can include `repository`, `bugs`, and `homepage` metadata.

## GitHub Authentication

Recommended options:

1. GitHub CLI login:

   ```bash
   gh auth login
   gh repo create gatewaycheck --public --source . --remote origin --push
   ```

2. Existing repository over SSH:

   ```bash
   git remote add origin git@github.com:<owner>/gatewaycheck.git
   git push -u origin main
   ```

3. Existing repository over HTTPS with a token:
   - Use a fine-grained personal access token with access to the selected repository.
   - Required repository permissions typically include `Contents: Read and write`.
   - Do not commit the token or store it in project files.

## npm Authentication

Recommended local publish:

```bash
npm login
npm whoami
npm publish
```

`gatewaycheck` is currently an unscoped package, so the normal publish command is enough. If the package is later renamed to a scoped package such as `@owner/gatewaycheck`, publish it publicly with `npm publish --access public`.

If publishing from CI:

- Prefer npm Trusted Publishing if available for the repository.
- Trusted Publishing requires package metadata to point at the matching GitHub repository. Set `repository.url` before enabling it.
- Trusted Publishing currently requires npm CLI 11.5.1+ and Node.js 22.14.0+ in the publish workflow.
- Otherwise use a granular npm access token scoped to this package.
- The token must allow package publishing.
- If package/account 2FA blocks automated publishing, npm supports granular tokens with bypass-2FA enabled for write actions.
- Store CI tokens only as GitHub Actions secrets, never in `.npmrc` committed to the repo.

## Pre-Publish Checks

Run:

```bash
npm test
npm run doctor
npm pack --dry-run
node packages/cli/bin/gatewaycheck.mjs help
```

Check:

- Package name is `gatewaycheck`.
- Local folder is either an initialized git repository or a clone of the target repository before pushing.
- `LICENSE` is included.
- `README.md` and `README.zh-CN.md` are current.
- `examples/` contains only redacted examples.
- `package.json` has the final repository metadata after the GitHub repo is chosen.
- `.local`, `.env`, `reports/`, and npm cache files are not included in the package.
- No real API keys, bearer tokens, cookies, or private gateway reports are committed.

## Secrets Policy

Do not paste npm tokens, GitHub tokens, API keys, cookies, or private keys into chat, issues, docs, or source files.

If a secret is exposed, revoke or rotate it immediately.

## Official References

- npm: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/
- npm access tokens: https://docs.npmjs.com/creating-and-viewing-access-tokens
- npm Trusted Publishing: https://docs.npmjs.com/trusted-publishers
- GitHub CLI auth: https://cli.github.com/manual/gh_auth_login
- GitHub CLI repo create: https://cli.github.com/manual/gh_repo_create
- GitHub personal access tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
