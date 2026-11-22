// Bundles the same small form with each library and prints its size.
//
// Every entry in ./entries renders a profile edit form: name, email, city and a
// newsletter checkbox, a required name and email, errors after blur, a submit button
// that is off until something changes, and a save after which the sent values count
// as saved. React itself is external: it is the same for everyone. Everything else the
// entry imports is counted, the library's own dependencies included.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));

/** The package each entry imports, for the version column. */
const PACKAGES = {
  draftform: "draftform",
  "react-hook-form": "react-hook-form",
  "tanstack-form": "@tanstack/react-form",
  formik: "formik",
};

function version(name) {
  const file = path.join(root, "node_modules", name, "package.json");

  return JSON.parse(readFileSync(file, "utf8")).version;
}

async function measure(entry) {
  const result = await build({
    entryPoints: [path.join(root, "entries", entry)],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    jsx: "automatic",
    platform: "browser",
    target: "es2022",
    external: ["react", "react-dom", "react/jsx-runtime"],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  });

  const code = Buffer.concat(result.outputFiles.map((file) => file.contents));

  return {
    min: code.length,
    gzip: gzipSync(code, { level: 9 }).length,
    brotli: brotliCompressSync(code).length,
  };
}

const kB = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

const rows = [];

for (const entry of readdirSync(path.join(root, "entries")).filter((f) => f.endsWith(".jsx"))) {
  const name = PACKAGES[entry.replace(".jsx", "")];

  rows.push({ package: `${name} ${version(name)}`, ...(await measure(entry)) });
}

rows.sort((a, b) => a.gzip - b.gzip);

const table = [
  "| Package | min | min + gzip | min + brotli |",
  "|---|--:|--:|--:|",
  ...rows.map((r) => `| ${r.package} | ${kB(r.min)} | ${kB(r.gzip)} | ${kB(r.brotli)} |`),
].join("\n");

writeFileSync(path.join(root, "results.md"), `${table}\n`);
console.log(table);
