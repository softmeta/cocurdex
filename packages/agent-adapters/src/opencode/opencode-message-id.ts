const OPENCODE_IDENTIFIER_LENGTH = 26;
const OPENCODE_IDENTIFIER_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
let counter = 0;

function createAscendingIdentifier() {
  const timestamp = Date.now();
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter += 1;

  const value = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  const randomBytes = crypto.getRandomValues(
    new Uint8Array(OPENCODE_IDENTIFIER_LENGTH - time.length),
  );
  const random = Array.from(
    randomBytes,
    (byte) => OPENCODE_IDENTIFIER_ALPHABET[byte % 62],
  ).join("");

  return `${time}${random}`;
}

export function createOpenCodeMessageId() {
  return `msg_${createAscendingIdentifier()}`;
}
