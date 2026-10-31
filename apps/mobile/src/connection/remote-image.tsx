import type { RemoteFileReadRequest } from "@cocurdex/client-runtime";
import { Image, type ImageProps } from "react-native";
import useSWR from "swr";
import { remoteFileUri } from "./remote-files";

export function useRemoteFileUri(
  hostId: string,
  request: RemoteFileReadRequest,
) {
  const path = request.kind === "imageAttachment" ? request.file : request.path;
  return useSWR(["remote-file", hostId, request.kind, path] as const, () =>
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
