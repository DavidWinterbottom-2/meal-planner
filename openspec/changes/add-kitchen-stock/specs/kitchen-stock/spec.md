# Spec Delta

## Purpose

Keeps the household's stock note (what's in the freezer and the cellar) in the app, written by Claude and visible on David's phone with when it was last updated.

## ADDED Requirements

### Requirement: Stock note

The app SHALL keep one stock note: free text of at most 4000 characters, and the time it was last saved. Before the first save, the note MUST read as empty with no update time.

#### Scenario: Never saved

- **WHEN** the stock is read before any save
- **THEN** the text is empty and the update time is null

### Requirement: Replace the stock note

`update_stock(text)` SHALL replace the whole note and set its update time to now. Text over 4000 characters MUST be rejected as a tool error, changing nothing.

#### Scenario: Replace

- **WHEN** `update_stock("Freezer: salmon, mince\nCellar: fusilli, rice")` is called
- **THEN** `get_stock` returns that text with the time of the call

#### Scenario: Too long

- **WHEN** `update_stock` is called with 4001 characters
- **THEN** the call fails with a tool error, and the stored note is unchanged

### Requirement: Read the stock note

`get_stock` SHALL return the note's text, its update time (or null), and its age in whole days in the household timezone (or null).

#### Scenario: Age in days

- **WHEN** the note was last saved on 2026-10-01 and `get_stock` is called on 2026-10-15
- **THEN** the age is 14 days

### Requirement: Stock page

The viewer SHALL show the stock note read-only at `/stock`, behind the same login as the other viewer pages, keeping the note's line breaks, with "Last updated <weekday day month> (N days ago)" ("today" or "yesterday" for the most recent days). A note never saved MUST show "Nothing saved yet". The header SHALL have an icon button that opens `/stock` and is marked as the current page there.

#### Scenario: Last updated shown

- **WHEN** `/stock` is opened on 2026-10-15 and the note was saved on 2026-10-12
- **THEN** the page shows the note's text and "Last updated Mon 12 Oct (3 days ago)"

#### Scenario: Header button

- **WHEN** any viewer page is opened
- **THEN** the header has a stock icon button linking to `/stock`

### Requirement: Stock page offline

The stock page SHALL be available offline like the week pages: fetched fresh when online, otherwise the copy last saved on the phone.

#### Scenario: No signal

- **WHEN** `/stock` was opened once online and is opened again with the network off
- **THEN** the saved copy is shown
