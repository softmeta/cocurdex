import { Image } from "expo-image";

const dataUris = new Map<string, string>();

function base64Utf8(text: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function svgDataUri(xml: string) {
  let uri = dataUris.get(xml);
  if (uri === undefined) {
    uri = `data:image/svg+xml;base64,${base64Utf8(xml)}`;
    dataUris.set(xml, uri);
  }
  return uri;
}

export function SvgIcon({ xml, size }: { xml: string; size: number }) {
  return (
    <Image
      source={{ uri: svgDataUri(xml) }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory"
      transition={null}
      accessible={false}
    />
  );
}
