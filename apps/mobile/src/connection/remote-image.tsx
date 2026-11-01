import type { RemoteFileReadRequest } from "@cocurdex/client-runtime";
import { Image, type ImageProps } from "react-native";
import useSWR from "swr";
import { remoteFileRequestKey, remoteFileUri } from "./remote-files";

export function useRemoteFileUri(
  hostId: string,
  request: RemoteFileReadRequest,
) {
  const key = remoteFileRequestKey(request);
  return useSWR(["remote-file", hostId, request.kind, key] as const, () =>
    remoteFileUri(hostId, request),
  );
}

export function RemoteImage({
  hostId,
  request,
  ...props
}: Omit<ImageProps, "source"> & {
  hostId: string;
  request: RemoteFileReadRequest;
}) {
  const { data: uri } = useRemoteFileUri(hostId, request);
  return <Image {...props} source={uri ? { uri } : undefined} />;
}
