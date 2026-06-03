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
  "billingclient",
  "com.android.billingclient",
  "checkout",
  "expo-ads-admob",
  "googlemobileads",
  "in-app-purchases",
  "in_app_purchase",
  "react-native-google-mobile-ads",
  "skpayment",
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

    const relativePath = path.relative(root, fullPath);
    if (relativePath === path.join("scripts", "guard-no-monetization.mjs")) continue;

    const text = fs.readFileSync(fullPath, "utf8").toLowerCase();
    for (const word of banned) {
      if (text.includes(word)) {
        hits.push(`${relativePath} contains "${word}"`);
      }
    }
  }
}

walk(root);

if (hits.length > 0) {
  console.error("Monetization guard failed:");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log("No monetization hooks found.");
