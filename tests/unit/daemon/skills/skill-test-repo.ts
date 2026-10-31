import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "buffer",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    },
  });
}

export function skillMarkdown(name: string, description: string, body = "") {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n${body}`;
}

export class SkillTestRepo {
  constructor(readonly dir: string) {
    git(dir, ["init", "--quiet", "--initial-branch=main"]);
    git(dir, ["config", "core.autocrlf", "false"]);
  }

  write(relativePath: string, content: string) {
    const target = path.join(this.dir, ...relativePath.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  remove(relativePath: string) {
    rmSync(path.join(this.dir, ...relativePath.split("/")), {
      recursive: true,
      force: true,
    });
  }

  commit(message: string) {
    git(this.dir, ["add", "-A"]);
    git(this.dir, ["commit", "--quiet", "-m", message]);
    return this.head();
  }

  head() {
    return git(this.dir, ["rev-parse", "HEAD"]).toString("utf8").trim();
  }

  treeSha(skillPath: string) {
    return git(this.dir, ["rev-parse", `HEAD:${skillPath}`])
      .toString("utf8")
      .trim();
  }

  archive(prefix: string) {
    return git(this.dir, [
      "archive",
      "--format=tar.gz",
      `--prefix=${prefix}/`,
      "HEAD",
    ]);
  }
}

export interface ArchiveServer {
  url: string;
  requests: string[];
  close(): Promise<void>;
}

export async function serveRepoArchives(
  repos: Record<string, SkillTestRepo>,
): Promise<ArchiveServer> {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? "");
    const match = /^\/([^/]+)\/([^/]+)\/tar\.gz\/HEAD$/.exec(request.url ?? "");
    const repo = match ? repos[`${match[1]}/${match[2]}`] : undefined;
    if (!match || !repo) {
      response.writeHead(404).end();
      return;
    }
    const etag = `"${repo.head()}"`;
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304).end();
      return;
    }
    response.writeHead(200, {
      "content-type": "application/x-gzip",
      etag,
    });
    response.end(
      repo.archive(`${match[1]}-${match[2]}-${repo.head().slice(0, 7)}`),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
