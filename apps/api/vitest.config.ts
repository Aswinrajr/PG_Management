import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 120000,
    env: {
      NODE_ENV: 'test',
      OTP_DEV_MODE: 'true',
      JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-test-access-secret-1234',
      JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret-test-refresh-secret-12',
      ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    },
  },
});
