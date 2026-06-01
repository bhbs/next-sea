import { resolve } from "node:path";

export default {
  adapterPath: resolve(import.meta.dirname, "../../src/adapter.js"),
};
