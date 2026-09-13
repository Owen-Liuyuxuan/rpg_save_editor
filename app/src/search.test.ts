import { expect, it } from "vitest";
import { matchesSearch, isNamed } from "./search";
it("matches partial IDs, names and keys with case/width normalization",()=>{
 const row={id:135,name:"シルフィーナのHP",key:"variables._data[135]"};
 for(const q of ["35","ＨＰ","VARIABLES._data","シルフィーナ HP"," [135] "]) expect(matchesSearch(row,q)).toBe(true);
 expect(matchesSearch(row,"unknown")).toBe(false);
});
it("treats whitespace-only switch names as unnamed",()=>{
 expect(isNamed({name:" \t "})).toBe(false);expect(isNamed({name:""})).toBe(false);expect(isNamed({name:"剧情开关"})).toBe(true);
});
