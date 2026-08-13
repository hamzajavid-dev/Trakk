import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const inboxSdkPageWorld = resolve("node_modules/@inboxsdk/core/pageWorld.js");

export default defineConfig({
  plugins: [
    crx({ manifest }),
    {
      name: "copy-inboxsdk-page-world",
      writeBundle(options) {
        if (options.dir) copyFileSync(inboxSdkPageWorld, resolve(options.dir, "pageWorld.js"));
      },
    },
  ],
});
