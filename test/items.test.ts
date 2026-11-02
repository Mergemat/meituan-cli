import { describe, expect, test } from "bun:test";
import { UserError } from "../src/errors";
import {
  followsSku,
  parseSpec,
  resolveLine,
  shortName,
  shortNames,
  skuLabels,
} from "../src/items";
import type { Item, OptionGroup } from "../src/types";

const LISTS_OPTIONS = /温度=标准冰\/少冰\/去冰/u;
const NO_SUCH_COMBO = /has no 8-10种应季烤蔬 \+ 「低碳」无主食/u;
const NOT_ON_MENU = /not on this shop's menu/u;
const AT_LEAST_TWO = /at least 2 per order: use 102x2/u;

const values = (...names: string[]) =>
  names.map((name, i) => ({ id: i, name, short: shortName(name) }));

// A real Meituan drink: size is both the sku and an option group; ice and sugar are free choices.
const tea: Item = {
  appOnly: false,
  category: "茶",
  desc: "",
  groups: [
    {
      bySku: true,
      name: "份量",
      values: [
        { id: 10, name: "中杯", short: "中杯" },
        { id: 11, name: "大杯", short: "大杯" },
      ],
    },
    {
      bySku: false,
      name: "温度",
      values: [
        { id: 20, name: "标准冰", short: "标准冰" },
        { id: 21, name: "少冰丨推荐", short: "少冰" },
        { id: 22, name: "去冰：去除冰块，有冰感", short: "去冰" },
      ],
    },
    {
      bySku: false,
      name: "甜度",
      values: [
        { id: 30, name: "标准糖", short: "标准糖" },
        { id: 31, name: "半糖", short: "半糖" },
      ],
    },
  ],
  likes: 0,
  name: "伯牙绝弦",
  pic: "",
  price: 17,
  skus: [
    { id: 101, label: "大杯", min: 1, price: 22, spec: "大杯(1杯)(1杯)" },
    { id: 102, label: "中杯", min: 2, price: 17, spec: "中杯(1杯)(1杯)" },
  ],
  sold: "",
  soldOut: false,
  spu: 1,
};

// A real combo bowl: every sku is one combination of vegetables × carbs.
const vegGroup: OptionGroup = {
  bySku: true,
  name: "蔬菜",
  values: [
    { id: 40, name: "8-10种应季烤蔬", short: "8-10种应季烤蔬" },
    {
      id: 41,
      name: "绿叶菜➕30g（加在碗内）",
      short: "绿叶菜➕30g（加在碗内）",
    },
  ],
};
const carbGroup: OptionGroup = {
  bySku: true,
  name: "碳水",
  values: [
    { id: 50, name: "「低碳」无主食", short: "「低碳」无主食" },
    { id: 51, name: "一份 黑米饭", short: "一份黑米饭" },
  ],
};
const bowlSpecs = [
  "1人份(1人份)·8-10种应季烤蔬·一份 黑米饭(1人份)",
  "1人份(1人份)·绿叶菜➕30g（加在碗内）·「低碳」无主食(1人份)",
];
const bowl: Item = {
  ...tea,
  groups: [vegGroup, carbGroup],
  name: "烤鸡套餐",
  skus: [
    { id: 201, label: "", min: 1, price: 42.8, spec: bowlSpecs[0] ?? "" },
    { id: 202, label: "", min: 1, price: 39.8, spec: bowlSpecs[1] ?? "" },
  ],
};

describe("parseSpec", () => {
  test("sku alone means one, default options", () => {
    expect(parseSpec("101")).toEqual({ count: 1, options: [], sku: "101" });
  });
  test("options and count", () => {
    expect(parseSpec("101:少冰,半糖x2")).toEqual({
      count: 2,
      options: ["少冰", "半糖"],
      sku: "101",
    });
  });
  test("rejects non-sku input", () => {
    expect(() => parseSpec("伯牙绝弦")).toThrow(UserError);
    expect(() => parseSpec("101x0")).toThrow(UserError);
  });
});

describe("resolveLine", () => {
  test("sku-fixed groups follow the sku, free groups default to their first value", () => {
    expect(resolveLine([tea], parseSpec("101")).attr_ids).toEqual([11, 20, 30]);
    expect(resolveLine([tea], parseSpec("102x2")).attr_ids).toEqual([
      10, 20, 30,
    ]);
  });
  test("combo skus pick every part from the spec", () => {
    expect(resolveLine([bowl], parseSpec("201")).attr_ids).toEqual([40, 51]);
    expect(resolveLine([bowl], parseSpec("202")).attr_ids).toEqual([41, 50]);
  });
  test("options match by short name, full name or id", () => {
    expect(resolveLine([tea], parseSpec("101:少冰,半糖")).attr_ids).toEqual([
      11, 21, 31,
    ]);
    expect(resolveLine([tea], parseSpec("101:少冰丨推荐")).attr_ids).toEqual([
      11, 21, 30,
    ]);
    expect(resolveLine([tea], parseSpec("101:22")).attr_ids).toEqual([
      11, 22, 30,
    ]);
  });
  test("spaces in option names don't matter", () => {
    expect(
      resolveLine([bowl], parseSpec("202:一份黑米饭,8-10种应季烤蔬")).skuId
    ).toBe(201);
  });
  test("count carries through", () => {
    expect(resolveLine([tea], parseSpec("101x3")).count).toBe(3);
  });
  test("unknown option names the valid ones", () => {
    expect(() => resolveLine([tea], parseSpec("101:超冰"))).toThrow(
      LISTS_OPTIONS
    );
  });
  test("choosing a sku-fixed value switches to the sku that has it", () => {
    const tall = resolveLine([tea], parseSpec("102:大杯,少冰"));
    // Switching away from the 2-minimum medium cup lifts its minimum too.
    expect(tall.skuId).toBe(101);
    expect(tall.attr_ids).toEqual([11, 21, 30]);
    expect(
      resolveLine(
        [bowl],
        parseSpec("201:「低碳」无主食,绿叶菜➕30g（加在碗内）")
      ).skuId
    ).toBe(202);
  });
  test("a combination no sku has is refused, listing the real ones", () => {
    expect(() => resolveLine([bowl], parseSpec("201:「低碳」无主食"))).toThrow(
      NO_SUCH_COMBO
    );
  });
  test("a sku's minimum quantity is enforced with the fix spelled out", () => {
    expect(() => resolveLine([tea], parseSpec("102"))).toThrow(AT_LEAST_TWO);
  });
  test("unknown sku", () => {
    expect(() => resolveLine([tea], parseSpec("999"))).toThrow(NOT_ON_MENU);
  });
});

describe("sku structure", () => {
  test("a group is fixed by the sku when every spec names one of its values", () => {
    expect(followsSku(vegGroup.values, bowlSpecs)).toBe(true);
    expect(followsSku(values("标准冰", "少冰"), ["大杯(1杯)(1杯)"])).toBe(
      false
    );
  });
  test("labels keep only what tells skus apart", () => {
    expect(skuLabels(bowlSpecs)).toEqual([
      "8-10种应季烤蔬·一份 黑米饭",
      "绿叶菜➕30g（加在碗内）·「低碳」无主食",
    ]);
    expect(skuLabels(["大杯(1杯)(1杯)", "中杯(1杯)(1杯)"])).toEqual([
      "大杯",
      "中杯",
    ]);
    expect(skuLabels(["1人份(1人份)(1人份)"])).toEqual([""]);
  });
});

describe("option names", () => {
  test("notes after a separator are dropped", () => {
    expect(shortName("去冰：去除冰块，有冰感")).toBe("去冰");
    expect(shortName("七分糖丨推荐")).toBe("七分糖");
    expect(shortName("一份 黑米饭")).toBe("一份黑米饭");
  });
  test("shortening never merges two values", () => {
    expect(shortNames(["去冰", "去冰：去除冰块"])).toEqual([
      "去冰",
      "去冰：去除冰块",
    ]);
  });
});
