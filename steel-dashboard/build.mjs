#!/usr/bin/env node
// Builds the structural steel dashboard into one self-contained HTML file.
//
//   node steel-dashboard/build.mjs                         -> empty board (load files in the browser)
//   node steel-dashboard/build.mjs parts.xls MlyTimhur3.xls OpnOrdSup.xls
//                                                           -> board with the data embedded
//   --out <file>   output path (default: steel-dashboard/dist/steel-dashboard.html)
//   --fragment     omit the <!doctype>/<html>/<head>/<body> shell (for hosts that add their own)
//
// The three Priority exports may be given in any order; each is recognised by its columns.
// Output that embeds data is written under dist/, which is git-ignored: the data must not
// be committed to this repository.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const model = createRequire(import.meta.url)("./src/model.js");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const [, value] = args.splice(i, 2);
  return value ?? true;
};
const fragment = args.includes("--fragment");
if (fragment) args.splice(args.indexOf("--fragment"), 1);
const out = flag("--out") || join(here, "dist", "steel-dashboard.html");

let snapshot = null;
if (args.length) {
  const texts = args.map((f) => model.decode(readFileSync(f)));
  try {
    snapshot = model.extract(texts);
  } catch (e) {
    console.error(`Could not read the exports: ${e.message}`);
    process.exit(1);
  }
}

const template = readFileSync(join(here, "src", "dashboard.html"), "utf8");
const modelSource = readFileSync(join(here, "src", "model.js"), "utf8");
// Keep "</script" sequences in the JSON from closing the tag early.
const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");

let html = template
  .replace('<script src="model.js"></script>', () => `<script>\n${modelSource}</script>`)
  .replace(
    '<script id="snapshot" type="application/json">null</script>',
    () => `<script id="snapshot" type="application/json">${json}</script>`,
  );

if (fragment) {
  const part = (tag) => {
    const m = html.match(new RegExp(`<!--@${tag}-->([\\s\\S]*?)<!--@/${tag}-->`));
    if (!m) throw new Error(`template marker @${tag} missing`);
    return m[1].trim();
  };
  html = `${part("head")}\n${part("body")}\n`;
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);

if (snapshot) {
  const d = model.compute(snapshot, { excludeWh: model.DEFAULT_EXCLUDED_WH, leadMonths: model.DEFAULT_LEAD_MONTHS });
  const t = (kg) => `${(kg / 1000).toFixed(1)} t`;
  console.log(`stock run ${snapshot.meta.stockRun}: ${snapshot.parts.length} items, ` +
    `stock ${t(d.totals.stockKg)} (excl. warehouses ${d.totals.excludedWh.join(", ")}), monthly use ${t(d.totals.consKg)}, open orders ${t(d.totals.onOrderKg)}`);
}
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
