import { beforeEach, describe, expect, it, vi } from 'vitest';

const storefrontStorePath = '../../../storefront/src/stores/index';
const clientLogoutPath = '../../../storefront/src/utils/client-logout';

type CommerceStoreState = {
	commerceOwnerProfileId: number | null;
	commerceOwnerItemId: number | null;
	commerceOwnerEpoch: number;
	buyNowRequestToken: number;
	proposalRequestToken: number;
	clientBuyNowOrderId: number;
	clientBuyNowOrderStatus: string;
	isBuyNowModalOpen: boolean;
	isCreatingOrder: boolean;
	clientProposalId?: number;
	clientProposalCreatedAt?: string;
	isProposalModalOpen: boolean;
	isCreatingProposal: boolean;
	orderProposal?: unknown;
	chatId?: number;
	address_id?: number;
	setCommerceContext(profileId: number | null, itemId: number): void;
	resetPrivateCommerceState(): void;
	handleBuyNow(itemId: number): Promise<{ success: boolean; payment_url?: string; error?: string }>;
	handleProposal(input: {
		item_id: number;
		proposal_price: number;
		shipping_label_id: string;
		shipping_quote_id: string;
		message: string;
	}): Promise<unknown>;
	handleBuyerAbortedProposal(proposalId: number): Promise<boolean>;
};

type Store = {
	getState(): CommerceStoreState;
	setState(state: Partial<CommerceStoreState>): void;
};

async function loadStore(client: unknown): Promise<Store> {
	vi.doMock('@workspace/server/client-rpc', () => ({ client }));
	const module = (await import(/* @vite-ignore */ storefrontStorePath)) as { default: Store };
	return module.default;
}

function seedPrivateState(store: Store) {
	store.setState({
		clientBuyNowOrderId: 71,
		clientBuyNowOrderStatus: 'payment_pending',
		isBuyNowModalOpen: true,
		isCreatingOrder: true,
		clientProposalId: 81,
		clientProposalCreatedAt: '2037-10-21T07:28:00.000Z',
		isProposalModalOpen: true,
		isCreatingProposal: true,
		orderProposal: { id: 81, status: 'pending' },
		chatId: 91,
		address_id: 101,
	});
}

function expectPrivateStateCleared(state: CommerceStoreState) {
	expect(state).toMatchObject({
		clientBuyNowOrderId: 0,
		clientBuyNowOrderStatus: '',
		isBuyNowModalOpen: false,
		isCreatingOrder: false,
		isProposalModalOpen: false,
		isCreatingProposal: false,
	});
	expect(state.clientProposalId).toBeUndefined();
	expect(state.clientProposalCreatedAt).toBeUndefined();
	expect(state.orderProposal).toBeUndefined();
	expect(state.chatId).toBeUndefined();
	expect(state.address_id).toBeUndefined();
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
});

describe('storefront commerce Zustand ownership', () => {
	it('advances the owner epoch on every reset and activation, including the same owner tuple', async () => {
		const store = await loadStore({});
		const initialEpoch = store.getState().commerceOwnerEpoch;

		store.getState().setCommerceContext(17, 101);
		const firstActivationEpoch = store.getState().commerceOwnerEpoch;
		store.getState().resetPrivateCommerceState();
		const resetEpoch = store.getState().commerceOwnerEpoch;
		store.getState().setCommerceContext(17, 101);

		expect(firstActivationEpoch).toBeGreaterThan(initialEpoch);
		expect(resetEpoch).toBeGreaterThan(firstActivationEpoch);
		expect(store.getState().commerceOwnerEpoch).toBeGreaterThan(resetEpoch);
	});

	it('clears every private order and proposal field when navigating from item A to item B', async () => {
		const store = await loadStore({});
		store.getState().setCommerceContext(17, 101);
		seedPrivateState(store);

		store.getState().setCommerceContext(17, 202);

		expect(store.getState()).toMatchObject({ commerceOwnerProfileId: 17, commerceOwnerItemId: 202 });
		expectPrivateStateCleared(store.getState());
	});

	it('clears the same-item state on an account switch', async () => {
		const store = await loadStore({});
		store.getState().setCommerceContext(17, 101);
		seedPrivateState(store);
		const { commitClientIdentity } = (await import(/* @vite-ignore */ clientLogoutPath)) as {
			commitClientIdentity<T>(input: {
				currentIdentity: T;
				nextIdentity: T;
				resetPrivateCommerceState(): void;
				commit(identity: T): void;
			}): void;
		};
		const events: string[] = [];

		commitClientIdentity({
			currentIdentity: { profile_id: 17 },
			nextIdentity: { profile_id: 23 },
			resetPrivateCommerceState: () => {
				store.getState().resetPrivateCommerceState();
				events.push('commerce');
			},
			commit: () => events.push('identity'),
		});
		expect(events).toEqual(['commerce', 'identity']);
		expect(store.getState()).toMatchObject({ commerceOwnerProfileId: null, commerceOwnerItemId: null });
		expectPrivateStateCleared(store.getState());

		store.getState().setCommerceContext(23, 101);
		expect(store.getState()).toMatchObject({ commerceOwnerProfileId: 23, commerceOwnerItemId: 101 });
	});

	it('clears private queries and commerce state before exposing logout identity or navigation', async () => {
		const store = await loadStore({});
		store.getState().setCommerceContext(17, 101);
		seedPrivateState(store);
		const events: string[] = [];
		const { logoutClientSession } = (await import(/* @vite-ignore */ clientLogoutPath)) as {
			logoutClientSession(input: {
				queryClient: { removeQueries(): void };
				resetPrivateCommerceState(): void;
				clearIdentity(): void;
				navigateToLogout(): void;
			}): void;
		};

		logoutClientSession({
			queryClient: { removeQueries: () => events.push('queries') },
			resetPrivateCommerceState: () => {
				store.getState().resetPrivateCommerceState();
				events.push('commerce');
			},
			clearIdentity: () => events.push('identity'),
			navigateToLogout: () => events.push('navigation'),
		});

		expect(events).toEqual(['queries', 'commerce', 'identity', 'navigation']);
		expect(store.getState()).toMatchObject({ commerceOwnerProfileId: null, commerceOwnerItemId: null });
		expectPrivateStateCleared(store.getState());
	});

	it('does not publish an old account payment URL or proposal after ownership changes in flight', async () => {
		let releaseBuyNow!: (response: Response) => void;
		let releaseProposal!: (response: Response) => void;
		const buyNowResponse = new Promise<Response>((resolve) => {
			releaseBuyNow = resolve;
		});
		const proposalResponse = new Promise<Response>((resolve) => {
			releaseProposal = resolve;
		});
		const store = await loadStore({
			item: { auth: { buy_now: { $post: vi.fn().mockReturnValue(buyNowResponse) } } },
			orders_proposals: { auth: { create: { $post: vi.fn().mockReturnValue(proposalResponse) } } },
		});
		store.getState().setCommerceContext(17, 101);
		const buyNow = store.getState().handleBuyNow(101);
		const proposal = store.getState().handleProposal({
			item_id: 101,
			proposal_price: 10_000,
			shipping_label_id: 'label-1',
			shipping_quote_id: 'quote-1',
			message: 'Offer',
		});

		store.getState().setCommerceContext(23, 101);
		releaseBuyNow(
			new Response(
				JSON.stringify({
					success: true,
					order: { id: 71, status: 'payment_pending' },
					payment_url: 'https://payments.invalid/private-user-17',
				}),
				{ status: 200 },
			),
		);
		releaseProposal(
			new Response(
				JSON.stringify({
					proposal: {
						id: 81,
						item_id: 101,
						status: 'pending',
						proposal_price: 10_000,
						profile_id: 17,
						created_at: '2037-10-21T07:28:00.000Z',
						updated_at: '2037-10-21T07:28:00.000Z',
						shipping_label_id: 'label-1',
					},
					chatRoomId: 91,
				}),
				{ status: 200 },
			),
		);

		await expect(buyNow).resolves.toEqual({ success: false, error: 'Commerce context changed' });
		await expect(proposal).resolves.toBeUndefined();
		expectPrivateStateCleared(store.getState());
	});

	it.each(['old-first', 'old-last'] as const)(
		'keeps a remounted Buy Now request isolated when the old ABA request resolves %s',
		async (resolutionOrder) => {
			let releaseOld!: (response: Response) => void;
			let releaseNew!: (response: Response) => void;
			const post = vi
				.fn()
				.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseOld = resolve)))
				.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseNew = resolve)));
			const store = await loadStore({ item: { auth: { buy_now: { $post: post } } } });
			store.getState().setCommerceContext(17, 101);
			const oldRequest = store.getState().handleBuyNow(101);
			store.getState().resetPrivateCommerceState();
			store.getState().setCommerceContext(17, 101);
			const newRequest = store.getState().handleBuyNow(101);
			const oldResponse = new Response(
				JSON.stringify({
					success: true,
					order: { id: 71, status: 'payment_pending' },
					payment_url: 'https://payments.invalid/old',
				}),
				{ status: 200 },
			);
			const newResponse = new Response(
				JSON.stringify({
					success: true,
					order: { id: 72, status: 'payment_pending' },
					payment_url: 'https://payments.invalid/new',
				}),
				{ status: 200 },
			);

			if (resolutionOrder === 'old-first') {
				releaseOld(oldResponse);
				const oldResult = await oldRequest;
				expect(oldResult.payment_url).toBeUndefined();
				expect(store.getState()).toMatchObject({ clientBuyNowOrderId: 0, isCreatingOrder: true });
				releaseNew(newResponse);
				await expect(newRequest).resolves.toMatchObject({ success: true, payment_url: 'https://payments.invalid/new' });
			} else {
				releaseNew(newResponse);
				await expect(newRequest).resolves.toMatchObject({ success: true, payment_url: 'https://payments.invalid/new' });
				releaseOld(oldResponse);
				const oldResult = await oldRequest;
				expect(oldResult.payment_url).toBeUndefined();
			}

			expect(store.getState()).toMatchObject({
				clientBuyNowOrderId: 72,
				clientBuyNowOrderStatus: 'payment_pending',
				isCreatingOrder: false,
			});
		},
	);

	it.each(['old-first', 'old-last'] as const)(
		'keeps a remounted proposal request isolated when the old ABA request resolves %s',
		async (resolutionOrder) => {
			let releaseOld!: (response: Response) => void;
			let releaseNew!: (response: Response) => void;
			const post = vi
				.fn()
				.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseOld = resolve)))
				.mockReturnValueOnce(new Promise<Response>((resolve) => (releaseNew = resolve)));
			const store = await loadStore({ orders_proposals: { auth: { create: { $post: post } } } });
			const proposalInput = {
				item_id: 101,
				proposal_price: 10_000,
				shipping_label_id: 'label-1',
				shipping_quote_id: 'quote-1',
				message: 'Offer',
			};
			store.getState().setCommerceContext(17, 101);
			const oldRequest = store.getState().handleProposal(proposalInput);
			store.getState().resetPrivateCommerceState();
			store.getState().setCommerceContext(17, 101);
			const newRequest = store.getState().handleProposal(proposalInput);
			const proposalResponse = (id: number) =>
				new Response(
					JSON.stringify({
						proposal: {
							id,
							item_id: 101,
							status: 'pending',
							proposal_price: 10_000,
							profile_id: 17,
							created_at: '2037-10-21T07:28:00.000Z',
							updated_at: '2037-10-21T07:28:00.000Z',
							shipping_label_id: 'label-1',
						},
						chatRoomId: 91,
					}),
					{ status: 200 },
				);

			if (resolutionOrder === 'old-first') {
				releaseOld(proposalResponse(81));
				await expect(oldRequest).resolves.toBeUndefined();
				expect(store.getState()).toMatchObject({ clientProposalId: undefined, isCreatingProposal: true });
				releaseNew(proposalResponse(82));
				await expect(newRequest).resolves.toMatchObject({ id: 82 });
			} else {
				releaseNew(proposalResponse(82));
				await expect(newRequest).resolves.toMatchObject({ id: 82 });
				releaseOld(proposalResponse(81));
				await expect(oldRequest).resolves.toBeUndefined();
			}

			expect(store.getState()).toMatchObject({ clientProposalId: 82, isCreatingProposal: false });
		},
	);

	it('fails closed when proposal abort returns a non-ok response', async () => {
		const store = await loadStore({
			orders_proposals: {
				auth: { buyer_aborted_proposal: { $post: vi.fn().mockResolvedValue(new Response(null, { status: 500 })) } },
			},
		});
		store.getState().setCommerceContext(17, 101);
		store.setState({ clientProposalId: 81, clientProposalCreatedAt: '2037-10-21T07:28:00.000Z' });

		await expect(store.getState().handleBuyerAbortedProposal(81)).resolves.toBe(false);
		expect(store.getState()).toMatchObject({
			clientProposalId: 81,
			clientProposalCreatedAt: '2037-10-21T07:28:00.000Z',
			isCreatingProposal: false,
		});
	});

	it('fails closed when proposal abort throws', async () => {
		const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store = await loadStore({
			orders_proposals: {
				auth: { buyer_aborted_proposal: { $post: vi.fn().mockRejectedValue(new Error('network')) } },
			},
		});
		store.getState().setCommerceContext(17, 101);
		store.setState({ clientProposalId: 81, clientProposalCreatedAt: '2037-10-21T07:28:00.000Z' });

		await expect(store.getState().handleBuyerAbortedProposal(81)).resolves.toBe(false);
		expect(store.getState().clientProposalId).toBe(81);
		expect(errorLog).toHaveBeenCalledOnce();
		errorLog.mockRestore();
	});

	it('fails closed when proposal abort succeeds after its owner becomes stale', async () => {
		let release!: (response: Response) => void;
		const store = await loadStore({
			orders_proposals: {
				auth: {
					buyer_aborted_proposal: {
						$post: vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve))),
					},
				},
			},
		});
		store.getState().setCommerceContext(17, 101);
		store.setState({ clientProposalId: 81, clientProposalCreatedAt: '2037-10-21T07:28:00.000Z' });
		const abort = store.getState().handleBuyerAbortedProposal(81);
		store.getState().resetPrivateCommerceState();
		store.getState().setCommerceContext(17, 101);
		store.setState({ clientProposalId: 82, clientProposalCreatedAt: '2037-10-22T07:28:00.000Z' });
		release(new Response(null, { status: 200 }));

		await expect(abort).resolves.toBe(false);
		expect(store.getState()).toMatchObject({ clientProposalId: 82, isCreatingProposal: false });
	});

	it('clears proposal state only after a current successful abort', async () => {
		const store = await loadStore({
			orders_proposals: {
				auth: { buyer_aborted_proposal: { $post: vi.fn().mockResolvedValue(new Response(null, { status: 200 })) } },
			},
		});
		store.getState().setCommerceContext(17, 101);
		store.setState({ clientProposalId: 81, clientProposalCreatedAt: '2037-10-21T07:28:00.000Z' });

		await expect(store.getState().handleBuyerAbortedProposal(81)).resolves.toBe(true);
		expect(store.getState()).toMatchObject({
			clientProposalId: undefined,
			clientProposalCreatedAt: undefined,
			isCreatingProposal: false,
		});
	});
});
