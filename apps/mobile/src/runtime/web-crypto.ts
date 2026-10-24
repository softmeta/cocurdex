import { getRandomValues, randomUUID } from "expo-crypto";

interface RuntimeCrypto {
  getRandomValues?: typeof getRandomValues;
  randomUUID?: typeof randomUUID;
}

const runtime = globalThis as { crypto?: RuntimeCrypto };

if (typeof runtime.crypto?.randomUUID !== "function") {
  runtime.crypto = { ...runtime.crypto, getRandomValues, randomUUID };
}
