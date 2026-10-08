# Spec Delta

## Purpose

Turns a week's plan into a single PNG image that David can share to WhatsApp from his phone, so Lisa gets the plan without needing access to the app.

## ADDED Requirements

### Requirement: Week PNG

`GET /week/YYYY-MM-DD.png` SHALL return `image/png` for a planned week. The image shows a table with the columns Day, Lunch, Snacks, Dinner and Notes, one row per day, under the week heading, with the source label and the prep block. A week with no plan MUST return 404.

#### Scenario: Planned week

- **WHEN** `/week/2026-10-12.png` is requested by a logged-in user
- **THEN** a PNG is returned whose table has 7 day rows for 2026-10-12 to 2026-10-18

#### Scenario: Unplanned week

- **WHEN** the PNG for a week with no plan is requested
- **THEN** the response is 404

### Requirement: Readable on a phone

The PNG SHALL be at least 1080px wide. It MUST wrap long cell text instead of truncating it, and grow in height to fit the content.

#### Scenario: Long dinner

- **WHEN** a dinner is 80 characters long
- **THEN** the full text appears wrapped in its cell, and the image is taller to fit

### Requirement: Kita and snacks in the image

In the image, a lunch of "Kita" SHALL read "Thomas at Kita". The Snacks column MUST combine the morning and afternoon snacks.

#### Scenario: Snack column

- **WHEN** a day has morning snack "Fruit" and afternoon snack "Crackers + cheese"
- **THEN** that row's Snacks cell shows both

### Requirement: Cached until the week changes

A week's PNG SHALL be reused until the week is changed (saved, updated, deleted or undone). After a change, the next request MUST render fresh output.

#### Scenario: Update invalidates

- **WHEN** the PNG for 2026-10-12 has been rendered, and then a dinner in that week is updated
- **THEN** the next PNG request reflects the new dinner

### Requirement: PNG requires login

The PNG route SHALL follow the same viewer authentication as the week pages.

#### Scenario: Anonymous PNG request

- **WHEN** the PNG is requested without a session
- **THEN** the request is redirected to login, and no image is returned

### Requirement: Share action

Each planned week's page SHALL show a Share control. Where the browser supports sharing files, it MUST open the system share sheet with the PNG attached as a file. Otherwise it MUST download the PNG.

#### Scenario: Phone share

- **WHEN** Share is tapped on a phone browser that supports file sharing
- **THEN** the share sheet opens with the week's PNG attached

#### Scenario: Fallback

- **WHEN** Share is tapped where file sharing is unsupported
- **THEN** the PNG is downloaded with the file name `meals-2026-10-12.png`

#### Scenario: No share on empty week

- **WHEN** an unplanned week is viewed
- **THEN** no Share control is shown
