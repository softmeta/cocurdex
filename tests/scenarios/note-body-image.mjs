import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { waitForRole } from "./lib/locate.mjs";
import { openNote, showPanelView } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const NOTE_TITLE = "Checkout screenshots";
const BODY = ".md-body-prose";
const DOC_IMAGE = /!\[[^\]]*\]\(cocurdex:\/\/image\/[A-Za-z0-9-]+\.png\)/g;

const args = readScenarioArgs();

function pastePng(session) {
  return session.run(async (selector) => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d");
    context.fillStyle = "#e76f51";
    context.fillRect(0, 0, 64, 48);
    const png = await new Promise((resolve) => canvas.toBlob(resolve));
    const data = new DataTransfer();
    data.items.add(new File([png], "image.png", { type: "image/png" }));
    const target = document.querySelector(selector);
    target.focus();
    target.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, BODY);
}

function waitForImage(session) {
  return session.waitUntil(
    (selector) => {
      const image = document
        .querySelector(selector)
        ?.querySelector(".md-body-image img");
      return Boolean(image?.complete && image.naturalWidth === 64);
    },
    BODY,
    UI_TIMEOUT_MS,
  );
}

function readImage() {
  const body = document.querySelector(".md-body-prose");
  const image = body.querySelector(".md-body-image img");
  const rect = image.getBoundingClientRect();
  return {
    src: image.src.slice(0, 5),
    width: Math.round(rect.width),
    fits: rect.right <= body.getBoundingClientRect().right,
    pixel: (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    })(),
  };
}

async function noteBody(session, id) {
  return (await daemonRequest(session, "note.get", { id })).bodyMarkdown;
}

runScenario("note-body-image", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const note = await daemonRequest(session, "note.create", {
      title: NOTE_TITLE,
    });
    await showPanelView(session, "notes");
    await waitForRole(
      session,
      { role: "button", name: NOTE_TITLE },
      UI_TIMEOUT_MS,
    );
    await openNote(session, NOTE_TITLE);
    return { noteId: note.id };
  },
  steps: [
    [
      "a pasted image renders inline and is saved into the note",
      async ({ session, noteId }) => {
        await pastePng(session);
        await waitForImage(session);
        const deadline = Date.now() + UI_TIMEOUT_MS;
        let markdown = await noteBody(session, noteId);
        while (
          !markdown.includes("cocurdex://image/") &&
          Date.now() < deadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          markdown = await noteBody(session, noteId);
        }
        const images = markdown.match(DOC_IMAGE) ?? [];
        check(images.length === 1, "note lacks one stored image", markdown);
        return { markdown };
      },
    ],
    [
      "the image keeps its pixels and fits in both themes",
      async ({ session }) => {
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          const image = await session.run(readImage);
          check(image.src === "blob:", "image is not a daemon blob", image);
          check(image.fits, `image overflows in ${theme}`, image);
          check(image.width === 64, `image resized in ${theme}`, image);
          check(
            image.pixel.join() === "231,111,81",
            `image pixels changed in ${theme}`,
            image,
          );
          results[theme] = image;
        }
        await clearColorScheme(session);
        return results;
      },
    ],
    [
      "the image renders again after the note is reopened",
      async ({ session }) => {
        await session.reload();
        await showPanelView(session, "notes");
        await waitForRole(
          session,
          { role: "button", name: NOTE_TITLE },
          UI_TIMEOUT_MS,
        );
        await openNote(session, NOTE_TITLE);
        await waitForImage(session);
        return {};
      },
    ],
  ],
  teardown: async ({ session, noteId }) => {
    await clearColorScheme(session);
    if (noteId) await daemonRequest(session, "note.delete", { id: noteId });
    return {};
  },
});
