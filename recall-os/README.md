# Recall OS

Recall OS is a private, local-first desktop application for active recall and
spaced repetition. It provides daily due-question sessions, five-level review
scheduling, question and course management, forgetting-curve analytics, dated
study history, and JSON backup/import.

## Ownership

Copyright © 2026 **Karabo Goodwill Nkambule**. All rights reserved.

Recall OS is proprietary software. Authorised recipients receive personal-use
permission under the terms in [`LICENSE.md`](LICENSE.md); ownership and source
code rights are not transferred.

## Technology

- React and TypeScript
- Tailwind CSS
- Lucide icons
- Electron desktop shell
- Browser localStorage persisted under `%APPDATA%\Recall OS`
- Electron Squirrel Windows installer

## Development

```powershell
npm.cmd install
npm.cmd run dev
```

Production checks:

```powershell
npm.cmd run lint
npm.cmd run build
```

## Building the signed Windows release

The release builder expects the Recall OS code-signing certificate identified in
[`signing/signing-config.json`](signing/signing-config.json) to exist with its
private key in the current Windows user's `My` certificate store.

```powershell
npm.cmd run desktop:make
```

The build signs the packaged `RecallOS.exe`, creates the Squirrel installer,
signs `Recall-OS-Setup.exe`, timestamps both signatures, and copies the public
certificate beside the installer. Generated releases are excluded from Git.

## Trusting a self-signed release

The public certificate and its verified thumbprint are documented in
[`signing/README.md`](signing/README.md). A recipient must verify the thumbprint
and explicitly trust that public certificate before Windows can validate the
self-signed publisher chain.

The public `.cer` file is safe to distribute. Never commit or share a `.pfx`,
private key, certificate password, authentication token, local study database,
or recovery snapshot.

