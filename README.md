# Dayline

A Nothing-inspired calendar widget for the web and your home screen: today's date, a live local clock, sunrise and sunset estimated on-device, a Sunday–Saturday strip, and Google Calendar events plus Tasks due on the day you pick.

No build step, no framework, no analytics. Vanilla HTML, CSS and JavaScript.

---

## Put it on your phone

There are three honest routes, depending on whether you want an **app icon** or a **real widget tile**.

### 1. A real home-screen widget — Nothing Essential Apps (Nothing phones)

Nothing's Essential Apps builder turns a written prompt into a native home-screen widget. It has its own Calendar and Location permissions, so it does not need the Google OAuth setup below.

1. Host the page somewhere (see [Host it](#host-it)) or keep it on a computer for reference.
2. On the phone, open the **Essential Apps** builder (Nothing OS; availability and menu names vary by device, OS version and region).
3. Create a widget, attach `logo.svg` (and a screenshot of the page if you have one) as reference images.
4. Paste the prompt from [`ESSENTIAL-APPS-PROMPT.md`](./ESSENTIAL-APPS-PROMPT.md), preview, and deploy.
5. Add Dayline from the Home Screen widget picker and size it from 2×2 to 2×4.

### 2. Install the web app (any Android or iPhone)

This gives you a full-screen app with its own icon, splash colour and offline shell — an icon-sized quick launch, not a native widget tile.

1. Open the hosted URL on the phone.
2. **Android/Chrome:** menu → **Add to Home screen** (or **Install app**).
   **iPhone/Safari:** Share → **Add to Home Screen**.
3. Launch Dayline from the icon. It opens without browser chrome and works offline for the shell.

> HTTPS is required for the service worker, and for Google sign-in. On iOS, a locally served `http://` page will install but never update offline.

### 3. A true Android widget tile without Nothing

Android has no API that lets a plain web page become a home-screen widget. To get a tile you need one of:

- a native wrapper (Kotlin + Jetpack Glance `AppWidget` with a `WebView`, or a native rewrite of this UI), or
- a third-party widget host that can render a URL, or
- the Nothing builder above.

> A WebView wrapper can display this page, but Google refuses OAuth inside plain WebViews, so any sign-in has to go through Custom Tabs or the system browser.

The web app is designed to be that content: it is one screen, it fits 2×2 to 2×4, and it respects `dvh`, container queries and safe-area insets.

---

## Run it locally

Requires Node 18+ (or any static file server).

```bash
npm start          # http://127.0.0.1:4173
npm test           # 23 dependency-free tests
```

Or with Python:

```bash
python -m http.server 4173
```

Keep port **4173** unless you also change the origin in Google Cloud Console.

---

## Connect Google Calendar (one time)

You do **not** need to edit a file. Open the widget and click **Connect Google Calendar** (or the Google Calendar link) — it always starts the connect flow:

1. The widget explains what it reads and asks you to continue.
2. If no OAuth client ID is configured yet, it shows a one-field setup step. Paste the ID there; it is stored in that browser (`localStorage`) and never leaves the device.
3. Google opens its own consent screen. Dayline asks for read-only `calendar.events.readonly` and `tasks.readonly`.
4. The day's events and tasks load. The token lives in memory and is gone when the tab closes.

You can disconnect at any time from the **ⓘ** button in the footer.

### Create the OAuth client ID (about three minutes)

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Google Tasks API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill the required fields, and add your own Google account under **Test users** while the app is unpublished.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
5. Under **Authorized JavaScript origins** add each origin you will use, exactly as written:
   - `http://localhost:4173`
   - `http://127.0.0.1:4173`
   - your hosted origin, for example `https://dayline.example.com`
6. Copy the client ID (it ends with `.apps.googleusercontent.com`).

No client secret, no redirect URI and no PKCE exchange are needed: this is Google Identity Services' browser token flow.

### Hosting it for other people

Put the client ID in `config.js` so every visitor connects with a single tap:

```js
window.DAYLINE_CONFIG = {
  googleClientId: "1234567890-abcd.apps.googleusercontent.com",
  timeFormat: "locale", // or "24h"
  location: null,       // optional { latitude, longitude }
};
```

A client ID is public information, safe to commit. If you leave it empty, each user can still paste their own into the widget.

---

## Host it

Any static host works — GitHub Pages, Netlify, Cloudflare Pages, S3. Two rules:

1. **HTTPS** (Google sign-in and service workers require it; `localhost` is exempt).
2. Add the exact hosted origin to **Authorized JavaScript origins**.

If you deploy under a subpath (e.g. `https://user.github.io/dayline/`), keep that path as the origin entry — the manifest and service worker use relative URLs, so no code changes are needed.

After deploying a change, bump `CACHE_VERSION` in [`sw.js`](./sw.js) and `VERSION` in [`app.js`](./app.js) so installed copies pick it up on the next launch.

---

## Controls

| Action | How |
| --- | --- |
| Pick a day | Tap a date, or use `←` / `→` in the strip |
| Change week | The `‹` / `›` buttons beside the strip |
| Jump to today | The **Today** chip beside the week strip heading, or the `Home` key |
| Refresh | The circular arrow in the top right |
| Sunrise / sunset | **Use location** (or set `location` in `config.js` to skip the prompt) |
| Disconnect, see privacy state | The **ⓘ** button in the footer |

Today is always the white pill. A different selected day gets a white ring.

---

## Privacy

- Scopes: `calendar.events.readonly` and `tasks.readonly`. Dayline can never modify your calendar.
- The OAuth token is kept in a JavaScript variable only — closing the tab discards it.
- Events and tasks are rendered, never persisted. The only `localStorage` entry is the OAuth client ID, which is public data.
- Sunrise and sunset are computed on-device from coordinates; nothing is sent to a sunrise service.
- The service worker caches the app shell (HTML/CSS/JS/icons) for offline use, not your calendar data.
- No webfonts, no trackers, no third-party requests except Google's sign-in script and APIs.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Google sign-in couldn't load" | Sign-in script blocked by network, an extension or a CSP | Allow `accounts.google.com`, then press Try again |
| "Google refused access to Calendar" (403) | Calendar API not enabled for the project | Enable it in **APIs & Services → Library** |
| "…refused access to Tasks" warning under a working calendar | Tasks API not enabled | Same, enable **Google Tasks API**; the calendar still works |
| "Google sign-in couldn't open" | Pop-up blocked | Allow pop-ups for the site |
| `origin_mismatch` / "Error 400" from Google | Origin not listed exactly | Add scheme + host + port to **Authorized JavaScript origins** |
| "Your Google access expired" | Tokens last about an hour | Press **Reconnect** |
| Sunrise/sunset stay at `--:--` | Location not granted | Press **Use location**, or set `location` in `config.js` |
| Old version after deploying | Service worker cache | Reload once; confirm you bumped `CACHE_VERSION` |
| Location never works on the phone | Page served over plain `http://LAN-IP` | Use HTTPS, or set fixed coordinates in `config.js` |
| Sign-in opens but never returns on iOS | Standalone home-screen apps can lose the auth pop-up | Open the page in Safari/Chrome once to sign in, then relaunch from the icon |
| `403 disallowed_useragent` | Google blocks OAuth inside embedded WebViews | Sign in through the real browser (or Custom Tabs), not a WebView |

---

## Project layout

```
index.html              markup, dialogs, welcome template
styles.css              dark widget shell, container queries, sheets
app.js                  UI, Google sign-in, Calendar + Tasks fetching
core.js                 pure date/sun/escape helpers (shared with tests)
config.js               optional deployer config (client ID, time format, location)
sw.js                   offline shell, network-first navigation
manifest.webmanifest    install metadata and icons
logo.svg, icons/        brand mark and generated PNG app icons
server.js               zero-dependency static server on :4173
tests/                  core helpers + behavioural tests (fake DOM, no browser)
tools/make-icons.py     regenerates icons/ from the same geometry as logo.svg
```

### Regenerating icons

```bash
python tools/make-icons.py   # needs Pillow
```

---

## Licence

MIT. The mark and palette are inspired by Nothing's design language, not affiliated with Nothing Technology Limited.
