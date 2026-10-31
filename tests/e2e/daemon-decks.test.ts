import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  buildDaemonDeckAssetUrl,
  buildDaemonDeckDownloadUrl,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const SWATCH_PNG = createRequire(import.meta.url).resolve(
  "./fixtures/deck-images/swatch-3x2.png",
);
const ZIP_SIGNATURE = Buffer.from("PK\u0003\u0004", "latin1");

const MARKDOWN = [
  "# Acme roadmap",
  "Synthetic deck",
  "---",
  "## Highlights",
  "- Faster checkout",
  "",
  "Notes: Mention the latency win.",
  "---",
  "# Thanks",
].join("\n");

interface DeckJson {
  id: string;
  title: string;
  slideCount: number;
  revision: number;
}

interface WriteJson {
  deck: DeckJson;
  warnings: unknown[];
  issues: unknown[];
}

describe("decks through the CLI and daemon", () => {
  let daemon: DaemonProcess;

  beforeAll(async () => {
    daemon = await spawnDaemon();
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  it("creates a deck from Markdown, rejects stale writes, and exports a file", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const created = await runCli(
      ["deck", "create", "--markdown-file", "-", "--json"],
      { ...options, input: MARKDOWN },
    );
    expect(created.stderr).toBe("");
    const result = JSON.parse(created.stdout) as WriteJson;
    expect(result.deck).toMatchObject({
      title: "Acme roadmap",
      slideCount: 3,
      revision: 1,
    });
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);

    const renamed = await runCli(
      [
        "deck",
        "update",
        result.deck.id,
        "--title",
        "Acme plan",
        "--expected-revision",
        "1",
        "--json",
      ],
      options,
    );
    expect(renamed.code).toBe(0);
    const stale = await runCli(
      [
        "deck",
        "update",
        result.deck.id,
        "--title",
        "Lost",
        "--expected-revision",
        "1",
        "--json",
      ],
      options,
    );
    expect(stale.code).not.toBe(0);
    expect(stale.stderr).toContain("Deck was modified");

    const shown = await runCli(
      ["deck", "show", result.deck.id, "--json"],
      options,
    );
    expect(JSON.parse(shown.stdout)).toMatchObject({
      title: "Acme plan",
      revision: 2,
      issues: [],
    });

    const outputPath = path.join(
      tempDirs.createSync("cocu-deck-"),
      "out",
      "plan.pptx",
    );
    const exported = await runCli(
      ["deck", "export", result.deck.id, "--output", outputPath, "--json"],
      options,
    );
    expect(exported.stderr).toBe("");
    const bytes = await readFile(outputPath);
    expect(JSON.parse(exported.stdout)).toEqual({
      outputPath,
      sizeBytes: bytes.byteLength,
    });
    expect(bytes.subarray(0, 4)).toEqual(ZIP_SIGNATURE);

    const pdfPath = path.join(path.dirname(outputPath), "plan.pdf");
    const pdf = await runCli(
      ["deck", "export", result.deck.id, "--output", pdfPath, "--json"],
      options,
    );
    expect(pdf.stderr).toBe("");
    const pdfBytes = await readFile(pdfPath);
    expect(JSON.parse(pdf.stdout)).toEqual({
      outputPath: pdfPath,
      sizeBytes: pdfBytes.byteLength,
    });
    expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("edits slides with ops and reports the ids an agent targets", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const created = JSON.parse(
      (
        await runCli(["deck", "create", "--markdown-file", "-", "--json"], {
          ...options,
          input: MARKDOWN,
        })
      ).stdout,
    ) as WriteJson;
    const id = created.deck.id;
    const before = JSON.parse(
      (await runCli(["deck", "show", id, "--json"], options)).stdout,
    ) as { content: { slides: { id: string }[] } };
    const [cover, highlights] = before.content.slides;
    const ops = [
      { op: "setTheme", theme: "midnight" },
      { op: "duplicateSlide", slideId: highlights?.id },
      {
        op: "setText",
        slideId: cover?.id,
        target: "slot:title",
        markdown: "Acme **2027**",
      },
      { op: "setLayout", slideId: highlights?.id, layout: "two-content" },
      { op: "moveSlide", slideId: cover?.id, index: 99 },
    ];
    const edited = await runCli(
      ["deck", "edit", id, "--ops-file", "-", "--expected-revision", "1"],
      { ...options, input: JSON.stringify(ops) },
    );
    expect(edited.stderr).toBe("");
    const shown = JSON.parse(
      (await runCli(["deck", "show", id, "--json"], options)).stdout,
    ) as {
      revision: number;
      content: {
        theme: string;
        slides: { id: string; layout: string; slots: object }[];
      };
    };
    expect(shown.revision).toBe(2);
    expect(shown.content.theme).toBe("midnight");
    expect(shown.content.slides.map((slide) => slide.layout)).toEqual([
      "two-content",
      "title-content",
      "closing",
      "cover",
    ]);
    expect(shown.content.slides[3]?.slots).toMatchObject({
      title: {
        paragraphs: [
          { runs: [{ text: "Acme " }, { text: "2027", bold: true }] },
        ],
      },
    });

    const stale = await runCli(
      ["deck", "edit", id, "--ops-file", "-", "--expected-revision", "1"],
      {
        ...options,
        input: JSON.stringify([{ op: "deleteSlide", slideId: cover?.id }]),
      },
    );
    expect(stale.code).not.toBe(0);
    expect(stale.stderr).toContain("Deck was modified");

    const invalid = await runCli(["deck", "edit", id, "--ops-file", "-"], {
      ...options,
      input: JSON.stringify([{ op: "deleteSlide", slideId: "missing" }]),
    });
    expect(invalid.code).not.toBe(0);
    expect(invalid.stderr).toContain("Slide not found: missing");
  });

  it("serves a deck download once per ticket without a bearer header", async () => {
    const { deck } = await requestDaemon(
      "deck.create",
      { title: "Acme / Q4: plan", markdown: MARKDOWN },
      daemon.options,
    );
    const download = await requestDaemon(
      "deck.createDownload",
      { id: deck.id, format: "pptx" },
      daemon.options,
    );
    expect(download.fileName).toBe("Acme Q4 plan.pptx");
    const url = buildDaemonDeckDownloadUrl(
      daemon.metadata.webSocketUrl,
      download,
    );

    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("presentationml");
    expect(first.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''Acme%20Q4%20plan.pptx",
    );
    const body = Buffer.from(await first.arrayBuffer());
    expect(body.subarray(0, 4)).toEqual(ZIP_SIGNATURE);

    const replay = await fetch(url);
    expect(replay.status).toBe(404);
  });

  it("adds an image from a file, serves it to clients, and exports it", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const { deck } = await requestDaemon(
      "deck.create",
      { markdown: "## Chart" },
      daemon.options,
    );
    const slideId = deck.content.slides[0]?.id ?? "";
    const added = await runCli(
      [
        "deck",
        "image",
        deck.id,
        "--slide",
        slideId,
        "--file",
        SWATCH_PNG,
        "--alt",
        "Swatch",
        "--json",
      ],
      options,
    );
    expect(added.stderr).toBe("");
    const result = JSON.parse(added.stdout) as {
      image: { hash: string; mimeType: string; width: number };
      deck: { content: { slides: { elements: object[] }[] } };
    };
    expect(result.image).toMatchObject({ mimeType: "image/png", width: 3 });
    expect(result.deck.content.slides[0]?.elements).toEqual([
      expect.objectContaining({ kind: "image", alt: "Swatch" }),
    ]);

    const assetUrl = buildDaemonDeckAssetUrl(
      daemon.metadata.webSocketUrl,
      result.image.hash,
    );
    expect((await fetch(assetUrl)).status).toBe(401);
    const asset = await fetch(assetUrl, {
      headers: { Authorization: `Bearer ${daemon.metadata.token}` },
    });
    expect(asset.status).toBe(200);
    expect(Buffer.from(await asset.arrayBuffer())).toEqual(
      await readFile(SWATCH_PNG),
    );

    const output = path.join(await tempDirs.create("deck-img-"), "c.pptx");
    await runCli(["deck", "export", deck.id, "--output", output], options);
    expect((await readFile(output)).toString("latin1")).toContain("ppt/media/");

    const unknown = await runCli(["deck", "edit", deck.id, "--ops-file", "-"], {
      ...options,
      input: JSON.stringify([
        {
          op: "addImage",
          slideId,
          image: { ...result.image, hash: "0".repeat(64) },
        },
      ]),
    });
    expect(unknown.code).not.toBe(0);
    expect(unknown.stderr).toContain("Deck image not found");
  });

  it("imports a .pptx as an editable deck and reads its text for agents", async () => {
    const options = { userDataPath: daemon.userDataPath };
    const { deck: source } = await requestDaemon(
      "deck.create",
      { title: "Acme roadmap", markdown: MARKDOWN },
      daemon.options,
    );
    await runCli(
      [
        "deck",
        "image",
        source.id,
        "--slide",
        source.content.slides[1]?.id ?? "",
        "--file",
        SWATCH_PNG,
        "--alt",
        "Swatch",
      ],
      options,
    );
    const file = path.join(await tempDirs.create("deck-import-"), "Q3.pptx");
    await runCli(["deck", "export", source.id, "--output", file], options);

    const imported = await runCli(
      ["deck", "import", file, "--title", "Imported", "--json"],
      options,
    );
    expect(imported.stderr).toBe("");
    const result = JSON.parse(imported.stdout) as WriteJson & {
      deck: {
        content: {
          slides: { layout: string; notes: string; elements: object[] }[];
        };
      };
    };
    expect(result.deck).toMatchObject({ title: "Imported", slideCount: 3 });
    expect(result.warnings).toEqual([]);
    const slides = result.deck.content.slides;
    expect(slides.map((slide) => slide.layout)).toEqual([
      "cover",
      "title-content",
      "closing",
    ]);
    expect(slides[1]?.notes).toBe("Mention the latency win.");
    expect(slides[1]?.elements).toEqual([
      expect.objectContaining({ kind: "image", alt: "Swatch" }),
    ]);

    const outline = await runCli(["deck", "read", file], options);
    expect(outline.stdout).toContain("## Highlights");
    expect(outline.stdout).toContain("- Faster checkout");
    expect(outline.stdout).toContain("Notes: Mention the latency win.");

    const notPptx = await runCli(["deck", "import", SWATCH_PNG], options);
    expect(notPptx.code).not.toBe(0);
  });
});
