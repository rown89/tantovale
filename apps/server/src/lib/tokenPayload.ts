type TokenOptions = {
  id: number;
  username: string;
  email_verified: boolean;
  phone_verified: boolean;
  exp: number;
};

export function tokenPayload({
  id,
  username,
  email_verified,
  phone_verified,
  exp,
}: TokenOptions) {
  const tokenPayload = {
    id,
    username,
    email_verified,
    phone_verified,
    exp,
  };

  return tokenPayload;
}
