import type {
  SaveTeamTemplatePayload,
  TeamTemplateRecord,
} from "@cocurdex/shared";
import { desktopApi } from "@/lib";

const listeners = new Set<() => void>();
let templates: TeamTemplateRecord[] = [];
let loadPromise: Promise<void> | null = null;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTeamTemplates(listener: () => void) {
  listeners.add(listener);
  void ensureTeamTemplatesLoaded();
  return () => {
    listeners.delete(listener);
  };
}

export function getTeamTemplates() {
  return templates;
}

export function ensureTeamTemplatesLoaded() {
  if (!loadPromise) {
    loadPromise = desktopApi
      .listTeamTemplates()
      .then((next) => {
        templates = next;
        notify();
      })
      .catch(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

export async function saveTeamTemplateRecord(payload: SaveTeamTemplatePayload) {
  await ensureTeamTemplatesLoaded();
  const saved = await desktopApi.saveTeamTemplate(payload);
  const exists = templates.some((template) => template.id === saved.id);
  templates = exists
    ? templates.map((template) => (template.id === saved.id ? saved : template))
    : [...templates, saved];
  notify();
  return saved;
}

export async function deleteTeamTemplateRecord(id: string) {
  await ensureTeamTemplatesLoaded();
  await desktopApi.deleteTeamTemplate(id);
  templates = templates.filter((template) => template.id !== id);
  notify();
}
