import { check } from "./app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./appearance.mjs";
import { daemonRequest } from "./daemon-rpc.mjs";
import { clickByRole, waitForRole } from "./locate.mjs";
import { showPanelView, translate } from "./navigate.mjs";

export function assistantApplicationsStep(state) {
  return [
    "applications support catalog, scoped grants, GitHub setup, and removal in both themes",
    async ({ session }) => {
      const t = (key) => translate(session, `personal:apps.${key}`);
      const created = [];
      for (const theme of ["light", "dark"]) {
        await emulateColorScheme(session, theme);
        await showPanelView(session, "applications");
        await clickByRole(session, {
          role: "button",
          name: `${await t("add")} Notion`,
        });
        await waitForRole(session, { role: "textbox", name: await t("name") });
        const connections = await daemonRequest(session, "application.list");
        const connection = connections.find(
          (item) => item.applicationId === "notion",
        );
        check(connection !== undefined, "catalog saves a connection");
        check(
          connection.personaIds.includes(state.personaId),
          "only the selected assistant is granted access",
        );
        check(
          connection.status === null && connection.allowDelegatedWork === false,
          "added is not falsely marked connected and delegated access defaults off",
        );
        created.push(connection.id);
        await clickByRole(session, {
          role: "switch",
          name: await t("delegated"),
        });
        await clickByRole(session, { role: "button", name: await t("save") });
        await session.waitUntil(
          (label) => {
            const button = [...document.querySelectorAll("button")].find(
              (item) => item.textContent.trim() === label,
            );
            return button && !button.disabled;
          },
          await t("save"),
          5000,
        );
        await waitForRole(session, { role: "button", name: await t("back") });
        await clickByRole(session, { role: "button", name: await t("back") });
        await clickByRole(session, { role: "button", name: /^Notion\s/ });
        const saved = (await daemonRequest(session, "application.list")).find(
          (item) => item.id === connection.id,
        );
        check(
          saved.allowDelegatedWork === true,
          "delegated grant persists after returning to connection",
        );
        await clickByRole(session, { role: "button", name: await t("remove") });
        await clickByRole(session, {
          role: "button",
          name: await t("remove"),
          within: { role: "dialog" },
        });
        await waitForRole(session, {
          role: "button",
          name: `${await t("add")} GitHub`,
        });
        await clickByRole(session, {
          role: "button",
          name: `${await t("add")} GitHub`,
        });
        await waitForRole(session, {
          role: "textbox",
          name: await t("clientId"),
        });
        const github = (await daemonRequest(session, "application.list")).find(
          (item) => item.applicationId === "github",
        );
        check(
          github.configured === false,
          "GitHub clearly requires the owner's OAuth application",
        );
        await clickByRole(session, { role: "button", name: await t("remove") });
        await clickByRole(session, {
          role: "button",
          name: await t("remove"),
          within: { role: "dialog" },
        });
        await waitForRole(session, {
          role: "button",
          name: `${await t("add")} Notion`,
        });
      }
      await clearColorScheme(session);
      return { themes: ["light", "dark"], connections: created };
    },
  ];
}
