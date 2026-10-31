import { File, Paths } from "expo-file-system";

const marker = new File(Paths.document, "cocurdex-installed");

export const installMarker = {
  exists: () => marker.exists,
  create: () => marker.create({ overwrite: true }),
};
