interface ProcessMemory {
  rss: number;
  external: number;
  arrayBuffers: number;
}

export async function readProcessMemory(
  inspectorUrl: string,
): Promise<ProcessMemory> {
  const socket = new WebSocket(inspectorUrl);
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: ProcessMemory) => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else if (value) resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error("Process memory probe timed out")),
      5_000,
    );
    socket.addEventListener("error", () =>
      finish(new Error("Process inspector failed")),
    );
    socket.addEventListener("open", () =>
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression: "process.memoryUsage()",
            returnByValue: true,
          },
        }),
      ),
    );
    socket.addEventListener("message", (event) => {
      const response = JSON.parse(String(event.data));
      if (response.id !== 1) return;
      const value = response.result?.result?.value;
      if (value && typeof value.rss === "number") finish(undefined, value);
      else finish(new Error("Process memory probe returned no metrics"));
    });
  });
}
