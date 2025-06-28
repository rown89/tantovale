type TokenOptions = {
	id: number;
	profile_id: number;
	username: string;
	email: string;
	email_verified: boolean;
	phone_verified: boolean;
	exp: number;
};

export function tokenPayload({ id, profile_id, username, email, email_verified, phone_verified, exp }: TokenOptions) {
	const tokenPayload = {
		id,
		profile_id,
		username,
		email,
		email_verified,
		phone_verified,
		exp,
	};

	return tokenPayload;
}
