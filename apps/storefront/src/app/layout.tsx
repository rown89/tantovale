import { Nunito_Sans } from 'next/font/google';
import type { Metadata } from 'next';
import QueryProvider from './QueryProvider';
import { Toaster } from '@workspace/ui/components/sonner';
import { ThemeProvider } from '@workspace/ui/components/theme-provider';
import { AuthProvider } from '../providers/auth-providers';
import { cookies } from 'next/headers';
import NavBar from '#components/navbar/navbar';

import '@workspace/ui/globals.css';

const font = Nunito_Sans({
	weight: ['400', '600', '700'],
	style: ['normal', 'italic'],
	subsets: ['latin'],
	display: 'swap',
	variable: '--font',
});

export const metadata: Metadata = {
	title: 'Tantovale',
	description: 'Open source marketplace',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const cookieStore = await cookies();
	const accessToken = cookieStore.get('access_token');
	const refreshToken = cookieStore.get('refresh_token');

	const isLogged = accessToken && refreshToken ? true : false;

	return (
		<html lang='en' suppressHydrationWarning>
			<head />
			<body className={`${font.variable} font`}>
				<ThemeProvider attribute='class' defaultTheme='system' enableSystem disableTransitionOnChange>
					<QueryProvider>
						<AuthProvider isLogged={isLogged}>
							{/* TODO: Remove this once we have a production environment */}
							{process?.env?.NODE_ENV !== 'production' && <NavBar />}
							{children}
						</AuthProvider>
						<Toaster />
					</QueryProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
