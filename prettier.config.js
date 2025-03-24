/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
	printWidth: 120,
	tabWidth: 2,
	useTabs: true,
	semi: true,
	singleQuote: true,
	jsxSingleQuote: true,
	bracketSameLine: true,
	trailingComma: 'all',
	arrowParens: 'always',
	endOfLine: 'lf',
	plugins: ['prettier-plugin-tailwindcss'],
};

module.exports = config;
