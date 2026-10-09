# Proposal

## Why

Lisa's plans arrive as WhatsApp images. Route 1 already works with no server code: David shares the image into the Claude app, and Claude transcribes it and calls `save_week_plan(source="Lisa")`. But the original image is lost, and David has to be in a Claude chat at that moment. Route 2 lets David park the image from his phone in seconds, have it show on the viewer immediately, and let Claude transcribe it at the next planning session. **That only works if images returned by an MCP tool actually reach Claude in claude.ai (web and mobile), which is unproven.** So this change starts with a spike and is abandoned if it fails.

## What Changes

- **Spike (gate):** a temporary, flag-guarded MCP tool that returns a known PNG as MCP image content. Claude must describe it correctly in claude.ai on the web, on iOS and on Android. If any target fails, stop: document "route 1 only" in the README and drop the rest of this change.
- `/upload` (behind the viewer login): pick a week (defaulting to the next unplanned Monday) and an image from the camera roll, then save. Uploaded images have location and other metadata stripped and are downscaled.
- An `image` record attached to a week. Uploading to a week with no plan creates it as `image_only` (source "Lisa").
- In the viewer:
  - `image_only` weeks show the image full width, with tap to zoom.
  - Weeks with both data and an image show the data, with the image under a "Lisa's original" disclosure.
  - The empty-week state gains an "Upload Lisa's plan" link.
- `get_week_plan` returns the week's image as MCP image content alongside any data. `get_planning_context` already flags `image_only` weeks.
- Transcribing (`save_week_plan`) keeps the image attached and changes the status to "data".

## Non-goals

- OCR on the server. Claude does the transcription.
- More than one image per week (a new upload replaces the old one, and the replacement is recorded in history).
- Upload access for Lisa.

## Capabilities

### New Capabilities

- `plan-images`: uploading, storing and showing original plan images, and returning them to Claude.

### Modified Capabilities

None formally. The image behaviours that touch the viewer and the MCP tools are specified in `plan-images` as additions, leaving the existing `week-viewer` and `planning-mcp` requirements unchanged.

## Impact

- New dependencies: `sharp` (strip metadata, downscale, normalise to JPEG; prebuilt linux-arm64) and `multer` (multipart upload).
- New `image` table, plus image files under `/data/images/` (same volume as the database).
- The spike (tasks 1.x) depends only on `deploy-mcp-to-home-docker`, using a fixture PNG, so it can run straight after the MCP server is live and decide early whether this change happens at all. The rest depends on all previous changes being archived.
