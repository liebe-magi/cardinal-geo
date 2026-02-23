import fs from 'fs';
import { cities } from '../src/cities';
import { countryRegionMap, regionLabels } from '../src/lib/regions';

let md = '# エリア別国割り当て一覧 (Region Assignments)\n\n';

const regionKeys = Object.keys(regionLabels) as (keyof typeof regionLabels)[];

for (const region of regionKeys) {
  const codes = Object.entries(countryRegionMap)
    .filter(([, r]) => r === region)
    .map(([code]) => code);

  const regionLabel = `${regionLabels[region].ja} (${regionLabels[region].en})`;
  md += `## ${regionLabel}\n`;
  md += `所属国数: **${codes.length}カ国**\n\n`;

  md += '| 国コード (Code) | 国名 (Country) | 英語国名 (English) |\n';
  md += '|---|---|---|\n';

  for (const code of codes) {
    const city = cities.find((c) => c.countryCode === code);
    if (city) {
      md += `| ${code} | ${city.nameJp} | ${city.nameEn} |\n`;
    }
  }
  md += '\n';
}

if (!fs.existsSync('docs')) {
  fs.mkdirSync('docs');
}
fs.writeFileSync('docs/region_assignments.md', md);
console.log('Successfully generated docs/region_assignments.md');
