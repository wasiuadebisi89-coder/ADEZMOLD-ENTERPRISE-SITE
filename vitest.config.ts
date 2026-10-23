import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'functions/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      'apps/web/vite.config.ts',
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          fileParallelism: false,
          setupFiles: ['tests/integration/setup.ts'],
        },
      },
    ],
  },
});
