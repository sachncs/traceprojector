// Google JavaScript Style Guide, via eslint-config-google.
//
// `valid-jsdoc` and `require-jsdoc` were removed from ESLint 9, so the JSDoc
// rules are not enforced by the linter. Long strings, template literals and
// regular expressions are exempt from the 80-column limit, as breaking an error
// message or a pattern hurts more than it helps.
import google from 'eslint-config-google';
import globals from 'globals';

const rules = {...google.rules};
delete rules['valid-jsdoc'];
delete rules['require-jsdoc'];

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'reports/**',
      '.stryker-tmp/**',
      'site/**',
      'docs/**',
      'node_modules/**',
    ],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {...globals.node, ...globals.mocha},
    },
    rules: {
      ...rules,
      'max-len': [
        'error',
        {
          code: 80,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignorePattern: 'goog\\.(module|require)',
        },
      ],
    },
  },
  {
    // Mocha binds `this` in `function () {}` callbacks (for `this.timeout`).
    files: ['tests/**/*.js', 'validation/**/*.js'],
    rules: {'no-invalid-this': 'off'},
  },
];
