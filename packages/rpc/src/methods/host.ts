import type {
  CreatedHostPairing,
  CreateHostPairingPayload,
  DevicePushRegistrationResult,
  HostAccessAuditEntry,
  HostAccessScope,
  HostAccessSession,
  HostDeviceApproval,
  HostIdentity,
  HostPairingRecord,
  HostPushStatus,
  HostRemoteAccessStatus,
  HostTrafficReport,
  PairedDevice,
  PairedDeviceRecord,
  PushRegistration,
  PushSettingsUpdate,
  RelaySettingsUpdate,
  RemoteAccessSettingsUpdate,
} from "@cocurdex/shared";

export type HostRequests = {
  "host.identity": undefined;
  "host.session": undefined;
  "host.remoteAccess.get": undefined;
  "host.remoteAccess.set": RemoteAccessSettingsUpdate;
  "host.relay.set": RelaySettingsUpdate;
  "host.pairing.create": CreateHostPairingPayload;
  "host.pairing.list": undefined;
  "host.pairing.cancel": { pairingId: string };
  "host.devices.list": undefined;
  "host.devices.approve": { deviceId: string; code: string };
  "host.devices.revoke": { deviceId: string };
  "host.devices.revokeSelf": undefined;
  "host.devices.updateScopes": { deviceId: string; scopes: HostAccessScope[] };
  "host.audit.list": { limit?: number };
  "host.traffic.get": undefined;
  "host.traffic.reset": undefined;
  "host.push.get": undefined;
  "host.push.set": PushSettingsUpdate;
  "host.push.register": PushRegistration;
  "host.push.unregister": undefined;
};

export type HostResults = {
  "host.identity": HostIdentity;
  "host.session": HostAccessSession;
  "host.remoteAccess.get": HostRemoteAccessStatus;
  "host.remoteAccess.set": HostRemoteAccessStatus;
  "host.relay.set": HostRemoteAccessStatus;
  "host.pairing.create": CreatedHostPairing;
  "host.pairing.list": HostPairingRecord[];
  "host.pairing.cancel": HostPairingRecord | null;
  "host.devices.list": PairedDevice[];
  "host.devices.approve": HostDeviceApproval;
  "host.devices.revoke": PairedDeviceRecord | null;
  "host.devices.revokeSelf": PairedDeviceRecord | null;
  "host.devices.updateScopes": PairedDeviceRecord | null;
  "host.audit.list": HostAccessAuditEntry[];
  "host.traffic.get": HostTrafficReport;
  "host.traffic.reset": HostTrafficReport;
  "host.push.get": HostPushStatus;
  "host.push.set": HostPushStatus;
  "host.push.register": DevicePushRegistrationResult;
  "host.push.unregister": DevicePushRegistrationResult;
};
