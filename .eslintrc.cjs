module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: ['dist', 'coverage', 'node_modules'],
  rules: {},
};
