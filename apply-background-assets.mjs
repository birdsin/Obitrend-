// Run from the OBITREND repository root: node apply-background-assets.mjs
import fs from "node:fs";

const file = "studio/template-catalog.js";
let source = fs.readFileSync(file, "utf8");
const paths = {
  "Mountains": "/studio/assets/mountains-01.jpg",
  "London Studio": "/studio/assets/london-studio-01.jpg",
  "NYC Rooftop": "/studio/assets/nyc-rooftop-01.jpg",
  "Lagos Street": "/studio/assets/lagos-street-01.jpg",
  "Luxury Villa": "/studio/assets/luxury-villa-01.jpg",
  "Desert": "/studio/assets/desert-01.jpg",
  "Beach": "/studio/assets/beach-01.jpg",
  "Runway": "/studio/assets/runway-01.jpg"
};
let changed = 0;
source = source.replace(/\{"id":"background-studio-\d{3}"[\s\S]*?\}/g, (record) => {
  const category = record.match(/"category":"([^"]+)"/)?.[1];
  const preview = paths[category];
  if (!preview) throw new Error(`Unexpected Background Studio category: ${category}`);
  if (!/"preview":"/.test(record)) throw new Error("Template preview field missing");
  changed++;
  return record.replace(/"preview":"[^"]+"/, `"preview":"${preview}"`);
});
if (changed !== 100) throw new Error(`Expected 100 Background Studio templates; found ${changed}. No file written.`);
fs.writeFileSync(file, source);
console.log(`Updated preview paths for ${changed} Background Studio templates.`);
