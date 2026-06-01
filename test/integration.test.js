import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "basic-app");
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function get(url) {
  let lastError;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}

test("Next.js builds and runs through the deployment adapter", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "next-sea-integration-"));
  const output = join(root, "server");
  const cacheDir = join(root, "cache");
  const port = await availablePort();
  let child;

  try {
    rmSync(join(projectDir, ".next"), { recursive: true, force: true });
    execFileSync(process.execPath, [nextBin, "build"], {
      cwd: projectDir,
      env: { ...process.env, NEXT_SEA_OUTPUT: output },
      stdio: "inherit",
    });

    child = spawn(output, {
      env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NEXT_SEA_CACHE_DIR: cacheDir },
      stdio: "inherit",
    });

    const page = await get(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /next-sea integration fixture/);

    const health = await get(`http://127.0.0.1:${port}/api/health`);
    assert.deepEqual(await health.json(), { status: "ok" });

    const publicAsset = await get(`http://127.0.0.1:${port}/check.txt`);
    assert.equal(await publicAsset.text(), "public asset from next-sea\n");
    assert.equal(readdirSync(cacheDir).length, 1);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
    rmSync(join(projectDir, ".next"), { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});
