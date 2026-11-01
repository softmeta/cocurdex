import { app, BrowserWindow } from "electron";

const [url] = process.argv.slice(-1);
app.setPath("userData", process.env.COCURDEX_WEB_BROWSER_PROFILE);
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1280, height: 800 });
  void window.loadURL(url);
});
app.on("window-all-closed", () => app.quit());
