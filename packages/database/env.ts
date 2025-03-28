import { config } from 'dotenv';
import { expand } from 'dotenv-expand';
import path from 'node:path';
import { z } from 'zod';

expand(
	config({
		path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
	}),
);

const EnvSchema = z.object({
	NODE_ENV: z.string().default('development'),
	DATABASE_USERNAME: z.string(),
	DATABASE_PASSWORD: z.string(),
	DATABASE_HOST: z.string(),
	DATABASE_PORT: z.coerce.number().default(5432),
	DATABASE_NAME: z.string(),
});

export function parseEnv(data: typeof EnvSchema | NodeJS.ProcessEnv) {
	const { data: env, error } = EnvSchema.safeParse(data);

	if (error) {
		const errorMessage = `❌ Invalid env - ${Object.entries(error.flatten().fieldErrors)
			.map(([key, errors]) => `${key}: ${errors.join(',')}`)
			.join(' | ')}`;
		throw new Error(errorMessage);
	}

	return env;
}

export type Environment = z.infer<typeof EnvSchema>;
