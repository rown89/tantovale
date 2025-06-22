'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Button } from '@workspace/ui/components/button';

import { Separator } from '@workspace/ui/components/separator';
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectGroup,
	SelectItem,
} from '@workspace/ui/components/select';
import { Checkbox } from '@workspace/ui/components/checkbox';

import { signupAction } from '../../../app/signup/actions';
import { SignupActionResponse } from '../../../app/signup/types';

const initialState: SignupActionResponse = {
	success: false,
	message: '',
};

export default function SignupForm() {
	const [state, formAction, isPending] = useActionState(signupAction, initialState);

	const router = useRouter();

	useEffect(() => {
		if (state.success) {
			toast(`Ciao, ${state.inputs?.username}`, {
				description: "Controlla la tua email per attivare l'account",
				duration: 6000,
			});

			router.replace('/');
		}
	}, [state]);

	return (
		<div className='container mx-auto flex h-full items-center justify-center p-2 sm:h-[calc(100vh-56px)] xl:p-0'>
			<Card className='w-full max-w-md'>
				<form action={formAction}>
					<CardHeader>
						<CardTitle className='text-primary'>Registrati</CardTitle>
						<CardDescription>Crea il tuo account per iniziare</CardDescription>
					</CardHeader>
					<CardContent className='space-y-2'>
						<div className='flex flex-col gap-4'>
							<Label htmlFor='username'>
								Username <span className='text-red-500'>*</span>
							</Label>
							<Input
								id='username'
								name='username'
								type='text'
								placeholder='Pick a cool username :)'
								required
								defaultValue={state.inputs?.username}
								className={state?.errors?.username ? 'border-red-500' : ''}
							/>
							{state.errors?.username && (
								<p className='flex items-center text-sm text-red-500'>
									<AlertCircle className='mr-1 h-4 w-4' />
									{state.errors.username}
								</p>
							)}
						</div>
						<Separator className='mb-6 mt-7' />
						<div className='flex flex-col gap-4'>
							<div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
								<div className='flex flex-col gap-4'>
									<Label htmlFor='name'>
										Name <span className='text-red-500'>*</span>
									</Label>
									<Input
										id='name'
										name='name'
										type='text'
										placeholder='Mario'
										required
										defaultValue={state.inputs?.name}
										className={state?.errors?.name ? 'border-red-500' : ''}
									/>
									{state.errors?.name && (
										<p className='flex items-center text-sm text-red-500'>
											<AlertCircle className='mr-1 h-4 w-4' />
											{state.errors.name}
										</p>
									)}
								</div>
								<div className='flex flex-col gap-4'>
									<Label htmlFor='surname'>
										Surname <span className='text-red-500'>*</span>
									</Label>
									<Input
										id='surname'
										name='surname'
										type='text'
										placeholder='Rossi'
										required
										defaultValue={state.inputs?.surname}
										className={state?.errors?.surname ? 'border-red-500' : ''}
									/>
									{state.errors?.surname && (
										<p className='flex items-center text-sm text-red-500'>
											<AlertCircle className='mr-1 h-4 w-4' />
											{state.errors.surname}
										</p>
									)}
								</div>
							</div>
							<Separator className='mb-2 mt-3' />
							<div className='flex flex-col gap-4'>
								<Label htmlFor='gender'>
									Gender <span className='text-red-500'>*</span>
								</Label>
								<Select name='gender' required defaultValue={state.inputs?.gender}>
									<SelectTrigger className='bg-input/30 w-full'>
										<SelectValue placeholder={`Select your gender`} />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{['male', 'female']?.map((item, i) => (
												<SelectItem key={i} value={item}>
													{item}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
								{state.errors?.gender && (
									<p className='flex items-center text-sm text-red-500'>
										<AlertCircle className='mr-1 h-4 w-4' />
										{state.errors.gender}
									</p>
								)}
							</div>
						</div>
						<Separator className='mb-6 mt-7' />
						<div className='flex flex-col gap-4'>
							<Label htmlFor='email'>
								Email <span className='text-red-500'>*</span>
							</Label>
							<Input
								id='email'
								name='email'
								type='email'
								required
								aria-describedby='email-error'
								placeholder='email@example.com'
								defaultValue={state.inputs?.email}
								className={state?.errors?.email ? 'border-red-500' : ''}
							/>
							{state.errors?.email && (
								<p className='flex items-center text-sm text-red-500'>
									<AlertCircle className='mr-1 h-4 w-4' />
									{state.errors.email}
								</p>
							)}
							<Label htmlFor='password'>
								Password <span className='text-red-500'>*</span>
							</Label>
							<Input
								id='password'
								name='password'
								type='password'
								placeholder='********'
								required
								aria-describedby='password-error'
								defaultValue={state?.inputs?.password}
								className={state?.errors?.password ? 'border-red-500' : ''}
							/>
							{state.errors?.password && (
								<p className='flex items-center text-sm text-red-500'>
									<AlertCircle className='mr-1 h-4 w-4' />
									{state.errors.password}
								</p>
							)}
						</div>
						<Separator className='my-6' />
						<div className='flex flex-col gap-4'>
							<div className='flex items-center gap-1'>
								<Checkbox
									id='privacy_policy'
									name='privacy_policy'
									defaultChecked={state.inputs?.privacy_policy}
									className='focus:ring-3 h-4 w-4 rounded border border-gray-300 bg-gray-50 focus:ring-blue-300'
								/>
								<Label htmlFor='privacy_policy' className='ml-2 text-sm font-medium'>
									Ho letto e accetto la{' '}
									<Link href='/privacy-policy' className='hover:text-primary underline'>
										Privacy Policy
									</Link>
									{'  '}
									<span className='text-red-500'>*</span>
								</Label>
							</div>
							{state.errors?.privacy_policy && (
								<p className='mb-4 flex w-full items-center text-sm text-red-500'>
									<AlertCircle className='mr-1 h-4 w-4' />
									{state.errors.privacy_policy}
								</p>
							)}
							<div className='flex items-center gap-1'>
								<Checkbox
									id='marketing_policy'
									name='marketing_policy'
									defaultChecked={state.inputs?.marketing_policy}
									className='focus:ring-3 h-4 w-4 rounded border border-gray-300 bg-gray-50 focus:ring-blue-300'
								/>
								<Label htmlFor='marketing_policy' className='ml-2 text-sm font-medium'>
									Ho letto e accetto la{' '}
									<Link href='/marketing-policy' className='hover:text-primary underline'>
										Marketing Policy
									</Link>{' '}
								</Label>
							</div>
						</div>
					</CardContent>
					<CardFooter className='flex flex-col items-center'>
						<Button
							type='submit'
							className='w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700'
							disabled={isPending}>
							{isPending ? 'Registrazione...' : 'Registrati'}
						</Button>

						{!state.success && state.message && <p className={`mt-4 text-sm ${'text-red-500'} `}>{state.message}</p>}
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
