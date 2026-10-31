import { act, renderHook } from "@testing-library/react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDaemonBlobUrlStore } from "@/lib/daemon-blob-urls";

vi.mock("@/lib/diagnostics", () => ({ logRendererDiagnostic: vi.fn() }));
vi.mock("@/lib/daemon-client", () => ({
  resolveLocalDaemonConnection: async () => ({
    webSocketUrl: "ws://127.0.0.1:4100/ws",
    token: "test-token",
  }),
}));

const useBlobUrl = createDaemonBlobUrlStore({
  buildUrl: (webSocketUrl, key) => `${webSocketUrl}/blobs/${key}`,
  failureDiagnostic: "test.blobLoadFailed",
});

const fetchMock = vi.fn();

function failOnce() {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
}

function succeedOnce() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    blob: async () => new Blob(["png"]),
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:daemon");
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe("daemon blob urls", () => {
  it("retries a failed load while the image is still shown", async () => {
    failOnce();
    succeedOnce();
    const { result } = renderHook(() => useBlobUrl("hash-retry"));
    await flush();
    expect(result.current).toBeNull();
    await flush(1_000);
    expect(result.current).toBe("blob:daemon");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "ws://127.0.0.1:4100/ws/blobs/hash-retry",
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("stays empty without fetching when there is no key", async () => {
    const { result } = renderHook(() => useBlobUrl(null));
    await flush();
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads again for a new viewer after retries run out", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) failOnce();
    const first = renderHook(() => useBlobUrl("hash-exhausted"));
    await flush(20_000);
    expect(first.result.current).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    succeedOnce();
    const second = renderHook(() => useBlobUrl("hash-exhausted"));
    await flush();
    expect(second.result.current).toBe("blob:daemon");
    expect(first.result.current).toBe("blob:daemon");
  });
});
