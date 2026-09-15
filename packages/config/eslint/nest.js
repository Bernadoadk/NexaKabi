import globals from 'globals';
import base from './base.js';

/** Configuration ESLint pour l'API NestJS. */
export default [
  ...base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      /**
       * `consistent-type-imports` est INCOMPATIBLE avec NestJS.
       *
       * L'injection de dépendances repose sur `emitDecoratorMetadata`, qui a
       * besoin de la VALEUR du type au moment de l'exécution pour résoudre les
       * paramètres de constructeur. Transformer `import { PrismaService }` en
       * `import type { PrismaService }` efface cette métadonnée et casse la DI
       * silencieusement, au démarrage.
       */
      '@typescript-eslint/consistent-type-imports': 'off',

      // Les modules NestJS sont des classes vides par nature.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];
