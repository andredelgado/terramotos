// Lint for the page's modules: catches a name used without an import, a write to another
// module's binding, and imports that are no longer used.
module.exports = [
  {
    files: ['site/js/**/*.js', 'hosting/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: Object.fromEntries(['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'fetch', 'WebSocket',
        'URL', 'URLSearchParams', 'Path2D', 'ResizeObserver', 'MutationObserver', 'Event', 'matchMedia', 'getComputedStyle',
        'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'performance', 'innerWidth', 'console',
        'Request', 'Response', 'structuredClone'].map((name) => [name, 'readonly'])),
    },
    rules: {
      'no-undef': 'error',
      'no-import-assign': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
];
