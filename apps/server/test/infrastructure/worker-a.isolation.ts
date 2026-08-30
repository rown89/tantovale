import { describe, it } from 'vitest';

import { proveWorkerResourceIsolation } from '../helpers/worker-coordination';

describe('worker A resource assignment', () => {
	it('uses an isolated disposable database and object-storage bucket', proveWorkerResourceIsolation);
});
