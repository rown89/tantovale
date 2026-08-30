export type MailpitRecipient = {
	Address: string;
};

export type MailpitMessage = {
	ID: string;
	To: MailpitRecipient[];
	Subject: string;
};

export type MailpitSearch = {
	messages: MailpitMessage[];
};

export type MailpitMessageDetail = {
	HTML: string;
	Text: string;
};

const EMAIL_WAIT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;
const REQUEST_TIMEOUT_MS = 1_000;

/* eslint-disable turbo/no-undeclared-env-vars -- The isolated Vitest harness supplies the local Mailpit URL. */
function apiOrigin(): string {
	try {
		const value = process.env.MAILPIT_API_URL;
		const parsed = value ? new URL(value) : undefined;

		if (!parsed || parsed.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
			throw new Error('Unsafe Mailpit API URL');
		}

		return parsed.origin;
	} catch {
		throw new Error('Unsafe Mailpit API URL');
	}
}

async function fetchMailpit(url: string, deadline: number): Promise<Response> {
	const remaining = deadline - Date.now();

	if (remaining <= 0) {
		throw new Error('Mailpit API request timed out');
	}

	let response: Response;
	try {
		response = await fetch(url, { signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Mailpit API request failed: ${message}`, { cause: error });
	}

	if (!response.ok) {
		throw new Error(`Mailpit API request failed: ${response.status} ${response.statusText}`);
	}

	return response;
}

export async function waitForEmail(recipient: string, subject: string): Promise<MailpitMessageDetail> {
	const origin = apiOrigin();
	const deadline = Date.now() + EMAIL_WAIT_TIMEOUT_MS;
	const searchUrl = new URL('/api/v1/search', origin);
	searchUrl.searchParams.set('query', `to:${recipient}`);

	while (Date.now() < deadline) {
		const response = await fetchMailpit(searchUrl.toString(), deadline);
		const search = (await response.json()) as MailpitSearch;
		const message = search.messages.find(
			(candidate) => candidate.Subject === subject && candidate.To.some(({ Address }) => Address === recipient),
		);

		if (message) {
			const detailUrl = `${origin}/api/v1/message/${encodeURIComponent(message.ID)}`;
			const detailResponse = await fetchMailpit(detailUrl, deadline);
			return (await detailResponse.json()) as MailpitMessageDetail;
		}

		await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}

	throw new Error(`Email not received for ${recipient} with subject ${subject}`);
}

export function extractTokenFromLink(content: string, parameter: string): string {
	const url = content.match(/https?:\/\/[^\s"<>]+/)?.[0]?.replaceAll('&amp;', '&');

	if (!url) {
		throw new Error('Email contains no HTTP link');
	}

	const value = new URL(url).searchParams.get(parameter);
	if (!value) {
		throw new Error(`Email link has no ${parameter} parameter`);
	}

	return value;
}
