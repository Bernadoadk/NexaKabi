/**
 * Marque un dossier de sortie compilée comme CommonJS.
 *
 * Usage : node scripts/mark-commonjs.mjs <dossier>
 *
 * Les paquets partagés (`packages/utils`, `packages/contracts`) sont publiés
 * en `"type": "module"`. Leur variante CommonJS — celle que l'API charge par
 * `require()` — est émise dans `dist/cjs/` avec l'extension `.js` : sans un
 * `package.json` plus proche qui dise le contraire, Node lirait ces fichiers
 * comme des modules ES et refuserait chaque `require`. Ce fichier est cette
 * exception.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];

if (!directory) {
  console.error('Usage : node scripts/mark-commonjs.mjs <dossier>');
  process.exit(1);
}

mkdirSync(directory, { recursive: true });
writeFileSync(
  join(directory, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);
