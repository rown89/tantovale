import { defineConfig } from 'vitest/config';

import baseConfig from '../vitest.config';

export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		include: ['test/infrastructure/worker-a.isolation.ts', 'test/infrastructure/worker-b.isolation.ts'],
		minWorkers: 2,
		maxWorkers: 2,
		fileParallelism: true,
	},
});
