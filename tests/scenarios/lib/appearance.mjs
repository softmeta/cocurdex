const THEME_TIMEOUT_MS = 10_000;

export async function emulateColorScheme(session, scheme) {
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scheme }],
  });
  await session.waitUntil(
    (scheme) => document.documentElement.dataset.theme === scheme,
    scheme,
    THEME_TIMEOUT_MS,
  );
}

export async function clearColorScheme(session) {
  await session.send("Emulation.setEmulatedMedia", { features: [] });
}
