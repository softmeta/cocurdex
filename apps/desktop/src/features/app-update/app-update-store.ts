import { useSyncExternalStore } from "react";
import { desktopApi } from "@/lib";
import type { AppUpdateState } from "@/lib/types";

const listeners = new Set<() => void>();

const initialState: AppUpdateState = {
  availableVersion: null,
  currentVersion: "0.0.0",
  dismissedVersion: null,
  errorMessage: null,
  releaseNotesUrl: null,
  status: "unsupported",
};

let snapshot: AppUpdateState = initialState;
let started = false;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function apply(next: AppUpdateState) {
  snapshot = next;
  emit();
}

function ensureStarted() {
  if (started) {
    return;
  }
  started = true;
  void desktopApi.getAppUpdateState().then(apply);
  desktopApi.onAppUpdateState(apply);
}

function subscribe(listener: () => void) {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

export function useAppUpdateState(): AppUpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function checkForAppUpdate(): Promise<AppUpdateState> {
  const next = await desktopApi.checkForAppUpdate();
  apply(next);
  return next;
}

export async function dismissAppUpdate(): Promise<AppUpdateState> {
  const next = await desktopApi.dismissAppUpdate();
  apply(next);
  return next;
}

export async function installAppUpdate(): Promise<void> {
  await desktopApi.installAppUpdate();
}
