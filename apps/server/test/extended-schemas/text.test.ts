import { describe, expect, it, vi } from 'vitest';

import { ChatMessageSchema } from '../../src/extended_schemas/chat';
import { create_order_proposal_schema } from '../../src/extended_schemas/order_proposals';
import { hasAtMostUnicodeCodePoints } from '../../src/extended_schemas/text';

describe('Unicode text limits', () => {
	it('stops reading as soon as the maximum code-point count is exceeded', () => {
		let visited = 0;
		const instrumented = {
			*[Symbol.iterator]() {
				for (const codePoint of ['a', 'b', '😀', 'd', 'e', 'f', 'g', 'h']) {
					visited += 1;
					yield codePoint;
				}
			},
		};

		expect(hasAtMostUnicodeCodePoints(instrumented, 3)).toBe(false);
		expect(visited).toBe(4);
	});

	it.each([
		['chat', ChatMessageSchema.shape.message],
		['proposal', create_order_proposal_schema.shape.message],
	] as const)('aborts %s validation before later refinements scan oversized input', (_name, messageSchema) => {
		const laterRefinement = vi.fn(() => true);
		const result = messageSchema.refine(laterRefinement).safeParse('😀'.repeat(601));

		expect(result.success).toBe(false);
		expect(laterRefinement).not.toHaveBeenCalled();
	});

	it.each([
		['chat', ChatMessageSchema],
		['proposal', create_order_proposal_schema],
	] as const)('preserves the %s oversized-message issue and field path', (name, schema) => {
		const common = { message: '😀'.repeat(601) };
		const input =
			name === 'chat' ? common : { ...common, item_id: 1, proposal_price: 10_000, shipping_label_id: 'shipment-test' };
		const result = schema.safeParse(input);

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues).toContainEqual(
			expect.objectContaining({
				message: 'Message must contain at most 600 Unicode code points',
				path: ['message'],
			}),
		);
	});
});
