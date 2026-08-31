import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('server Docker runtime contract', () => {
	it('runs the deployed server with the explicit production environment', async () => {
		const dockerfile = await readFile(path.resolve(process.cwd(), 'Dockerfile'), 'utf8');
		const runnerStage = dockerfile.slice(dockerfile.indexOf('FROM base AS runner'));

		expect(runnerStage).toMatch(/\nENV NODE_ENV=production\n/);
		expect(runnerStage.indexOf('ENV NODE_ENV=production')).toBeLessThan(runnerStage.indexOf('CMD ['));
	});
});
