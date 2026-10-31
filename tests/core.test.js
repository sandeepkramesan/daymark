"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");

const MINUTE = 60 * 1000;

function assertNear(actual, expectedIso, toleranceMinutes = 3) {
  assert.ok(core.isDate(actual), `expected a valid Date, got ${actual}`);
  const difference = Math.abs(actual.getTime() - Date.parse(expectedIso));
  assert.ok(
    difference <= toleranceMinutes * MINUTE,
    `${actual.toISOString()} is not within ${toleranceMinutes} min of ${expectedIso}`
  );
}

test("localDateKey pads months and days in local time", () => {
  assert.equal(core.localDateKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(core.localDateKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("localDateKey returns an empty string for invalid dates", () => {
  assert.equal(core.localDateKey(new Date("nope")), "");
  assert.equal(core.localDateKey(null), "");
});

test("startOfWeek returns the Sunday of that week", () => {
  const sunday = new Date(2026, 9, 25);
  assert.equal(core.localDateKey(core.startOfWeek(sunday)), "2026-10-25");
  assert.equal(core.localDateKey(core.startOfWeek(new Date(2026, 9, 31))), "2026-10-25");
});

test("addDays keeps local midnight across month and year boundaries", () => {
  assert.equal(core.localDateKey(core.addDays(new Date(2026, 9, 31), 1)), "2026-11-01");
  assert.equal(core.localDateKey(core.addDays(new Date(2026, 11, 31), 1)), "2027-01-01");
  assert.equal(core.localDateKey(core.addDays(new Date(2026, 0, 1), -1)), "2025-12-31");
  const next = core.addDays(new Date(2026, 2, 28), 1);
  assert.equal(next.getHours(), 0);
  assert.equal(next.getMinutes(), 0);
});

test("dayOfYear counts from 1", () => {
  assert.equal(core.dayOfYear(new Date(2026, 0, 1)), 1);
  assert.equal(core.dayOfYear(new Date(2026, 11, 31)), 365);
});

test("sunrise and sunset match published almanac times", () => {
  const day = new Date(2026, 9, 31);

  assertNear(core.localSolarTime(day, 12.97, 77.59, true), "2026-10-31T00:42:54Z");
  assertNear(core.localSolarTime(day, 12.97, 77.59, false), "2026-10-31T12:23:34Z");

  assertNear(core.localSolarTime(day, 51.507, -0.128, true), "2026-10-31T06:51:33Z");
  assertNear(core.localSolarTime(day, 51.507, -0.128, false), "2026-10-31T16:35:54Z");

  assertNear(core.localSolarTime(day, 69.65, 18.96, true), "2026-10-31T07:03:41Z");
  assertNear(core.localSolarTime(day, 69.65, 18.96, false), "2026-10-31T13:49:35Z");

  assertNear(core.localSolarTime(day, -36.85, 174.76, true), "2026-10-31T17:17:41Z");
});

test("polar day and polar night return null instead of a wrong time", () => {
  const midsummer = new Date(2026, 5, 21);
  const midwinter = new Date(2026, 11, 21);
  assert.equal(core.localSolarTime(midsummer, 69.65, 18.96, true), null);
  assert.equal(core.localSolarTime(midsummer, 69.65, 18.96, false), null);
  assert.equal(core.localSolarTime(midwinter, 69.65, 18.96, true), null);
  assert.equal(core.localSolarTime(midwinter, 69.65, 18.96, false), null);
});

test("solar calculations reject out-of-range coordinates", () => {
  const day = new Date(2026, 9, 31);
  assert.equal(core.localSolarTime(day, 120, 0, true), null);
  assert.equal(core.localSolarTime(day, 0, 200, true), null);
  assert.equal(core.localSolarTime(day, Number.NaN, 0, true), null);
});

test("taskDateKey reads the date part of a Google Tasks due stamp", () => {
  assert.equal(core.taskDateKey({ due: "2026-10-31T00:00:00.000Z" }), "2026-10-31");
  assert.equal(core.taskDateKey({ due: "2026-10-31" }), "2026-10-31");
  assert.equal(core.taskDateKey({ title: "No due date" }), "");
  assert.equal(core.taskDateKey(null), "");
});

test("agenda sorting puts all-day items first, then the earliest time", () => {
  const items = [
    { kind: "event", allDay: false, date: new Date(2026, 9, 31, 17, 0) },
    { kind: "task", allDay: true, date: new Date(2026, 9, 31) },
    { kind: "event", allDay: false, date: new Date(2026, 9, 31, 9, 0) },
  ].sort(core.compareAgendaItems);

  assert.equal(items[0].allDay, true);
  assert.equal(items[1].date.getHours(), 9);
  assert.equal(items[2].date.getHours(), 17);
});

test("agenda sorting keeps invalid dates last", () => {
  const items = [
    { allDay: false, date: new Date("nope") },
    { allDay: false, date: new Date(2026, 9, 31, 8, 0) },
  ].sort(core.compareAgendaItems);

  assert.equal(items[0].date.getHours(), 8);
  assert.ok(Number.isNaN(items[1].date.getTime()));
});

test("escapeHTML neutralises markup in event titles and locations", () => {
  assert.equal(core.escapeHTML('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(core.escapeHTML("Tom & Jerry's"), "Tom &amp; Jerry&#39;s");
  assert.equal(core.escapeHTML(null), "");
});

test("normalizeDegrees wraps into 0-360", () => {
  assert.equal(core.normalizeDegrees(-10), 350);
  assert.equal(core.normalizeDegrees(370), 10);
  assert.equal(core.normalizeDegrees(0), 0);
});

test("isDate rejects invalid dates", () => {
  assert.equal(core.isDate(new Date()), true);
  assert.equal(core.isDate(new Date("nope")), false);
  assert.equal(core.isDate(0), false);
});
