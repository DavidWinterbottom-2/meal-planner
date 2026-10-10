# planning-mcp Specification

## Purpose

The MCP interface Claude uses in claude.ai to plan meals: load the planning context, then save, edit, read and undo weekly plans, behind authentication that claude.ai custom connectors support.

## Requirements

### Requirement: MCP endpoint

The system SHALL serve an MCP server over StreamableHTTP at `/mcp` and a `/health` endpoint that needs no authentication.

#### Scenario: Health

- **WHEN** `GET /health` is requested without credentials
- **THEN** it returns 200

### Requirement: MCP authentication

`/mcp` SHALL require either a valid `x-api-key` header or an OAuth bearer token issued by the vendored shared OAuth2 authorization server. Unauthenticated requests MUST get 401 with a `WWW-Authenticate` header that points to the protected-resource metadata.

#### Scenario: No credentials

- **WHEN** `/mcp` is called with no API key and no token
- **THEN** the response is 401 with `WWW-Authenticate: Bearer resource_metadata=...`

#### Scenario: API key

- **WHEN** `/mcp` is called with the correct `x-api-key`
- **THEN** the request is served

#### Scenario: Consent requires the approval password

- **WHEN** someone submits the OAuth consent form without the configured approval password
- **THEN** no authorization code is issued

### Requirement: Planning context tool

`get_planning_context(weeks_back=6)` SHALL return one bundle with three parts: the titles of the 4 Flatnotes rule notes (`rule_notes`); the last `weeks_back` weeks with full data, with any `image_only` weeks flagged; and the next unplanned Monday. Its description MUST tell Claude to call it first whenever planning meals.

#### Scenario: Bundle contents

- **WHEN** `get_planning_context` is called with default arguments
- **THEN** the result contains the 4 rule-note titles, up to 6 prior weeks, and the next unplanned Monday

#### Scenario: Description instructs Claude

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to call it first whenever planning meals

### Requirement: Claude reads the rules from Flatnotes

The app SHALL NOT call Flatnotes or hold Flatnotes credentials. The rules live in 4 Flatnotes notes, one per section: household, meal bank, recipes, pantry. `get_planning_context` MUST name them (titles configurable, with defaults `Meals - Household`, `Meals - Meal Bank`, `Meals - Recipes`, `Meals - Pantry`), and its description MUST tell Claude to read every one with its Flatnotes connector before drafting a plan, and to tell David if one can't be read.

#### Scenario: Notes named, not read

- **WHEN** `get_planning_context` is called
- **THEN** the result's `rule_notes` maps each section to its note title, and no rule content is included

#### Scenario: Description instructs Claude to read the notes

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to read every note in `rule_notes` with the Flatnotes connector before drafting

### Requirement: Save week plan tool

`save_week_plan(week_start, source, days[], prep?, notes?)` SHALL create or replace a week under the meal-plans rules and return the saved week. Validation errors MUST come back as tool errors that name the problem. A two-week plan is two calls.

#### Scenario: Invalid Monday surfaced

- **WHEN** Claude calls `save_week_plan` with a Tuesday
- **THEN** the tool returns an error naming the nearest Monday

### Requirement: Update day tool

`update_day(date, fields)` SHALL update only the given fields of that day and return the updated day.

#### Scenario: Single field

- **WHEN** `update_day("2026-10-15", {dinner: "Homemade pizza"})` is called
- **THEN** only that dinner changes

### Requirement: Get week plan tool

`get_week_plan(week)` SHALL accept a YYYY-MM-DD Monday or "current", "next" or "previous". It returns the week's metadata and all 7 days, with empty days included. A week with no plan returns a clear "no plan" result, not an error.

#### Scenario: Current week

- **WHEN** `get_week_plan("current")` is called on 2026-10-15
- **THEN** week 2026-10-12 is returned with 7 days

#### Scenario: Unplanned week

- **WHEN** `get_week_plan` is called for a week with no plan
- **THEN** the result says there is no plan for that week

### Requirement: List, delete and undo tools

The MCP server SHALL expose `list_weeks(from?, to?)`, `delete_week(week_start)` and `undo_last_change()`, following the meal-plans listing, deletion and undo rules. `undo_last_change` MUST report which week it restored and to what state.

#### Scenario: Undo reports its effect

- **WHEN** `undo_last_change` is called after a replacement of week 2026-10-12
- **THEN** the result names week 2026-10-12 and says it was restored to its previous version
