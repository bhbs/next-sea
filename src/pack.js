import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function pack({
  projectDir = process.cwd(),
  distDir = join(projectDir, ".next"),
  output,
  nodeBinary = process.execPath,
  prepareOnly = false,
} = {}) {
  projectDir = resolve(projectDir);
  distDir = resolve(distDir);
  const standaloneDir = join(distDir, "standalone");
  if (!existsSync(standaloneDir)) {
    throw new Error('next-sea: No standalone output found. Run "next-sea build" first.');
  }

  const serverDir = findServerDir(standaloneDir);
  copyIfPresent(join(projectDir, "public"), join(serverDir, "public"));
  copyIfPresent(join(distDir, "static"), join(serverDir, ".next", "static"));

  const workDir = join(distDir, "sea");
  mkdirSync(workDir, { recursive: true });
  const payloadPath = join(workDir, "standalone.tar.gz");
  const serverPathFile = join(workDir, "server-path.txt");
  rmSync(payloadPath, { force: true });
  execFileSync("tar", ["-czf", payloadPath, "-C", standaloneDir, "."], {
    stdio: "inherit",
  });
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
        executable: resolve(nodeBinary),
        output: outputPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false,
        assets: {
          "standalone.tar.gz": payloadPath,
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
  run(nodeBinary, ["--build-sea", configPath]);
  if (process.platform === "darwin") {
    run("codesign", ["--sign", "-", outputPath]);
  }
  console.log(`next-sea: Done -> ${outputPath}`);
  return { configPath, outputPath, payloadPath, serverDir };
}
