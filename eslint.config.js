const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

module.exports = [
  ...compat.config({
    extends: ['@react-native'],
    plugins: ['@typescript-eslint', 'prettier'],
    rules: {
      'prettier/prettier': [
        'error',
        {
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          arrowParens: 'always',
          bracketSpacing: true,
          jsxSingleQuote: false,
          printWidth: 100,
          trailingComma: 'es5',
        },
      ],
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-native/no-inline-styles': 'off',
    },
  }),
];
