(() => {
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    weekday: $("#weekday"), dayNumber: $("#dayNumber"), month: $("#month"), year: $("#year"),
    clock: $("#clock"), weekDays: $("#weekDays"), heading: $("#agendaHeading"),
    calendarLink: $("#calendarLink"), content: $("#agendaContent"), refresh: $("#refreshButton"),
    connect: $("#connectButton"), live: $("#liveMessage"), sunrise: $("#sunriseTime"), sunset: $("#sunsetTime"),
    location: $("#locationButton"), sunStatus: $("#sunStatus"),
  };
  const config = window.DAYLINE_CONFIG || {};
  const state = { selectedDate: new Date(), accessToken: null, tokenExpiresAt: 0, tokenClient: null, connecting: false, location: null };
  const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", timeZone: undefined });
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "long" });
  const dayFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric" });
  const yearFormatter = new Intl.DateTimeFormat(undefined, { year: "numeric" });
  const smallDayFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric" });

  function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  }

  function normalizeDegrees(value) {
    return ((value % 360) + 360) % 360;
  }

  function localSolarTime(date, latitude, longitude, sunrise) {
    const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86400000);
    const longitudeHour = longitude / 15;
    const approximate = dayOfYear + ((sunrise ? 6 : 18) - longitudeHour) / 24;
    const meanAnomaly = 0.9856 * approximate - 3.289;
    const trueLongitude = normalizeDegrees(meanAnomaly + 1.916 * Math.sin(meanAnomaly * Math.PI / 180) + 0.020 * Math.sin(2 * meanAnomaly * Math.PI / 180) + 282.634);
    let rightAscension = normalizeDegrees(Math.atan(0.91764 * Math.tan(trueLongitude * Math.PI / 180)) * 180 / Math.PI);
    rightAscension += Math.floor(trueLongitude / 90) * 90 - Math.floor(rightAscension / 90) * 90;
    rightAscension /= 15;

    const sinDeclination = 0.39782 * Math.sin(trueLongitude * Math.PI / 180);
    const cosDeclination = Math.cos(Math.asin(sinDeclination));
    const latitudeRadians = latitude * Math.PI / 180;
    const cosineHourAngle = (Math.cos(90.833 * Math.PI / 180) - sinDeclination * Math.sin(latitudeRadians)) / (cosDeclination * Math.cos(latitudeRadians));
    if (cosineHourAngle > 1 || cosineHourAngle < -1) return null;

    let hourAngle = sunrise ? 360 - Math.acos(cosineHourAngle) * 180 / Math.PI : Math.acos(cosineHourAngle) * 180 / Math.PI;
    hourAngle /= 15;
    const localMeanTime = hourAngle + rightAscension - 0.06571 * approximate - 6.622;
    const utcHours = ((localMeanTime - longitudeHour) % 24 + 24) % 24;
    const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return new Date(utcMidnight + utcHours * 60 * 60 * 1000);
  }

  function renderSunTimes() {
    if (!state.location) {
      elements.sunrise.textContent = "--:--";
      elements.sunset.textContent = "--:--";
      return;
    }
    const sunrise = localSolarTime(state.selectedDate, state.location.latitude, state.location.longitude, true);
    const sunset = localSolarTime(state.selectedDate, state.location.latitude, state.location.longitude, false);
    elements.sunrise.textContent = sunrise ? formatTime(sunrise) : "NO SUNRISE";
    elements.sunset.textContent = sunset ? formatTime(sunset) : "NO SUNSET";
    elements.sunStatus.textContent = "CALCULATED ON DEVICE";
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      elements.sunStatus.textContent = "LOCATION UNAVAILABLE";
      return;
    }
    elements.location.disabled = true;
    elements.location.textContent = "LOCATING…";
    navigator.geolocation.getCurrentPosition((position) => {
      state.location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      elements.location.disabled = false;
      elements.location.textContent = "REFRESH LOCATION";
      renderSunTimes();
    }, (error) => {
      elements.location.disabled = false;
      elements.location.textContent = "TRY AGAIN";
      elements.sunStatus.textContent = error.code === error.PERMISSION_DENIED ? "ALLOW LOCATION ACCESS" : "LOCATION UNAVAILABLE";
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 15 * 60 * 1000 });
  }

  function renderDate() {
    const selected = state.selectedDate;
    elements.weekday.textContent = dateFormatter.format(selected);
    elements.dayNumber.textContent = dayFormatter.format(selected);
    elements.month.textContent = monthFormatter.format(selected);
    elements.year.textContent = yearFormatter.format(selected);
    elements.clock.textContent = formatTime(new Date());
    renderSunTimes();

    const todayKey = localDateKey(new Date());
    const isToday = localDateKey(selected) === todayKey;
    elements.heading.textContent = isToday ? "TODAY" : dateFormatter.format(selected).toUpperCase();
    elements.calendarLink.href = `https://calendar.google.com/calendar/u/0/r/day/${selected.getFullYear()}/${selected.getMonth() + 1}/${selected.getDate()}`;

    const weekStart = startOfLocalDay(selected);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const chosenKey = localDateKey(selected);
    elements.weekDays.replaceChildren();
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const key = localDateKey(date);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = smallDayFormatter.format(date);
      button.setAttribute("aria-label", dateFormatter.format(date) + ", " + monthFormatter.format(date) + " " + smallDayFormatter.format(date));
      if (key === chosenKey) button.setAttribute("aria-current", "date");
      button.addEventListener("click", () => selectDate(date));
      elements.weekDays.append(button);
    }
  }

  function selectDate(date) {
    state.selectedDate = startOfLocalDay(date);
    renderDate();
    if (state.accessToken && state.tokenExpiresAt > Date.now()) loadAgenda();
    else if (elements.content.querySelector(".status-card")) renderConnectCard();
  }

  function setBusy(busy) {
    elements.refresh.disabled = busy;
    elements.refresh.classList.toggle("spin", busy);
    elements.connect?.toggleAttribute("disabled", busy);
  }

  function renderConnectCard(message = "See today’s Google Calendar events and tasks due today. Dayline reads your calendar only when you ask it to.") {
    elements.content.innerHTML = `
      <section class="connect-card" id="connectCard">
        <h2>Connect your calendar</h2>
        <p>${escapeHTML(message)}</p>
        <button class="action-button" id="connectButton" type="button">Connect Google Calendar <span aria-hidden="true">↗</span></button>
      </section>`;
    elements.connect = $("#connectButton");
    elements.connect.addEventListener("click", connectGoogle);
  }

  function renderLoading() {
    elements.content.innerHTML = `
      <section class="status-card" aria-busy="true">
        <div class="status-title"><div><h2>Connecting to your data…</h2><p>Loading events and tasks for this day.</p></div><span class="status-tag">SYNC</span></div>
      </section>`;
  }

  function renderError(message, reconnect = false) {
    elements.content.innerHTML = `
      <section class="status-card error-card">
        <div class="status-title"><div><h2>Calendar couldn’t load</h2><p>${escapeHTML(message)}</p></div><span class="status-tag">RETRY</span></div>
        <button class="action-button" id="retryButton" type="button">${reconnect ? "Reconnect Google Calendar" : "Try again"}</button>
      </section>`;
    $("#retryButton").addEventListener("click", reconnect ? connectGoogle : loadAgenda);
  }

  function renderEvents(items) {
    if (!items.length) {
      elements.content.innerHTML = `
        <section class="status-card empty-state">
          <span class="empty-mark" aria-hidden="true">—</span>
          <h2>Nothing on the calendar</h2>
          <p>You’re all clear for this day. New events and tasks will show up here.</p>
        </section>`;
      elements.live.textContent = "No events or due tasks for this day.";
      return;
    }

    const rows = items.map((item) => {
      const time = item.allDay ? "ALL DAY" : formatTime(item.date);
      const detail = item.kind === "task" ? "TASK" : (item.location || item.calendar || "EVENT");
      return `<li class="event-item ${item.kind}">
        <span class="event-time">${escapeHTML(time)}</span>
        <div class="event-copy"><p class="event-name">${escapeHTML(item.title)}</p><p class="event-meta">${escapeHTML(detail)}</p></div>
      </li>`;
    }).join("");
    elements.content.innerHTML = `
      <section class="status-card">
        <div class="status-title"><div><h2>${items.length} ${items.length === 1 ? "item" : "items"} for your day</h2><p>From your Google Calendar</p></div><span class="status-tag">LIVE</span></div>
        <ul class="event-list">${rows}</ul>
      </section>`;
    elements.live.textContent = `${items.length} calendar ${items.length === 1 ? "item" : "items"} loaded.`;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function loadGoogleLibrary() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (window.daylineGoogleLibraryPromise) return window.daylineGoogleLibraryPromise;
    window.daylineGoogleLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google sign-in couldn’t load. Check your internet connection and try again."));
      document.head.append(script);
    });
    return window.daylineGoogleLibraryPromise;
  }

  async function connectGoogle() {
    if (!config.googleClientId) {
      renderConnectCard("Add your Google OAuth client ID in config.js, then reload Dayline to connect your calendar.");
      elements.live.textContent = "Google Calendar needs an OAuth client ID. See README.md for setup.";
      return;
    }
    if (state.connecting) return;
    state.connecting = true;
    setBusy(true);
    try {
      await loadGoogleLibrary();
      state.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: config.googleClientId,
        scope: "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/tasks.readonly",
        callback: async (response) => {
          state.connecting = false;
          setBusy(false);
          if (response.error) {
            renderError("Google didn’t grant access. You can retry the connection.", true);
            return;
          }
          state.accessToken = response.access_token;
          state.tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
          await loadAgenda();
        },
        error_callback: (error) => {
          state.connecting = false;
          setBusy(false);
          const text = error.type === "popup_closed" ? "The Google sign-in window was closed before access was granted." : "Google sign-in could not open. Allow pop-ups and try again.";
          renderError(text, true);
        },
      });
      state.tokenClient.requestAccessToken({ prompt: "" });
    } catch (error) {
      state.connecting = false;
      setBusy(false);
      renderError(error.message || "Google sign-in could not be loaded.", true);
    }
  }

  async function googleGet(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${state.accessToken}` } });
    if (response.status === 401) {
      state.accessToken = null;
      throw new Error("Your Google access has expired. Reconnect to continue.");
    }
    if (!response.ok) {
      if (response.status === 403) throw new Error("Google denied calendar access. Check that Calendar API and Tasks API are enabled for this OAuth project.");
      throw new Error(`Google returned an error (${response.status}). Please try again.`);
    }
    return response.json();
  }

  async function listAllPages(url) {
    const results = [];
    let pageToken = "";
    do {
      const separator = url.includes("?") ? "&" : "?";
      const page = await googleGet(url + (pageToken ? `${separator}pageToken=${encodeURIComponent(pageToken)}` : ""));
      results.push(...(page.items || []));
      pageToken = page.nextPageToken || "";
    } while (pageToken);
    return results;
  }

  function taskDateKey(task) {
    return task.due ? task.due.slice(0, 10) : "";
  }

  async function fetchCalendarEvents(date) {
    const start = startOfLocalDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const params = new URLSearchParams({
      timeMin: start.toISOString(), timeMax: end.toISOString(),
      singleEvents: "true", orderBy: "startTime", maxResults: "2500", showDeleted: "false",
    });
    const events = await listAllPages(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`);
    return events.filter((event) => event.status !== "cancelled").map((event) => {
      const startInfo = event.start || {};
      const allDay = Boolean(startInfo.date);
      return {
        kind: "event", title: event.summary || "Untitled event",
        date: new Date(startInfo.dateTime || `${startInfo.date}T00:00:00`),
        allDay, location: event.location || "", calendar: "EVENT",
      };
    });
  }

  async function fetchTasks(date) {
    const taskLists = await listAllPages("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100");
    const dueKey = localDateKey(date);
    const taskPages = await Promise.all(taskLists.map(async (list) => {
      const tasks = await listAllPages(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?maxResults=100&showCompleted=false&showHidden=false`);
      return tasks.filter((task) => task.status !== "completed" && taskDateKey(task) === dueKey).map((task) => ({
        kind: "task", title: task.title || "Untitled task", date: new Date(`${dueKey}T00:00:00`), allDay: true,
        calendar: list.title || "TASK",
      }));
    }));
    return taskPages.flat();
  }

  async function loadAgenda() {
    if (!state.accessToken || state.tokenExpiresAt <= Date.now()) {
      state.accessToken = null;
      renderConnectCard("Your Google access needs a refresh. Connect again to load the calendar for this day.");
      return;
    }
    renderLoading();
    setBusy(true);
    try {
      const [events, tasks] = await Promise.all([fetchCalendarEvents(state.selectedDate), fetchTasks(state.selectedDate)]);
      const items = [...events, ...tasks].sort((left, right) => {
        if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
        return left.date - right.date;
      });
      renderEvents(items);
    } catch (error) {
      renderError(error.message || "Something went wrong while loading this day.", !state.accessToken);
    } finally {
      setBusy(false);
    }
  }

  elements.connect.addEventListener("click", connectGoogle);
  elements.location.addEventListener("click", requestLocation);
  elements.refresh.addEventListener("click", () => {
    if (state.accessToken && state.tokenExpiresAt > Date.now()) loadAgenda();
    else if (state.accessToken) { state.accessToken = null; renderConnectCard("Your Google access expired. Reconnect to refresh this day."); }
    else renderConnectCard("Connect your Google account to refresh this day’s events and tasks.");
  });

  renderDate();
  window.setInterval(() => { elements.clock.textContent = formatTime(new Date()); }, 15000);
  window.setInterval(() => {
    if (localDateKey(state.selectedDate) !== localDateKey(new Date())) {
      state.selectedDate = new Date();
      renderDate();
      if (state.accessToken && state.tokenExpiresAt > Date.now()) loadAgenda();
    }
  }, 60000);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
