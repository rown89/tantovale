import { z } from 'zod';

export const ChatMessageSchema = z.object({
	message: z.string().min(10).max(600).nonempty(),
});
