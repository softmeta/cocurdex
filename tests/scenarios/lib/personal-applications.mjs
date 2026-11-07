import { check } from "./app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./appearance.mjs";
import { daemonRequest } from "./daemon-rpc.mjs";
import { clickByRole, waitForRole } from "./locate.mjs";
import { openSettingsSection, translate } from "./navigate.mjs";

async function findConnection(session, id) {
  const connections = await daemonRequest(session, "application.list");
  return connections.find((item) => item.id === id);
}

async function waitForConnection(session, id, predicate, label) {
  const deadline = Date.now() + 5000;
  let connection = await findConnection(session, id);
  while (!predicate(connection) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    connection = await findConnection(session, id);
  }
  check(predicate(connection), label, connection);
  return connection;
}

async function removeOpenConnection(session, t) {
  await clickByRole(session, { role: "button", name: await t("remove") });
  await clickByRole(session, {
    role: "button",
    name: await t("remove"),
    within: { role: "dialog" },
  });
}

export function assistantApplicationsStep(state) {
  return [
    "application grants save immediately and connections remove in both themes",
    async ({ session }) => {
      const t = (key) => translate(session, `personal:apps.${key}`);
      const created = [];
      for (const theme of ["light", "dark"]) {
        await emulateColorScheme(session, theme);
        const connection = await daemonRequest(session, "application.add", {
          applicationId: "notion",
          displayName: "Notion",
          personaIds: [state.personaId],
          allowDelegatedWork: false,
        });
        await openSettingsSection(session, "apps");
        created.push(connection.id);
        check(
          connection.status === null && connection.allowDelegatedWork === false,
          "a new connection is not falsely marked connected and delegated access defaults off",
        );
        const connectionRow = {
          role: "button",
          name: /^Notion\s/,
          within: { role: "region", name: await t("added") },
        };
        await clickByRole(session, connectionRow);
        await waitForRole(session, { role: "textbox", name: await t("name") });
        await clickByRole(session, {
          role: "switch",
          name: await t("delegated"),
        });
        await waitForConnection(
          session,
          connection.id,
          (item) => item?.allowDelegatedWork === true,
          "the delegated switch saves without a separate save step",
        );
        await clickByRole(session, {
          role: "button",
          name: /^Notion\s/,
          within: { role: "region", name: await t("catalog") },
        });
        await clickByRole(session, connectionRow);
        await waitForRole(session, { role: "textbox", name: await t("name") });
        const reopened = await findConnection(session, connection.id);
        check(
          reopened.allowDelegatedWork === true &&
            reopened.personaIds.includes(state.personaId),
          "grants persist after returning to the connection",
          reopened,
        );
        await removeOpenConnection(session, t);
        await waitForRole(session, {
          role: "button",
          name: `${await t("connect")} Notion`,
        });
      }
      await clearColorScheme(session);
      await clickByRole(session, {
        role: "button",
        name: await translate(session, "settings:sidebar.backToApp"),
      });
      return { themes: ["light", "dark"], connections: created };
    },
  ];
}
