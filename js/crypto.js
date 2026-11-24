// 책 데이터를 비밀번호로 암호화/복호화 (WebCrypto: PBKDF2-SHA256 → AES-256-GCM)
// 호스팅 서버에는 암호문(words.enc)만 올라가고, 기기에서 비밀번호를 입력해야 열립니다.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const normalizePass = (s) => String(s || "").replace(/[\s-]/g, "").toLowerCase();

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(normalizePass(pass)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(obj, pass, iter = 250000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, alg: "AES-GCM", kdf: "PBKDF2-SHA256", iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

// 비밀번호가 틀리면 code === "BAD_PASSPHRASE" 인 오류를 던짐
export async function decryptJson(pkg, pass) {
  const key = await deriveKey(pass, fromB64(pkg.salt), pkg.iter);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(pkg.iv) }, key, fromB64(pkg.ct));
    return JSON.parse(dec.decode(pt));
  } catch {
    const e = new Error("비밀번호가 맞지 않아요.");
    e.code = "BAD_PASSPHRASE";
    throw e;
  }
}
