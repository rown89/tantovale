import type { CapturedRequest, StubScenario } from '../infrastructure/provider-stubs';

type ProviderUrls = {
	trustapUrl: string;
	shippoUrl: string;
};

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
