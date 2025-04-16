import { z } from 'zod';

export const ChatMessageSchema = z.object({
	message: z.string().min(1).max(600).nonempty(),
});
