import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole } from "./lib/locate.mjs";
import {
  BODY_EDITOR_IN_DIALOG,
  openNewIssueDialog,
  translate,
} from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const ISSUE_TITLE = "Checkout total screenshot";
const DOC_IMAGE = /!\[[^\]]*\]\(cocurdex:\/\/image\/[A-Za-z0-9-]+\.png\)/g;

const args = readScenarioArgs();

function pasteFile(session, { type, name }) {
  return session.run(
    async ({ selector, type, name }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 30;
      const context = canvas.getContext("2d");
      context.fillStyle = "#2a9d8f";
      context.fillRect(0, 0, 40, 30);
      const png = await new Promise((resolve) => canvas.toBlob(resolve));
      const bytes = type === "image/png" ? png : new Blob(["<svg/>"]);
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      const target = document.querySelector(selector);
      target.focus();
      target.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { selector: BODY_EDITOR_IN_DIALOG, type, name },
  );
}

function bodyMarkdown(session) {
  return session.run(
    (selector) => document.querySelector(selector).editor.getMarkdown(),
    BODY_EDITOR_IN_DIALOG,
  );
}

runScenario("issue-description-image", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await openNewIssueDialog(session);
    return {};
  },
  steps: [
    [
      "a pasted screenshot uploads and renders inline",
      async ({ session }) => {
        await pasteFile(session, { type: "image/png", name: "image.png" });
        await session.waitUntil(
          (selector) => {
            const image = document
              .querySelector(selector)
              ?.querySelector(".md-body-image img");
            return Boolean(image?.complete && image.naturalWidth === 40);
          },
          BODY_EDITOR_IN_DIALOG,
          UI_TIMEOUT_MS,
        );
        const markdown = await bodyMarkdown(session);
        const images = markdown.match(DOC_IMAGE) ?? [];
        check(images.length === 1, "body lacks one stored image", markdown);
        const layout = await session.run((selector) => {
          const editor = document.querySelector(selector);
          const image = editor.querySelector(".md-body-image img");
          return {
            src: image.src.slice(0, 5),
            fits:
              image.getBoundingClientRect().right <=
              editor.getBoundingClientRect().right,
          };
        }, BODY_EDITOR_IN_DIALOG);
        check(layout.src === "blob:", "image is not a daemon blob", layout);
        check(layout.fits, "image overflows the editor", layout);
        return { markdown };
      },
    ],
    [
      "an unsupported image type is refused",
      async ({ session }) => {
        await pasteFile(session, { type: "image/svg+xml", name: "logo.svg" });
        const message = await translate(session, "notes:image.unsupported");
        await session.waitUntil(
          (text) => document.body.innerText.includes(text),
          message,
          UI_TIMEOUT_MS,
        );
        const images = (await bodyMarkdown(session)).match(DOC_IMAGE) ?? [];
        check(images.length === 1, "svg was inserted", images);
        return { message };
      },
    ],
    [
      "creating the issue stores the image reference",
      async ({ session }) => {
        await session.run((title) => {
          const input = document.querySelector(
            '[role="dialog"] input[type="text"], [role="dialog"] input:not([type])',
          );
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ).set;
          setter.call(input, title);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, ISSUE_TITLE);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "issues:dialog.createIssue"),
          within: { role: "dialog" },
        });
        await session.waitUntil(
          () => !document.querySelector('[role="dialog"]'),
          null,
          UI_TIMEOUT_MS,
        );
        const view = await daemonRequest(session, "issue.loadView", {});
        const created = view.issues.find(
          (issue) => issue.title === ISSUE_TITLE,
        );
        check(created, "issue was not created", view.issues.length);
        const issue = await daemonRequest(session, "issue.get", {
          id: created.id,
        });
        const images = issue.description?.match(DOC_IMAGE) ?? [];
        check(images.length === 1, "stored description lacks the image", issue);
        const located = await daemonRequest(session, "image.locate", {
          uri: images[0].slice(images[0].indexOf("(") + 1, -1),
        });
        check(located?.mimeType === "image/png", "image not stored", located);
        await daemonRequest(session, "issue.delete", { id: created.id });
        return { description: issue.description };
      },
    ],
  ],
  teardown: async ({ session }) => {
    const open = await session.run(() =>
      Boolean(document.querySelector('[role="dialog"]')),
    );
    if (open) {
      await clickByRole(session, {
        role: "button",
        name: await translate(session, "issues:dialog.cancel"),
        within: { role: "dialog" },
      });
    }
    return {};
  },
});
