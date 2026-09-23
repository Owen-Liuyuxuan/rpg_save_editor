import LZString from "lz-string";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { patchActor } from "./actor-stats";

export type Raw = Record<string, any>;
export type SaveFormat = "MV" | "MZ";
export type Patch = {
  kind: "gold" | "item" | "weapon" | "armor" | "variable" | "switch" | "actor";
  id?: number;
  field?: string;
  value: unknown;
};
export type Limit = { min: number; max: number };
export const unwrap = (v: any): any[] =>
  v && !Array.isArray(v) && Array.isArray(v["@a"]) ? v["@a"] : v;
export const hash = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
function binaryStringToBuffer(value: string): Buffer {
  const out = Buffer.allocUnsafe(value.length);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0xff) throw Error("MZ 存档包含无效的二进制数据");
    out[i] = code;
  }
  return out;
}

function bufferToBinaryString(value: Uint8Array): string {
  let out = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < value.length; i += chunkSize) {
    out += String.fromCharCode(...value.subarray(i, i + chunkSize));
  }
  return out;
}

function decodeMZ(encoded: string): Raw {
  const json = inflateSync(binaryStringToBuffer(encoded)).toString("utf8");
  return JSON.parse(json);
}

function encodeMZ(raw: Raw): string {
  const zip = deflateSync(Buffer.from(JSON.stringify(raw), "utf8"), { level: 1 });
  return bufferToBinaryString(zip);
}

export function decode(encoded: string, format: SaveFormat = "MV"): Raw {
  if (format === "MZ") return decodeMZ(encoded);
  const json = LZString.decompressFromBase64(encoded.trim());
  if (!json) throw Error("存档解压失败");
  return JSON.parse(json);
}
export function encode(raw: Raw, format: SaveFormat = "MV"): string {
  if (format === "MZ") return encodeMZ(raw);
  const packed = LZString.compress(JSON.stringify(raw));
  const bytes = Buffer.allocUnsafe(packed.length * 2);
  for (let i = 0; i < packed.length; i++)
    bytes.writeUInt16BE(packed.charCodeAt(i), i * 2);
  return bytes.toString("base64");
}
export function parsePlugins(text: string): any[] {
  const start = text.indexOf("[");
  if (start < 0) throw Error("plugins.js 格式无效");
  return JSON.parse(text.slice(start).trim().replace(/;\s*$/, ""));
}
export function variableLimits(plugins: any[]): Record<number, Limit> {
  const p = plugins.find((x) => x.name === "VariableLimitation" && x.status);
  const out: Record<number, Limit> = {};
  if (!p?.parameters?.list) return out;
  for (const row of JSON.parse(p.parameters.list)) {
    const x = JSON.parse(row);
    const id = Number(x.variableId),
      min = Number(x.min),
      max = Number(x.max);
    if (
      Number.isInteger(id) &&
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      min <= max
    )
      out[id] = { min, max };
  }
  return out;
}
export function itemLimit(note: unknown): { max: number; source: string } {
  const m = String(note ?? "").match(/(?:^|[\r\n])\s*itemMaxNum\s*:\s*(\d+)/i);
  return m
    ? { max: Number(m[1]), source: "数据库备注 itemMaxNum" }
    : { max: 99, source: "引擎默认值" };
}
const int = (v: unknown, label: string) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v))
    throw Error(`${label}必须是安全整数`);
  return v;
};
export function applyPatch(
  raw: Raw,
  p: Patch,
  limits: Record<number, Limit>,
  db: any,
): void {
  if (
    !["gold", "item", "weapon", "armor", "variable", "switch", "actor"].includes(p.kind)
  )
    throw Error("不支持的修改类型");
  if (p.kind === "gold") {
    const v = int(p.value, "金币");
    if (v < 0 || v > 99999999) throw Error("金币超出 0–99999999");
    raw.party._gold = v;
    return;
  }
  const id = int(p.id, "ID");
  if (id < 1) throw Error("ID 无效");
  if (p.kind === "actor") {
    patchActor(raw, id, p.field, p.value, db);
    return;
  }
  if (p.kind === "switch") {
    if (id >= db.System.switches.length) throw Error("开关 ID 超出数据库范围");
    if (typeof p.value !== "boolean") throw Error("开关必须是布尔值");
    unwrap(raw.switches._data)[id] = p.value;
    return;
  }
  if (p.kind === "variable") {
    if (id >= db.System.variables.length) throw Error("变量 ID 超出数据库范围");
    const a = unwrap(raw.variables._data),
      old = a[id];
    if (typeof old === "number") {
      const v = int(p.value, "变量值"),
        l = limits[id];
      if (l && (v < l.min || v > l.max))
        throw Error(`变量 ${id} 必须在 ${l.min}–${l.max}`);
      a[id] = v;
    } else if (typeof old === "string") {
      if (typeof p.value !== "string")
        throw Error("字符串变量必须保持字符串类型");
      a[id] = p.value;
    } else throw Error("初版仅允许修改已有数字或字符串变量");
    return;
  }
  const field =
      p.kind === "item"
        ? "_items"
        : p.kind === "weapon"
          ? "_weapons"
          : "_armors",
    table =
      p.kind === "item" ? "Items" : p.kind === "weapon" ? "Weapons" : "Armors";
  if (!Object.prototype.hasOwnProperty.call(raw.party[field], String(id)))
    throw Error("初版只能修改存档中已有物品");
  if (!db[table]?.[id]) throw Error("数据库中不存在该物品");
  const v = int(p.value, "数量");
  const lim = itemLimit(db[table][id].note);
  if (v < 0 || v > lim.max)
    throw Error(`数量必须在 0–${lim.max}（${lim.source}；运行时覆盖未知）`);
  raw.party[field][id] = v;
}
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
