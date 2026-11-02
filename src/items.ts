import { UserError } from "./errors";
import type { Item, Line, OptionGroup, OptionValue, Sku } from "./types";

const NOTE_SEPARATOR = /[：:，,丨|]/u;
const SPACES = /\s+/gu;
const TRAILING_PAREN = /[（(][^（()）]*[)）]$/u;
const SPEC = /^(?<sku>\d+)(?::(?<options>.+?))?(?:x(?<count>\d+))?$/u;
const SEGMENT = "·";

/** Meituan option labels carry notes after a separator: "去冰：去除冰块", "少冰丨推荐". */
/** Names are also stripped of spaces ("一份 黑米饭" → "一份黑米饭") so they survive the shell unquoted. */
export const shortName = (v: string) =>
  (v.split(NOTE_SEPARATOR)[0] || v).replace(SPACES, "");

const bare = (s: string) => s.replace(SPACES, "");

/** Short names for a group's values, falling back to the full name wherever shortening would make two collide. */
export function shortNames(names: string[]): string[] {
  const shorts = names.map(shortName);
  return shorts.map((s, i) =>
    shorts.indexOf(s) === shorts.lastIndexOf(s) ? s : (names[i] ?? s)
  );
}

/** The value of `values` a sku spec names, if any. Specs list one value per group, separated by "·". */
export function valueInSpec(
  values: OptionValue[],
  spec: string
): OptionValue | undefined {
  const segments = spec.split(SEGMENT);
  return values
    .filter((v) => segments.some((s) => s.startsWith(v.name)))
    .sort((a, b) => b.name.length - a.name.length)[0];
}

/** The value a sku carries: Meituan's own sku mapping when known, else read from the sku spec. */
export function valueOfSku(
  values: OptionValue[],
  sku: Sku
): OptionValue | undefined {
  return values.some((v) => v.skus)
    ? values.find((v) => v.skus?.includes(sku.id))
    : valueInSpec(values, sku.spec);
}

/** Option data from the options popup (multispu): which groups the sku decides and which skus carry each value. */
export interface SkuAttrGroup {
  mode?: number;
  name: string;
  values: { id: number; sku_ids?: number[] }[];
}

/** Mode 2 marks a group the sku decides. Some menus' sku specs omit those values ("(1杯)"), so this map is the only reliable link. */
const SKU_DECIDES = 2;

export function withSkuAttrs(item: Item, attrs: SkuAttrGroup[]): Item {
  const groups = item.groups.map((g) => {
    const raw = attrs.find((a) => a.name === g.name);
    if (raw?.mode !== SKU_DECIDES) {
      return g;
    }
    const values = g.values.map((v) => ({
      ...v,
      skus: raw.values.find((r) => r.id === v.id)?.sku_ids ?? [],
    }));
    return { ...g, bySku: true, values };
  });
  const labelled = groups.filter((g) => g.bySku && g.values.length > 1);
  const skus = item.skus.map((k) => ({
    ...k,
    label:
      labelled
        .map((g) => valueOfSku(g.values, k)?.short)
        .filter(Boolean)
        .join("·") || k.label,
  }));
  return { ...item, groups, skus };
}

/** A group every sku spec names (份量: 中杯/大杯, or a combo's 碳水) is decided by the sku, not by the caller. */
export const followsSku = (values: OptionValue[], specs: string[]) =>
  specs.length > 0 && specs.every((s) => valueInSpec(values, s));

/**
 * Labels that tell an item's skus apart: "1人份(1人份)·烤蔬·一份 黑米饭(1人份)" → "烤蔬·一份 黑米饭"
 * once the parts every sku shares are dropped.
 */
export function skuLabels(specs: string[]): string[] {
  let trimmed = specs;
  for (;;) {
    const suffix = trimmed[0]?.match(TRAILING_PAREN)?.[0];
    if (!(suffix && trimmed.every((s) => s.endsWith(suffix)))) {
      break;
    }
    trimmed = trimmed.map((s) => s.slice(0, -suffix.length));
  }
  const segments = trimmed.map((s) => s.split(SEGMENT));
  const shared = (segments[0] ?? []).filter((x) =>
    segments.every((s) => s.includes(x))
  );
  return segments.map((s) =>
    s.filter((x) => !shared.includes(x)).join(SEGMENT)
  );
}

export interface ItemSpec {
  count: number;
  options: string[];
  sku: string;
}

/** `<sku>[:<option>,<option>...][x<count>]`, e.g. `32067247198:少冰,半糖x2`. */
export function parseSpec(spec: string): ItemSpec {
  const groups = spec.match(SPEC)?.groups;
  if (!groups?.sku) {
    throw new UserError(
      `Bad item "${spec}". Use <sku>[:<option>,...][x<count>], e.g. 32067247198:少冰,半糖x2`
    );
  }
  const count = Number(groups.count ?? 1);
  if (count < 1) {
    throw new UserError(`Count must be at least 1 in "${spec}"`);
  }
  return {
    count,
    options: (groups.options ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    sku: groups.sku,
  };
}

const matches = (v: OptionValue, wanted: string) =>
  String(v.id) === wanted ||
  bare(v.name) === bare(wanted) ||
  v.short === bare(wanted);

/** Every choice an item offers, sku-fixed groups included: choosing one of those switches the sku. */
export const describeGroups = (groups: OptionGroup[]) =>
  groups
    .filter((g) => g.values.length > 1)
    .map((g) => `${g.name}=${g.values.map((v) => v.short).join("/")}`)
    .join(" ");

export function findItem(
  items: Item[],
  skuId: string
): { item: Item; sku: Sku } {
  for (const item of items) {
    const sku = item.skus.find((k) => String(k.id) === skuId);
    if (sku) {
      return { item, sku };
    }
  }
  throw new UserError(`sku ${skuId} is not on this shop's menu`);
}

function pickValues(item: Item, options: string[]) {
  const picked = new Map<OptionGroup, OptionValue>();
  for (const wanted of options) {
    const group = item.groups.find((g) =>
      g.values.some((v) => matches(v, wanted))
    );
    const value = group?.values.find((v) => matches(v, wanted));
    if (!(group && value)) {
      throw new UserError(
        `"${wanted}" is not an option of ${item.name}. Options: ${describeGroups(item.groups) || "none"}`
      );
    }
    picked.set(group, value);
  }
  return picked;
}

/** The sku carrying the picked sku-fixed values; values not picked stay as in `start`. */
function switchSku(
  item: Item,
  start: Sku,
  picked: Map<OptionGroup, OptionValue>
): Sku {
  const fixed = item.groups.filter((g) => g.bySku);
  const target = fixed.map((g) => picked.get(g) ?? valueOfSku(g.values, start));
  const sku = item.skus.find((k) =>
    fixed.every((g, i) => valueOfSku(g.values, k)?.id === target[i]?.id)
  );
  if (!sku) {
    throw new UserError(
      `${item.name} has no ${target.map((v) => v?.short).join(" + ")}. Combinations: ${item.skus.map((k) => k.label).join(" / ")}`
    );
  }
  return sku;
}

/** Turn a spec into an order line. Free groups left out take their first value. */
export function resolveLine(items: Item[], spec: ItemSpec): Line {
  const found = findItem(items, spec.sku);
  const { item } = found;
  const picked = pickValues(item, spec.options);
  const sku = switchSku(item, found.sku, picked);
  if (spec.count < sku.min) {
    throw new UserError(
      `${item.name} sells at least ${sku.min} per order: use ${sku.id}x${sku.min}`
    );
  }
  const chosen = item.groups.map((g) =>
    g.bySku ? valueOfSku(g.values, sku) : (picked.get(g) ?? g.values[0])
  );
  return {
    activityTag: "",
    attr_ids: chosen.filter((v) => v !== undefined).map((v) => v.id),
    count: spec.count,
    id: sku.id,
    skuId: sku.id,
  };
}
