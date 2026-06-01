const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { createRequire } = require("node:module");
const { getAsset } = require("node:sea");

function cacheRoot() {
  if (process.env.NEXT_SEA_CACHE_DIR) return process.env.NEXT_SEA_CACHE_DIR;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "next-sea");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "next-sea");
  }
  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "next-sea");
}

function extractPayload() {
  const payload = Buffer.from(getAsset("standalone.tar.gz"));
  const hash = createHash("sha256").update(payload).digest("hex");
  const target = join(cacheRoot(), hash);
  const marker = join(target, ".next-sea-ready");

  if (existsSync(marker)) return target;

  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), `${hash}.tmp-`));
  const archive = join(staging, "standalone.tar.gz");

  try {
    writeFileSync(archive, payload);
    execFileSync("tar", ["-xzf", archive, "-C", staging], { stdio: "inherit" });
    rmSync(archive);
    writeFileSync(join(staging, ".next-sea-ready"), hash);

    try {
      renameSync(staging, target);
    } catch (error) {
      if (!existsSync(marker)) throw error;
      rmSync(staging, { recursive: true, force: true });
    }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  return target;
}

const appDir = extractPayload();
const serverPath = getAsset("server-path.txt", "utf8").trim();
const serverFile = join(appDir, serverPath);
process.chdir(dirname(serverFile));
process.env.NODE_ENV = "production";
createRequire(serverFile)(serverFile);
