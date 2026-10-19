// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("sonicflow", {
  getConnectionUrl: () => import_electron.ipcRenderer.invoke("sonicflow:connection-url")
});
