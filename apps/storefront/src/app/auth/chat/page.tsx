import { MessageSquare } from 'lucide-react';

export default function ChatPage() {
	return (
		<div className='flex h-full flex-col items-center justify-center p-4 text-center'>
			<MessageSquare className='text-muted-foreground mb-4 h-12 w-12' />
			<h2 className='mb-2 text-2xl font-semibold'>Your Messages</h2>
			<p className='text-muted-foreground max-w-md'>
				Select a conversation from the sidebar to view your messages or start a new conversation by visiting an item
				page.
			</p>
		</div>
	);
}
