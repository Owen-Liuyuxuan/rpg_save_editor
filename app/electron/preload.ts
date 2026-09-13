import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("saveLab", {
  pickGame: () => ipcRenderer.invoke("pick-game"),
  openSave: (_g: string, n: string) => ipcRenderer.invoke("open-save", n),
  patch: (id: string, p: any) => ipcRenderer.invoke("patch", id, p),
  undo: (id: string) => ipcRenderer.invoke("undo", id),
  exportCopy: (id: string, _n: string) => ipcRenderer.invoke("export", id),
});
