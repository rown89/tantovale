import { parseEnv } from './env';

export default parseEnv(process.env, { runtime: true });
