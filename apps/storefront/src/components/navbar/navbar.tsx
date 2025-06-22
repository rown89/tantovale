'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, LogOut, MessageSquare, Plus, User } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuItem,
} from '@workspace/ui/components/dropdown-menu';

import { useAuth } from '#providers/auth-providers';
import { profileOptions } from '#shared/profile-options';
import AddressProtectedRoute from '#utils/address-protected';
import { toast } from 'sonner';
import useTantovaleStore from '#stores';
import { Spinner } from '@workspace/ui/components/spinner';

export default function NavBar() {
	const { user, loadingUser, logout } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const { setIsAddressLoading, isAddressLoading, setAddressId } = useTantovaleStore();

	const [open, setOpen] = useState(false);

	return (
		<div className='container mx-auto flex min-h-[72px] items-center justify-between px-4 py-4 xl:px-0'>
			<div className='flex items-center'>
				<Link href='/' className='text-xl font-bold'>
					Tantovale
				</Link>
			</div>
			<div></div>
			<div className='ml-auto flex items-center'>
				{!loadingUser && (
					<Button
						className='text-foreground ml-2 mr-3 font-bold'
						variant='ghost'
						disabled={isAddressLoading}
						onClick={async () => {
							if (!user) {
								router.push('/login');
							} else {
								setIsAddressLoading(true);

								const address_id = await AddressProtectedRoute();

								if (address_id) {
									setAddressId(address_id);
									router.push('/auth/item/new');
								} else {
									toast.error('You must have an active address to sell');
									router.push('/auth/profile-setup/address');
								}
								setIsAddressLoading(false);
							}
						}}>
						{isAddressLoading ? (
							<Spinner />
						) : (
							<>
								<Plus />
								Sell
							</>
						)}
					</Button>
				)}

				{!loadingUser && (
					<>
						{!user ? (
							<div className='flex items-center'>
								<div className='bg-card border-border flex overflow-hidden rounded-lg border'>
									<Link href='/login'>
										<Button
											variant='ghost'
											className='hover:bg-primary hover:text-primary-foreground rounded-none px-4 py-2 transition-colors'>
											Login
										</Button>
									</Link>
									<div className='bg-border h-8 w-px self-center'></div>
									<Link href='/signup'>
										<Button
											variant='ghost'
											className='hover:bg-accent hover:text-accent-foreground rounded-none px-4 py-2 transition-colors'>
											Signup
										</Button>
									</Link>
								</div>
							</div>
						) : (
							<div className='flex items-center space-x-2'>
								<Button
									variant='ghost'
									className='relative h-10 w-10 rounded-full'
									onClick={() => router.push('/auth/chat')}>
									<MessageSquare />
								</Button>
								<Button
									variant='ghost'
									className='relative h-10 w-10 rounded-full'
									onClick={() => router.push('/auth/favorites')}>
									<Heart />
								</Button>
								<DropdownMenu open={open} onOpenChange={setOpen}>
									<DropdownMenuTrigger asChild>
										<Button variant='ghost' className='relative h-10 w-10 rounded-full'>
											<User />
										</Button>
									</DropdownMenuTrigger>

									<DropdownMenuContent className='mt-1 w-56' align='end' forceMount>
										<DropdownMenuLabel className='text-accent mb-1 flex items-center gap-1 text-sm font-medium leading-none'>
											<span className='text-foreground/40'>Hello,</span>
											<p className='overflow-auto text-ellipsis'>{user.username}</p>
										</DropdownMenuLabel>
										<DropdownMenuSeparator />

										<div className='flex flex-col gap-1'>
											{profileOptions.map((item, i) => (
												<DropdownMenuItem
													key={i}
													className={`hover:cursor-pointer hover:font-extrabold ${
														pathname === item.url
															? 'bg-accent text-accent-foreground font-extrabold'
															: 'text-foreground hover:text-muted-foreground'
													}`}
													onClick={async () => router.push(item.url)}>
													{
														<item.Icon
															className={` ${pathname === item.url ? 'text-accent-foreground' : 'text-foreground'}`}
														/>
													}
													<span>{item.label}</span>
												</DropdownMenuItem>
											))}
										</div>

										<DropdownMenuSeparator />
										<DropdownMenuItem className='hover:cursor-pointer' onClick={async () => logout()}>
											<LogOut className='mr-2 h-4 w-4' />
											<span>Log out</span>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
