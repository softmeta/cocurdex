import type { PendingSettingsChangeRecord } from "@cocurdex/shared";
import { getDefaultStore } from "jotai";
import type { RefObject } from "react";
import {
  type ChatDisplaySettings,
  chatDisplaySettingsAtom,
  followUpBehaviorAtom,
  isFollowUpBehavior,
  normalizeChatDisplaySettings,
} from "@/features/agent";
import { desktopApi, useMountEffect } from "@/lib";

export interface RendererSettingApplier {
  apply: (value: unknown) => void;
  read: () => unknown;
}

export type RendererSettingAppliers = Record<string, RendererSettingApplier>;

const jotaiStore = getDefaultStore();

const jotaiBackedAppliers: RendererSettingAppliers = {
  "agent.followUpBehavior": {
    apply: (value) => {
      if (isFollowUpBehavior(value)) {
        jotaiStore.set(followUpBehaviorAtom, value);
      }
    },
    read: () => jotaiStore.get(followUpBehaviorAtom),
  },
  "chat.display": {
    apply: (value) => {
      jotaiStore.set(
        chatDisplaySettingsAtom,
        normalizeChatDisplaySettings(value as Partial<ChatDisplaySettings>),
      );
    },
    read: () => jotaiStore.get(chatDisplaySettingsAtom),
  },
};

function collectAppliers(stateBacked: RendererSettingAppliers) {
  return { ...jotaiBackedAppliers, ...stateBacked };
}

async function drainPendingChanges(stateBacked: RendererSettingAppliers) {
  let changes: PendingSettingsChangeRecord[];
  try {
    changes = await desktopApi.listPendingSettingsChanges();
  } catch {
    return;
  }
  const appliers = collectAppliers(stateBacked);
  const applied: Record<string, unknown> = {};
  for (const change of changes) {
    const applier = appliers[change.key];
    if (!applier) {
      continue;
    }
    try {
      applier.apply(change.value);
      applied[change.key] = applier.read();
      await desktopApi.ackPendingSettingsChange(change.id);
    } catch (error) {
      console.warn(
        "Failed to apply pending settings change",
        change.key,
        error,
      );
    }
  }
  if (Object.keys(applied).length > 0) {
    await desktopApi.reportSettingValues(applied).catch(() => {});
  }
}

export function reportRendererSettingValue(key: string, value: unknown) {
  void desktopApi.reportSettingValues({ [key]: value }).catch(() => {});
}

async function reportCurrentValues(stateBacked: RendererSettingAppliers) {
  const appliers = collectAppliers(stateBacked);
  const values: Record<string, unknown> = {};
  for (const [key, applier] of Object.entries(appliers)) {
    values[key] = applier.read();
  }
  await desktopApi.reportSettingValues(values).catch(() => {});
}

export function useSettingsChangeBridge(
  appliersRef: RefObject<RendererSettingAppliers>,
) {
  useMountEffect(() => {
    void drainPendingChanges(appliersRef.current);
    void reportCurrentValues(appliersRef.current);
    const unsubscribeData = desktopApi.onDataChanged((event) => {
      if (event.areas.includes("settings")) {
        void drainPendingChanges(appliersRef.current);
      }
    });
    const unsubscribeFollowUp = jotaiStore.sub(followUpBehaviorAtom, () => {
      reportRendererSettingValue(
        "agent.followUpBehavior",
        jotaiStore.get(followUpBehaviorAtom),
      );
    });
    const unsubscribeChatDisplay = jotaiStore.sub(
      chatDisplaySettingsAtom,
      () => {
        reportRendererSettingValue(
          "chat.display",
          jotaiStore.get(chatDisplaySettingsAtom),
        );
      },
    );
    return () => {
      unsubscribeData();
      unsubscribeFollowUp();
      unsubscribeChatDisplay();
    };
  });
}
