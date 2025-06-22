'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Tabs, TabsContent } from '@workspace/ui/components/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Button } from '@workspace/ui/components/button';

import { Separator } from '@workspace/ui/components/separator';
import { Label } from '@workspace/ui/components/label';

export default function UserSettingsPage() {
	const { theme, setTheme } = useTheme();

	return (
		<div className='container mx-auto px-4'>
			<div className='space-y-6'>
				<h1 className='text-3xl font-bold tracking-tight'>Settings</h1>
				<p className='text-muted-foreground'>Manage your account settings and preferences.</p>
				<Separator />
				<Tabs defaultValue='appearance' className='space-y-6'>
					<TabsContent value='appearance' className='space-y-6'>
						<Card>
							<CardHeader>
								<CardTitle>Appearance</CardTitle>
								<CardDescription>
									Customize the appearance of the app. Automatically switch between day and night themes.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-6'>
								<div className='space-y-2'>
									<Label htmlFor='theme'>Theme</Label>
									<div className='grid grid-cols-3 gap-2'>
										<Button
											variant={theme === 'light' ? 'default' : 'outline'}
											className='justify-start'
											onClick={() => setTheme('light')}>
											<Sun className='mr-2 h-4 w-4' />
											Light
										</Button>
										<Button
											variant={theme === 'dark' ? 'default' : 'outline'}
											className='justify-start'
											onClick={() => setTheme('dark')}>
											<Moon className='mr-2 h-4 w-4' />
											Dark
										</Button>
										<Button
											variant={theme === 'system' ? 'default' : 'outline'}
											className='justify-start'
											onClick={() => setTheme('system')}>
											<span className='mr-2'>🖥️</span>
											System
										</Button>
									</div>
									<p className='text-muted-foreground text-sm'>Select the theme for the dashboard.</p>
								</div>
							</CardContent>
							<CardFooter>
								<p className='text-muted-foreground text-sm'>Your theme preference will be saved to your account.</p>
							</CardFooter>
						</Card>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
