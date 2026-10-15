# Spec Delta

## Purpose

Keeps the household's freezer and cellar stock in the app, current through Claude, and visible on David's phone.

## ADDED Requirements

### Requirement: Stock sections

The app SHALL keep exactly two stock lists, `freezer` and `cellar`. Each list is an ordered list of items, each a non-empty line of at most 80 characters, at most 100 items per list, and carries the time it was last replaced. A list that has never been saved MUST read as empty with no update time.

#### Scenario: Never saved

- **WHEN** the stock is read before any save
- **THEN** both lists are empty and neither has an update time

### Requirement: Replace a section

`update_stock(section, items)` SHALL replace one section's whole list and set its update time to now, leaving the other section unchanged. Items MUST be trimmed, blank items dropped, and exact duplicates (ignoring case) removed, keeping the first. An unknown section, an item over 80 characters or more than 100 items MUST be rejected as a tool error, changing nothing. An empty list is allowed and means the section is empty.

#### Scenario: Replace the freezer

- **WHEN** `update_stock("freezer", ["Salmon", " mince ", "salmon", ""])` is called
- **THEN** the freezer list is `["Salmon", "mince"]` with the update time of the call, and the cellar list is unchanged

#### Scenario: Invalid section

- **WHEN** `update_stock("fridge", ["milk"])` is called
- **THEN** the call fails with a tool error naming the allowed sections, and nothing is stored

### Requirement: Stock history kept

Every successful `update_stock` SHALL be kept, so the earlier lists remain in the database. Only the latest list of each section is returned by the tools and shown in the viewer.

#### Scenario: Earlier list kept

- **WHEN** the freezer is replaced twice
- **THEN** the database still holds the first list, and `get_stock` returns the second

### Requirement: Read the stock

`get_stock` SHALL return both sections, each with its items, its update time (or null), and its age in whole days in the household timezone (or null).

#### Scenario: Age in days

- **WHEN** the freezer was last replaced on 2026-10-01 and `get_stock` is called on 2026-10-15
- **THEN** the freezer's age is 14 days

### Requirement: Stock page

The viewer SHALL show the stock read-only at `/stock`, behind the same login as the other viewer pages: Freezer first, then Cellar, each with its items and "updated N days ago" ("updated today", or "never updated"). A section older than 14 days or never updated MUST show a warning pill. The header SHALL have an icon button that opens `/stock` and is marked as the current page there.

#### Scenario: Stale section

- **WHEN** `/stock` is opened and the cellar was last replaced 20 days ago
- **THEN** the cellar shows "updated 20 days ago" with a warning pill, and the freezer, replaced yesterday, shows no pill

#### Scenario: Header button

- **WHEN** any viewer page is opened
- **THEN** the header has a stock icon button linking to `/stock`

### Requirement: Stock offline

The stock page SHALL be available offline like the week pages: fetched fresh when online, otherwise the copy last saved on the phone.

#### Scenario: No signal

- **WHEN** `/stock` was opened once online and is opened again with the network off
- **THEN** the saved copy is shown
