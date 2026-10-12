# Proposal

## Why

Lisa's plans arrive as WhatsApp images. Route 1 already works with no server code: David shares the image into the Claude app, and Claude transcribes it and calls `save_week_plan(source="Lisa")`. But the original image is lost, and David has to be in a Claude chat at that moment. Route 2 lets David park the image from his phone in seconds and see Lisa's original in the viewer. Transcription stays route 1: David shares the same image into Claude, which is easy from the phone. **Decided 2026-10-12 (David): split.** Having Claude read the stored image through an MCP tool is unproven in claude.ai, so it moves to a later change with its own spike gate; the upload and the viewer don't depend on it.

## What Changes

- `/upload` (behind the viewer login): pick a week (defaulting to the next unplanned Monday) and an image from the camera roll, then save. Uploaded images have location and other metadata stripped and are downscaled.
- An `image` record attached to a week. Uploading to a week with no plan creates it as `image_only` (source "Lisa").
- In the viewer:
  - `image_only` weeks show the image full width, with tap to zoom.
  - Weeks with both data and an image show the data, with the image under a "Lisa's original" disclosure.
  - The empty-week state gains an "Upload Lisa's plan" link.
- `get_planning_context` already flags `image_only` weeks, so Claude asks for the image to be shared when planning.
- Transcribing (`save_week_plan`) keeps the image attached and changes the status to "data".

## Non-goals

- OCR on the server. Claude does the transcription.
- More than one image per week (a new upload replaces the old one, and the replacement is recorded in history).
- Upload access for Lisa.
- Returning the stored image to Claude through MCP (`get_week_plan` image content) and its spike. Deferred to a follow-up change.

## Capabilities

### New Capabilities

- `plan-images`: uploading, storing and showing original plan images.

### Modified Capabilities

None formally. The image behaviours that touch the viewer and the MCP tools are specified in `plan-images` as additions, leaving the existing `week-viewer` and `planning-mcp` requirements unchanged.

## Impact

- New dependencies: `sharp` (strip metadata, downscale, normalise to JPEG; prebuilt linux-arm64) and `multer` (multipart upload).
- New `image` table, plus image files under `/data/images/` (same volume as the database).
- Depends on `add-week-viewer` (login, pages). No MCP tool changes.
