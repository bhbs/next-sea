import {
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const MAGIC = Buffer.from("NEXTSEA1");

function portableRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

function collectEntries(root, dir = root, entries = [], contents = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const archivePath = portableRelative(root, path);
    const stat = lstatSync(path);

    if (stat.isDirectory()) {
      entries.push({ path: archivePath, type: "directory", mode: stat.mode });
      collectEntries(root, path, entries, contents);
      continue;
    }

    if (stat.isSymbolicLink()) {
      entries.push({
        path: archivePath,
        type: "symlink",
        mode: stat.mode,
        target: readlinkSync(path),
      });
      continue;
    }

    if (!stat.isFile()) {
      throw new Error(`next-sea: Unsupported file type: ${path}`);
    }

    const content = readFileSync(path);
    entries.push({
      path: archivePath,
      type: "file",
      mode: stat.mode,
      size: content.length,
    });
    contents.push(content);
  }

  return { entries, contents };
}

export function createPayload(root) {
  const { entries, contents } = collectEntries(root);
  const manifest = Buffer.from(JSON.stringify(entries));
  const header = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(header);
  header.writeUInt32BE(manifest.length, MAGIC.length);
  return gzipSync(Buffer.concat([header, manifest, ...contents]));
}
