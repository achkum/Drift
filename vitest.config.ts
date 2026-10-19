import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  oxc: { tsconfig: false } as never,
  test: { include: ['src/**/*.test.ts', 'mobile/src/**/*.test.ts'], environment: 'node' },
});
