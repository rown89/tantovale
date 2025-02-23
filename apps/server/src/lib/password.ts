import bcrypt from "bcryptjs";

// Improved defaults for bcrypt
const SALT_ROUNDS = 10; // Default salt rounds (higher means more secure, but slower)

interface HashOptions {
  saltRounds?: number; // Number of salt rounds for bcrypt
}

/**
 * Hash a password using bcrypt
 * @param password The plain text password to hash
 * @param options Optional parameters for customization
 * @returns A promise that resolves to the hashed password
 */
export async function hashPassword(
  password: string,
  options: HashOptions = {},
): Promise<string> {
  const saltRounds = options.saltRounds ?? SALT_ROUNDS;

  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a bcrypt hash
 * @param hash The stored hash to compare against
 * @param password The plain text password to verify
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
