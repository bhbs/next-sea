import { spawnSync } from "node:child_process";
import {
  cpSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPayload } from "./payload.js";

const bootstrapPath = fileURLToPath(new URL("./bootstrap.cjs", import.meta.url));

function searchServerDir(standaloneDir) {
  if (existsSync(join(standaloneDir, "server.js"))) return standaloneDir;

  for (const entry of readdirSync(standaloneDir)) {
    if (entry === "node_modules") continue;
    const child = join(standaloneDir, entry);
    if (!statSync(child).isDirectory()) continue;
    const found = searchServerDir(child);
    if (found) return found;
  }

  return null;
}

function findServerDir(standaloneDir) {
  const found = searchServerDir(standaloneDir);
  if (!found) {
    throw new Error(`next-sea: Could not find server.js under ${standaloneDir}`);
  }
  return found;
}

function copyIfPresent(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`next-sea: ${command} exited with status ${result.status}`);
  }
}

export function isMachOExecutable(path) {
  const buffer = Buffer.alloc(4);
  const fd = openSync(path, "r");
  try {
    if (readSync(fd, buffer, 0, buffer.length, 0) !== buffer.length) return false;
  } finally {
    closeSync(fd);
  }

  return [
    "feedface",
    "cefaedfe",
    "feedfacf",
    "cffaedfe",
    "cafebabe",
    "bebafeca",
    "cafebabf",
    "bfbafeca",
  ].includes(buffer.toString("hex"));
}

export function pack({
  projectDir = process.cwd(),
  distDir = join(projectDir, ".next"),
  output,
  nodeBinary = process.execPath,
  prepareOnly = false,
} = {}) {
  projectDir = resolve(projectDir);
  distDir = resolve(distDir);
  const targetNodePath = resolve(nodeBinary);
  const standaloneDir = join(distDir, "standalone");
  if (!existsSync(standaloneDir)) {
    throw new Error('next-sea: No standalone output found. Run "next-sea build" first.');
  }

  const serverDir = findServerDir(standaloneDir);
  copyIfPresent(join(projectDir, "public"), join(serverDir, "public"));
  copyIfPresent(join(distDir, "static"), join(serverDir, ".next", "static"));

  const workDir = join(distDir, "sea");
  mkdirSync(workDir, { recursive: true });
  const payloadPath = join(workDir, "standalone.payload.gz");
  const serverPathFile = join(workDir, "server-path.txt");
  rmSync(payloadPath, { force: true });
  writeFileSync(payloadPath, createPayload(standaloneDir));
  writeFileSync(serverPathFile, relative(standaloneDir, join(serverDir, "server.js")));

  const outputPath = output
    ? isAbsolute(output)
      ? output
      : resolve(projectDir, output)
    : join(projectDir, process.platform === "win32" ? "server.exe" : "server");
  const configPath = join(workDir, "sea-config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        main: bootstrapPath,
        executable: targetNodePath,
        output: outputPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false,
        assets: {
          "standalone.payload.gz": payloadPath,
          "server-path.txt": serverPathFile,
        },
      },
      null,
      2
    )
  );

  if (prepareOnly) {
    console.log(`next-sea: SEA config written to ${configPath}`);
    return { configPath, outputPath, payloadPath, serverDir };
  }

  console.log(`next-sea: Building ${outputPath}`);
  run(process.execPath, ["--build-sea", configPath]);
  if (process.platform === "darwin" && isMachOExecutable(targetNodePath)) {
    run("codesign", ["--sign", "-", outputPath]);
  }
  console.log(`next-sea: Done -> ${outputPath}`);
  return { configPath, outputPath, payloadPath, serverDir };
}
