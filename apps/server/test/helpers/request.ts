export class CookieJar {
	private readonly cookies = new Map<string, string>();

	capture(setCookieHeaders: string[]): void {
		for (const header of setCookieHeaders) {
			const [pair, ...attributes] = header.split(';');
			const separator = pair?.indexOf('=') ?? -1;

			if (separator <= 0) {
				continue;
			}

			const name = pair!.slice(0, separator).trim();
			const value = pair!.slice(separator + 1).trim();
			const deleted = value === '' || attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute));

			if (deleted) {
				this.cookies.delete(name);
			} else {
				this.cookies.set(name, value);
			}
		}
	}

	header(): string {
		return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
	}
}

export function jsonRequest(method: string, body?: unknown, jar?: CookieJar): RequestInit {
	const cookie = jar?.header();

	return {
		method,
		headers: {
			'content-type': 'application/json',
			...(cookie ? { cookie } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	};
}

export function captureCookies(response: Response, jar: CookieJar): void {
	jar.capture(response.headers.getSetCookie());
}
