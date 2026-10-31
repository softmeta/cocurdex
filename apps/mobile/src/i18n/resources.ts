import commonEnUs from "../locales/en-US/common.json";
import filesEnUs from "../locales/en-US/files.json";
import hostsEnUs from "../locales/en-US/hosts.json";
import issuesEnUs from "../locales/en-US/issues.json";
import notesEnUs from "../locales/en-US/notes.json";
import sessionsEnUs from "../locales/en-US/sessions.json";
import settingsEnUs from "../locales/en-US/settings.json";
import commonZhCn from "../locales/zh-CN/common.json";
import filesZhCn from "../locales/zh-CN/files.json";
import hostsZhCn from "../locales/zh-CN/hosts.json";
import issuesZhCn from "../locales/zh-CN/issues.json";
import notesZhCn from "../locales/zh-CN/notes.json";
import sessionsZhCn from "../locales/zh-CN/sessions.json";
import settingsZhCn from "../locales/zh-CN/settings.json";

export const resources = {
  "en-US": {
    common: commonEnUs,
    files: filesEnUs,
    hosts: hostsEnUs,
    issues: issuesEnUs,
    notes: notesEnUs,
    sessions: sessionsEnUs,
    settings: settingsEnUs,
  },
  "zh-CN": {
    common: commonZhCn,
    files: filesZhCn,
    hosts: hostsZhCn,
    issues: issuesZhCn,
    notes: notesZhCn,
    sessions: sessionsZhCn,
    settings: settingsZhCn,
  },
} as const;
