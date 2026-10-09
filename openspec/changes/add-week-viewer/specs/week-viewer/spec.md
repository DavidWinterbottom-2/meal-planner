# Spec Delta

## Purpose

A phone-first, read-only web view of the weekly meal plans. It opens on the current week and moves between weeks with one tap or a swipe, so the plan is always one home-screen tap away.

## ADDED Requirements

### Requirement: Current week at the root

`/` SHALL show the week containing today in Europe/Zurich (Monday–Sunday; Sunday belongs to the ending week). It shows that week directly, without redirecting to a dated URL.

#### Scenario: Opened on a Thursday

- **WHEN** `/` is opened on Thursday 2026-10-15
- **THEN** the week of 2026-10-12 is shown

#### Scenario: Opened on a Sunday

- **WHEN** `/` is opened on Sunday 2026-10-18
- **THEN** the week of 2026-10-12 is shown

### Requirement: Any week by URL

`/week/YYYY-MM-DD` SHALL show the week starting on that Monday. A valid date that isn't a Monday MUST redirect to that date's Monday, and an invalid date MUST return 404.

#### Scenario: Non-Monday date

- **WHEN** `/week/2026-10-15` is opened
- **THEN** the browser is redirected to `/week/2026-10-12`

#### Scenario: Invalid date

- **WHEN** `/week/2026-13-40` is opened
- **THEN** a 404 page is shown

### Requirement: Week heading and relative badge

The page SHALL show a heading with the week's date range (for example "Mon 12 – Sun 18 Oct") and a badge relative to today: "This week", "Next week", "Last week", "In N weeks" or "N weeks ago".

#### Scenario: Two weeks ago

- **WHEN** the week of 2026-09-28 is viewed on 2026-10-15
- **THEN** the badge reads "2 weeks ago"

### Requirement: Week navigation

The page SHALL provide Prev, This week and Next controls that link to the adjacent weeks and the current week. A horizontal swipe MUST navigate: swiping left goes to the next week, swiping right to the previous week. Vertical scrolling MUST NOT trigger navigation.

#### Scenario: Swipe left

- **WHEN** the user swipes left on the week of 2026-10-12
- **THEN** the week of 2026-10-19 is shown

#### Scenario: Scroll is not a swipe

- **WHEN** the user scrolls vertically with some sideways drift
- **THEN** no navigation happens

### Requirement: Day rows

Each of the 7 days SHALL be shown as one row. Each row shows:

- the weekday and date
- the dinner, visually prominent
- lunch and snacks, smaller
- the day note in italics

A lunch of exactly "Kita" MUST read "Thomas at Kita".

#### Scenario: Kita day

- **WHEN** Monday's lunch is "Kita"
- **THEN** Monday's row shows "Thomas at Kita" in place of a lunch

#### Scenario: Empty day in a planned week

- **WHEN** a day in a planned week has no fields
- **THEN** its row still appears, with the weekday, the date and a dash

### Requirement: Today highlighted

The row for today's date (Europe/Zurich) SHALL be visually highlighted, and only when today falls in the week being viewed.

#### Scenario: Today in view

- **WHEN** the current week is viewed on 2026-10-15
- **THEN** the 2026-10-15 row is highlighted and no other row is

### Requirement: Prep and source

The page SHALL show the week's prep block and notes below the days, and a small label "David's plan" or "Lisa's plan" (or "<source>'s plan") naming the source.

#### Scenario: Lisa's week

- **WHEN** a week with source "Lisa" is viewed
- **THEN** the label reads "Lisa's plan"

### Requirement: Empty week

A week with no plan SHALL show a short message saying nothing is planned, plus a "Plan it in Claude" link. It still shows the heading, badge and navigation.

#### Scenario: Unplanned week

- **WHEN** the week of 2026-11-02 is viewed and has no plan
- **THEN** the empty-week message and the "Plan it in Claude" link are shown, along with the navigation

### Requirement: History list

`/history` SHALL list every stored week, newest first, with its date range, source and dinner summary. Each entry links to `/week/<week_start>`.

#### Scenario: History order

- **WHEN** weeks 2026-10-05 and 2026-10-12 exist
- **THEN** `/history` lists 2026-10-12 before 2026-10-05, each linking to its week

### Requirement: Installable phone app

The site SHALL serve a web app manifest with `display: standalone`, `start_url: /`, a name and icons including a 180px Apple touch icon. Once installed to the home screen, it opens full screen on the current week.

#### Scenario: Manifest served

- **WHEN** `/manifest.webmanifest` is requested
- **THEN** it returns valid JSON with `display` "standalone" and `start_url` "/"

### Requirement: Phone layout and themes

Pages SHALL lay out as a single column with no horizontal scroll at 390px width, and support light and dark mode via the shared winterbottom design-system tokens.

#### Scenario: Narrow screen

- **WHEN** a week page is rendered at 390px wide
- **THEN** there is no horizontal page scroll

### Requirement: Read-only

The viewer SHALL offer no way to create, edit or delete plans.

#### Scenario: No write routes

- **WHEN** any viewer page is inspected
- **THEN** it contains no forms or controls that change plan data

### Requirement: Usage analytics via self-hosted Umami

Viewer pages SHALL include the Umami tracking script only when both `ANALYTICS_SCRIPT_URL` and `ANALYTICS_WEBSITE_ID` are set, as a deferred script with that `src` and `data-website-id`. With either unset, no analytics tag MUST be rendered. No other analytics or third-party tracking tag MAY be included (REPO-STANDARDS §11, HOSTING-SECURITY §H5).

#### Scenario: Both settings present

- **WHEN** `ANALYTICS_SCRIPT_URL` is `https://umami.winterbottom.xyz/script.js` and `ANALYTICS_WEBSITE_ID` is set
- **THEN** every viewer page's `<head>` contains `<script defer src="https://umami.winterbottom.xyz/script.js" data-website-id="…">`

#### Scenario: Half-configured is off

- **WHEN** only one of the two settings is set
- **THEN** no analytics script is rendered

#### Scenario: Off by default

- **WHEN** neither setting is set
- **THEN** no analytics script is rendered, and the page makes no request to any analytics host
