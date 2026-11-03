import { describe, expect, test } from "bun:test";
import { relevant } from "../src/search-view";

describe("relevant", () => {
  test("a product sharing a character pair with a keyword matches", () => {
    expect(relevant("康比特炽金乳清蛋白质增肌粉450g", ["液体乳清蛋白"])).toBe(
      true
    );
    expect(relevant("蒙牛迈胜 20g液体乳清蛋白质", ["迈胜"])).toBe(true);
  });
  test("padding Meituan adds to a store's matches does not", () => {
    expect(relevant("东鹏特饮一箱 24瓶*500ml", ["迈胜", "液体乳清蛋白"])).toBe(
      false
    );
    expect(relevant("北京同仁堂 花旗参西洋参厚切片礼盒", ["迈胜"])).toBe(false);
  });
  test("Latin keywords match whole words, ignoring case", () => {
    expect(relevant("Fairlife 高蛋白牛奶 340ml", ["fairlife"])).toBe(true);
    expect(relevant("OATLY 燕麦奶", ["fairlife"])).toBe(false);
  });
});
