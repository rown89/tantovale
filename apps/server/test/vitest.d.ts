import 'vitest';

import type { TestRuntime } from './infrastructure/runtime';

declare module 'vitest' {
	interface ProvidedContext {
		testRuntime: TestRuntime;
	}
}
