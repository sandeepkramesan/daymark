/*
 * Dayline configuration — optional.
 *
 * You do NOT need to edit this file to use Dayline. Open the widget, click
 * "Connect Google Calendar" (or the Google Calendar link), and paste your OAuth
 * client ID there once. It is stored in that browser only.
 *
 * Fill this file in when you host Dayline for other people, so every visitor can
 * connect with a single tap.
 */
window.DAYLINE_CONFIG = {
  // OAuth 2.0 "Web application" client ID, e.g. "1234-abcd.apps.googleusercontent.com".
  googleClientId: "",

  // "locale" follows the device (recommended). Force "24h" or "12h" if you prefer.
  timeFormat: "locale",

  // Optional fixed coordinates: sunrise/sunset then work without a location prompt.
  // location: { latitude: 12.9716, longitude: 77.5946 },
  location: null,
};
