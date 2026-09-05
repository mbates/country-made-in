import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // scripts/ are developer tools, not extension code: two run in Node, and
    // capture-fixture.js is pasted into a browser console. Declared explicitly rather
    // than pulling in `globals` for one config block.
    files: ['scripts/**'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        document: 'readonly',
        location: 'readonly',
        Node: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  }
)
