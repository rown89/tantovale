import { hash, verify } from "argon2-browser";

// Improved defaults for Argon2
const MEMORY_COST = 65536; // 64 MiB
const TIME_COST = 3;
const OUTPUT_LENGTH = 32; // 32 bytes
const PARALLELISM = 2; // Use 2 threads by default

interface HashOptions {
  memoryCost?: number;
  timeCost?: number;
  outputLen?: number;
  parallelism?: number;
  secret?: string; // Argon2 Browser takes secret as a string
}

/**
 * Hash a password using Argon2
 * @param password The plain text password to hash
 * @param options Optional parameters to customize the hashing process
 * @returns A promise that resolves to the hashed password
 */
export async function hashPassword(
  password: string,
  options: HashOptions = {},
): Promise<string> {
  const hashOptions = {
    pass: password,
    salt: crypto.getRandomValues(new Uint8Array(16)), // Generate a random salt (use 16-byte salt)
    memory: options.memoryCost ?? MEMORY_COST,
    time: options.timeCost ?? TIME_COST,
    hashLen: options.outputLen ?? OUTPUT_LENGTH,
    parallelism: options.parallelism ?? PARALLELISM,
    secret: options.secret
      ? new TextEncoder().encode(options.secret)
      : new Uint8Array(), // Convert secret to Uint8Array
  };

  const { encoded } = await hash(hashOptions);
  return encoded;
}

/**
 * Verify a password against a hash
 * @param hash The stored hash to compare against
 * @param password The plain text password to verify
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    const isMatch = await verify({ pass: password, encoded: hash });
    return isMatch ?? false;
  } catch (error) {
    return false;
  }
}
