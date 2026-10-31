import { type SavedHost, savedHostEndpoint } from "@cocurdex/client-runtime";
import {
  buildDaemonAttachmentUploadUrl,
  buildDaemonImageAttachmentUrl,
  type ImageAttachment,
} from "@cocurdex/shared";
import { File, UploadType } from "expo-file-system";
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from "expo-image-picker";
import {
  ImageUploadError,
  parseImageUploadResponse,
} from "./image-upload-response";

export const MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_MESSAGE = 4;

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
}

export async function pickImages(limit: number): Promise<PickedImage[]> {
  if (limit <= 0) return [];
  const result = await launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.9,
    preferredAssetRepresentationMode:
      UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName ?? `image-${index + 1}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    sizeBytes: asset.fileSize ?? null,
  }));
}

export async function uploadImage(
  host: Pick<SavedHost, "baseUrl" | "token">,
  image: PickedImage,
): Promise<ImageAttachment> {
  if (
    image.sizeBytes !== null &&
    image.sizeBytes > MAX_IMAGE_ATTACHMENT_BYTES
  ) {
    throw new ImageUploadError("tooLarge");
  }
  const { webSocketUrl, token } = savedHostEndpoint(host);
  const result = await new File(image.uri).upload(
    buildDaemonAttachmentUploadUrl(webSocketUrl, "image", image.name),
    {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: image.mimeType,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": image.mimeType,
      },
    },
  );
  return parseImageUploadResponse(result.status, result.body);
}

export function imageAttachmentSource(
  host: Pick<SavedHost, "baseUrl" | "token">,
  attachment: Pick<ImageAttachment, "filePath">,
) {
  const { webSocketUrl, token } = savedHostEndpoint(host);
  return {
    uri: buildDaemonImageAttachmentUrl(webSocketUrl, attachment.filePath),
    headers: { Authorization: `Bearer ${token}` },
  };
}
