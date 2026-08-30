import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		pool: 'forks',
		maxWorkers: 4,
		fileParallelism: true,
		sequence: {
			shuffle: true,
		},
		testTimeout: 30_000,
		hookTimeout: 60_000,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/database/drizzle/migrations/**'],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
			},
		},
	},
});
