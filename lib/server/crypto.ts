import "server-only";

import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";


export function createRandomToken(
  bytes = 32
): string {
  return randomBytes(bytes).toString("base64url");
}


export function sha256(
  value: string
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}


export function createId(
  prefix: string
): string {
  return `${prefix}_${randomUUID()}`;
}