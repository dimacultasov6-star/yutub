import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      'out/**',
      'android/**',
      'release/**',
      'dist/**',
      '.jdk/**',
      'node_modules/**',
      'next-env.d.ts',
      '.next/**',
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Electron main/preload — это обычные Node-скрипты CommonJS, которые
    // Electron грузит сам, без сборщика и без ESM. require() здесь не только
    // допустим, но и обязателен, поэтому правило для TS/ESM отключаем.
    files: ['electron/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];

export default config;