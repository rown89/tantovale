import { z } from 'zod/v4';
import { hasAtMostUnicodeCodePoints } from '../text';

export const ChatMessageSchema = z.object({
	message: z
		.string()
		.min(1)
		.nonempty()
		.refine((value) => hasAtMostUnicodeCodePoints(value, 600), {
			abort: true,
			message: 'Message must contain at most 600 Unicode code points',
		}),
});
