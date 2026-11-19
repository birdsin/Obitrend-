import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "cloudflare", "public");
const files = [
  "index.html", "about.html", "contact.html", "delete-account.html",
  "privacy.html", "terms.html", "ads.txt", "robots.txt", "sitemap.xml",
  "manifest.webmanifest", "obitrend-sw.js", "service-worker.js",
  "supabase.js", "video-ui.js"
];
const directories = ["icons", "studio", "fashion-academy"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of files) {
  const source = path.join(root, name);
  try { if ((await stat(source)).isFile()) await cp(source, path.join(output, name)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
for (const name of directories) {
  const source = path.join(root, name);
  try { if ((await stat(source)).isDirectory()) await cp(source, path.join(output, name), { recursive: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
console.log("Prepared allowlisted OBITREND static assets at cloudflare/public. No API source or repository root files are published.");
