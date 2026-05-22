import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        AbortController: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {
      'no-debugger': 'error',
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-duplicate-imports': 'warn',
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    ignores: [
      '**/node_modules/',
      '**/.tmp*/',
      '**/reports/',
    ],
  },
];
