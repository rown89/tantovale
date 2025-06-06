module.exports = {
	apps: [
		{
			name: 'tantovale_server',
			script: './dist/index.js',
			env: {
				NODE_ENV: 'production',
			},
		},
	],
};
