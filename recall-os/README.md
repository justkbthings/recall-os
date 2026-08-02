# Recall OS

Recall OS is a private, local-first desktop application for active recall and
spaced repetition. It provides daily due-question sessions, five-level review
scheduling, question and course management, forgetting-curve analytics, dated
study history, an interactive recall calendar, optional supporting notes,
selectable themes, and JSON backup/import.

## Daily Practice and memory tracking

- Select an active course, chapter, and subchapter before beginning a session.
- Review the oldest due memory first within the selected subchapter.
- See live chapter and subchapter mastery progress throughout the session.
- Intentionally retake every question in a selected subchapter; new ratings
  reschedule those questions without disabling future scheduled prompts.
- Optionally run an all-courses challenge across the complete question library.
- Track the total number of attempts on every question.
- Inspect an estimated per-question retention line graph in Analytics. Each
  timestamped review resets the curve and the selected rating controls the next
  decay interval.
- Open Recall Calendar in day, week, month, or year mode. Gold dates mark active
  recall, year cards drill into months, and date cells open a 24-hour timeline.
- Newer reviews show their exact local time and question. Older date-only
  history remains on the correct date and is marked “Time not recorded.”

## Rich question and answer documents

- Questions use a fixed Nirmala UI typeface.
- Answers retain their fixed document style; there is no font selector.
- Every question can include an optional rich note for explanation, context, or
  memory cues. It appears separately from the answer.
- Question, answer, and note editors support bold, italic, underline, bullets,
  numbered lists, and indentation.
- LaTeX equations are rendered locally with KaTeX.
- Uploaded or pasted pictures are compressed, embedded with the question, and
  included in JSON backups.
- Stored rich text is sanitised before display.

Review-history timestamps were introduced in version 1.3.0. Rich documents were
introduced in version 1.4.0. Optional notes and the recall calendar were
introduced in version 1.5.0. The high-contrast Daylight theme was introduced in
version 1.6.0. Existing questions, dates, schedules, review history, attempt
counts, and the currently selected theme are preserved during migration.

## Appearance

Midnight Slate remains the default Recall OS design. Settings includes the
high-contrast Daylight theme for clear reading at low screen brightness, plus
six opt-in dark themes—Dark Note, Ember Study, Nordic Focus, Lavender Night,
Forest Recall, and Rosewood. Every alternative is optional: upgrades preserve
the theme already selected on the device. Theme selection is stored locally
and included in JSON backups.

## Ownership

Copyright © 2026 **Karabo Goodwill Nkambule**. All rights reserved.

Recall OS is proprietary software. Authorised recipients receive personal-use
permission under the terms in [`LICENSE.md`](LICENSE.md); ownership and source
code rights are not transferred.

## Technology

- React and TypeScript
- Tailwind CSS
- Lucide icons
- KaTeX equation rendering
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

Create a private live-profile backup from the latest installed version:

```powershell
npm.cmd run profile:backup
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
