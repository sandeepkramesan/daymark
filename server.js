#!/usr/bin/env node
/*
 * Tiny static server for local development.
 *
 *   npm start            → http://127.0.0.1:4173
 *   PORT=8080 npm start  → http://127.0.0.1:8080
 *
 * Google OAuth requires an origin that matches the "Authorized JavaScript
 * origins" entry exactly, so keep the default port unless you also update it in
 * the Google Cloud Console.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || "4173", 10);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host || HOST}`).pathname);
  } catch {
    send(response, 400, "Bad request");
    return;
  }

  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = path.join(ROOT, pathname);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    send(response, 403, "Forbidden");
    return;
  }

  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    send(response, 404, "Not found");
    return;
  }

  if (!stats.isFile()) {
    send(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": stats.size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath)
    .on("error", () => response.destroy())
    .pipe(response);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try: PORT=8080 npm start`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Dayline is running at http://${HOST}:${PORT}`);
  console.log("Add that exact origin under Authorized JavaScript origins in Google Cloud Console.");
});
