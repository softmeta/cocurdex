const { spawn } = require("node:child_process");
const { createReadStream, writeFileSync } = require("node:fs");
const path = require("node:path");

const grandchild = spawn(
  process.execPath,
  ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000);"],
  { stdio: "ignore" },
);

writeFileSync(
  path.join(process.env.COCURDEX_USER_DATA_PATH, "grandchild.pid"),
  String(grandchild.pid),
);
console.log(
  '[CocurdexDaemonDiagnostic] {"event":"fixture.diagnostic","value":1}',
);

const ownerPipe = createReadStream("", { autoClose: true, fd: 3 });
ownerPipe.resume();
ownerPipe.once("end", () => process.exit(0));
setInterval(() => {}, 1_000);
