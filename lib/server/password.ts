import "server-only";

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";


const PASSWORD_SCHEME =
  "scrypt";

const KEY_LENGTH =
  64;

const SALT_LENGTH =
  16;

const SCRYPT_N =
  16384;

const SCRYPT_R =
  8;

const SCRYPT_P =
  1;

const SCRYPT_MAXMEM =
  64 * 1024 * 1024;


function deriveKey(
  password: string,
  salt: string,
  n = SCRYPT_N,
  r = SCRYPT_R,
  p = SCRYPT_P
): Promise<Buffer> {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      scryptCallback(
        password,
        salt,
        KEY_LENGTH,
        {
          N: n,
          r,
          p,
          maxmem:
            SCRYPT_MAXMEM
        },
        (
          error,
          derivedKey
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            derivedKey as Buffer
          );
        }
      );
    }
  );
}


export async function hashPassword(
  password: string
): Promise<string> {
  const normalizedPassword =
    password.normalize("NFKC");

  if (
    normalizedPassword.length < 8
  ) {
    throw new Error(
      "Password must contain at least 8 characters."
    );
  }

  if (
    normalizedPassword.length > 256
  ) {
    throw new Error(
      "Password is too long."
    );
  }

  const salt =
    randomBytes(
      SALT_LENGTH
    ).toString(
      "base64url"
    );

  const derivedKey =
    await deriveKey(
      normalizedPassword,
      salt
    );

  return [
    PASSWORD_SCHEME,
    String(
      SCRYPT_N
    ),
    String(
      SCRYPT_R
    ),
    String(
      SCRYPT_P
    ),
    salt,
    derivedKey.toString(
      "base64url"
    )
  ].join("$");
}


export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  try {
    const parts =
      encodedHash.split(
        "$"
      );

    if (
      parts.length !== 6
    ) {
      return false;
    }

    const [
      scheme,
      nRaw,
      rRaw,
      pRaw,
      salt,
      hashRaw
    ] =
      parts;

    if (
      scheme !==
      PASSWORD_SCHEME
    ) {
      return false;
    }

    const n =
      Number(nRaw);

    const r =
      Number(rRaw);

    const p =
      Number(pRaw);

    if (
      !Number.isInteger(n) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      n <= 0 ||
      r <= 0 ||
      p <= 0
    ) {
      return false;
    }

    const expected =
      Buffer.from(
        hashRaw,
        "base64url"
      );

    if (
      expected.length !==
      KEY_LENGTH
    ) {
      return false;
    }

    const actual =
      await deriveKey(
        password.normalize(
          "NFKC"
        ),
        salt,
        n,
        r,
        p
      );

    return timingSafeEqual(
      expected,
      actual
    );
  } catch {
    return false;
  }
}