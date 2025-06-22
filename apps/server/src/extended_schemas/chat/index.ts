import { z } from 'zod/v4';

export const ChatMessageSchema = z.object({
	message: z.string().min(1).max(600).nonempty(),
});
