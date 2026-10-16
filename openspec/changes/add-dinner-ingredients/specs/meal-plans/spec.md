# Spec Delta

## ADDED Requirements

### Requirement: Dinner ingredients

A day SHALL carry an optional free-text `ingredients` field for that day's dinner, one ingredient per line, of at most 1000 characters. `save_week_plan` and `update_day` MUST accept it like the other day fields, and undo MUST restore it. Snapshots from before the field existed restore with no ingredients. The system MUST NOT fill it in automatically.

#### Scenario: Saved with the plan

- **WHEN** `save_week_plan` saves Monday with dinner "Fish pie" and ingredients "600 g white fish (freezer)\nprawns\npotatoes"
- **THEN** `get_week_plan` returns those ingredients for Monday

#### Scenario: Older snapshot

- **WHEN** a change is undone back to a snapshot written before ingredients existed
- **THEN** the restored days have no ingredients

### Requirement: Ingredients shown in the viewer

On the week page, a day with ingredients SHALL show a collapsed **Ingredients** fold-out under its dinner, listing one ingredient per line (a leading "-" or "•" dropped). A day without ingredients MUST show no fold-out.

#### Scenario: Open the list

- **WHEN** David opens Monday's Ingredients fold-out
- **THEN** he sees "600 g white fish (freezer)", "prawns" and "potatoes" as a list

### Requirement: Claude fills in ingredients

The `get_planning_context` description SHALL tell Claude to fill in `ingredients` for each cooked dinner when saving a plan, from the recipes note, one per line, marking freezer items with "(freezer)", and to leave it empty for dinners out, leftovers and Kita.

#### Scenario: Description

- **WHEN** a client lists the tools
- **THEN** `get_planning_context`'s description says to fill in each cooked dinner's ingredients when saving
