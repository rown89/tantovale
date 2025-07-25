'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Command, CommandGroup, CommandItem, CommandList } from '@workspace/ui/components/command';
import { useIsMobile } from '@workspace/ui/hooks/use-mobile';

import { useAuth } from '#providers/auth-providers';
import { profileOptions } from '#shared/profile-options';

export default function ProfileMenu() {
	const { setUser } = useAuth();
	const router = useRouter();
	const pathname = usePathname();
	const isMobile = useIsMobile();

	return (
		<>
			{!isMobile && (
				<div className='h-fit w-full min-w-[300px] rounded-lg border shadow-md md:max-w-[300px]'>
					<Command defaultValue={'-'}>
						<CommandList className='overflow-hidden'>
							<CommandGroup heading='Menu' className='flex flex-col gap-1'>
								<div className={`flex flex-col gap-1 font-bold`}>
									{profileOptions.map((item, i) => (
										<CommandItem
											key={i}
											className={`hover:cursor-pointer hover:font-extrabold ${
												pathname === item.url
													? 'bg-accent text-accent-foreground font-extrabold'
													: 'text-foreground hover:text-muted-foreground'
											}`}
											onClickCapture={() => router.push(item.url)}>
											<item.Icon
												className={` ${pathname === item.url ? 'text-accent-foreground' : 'text-foreground'}`}
											/>

											<span>{item.label}</span>
										</CommandItem>
									))}

									<CommandItem
										className='bg-background my-4'
										onClickCapture={() => {
											setUser(null);
											router.push('/api/logout');
										}}>
										<LogOut className='hover:text-white' />
										<span>Logout</span>
									</CommandItem>
								</div>
							</CommandGroup>
						</CommandList>
					</Command>
				</div>
			)}
		</>
	);
}
