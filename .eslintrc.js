module.exports = {
  root: true,
  extends: '@react-native',
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
    'react/react-in-jsx-scope': 'off', // Not needed with new JSX transform
    '@typescript-eslint/no-unused-vars': 'warn',
    'react-native/no-inline-styles': 'off',
  },
};
