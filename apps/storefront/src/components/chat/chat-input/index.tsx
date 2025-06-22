'use client';

import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';
import { client } from '@workspace/server/client-rpc';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { ChatMessageSchema } from '@workspace/server/extended_schemas';
import { z } from 'zod/v4';
import { FieldInfo } from '../../forms/utils/field-info';

interface ChatInputProps {
	chatRoomId: number;
}

export function ChatInput({ chatRoomId }: ChatInputProps) {
	const queryClient = useQueryClient();

	const sendMessage = useMutation({
		mutationFn: async (message: string) => {
			await client.chat.auth.rooms[':roomId'].messages.$post({
				param: {
					roomId: chatRoomId?.toString(),
				},
				json: { message },
			});
		},
		onSuccess: () => {
			form.reset();

			queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
		},
		onError: (error) => {
			console.error('Failed to send message:', error);
		},
	});

	type schemaType = z.infer<typeof ChatMessageSchema>;

	const form = useForm({
		defaultValues: {
			message: '',
		},
		validators: {
			onSubmit: ChatMessageSchema,
		},
		onSubmit: async ({ value }: { value: schemaType }) => {
			sendMessage.mutate(value.message);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className='p-4'>
			<div className='flex items-center gap-2'>
				<form.Field name='message'>
					{(field) => {
						const { name, handleBlur, handleChange, state } = field;
						const { value } = state;

						return (
							<div className='flex w-full flex-col gap-2'>
								<FieldInfo field={field} />
								<Textarea
									id={name}
									name={name}
									value={value !== undefined ? value?.toString() : ''}
									onBlur={handleBlur}
									onChange={(e) => handleChange(e.target.value)}
									placeholder='Type your message...'
									className='flex-1 resize-none'
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											form.handleSubmit();
										}
									}}
								/>
							</div>
						);
					}}
				</form.Field>

				<form.Subscribe
					selector={(formState) => ({
						canSubmit: formState.canSubmit,
						isSubmitting: formState.isSubmitting,
						isDirty: formState.isDirty,
					})}>
					{(state) => {
						const { canSubmit, isSubmitting } = state;
						return (
							<Button type='submit' disabled={!canSubmit} className='sticky bottom-0'>
								{isSubmitting ? '...' : 'Send'}
							</Button>
						);
					}}
				</form.Subscribe>
			</div>
		</form>
	);
}
