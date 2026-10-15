# Spec Delta

## MODIFIED Requirements

### Requirement: Planning context tool

`get_planning_context(weeks_back=6)` SHALL return one bundle with four parts: the titles of the 3 Flatnotes rule notes (`rule_notes`); the last `weeks_back` weeks with full data, with any `image_only` weeks flagged; the next unplanned Monday; and the stock note (text, update time and age in days). Its description MUST tell Claude to call it first whenever planning meals, and that the stock note (what's in the freezer and the cellar) comes from the app and is updated with `update_stock`.

#### Scenario: Bundle contents

- **WHEN** `get_planning_context` is called with default arguments
- **THEN** the result contains the 3 rule-note titles, up to 6 prior weeks, the next unplanned Monday and the stock note

#### Scenario: Description instructs Claude

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to call it first whenever planning meals, and that the stock note is updated with `update_stock`

### Requirement: Claude reads the rules from Flatnotes

The app SHALL NOT call Flatnotes or hold Flatnotes credentials. The rules live in 3 Flatnotes notes, one per section: household, meal bank, recipes. `get_planning_context` MUST name them (titles configurable, with defaults `Meals - Household`, `Meals - Meal Bank`, `Meals - Recipes`), and its description MUST tell Claude to read every one with its Flatnotes connector before drafting a plan, and to tell David if one can't be read. The stock is not a rule note: it comes from the app.

#### Scenario: Notes named, not read

- **WHEN** `get_planning_context` is called
- **THEN** the result's `rule_notes` maps each of the 3 sections to its note title, no rule content is included, and there is no pantry note

#### Scenario: Description instructs Claude to read the notes

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to read every note in `rule_notes` with the Flatnotes connector before drafting
