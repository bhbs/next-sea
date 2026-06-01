# next-sea

A Next.js deployment adapter that packages your application as a Node.js
Single Executable Application (SEA).

```bash
next build
./server
```

## Requirements

- Node.js >= 26.0.0
- Next.js >= 16.2.0

## Installation

```bash
npm install --save-dev next-sea
```

## Setup

Add the adapter to `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  adapterPath: import.meta.resolve("next-sea"),
};

export default nextConfig;
```

Build and run:

```bash
next build
./server
```

The adapter enables `output: "standalone"` and creates the executable after
the Next.js build completes. No extra packaging command is required.

## Configuration

Use environment variables when building:

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_SEA_OUTPUT` | `./server` | Executable output path |
| `NEXT_SEA_NODE` | Current `node` binary | Target Node.js binary |

### Cross-Compilation

Download the Node.js 26 binary for the target platform and pass it when
building:

```bash
NEXT_SEA_NODE=./toolchains/node-v26-linux-x64/bin/node \
NEXT_SEA_OUTPUT=./dist/server-linux-x64 \
next build
```

The generated SEA disables V8 code cache and snapshots so that the build host
and target platform may differ. Native addons still need to match the target
OS, architecture, C library, and Node ABI. The target Node.js binary is copied
into the SEA; it does not need to be executable on the build host.

## How It Works

1. `modifyConfig()` enables Next.js standalone output.
2. `onBuildComplete()` schedules packaging after Next.js finishes writing the
   standalone tree.
3. Before the build process exits, the adapter copies `public/` and
   `.next/static/` into the standalone tree.
4. The adapter packs the complete standalone server, including traced
   `node_modules`.
5. Node.js 26 embeds the compressed payload and a small bootstrap script into a SEA.
6. On first run, the executable extracts the payload into a content-addressed
   cache and starts the unmodified standalone `server.js`.

The extracted application uses the normal Node.js filesystem module resolver,
preserving dynamic `require()` behavior without rebundling or patching Next.js
internals.

## Cache

```text
~/.cache/next-sea/<sha256>/              # Linux
~/Library/Caches/next-sea/<sha256>/      # macOS
%LOCALAPPDATA%\next-sea\<sha256>\        # Windows
```

Set `NEXT_SEA_CACHE_DIR` at runtime to override the cache location.

## License

MIT
