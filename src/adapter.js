import { pack } from "./pack.js";

/** @type {import("next").NextAdapter} */
const adapter = {
  name: "next-sea",

  modifyConfig(config, ctx) {
    if (!ctx) {
      throw new Error("next-sea: Next.js 16.2+ is required");
    }

    if (ctx.phase !== "phase-production-build") return config;

    if (config.output !== "standalone") {
      console.warn('next-sea: Setting output to "standalone"');
      config.output = "standalone";
    }

    return config;
  },

  onBuildComplete({ projectDir, distDir }) {
    // Next.js writes standalone output after this hook, before the CLI exits.
    process.once("exit", () => {
      pack({
        projectDir,
        distDir,
        output: process.env.NEXT_SEA_OUTPUT,
        nodeBinary: process.env.NEXT_SEA_NODE,
      });
    });
  },
};

export default adapter;
