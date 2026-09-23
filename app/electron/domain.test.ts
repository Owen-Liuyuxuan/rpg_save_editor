import { describe, expect, it } from "vitest";
import {
  applyPatch,
  clone,
  decode,
  encode,
  itemLimit,
  parsePlugins,
  unwrap,
  variableLimits,
} from "./domain";
const raw = () =>
  ({
    party: { _gold: 5, _items: { "@c": 1, "3": 2 }, _weapons: {}, _armors: {} },
    variables: { _data: { "@c": 2, "@a": [null, 7, "text"] } },
    switches: { _data: { "@a": [null, false] } },
    marker: { "@r": 2 },
  }) as any;
const db = {
  System: { variables: [null, "a", "b"], switches: [null, "s"] },
  Items: [null, null, null, { name: "Potion", note: "itemMaxNum:12" }],
  Weapons: [],
  Armors: [],
};
describe("raw patches", () => {
  it("keeps JsonEx metadata and unrelated tree", () => {
    const x = raw(),
      before = clone(x);
    applyPatch(x, { kind: "gold", value: 99 }, {}, db);
    expect(x.marker).toEqual(before.marker);
    expect(x.variables).toEqual(before.variables);
  });
  it("unwraps @a and preserves value types", () => {
    const x = raw();
    applyPatch(x, { kind: "variable", id: 2, value: "new" }, {}, db);
    expect(unwrap(x.variables._data)[2]).toBe("new");
    expect(() =>
      applyPatch(x, { kind: "variable", id: 2, value: 4 }, {}, db),
    ).toThrow("字符串");
  });
  it("validates variable limits", () => {
    const x = raw();
    expect(() =>
      applyPatch(
        x,
        { kind: "variable", id: 1, value: 11 },
        { 1: { min: 0, max: 10 } },
        db,
      ),
    ).toThrow("0–10");
  });
  it("only changes existing inventory and honors notes", () => {
    const x = raw();
    applyPatch(x, { kind: "item", id: 3, value: 12 }, {}, db);
    expect(x.party._items["@c"]).toBe(1);
    expect(() =>
      applyPatch(x, { kind: "item", id: 3, value: 13 }, {}, db),
    ).toThrow("0–12");
    expect(() =>
      applyPatch(x, { kind: "item", id: 4, value: 1 }, {}, db),
    ).toThrow("已有物品");
  });
});
describe("static rules", () => {
  it("parses plugin parameters without execution", () => {
    const text =
      "$plugins = " +
      JSON.stringify([
        {
          name: "VariableLimitation",
          status: true,
          parameters: {
            list: JSON.stringify([
              JSON.stringify({ variableId: "35", min: "0", max: "150" }),
            ]),
          },
        },
      ]) +
      ";";
    expect(variableLimits(parsePlugins(text))[35]).toEqual({
      min: 0,
      max: 150,
    });
  });
  it("uses known item limit", () => {
    expect(itemLimit("x\nitemMaxNum:1010").max).toBe(1010);
    expect(itemLimit("").max).toBe(99);
  });
});
describe("MV codec", () => {
  it("uses legacy UTF-16BE base64 framing", () => {
    // Golden output from the game's own MV 1.6.1 codec, including legacy padding.
    expect(encode({ a: 1 })).toBe("N4IghiBcCMC+QA==");
  });
});
describe("MZ codec", () => {
  it("round-trips the pako-compatible binary save framing", () => {
    const raw = {
      system: { _saveEnabled: true, "@": "Game_System" },
      variables: { _data: [null, "日文", 7], "@": "Game_Variables" },
      party: { _gold: 123, "@": "Game_Party" },
    };
    const encoded = encode(raw, "MZ");
    expect(encoded.charCodeAt(0)).toBe(0x78);
    expect(decode(encoded, "MZ")).toEqual(raw);
  });
});
