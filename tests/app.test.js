"use strict";

/*
 * Behavioural tests for the widget itself.
 *
 * They run app.js against tests/fake-dom.js — enough DOM to exercise the
 * startup path, the connect flow and the network edge cases that used to be
 * broken (partial API failure, expired sessions, stale responses, midnight
 * reset). No browser required.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHarness, wait } = require("./fake-dom.js");

const CLIENT_ID = "1234567890-abcd.apps.googleusercontent.com";

function localKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayLabel(date) {
  return new Intl.DateTimeFormat(undefined, { calendar: "gregory", weekday: "long" })
    .format(date)
    .toLocaleUpperCase();
}

function json(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function clickAction(harness, attribute, action) {
  harness.query("#connectBody").dispatch("click", {
    target: { closest: () => ({ dataset: { [attribute]: action } }) },
  });
}

function clickDay(harness, date) {
  harness.query("#weekDays").dispatch("click", {
    target: { closest: () => ({ dataset: { date: localKey(date) } }) },
  });
}

async function connect(harness) {
  harness.query("#calendarLink").dispatch("click", { preventDefault() {} });
  clickAction(harness, "connectAction", "authorize");
  harness.query("#clientIdInput").value = CLIENT_ID;
  clickAction(harness, "connectAction", "save");
  await wait(60);
}

function dayFetch(dayKey) {
  return async (url) => {
    if (url.includes("calendar/v3")) {
      return json({
        items: [
          {
            status: "confirmed",
            summary: "Design review",
            location: "Studio",
            start: { dateTime: `${dayKey}T10:00:00` },
          },
        ],
      });
    }
    return json({});
  };
}

test("starts on today with a seven-day strip", () => {
  const harness = createHarness();
  assert.equal(harness.query("#agendaHeading").textContent, "TODAY");
  assert.match(harness.query("#dayNumber").textContent, /^\d+$/);
  assert.ok(harness.query("#weekday").textContent.length > 2);
  assert.equal(harness.query("#sunStatus").textContent, "LOCATION NEEDED");
});

test("the Google Calendar link starts the connect flow instead of doing nothing", () => {
  const harness = createHarness();
  const dialog = harness.query("#connectDialog");

  harness.query("#calendarLink").dispatch("click", { preventDefault() {} });

  assert.equal(dialog.open, true);
  assert.match(harness.query("#connectBody").innerHTML, /Continue with Google/);
  assert.doesNotMatch(harness.query("#connectBody").innerHTML, /config\.js/);
});

test("without a configured client ID the widget asks for one in-app, then loads the day", async () => {
  const today = new Date();
  const harness = createHarness({ fetch: dayFetch(localKey(today)) });

  harness.query("#calendarLink").dispatch("click", { preventDefault() {} });
  clickAction(harness, "connectAction", "authorize");

  assert.match(harness.query("#connectBody").innerHTML, /id="clientIdInput"/);
  assert.equal(harness.store.size, 0);

  harness.query("#clientIdInput").value = CLIENT_ID;
  clickAction(harness, "connectAction", "save");
  await wait(80);

  assert.equal(harness.store.get("dayline.clientId"), CLIENT_ID);
  assert.ok(harness.calls.includes("initTokenClient"));
  assert.ok(harness.calls.includes("requestAccessToken"));
  assert.equal(harness.query("#connectDialog").open, false);
  assert.ok(harness.calls.some((call) => call.includes("calendar/v3")));
  assert.ok(harness.calls.some((call) => call.includes("tasks/v1")));
  assert.match(harness.content.innerHTML, /Design review/);
  assert.match(harness.content.innerHTML, /Studio/);
});

test("tasks failing does not take the calendar down", async () => {
  const today = new Date();
  const harness = createHarness({
    fetch: async (url) => {
      if (url.includes("calendar/v3")) return dayFetch(localKey(today))(url);
      return json({ error: { message: "Tasks API disabled" } }, 403);
    },
  });

  await connect(harness);

  assert.match(harness.content.innerHTML, /Design review/);
  assert.match(harness.content.innerHTML, /Google refused access to Tasks/);
  assert.match(harness.content.innerHTML, /agenda-warning/);
});

test("an expired session shows a reconnect action", async () => {
  const harness = createHarness({ fetch: async () => json({ error: "invalid_token" }, 401) });

  await connect(harness);

  assert.match(harness.content.innerHTML, /Your Google access expired/);
  assert.match(harness.content.innerHTML, /Reconnect Google Calendar/);
});

test("a slow response for an earlier day cannot overwrite the latest selection", async () => {
  const today = new Date();
  const todayKey = localKey(today);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayKey = localKey(yesterday);

  const harness = createHarness({
    fetch: async (url) => {
      if (!url.includes("calendar/v3")) return json({ items: [] });
      const start = new Date(new URL(url).searchParams.get("timeMin"));
      const key = localKey(start);
      await wait(key === todayKey ? 120 : 10); // The first day is the slow one.
      return json({
        items: [{ status: "confirmed", summary: `${key} event`, start: { dateTime: `${key}T09:00:00` } }],
      });
    },
  });

  await connect(harness);

  clickDay(harness, today);
  clickDay(harness, yesterday);
  await wait(200);

  assert.doesNotMatch(harness.content.innerHTML, new RegExp(`${todayKey} event`));
  assert.match(harness.content.innerHTML, new RegExp(`${yesterdayKey} event`));
});

test("browsing another day survives the minute tick", () => {
  const harness = createHarness();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);

  clickDay(harness, yesterday);
  assert.equal(harness.query("#agendaHeading").textContent, weekdayLabel(yesterday));

  harness.tick();

  assert.equal(harness.query("#agendaHeading").textContent, weekdayLabel(yesterday));
  assert.equal(harness.query("#dayNumber").textContent, String(yesterday.getDate()));
});

test("today keeps the white pill while another day is ringed", () => {
  const harness = createHarness();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  clickDay(harness, yesterday);

  assert.equal(harness.query("#todayButton").hidden, false);
  assert.equal(harness.query("#agendaHeading").textContent, weekdayLabel(yesterday));
});

test("disconnecting clears the session and offers the connect flow again", async () => {
  const today = new Date();
  const harness = createHarness({ fetch: dayFetch(localKey(today)) });

  await connect(harness);
  harness.query("#aboutButton").dispatch("click", {});
  harness.query("#aboutBody").dispatch("click", {
    target: { closest: () => ({ dataset: { aboutAction: "disconnect" } }) },
  });

  assert.equal(harness.query("#aboutDialog").open, false);
  assert.equal(harness.query("#refreshButton").disabled, false);
  assert.equal(harness.content.children.length, 1);

  harness.query("#refreshButton").dispatch("click", {});
  assert.equal(harness.query("#connectDialog").open, true);
});
