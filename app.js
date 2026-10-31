/*
 * Dayline — calendar + tasks widget.
 *
 * Everything runs in the browser: no build step, no server, no analytics.
 * Google access is read-only and the OAuth token is kept in memory only.
 */
(() => {
  "use strict";

  const VERSION = "1.1.0";
  const core = window.DaylineCore;
  const $ = (selector, scope = document) => scope.querySelector(selector);

  const elements = {
    weekday: $("#weekday"),
    dayNumber: $("#dayNumber"),
    month: $("#month"),
    year: $("#year"),
    clock: $("#clock"),
    sunrise: $("#sunriseTime"),
    sunset: $("#sunsetTime"),
    location: $("#locationButton"),
    sunStatus: $("#sunStatus"),
    prevWeek: $("#prevWeek"),
    nextWeek: $("#nextWeek"),
    weekDays: $("#weekDays"),
    heading: $("#agendaHeading"),
    todayButton: $("#todayButton"),
    calendarLink: $("#calendarLink"),
    content: $("#agendaContent"),
    refresh: $("#refreshButton"),
    about: $("#aboutButton"),
    live: $("#liveMessage"),
    welcomeTemplate: $("#welcomeTemplate"),
    connectDialog: $("#connectDialog"),
    connectBody: $("#connectBody"),
    closeConnect: $("#closeConnect"),
    aboutDialog: $("#aboutDialog"),
    aboutBody: $("#aboutBody"),
    closeAbout: $("#closeAbout"),
  };

  if (!core) {
    console.error("Dayline: core.js did not load, so the widget cannot start.");
    return;
  }

  const config = Object.assign(
    { googleClientId: "", timeFormat: "locale", location: null },
    window.DAYLINE_CONFIG && typeof window.DAYLINE_CONFIG === "object" ? window.DAYLINE_CONFIG : {}
  );

  const GOOGLE_SCOPE = [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/tasks.readonly",
  ].join(" ");
  const CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/i;
  const STORAGE_KEY = "dayline.clientId";
  const REQUEST_TIMEOUT_MS = 20000;
  const TASK_LIST_TTL_MS = 10 * 60 * 1000;
  const TICK_MS = 15000;

  const state = {
    selectedDate: core.startOfLocalDay(new Date()),
    todayKey: core.localDateKey(new Date()),
    accessToken: null,
    tokenExpiresAt: 0,
    tokenClient: null,
    connecting: false,
    libraryPromise: null,
    location: readConfiguredLocation(config.location),
    agendaRun: 0,
    agendaController: null,
    taskLists: null,
    taskListsFetchedAt: 0,
    connectView: "intro",
    connectError: "",
  };

  class RequestError extends Error {
    constructor(message, { reconnect = false } = {}) {
      super(message);
      this.name = "RequestError";
      this.reconnect = reconnect;
    }
  }

  /* ------------------------------------------------------------------ *
   * Formatters
   * ------------------------------------------------------------------ */

  const formatters = (() => {
    const gregorian = { calendar: "gregory" };
    const hourCycle =
      config.timeFormat === "24h" ? "h23" : config.timeFormat === "12h" ? "h12" : null;
    const timeOptions = { hour: "2-digit", minute: "2-digit" };
    if (hourCycle) timeOptions.hourCycle = hourCycle;

    return {
      time: new Intl.DateTimeFormat(undefined, timeOptions),
      weekday: new Intl.DateTimeFormat(undefined, { ...gregorian, weekday: "long" }),
      month: new Intl.DateTimeFormat(undefined, { ...gregorian, month: "long" }),
      day: new Intl.DateTimeFormat(undefined, { ...gregorian, day: "numeric" }),
      year: new Intl.DateTimeFormat(undefined, { ...gregorian, year: "numeric" }),
    };
  })();

  function formatTime(date) {
    if (!core.isDate(date)) return "—";
    try {
      return formatters.time.format(date);
    } catch {
      return "—";
    }
  }

  function longDay(date) {
    return `${formatters.weekday.format(date)}, ${formatters.month.format(date)} ${formatters.day.format(date)}`;
  }

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  function isConnected() {
    return Boolean(state.accessToken) && state.tokenExpiresAt > Date.now();
  }

  function isAbort(error) {
    return Boolean(error) && error.name === "AbortError";
  }

  function announce(message) {
    elements.live.textContent = message;
  }

  function readStoredClientId() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeStoredClientId(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Private browsing: the value simply won't persist. */
    }
  }

  function activeClientId() {
    const fromConfig = String(config.googleClientId || "").trim();
    if (fromConfig) return fromConfig;
    return readStoredClientId().trim();
  }

  function readConfiguredLocation(value) {
    if (!value || typeof value !== "object") return null;
    const latitude = Number(value.latitude ?? value.lat);
    const longitude = Number(value.longitude ?? value.lng ?? value.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return { latitude, longitude, source: "config" };
  }

  function parseDateKey(key) {
    const date = new Date(`${key}T00:00:00`);
    return core.isDate(date) ? date : null;
  }

  function calendarUrl(date) {
    return `https://calendar.google.com/calendar/u/0/r/day/${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  /* ------------------------------------------------------------------ *
   * Date header, week strip and sun times
   * ------------------------------------------------------------------ */

  function renderHero() {
    const selected = state.selectedDate;
    elements.weekday.textContent = formatters.weekday.format(selected);
    elements.dayNumber.textContent = formatters.day.format(selected);
    elements.month.textContent = formatters.month.format(selected);
    elements.year.textContent = formatters.year.format(selected);
    elements.clock.textContent = formatTime(new Date());
    renderSunTimes();
  }

  function renderSunTimes() {
    if (!state.location) {
      elements.sunrise.textContent = "--:--";
      elements.sunset.textContent = "--:--";
      elements.sunStatus.textContent = "LOCATION NEEDED";
      return;
    }

    const { latitude, longitude } = state.location;
    const sunrise = core.localSolarTime(state.selectedDate, latitude, longitude, true);
    const sunset = core.localSolarTime(state.selectedDate, latitude, longitude, false);

    elements.sunrise.textContent = sunrise ? formatTime(sunrise) : "—";
    elements.sunset.textContent = sunset ? formatTime(sunset) : "—";
    elements.sunStatus.textContent =
      !sunrise && !sunset ? "POLAR DAY OR NIGHT" : "CALCULATED ON DEVICE";
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      elements.sunStatus.textContent = "LOCATION UNAVAILABLE";
      return;
    }

    elements.location.disabled = true;
    elements.location.textContent = "LOCATING…";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "device",
        };
        elements.location.disabled = false;
        elements.location.textContent = "REFRESH LOCATION";
        renderSunTimes();
        announce("Sunrise and sunset updated for this location.");
      },
      (error) => {
        elements.location.disabled = false;
        elements.location.textContent = "TRY AGAIN";
        elements.sunStatus.textContent =
          error.code === error.PERMISSION_DENIED ? "ALLOW LOCATION ACCESS" : "LOCATION UNAVAILABLE";
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 15 * 60 * 1000 }
    );
  }

  function renderHeading() {
    const isToday = core.localDateKey(state.selectedDate) === state.todayKey;
    elements.heading.textContent = isToday
      ? "TODAY"
      : formatters.weekday.format(state.selectedDate).toLocaleUpperCase();
    elements.todayButton.hidden = isToday;
    elements.todayButton.setAttribute("aria-label", "Go to today");
    elements.calendarLink.href = calendarUrl(state.selectedDate);
    elements.calendarLink.title = isConnected()
      ? "Open this day in Google Calendar"
      : "Connect Google Calendar to open this day";
  }

  function renderWeek() {
    const weekStart = core.startOfWeek(state.selectedDate);
    const selectedKey = core.localDateKey(state.selectedDate);
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 7; index += 1) {
      const date = core.addDays(weekStart, index);
      const key = core.localDateKey(date);
      const button = document.createElement("button");
      const isToday = key === state.todayKey;
      const isSelected = key === selectedKey;

      button.type = "button";
      button.className = "week-day";
      button.dataset.date = key;
      button.textContent = formatters.day.format(date);
      button.setAttribute(
        "aria-label",
        `${longDay(date)}${isToday ? ", today" : ""}${isSelected && !isToday ? ", selected" : ""}`
      );

      if (isToday) {
        button.classList.add("is-today");
        button.setAttribute("aria-current", "date");
      }
      if (isSelected) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      }
      // Roving tabindex keeps the strip to a single tab stop.
      button.tabIndex = isSelected ? 0 : -1;

      fragment.append(button);
    }

    elements.weekDays.replaceChildren(fragment);
  }

  function focusSelectedDay() {
    const key = core.localDateKey(state.selectedDate);
    const button = $(`[data-date="${key}"]`, elements.weekDays);
    button?.focus({ preventScroll: true });
  }

  function selectDate(date, { focusDay = false } = {}) {
    const next = core.startOfLocalDay(date);
    if (core.localDateKey(next) === core.localDateKey(state.selectedDate) && !focusDay) {
      if (isConnected()) loadAgenda();
      return;
    }

    state.selectedDate = next;
    renderHero();
    renderWeek();
    renderHeading();

    if (isConnected()) {
      loadAgenda();
    } else if (!elements.content.querySelector(".connect-card")) {
      renderWelcome();
    }

    announce(`${longDay(next)} selected.`);
    if (focusDay) focusSelectedDay();
  }

  function shiftWeek(days) {
    selectDate(core.addDays(state.selectedDate, days));
  }

  /* ------------------------------------------------------------------ *
   * Agenda rendering
   * ------------------------------------------------------------------ */

  function renderContent(html) {
    const hadFocus = elements.content.contains(document.activeElement);
    elements.content.innerHTML = html;
    if (hadFocus) {
      const target = $("h2, .action-button", elements.content);
      if (target) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    }
  }

  function renderWelcome(message = "") {
    const hadFocus = elements.content.contains(document.activeElement);
    const fragment = elements.welcomeTemplate.content.cloneNode(true);
    if (message) $("[data-message]", fragment).textContent = message;
    elements.content.replaceChildren(fragment);
    if (hadFocus) $("h2", elements.content)?.focus({ preventScroll: true });
  }

  function renderLoading() {
    renderContent(`
      <section class="status-card">
        <div class="status-title"><div><h2 tabindex="-1">Connecting to your data…</h2><p>Loading events and tasks for this day.</p></div><span class="status-tag">SYNC</span></div>
      </section>`);
    announce("Loading this day.");
  }

  function renderError(message, { reconnect = false } = {}) {
    renderContent(`
      <section class="status-card error-card">
        <div class="status-title"><div><h2 tabindex="-1">Calendar couldn’t load</h2><p>${core.escapeHTML(message)}</p></div><span class="status-tag">${reconnect ? "SIGN IN" : "RETRY"}</span></div>
        <button class="action-button" type="button" data-action="${reconnect ? "reconnect" : "retry"}">${reconnect ? "Reconnect Google Calendar" : "Try again"}</button>
      </section>`);
    announce(`Calendar couldn’t load. ${message}`);
  }

  function renderEvents(items, warning = "") {
    const warningMarkup = warning
      ? `<p class="agenda-warning" role="status">${core.escapeHTML(warning)}</p>`
      : "";

    if (!items.length) {
      renderContent(`
        <section class="status-card empty-state">
          <span class="empty-mark" aria-hidden="true">—</span>
          <h2 tabindex="-1">Nothing on the calendar</h2>
          <p>You’re all clear for this day. New events and tasks will show up here.</p>
          ${warningMarkup}
        </section>`);
      announce(`No events or tasks for ${longDay(state.selectedDate)}.${warning ? ` ${warning}` : ""}`);
      return;
    }

    const rows = items
      .map((item) => {
        const time = item.allDay ? "ALL DAY" : formatTime(item.date);
        const base = item.kind === "task" ? "TASK" : item.location || "EVENT";
        const detail = item.startsBeforeDay ? `${base} · FROM EARLIER` : base;
        const timeLabel = item.allDay
          ? "All day"
          : item.startsBeforeDay
            ? `Started earlier, ${time}`
            : time;

        return `<li class="event-item ${item.kind}">
          <span class="event-time" aria-label="${core.escapeHTML(timeLabel)}">${core.escapeHTML(time)}</span>
          <div class="event-copy"><p class="event-name">${core.escapeHTML(item.title)}</p><p class="event-meta">${core.escapeHTML(detail)}</p></div>
        </li>`;
      })
      .join("");

    renderContent(`
      <section class="status-card">
        <div class="status-title"><div><h2 tabindex="-1">${items.length} ${items.length === 1 ? "item" : "items"} for your day</h2><p>From your Google Calendar and Tasks</p></div><span class="status-tag">LIVE</span></div>
        <ul class="event-list">${rows}</ul>
        ${warningMarkup}
      </section>`);

    announce(`${items.length} ${items.length === 1 ? "item" : "items"} for ${longDay(state.selectedDate)}.`);
  }

  /* ------------------------------------------------------------------ *
   * Google Calendar data
   * ------------------------------------------------------------------ */

  async function apiJSON(url, { signal, service = "Calendar" } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    if (signal) signal.addEventListener("abort", forwardAbort, { once: true });

    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${state.accessToken}` },
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error; // A newer request replaced this one.
      if (error.name === "AbortError") {
        throw new RequestError("Google took too long to respond. Check your connection and try again.");
      }
      throw new RequestError("Couldn’t reach Google. Check your connection and try again.");
    } finally {
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", forwardAbort);
    }

    if (response.status === 401) {
      state.accessToken = null;
      state.tokenExpiresAt = 0;
      throw new RequestError("Your Google access expired. Reconnect to continue.", { reconnect: true });
    }
    if (response.status === 403) {
      throw new RequestError(
        `Google refused access to ${service}. Make sure the ${service} API is enabled for this OAuth client.`
      );
    }
    if (response.status === 429) {
      throw new RequestError("Google is rate limiting Dayline. Wait a minute, then refresh.");
    }
    if (!response.ok) {
      throw new RequestError(`Google couldn’t complete that request (${response.status}). Try again in a moment.`);
    }

    try {
      return await response.json();
    } catch {
      throw new RequestError("Google returned an unreadable response. Try again in a moment.");
    }
  }

  async function listAllPages(url, options) {
    const items = [];
    let pageToken = "";
    let guard = 0;

    do {
      const separator = url.includes("?") ? "&" : "?";
      const pageUrl = pageToken ? `${url}${separator}pageToken=${encodeURIComponent(pageToken)}` : url;
      const page = await apiJSON(pageUrl, options);
      items.push(...(Array.isArray(page.items) ? page.items : []));
      pageToken = page.nextPageToken || "";
      guard += 1;
    } while (pageToken && guard < 20);

    return items;
  }

  async function fetchCalendarEvents(date, signal) {
    const start = core.startOfLocalDay(date);
    const end = core.addDays(start, 1);
    const params = new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      showDeleted: "false",
      fields: "nextPageToken,items(status,summary,location,start)",
    });

    const events = await listAllPages(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { signal, service: "Calendar" }
    );

    return events
      .filter((event) => event.status !== "cancelled")
      .map((event) => {
        const startInfo = event.start || {};
        const allDay = Boolean(startInfo.date);
        const raw = allDay ? `${startInfo.date}T00:00:00` : startInfo.dateTime;
        const when = raw ? new Date(raw) : null;
        if (!core.isDate(when)) return null;

        return {
          kind: "event",
          title: event.summary || "Untitled event",
          date: when,
          allDay,
          location: event.location || "",
          startsBeforeDay: !allDay && when < start,
        };
      })
      .filter(Boolean);
  }

  async function getTaskLists(signal) {
    if (state.taskLists && Date.now() - state.taskListsFetchedAt < TASK_LIST_TTL_MS) {
      return state.taskLists;
    }

    const lists = await listAllPages(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100&fields=nextPageToken,items(id,title)",
      { signal, service: "Tasks" }
    );

    state.taskLists = lists;
    state.taskListsFetchedAt = Date.now();
    return lists;
  }

  async function fetchTasks(date, signal) {
    const lists = await getTaskLists(signal);
    const dueKey = core.localDateKey(date);
    const groups = await Promise.all(
      lists.map(async (list) => {
        const tasks = await listAllPages(
          `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?maxResults=100&showCompleted=false&showHidden=false&fields=nextPageToken,items(id,title,status,due)`,
          { signal, service: "Tasks" }
        );

        return tasks
          .filter((task) => task.status !== "completed" && core.taskDateKey(task) === dueKey)
          .map((task) => ({
            kind: "task",
            title: task.title || "Untitled task",
            date: new Date(`${dueKey}T00:00:00`),
            allDay: true,
            startsBeforeDay: false,
          }));
      })
    );

    return groups.flat();
  }

  function describeError(error, service = "calendar") {
    if (error instanceof RequestError) return error.message;
    return `Something went wrong loading ${service} data. Try again in a moment.`;
  }

  async function loadAgenda() {
    if (!isConnected()) {
      setBusy(false);
      renderWelcome("Your Google session ended. Connect again to load this day.");
      return;
    }

    const run = (state.agendaRun += 1);
    state.agendaController?.abort();
    const controller = new AbortController();
    state.agendaController = controller;

    renderLoading();
    setBusy(true);

    try {
      const [eventsResult, tasksResult] = await Promise.allSettled([
        fetchCalendarEvents(state.selectedDate, controller.signal),
        fetchTasks(state.selectedDate, controller.signal),
      ]);

      if (run !== state.agendaRun) return;
      if (eventsResult.status === "rejected") throw eventsResult.reason;
      if (!isConnected()) {
        throw new RequestError("Your Google access expired. Reconnect to continue.", { reconnect: true });
      }

      const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : [];
      let warning = "";
      if (tasksResult.status === "rejected" && !isAbort(tasksResult.reason)) {
        warning = describeError(tasksResult.reason, "tasks");
      }

      const items = [...eventsResult.value, ...tasks].sort(core.compareAgendaItems);
      renderEvents(items, warning);
    } catch (error) {
      if (run !== state.agendaRun || isAbort(error)) return;
      renderError(describeError(error), { reconnect: Boolean(error.reconnect) || !isConnected() });
    } finally {
      if (run === state.agendaRun) {
        state.agendaController = null;
        setBusy(false);
      }
    }
  }

  function setBusy(busy) {
    elements.refresh.disabled = busy;
    elements.refresh.classList.toggle("spin", busy);
    elements.refresh.setAttribute("aria-busy", String(busy));
    elements.content.setAttribute("aria-busy", String(busy));
  }

  /* ------------------------------------------------------------------ *
   * Google sign-in
   * ------------------------------------------------------------------ */

  function loadGoogleLibrary() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (state.libraryPromise) return state.libraryPromise;

    state.libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;

      const fail = (message) => {
        if (settled) return;
        settled = true;
        script.remove();
        state.libraryPromise = null; // Let the next attempt retry cleanly.
        reject(new Error(message));
      };

      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.addEventListener("load", () => {
        if (settled) return;
        if (window.google?.accounts?.oauth2) {
          settled = true;
          resolve();
        } else {
          fail("Google sign-in loaded but is unavailable. Try again in a moment.");
        }
      });
      script.addEventListener("error", () => {
        fail("Google sign-in couldn’t load. Check your connection and try again.");
      });

      document.head.append(script);
    });

    return state.libraryPromise;
  }

  function openConnectDialog(message = "") {
    state.connectError = message;
    state.connectView = "intro";
    if (!elements.connectDialog.open) elements.connectDialog.showModal();
    renderConnectView();
  }

  function setConnectView(view, error = "") {
    state.connectView = view;
    state.connectError = error;
    renderConnectView();
  }

  function renderConnectView() {
    const error = state.connectError;
    const errorMarkup = error ? `<p class="sheet-error" role="alert">${core.escapeHTML(error)}</p>` : "";

    if (state.connectView === "working") {
      elements.connectBody.innerHTML = `
        <p>Finish signing in with Google in the window that just opened. Dayline will load this day as soon as access is granted.</p>
        <div class="sheet-actions"><button class="button" type="button" data-connect-action="close">Cancel</button></div>`;
    } else if (state.connectView === "setup") {
      const existing = activeClientId();
      elements.connectBody.innerHTML = `
        <p>One-time setup: Dayline needs a Google OAuth client ID from your own Google Cloud project. Paste it here — it is saved in this browser only, so you never have to edit a file.</p>
        <div class="field">
          <label for="clientIdInput">Google OAuth client ID</label>
          <input id="clientIdInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="1234567890-abcd.apps.googleusercontent.com" value="${core.escapeHTML(existing)}" aria-describedby="clientIdHelp" />
          <p class="field-hint" id="clientIdHelp">Create a <strong>Web application</strong> OAuth client in the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer noopener">Google Cloud Console</a> and add this page’s URL under <em>Authorized JavaScript origins</em>. Full steps are in README.md.</p>
        </div>
        <p class="sheet-error" id="clientIdError" role="alert" hidden></p>
        <div class="sheet-actions">
          <button class="button primary" type="button" data-connect-action="save">Save and continue</button>
          <button class="button" type="button" data-connect-action="close">Cancel</button>
        </div>`;
    } else if (state.connectView === "error") {
      elements.connectBody.innerHTML = `
        ${errorMarkup || '<p class="sheet-error" role="alert">Google sign-in could not start.</p>'}
        <div class="sheet-actions">
          <button class="button primary" type="button" data-connect-action="authorize">Try again</button>
          <button class="button" type="button" data-connect-action="setup">Change client ID</button>
        </div>`;
    } else {
      elements.connectBody.innerHTML = `
        <p>Dayline shows the events and tasks for the day you pick. It asks Google for <strong>read-only</strong> access to Calendar and Tasks, and the sign-in token stays in this tab only.</p>
        ${errorMarkup}
        <div class="sheet-actions">
          <button class="button primary" type="button" data-connect-action="authorize">Continue with Google</button>
          <button class="button" type="button" data-connect-action="close">Not now</button>
        </div>
        <p class="fine-print">Nothing is written to your calendar, and no event data is stored on this device.</p>`;
    }

    const focusTarget =
      state.connectView === "setup"
        ? elements.connectBody.querySelector("input")
        : elements.connectBody.querySelector(".button.primary");
    focusTarget?.focus({ preventScroll: true });
  }

  async function authorize() {
    const clientId = activeClientId();

    if (!clientId) {
      setConnectView("setup");
      return;
    }
    if (state.connecting) return;

    state.connecting = true;
    state.connectError = "";
    setConnectView("working");

    try {
      await loadGoogleLibrary();
      state.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPE,
        callback: (response) => {
          state.connecting = false;
          if (response.error) {
            setConnectView("error", "Google didn’t grant access. You can try again.");
            return;
          }
          state.accessToken = response.access_token;
          state.tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          state.taskLists = null;
          if (elements.connectDialog.open) elements.connectDialog.close();
          announce("Google Calendar connected.");
          loadAgenda();
        },
        error_callback: (error) => {
          state.connecting = false;
          const message =
            error?.type === "popup_closed"
              ? "The Google sign-in window was closed before access was granted."
              : "Google sign-in couldn’t open. Allow pop-ups for this site and try again.";
          setConnectView("error", message);
        },
      });
      state.tokenClient.requestAccessToken({ prompt: "" });
    } catch (error) {
      state.connecting = false;
      setConnectView("error", error.message || "Google sign-in could not start.");
    }
  }

  function saveClientId() {
    const input = $("#clientIdInput");
    const value = (input?.value || "").trim();
    const errorNode = $("#clientIdError");

    if (!CLIENT_ID_PATTERN.test(value)) {
      if (errorNode) {
        errorNode.hidden = false;
        errorNode.textContent =
          "That doesn’t look like an OAuth client ID. It should end with .apps.googleusercontent.com.";
      }
      input?.focus();
      return;
    }

    writeStoredClientId(value);
    state.connectError = "";
    authorize();
  }

  function disconnect() {
    if (state.accessToken && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(state.accessToken, () => {});
      } catch {
        /* Revoking is best effort; the token is dropped locally either way. */
      }
    }

    state.accessToken = null;
    state.tokenExpiresAt = 0;
    state.taskLists = null;
    state.agendaRun += 1;
    state.agendaController?.abort();
    state.agendaController = null;
    setBusy(false);
    if (elements.aboutDialog.open) elements.aboutDialog.close();
    renderWelcome("You’re disconnected. Connect again whenever you want to see your calendar.");
    announce("Disconnected from Google Calendar.");
  }

  /* ------------------------------------------------------------------ *
   * About sheet
   * ------------------------------------------------------------------ */

  function renderAbout() {
    const connected = isConnected();
    const access = connected
      ? "Connected, read-only"
      : state.accessToken
        ? "Session expired"
        : "Not connected";
    const locationText = state.location
      ? `${state.location.latitude.toFixed(2)}, ${state.location.longitude.toFixed(2)}`
      : "Not set";

    elements.aboutBody.innerHTML = `
      <dl class="about-rows">
        <div class="about-row"><dt>Google Calendar</dt><dd class="${connected ? "" : "muted"}">${access}</dd></div>
        <div class="about-row"><dt>Location</dt><dd class="${state.location ? "" : "muted"}">${locationText}</dd></div>
      </dl>
      <p>Dayline keeps your Google token in memory only. Events and tasks are read when you open a day and are never written here. Sunrise and sunset are calculated on this device, without sending coordinates anywhere.</p>
      <div class="sheet-actions">
        ${connected ? '<button class="button" type="button" data-about-action="disconnect">Disconnect Google Calendar</button>' : ""}
        <button class="button" type="button" data-about-action="close">Done</button>
      </div>
      <p class="fine-print">Dayline ${VERSION} · a Nothing-inspired calendar widget.</p>`;
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  elements.content.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;

    const action = trigger.dataset.action;
    if (action === "connect" || action === "reconnect") {
      openConnectDialog(
        action === "reconnect" ? "Your Google session ended. Connect again to load this day." : ""
      );
    } else if (action === "retry") {
      if (isConnected()) loadAgenda();
      else openConnectDialog("Connect Google Calendar to load this day.");
    }
  });

  elements.connectBody.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-connect-action]");
    if (!trigger) return;

    const action = trigger.dataset.connectAction;
    if (action === "authorize") authorize();
    else if (action === "save") saveClientId();
    else if (action === "setup") setConnectView("setup");
    else if (action === "close") elements.connectDialog.close();
  });

  elements.aboutBody.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-about-action]");
    if (!trigger) return;
    if (trigger.dataset.aboutAction === "disconnect") disconnect();
    else if (trigger.dataset.aboutAction === "close") elements.aboutDialog.close();
  });

  elements.closeConnect.addEventListener("click", () => elements.connectDialog.close());
  elements.closeAbout.addEventListener("click", () => elements.aboutDialog.close());

  for (const dialog of [elements.connectDialog, elements.aboutDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  elements.connectDialog.addEventListener("close", () => {
    if (state.connectView === "working") state.connecting = false;
  });

  elements.weekDays.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    const date = parseDateKey(button.dataset.date);
    if (date) selectDate(date, { focusDay: true });
  });

  elements.weekDays.addEventListener("keydown", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;

    if (event.key === "Home") {
      event.preventDefault();
      selectDate(core.startOfLocalDay(new Date()), { focusDay: true });
      return;
    }

    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    selectDate(core.addDays(parseDateKey(button.dataset.date) || new Date(), delta), { focusDay: true });
  });

  elements.prevWeek.addEventListener("click", () => shiftWeek(-7));
  elements.nextWeek.addEventListener("click", () => shiftWeek(7));
  elements.todayButton.addEventListener("click", () => {
    selectDate(core.startOfLocalDay(new Date()), { focusDay: true });
  });
  elements.location.addEventListener("click", requestLocation);

  elements.refresh.addEventListener("click", () => {
    if (isConnected()) loadAgenda();
    else openConnectDialog("Connect Google Calendar to load this day.");
  });

  elements.calendarLink.addEventListener("click", (event) => {
    if (isConnected()) return;
    event.preventDefault();
    openConnectDialog("Connect Google Calendar to open days, events and tasks from here.");
  });

  elements.about.addEventListener("click", () => {
    renderAbout();
    elements.aboutDialog.showModal();
    elements.aboutBody.querySelector("button")?.focus({ preventScroll: true });
  });

  /* ------------------------------------------------------------------ *
   * Clock, rollover and startup
   * ------------------------------------------------------------------ */

  function tick() {
    elements.clock.textContent = formatTime(new Date());

    const todayKey = core.localDateKey(new Date());
    if (todayKey === state.todayKey) return;

    const wasShowingPreviousToday = core.localDateKey(state.selectedDate) === state.todayKey;
    state.todayKey = todayKey;

    if (wasShowingPreviousToday) {
      state.selectedDate = core.startOfLocalDay(new Date());
      renderHero();
      renderHeading();
      if (isConnected()) loadAgenda();
      announce(`A new day. ${longDay(state.selectedDate)}.`);
    }
    renderWeek();
  }

  function registerServiceWorker() {
    const localHosts = ["localhost", "127.0.0.1", "[::1]"];
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && !localHosts.includes(location.hostname)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* Offline support is a bonus, not a requirement. */
      });
    });
  }

  function init() {
    if (["h11", "h12"].includes(formatters.time.resolvedOptions().hourCycle)) {
      $(".widget")?.classList.add("uses-12h");
    }

    renderHero();
    renderWeek();
    renderHeading();
    renderWelcome();

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });

    window.setInterval(tick, TICK_MS);
    registerServiceWorker();
  }

  init();
})();
