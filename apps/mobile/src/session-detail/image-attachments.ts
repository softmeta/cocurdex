import { RemoteFileError } from "@cocurdex/client-runtime";
import { type ImageAttachment, pathBaseName } from "@cocurdex/shared";
import {
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
} from "expo-image-picker";
import { uploadRemoteImage } from "@/connection";
import { ImageUploadError, imageUploadFailure } from "./image-upload-response";

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
  hostId: string,
  image: PickedImage,
): Promise<ImageAttachment> {
  if (
    image.sizeBytes !== null &&
    image.sizeBytes > MAX_IMAGE_ATTACHMENT_BYTES
  ) {
    throw new ImageUploadError("tooLarge");
  }
  try {
    return await uploadRemoteImage(hostId, image);
  } catch (error) {
    if (error instanceof RemoteFileError) {
      throw new ImageUploadError(imageUploadFailure(error.reason));
    }
    throw error;
  }
}

export function imageAttachmentRequest(
  attachment: Pick<ImageAttachment, "filePath">,
) {
  return {
    kind: "imageAttachment",
    file: pathBaseName(attachment.filePath),
  } as const;
}
