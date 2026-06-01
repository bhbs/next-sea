import test from "node:test";
import assert from "node:assert/strict";
import adapter from "../src/adapter.js";

test("adapter enables standalone output for production builds", () => {
  const config = {};

  assert.equal(
    adapter.modifyConfig(config, { phase: "phase-production-build" }).output,
    "standalone"
  );
});

test("adapter leaves config unchanged outside production builds", () => {
  const config = {};

  assert.equal(adapter.modifyConfig(config, { phase: "phase-development-server" }), config);
  assert.equal(config.output, undefined);
});
