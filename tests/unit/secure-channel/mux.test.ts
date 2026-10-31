import {
  createMux,
  type Frame,
  FrameType,
  INITIAL_STREAM_WINDOW,
  type Mux,
  MuxProtocolError,
  type MuxStream,
  StreamResetError,
} from "@cocurdex/secure-channel";
import { describe, expect, it } from "vitest";

interface Peer {
  mux: Mux;
  messages: Uint8Array[];
  streams: Array<{ stream: MuxStream; header: Uint8Array }>;
  sentBytes: () => number;
}

function connectedPair(maxMessageLength?: number) {
  const queues = { initiator: [] as Frame[], responder: [] as Frame[] };
  const makePeer = (role: "initiator" | "responder"): Peer => {
    const peer: Peer = {
      messages: [],
      streams: [],
      sentBytes: () => sent,
      mux: undefined as unknown as Mux,
    };
    let sent = 0;
    const target = role === "initiator" ? "responder" : "initiator";
    peer.mux = createMux({
      role,
      maxMessageLength,
      sendFrame(frame) {
        if (frame.type === FrameType.data) sent += frame.payload.length;
        queues[target].push({ ...frame, payload: frame.payload.slice() });
        queueMicrotask(() => {
          const next = queues[target].shift();
          if (next) peers[target].mux.receive(next);
        });
      },
      onMessage: (message) => peer.messages.push(message),
      onStream: (stream, header) => peer.streams.push({ stream, header }),
    });
    return peer;
  };
  const peers = {
    initiator: undefined as unknown as Peer,
    responder: undefined as unknown as Peer,
  };
  peers.initiator = makePeer("initiator");
  peers.responder = makePeer("responder");
  return peers;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function readAll(stream: MuxStream) {
  const parts: Uint8Array[] = [];
  for await (const chunk of stream.chunks) parts.push(chunk);
  return Buffer.concat(parts);
}

function pattern(length: number) {
  return Uint8Array.from({ length }, (_, index) => index % 251);
}

describe("mux messages", () => {
  it("reassembles a message larger than one frame", async () => {
    const { initiator, responder } = connectedPair();
    const message = pattern(700_000);
    await initiator.mux.sendMessage(message);
    await initiator.mux.sendMessage(new Uint8Array(0));
    await settle();
    expect(responder.messages).toHaveLength(2);
    expect(Buffer.from(responder.messages[0] as Uint8Array)).toEqual(
      Buffer.from(message),
    );
    expect(responder.messages[1]).toEqual(new Uint8Array(0));
  });

  it("treats a message above the limit as a protocol error", () => {
    const responder = createMux({
      role: "responder",
      maxMessageLength: 10,
      sendFrame: () => undefined,
      onMessage: () => undefined,
      onStream: () => undefined,
    });
    expect(() =>
      responder.receive({
        type: FrameType.data,
        flags: 0,
        streamId: 0,
        payload: new Uint8Array(11),
      }),
    ).toThrow(MuxProtocolError);
  });
});

describe("mux streams", () => {
  it("delivers a stream with its header and end", async () => {
    const { initiator, responder } = connectedPair();
    const stream = initiator.mux.open(new TextEncoder().encode("file:a.pdf"));
    const body = pattern(1_000_000);
    const writing = stream.write(body).then(() => stream.end());
    await settle();
    const incoming = responder.streams[0];
    if (!incoming) throw new Error("Stream did not arrive");
    expect(new TextDecoder().decode(incoming.header)).toBe("file:a.pdf");
    expect(incoming.stream.id % 2).toBe(0);
    expect(await readAll(incoming.stream)).toEqual(Buffer.from(body));
    await writing;
  });

  it("stops a writer at the window until the reader consumes", async () => {
    const { initiator, responder } = connectedPair();
    const stream = initiator.mux.open(new Uint8Array(0));
    let finished = false;
    void stream.write(pattern(INITIAL_STREAM_WINDOW * 4)).then(() => {
      finished = true;
    });
    await settle();
    await settle();
    expect(initiator.sentBytes()).toBe(INITIAL_STREAM_WINDOW);
    expect(finished).toBe(false);
    const incoming = responder.streams[0]?.stream;
    if (!incoming) throw new Error("Stream did not arrive");
    let received = 0;
    while (received < INITIAL_STREAM_WINDOW * 4) {
      const next = await incoming.chunks.next();
      if (next.done) break;
      received += next.value.length;
      await settle();
    }
    expect(received).toBe(INITIAL_STREAM_WINDOW * 4);
    await settle();
    expect(finished).toBe(true);
  });

  it("propagates a reset to the reader and the writer", async () => {
    const { initiator, responder } = connectedPair();
    const stream = initiator.mux.open(new Uint8Array(0));
    const writing = stream.write(pattern(INITIAL_STREAM_WINDOW * 2));
    await settle();
    const incoming = responder.streams[0]?.stream;
    if (!incoming) throw new Error("Stream did not arrive");
    incoming.reset("not-found");
    await expect(writing).rejects.toBeInstanceOf(StreamResetError);
    await expect(readAll(incoming)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("interleaves the message stream with a blocked file stream", async () => {
    const { initiator, responder } = connectedPair();
    const stream = initiator.mux.open(new Uint8Array(0));
    void stream.write(pattern(INITIAL_STREAM_WINDOW * 3));
    await settle();
    await initiator.mux.sendMessage(new TextEncoder().encode("rpc"));
    await settle();
    expect(responder.messages.map((m) => new TextDecoder().decode(m))).toEqual([
      "rpc",
    ]);
  });

  it("fails pending work when the connection closes", async () => {
    const { initiator } = connectedPair();
    const stream = initiator.mux.open(new Uint8Array(0));
    const writing = stream.write(pattern(INITIAL_STREAM_WINDOW * 2));
    await settle();
    initiator.mux.close(new Error("socket closed"));
    await expect(writing).rejects.toThrow("socket closed");
  });
});

describe("mux protocol violations", () => {
  const responder = () =>
    createMux({
      role: "responder",
      sendFrame: () => undefined,
      onMessage: () => undefined,
      onStream: () => undefined,
    });
  const frame = (overrides: Partial<Frame>): Frame => ({
    type: FrameType.data,
    flags: 0,
    streamId: 2,
    payload: new Uint8Array(0),
    ...overrides,
  });

  it("rejects a peer stream with the wrong parity", () => {
    expect(() =>
      responder().receive(frame({ type: FrameType.open, streamId: 3 })),
    ).toThrow(MuxProtocolError);
  });

  it("rejects reuse of a stream id", () => {
    const mux = responder();
    mux.receive(frame({ type: FrameType.open, streamId: 4 }));
    expect(() =>
      mux.receive(frame({ type: FrameType.open, streamId: 2 })),
    ).toThrow(MuxProtocolError);
  });

  it("rejects data beyond the granted window", () => {
    const mux = responder();
    mux.receive(frame({ type: FrameType.open }));
    mux.receive(frame({ payload: new Uint8Array(INITIAL_STREAM_WINDOW) }));
    expect(() => mux.receive(frame({ payload: new Uint8Array(1) }))).toThrow(
      MuxProtocolError,
    );
  });

  it("rejects data for a stream that was never opened", () => {
    expect(() => responder().receive(frame({ streamId: 6 }))).toThrow(
      MuxProtocolError,
    );
  });

  it("ignores late frames for a stream that was reset", () => {
    const mux = responder();
    mux.receive(frame({ type: FrameType.open }));
    mux.receive(frame({ type: FrameType.reset }));
    expect(() =>
      mux.receive(frame({ payload: Uint8Array.of(1) })),
    ).not.toThrow();
  });
});
