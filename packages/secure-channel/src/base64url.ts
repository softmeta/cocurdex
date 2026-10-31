const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));

export function encodeBase64Url(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((bytes.length - index) * 4) / 3));
    for (let position = 0; position < chars; position += 1) {
      output += ALPHABET[(triple >> (18 - position * 6)) & 0x3f];
    }
  }
  return output;
}

export function decodeBase64Url(text: string) {
  if (text.length % 4 === 1) throw new Error("Malformed base64url text");
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const char of text) {
    const value = LOOKUP.get(char);
    if (value === undefined) throw new Error("Malformed base64url text");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset] = (buffer >> bits) & 0xff;
      offset += 1;
    }
  }
  return bytes;
}
