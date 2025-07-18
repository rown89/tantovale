import { z } from 'zod/v4';
import { useForm } from '@tanstack/react-form';
import { toast } from 'sonner';

import { client } from '@workspace/server/client-rpc';
import { ChatMessageSchema } from '@workspace/server/extended_schemas';
import useTantovaleStore from '#stores';

interface useItemChatProps {
	item_id: number;
}

type schemaType = z.infer<typeof ChatMessageSchema>;

export function useItemChat({ item_id }: useItemChatProps) {
	const { setChatId } = useTantovaleStore();

	// Send message to user form
	const messageBoxForm = useForm({
		defaultValues: {
			message: '',
		},
		validators: {
			onSubmit: ChatMessageSchema,
		},
		onSubmit: async ({ value }: { value: schemaType }) => {
			const { message } = value;

			try {
				// create the room
				const charRoomResponse = await client.chat.auth.rooms.$post({
					json: {
						item_id,
					},
				});

				if (!charRoomResponse.ok) throw new Error('Error creating new room');

				const room = await charRoomResponse.json();

				if (!room.id) throw new Error('Error creating new room');

				// send the message to the created room
				const ChatRoomMessageResponse = await client.chat.auth.rooms[':roomId'].messages.$post({
					param: {
						roomId: String(room.id),
					},
					json: {
						message,
					},
				});

				if (!ChatRoomMessageResponse.ok) {
					throw new Error('Error Send item message');
				}

				setChatId(room.id);

				return toast(`Success!`, {
					description: 'Message correctly sent, check your inbox!',
					duration: 5000,
				});
			} catch (error) {
				toast(`Error :(`, {
					description: 'We are encountering technical problems, please retry later.',
					duration: 4000,
				});
			}
		},
	});

	return {
		messageBoxForm,
	};
}
