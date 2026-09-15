import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import base from './base.js';

/** Configuration ESLint pour les applications Next.js. */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
