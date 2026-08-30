import { config } from '@workspace/eslint-config/react-internal';
import pluginQuery from '@tanstack/eslint-plugin-query';

export default [...config, ...pluginQuery.configs['flat/recommended']];
