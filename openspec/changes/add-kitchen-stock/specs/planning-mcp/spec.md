# Spec Delta

## MODIFIED Requirements

### Requirement: Planning context tool

`get_planning_context(weeks_back=6)` SHALL return one bundle with four parts: the titles of the 3 Flatnotes rule notes (`rule_notes`); the last `weeks_back` weeks with full data, with any `image_only` weeks flagged; the next unplanned Monday; and the kitchen stock (both sections with items, update time and age in days). Its description MUST tell Claude to call it first whenever planning meals; to ask David what was used up or bought when a stock section is older than 14 days or never updated, and call `update_stock` before drafting; to favour freezer items when planning; and, after saving a plan that uses freezer items, to offer to remove them from the freezer list.

#### Scenario: Bundle contents

- **WHEN** `get_planning_context` is called with default arguments
- **THEN** the result contains the 3 rule-note titles, up to 6 prior weeks, the next unplanned Monday and the stock with each section's age

#### Scenario: Description instructs Claude

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to call it first whenever planning meals, to refresh stock older than 14 days by asking David, to favour freezer items, and to offer to update the freezer list after saving

### Requirement: Claude reads the rules from Flatnotes

The app SHALL NOT call Flatnotes or hold Flatnotes credentials. The rules live in 3 Flatnotes notes, one per section: household, meal bank, recipes. `get_planning_context` MUST name them (titles configurable, with defaults `Meals - Household`, `Meals - Meal Bank`, `Meals - Recipes`), and its description MUST tell Claude to read every one with its Flatnotes connector before drafting a plan, and to tell David if one can't be read. The stock is not a rule note: it comes from the app.

#### Scenario: Notes named, not read

- **WHEN** `get_planning_context` is called
- **THEN** the result's `rule_notes` maps each of the 3 sections to its note title, no rule content is included, and there is no pantry note

#### Scenario: Description instructs Claude to read the notes

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to read every note in `rule_notes` with the Flatnotes connector before drafting
