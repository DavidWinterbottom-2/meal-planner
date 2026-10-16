# Spec Delta

## ADDED Requirements

### Requirement: Dish page

Tapping a dinner's picture on a week page SHALL open `/dish/<key>`, behind the viewer login: the picture large, the dinner text, a **New picture** button and a link back to that week. An unknown key, or a dish without a finished picture, MUST be a 404.

#### Scenario: Open a picture

- **WHEN** David taps the picture beside "Fish pie" on the week of 2026-10-12
- **THEN** the dish page shows the Fish pie picture large, a New picture button, and a link back to the week of 2026-10-12

### Requirement: New picture from the viewer

Pressing **New picture** SHALL queue a new picture for that dish and return to the dish page, which then says a new picture is on its way. The request MUST be refused (403) unless it comes from the viewer itself (same-origin). Pressing again while a redo is waiting MUST NOT queue another.

#### Scenario: Queue a redo

- **WHEN** New picture is pressed on the Fish pie page
- **THEN** a redo is queued, and the page says a new picture is on its way

#### Scenario: Cross-site request

- **WHEN** another site posts to `/dish/<key>/redo`
- **THEN** the response is 403, and nothing is queued

## MODIFIED Requirements

### Requirement: Regenerate a picture

A redo, from the viewer or from Claude's `regenerate_dish_image`, SHALL keep the current picture shown until the new one is saved, and SHALL use a seed no earlier picture of that dish used, so the new picture differs. If the redo fails after its retries, the old picture MUST stay. A dish with no finished picture yet is simply queued again.

#### Scenario: Old picture kept while waiting

- **WHEN** Claude calls `regenerate_dish_image` with "Rack of lamb + potatoes + broccoli + sweetcorn" while the desktop is off
- **THEN** the week still shows the old picture, and the new one replaces it once generated

#### Scenario: Different picture

- **WHEN** a dish is redone twice
- **THEN** each of the three generations was requested with a different seed
