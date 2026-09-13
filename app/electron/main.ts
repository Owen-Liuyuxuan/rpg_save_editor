import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { SaveService } from "./service";
const svc = new SaveService();
let selectedGame: string | undefined;
function win() {
  const w = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1000,
    minHeight: 650,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.on("will-prevent-unload", (e) => {
    const choice = dialog.showMessageBoxSync(w, {
      type: "question",
      buttons: ["继续编辑", "关闭窗口"],
      defaultId: 0,
      cancelId: 0,
      message: "仍有未导出的修改或正在执行的操作，确定关闭吗？",
    });
    if (choice === 1) e.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL)
    w.loadURL(process.env.VITE_DEV_SERVER_URL);
  else w.loadFile(path.join(__dirname, "../dist/index.html"));
}
app.whenReady().then(() => {
  const trusted = (e: Electron.IpcMainInvokeEvent) => {
    if (e.senderFrame !== e.sender.mainFrame) throw Error("拒绝非主框架请求");
  };
  ipcMain.handle("pick-game", async (e) => {
    trusted(e);
    const r = await dialog.showOpenDialog({
      title: "选择游戏 www 目录",
      properties: ["openDirectory"],
    });
    if (r.canceled) return null;
    const p = await svc.inspect(r.filePaths[0]);
    selectedGame = p.game;
    return p;
  });
  ipcMain.handle("open-save", (e, n) => {
    trusted(e);
    if (!selectedGame) throw Error("请先选择游戏目录");
    return svc.open(selectedGame, n);
  });
  ipcMain.handle("patch", (e, id, p) => {
    trusted(e);
    return svc.patch(id, p);
  });
  ipcMain.handle("undo", (e, id) => {
    trusted(e);
    return svc.undo(id);
  });
  ipcMain.handle("export", async (e, id) => {
    trusted(e);
    const d = svc.defaultExport(id);
    await fs.mkdir(path.dirname(d), { recursive: true });
    const r = await dialog.showSaveDialog({
      title: "导出存档副本",
      defaultPath: d,
      filters: [{ name: "RPG Maker 存档", extensions: ["rpgsave"] }],
    });
    return r.canceled ? null : svc.exportCopy(id, r.filePath!);
  });
  win();
});
app.on("window-all-closed", () => app.quit());
