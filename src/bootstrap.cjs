const { createHash } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require("node:fs");
const { homedir, tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { createRequire } = require("node:module");
const { getAsset } = require("node:sea");
const { gunzipSync } = require("node:zlib");

const MAGIC = Buffer.from("NEXTSEA1");

function outputPath(root, path) {
  const parts = path.split("/");
  if (!path || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`next-sea: Invalid payload path: ${path}`);
  }
  return join(root, ...parts);
}

function extract(payload, root) {
  const archive = gunzipSync(payload);
  if (!archive.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("next-sea: Invalid payload");
  }

  const manifestLength = archive.readUInt32BE(MAGIC.length);
  const contentStart = MAGIC.length + 4 + manifestLength;
  if (contentStart > archive.length) throw new Error("next-sea: Invalid payload manifest");
  const entries = JSON.parse(
    archive.subarray(MAGIC.length + 4, contentStart).toString("utf8")
  );
  let offset = contentStart;

  for (const entry of entries) {
    const path = outputPath(root, entry.path);
    mkdirSync(dirname(path), { recursive: true });

    if (entry.type === "directory") {
      mkdirSync(path);
      chmodSync(path, entry.mode);
    } else if (entry.type === "symlink") {
      symlinkSync(entry.target, path);
    } else if (entry.type === "file") {
      if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new Error(`next-sea: Invalid payload entry: ${entry.path}`);
      }
      const end = offset + entry.size;
      if (end > archive.length) {
        throw new Error(`next-sea: Invalid payload entry: ${entry.path}`);
      }
      writeFileSync(path, archive.subarray(offset, end), { mode: entry.mode });
      offset = end;
    } else {
      throw new Error(`next-sea: Invalid payload entry type: ${entry.type}`);
    }
  }

  if (offset !== archive.length) throw new Error("next-sea: Invalid payload size");
}

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
  const payload = Buffer.from(getAsset("standalone.payload.gz"));
  const hash = createHash("sha256").update(payload).digest("hex");
  const target = join(cacheRoot(), hash);
  const marker = join(target, ".next-sea-ready");

  if (existsSync(marker)) return target;

  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), `${hash}.tmp-`));

  try {
    extract(payload, staging);
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
