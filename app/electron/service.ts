import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  applyPatch,
  clone,
  hash,
  itemLimit,
  parsePlugins,
  Patch,
  Raw,
  SaveFormat,
  unwrap,
  variableLimits,
} from "./domain";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { actorParams } from "./actor-stats";
type Session = {
  source: string;
  sourceHash: string;
  raw: Raw;
  base: Raw;
  db: any;
  limits: any;
  game: string;
  format: SaveFormat;
  undo: Raw[];
  redo: Raw[];
};
export class SaveService {
  private sessions = new Map<string, Session>();
  private codec(
    mode: "decode" | "encode",
    value: string | Raw,
    format: SaveFormat,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const w = new Worker(path.join(__dirname, "codec-worker.js"), {
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
      const timer = setTimeout(() => {
        w.terminate();
        reject(Error("存档编解码超时"));
      }, 5000);
      w.once("message", (m: any) => {
        clearTimeout(timer);
        w.terminate();
        m.ok ? resolve(m.value) : reject(Error(m.error));
      });
      w.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      w.once("exit", () => {
        clearTimeout(timer);
        reject(Error("存档编解码进程已结束"));
      });
      w.postMessage({ mode, value, format });
    });
  }
  async inspect(gameDir: string) {
    const game = path.resolve(gameDir);
    const existsFile = async (file: string) => {
      try {
        return (await fs.stat(file)).isFile();
      } catch {
        return false;
      }
    };
    if (!(await existsFile(path.join(game, "data", "System.json"))))
      throw Error("所选目录不是有效的 RPG Maker MV/MZ 游戏目录");
    const mzCorePath = path.join(game, "js", "rmmz_core.js");
    const mvCorePath = path.join(game, "js", "rpg_core.js");
    const format: SaveFormat = (await existsFile(mzCorePath)) ? "MZ" : "MV";
    const corePath = format === "MZ" ? mzCorePath : mvCorePath;
    if (!(await existsFile(corePath)))
      throw Error("未检测到 RPG Maker MV/MZ 引擎核心文件");
    const core = await fs.readFile(corePath, "utf8");
    const version = core.match(/RPGMAKER_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
    if (!version) throw Error(`未检测到 RPG Maker ${format} 引擎版本`);
    const db: any = {};
    for (const n of [
      "System",
      "Actors",
      "Classes",
      "Items",
      "Weapons",
      "Armors",
      "MapInfos",
    ])
      db[n] = JSON.parse(
        await fs.readFile(path.join(game, "data", n + ".json"), "utf8"),
      );
    const plugins = parsePlugins(
      await fs.readFile(path.join(game, "js", "plugins.js"), "utf8"),
    );
    const saveDir = path.join(game, "save");
    const extension = format === "MZ" ? ".rmmzsave" : ".rpgsave";
    const files = (await fs.readdir(saveDir)).filter((n) =>
      format === "MZ"
        ? /^file\d+\.rmmzsave$/i.test(n)
        : /^file.+\.rpgsave$/i.test(n),
    );
    return {
      game,
      saveDir,
      title: db.System.gameTitle,
      engine: `RPG Maker ${format} ${version}`,
      format,
      extension,
      files,
      limits: variableLimits(plugins),
    };
  }
  async open(game: string, name: string) {
    const profile = await this.inspect(game);
    const validName =
      profile.format === "MZ"
        ? /^file\d+\.rmmzsave$/i.test(name)
        : /^file.+\.rpgsave$/i.test(name);
    if (path.basename(name) !== name || !validName) throw Error("存档文件名无效");
    const source = path.join(profile.saveDir, name);
    if ((await fs.stat(source)).size > 64 * 1024 * 1024) throw Error("存档过大");
    const buf = await fs.readFile(source);
    if (buf.length > 64 * 1024 * 1024) throw Error("存档过大");
    const raw = await this.codec(
      "decode",
      buf.toString("utf8"),
      profile.format,
    );
    if (!raw?.party || !Array.isArray(unwrap(raw.variables?._data)) ||
      !Array.isArray(unwrap(raw.switches?._data)) ||
      !Number.isSafeInteger(raw.party._gold))
      throw Error("不是可编辑的游戏存档");
    const db: any = {};
    for (const n of [
      "System",
      "Actors",
      "Classes",
      "Items",
      "Weapons",
      "Armors",
      "MapInfos",
    ])
      db[n] = JSON.parse(
        await fs.readFile(path.join(profile.game, "data", n + ".json"), "utf8"),
      );
    const id = randomUUID();
    this.sessions.clear();
    this.sessions.set(id, {
      source,
      sourceHash: hash(buf),
      raw,
      base: clone(raw),
      db,
      limits: profile.limits,
      game: profile.game,
      format: profile.format,
      undo: [],
      redo: [],
    });
    return this.view(id);
  }
  private get(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw Error("会话已失效，请重新打开存档");
    return s;
  }
  view(id: string) {
    const s = this.get(id),
      vars = unwrap(s.raw.variables._data),
      sw = unwrap(s.raw.switches._data),
      actors = unwrap(s.raw.actors?._data || []);
    const inv = (kind: string, field: string, table: string) =>
      Object.entries(s.raw.party[field] || {})
        .filter(([k]) => /^\d+$/.test(k))
        .map(([k, count]) => {
          const d = s.db[table][Number(k)] || {};
          return {
            id: Number(k),
            name: d.name || "",
            count,
            key: `party.${field}.${k}`,
            limit: itemLimit(d.note),
          };
        });
    return {
      sessionId: id,
      name: path.basename(s.source),
      gold: s.raw.party._gold,
      map: {
        id: s.raw.map?._mapId,
        name: s.db.MapInfos[s.raw.map?._mapId]?.name || "",
      },
      inventory: [
        ...inv("item", "_items", "Items").map((x) => ({ ...x, kind: "item" })),
        ...inv("weapon", "_weapons", "Weapons").map((x) => ({
          ...x,
          kind: "weapon",
        })),
        ...inv("armor", "_armors", "Armors").map((x) => ({
          ...x,
          kind: "armor",
        })),
      ],
      variables: vars
        .map((value: number | string, id: number) => ({
          id,
          name: s.db.System.variables[id] || "",
          value,
          key: `variables._data[${id}]`,
          limit: s.limits[id],
        }))
        .filter((x: any) => x.id && x.value != null),
      switches: sw
        .map((value: boolean, id: number) => ({
          id,
          name: s.db.System.switches[id] || "",
          value: Boolean(value),
          key: `switches._data[${id}]`,
        }))
        .filter((x: any) => x.id),
      actors: actors
        .filter(Boolean)
        .map((a: any) => ({
          id: a._actorId,
          name: a._name || s.db.Actors[a._actorId]?.name || "",
          level: a._level,
          hp: a._hp,
          mp: a._mp,
          key: `actors._data[${a._actorId}]`,
          params: actorParams(a, s.db),
        })),
      raw: s.raw,
      changes: this.diff(id),
      canUndo: !!s.undo.length,
    };
  }
  patch(id: string, p: Patch) {
    const s = this.get(id);
    const next = clone(s.raw);
    applyPatch(next, p, s.limits, s.db);
    if (JSON.stringify(next) === JSON.stringify(s.raw)) return this.view(id);
    s.undo.push(s.raw);
    if (s.undo.length > 50) s.undo.shift();
    s.redo = [];
    s.raw = next;
    return this.view(id);
  }
  undo(id: string) {
    const s = this.get(id);
    const prev = s.undo.pop();
    if (prev) {
      s.redo.push(s.raw);
      s.raw = prev;
    }
    return this.view(id);
  }
  diff(id: string) {
    const s = this.get(id),
      out: any[] = [];
    const walk = (a: any, b: any, p = "") => {
      if (Object.is(a, b)) return;
      if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
        out.push({ path: p, before: a, after: b });
        return;
      }
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        walk(a[k], b[k], `${p}/${k}`);
    };
    walk(s.base, s.raw);
    return out;
  }
  async exportCopy(id: string, dest: string) {
    const s = this.get(id),
      target = path.resolve(dest),
      saveDir = path.dirname(s.source),
      snapshot = clone(s.raw);
    if (path.dirname(target).toLowerCase() === saveDir.toLowerCase())
      throw Error("导出副本必须位于游戏 save 目录之外");
    const extension = s.format === "MZ" ? ".rmmzsave" : ".rpgsave";
    if (path.extname(target).toLowerCase() !== extension)
      throw Error(`导出文件扩展名必须为 ${extension}`);
    if (hash(await fs.readFile(s.source)) !== s.sourceHash)
      throw Error("源存档已被游戏修改，请重新加载");
    const encoded = await this.codec("encode", snapshot, s.format);
    if (hash(await fs.readFile(s.source)) !== s.sourceHash)
      throw Error("编码期间源存档发生变化，请重新加载");
    let created = false,
      h;
    try {
      h = await fs.open(target, "wx");
      created = true;
      await h.writeFile(encoded, "utf8");
      await h.close();
      h = undefined;
      const check = await this.codec(
        "decode",
        await fs.readFile(target, "utf8"),
        s.format,
      );
      if (JSON.stringify(check) !== JSON.stringify(snapshot))
        throw Error("导出回读验证失败");
    } catch (e) {
      await h?.close().catch(() => {});
      if (created) await fs.unlink(target).catch(() => {});
      throw e;
    }
    return { target, sha256: hash(await fs.readFile(target)) };
  }
  defaultExport(id: string) {
    const s = this.get(id),
      name = path.basename(s.source),
      extension = s.format === "MZ" ? ".rmmzsave" : ".rpgsave";
    return path.join(
      os.homedir(),
      "Documents",
      "RPGMaker Save Lab",
      name.replace(/\.(?:rpgsave|rmmzsave)$/i, "") + "-副本" + extension,
    );
  }
}
