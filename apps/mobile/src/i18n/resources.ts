import commonEnUs from "../locales/en-US/common.json";
import hostsEnUs from "../locales/en-US/hosts.json";
import sessionsEnUs from "../locales/en-US/sessions.json";
import commonZhCn from "../locales/zh-CN/common.json";
import hostsZhCn from "../locales/zh-CN/hosts.json";
import sessionsZhCn from "../locales/zh-CN/sessions.json";

export const resources = {
  "en-US": {
    common: commonEnUs,
    hosts: hostsEnUs,
    sessions: sessionsEnUs,
  },
  "zh-CN": {
    common: commonZhCn,
    hosts: hostsZhCn,
    sessions: sessionsZhCn,
  },
} as const;
