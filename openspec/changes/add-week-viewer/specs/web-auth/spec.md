# Spec Delta

## Purpose

Keeps the family's meal plans and household routine (who is out, and when) private, by requiring a Microsoft Entra login for every viewer page, limited to an allow-list of emails.

## ADDED Requirements

### Requirement: Login required for viewer pages

Every viewer page and asset that shows plan data SHALL require an authenticated session. An unauthenticated request MUST redirect to the Microsoft Entra login and, after a successful login, return to the originally requested URL.

#### Scenario: Not logged in

- **WHEN** `/week/2026-10-12` is requested without a session
- **THEN** the browser is sent to the Entra login, and after login it lands on `/week/2026-10-12`

### Requirement: Email allow-list

After login, the system SHALL grant a session only if the account's email is in `ALLOWED_EMAILS` (case-insensitive). Any other account MUST get a 403 page and no session.

#### Scenario: Unknown account

- **WHEN** a Microsoft account not in `ALLOWED_EMAILS` completes login
- **THEN** a 403 page is shown and no session cookie is set

### Requirement: Long-lived session

A session SHALL last 1 year from last use (sliding). It MUST survive container restarts, and the session cookie MUST be `Secure`, `HttpOnly` and `SameSite=Lax`.

#### Scenario: Restart keeps login

- **WHEN** the container restarts while a session is active
- **THEN** the next page load is served without logging in again

#### Scenario: Idle for over a year

- **WHEN** a session hasn't been used for more than 1 year
- **THEN** the next request goes to the Entra login

### Requirement: Exempt routes

`/health`, `/mcp`, the OAuth endpoints, `/.well-known/*`, `/manifest.webmanifest` and the static icon and stylesheet files SHALL NOT require a viewer session. `/mcp` keeps its own MCP authentication.

#### Scenario: Manifest without login

- **WHEN** `/manifest.webmanifest` is requested without a session
- **THEN** it is returned with status 200

### Requirement: Fail closed on misconfiguration

The app SHALL refuse to start with auth enabled if any Entra setting is missing, if `ALLOWED_EMAILS` is empty, or if the session secret is shorter than 32 characters. Auth may be disabled only through an explicit `AUTH_DISABLED=true` intended for local development.

#### Scenario: Missing secret

- **WHEN** the app starts with `AZURE_CLIENT_SECRET` unset and auth enabled
- **THEN** it exits with an error naming the missing setting

### Requirement: Logout

`/logout` SHALL clear the session and show a signed-out page.

#### Scenario: Logout

- **WHEN** `/logout` is requested
- **THEN** the session cookie is cleared, and the next viewer request goes to login
