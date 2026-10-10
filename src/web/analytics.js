// Umami page-view tag (REPO-STANDARDS §11). Off unless BOTH settings are
// present, so a half-configured deployment sends nothing anywhere.

import { escapeHtml } from "./html.js";

export function analyticsTag({ scriptUrl, websiteId } = {}) {
  if (!scriptUrl || !websiteId) return "";
  return `<script defer src="${escapeHtml(scriptUrl)}" data-website-id="${escapeHtml(websiteId)}"></script>`;
}
