/** @type {import('jest').Config} */
const path = require('path');

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: path.join(__dirname, '..'),
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      require.resolve('ts-jest', { paths: [path.join(__dirname, '..')] }),
      {
        tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
        isolatedModules: true,
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@nazdik/shared$': path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'index.ts'),
    '^@prisma/client$': path.join(__dirname, '..', 'node_modules', '@prisma', 'client', 'index.js'),
  },
  setupFiles: [path.join(__dirname, 'setup-env.ts')],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  haste: { retainAllFiles: false },
};
