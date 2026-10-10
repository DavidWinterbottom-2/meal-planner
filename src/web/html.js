// Minimal HTML templating: every interpolated value is escaped unless it is
// wrapped with raw(), which only the renderers use for markup they built.

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

class Raw {
  constructor(html) {
    this.html = html;
  }
  toString() {
    return this.html;
  }
}

export const raw = (html) => new Raw(html);

function render(value) {
  if (value instanceof Raw) return value.html;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

// Tagged template: markup`<p>${userText}</p>` escapes userText; returns Raw so
// fragments nest without double-escaping.
export function markup(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Raw(out);
}
