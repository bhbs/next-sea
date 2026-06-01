import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { isMachOExecutable, pack } from "../src/pack.js";

const MAGIC = Buffer.from("NEXTSEA1");

function payloadEntries(path) {
  const payload = gunzipSync(readFileSync(path));
  assert.equal(payload.subarray(0, MAGIC.length).equals(MAGIC), true);
  const manifestLength = payload.readUInt32BE(MAGIC.length);
  return JSON.parse(
    payload.subarray(MAGIC.length + 4, MAGIC.length + 4 + manifestLength).toString("utf8")
  );
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "next-sea-test-"));
  const files = {
    ".next/standalone/server.js": "console.log('server');",
    ".next/standalone/.next/BUILD_ID": "test-build",
    ".next/static/app.js": "console.log('static');",
    "public/favicon.ico": "icon",
  };

  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
  symlinkSync("BUILD_ID", join(root, ".next", "standalone", ".next", "BUILD_ID.link"));

  return root;
}

test("pack prepares a SEA config and payload", () => {
  const root = fixture();

  try {
    const result = pack({ projectDir: root, prepareOnly: true });
    const config = JSON.parse(readFileSync(result.configPath, "utf8"));
    const entries = payloadEntries(result.payloadPath);
    const paths = entries.map((entry) => entry.path);

    assert.equal(config.main.endsWith("src/bootstrap.cjs"), true);
    assert.equal(config.assets["standalone.payload.gz"], result.payloadPath);
    assert.equal(
      readFileSync(config.assets["server-path.txt"], "utf8"),
      "server.js"
    );
    assert.equal(paths.includes("server.js"), true);
    assert.equal(paths.includes("public/favicon.ico"), true);
    assert.equal(paths.includes(".next/static/app.js"), true);
    const link = entries.find((entry) => entry.path === ".next/BUILD_ID.link");
    assert.equal(link.type, "symlink");
    assert.equal(link.target, "BUILD_ID");
    assert.equal(Number.isInteger(link.mode), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack supports nested monorepo standalone output", () => {
  const root = fixture();
  const source = join(root, ".next", "standalone", "server.js");
  const nested = join(root, ".next", "standalone", "apps", "web", "server.js");
  mkdirSync(join(nested, ".."), { recursive: true });
  writeFileSync(nested, readFileSync(source));
  rmSync(source);

  try {
    const result = pack({ projectDir: root, prepareOnly: true });
    assert.equal(result.serverDir, join(root, ".next", "standalone", "apps", "web"));
    assert.equal(existsSync(join(result.serverDir, "public", "favicon.ico")), true);
    assert.equal(
      readFileSync(join(root, ".next", "sea", "server-path.txt"), "utf8"),
      "apps/web/server.js"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack rejects projects without standalone output", () => {
  const root = mkdtempSync(join(tmpdir(), "next-sea-test-"));

  try {
    assert.throws(() => pack({ projectDir: root, prepareOnly: true }), {
      message: /No standalone output found/,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Mach-O detection distinguishes macOS and Linux target binaries", () => {
  const root = mkdtempSync(join(tmpdir(), "next-sea-test-"));
  const machO = join(root, "node-macos");
  const elf = join(root, "node-linux");
  writeFileSync(machO, Buffer.from("cffaedfe", "hex"));
  writeFileSync(elf, Buffer.from("7f454c46", "hex"));

  try {
    assert.equal(isMachOExecutable(machO), true);
    assert.equal(isMachOExecutable(elf), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("pack builds an executable that extracts and starts the standalone server", () => {
  const root = fixture();
  const output = join(root, "server");
  const cacheDir = join(root, "cache");

  try {
    pack({ projectDir: root, output });
    const stdout = execFileSync(output, {
      encoding: "utf8",
      env: { ...process.env, NEXT_SEA_CACHE_DIR: cacheDir },
    });

    assert.match(stdout, /server/);
    assert.equal(readdirSync(cacheDir).length, 1);
    const extracted = join(cacheDir, readdirSync(cacheDir)[0]);
    assert.equal(readlinkSync(join(extracted, ".next", "BUILD_ID.link")), "BUILD_ID");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
