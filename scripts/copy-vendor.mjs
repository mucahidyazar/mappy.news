// MapLibre loads its tile worker from a URL next to its module, which bundlers cannot rewrite.
// The worker is served from /vendor instead (see src/components/map/maplibre.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const target = path.join(root, "public/vendor/maplibre-gl-worker.mjs");

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
