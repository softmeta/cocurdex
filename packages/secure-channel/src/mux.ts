import {
  FRAME_FLAG_CONTINUES,
  type Frame,
  FrameType,
  MAX_FRAME_PAYLOAD_LENGTH,
  MAX_STREAM_ID,
} from "./frame";
import { createStreamQueue, type StreamQueue } from "./stream-queue";

export const MESSAGE_STREAM_ID = 0;
export const INITIAL_STREAM_WINDOW = 256 * 1024;
export const DEFAULT_MAX_MESSAGE_LENGTH = 32 * 1024 * 1024;

const WINDOW_PAYLOAD_LENGTH = 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type MuxRole = "initiator" | "responder";

export class MuxProtocolError extends Error {
  override name = "MuxProtocolError";
}

export class StreamResetError extends Error {
  override name = "StreamResetError";
  readonly code: string;
  constructor(code: string) {
    super(`Stream reset: ${code}`);
    this.code = code;
  }
}

export interface MuxStream {
  readonly id: number;
  readonly chunks: AsyncIterableIterator<Uint8Array>;
  write(chunk: Uint8Array): Promise<void>;
  end(): Promise<void>;
  reset(code: string): void;
}

export interface MuxOptions {
  role: MuxRole;
  sendFrame(frame: Frame): void;
  onMessage(message: Uint8Array): void;
  onStream(stream: MuxStream, header: Uint8Array): void;
  maxMessageLength?: number;
}

export interface Mux {
  receive(frame: Frame): void;
  sendMessage(message: Uint8Array): Promise<void>;
  open(header: Uint8Array): MuxStream;
  close(error: Error): void;
}

interface StreamState {
  sendCredit: number;
  receiveWindow: number;
  pendingGrant: number;
  creditWaiters: Array<() => void>;
  queue: StreamQueue;
  localEnded: boolean;
  remoteEnded: boolean;
  failure: Error | null;
  writing: Promise<void>;
}

function windowPayload(credit: number) {
  const payload = new Uint8Array(WINDOW_PAYLOAD_LENGTH);
  new DataView(payload.buffer).setUint32(0, credit);
  return payload;
}

function readWindowCredit(payload: Uint8Array) {
  if (payload.length !== WINDOW_PAYLOAD_LENGTH) {
    throw new MuxProtocolError("Malformed window frame");
  }
  const credit = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getUint32(0);
  if (credit === 0) throw new MuxProtocolError("Empty window grant");
  return credit;
}

function isOwnStream(role: MuxRole, streamId: number) {
  const parity = role === "initiator" ? 0 : 1;
  return streamId !== MESSAGE_STREAM_ID && streamId % 2 === parity;
}

export function createMux(options: MuxOptions): Mux {
  const maxMessageLength =
    options.maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH;
  const streams = new Map<number, StreamState>();
  const assembled: Uint8Array[] = [];
  let assembledLength = 0;
  let nextStreamId = options.role === "initiator" ? 2 : 1;
  let highestPeerStreamId = 0;
  let closedWith: Error | null = null;

  const send = (frame: Frame) => {
    if (closedWith) throw closedWith;
    options.sendFrame(frame);
  };

  const createState = (): StreamState => ({
    sendCredit: INITIAL_STREAM_WINDOW,
    receiveWindow: INITIAL_STREAM_WINDOW,
    pendingGrant: 0,
    creditWaiters: [],
    queue: createStreamQueue(),
    localEnded: false,
    remoteEnded: false,
    failure: null,
    writing: Promise.resolve(),
  });

  const messageState = createState();

  const grant = (streamId: number, state: StreamState, bytes: number) => {
    state.pendingGrant += bytes;
    if (state.pendingGrant < INITIAL_STREAM_WINDOW / 2) return;
    if (state.failure || closedWith) return;
    const credit = state.pendingGrant;
    state.pendingGrant = 0;
    state.receiveWindow += credit;
    send({
      type: FrameType.window,
      flags: 0,
      streamId,
      payload: windowPayload(credit),
    });
  };

  const releaseWaiters = (state: StreamState) => {
    for (const wake of state.creditWaiters.splice(0)) wake();
  };

  const fail = (streamId: number, state: StreamState, error: Error) => {
    if (state.failure) return;
    state.failure = error;
    state.queue.fail(error);
    releaseWaiters(state);
    streams.delete(streamId);
  };

  const forgetIfDone = (streamId: number, state: StreamState) => {
    if (state.localEnded && state.remoteEnded) streams.delete(streamId);
  };

  const waitForCredit = (state: StreamState) =>
    new Promise<void>((resolve) => state.creditWaiters.push(resolve));

  const writeChunks = async (
    streamId: number,
    state: StreamState,
    bytes: Uint8Array,
    markContinues: boolean,
  ) => {
    let offset = 0;
    do {
      while (state.sendCredit === 0 && !state.failure && !closedWith) {
        await waitForCredit(state);
      }
      if (closedWith) throw closedWith;
      if (state.failure) throw state.failure;
      const length = Math.min(
        bytes.length - offset,
        state.sendCredit,
        MAX_FRAME_PAYLOAD_LENGTH,
      );
      const last = offset + length === bytes.length;
      send({
        type: FrameType.data,
        flags: markContinues && !last ? FRAME_FLAG_CONTINUES : 0,
        streamId,
        payload: bytes.subarray(offset, offset + length),
      });
      state.sendCredit -= length;
      offset += length;
    } while (offset < bytes.length);
  };

  const serialize = (state: StreamState, task: () => Promise<void>) => {
    const run = state.writing.then(task);
    state.writing = run.catch(() => undefined);
    return run;
  };

  const makeStream = (streamId: number, state: StreamState): MuxStream => ({
    id: streamId,
    chunks: state.queue.iterate((bytes) => grant(streamId, state, bytes)),
    write(chunk) {
      return serialize(state, async () => {
        if (state.localEnded) throw new Error("Stream already ended");
        await writeChunks(streamId, state, chunk, false);
      });
    },
    end() {
      return serialize(state, async () => {
        if (state.localEnded || state.failure) return;
        state.localEnded = true;
        send({
          type: FrameType.end,
          flags: 0,
          streamId,
          payload: new Uint8Array(0),
        });
        forgetIfDone(streamId, state);
      });
    },
    reset(code) {
      if (state.failure || closedWith) return;
      send({
        type: FrameType.reset,
        flags: 0,
        streamId,
        payload: textEncoder.encode(code),
      });
      fail(streamId, state, new StreamResetError(code));
    },
  });

  const receiveMessageData = (frame: Frame) => {
    if (frame.payload.length > messageState.receiveWindow) {
      throw new MuxProtocolError("Message stream exceeded its window");
    }
    messageState.receiveWindow -= frame.payload.length;
    assembledLength += frame.payload.length;
    if (assembledLength > maxMessageLength) {
      throw new MuxProtocolError("Message is too large");
    }
    assembled.push(frame.payload.slice());
    grant(MESSAGE_STREAM_ID, messageState, frame.payload.length);
    if (frame.flags & FRAME_FLAG_CONTINUES) return;
    const message = new Uint8Array(assembledLength);
    let offset = 0;
    for (const part of assembled.splice(0)) {
      message.set(part, offset);
      offset += part.length;
    }
    assembledLength = 0;
    options.onMessage(message);
  };

  const receiveOpen = (frame: Frame) => {
    if (frame.streamId === MESSAGE_STREAM_ID) {
      throw new MuxProtocolError("Stream 0 cannot be opened");
    }
    if (isOwnStream(options.role, frame.streamId)) {
      throw new MuxProtocolError("Peer opened a stream with our parity");
    }
    if (frame.streamId <= highestPeerStreamId) {
      throw new MuxProtocolError("Stream id was already used");
    }
    highestPeerStreamId = frame.streamId;
    const state = createState();
    streams.set(frame.streamId, state);
    options.onStream(makeStream(frame.streamId, state), frame.payload.slice());
  };

  const receiveStreamFrame = (frame: Frame, state: StreamState) => {
    switch (frame.type) {
      case FrameType.data: {
        if (state.remoteEnded) {
          throw new MuxProtocolError("Data after end of stream");
        }
        if (frame.payload.length > state.receiveWindow) {
          throw new MuxProtocolError("Stream exceeded its window");
        }
        state.receiveWindow -= frame.payload.length;
        state.queue.push(frame.payload.slice());
        return;
      }
      case FrameType.end:
        state.remoteEnded = true;
        state.queue.finish();
        forgetIfDone(frame.streamId, state);
        return;
      case FrameType.reset:
        fail(
          frame.streamId,
          state,
          new StreamResetError(textDecoder.decode(frame.payload)),
        );
        return;
      case FrameType.window:
        state.sendCredit += readWindowCredit(frame.payload);
        releaseWaiters(state);
        return;
      default:
        throw new MuxProtocolError(`Unexpected frame type ${frame.type}`);
    }
  };

  return {
    receive(frame) {
      if (closedWith) return;
      if (frame.type === FrameType.ping) {
        send({ ...frame, type: FrameType.pong });
        return;
      }
      if (frame.type === FrameType.pong) return;
      if (frame.type === FrameType.open) {
        receiveOpen(frame);
        return;
      }
      if (frame.streamId === MESSAGE_STREAM_ID) {
        if (frame.type === FrameType.data) receiveMessageData(frame);
        else if (frame.type === FrameType.window) {
          messageState.sendCredit += readWindowCredit(frame.payload);
          releaseWaiters(messageState);
        } else {
          throw new MuxProtocolError("Unexpected frame on stream 0");
        }
        return;
      }
      const state = streams.get(frame.streamId);
      if (state) {
        receiveStreamFrame(frame, state);
        return;
      }
      const wasOpened = isOwnStream(options.role, frame.streamId)
        ? frame.streamId < nextStreamId
        : frame.streamId <= highestPeerStreamId;
      if (!wasOpened) {
        throw new MuxProtocolError("Frame for a stream that was never opened");
      }
    },
    sendMessage(message) {
      if (message.length > maxMessageLength) {
        return Promise.reject(new Error("Message is too large"));
      }
      return serialize(messageState, () =>
        writeChunks(MESSAGE_STREAM_ID, messageState, message, true),
      );
    },
    open(header) {
      if (closedWith) throw closedWith;
      if (nextStreamId > MAX_STREAM_ID) {
        throw new Error("Stream ids exhausted");
      }
      const streamId = nextStreamId;
      nextStreamId += 2;
      const state = createState();
      streams.set(streamId, state);
      send({ type: FrameType.open, flags: 0, streamId, payload: header });
      return makeStream(streamId, state);
    },
    close(error) {
      if (closedWith) return;
      closedWith = error;
      for (const [streamId, state] of streams) fail(streamId, state, error);
      messageState.failure = error;
      releaseWaiters(messageState);
    },
  };
}
