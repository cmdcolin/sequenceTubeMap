import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const RELATIVE_SPECIFIER = /^\.{1,2}\//
const ENDS_IN_EXTENSION = /\.[a-zA-Z0-9]+$/

// Node resolves ESM without guessing at extensions, and `pnpm tubemap-cli`
// hands src/ straight to node, so a bare `../Types` breaks it while the vite
// build stays happy. This is the one rule we used eslint-plugin-import for.
const relativeImportExtensions = {
  meta: {
    type: 'problem',
    messages: {
      missing: "'{{source}}' needs the file extension spelled out.",
    },
  },
  create(context) {
    const check = source => {
      if (typeof source?.value !== 'string') {
        return
      }
      if (
        RELATIVE_SPECIFIER.test(source.value) &&
        !ENDS_IN_EXTENSION.test(source.value)
      ) {
        context.report({
          node: source,
          messageId: 'missing',
          data: { source: source.value },
        })
      }
    }
    return {
      ImportDeclaration: node => { check(node.source) },
      ImportExpression: node => { check(node.source) },
      ExportAllDeclaration: node => { check(node.source) },
      ExportNamedDeclaration: node => { check(node.source) },
    }
  },
}

export default defineConfig(
  {
    ignores: [
      'build',
      'dist',
      'tmp',
      'public',
      'node_modules',
      'eslint.config.mjs',
      'vite.config.mjs',
      'src/util/tubemap.js',
      'src/util/tubemap.ts',
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: '19' },
    },
  },
  {
    plugins: {
      local: {
        rules: { 'relative-import-extensions': relativeImportExtensions },
      },
    },
    rules: { 'local/relative-import-extensions': 'error' },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  eslintPluginReact.configs.flat.recommended,
  {
    plugins: { 'react-hooks': eslintPluginReactHooks },
    rules: eslintPluginReactHooks.configs.recommended.rules,
  },
  {
    rules: {
      'no-empty': 'off',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'prefer-const': 'error',

      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        vi: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: [
      'src/server.mjs',
      'src/vg.mjs',
      'src/api/local/Worker.mjs',
      'src/__mocks__/**',
      'src/config-*.{js,mjs}',
      'src/components/TubeMap.tsx',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/api/local/Worker.mjs', 'src/api/wasm/blobWasiFile.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
)
