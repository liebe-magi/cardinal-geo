import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const csvPath = resolve(process.cwd(), 'r0711world_utf8.csv');
const outPath = resolve(process.cwd(), 'src/cities.ts');

console.log(`Reading CSV from ${csvPath}...`);
const fileContent = readFileSync(csvPath, 'utf-8');
const lines = fileContent.trim().split('\n');

// Headers: country_code name_jp name_jps capital_jp name_en name_ens capital_en lat lon
// Indices: 0, 1, 2, 3, 4, 5, 6, 7, 8
// We want:
// countryCode: 0
// nameJp: 2 (short name)
// capitalJp: 3
// nameEn: 5 (short name)
// capitalEn: 6
// lat: 7
// lon: 8

const cities = lines
  .slice(1)
  .map((line) => {
    const cols = line.split('\t');
    if (cols.length < 9) return null;

    return {
      countryCode: cols[0],
      nameJp: cols[2],
      capitalJp: cols[3],
      nameEn: cols[5],
      capitalEn: cols[6],
      lat: parseFloat(cols[7]),
      lon: parseFloat(cols[8]),
    };
  })
  .filter((c) => c !== null);

const tsContent = `export interface City {
  countryCode: string;
  nameJp: string;
  capitalJp: string;
  nameEn: string;
  capitalEn: string;
  lat: number;
  lon: number;
}

export const cities: City[] = ${JSON.stringify(cities, null, 2)};
`;

console.log(`Writing ${cities.length} cities to ${outPath}...`);
writeFileSync(outPath, tsContent);
console.log('Done!');
