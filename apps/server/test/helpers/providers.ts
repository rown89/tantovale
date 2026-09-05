import type { CapturedRequest, StubScenario } from '../infrastructure/provider-stubs';

type ProviderUrls = {
	trustapUrl: string;
	shippoUrl: string;
};

export function trustapV1WebhookPayload(
	transactionId: number | string,
	status: string,
	targetPreview: Record<string, unknown> = {},
): Record<string, unknown> {
	const targetId = String(transactionId);
	return {
		code: `basic_tx.${status}`,
		target_id: targetId,
		target_preview: { id: targetId, status, ...targetPreview },
		time: '2026-08-30T12:00:00.000Z',
	};
}

function assertLocalStubUrl(url: string): URL {
	const parsed = new URL(url);

	if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || !parsed.port || parsed.pathname !== '/') {
		throw new Error('Refusing to control a provider stub outside a worker-local 127.0.0.1 HTTP origin');
	}

	return parsed;
}

async function expectControlResponse(response: Response, operation: string): Promise<void> {
	if (!response.ok) {
		throw new Error(`${operation} failed with status ${response.status}`);
	}
}

export async function resetProviderStub(url: string): Promise<void> {
	const origin = assertLocalStubUrl(url).origin;
	const response = await fetch(`${origin}/__test/reset`, {
		method: 'POST',
		signal: AbortSignal.timeout(5_000),
	});
	await expectControlResponse(response, 'Provider stub reset');
	await response.arrayBuffer();
}

export async function resetProviderStubs(urls: ProviderUrls): Promise<void> {
	const results = await Promise.allSettled([resetProviderStub(urls.trustapUrl), resetProviderStub(urls.shippoUrl)]);
	const errors = results
		.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
		.map((result) => result.reason);

	if (errors.length > 0) {
		throw new AggregateError(errors, 'Failed to reset worker-local provider stubs');
	}
}

export async function setProviderScenario(url: string, scenario: StubScenario): Promise<void> {
	const origin = assertLocalStubUrl(url).origin;
	const response = await fetch(`${origin}/__test/scenario`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ scenario }),
		signal: AbortSignal.timeout(5_000),
	});
	await expectControlResponse(response, 'Provider stub scenario selection');
	await response.arrayBuffer();
}

export async function getProviderRequests(url: string): Promise<CapturedRequest[]> {
	const origin = assertLocalStubUrl(url).origin;
	const response = await fetch(`${origin}/__test/requests`, {
		signal: AbortSignal.timeout(5_000),
	});
	await expectControlResponse(response, 'Provider stub request read');
	return (await response.json()) as CapturedRequest[];
}

export async function getTrustapGuestIdentities(
	url: string,
): Promise<Array<{ created_at: string; email: string; id: string }>> {
	const origin = assertLocalStubUrl(url).origin;
	const response = await fetch(`${origin}/__test/guest-identities`, { signal: AbortSignal.timeout(5_000) });
	await expectControlResponse(response, 'Trustap guest identities read');
	return (await response.json()) as Array<{ created_at: string; email: string; id: string }>;
}

export async function setTrustapTransactionStatus(
	url: string,
	transactionId: number | string,
	status: string,
	overrides: {
		charge_postage_buyer?: number;
		charge_postage_client?: number;
		description?: string;
		tracking?: { carrier: string; tracking_code: string };
	} = {},
): Promise<void> {
	const origin = assertLocalStubUrl(url).origin;
	const numericId = typeof transactionId === 'string' ? Number(transactionId) : transactionId;
	const controlId = Number.isSafeInteger(numericId) ? numericId : transactionId;
	const response = await fetch(`${origin}/__test/transaction-status`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ transaction_id: controlId, status, ...overrides }),
		signal: AbortSignal.timeout(5_000),
	});
	await expectControlResponse(response, 'Trustap transaction status update');
	await response.arrayBuffer();
}

export async function seedTrustapTransaction(
	url: string,
	transaction: { transaction_id: string; buyer_id: string; seller_id: string },
): Promise<void> {
	const origin = assertLocalStubUrl(url).origin;
	const response = await fetch(`${origin}/__test/transaction`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(transaction),
		signal: AbortSignal.timeout(5_000),
	});
	await expectControlResponse(response, 'Trustap transaction fixture seed');
	await response.arrayBuffer();
}
