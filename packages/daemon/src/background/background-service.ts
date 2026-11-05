import type { DaemonBackgroundStatus } from "@cocurdex/rpc";
import type { HostPrincipal } from "@cocurdex/shared";
import { type LoginItemTarget, loginItemFor } from "./login-item";
import { type LoginItemStore, systemLoginItemStore } from "./login-item-store";

export const BACKGROUND_SETTING = "daemon.background";

export interface BackgroundSettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}

export interface DaemonBackgroundServiceOptions {
  settings: BackgroundSettingsStore;
  target: LoginItemTarget | null;
  store?: LoginItemStore;
}

function parseEnabled(valueJson: string | null) {
  if (!valueJson) return false;
  try {
    return (JSON.parse(valueJson) as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

export class DaemonBackgroundService {
  private readonly store: LoginItemStore;
  private readonly item;

  constructor(private readonly options: DaemonBackgroundServiceOptions) {
    this.store = options.store ?? systemLoginItemStore;
    this.item = options.target ? loginItemFor(options.target) : null;
  }

  async enabled() {
    return parseEnabled(await this.options.settings.get(BACKGROUND_SETTING));
  }

  async status(): Promise<DaemonBackgroundStatus> {
    return {
      enabled: await this.enabled(),
      available: this.item !== null,
      registered: this.item ? await this.store.installed(this.item) : false,
    };
  }

  async set(enabled: boolean, principal: HostPrincipal) {
    if (principal.kind !== "local") {
      throw new Error("Only this computer can change background mode");
    }
    if (!this.item) {
      throw new Error("Background mode is not available for this daemon");
    }
    if (enabled) {
      await this.store.install(this.item);
    } else {
      await this.store.remove(this.item);
    }
    await this.options.settings.set(
      BACKGROUND_SETTING,
      JSON.stringify({ enabled }),
    );
    return this.status();
  }

  async reconcile() {
    if (this.item && (await this.enabled())) {
      await this.store.install(this.item);
    }
  }
}
