# meal-plans Specification

## Purpose

Holds the family's weekly meal plans as structured data: one plan per Monday–Sunday week. Every write is recorded so mistakes can be undone.

## Requirements

### Requirement: Weeks are keyed by their Monday

A week SHALL be identified by `week_start`, the ISO date (YYYY-MM-DD) of its Monday. The system MUST reject any `week_start` that is not a valid date or is not a Monday.

#### Scenario: Monday accepted

- **WHEN** a plan is saved with `week_start` 2026-10-12
- **THEN** the plan is stored under week 2026-10-12

#### Scenario: Non-Monday rejected

- **WHEN** a plan is saved with `week_start` 2026-10-13 (a Tuesday)
- **THEN** the save is rejected with an error naming the nearest Monday, and nothing is written

#### Scenario: Malformed date rejected

- **WHEN** a plan is saved with `week_start` "12/10/2026"
- **THEN** the save is rejected with a YYYY-MM-DD format error

### Requirement: Days belong to their week

Each day in a plan SHALL have a `date` inside its week, from `week_start` to `week_start` + 6 days. A plan with a day outside the week, or the same date twice, MUST be rejected as a whole.

#### Scenario: Day outside the week

- **WHEN** a plan for week 2026-10-12 includes a day dated 2026-10-19
- **THEN** the whole save is rejected and the stored week is unchanged

#### Scenario: Partial week allowed

- **WHEN** a plan for week 2026-10-12 contains only Monday to Friday
- **THEN** it is saved, and the missing days read back as empty

### Requirement: Day content

A day SHALL carry optional free-text fields: `morning_snack`, `lunch`, `afternoon_snack`, `dinner` and `note`. Lunch MAY be the literal "Kita". The system MUST NOT fill in "Kita" or any other field automatically.

#### Scenario: Kita stored as written

- **WHEN** Monday's lunch is saved as "Kita"
- **THEN** it reads back as "Kita"

#### Scenario: No auto-fill

- **WHEN** a plan is saved with Monday–Wednesday lunches left empty
- **THEN** those lunches read back as empty

### Requirement: Week metadata

A week SHALL carry `source` (free text, normally "David" or "Lisa"), `status` ("data" or "image_only"), optional `prep` and `notes` (markdown), and `updated_at`. Saving a plan with day data MUST set status to "data".

#### Scenario: Source recorded

- **WHEN** a plan is saved with source "Lisa"
- **THEN** the week reads back with source "Lisa" and status "data"

### Requirement: Saving replaces the week

Saving a plan for a week that already has one SHALL replace that week's metadata and all its days. No warning is given, and the previous version is kept in the change history.

#### Scenario: Overwrite

- **WHEN** week 2026-10-12 exists and a new plan is saved for 2026-10-12
- **THEN** only the new plan's days are stored for that week, and the history holds the old version

### Requirement: Updating a single day

The system SHALL update the given fields of one day, identified by its date, and leave that day's other fields and the rest of the week untouched. Updating a date whose week has no plan MUST fail with an error.

#### Scenario: Change one dinner

- **WHEN** the dinner on 2026-10-15 is updated to "Homemade pizza"
- **THEN** only that day's dinner changes, and the week's `updated_at` advances

#### Scenario: No week to update

- **WHEN** a day is updated in a week that has no plan
- **THEN** an error says the week has no plan, and nothing is written

### Requirement: Week resolution

The system SHALL resolve "current", "next" and "previous" to a `week_start` using today's date in Europe/Zurich: the Monday of this week, one week later, and one week earlier. Sunday belongs to the week that is ending.

#### Scenario: Sunday is still this week

- **WHEN** "current" is resolved on Sunday 2026-10-18 at 20:00 Europe/Zurich
- **THEN** it resolves to 2026-10-12

#### Scenario: Timezone boundary

- **WHEN** "current" is resolved at 2026-10-18T23:30Z, which is already Monday 2026-10-19 01:30 in Zurich
- **THEN** it resolves to 2026-10-19

### Requirement: Next unplanned Monday

The system SHALL report the first Monday, starting from the current week's Monday, that has no stored week.

#### Scenario: Gap after planned weeks

- **WHEN** weeks 2026-10-05 and 2026-10-12 exist and today is 2026-10-08
- **THEN** the next unplanned Monday is 2026-10-19

### Requirement: Deleting a week

The system SHALL delete a week and its days on request, record the deletion in the history, and report an error if the week does not exist.

#### Scenario: Delete existing week

- **WHEN** week 2026-10-05 is deleted
- **THEN** it no longer appears in any listing, and the history holds its last version

### Requirement: Append-only change history

Every create, replace, day update, delete and undo SHALL be recorded in an append-only history. Each entry holds the affected week, the full week as JSON before and after the change (null when absent), the kind of change and a timestamp. Existing entries MUST never be modified.

#### Scenario: History entry on save

- **WHEN** a new week is saved
- **THEN** a history entry is written with "before" null and "after" holding the saved week

### Requirement: Undo the last change

Undo SHALL restore the week affected by the most recent not-yet-undone change to its "before" state, and record the undo itself in the history. Repeated undos MUST step back through successive earlier changes. An undo MUST never reverse another undo.

#### Scenario: Undo an overwrite

- **WHEN** week 2026-10-12 was replaced and undo is called
- **THEN** the week reads back exactly as before the replacement

#### Scenario: Undo a create

- **WHEN** the most recent change created week 2026-10-19 and undo is called
- **THEN** week 2026-10-19 no longer exists

#### Scenario: Two undos step back twice

- **WHEN** change A and then change B were made, and undo is called twice
- **THEN** the first undo reverses B, the second reverses A, and neither reverses an undo

#### Scenario: Nothing to undo

- **WHEN** every change has already been undone, or there are none
- **THEN** undo reports that there is nothing to undo and writes nothing

### Requirement: Listing weeks

The system SHALL list stored weeks, newest first, optionally filtered by an inclusive `from`/`to` range. Each entry gives `week_start`, source, status and a one-line summary of the week's dinners.

#### Scenario: Dinner summary

- **WHEN** weeks are listed
- **THEN** each entry includes a short summary of that week's dinners in day order, truncated to a fixed length

### Requirement: Seed weeks on first start

On first start with an empty database, the system SHALL seed the two example weeks from the brief (2026-10-05 and 2026-10-12, source "David"). It MUST NOT seed again once any week exists.

#### Scenario: Seed once

- **WHEN** the app starts with an empty database and is then restarted
- **THEN** both weeks exist exactly once, and the seeding is not repeated
