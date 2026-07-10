import { PRODUCTS } from '../src/constants.ts';
import { writeFileSync } from 'fs';

const groups = new Map();
for (const p of PRODUCTS) {
  if (!groups.has(p.category)) groups.set(p.category, []);
  groups.get(p.category).push(p);
}

let md = `# PDF Product Catalog\n\n`;
md += `Auto-generated from \`src/constants.ts\` via \`npm run catalog:sync\` - do not hand-edit the table below, it will be overwritten. Regenerate it after every change to \`PRODUCTS\` in \`src/constants.ts\`.\n\n`;
md += `The \`Product ID\` column is exactly what must be typed into the Admin Panel's "Product id" field when uploading a PDF (lowercase, must match exactly - see [Adding Product Instruction.md](./Adding%20Product%20Instruction.md)).\n\n`;
md += `Note: this table only reflects what's defined in code. It does NOT confirm whether a PDF has actually been uploaded to R2 for a given id - check the Admin Panel's Files tab for that.\n\n`;
md += `| Product ID | Title | Category | Lang | Level | Price | Available Now |\n`;
md += `|---|---|---|---|---|---|---|\n`;

const sorted = [...PRODUCTS].sort((a, b) => a.id.localeCompare(b.id));
for (const p of sorted) {
  const available = p.available === false ? 'No' : 'Yes';
  md += `| \`${p.id}\` | ${p.title} | ${p.category} | ${p.language ?? '-'} | ${p.level ?? '-'} | ${p.price} | ${available} |\n`;
}

md += `\n## Summary\n\n`;
md += `- Total catalog entries: ${PRODUCTS.length}\n`;
md += `- Categories: ${[...groups.keys()].sort().join(', ')}\n`;

writeFileSync(new URL('../documentation/PDF_CATALOG.md', import.meta.url), md);
console.log(`PDF_CATALOG.md regenerated (${PRODUCTS.length} products).`);
