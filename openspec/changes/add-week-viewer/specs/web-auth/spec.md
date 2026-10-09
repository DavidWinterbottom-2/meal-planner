# Spec Delta

## Purpose

Keeps the family's meal plans and household routine (who is out, and when) private, by requiring a Microsoft Entra login for every viewer page, limited to an allow-list of emails.

## ADDED Requirements

### Requirement: Login required for viewer pages

Every viewer page and asset that shows plan data SHALL require a Microsoft Entra login. An unauthenticated request MUST be sent to the Entra login and, after a successful login, return to the originally requested URL.

#### Scenario: Not logged in

- **WHEN** `https://meals.winterbottom.xyz/week/2026-10-12` is requested without a session
- **THEN** the browser is sent to the Entra login, and after login it lands on `/week/2026-10-12`

### Requirement: Email allow-list

After login, access SHALL be granted only if the account's email is on the allow-list (David only). Any other account MUST be refused and given no session.

#### Scenario: Unknown account

- **WHEN** a Microsoft account not on the allow-list completes login
- **THEN** access is refused and no viewer page is shown

### Requirement: Long-lived session

A login SHALL last 1 year. It MUST survive restarts of both the app and the login sidecar, and the session cookie MUST be `Secure`, `HttpOnly` and `SameSite=Lax`.

#### Scenario: Restart keeps login

- **WHEN** the containers restart while a session is active
- **THEN** the next page load is served without logging in again

### Requirement: Viewer reachable only through the login

The app SHALL serve viewer pages only on a listener that is not published to the host and is reachable only by the login sidecar. Viewer pages MUST NOT be reachable through the MCP listener or the `mcp.winterbottom.xyz` host.

#### Scenario: Viewer page via the MCP host

- **WHEN** `https://mcp.winterbottom.xyz/meals/week/2026-10-12` is requested
- **THEN** it is not served (404 or 403), with or without credentials

#### Scenario: MCP via the viewer host

- **WHEN** `https://meals.winterbottom.xyz/mcp` is requested after logging in
- **THEN** it is not served

### Requirement: Installable-app files without login

`/manifest.webmanifest` and the app icons SHALL be served without a login, so the home-screen install works before signing in.

#### Scenario: Manifest without login

- **WHEN** `/manifest.webmanifest` is requested without a session
- **THEN** it is returned with status 200

### Requirement: Logout

A sign-out link SHALL end the session, and the next viewer request MUST go to the login.

#### Scenario: Logout

- **WHEN** the sign-out link is followed
- **THEN** the session cookie is cleared, and the next viewer request goes to login
