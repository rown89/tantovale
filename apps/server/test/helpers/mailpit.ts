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

class MailpitRequestError extends Error {
	constructor(
		message: string,
		readonly transient: boolean,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

/* eslint-disable turbo/no-undeclared-env-vars -- The isolated Vitest harness supplies the local Mailpit URL. */
function apiOrigin(): string {
	try {
		const value = process.env.MAILPIT_API_URL;
		const parsed = value ? new URL(value) : undefined;

		const hostname = parsed?.hostname.replace(/^\[|\]$/g, '') ?? '';
		if (
			!parsed ||
			parsed.protocol !== 'http:' ||
			parsed.username ||
			parsed.password ||
			!['localhost', '127.0.0.1', '::1'].includes(hostname)
		) {
			throw new Error('Unsafe Mailpit API URL');
		}

		return parsed.origin;
	} catch {
		throw new Error('Unsafe Mailpit API URL');
	}
}

function abortPromise(signal: AbortSignal): Promise<never> {
	if (signal.aborted) {
		return Promise.reject(signal.reason);
	}

	return new Promise<never>((_resolve, reject) => {
		signal.addEventListener('abort', () => reject(signal.reason), { once: true });
	});
}

async function fetchMailpitJson<T>(url: string, deadline: number): Promise<T> {
	const remaining = deadline - Date.now();

	if (remaining <= 0) {
		throw new MailpitRequestError('Mailpit API request timed out', true);
	}

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(new DOMException('Mailpit API request timed out', 'TimeoutError')),
		Math.min(REQUEST_TIMEOUT_MS, remaining),
	);
	try {
		let response: Response;
		try {
			response = await fetch(url, { signal: controller.signal });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new MailpitRequestError(`Mailpit API request failed: ${message}`, true, { cause: error });
		}

		if (!response.ok) {
			const transient = response.status >= 500 || response.status === 408 || response.status === 429;
			throw new MailpitRequestError(
				`Mailpit API request failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
				transient,
			);
		}

		try {
			return (await Promise.race([response.json() as Promise<T>, abortPromise(controller.signal)])) as T;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new MailpitRequestError(`Mailpit API response body failed: ${message}`, !(error instanceof SyntaxError), {
				cause: error,
			});
		}
	} finally {
		clearTimeout(timeout);
	}
}

export async function waitForEmail(recipient: string, subject: string): Promise<MailpitMessageDetail> {
	const origin = apiOrigin();
	const deadline = Date.now() + EMAIL_WAIT_TIMEOUT_MS;
	const searchUrl = new URL('/api/v1/search', origin);
	searchUrl.searchParams.set('query', `to:${recipient}`);

	let lastError: Error | undefined;
	while (Date.now() < deadline) {
		try {
			const search = await fetchMailpitJson<MailpitSearch>(searchUrl.toString(), deadline);
			const message = search.messages.find(
				(candidate) => candidate.Subject === subject && candidate.To.some(({ Address }) => Address === recipient),
			);

			if (message) {
				const detailUrl = `${origin}/api/v1/message/${encodeURIComponent(message.ID)}`;
				return await fetchMailpitJson<MailpitMessageDetail>(detailUrl, deadline);
			}
		} catch (error) {
			if (!(error instanceof MailpitRequestError) || !error.transient) {
				throw error;
			}
			lastError = error;
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			break;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)));
	}

	const reason = lastError ? `; last Mailpit error: ${lastError.message}` : '';
	throw new Error(`Email not received for ${recipient} with subject ${subject}${reason}`, { cause: lastError });
}

export function extractTokenFromLink(content: string, parameter: string): string {
	const candidates = content.match(/https?:\/\/[^\s"'<>]+/gi);
	if (!candidates) {
		throw new Error('Email contains no HTTP link');
	}

	for (const candidate of candidates) {
		try {
			const url = candidate.replaceAll('&amp;', '&').replace(/[.,!?;:]+$/, '');
			const value = new URL(url).searchParams.get(parameter);
			if (value) {
				return value;
			}
		} catch {
			// Continue scanning malformed candidates for a usable link.
		}
	}

	throw new Error(`Email link has no ${parameter} parameter`);
}
