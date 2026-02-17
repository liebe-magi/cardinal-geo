/**
 * Question Seeding Script
 *
 * Generates all possible city pair combinations from cities.ts
 * and produces multiple SQL files to seed the questions table.
 *
 * Usage:
 *   bun run scripts/seed_questions.ts
 *
 * This outputs `supabase/seed_questions_*.sql` files that can be run
 * sequentially in Supabase SQL Editor.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// We need to extract city data from cities.ts without importing it as a module
// (since it's a Vite/browser module). Parse the array from the file directly.

interface City {
  countryCode: string;
  nameJp: string;
  capitalJp: string;
  nameEn: string;
  capitalEn: string;
  lat: number;
  lon: number;
}

const citiesPath = resolve(process.cwd(), 'src/cities.ts');
const citiesContent = readFileSync(citiesPath, 'utf-8');

// Extract the array portion from the file
const arrayMatch = citiesContent.match(/export const cities:\s*City\[\]\s*=\s*(\[[\s\S]*\]);?\s*$/);
if (!arrayMatch) {
  console.error('Could not parse cities array from cities.ts');
  process.exit(1);
}

const cities: City[] = eval(`(${arrayMatch[1]})`);

console.log(`Loaded ${cities.length} cities`);

function calculateDirection(target: City, origin: City): { ns: 'N' | 'S'; ew: 'E' | 'W' } {
  const dLat = target.lat - origin.lat;
  const dLon = target.lon - origin.lon;
  return {
    ns: dLat >= 0 ? 'N' : 'S',
    ew: dLon >= 0 ? 'E' : 'W',
  };
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

// Collect all value rows
const allValues: string[] = [];

for (let i = 0; i < cities.length; i++) {
  for (let j = 0; j < cities.length; j++) {
    if (i === j) continue;

    const cityA = cities[i];
    const cityB = cities[j];

    // Skip if same country code (same logic as generateQuestion)
    if (cityA.countryCode === cityB.countryCode) continue;

    const dir = calculateDirection(cityA, cityB);

    allValues.push(
      `  ('${escapeSql(cityA.countryCode)}', '${escapeSql(cityB.countryCode)}', '${escapeSql(cityA.capitalEn)}', '${escapeSql(cityB.capitalEn)}', '${dir.ns}', '${dir.ew}')`,
    );
  }
}

console.log(`Total pairs: ${allValues.length}`);

// Split into chunks of 5000 rows per file
const CHUNK_SIZE = 5000;
const totalChunks = Math.ceil(allValues.length / CHUNK_SIZE);

for (let c = 0; c < totalChunks; c++) {
  const chunk = allValues.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
  const lines: string[] = [];
  lines.push(`-- Auto-generated question seed data (part ${c + 1}/${totalChunks})`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    'INSERT INTO public.questions (city_a_code, city_b_code, city_a_capital, city_b_capital, correct_ns, correct_ew)',
  );
  lines.push('VALUES');
  lines.push(chunk.join(',\n'));
  lines.push('ON CONFLICT (city_a_code, city_b_code) DO NOTHING;');

  const partNum = String(c + 1).padStart(2, '0');
  const outPath = resolve(process.cwd(), `supabase/seed_questions_${partNum}.sql`);
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`  Part ${c + 1}: ${chunk.length} rows → ${outPath}`);
}

console.log(`\nGenerated ${totalChunks} files. Run them sequentially in Supabase SQL Editor.`);
