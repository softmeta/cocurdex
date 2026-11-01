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
const readBlobMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/daemon-files", () => ({ readDaemonBlob: readBlobMock }));

const useBlobUrl = createDaemonBlobUrlStore({
  request: (hash) => ({ kind: "deckAsset", hash }),
  failureDiagnostic: "test.blobLoadFailed",
});

function failOnce() {
  readBlobMock.mockRejectedValueOnce(new Error("HTTP 503"));
}

function succeedOnce() {
  readBlobMock.mockResolvedValueOnce(new Blob(["png"]));
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeAll(() => {
  vi.useFakeTimers();
  URL.createObjectURL = vi.fn(() => "blob:daemon");
  URL.revokeObjectURL = vi.fn();
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  readBlobMock.mockReset();
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
    expect(readBlobMock).toHaveBeenCalledTimes(2);
    expect(readBlobMock).toHaveBeenLastCalledWith({
      kind: "deckAsset",
      hash: "hash-retry",
    });
  });

  it("stays empty without fetching when there is no key", async () => {
    const { result } = renderHook(() => useBlobUrl(null));
    await flush();
    expect(result.current).toBeNull();
    expect(readBlobMock).not.toHaveBeenCalled();
  });

  it("loads again for a new viewer after retries run out", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) failOnce();
    const first = renderHook(() => useBlobUrl("hash-exhausted"));
    await flush(20_000);
    expect(first.result.current).toBeNull();
    expect(readBlobMock).toHaveBeenCalledTimes(4);

    succeedOnce();
    const second = renderHook(() => useBlobUrl("hash-exhausted"));
    await flush();
    expect(second.result.current).toBe("blob:daemon");
    expect(first.result.current).toBe("blob:daemon");
  });
});
