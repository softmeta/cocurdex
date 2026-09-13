import { randomBytes } from "node:crypto";
import { linkSync, lstatSync, unlinkSync } from "node:fs";
import net from "node:net";
import path from "node:path";

export function probeDaemonEndpoint(
  socketPath: string,
): Promise<"live" | "absent"> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `Cannot verify daemon endpoint at ${socketPath}: probe timed out`,
        ),
      );
    }, 1000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve("live");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      socket.destroy();
      if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
        resolve("absent");
      } else {
        reject(error);
      }
    });
  });
}

export async function prepareDaemonEndpoint(socketPath: string) {
  if ((await probeDaemonEndpoint(socketPath)) === "live") {
    throw new Error(`Cocurdex daemon is already running at ${socketPath}`);
  }
  if (process.platform === "win32") {
    return { bindPath: socketPath, publish() {}, remove() {} };
  }
  try {
    if (!lstatSync(socketPath).isSocket()) {
      throw new Error(
        `Refusing to remove non-socket daemon endpoint at ${socketPath}`,
      );
    }
    unlinkSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const bindPath = path.join(
    path.dirname(socketPath),
    `.d-${randomBytes(5).toString("hex")}`,
  );
  let identity: ReturnType<typeof lstatSync> | undefined;
  return {
    bindPath,
    publish() {
      const bound = lstatSync(bindPath);
      linkSync(bindPath, socketPath);
      identity = bound;
      unlinkSync(bindPath);
    },
    remove() {
      if (!identity) return;
      try {
        const current = lstatSync(socketPath);
        if (current.dev === identity.dev && current.ino === identity.ino) {
          unlinkSync(socketPath);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
