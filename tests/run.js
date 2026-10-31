"use strict";

// Runs every test file in-process. `node --test tests/` works too, but a plain
// script keeps the suite runnable in sandboxes that block child processes.
require("./core.test.js");
require("./app.test.js");
