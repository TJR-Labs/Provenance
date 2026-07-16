import { compare, hash } from "bcryptjs";

export const PASSWORD_HASH_COST = 12;

export function hashPassword(password: string) {
  return hash(password, PASSWORD_HASH_COST);
}

export function verifyPassword(password: string, passwordHash: string | null) {
  return passwordHash ? compare(password, passwordHash) : false;
}
