export class CookieJar {
	private readonly cookies = new Map<string, { value: string; expiresAt?: number }>();

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

			const maxAge = attributes
				.map((attribute) => attribute.match(/^\s*max-age\s*=\s*([-+]?\d+(?:\.\d+)?)\s*$/i)?.[1])
				.find((candidate) => candidate !== undefined);
			const parsedMaxAge = maxAge === undefined ? Number.NaN : Number(maxAge);
			const maxAgeSeconds = Number.isFinite(parsedMaxAge) ? parsedMaxAge : undefined;
			const expires = attributes
				.map((attribute) => attribute.match(/^\s*expires\s*=\s*(.+?)\s*$/i)?.[1])
				.find((candidate) => candidate !== undefined);
			const expiresAt = expires ? Date.parse(expires) : Number.NaN;

			if (maxAgeSeconds !== undefined && maxAgeSeconds <= 0) {
				this.cookies.delete(name);
				continue;
			}

			if (maxAgeSeconds === undefined && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
				this.cookies.delete(name);
				continue;
			}

			this.cookies.set(name, {
				value,
				...(maxAgeSeconds === undefined
					? Number.isFinite(expiresAt) && expiresAt > Date.now()
						? { expiresAt }
						: {}
					: { expiresAt: Date.now() + maxAgeSeconds * 1_000 }),
			});
		}
	}

	header(): string {
		const values: string[] = [];
		for (const [name, cookie] of this.cookies) {
			if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) {
				this.cookies.delete(name);
				continue;
			}
			values.push(`${name}=${cookie.value}`);
		}
		return values.join('; ');
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
