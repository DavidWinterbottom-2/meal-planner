# Spec Delta

## Purpose

Keeps Lisa's original plan images alongside the structured weeks. David can upload one from his phone, see it in the viewer, and have Claude read it for transcription.

## ADDED Requirements

### Requirement: Upload page

`/upload` SHALL require the viewer login and offer a week picker plus an image picker that accepts photos from the phone's camera roll. The week picker MUST default to the next unplanned Monday, and only Mondays can be chosen.

#### Scenario: Default week

- **WHEN** `/upload` is opened while 2026-10-19 is the next unplanned Monday
- **THEN** the week picker shows 2026-10-19

### Requirement: Accepted images

An upload SHALL accept JPEG, PNG, HEIC or WebP up to 15 MB. Other types, larger files, or a non-Monday week MUST be rejected with a message, and nothing stored.

#### Scenario: Wrong type

- **WHEN** a PDF is uploaded
- **THEN** the upload is rejected with "unsupported file type", and nothing is stored

### Requirement: Image sanitising

Every stored image SHALL be re-encoded with all metadata (including location) removed and its long edge limited to 2000px. The original file name is kept only as text.

#### Scenario: Location removed

- **WHEN** a JPEG with GPS EXIF data is uploaded
- **THEN** the stored image contains no EXIF location data

### Requirement: Upload creates or attaches

Uploading to a week with no plan SHALL create that week with status "image_only" and source "Lisa". Uploading to a week that already has data MUST attach the image and keep its status. A week holds at most one image: a new upload replaces the previous one. Every upload is recorded in the change history and can be undone.

#### Scenario: New image-only week

- **WHEN** an image is uploaded for unplanned week 2026-10-19
- **THEN** week 2026-10-19 exists with status "image_only", source "Lisa", and the image attached

#### Scenario: Undo an upload

- **WHEN** the most recent change was an upload that created an image-only week, and undo is called
- **THEN** the week and its image attachment are removed

### Requirement: Transcription keeps the image

Saving a plan for a week that has an image SHALL keep the image attached and set the status to "data".

#### Scenario: Claude transcribes

- **WHEN** `save_week_plan` is called for image-only week 2026-10-19
- **THEN** the week has status "data", its days are stored, and the image is still attached

### Requirement: Viewer shows images

An "image_only" week SHALL show its image full width with tap to zoom. A week with data and an image MUST show the data, with the image under a collapsed "Lisa's original" disclosure. Image files MUST require the viewer login.

#### Scenario: Image-only week

- **WHEN** image-only week 2026-10-19 is viewed
- **THEN** the image is shown full width and opens zoomed when tapped

#### Scenario: Data plus original

- **WHEN** a transcribed week with an image is viewed
- **THEN** the day rows are shown, with the image under a collapsed "Lisa's original" disclosure

### Requirement: Upload link on empty weeks

The empty-week state SHALL include an "Upload Lisa's plan" link to `/upload`, with that week preselected.

#### Scenario: Link preselects week

- **WHEN** "Upload Lisa's plan" is tapped on empty week 2026-11-02
- **THEN** `/upload` opens with 2026-11-02 selected

### Requirement: Images returned to Claude

`get_week_plan` SHALL include a week's image as MCP image content (base64, with its MIME type) alongside the week's data, and say in text whether the week is "image_only" and needs transcribing.

#### Scenario: Image-only week via MCP

- **WHEN** Claude calls `get_week_plan("2026-10-19")` for an image-only week
- **THEN** the result contains an image content block and text saying the week needs transcribing
