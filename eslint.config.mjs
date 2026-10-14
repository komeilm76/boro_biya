import eslint from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'bun.lock', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,ts,tsx,vue}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'vue/multi-word-component-names': 'off',
      'vue/no-multiple-template-root': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
