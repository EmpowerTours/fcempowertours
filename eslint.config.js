import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { FlatCompat } from '@eslint/eslintrc';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});
export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'next-env.d.ts'] },
  ...compat.extends('plugin:@next/next/recommended'),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __REACT_DEVTOOLS_GLOBAL_HOOK__: 'readonly',
        _N_E: 'readonly',
        MSApp: 'readonly',
        msCrypto: 'readonly',
        React: 'readonly',
        BufferSource: 'readonly',
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
          varsIgnorePattern: '^_',
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
      '@next/next/no-img-element': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
);
