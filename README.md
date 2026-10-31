# Dayline

A Nothing-inspired calendar widget with a live local date and time, a week strip, local sunrise and sunset estimates, Google Calendar events, and Google Tasks due on the selected day.

## Add it as a Nothing Essential App widget

Nothing's builder creates and deploys its own compact home-screen widgets. On your phone, open the Essential Apps builder if it is available for your device/account, create a widget, attach both reference images, and paste the instructions from [ESSENTIAL-APPS-PROMPT.md](./ESSENTIAL-APPS-PROMPT.md). Preview and deploy it to your device, then add Dayline from the Home Screen widget picker. The builder's Calendar and Location permissions are used for the native widget. Availability and menu names can vary by device, OS version, and region.

## Enable Google Calendar and Tasks in the web version

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable **Google Calendar API** and **Google Tasks API**.
2. Configure the OAuth consent screen for the project.
3. Create an **OAuth client ID** with application type **Web application**. Add `http://localhost:4173` under **Authorized JavaScript origins** for local preview. Add the hosted HTTPS origin too.
4. Copy the client ID into `googleClientId` in `config.js`.
5. Reload Dayline and choose **Connect Google Calendar**. Google will ask for read-only access to events and tasks.

The web version requests only `calendar.events.readonly` and `tasks.readonly`. Access tokens stay in memory and are discarded when the page closes; calendar data is not saved. Tap **Use location** to let the browser provide coordinates. Sunrise and sunset are calculated locally on the device; coordinates are not sent to a sunrise service or persisted. Times are estimates.
