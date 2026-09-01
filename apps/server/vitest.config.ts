import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		globalSetup: ['./test/infrastructure/global-setup.ts'],
		setupFiles: ['./test/setup.ts'],
		pool: 'forks',
		maxWorkers: 2,
		minWorkers: 1,
		fileParallelism: true,
		sequence: {
			shuffle: true,
		},
		testTimeout: 30_000,
		hookTimeout: 60_000,
		coverage: {
			provider: 'v8',
			all: true,
			include: ['src/**/*.ts'],
			exclude: [
				'src/database/drizzle/migrations/**',
				'src/database/scripts/**',
				'src/database/drizzle.config.ts',
				'src/index.ts',
				'**/*.d.ts',
			],
			ignoreEmptyLines: true,
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 85,
			},
		},
	},
});
