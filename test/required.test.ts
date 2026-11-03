import { describe, expect, test } from "bun:test";
import { cutleryItem, withRequired } from "../src/required";
import type { Item, Line, Menu } from "../src/types";

const MUST_PICK_BAG = /requires one item from "餐具".*701 不要保温袋/u;
const MUST_PICK_DIP = /requires one item from "蘸料".*301 醋 ¥0/u;

const dish = (spu: number, name: string, price = 0): Item => ({
  appOnly: false,
  category: "",
  desc: "",
  groups: [],
  likes: 0,
  name,
  pic: "",
  price,
  skus: [{ id: spu * 100 + 1, label: "", min: 1, price, spec: "" }],
  sold: "",
  soldOut: false,
  spu,
});

const noCutlery = dish(1, "无需餐具，环保单");
const withCutlery = dish(2, "需要餐具（一餐一具）", 0.5);
const dumplings = dish(5, "水饺15只", 28);
const line = (skuId: number): Line => ({
  activityTag: "",
  attr_ids: [],
  count: 1,
  id: skuId,
  skuId,
});

const shop = (required: string, items: Item[]): Menu => ({
  appOnlyChecked: true,
  categories: [
    { items: [dumplings], name: "主食" },
    { items, name: required },
  ],
  deliveryFee: "",
  eta: "",
  minOrder: "",
  name: "饺子店",
  required,
  shop: "s",
  unlisted: 0,
});

describe("cutlery categories", () => {
  test("follow the cutlery decision", () => {
    expect(cutleryItem([withCutlery, noCutlery], 0)).toBe(noCutlery);
    expect(cutleryItem([noCutlery, withCutlery], 2)).toBe(withCutlery);
  });
  test("are added for the caller", () => {
    const lines = withRequired(
      shop("餐具", [noCutlery, withCutlery]),
      [line(501)],
      2
    );
    expect(lines.map((l) => l.skuId)).toEqual([501, 201]);
  });
  test("an undecided quote is priced without cutlery", () => {
    const lines = withRequired(
      shop("餐具", [noCutlery, withCutlery]),
      [line(501)],
      undefined
    );
    expect(lines.map((l) => l.skuId)).toEqual([501, 101]);
  });
});

describe("other required categories", () => {
  test("a 餐具 category without cutlery in it is left to the caller", () => {
    const bags = [dish(6, "【需要保温袋】", 0.5), dish(7, "不要保温袋")];
    expect(() => withRequired(shop("餐具", bags), [line(501)], 0)).toThrow(
      MUST_PICK_BAG
    );
  });
  test("are left to the caller, with the choices listed", () => {
    const vinegar = dish(3, "醋");
    expect(() => withRequired(shop("蘸料", [vinegar]), [line(501)], 0)).toThrow(
      MUST_PICK_DIP
    );
  });
  test("are satisfied when the caller already picked one", () => {
    const vinegar = dish(3, "醋");
    const lines = [line(501), line(301)];
    expect(withRequired(shop("蘸料", [vinegar]), lines, 0)).toEqual(lines);
  });
});
