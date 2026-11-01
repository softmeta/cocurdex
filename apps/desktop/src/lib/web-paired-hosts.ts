import type { SavedHost } from "@cocurdex/client-runtime";

const DB_NAME = "cocurdex-web";
const DB_VERSION = 1;
const HOSTS_STORE = "pairedHosts";
const KEYS_STORE = "keys";
const SEAL_KEY_ID = "deviceSecretSeal";
const SEAL_ALGORITHM = "AES-GCM";
const SEAL_IV_BYTES = 12;

interface SealedSecret {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

type StoredHost = Omit<SavedHost, "deviceSecretKey"> & {
  sealedSecret: SealedSecret;
};

function settle<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completion(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HOSTS_STORE)) {
        db.createObjectStore(HOSTS_STORE, { keyPath: "hostId" });
      }
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDatabase<T>(run: (db: IDBDatabase) => Promise<T>) {
  const db = await openDatabase();
  try {
    return await run(db);
  } finally {
    db.close();
  }
}

function readSealKey(db: IDBDatabase) {
  return settle<CryptoKey | undefined>(
    db.transaction(KEYS_STORE).objectStore(KEYS_STORE).get(SEAL_KEY_ID),
  );
}

async function sealKey(db: IDBDatabase) {
  const existing = await readSealKey(db);
  if (existing) return existing;
  const created = await crypto.subtle.generateKey(
    { name: SEAL_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const transaction = db.transaction(KEYS_STORE, "readwrite");
  transaction.objectStore(KEYS_STORE).add(created, SEAL_KEY_ID);
  try {
    await completion(transaction);
    return created;
  } catch {
    const stored = await readSealKey(db);
    if (!stored) throw new Error("Could not store the device key");
    return stored;
  }
}

async function seal(key: CryptoKey, secret: string): Promise<SealedSecret> {
  const iv = crypto.getRandomValues(new Uint8Array(SEAL_IV_BYTES));
  const data = await crypto.subtle.encrypt(
    { name: SEAL_ALGORITHM, iv },
    key,
    new TextEncoder().encode(secret),
  );
  return { iv, data };
}

async function unseal(key: CryptoKey, sealed: SealedSecret) {
  const plain = await crypto.subtle.decrypt(
    { name: SEAL_ALGORITHM, iv: sealed.iv },
    key,
    sealed.data,
  );
  return new TextDecoder().decode(plain);
}

async function openHost(
  key: CryptoKey | undefined,
  stored: StoredHost,
): Promise<SavedHost | null> {
  if (!key) return null;
  const { sealedSecret, ...host } = stored;
  try {
    return { ...host, deviceSecretKey: await unseal(key, sealedSecret) };
  } catch {
    return null;
  }
}

export function listPairedHosts(): Promise<SavedHost[]> {
  return withDatabase(async (db) => {
    const [key, stored] = await Promise.all([
      readSealKey(db),
      settle<StoredHost[]>(
        db.transaction(HOSTS_STORE).objectStore(HOSTS_STORE).getAll(),
      ),
    ]);
    const hosts = await Promise.all(stored.map((host) => openHost(key, host)));
    return hosts
      .filter((host): host is SavedHost => host !== null)
      .sort((left, right) => right.pairedAt.localeCompare(left.pairedAt));
  });
}

export function savePairedHost(host: SavedHost): Promise<void> {
  return withDatabase(async (db) => {
    const { deviceSecretKey, ...rest } = host;
    const stored: StoredHost = {
      ...rest,
      sealedSecret: await seal(await sealKey(db), deviceSecretKey),
    };
    const transaction = db.transaction(HOSTS_STORE, "readwrite");
    transaction.objectStore(HOSTS_STORE).put(stored);
    await completion(transaction);
  });
}

export function removePairedHost(hostId: string): Promise<void> {
  return withDatabase(async (db) => {
    const transaction = db.transaction(HOSTS_STORE, "readwrite");
    transaction.objectStore(HOSTS_STORE).delete(hostId);
    await completion(transaction);
  });
}
