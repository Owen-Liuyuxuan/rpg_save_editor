import { parentPort } from "node:worker_threads";
import { decode, encode } from "./domain";
parentPort!.on("message", (m: any) => {
  try {
    parentPort!.postMessage({
      ok: true,
      value: m.mode === "decode" ? decode(m.value) : encode(m.value),
    });
  } catch (e) {
    parentPort!.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
