import nextJest from 'next/jest.js';
import type { Config } from 'jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '^@/auth$': '<rootDir>/auth.ts',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createJestConfig(config);
