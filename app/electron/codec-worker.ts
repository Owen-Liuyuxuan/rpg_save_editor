import { parentPort } from "node:worker_threads";
import { decode, encode, type SaveFormat } from "./domain";
parentPort!.on("message", (m: any) => {
  try {
    parentPort!.postMessage({
      ok: true,
      value:
        m.mode === "decode"
          ? decode(m.value, m.format as SaveFormat)
          : encode(m.value, m.format as SaveFormat),
    });
  } catch (e) {
    parentPort!.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
