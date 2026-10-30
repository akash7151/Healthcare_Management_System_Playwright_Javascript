const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function todayInClinic() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function weekday(isoDate) {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(new Date(`${isoDate}T12:00:00+05:30`));
  return WEEKDAY[label];
}

/**
 * A future Monday–Friday clinic date. Seed doctors work those days only.
 * @param {number} offset extra days past the two-week buffer
 */
function futureWeekday(offset) {
  let iso = addDays(todayInClinic(), 14 + offset);
  while (weekday(iso) === 0 || weekday(iso) === 6) {
    iso = addDays(iso, 1);
  }
  return iso;
}

module.exports = { futureWeekday };
