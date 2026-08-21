import { nextJsConfig } from '@workspace/eslint-config/next-js';
import pluginQuery from '@tanstack/eslint-plugin-query';

/** @type {import("eslint").Linter.Config} */

export default [...nextJsConfig, ...pluginQuery.configs['flat/recommended'], { ignores: ['.next/**'] }];
