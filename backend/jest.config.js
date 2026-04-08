export default {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/models/**/*.js',
  ],
};
