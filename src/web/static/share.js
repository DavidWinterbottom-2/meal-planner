// Share a week as a picture (OpenSpec add-week-png-share). The Share button
// fetches the week's PNG and opens the phone's share sheet with it attached,
// so it can go straight to WhatsApp. Where files can't be shared, the PNG is
// downloaded instead.

// "share" when this browser can share the file, otherwise "download".
export function shareMode(nav, file) {
  return typeof nav?.canShare === "function" &&
    typeof nav.share === "function" &&
    nav.canShare({ files: [file] })
    ? "share"
    : "download";
}

export const shareFileName = (weekStart) => `meals-${weekStart}.png`;

function download(doc, blob, name) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function fetchWeekPng(weekStart, fetchFn = fetch) {
  const res = await fetchFn(`/week/${weekStart}.png`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`week picture: HTTP ${res.status}`);
  return res.blob();
}

// Share or download the week's PNG. `png` is the picture already fetched
// (or on its way): Safari only opens the share sheet straight after a tap,
// so the page fetches it in advance rather than after the tap.
export async function shareWeek(
  weekStart,
  png,
  { nav = navigator, doc = document } = {},
) {
  const blob = await png;
  const name = shareFileName(weekStart);
  const file = new File([blob], name, { type: "image/png" });
  if (shareMode(nav, file) === "share") {
    try {
      await nav.share({ files: [file], title: "Meals" });
    } catch (e) {
      // Closing the share sheet is not an error.
      if (e?.name === "AbortError") return "share";
      // Sharing refused (e.g. the tap no longer counts): download instead.
      if (e?.name !== "NotAllowedError") throw e;
      download(doc, blob, name);
      return "download";
    }
    return "share";
  }
  download(doc, blob, name);
  return "download";
}

if (typeof document !== "undefined") {
  // Fetched once per page view, as the week is stored right now.
  let png = null;
  const button = document.querySelector("[data-share-week]");
  const load = () => {
    png = fetchWeekPng(button.dataset.shareWeek);
    png.catch(() => (png = null));
    return png;
  };
  if (button) load();
  button?.addEventListener("click", () => {
    button.disabled = true;
    shareWeek(button.dataset.shareWeek, png ?? load())
      .catch((err) => {
        console.error(err);
        alert("Couldn't share the week. Try again when you have signal.");
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}
