// Deep-merges a JSON fragment into messages/<locale>.json: node scripts/i18n/merge.mjs tr fragment.json
import fs from "node:fs";

const [locale, fragmentPath] = process.argv.slice(2);
const target = new URL(`../../messages/${locale}.json`, import.meta.url);
const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
const fragment = JSON.parse(fs.readFileSync(fragmentPath, "utf8"));

function merge(into, from) {
  for (const [key, value] of Object.entries(from)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      into[key] = merge(into[key] && typeof into[key] === "object" ? into[key] : {}, value);
    } else {
      into[key] = value;
    }
  }
  return into;
}

fs.writeFileSync(target, `${JSON.stringify(merge(current, fragment), null, 2)}\n`);
