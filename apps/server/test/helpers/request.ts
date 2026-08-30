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
			if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
				continue;
			}

			const deleted = attributes.some((attribute) => {
				const maxAge = attribute.match(/^\s*max-age\s*=\s*([-+]?\d+(?:\.\d+)?)\s*$/i);
				if (maxAge) {
					return Number(maxAge[1]) <= 0;
				}

				const expires = attribute.match(/^\s*expires\s*=\s*(.+?)\s*$/i)?.[1];
				const expiresAt = expires ? Date.parse(expires) : Number.NaN;
				return Number.isFinite(expiresAt) && expiresAt <= Date.now();
			});

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
