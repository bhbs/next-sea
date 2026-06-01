import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { pack } from "../src/pack.js";

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

  return root;
}

test("pack prepares a SEA config and payload", () => {
  const root = fixture();

  try {
    const result = pack({ projectDir: root, prepareOnly: true });
    const config = JSON.parse(readFileSync(result.configPath, "utf8"));
    const entries = execFileSync("tar", ["-tzf", result.payloadPath], {
      encoding: "utf8",
    });

    assert.equal(config.main.endsWith("src/bootstrap.cjs"), true);
    assert.equal(config.assets["standalone.tar.gz"], result.payloadPath);
    assert.equal(
      readFileSync(config.assets["server-path.txt"], "utf8"),
      "server.js"
    );
    assert.match(entries, /\.\/server\.js/);
    assert.match(entries, /\.\/public\/favicon\.ico/);
    assert.match(entries, /\.\/\.next\/static\/app\.js/);
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
