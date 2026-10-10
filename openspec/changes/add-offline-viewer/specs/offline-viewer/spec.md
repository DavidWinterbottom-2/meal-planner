# Spec Delta

## Purpose

Keep the meal plan readable on the phone without a connection, using a copy saved when it was last opened online.

## ADDED Requirements

### Requirement: Saved pages offline

A viewer page (the current week, a dated week, history) that was opened online on a phone SHALL be shown from the copy saved on that phone when there is no connection.

#### Scenario: Week opened yesterday, offline today

- **WHEN** the week of 2026-10-12 was opened online, and is opened again with no connection
- **THEN** that week is shown, with all seven days

### Requirement: Fresh when online

When the phone is online, a page SHALL come from the server, and the saved copy SHALL be updated. If the server takes longer than 4 seconds and a saved copy exists, the saved copy SHALL be shown instead.

#### Scenario: Plan changed since last visit

- **WHEN** a day was updated through the MCP since the page was saved, and the page is opened online
- **THEN** the updated day is shown

### Requirement: Offline banner

While the phone has no connection, every viewer page SHALL show a banner saying it is the copy saved on the phone.

#### Scenario: Offline

- **WHEN** a saved week is opened with no connection
- **THEN** the banner "Offline: showing the copy saved on this phone." is shown

### Requirement: Offline fallback page

A viewer page that isn't saved on the phone SHALL show an offline page linking to the current week when there is no connection, not a browser error.

#### Scenario: Never-opened week

- **WHEN** a week never opened on this phone is opened with no connection
- **THEN** the page "You're offline" is shown

### Requirement: Today from the phone's clock

A saved page shown on a later day SHALL mark today and the past days by the current date in Europe/Zurich, not by the day it was saved.

#### Scenario: Saved Thursday, opened Friday

- **WHEN** the current week was saved on Thursday and is opened offline on Friday
- **THEN** Friday is highlighted as today and Monday–Thursday are dimmed

### Requirement: Nothing unsafe saved

Only successful pages from the viewer itself SHALL be saved. A redirect (including the sign-in redirect for an expired session), an error page, a non-GET request and any other site's request SHALL NOT be saved, and the sign-in redirect SHALL reach the browser unchanged.

#### Scenario: Expired session

- **WHEN** a page is opened online with an expired session
- **THEN** the browser is sent to Microsoft sign-in and nothing is saved

### Requirement: Sign-out clears the phone

Signing out SHALL delete every page and file saved on the phone.

#### Scenario: Sign out

- **WHEN** Sign out is tapped
- **THEN** no saved copy remains, and the next visit needs sign-in and the network
