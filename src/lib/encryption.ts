import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, ciphertextHex, authTagHex] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
