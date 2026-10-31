import { createRequire } from "node:module";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_TITLE = "Draft release notes";
const SESSION_HEADING = "Acme Shop 0.4.0";
const SESSION_ROW = new RegExp(`^${SESSION_TITLE}\\s+(?![(（])`);
const IMAGE_NAME = "photo-40x50.jpg";
const IMAGE_FIXTURE = createRequire(import.meta.url).resolve(
  `./fixtures/deck-images/${IMAGE_NAME}`,
);
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

async function chooseFile(session, filePath, action) {
  await session.send("Page.enable");
  await session.send("Page.setInterceptFileChooserDialog", { enabled: true });
  let unsubscribe = () => {};
  const chosen = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("File chooser did not open")),
      UI_TIMEOUT_MS,
    );
    unsubscribe = session.on("Page.fileChooserOpened", (event) => {
      clearTimeout(timer);
      session
        .send("DOM.setFileInputFiles", {
          files: [filePath],
          backendNodeId: event.backendNodeId,
        })
        .then(resolve, reject);
    });
  });
  chosen.catch(() => {});
  try {
    await action();
    await chosen;
  } finally {
    unsubscribe();
    await session.send("Page.setInterceptFileChooserDialog", {
      enabled: false,
    });
  }
}

function loadedImages({ name, minimum }) {
  const loaded = [...document.querySelectorAll(`img[alt="${name}"]`)]
    .filter((image) => image.complete && image.naturalWidth > 0)
    .map((image) => ({
      src: image.currentSrc.slice(0, 5),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
  return loaded.length >= minimum ? loaded : null;
}

runScenario("composer-attachments", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    await waitForRole(
      session,
      { role: "heading", name: SESSION_HEADING },
      UI_TIMEOUT_MS,
    );
    return { attachLabel: await translate(session, "common:actions.attach") };
  },
  steps: [
    [
      "an attached image uploads to the daemon and renders from it",
      async ({ session, attachLabel }) => {
        await clickByRole(
          session,
          { role: "button", name: attachLabel },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          { role: "menu", name: attachLabel },
          UI_TIMEOUT_MS,
        );
        await chooseFile(session, IMAGE_FIXTURE, () =>
          clickByRole(
            session,
            { role: "menuitem", name: attachLabel },
            UI_TIMEOUT_MS,
          ),
        );
        await waitForRole(
          session,
          { role: "button", name: IMAGE_NAME },
          UI_TIMEOUT_MS,
        );
        const query = { name: IMAGE_NAME, minimum: 1 };
        await session.waitUntil(loadedImages, query, UI_TIMEOUT_MS);
        const images = await session.run(loadedImages, query);
        check(
          images.every(
            (image) =>
              image.src === "blob:" &&
              image.naturalWidth === 40 &&
              image.naturalHeight === 50,
          ),
          "the composer card shows the stored 40×50 image from a blob URL",
          { images },
        );
      },
    ],
    [
      "the preview opens the same stored image",
      async ({ session }) => {
        await clickByRole(
          session,
          { role: "button", name: IMAGE_NAME },
          UI_TIMEOUT_MS,
        );
        const query = { name: IMAGE_NAME, minimum: 2 };
        await session.waitUntil(loadedImages, query, UI_TIMEOUT_MS);
        const images = await session.run(loadedImages, query);
        check(
          images.every((image) => image.src === "blob:"),
          "the preview renders from the daemon blob URL",
          { images },
        );
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
      },
    ],
    [
      "attachment requests leave no errors behind",
      async ({ session }) => {
        const {
          exceptions,
          console: messages,
          failedRequests,
        } = session.pageEvents.snapshot();
        const attachmentFailures = failedRequests.filter((request) =>
          request.url?.includes("/attachments/"),
        );
        const errors = messages.filter(
          (message) => message.level !== "warning",
        );
        check(
          exceptions.length === 0 &&
            attachmentFailures.length === 0 &&
            errors.length === 0,
          "the renderer stays free of exceptions, errors, and failed uploads",
          { exceptions, attachmentFailures, errors },
        );
      },
    ],
  ],
  teardown: async () => ({}),
});
