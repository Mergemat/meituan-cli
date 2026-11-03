export interface Address {
  gender: number;
  id: number;
  isDefault: boolean;
  lat: number;
  lng: number;
  name: string;
  phone: string;
  place: string;
  room: string;
}

export interface ShopHit {
  deliveryFee: string;
  distance: string;
  eta: string;
  items: {
    name: string;
    pic: string;
    price: number;
    sku: number;
    spu: number;
    /** Regular price, when `price` is a deal (often one per order). */
    was?: number;
  }[];
  kind: "restaurant" | "store";
  minOrder: string;
  name: string;
  open: boolean;
  perPerson: string;
  pic: string;
  sales: string;
  score: number;
  shop: string;
  status?: string;
}

export interface OptionValue {
  id: number;
  name: string;
  short: string;
  /** The skus that carry this value, when Meituan says so (see withSkuAttrs). */
  skus?: number[];
}

/** `bySku` groups are decided by the chosen sku (份量: 中杯/大杯, or a combo's parts), not by the caller. */
export interface OptionGroup {
  bySku: boolean;
  name: string;
  values: OptionValue[];
}

export interface Sku {
  id: number;
  label: string;
  /** Fewest the shop sells in one order. */
  min: number;
  price: number;
  spec: string;
}

export interface Item {
  /** Needs add-ons only the Meituan app can choose; the site cannot order it. */
  appOnly: boolean;
  category: string;
  desc: string;
  groups: OptionGroup[];
  likes: number;
  name: string;
  pic: string;
  price: number;
  skus: Sku[];
  sold: string;
  soldOut: boolean;
  spu: number;
}

export interface Menu {
  /** False when only part of the site menu loaded, so some app-only dishes may be missing their mark. */
  appOnlyChecked: boolean;
  categories: { items: Item[]; name: string }[];
  deliveryFee: string;
  eta: string;
  minOrder: string;
  name: string;
  /** Category the shop requires in every order (e.g. a cutlery line), if any. */
  required?: string;
  shop: string;
  /**
   * Categories Meituan listed without their products. Big grocery stores send only their first page;
   * loading the rest takes a request per category, so search finds those products instead.
   */
  unlisted: number;
}

/** One order line, in the shape Meituan's preview and submit endpoints take. */
export interface Line {
  activityTag: string;
  attr_ids: number[];
  count: number;
  id: number;
  skuId: number;
}

export interface Quote {
  /** Whether checkout offers a cutlery choice. Grocery stores do not. */
  asksCutlery: boolean;
  deliverTo: string;
  delivery: number;
  discount: number;
  eta: string;
  lines: {
    count: number;
    /** Units at a promotional price; Meituan splits an item into a deal line and a full-price line when the deal is limited. */
    deal: boolean;
    name: string;
    options: string;
    pic: string;
    price: number;
  }[];
  name: string;
  packaging: number;
  shop: string;
  total: number;
  warnings: string[];
}

export interface Order {
  id: string;
  items: string[];
  shop: string;
  status: string;
  time: string;
  total: number;
}
