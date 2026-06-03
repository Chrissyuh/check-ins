import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const banned = [
  "stripe",
  "paypal",
  "braintree",
  "revenuecat",
  "admob",
  "adsense",
  "doubleclick",
  "billing",
  "checkout",
];
const ignoredDirs = new Set(["node_modules", ".expo", "dist", "web-build", ".git"]);
const ignoredFiles = new Set(["package-lock.json"]);
const scannedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".sql"]);
const hits = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (ignoredFiles.has(entry.name)) continue;
    if (!scannedExtensions.has(path.extname(entry.name))) continue;

    const text = fs.readFileSync(fullPath, "utf8").toLowerCase();
    for (const word of banned) {
      if (text.includes(word)) {
        hits.push(`${path.relative(root, fullPath)} contains "${word}"`);
      }
    }
  }
}

walk(root);

const allowedSelfHits = new Set([
  'scripts\\guard-no-monetization.mjs contains "stripe"',
  'scripts\\guard-no-monetization.mjs contains "paypal"',
  'scripts\\guard-no-monetization.mjs contains "braintree"',
  'scripts\\guard-no-monetization.mjs contains "revenuecat"',
  'scripts\\guard-no-monetization.mjs contains "admob"',
  'scripts\\guard-no-monetization.mjs contains "adsense"',
  'scripts\\guard-no-monetization.mjs contains "doubleclick"',
  'scripts\\guard-no-monetization.mjs contains "billing"',
  'scripts\\guard-no-monetization.mjs contains "checkout"',
]);
const normalizedHits = hits.filter((hit) => !allowedSelfHits.has(hit));

if (normalizedHits.length > 0) {
  console.error("Monetization guard failed:");
  for (const hit of normalizedHits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log("No monetization hooks found.");
