# Design

## Context

The brief asked to "test early whether image content returned by an MCP tool reaches Claude in the claude.ai mobile and web apps", and the grill-me session made route 2 conditional on that test. On 2026-10-12 David split it: the upload and the viewer go ahead now, because sharing the image into Claude (route 1) already covers transcription; returning the image through MCP, with the spike, is a later change. The store's history and undo, the viewer and the MCP tools all exist from the earlier changes.

## Goals / Non-Goals

**Goals:**

- Never store the location or other metadata from a family photo.
- Keep images under the same login and the same `/data` volume.

**Non-Goals:** several images per week, server-side OCR, a gallery.

## Decisions

**sharp for sanitising.** Rotate according to EXIF orientation, then strip all metadata, resize so the long edge is at most 2000px, and re-encode as JPEG at quality 85. sharp ships prebuilt linux-arm64 binaries and reads HEIC. iOS usually converts to JPEG on upload anyway. _Alternative:_ strip the JPEG APP1 segment by hand. That doesn't cover HEIC, PNG text chunks or resizing.

**Storage.**

- An `image` table holds `id, week_start, filename, original_name, uploaded_at`; the file lives at `/data/images/<uuid>.jpg`.
- Writing the file and the database row is ordered so that a failed row insert deletes the file.
- History snapshots include the week's image reference, so undo restores or removes the attachment. Image files are never deleted by undo (they're small), which also keeps undo simple. _Trade-off:_ orphan files are possible. A startup sweep removes files no row references that are older than 30 days.

**Upload transport.** `multer` with in-memory storage, a 15 MB limit and a MIME and magic-byte check, followed by sharp. Only the logged-in user can reach it (viewer listener behind the login sidecar, plus a same-origin check on POST).

## Risks / Trade-offs

- [HEIC decoding is unavailable in the sharp build] → iOS converts camera-roll uploads to JPEG for `<input type=file accept="image/*">`. If HEIC still arrives and fails, return a clear error, and check this on the phone.
- [An upload's CSRF exposure] → `SameSite=Lax` cookie plus an `Origin` header check on POST `/upload`.
