---
name: cocurdex-mobile-verify
description: Develop Cocurdex itself - verify a mobile app change on an iOS simulator or Android emulator with a debug build, Metro Fast Refresh, an isolated daemon, deep-link pairing, and agent-device for taps, snapshots, and screenshots. Use when checking a change in apps/mobile, reproducing a mobile UI bug, or capturing light/dark screenshots. Not for the Maestro suite, which CI runs.
---

# Verify a mobile change

The user authorizes read-only testing against real sessions in both Cocurdex and Cocurdex-dev, including pairing test devices, browsing, recording, and measurement. Do not require isolated data or ask again merely because the data is real. Identify which host owns the reported session before pairing or reproducing it. This authorization does not include sending messages or modifying session content. Restore temporary UI changes afterward and revoke temporary test pairings. Use isolated fixtures for automated checks that reset or repeatedly mutate data.

For an isolated check, use an isolated daemon and simulator. For a real-session reproduction, reuse the paired development daemon. In either case, use a debug build with Metro, drive with `agent-device`, edit through Fast Refresh, and screenshot both themes. Maestro (`pnpm --filter @cocurdex/mobile-e2e flows`) runs in CI's `Mobile e2e` job; run it locally only after editing a flow or to reproduce a CI failure.

## 1. Daemon and device

```bash
pnpm --filter @cocurdex/mobile-e2e preview -- --platform ios --dev > "$S/preview-ios.log" 2>&1   # background
```

`--dev` starts an isolated daemon with the fixture data and boots a dedicated simulator (`cocurdex-e2e-*`) or emulator (`--platform android`), without installing the Release app. Each stdout line is JSON with `deviceId`, `pairingLink`, and `deepLink`; send a newline to its stdin for a fresh link. Run it in the background and stop it by its PID or task when done; it removes its temp dirs on SIGINT/SIGTERM.

## 2. Debug build with Metro

```bash
cd apps/mobile
CI=false pnpm exec expo run:ios --device <deviceId> > "$S/dev-ios.log" 2>&1        # background
CI=false pnpm exec expo run:android --device <avd> > "$S/dev-android.log" 2>&1     # background
```

`CI=false` keeps Metro watching, so edits apply through Fast Refresh. Rebuild only after native changes (`app.json`, plugins, native modules); run `expo prebuild --platform <p> --no-install` first when `app.json` changed.

## 3. Pair by deep link

```bash
xcrun simctl openurl <deviceId> '<deepLink>'
adb -s <serial> shell am start -a android.intent.action.VIEW -d '<deepLink>'
```

The `pair` route prefills the link from `host` and `code` (a `#pair=` fragment does not survive Expo Router). iOS asks to open the app; accept it with `agent-device press 'label="Open"'` (`打开` on a Chinese simulator; `alert accept` only knows English), then press the Pair action.

## 4. Drive with agent-device

`agent-device` is a devDependency of `tests/mobile`; run it as `tests/mobile/node_modules/.bin/agent-device`.

```bash
agent-device open dev.cocurdex.mobile --platform ios --udid <deviceId> --foreground
agent-device snapshot -i
agent-device press 'id="settings-computers"' --settle
agent-device longpress 'label="Gift cards"' --settle
agent-device fill 'id="new-issue-title"' 'Title' --settle
agent-device swipe 200 120 200 480
agent-device react-native dismiss-overlay
agent-device close
```

- Target by `testID` (`id=`) or accessibility label; use coordinates (points) only when the snapshot lacks the element.
- A React Native `Modal` above a form sheet may be missing from the iOS snapshot; take a screenshot and press by coordinates there.
- Swipes must stay inside the visible viewport, which excludes the keyboard.
- An item reported as `[other]` has no usable accessibility role; fix the component.

## 5. Screenshots and themes

```bash
xcrun simctl io <deviceId> screenshot "$S/name.png"
xcrun simctl ui <deviceId> appearance dark      # then light
adb -s <serial> exec-out screencap -p > "$S/name.png"
adb -s <serial> shell cmd uimode night yes      # then no
```

Check every changed screen in light and dark. Assert measurable parts (overflow, clipping, alignment, roles in the snapshot); leave the final visual judgment to the user.

## 6. Clean up

Stop the preview and Metro tasks you started by PID, then `agent-device close`. Never stop the user's daemon or Gradle/Android Studio processes, and never `pm clear` a physical device.
