/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const fs = require('fs');
const currentRegionsPath = 'src/lib/regions.ts';
let code = fs.readFileSync(currentRegionsPath, 'utf8');

// Remap countries
code = code.replace(
  /('east_asia'|'southeast_asia'|'south_asia'|'central_asia'|'middle_east')/g,
  "'asia'",
);
code = code.replace(/('north_america'|'south_america')/g, "'americas'");

// Just clean up comments
code = code.replace(/\/\/\s*East Asia/g, '// Asia\n  // East Asia');
code = code.replace(
  /\/\/\s*North America \(including Central America & Caribbean\)/g,
  '// Americas\n  // North America (including Central America & Caribbean)',
);

fs.writeFileSync(currentRegionsPath, code);
console.log('src/lib/regions.ts mapped values rewritten successfully.');
