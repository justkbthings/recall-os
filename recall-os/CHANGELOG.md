# Changelog

## 1.7.0 — 2026-11-09

- Added a session setup screen for Sequential or Random question order after choosing the practice scope.
- Sequential mode follows numbered question prompts; Random mode shuffles the selected session without changing due dates or ratings.
- Added automatic, timestamped JSON backups to Documents / Recall OS Backups whenever a nonempty library changes.
- Preserved the existing export and import workflow and skipped automatic backup writes for an empty library.

## 1.6.0 — 2026-08-02

- Added the optional Daylight theme for maximum readability when the laptop screen is set to low brightness.
- Introduced near-white pages, white surfaces, dark navy text, stronger borders, and light native controls throughout Daylight mode.
- Kept the existing theme selected during upgrades; Daylight activates only when deliberately chosen in Settings.
- Expanded migration and desktop checks to verify all eight themes, large question libraries, and selected-theme preservation.

## 1.5.0 — 2026-07-26

- Added an optional rich note to every question for supporting context that remains separate from the answer.
- Migrated existing questions with an empty note field without changing prompts, answers, schedules, attempts, or review history.
- Added a dedicated Recall Calendar with day, week, month, and year views.
- Highlighted recall activity dates in gold and added Year → Month → Day drill-down navigation.
- Added a 24-hour day timeline showing the exact question, course, rating, review time, and next review date.
- Preserved older date-only attempts and labels them as “Time not recorded” instead of inventing an hour.
- Added seven locally stored appearance themes while keeping Midnight Slate as the unchanged default.
- Included theme choice and optional notes in portable backups and recovery migrations.
- Expanded desktop verification for note editors, calendar navigation, hourly history, theme availability, and default-theme preservation.

## 1.4.0 — 2026-07-24

- Added fixed-style rich document editors for questions and answers.
- Added bold, italic, underline, lists, and indentation controls.
- Added locally rendered LaTeX equations.
- Added compressed pasted/uploaded pictures that travel with JSON backups.
- Applied Nirmala UI to question editing and question display.
- Added intentional subchapter retake sessions that reschedule reviewed cards.
- Added an optional all-courses challenge containing every question.
- Kept scheduled due-question practice as the default workflow.
- Added a live installed-profile backup utility and rich-content migration tests.

## 1.3.0 — 2026-07-22

- Added required Chapter → Subchapter selection before Daily Practice starts.
- Changed practice ordering to oldest due date, then oldest added date.
- Added live chapter and subchapter mastery progress cards.
- Added prominent per-question attempt counts.
- Added persistent, timestamped review history for future attempts.
- Added a selectable per-question forgetting-curve line graph in Analytics.
- Preserved and migrated existing local questions and attempt totals.

## 1.2.0 — 2026-07-21

- Added editable questions and dynamic course management.
- Added authorship, proprietary licensing, and Windows code signing.
- Added local-storage recovery and desktop migration verification utilities.
- Published the first signed Windows installer.
