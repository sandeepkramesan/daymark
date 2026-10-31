# Dayline

A Nothing-inspired calendar widget with a live local date and time, a week strip, local sunrise and sunset estimates, Google Calendar events, and Google Tasks due on the selected day.

## Preview on your computer

Run a local web server (Google sign-in does not work from a `file://` URL):

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Put the web version on your phone

The web files need to be hosted at an HTTPS address before your phone can install them. HTTPS is also needed for browser location access. To host them with GitHub Pages:

1. Push this folder to a GitHub repository.
2. In that repository, open **Settings → Pages**. Set the source to **Deploy from a branch**, choose `main` and `/(root)`, then save.
3. After Pages publishes it, open `https://<your-username>.github.io/<repository-name>/` in Chrome on your Nothing phone.
4. Tap **⋮ → Install app** or **Install and create shortcut**, then confirm. Dayline will open as a standalone web app from the home screen.
5. For Google data, follow the OAuth setup below and add `https://<your-username>.github.io` as an authorized JavaScript origin.

This installs the web version. It does not create a native Essential Apps home-screen widget.

The page uses the Inter web font so the typeface stays consistent without installing a font into Windows. In the desktop preview, drag the widget's lower-right resize grip. On the phone, use the launcher's widget resize handles for the native Essential App; the web app itself adapts to the screen size.

## Add it as a Nothing Essential App widget

Nothing's builder creates and deploys its own compact home-screen widgets. On your phone, open the Essential Apps builder if it is available for your device/account, create a widget, attach both reference images, and paste the instructions from [ESSENTIAL-APPS-PROMPT.md](./ESSENTIAL-APPS-PROMPT.md). Preview and deploy it to your device, then add Dayline from the Home Screen widget picker. The builder's Calendar and Location permissions are used for the native widget. Availability and menu names can vary by device, OS version, and region.

## Enable Google Calendar and Tasks in the web version

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable **Google Calendar API** and **Google Tasks API**.
2. Configure the OAuth consent screen for the project.
3. Create an **OAuth client ID** with application type **Web application**. Add `http://localhost:4173` under **Authorized JavaScript origins** for local preview. Add the hosted HTTPS origin too.
4. Copy the client ID into `googleClientId` in `config.js`.
5. Reload Dayline and choose **Connect Google Calendar**. Google will ask for read-only access to events and tasks.

The web version requests only `calendar.events.readonly` and `tasks.readonly`. Access tokens stay in memory and are discarded when the page closes; calendar data is not saved. Tap **Use location** to let the browser provide coordinates. Sunrise and sunset are calculated locally on the device; coordinates are not sent to a sunrise service or persisted. Times are estimates.
