import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * A real bcrypt hash of a throwaway string. Comparing against it when the e-mail is unknown makes
 * a failed login take as long as a wrong password, so timing does not reveal which e-mails exist.
 */
export const TIMING_EQUALIZER_HASH = "$2b$12$490TqyXMeMJY/376fdgcLu2uldhA.OlFoLcNrDns7z0Ei3rrUubmS";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
