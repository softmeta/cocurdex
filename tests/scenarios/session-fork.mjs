import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, clickPoint, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SOURCE_TITLE = "Add percentage discount codes";
const FIRST_PROMPT = "Add support for percentage discount codes";
const SECOND_PROMPT = "Does the README mention discounts?";
const CHAT_TITLE = "Debounce vs throttle";
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function daemon(session, method, params) {
  return daemonRequest(session, method, params);
}

async function centerInView(session, backendNodeId) {
  await session.send("DOM.getDocument", { depth: 0 });
  const { object } = await session.send("DOM.resolveNode", { backendNodeId });
  await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration:
      "function () { this.scrollIntoView({ block: 'center' }); }",
  });
  const { model } = await session.send("DOM.getBoxModel", { backendNodeId });
  const [left, top, , , right, bottom] = model.border;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

function hitLabel(point) {
  return document
    .elementFromPoint(point.x, point.y)
    ?.closest("button")
    ?.getAttribute("aria-label");
}

async function openSession(session, title) {
  await clickByRole(session, {
    role: "button",
    name: new RegExp(`^${title}`),
  });
  await session.waitUntil(
    (text) => document.body.innerText.includes(text),
    title === SOURCE_TITLE ? SECOND_PROMPT : "debounce",
    UI_TIMEOUT_MS,
  );
}

runScenario("session-fork", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await waitForRole(
      session,
      { role: "button", name: new RegExp(`^${SOURCE_TITLE}`) },
      UI_TIMEOUT_MS,
    );
    return {
      forkLabel: await translate(session, "sessions:lineage.forkFromHere"),
      forkTitle: await translate(session, "sessions:lineage.forkTitle", {
        title: SOURCE_TITLE,
      }),
    };
  },
  steps: [
    [
      "forking from the first turn opens a fork of that turn",
      async ({ session, forkLabel, forkTitle }) => {
        await openSession(session, SOURCE_TITLE);
        const buttons = await waitForRole(
          session,
          { role: "button", name: forkLabel },
          UI_TIMEOUT_MS,
        );
        const point = await centerInView(session, buttons[0].backendNodeId);
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...point,
        });
        const hit = await session.run(hitLabel, point);
        check(hit === forkLabel, "fork button is covered", { hit, point });
        await clickPoint(session, point);
        const shown = await session
          .waitUntil(
            (title) =>
              [...document.querySelectorAll("button")].some((button) =>
                button.textContent?.startsWith(title),
              ),
            forkTitle,
            UI_TIMEOUT_MS,
          )
          .then(
            () => true,
            () => false,
          );
        if (!shown) {
          const toasts = await session.run(() =>
            [...document.querySelectorAll("[data-sonner-toast]")].map(
              (toast) => toast.textContent,
            ),
          );
          const titles = (await daemon(session, "session.list")).map(
            ({ title }) => title,
          );
          check(false, "fork did not appear", { toasts, titles });
        }
        const sessions = await daemon(session, "session.list");
        const fork = sessions.find((record) => record.title === forkTitle);
        check(
          fork,
          "fork session missing",
          sessions.map(({ title }) => title),
        );
        const { messages } = await daemon(session, "session.listMessages", {
          sessionId: fork.id,
        });
        const contents = messages.map(({ content }) => content);
        check(
          contents.some((content) => content.startsWith(FIRST_PROMPT)),
          "fork lost the first turn",
          contents,
        );
        check(
          !contents.includes(SECOND_PROMPT),
          "fork kept the later turn",
          contents,
        );
        const transfers = await daemon(session, "session.contextTransfers", {
          sessionId: fork.id,
        });
        const [transfer] = transfers;
        check(
          transfers.length === 1 &&
            transfer.kind === "fork" &&
            transfer.status === "pending" &&
            transfer.sourceSessionId === "fixture-session-discounts",
          "fork has no pending transfer from the source",
          transfers,
        );
        await session.waitUntil(
          (text) =>
            document.body.innerText.includes(text.first) &&
            !document.body.innerText.includes(text.second),
          { first: FIRST_PROMPT, second: SECOND_PROMPT },
          UI_TIMEOUT_MS,
        );
        return {
          copiedMessages: contents.length,
          transfer: transfer.status,
        };
      },
    ],
    [
      "chat sessions offer no fork from a message",
      async ({ session, forkLabel }) => {
        const chatTab = await translate(session, "chat:sidebar.title");
        await clickByRole(session, { role: "tab", name: chatTab });
        await openSession(session, CHAT_TITLE);
        const count = await session.run(
          (label) =>
            document.querySelectorAll(`[aria-label="${label}"]`).length,
          forkLabel,
        );
        check(count === 0, "chat session shows fork buttons", { count });
        return { forkButtons: count };
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async ({ session }) => {
    const workTab = await translate(
      session,
      "sessions:sidebar.workspacesGroup",
    );
    await clickByRole(session, { role: "tab", name: workTab });
    return {};
  },
});
