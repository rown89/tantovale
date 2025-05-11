import { eq } from 'drizzle-orm';
import { createRouter } from 'src/lib/create-app';
import { parseEnv } from 'src/env';

export const webhooksRoute = createRouter();
