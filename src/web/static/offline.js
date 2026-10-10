// Offline support in the page: registers the service worker (sw.js), shows a
// banner while the phone has no connection, and re-marks today and past days
// from the phone's clock, since a page saved yesterday was rendered with
// yesterday's "today".

// Today in Europe/Zurich as YYYY-MM-DD, the same day the server uses.
export function zurichIsoDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
  }).format(date);
}

// How a day row should be marked on `today` (both YYYY-MM-DD).
export function dayState(date, today) {
  return { isToday: date === today, isPast: date < today };
}

function markDays(today) {
  for (const row of document.querySelectorAll(".mp-day[data-date]")) {
    const { isToday, isPast } = dayState(row.dataset.date, today);
    row.classList.toggle("mp-day--today", isToday);
    row.classList.toggle("mp-day--past", isPast);
    if (isToday) row.setAttribute("aria-current", "date");
    else row.removeAttribute("aria-current");
    const pill = row.querySelector(".mp-today-pill");
    if (pill) pill.hidden = !isToday;
  }
}

function showConnection() {
  let banner = document.querySelector(".mp-offline");
  if (navigator.onLine) {
    banner?.remove();
    return;
  }
  if (banner) return;
  banner = document.createElement("p");
  banner.className = "mp-offline";
  banner.setAttribute("role", "status");
  banner.textContent = "Offline: showing the copy saved on this phone.";
  document.querySelector(".mp-main")?.prepend(banner);
}

if (typeof document !== "undefined") {
  markDays(zurichIsoDate(new Date()));
  showConnection();
  window.addEventListener("online", showConnection);
  window.addEventListener("offline", showConnection);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not fatal: the viewer still works online.
    });
  }
}
