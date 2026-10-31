"use strict";

/*
 * A deliberately small fake DOM, just enough to boot app.js in Node.
 *
 * There is no jsdom dependency in this project and the widget only uses a
 * narrow slice of the DOM API, so the stub covers that slice: element
 * creation, attributes, classList, dataset, listeners, innerHTML as a string
 * and the handful of dialog methods. It is not a browser.
 */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeElement(tag = "div") {
  const element = {
    tagName: tag.toUpperCase(),
    isFragment: tag === "fragment",
    children: [],
    attributes: {},
    listeners: {},
    style: {},
    textContent: "",
    innerHTML: "",
    tabIndex: 0,
    disabled: false,
    open: false,
    hidden: false,
    value: "",
    dataset: {},
    classList: {
      values: new Set(),
      add(...names) { names.forEach((name) => this.values.add(name)); },
      remove(...names) { names.forEach((name) => this.values.delete(name)); },
      toggle(name, force) {
        if (force === undefined) {
          if (this.values.has(name)) this.values.delete(name);
          else this.values.add(name);
        } else if (force) {
          this.values.add(name);
        } else {
          this.values.delete(name);
        }
      },
      contains(name) { return this.values.has(name); },
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    hasAttribute(name) { return name in this.attributes; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, listener) {
      (this.listeners[type] = this.listeners[type] || []).push(listener);
    },
    removeEventListener() {},
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((listener) => listener(event));
    },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) {
      this.children = nodes.flatMap((node) => (node && node.isFragment ? node.children : [node]));
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    contains() { return false; },
    focus() {},
    select() {},
    remove() {},
    closest() { return null; },
    cloneNode() { return makeElement("section"); },
    showModal() { this.open = true; },
    close() { this.open = false; },
  };

  if (tag === "template") element.content = makeElement("fragment");
  return element;
}

function createHarness({ fetch: fetchImpl, config = {} } = {}) {
  const registry = new Map();
  const query = (selector) => {
    if (!registry.has(selector)) {
      registry.set(selector, makeElement(selector === "#welcomeTemplate" ? "template" : "div"));
    }
    return registry.get(selector);
  };

  const document = {
    head: makeElement("head"),
    body: makeElement("body"),
    activeElement: null,
    hidden: false,
    querySelector: query,
    querySelectorAll: () => [],
    createElement: (tag) => makeElement(tag),
    createDocumentFragment: () => makeElement("fragment"),
    addEventListener() {},
  };

  const calls = [];
  const store = new Map();
  const intervals = [];

  const window = {
    DAYLINE_CONFIG: config,
    setInterval: (fn) => { intervals.push(fn); return 0; },
    addEventListener() {},
    google: {
      accounts: {
        oauth2: {
          initTokenClient(clientConfig) {
            calls.push("initTokenClient");
            return {
              requestAccessToken() {
                calls.push("requestAccessToken");
                clientConfig.callback({ access_token: "fake-token", expires_in: 3600 });
              },
            };
          },
        },
      },
    },
  };
  window.window = window;

  const sandbox = {
    window,
    document,
    navigator: {},
    location: { protocol: "http:", hostname: "localhost" },
    console,
    Intl,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Promise,
    setTimeout,
    clearTimeout,
    Error,
    JSON,
    URL,
    URLSearchParams,
    AbortController,
    fetch: (url, options) => {
      calls.push(typeof url === "string" ? url : String(url));
      if (!fetchImpl) throw new Error(`unexpected fetch ${url}`);
      return fetchImpl(url, options);
    },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    setInterval: () => 0,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, "core.js"), "utf8"), sandbox);
  window.DaylineCore = sandbox.DaylineCore;
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), sandbox);

  return { calls, content: query("#agendaContent"), document, query, store, tick: intervals[0], window };
}

module.exports = { createHarness, wait };
