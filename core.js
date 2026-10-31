/*
 * Dayline core helpers.
 *
 * Pure date, sun and formatting maths shared by the widget and the test suite.
 * Loaded as a classic script in the browser (window.DaylineCore) and required
 * directly by Node in tests (module.exports).
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DaylineCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MS_PER_DAY = 86400000;

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function isDate(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  /** Local calendar day as `YYYY-MM-DD`. Never use toISOString() for this. */
  function localDateKey(date) {
    if (!isDate(date)) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  /** Add whole days in local time; DST-safe because setDate keeps wall-clock time. */
  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return startOfLocalDay(next);
  }

  /** Sunday-based week start, matching the Sunday–Saturday strip in the UI. */
  function startOfWeek(date) {
    const start = startOfLocalDay(date);
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  function dayOfYear(date) {
    const year = date.getFullYear();
    return Math.floor((Date.UTC(year, date.getMonth(), date.getDate()) - Date.UTC(year, 0, 0)) / MS_PER_DAY);
  }

  /**
   * Sunrise/sunset (NOAA / "sunrise equation") for a local calendar day.
   * Returns the UTC instant of the event, or null during polar day/night.
   */
  function localSolarTime(date, latitude, longitude, isSunrise) {
    if (!isDate(date) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    const doy = dayOfYear(date);
    const longitudeHour = longitude / 15;
    const approximate = doy + ((isSunrise ? 6 : 18) - longitudeHour) / 24;
    const meanAnomaly = 0.9856 * approximate - 3.289;
    const trueLongitude = normalizeDegrees(
      meanAnomaly +
        1.916 * Math.sin(meanAnomaly * Math.PI / 180) +
        0.02 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
        282.634
    );

    let rightAscension = normalizeDegrees(Math.atan(0.91764 * Math.tan(trueLongitude * Math.PI / 180)) * 180 / Math.PI);
    rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
    rightAscension /= 15;

    const sinDeclination = 0.39782 * Math.sin(trueLongitude * Math.PI / 180);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const latitudeRadians = latitude * Math.PI / 180;
    const cosineHourAngle =
      (Math.cos(90.833 * Math.PI / 180) - sinDeclination * Math.sin(latitudeRadians)) /
      (cosDeclination * Math.cos(latitudeRadians));

    if (!Number.isFinite(cosineHourAngle) || cosineHourAngle > 1 || cosineHourAngle < -1) return null;

    const hourAngle = (isSunrise
      ? 360 - Math.acos(cosineHourAngle) * 180 / Math.PI
      : Math.acos(cosineHourAngle) * 180 / Math.PI) / 15;

    const localMeanTime = hourAngle + rightAscension - 0.06571 * approximate - 6.622;
    const utcHours = ((localMeanTime - longitudeHour) % 24 + 24) % 24;
    const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(utcMidnight + utcHours * 60 * 60 * 1000);
  }

  /** Google Tasks returns `due` as UTC midnight for a date; the date part is the due day. */
  function taskDateKey(task) {
    if (!task || typeof task.due !== "string") return "";
    return task.due.slice(0, 10);
  }

  /** All-day items first, then chronological. Invalid dates sort last. */
  function compareAgendaItems(left, right) {
    if (Boolean(left.allDay) !== Boolean(right.allDay)) return left.allDay ? -1 : 1;
    const leftTime = isDate(left.date) ? left.date.getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = isDate(right.date) ? right.date.getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  }

  const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  return {
    addDays,
    compareAgendaItems,
    dayOfYear,
    escapeHTML,
    isDate,
    localDateKey,
    localSolarTime,
    normalizeDegrees,
    startOfLocalDay,
    startOfWeek,
    taskDateKey,
  };
});
