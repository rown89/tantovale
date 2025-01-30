import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

const config = {
	darkMode: ['class', '[data-theme="dark"]'],
	content: [
		'index.html',
		'src/**/*.{ts,tsx}',
		'app/**/*.{ts,tsx}',
		'components/**/*.{ts,tsx}',
		'lib/**/*.{ts,tsx}',
		'../../apps/**/*.{ts,tsx}',
		'../../packages/ui/src/components/**/*.{ts,tsx}',
		'../../packages/ui/src/lib/**/*.{ts,tsx}',
	],
	theme: {
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
			},
		},
	},
	plugins: [tailwindAnimate],
} satisfies Config;

export default config;
