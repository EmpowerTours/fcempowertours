import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    languageOptions: {
      globals: {
        __REACT_DEVTOOLS_GLOBAL_HOOK__: 'readonly',
        _N_E: 'readonly',
        MSApp: 'readonly',
        msCrypto: 'readonly',
        React: 'readonly',  // Fix for 'React' not defined in JSX
        BufferSource: 'readonly',  // Fix for storage.ts
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-prototype-builtins': 'off',
      'no-fallthrough': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',  // Ignores unused vars like _mounted
        }
      ],
      'no-cond-assign': 'warn',
      'no-empty': 'warn',
      'no-sparse-arrays': 'off',
      'no-control-regex': 'warn',
      'no-misleading-character-class': 'warn',
      'no-useless-escape': 'warn',
      'getter-return': 'warn',
      '@typescript-eslint/no-this-alias': 'off',
      'no-func-assign': 'warn',
      'no-redeclare': 'warn',
      'valid-typeof': 'warn',
      'no-undef': 'error',
      '@next/next/no-img-element': 'warn',  // Demote to warning
      '@typescript-eslint/no-require-imports': 'off',  // Allow in configs if needed
      '@typescript-eslint/no-explicit-any': 'warn',  // Soften any usage
      '@typescript-eslint/triple-slash-reference': 'off',  // Fully disable to avoid next-env.d.ts warnings
    },
  },
);
