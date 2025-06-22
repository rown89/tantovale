'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare } from 'lucide-react';

import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarInput,
} from '@workspace/ui/components/sidebar';
import { Avatar, AvatarFallback } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { formatPrice } from '@workspace/ui/lib/utils';

type ChatRoom = {
	id: number;
	item: {
		id: number;
		title: string;
		price: number;
	};
	author: {
		id: number | null;
		username: string;
	};
	buyer: {
		id: number;
		username: string;
	};
	last_message: {
		id: number | null;
		message: string | null;
		created_at: string | null;
		read_at: string | null;
		sender_id: number | null;
	} | null;
};

interface ChatSidebarProps {
	id: string;
	collapsable: 'none' | 'offcanvas';
	chatRooms: ChatRoom[];
	currentUserId: number;
}

export function ChatSidebar({ id, collapsable, chatRooms, currentUserId }: ChatSidebarProps) {
	const pathname = usePathname();
	const [searchTerm, setSearchTerm] = useState('');

	const filteredChatRooms = chatRooms.filter(
		(room) =>
			room?.item.title?.toLowerCase()?.includes(searchTerm.toLowerCase()) ||
			room?.buyer?.username?.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	return (
		<Sidebar id={id} collapsible={collapsable} className='relative max-h-[calc(100vh-74px)] w-full'>
			<SidebarHeader className='bg-background sticky top-0 z-10 px-0'>
				<div className='flex items-center justify-between px-2 py-3'>
					<h2 className='text-lg font-semibold'>Messages</h2>
					<Badge variant='outline' className='ml-2'>
						{chatRooms.length}
					</Badge>
				</div>
				<div className='px-2 pb-2'>
					<SidebarInput
						placeholder='Search conversations...'
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{filteredChatRooms.length > 0 ? (
								filteredChatRooms.map((room) => {
									const isActive = pathname === `/auth/chat/${room.id}`;
									const lastMessage = room.last_message;

									// Determine if current user is buyer or seller
									const isBuyer = room?.buyer?.id === currentUserId;
									const otherUser = isBuyer ? room.author : room.buyer;

									return (
										<SidebarMenuItem key={room.id}>
											<SidebarMenuButton asChild isActive={isActive} className='flex h-full items-start gap-3 py-3'>
												<Link href={`/auth/chat/${room.id}`}>
													<Avatar className='h-10 w-10'>
														<AvatarFallback>{otherUser?.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
													</Avatar>
													<div className='flex-1 overflow-hidden'>
														<div className='flex items-center justify-between'>
															<p className='truncate font-bold'>{otherUser?.username}</p>
															{lastMessage && (
																<span className='text-foreground text-xs'>
																	{lastMessage.created_at &&
																		formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true })}
																</span>
															)}
														</div>
														<p className='text-foreground/70 truncate text-sm'>{formatPrice(room.item.price)}€</p>
														{lastMessage && <p className='truncate text-sm'>{lastMessage.message}</p>}
													</div>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})
							) : (
								<div className='flex flex-col items-center justify-center p-4 text-center'>
									<MessageSquare className='text-muted-foreground mb-2 h-8 w-8' />
									<p className='text-muted-foreground text-sm'>
										{searchTerm ? 'No conversations found' : 'No conversations yet'}
									</p>
								</div>
							)}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
