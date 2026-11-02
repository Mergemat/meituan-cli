// The parts of Meituan's API payloads this CLI reads. Everything is optional because the API omits freely.

export interface RawAddress {
  address: string;
  addressId: number;
  gender: number;
  isDefault?: number;
  lat: number;
  lng: number;
  name: string;
  phone: string;
  poi: string;
}

export interface RawProduct {
  name?: string;
  pic_url?: string;
  picture?: string;
  price?: number;
  product_name?: string;
  product_price?: number;
}

export interface RawShop {
  average_price_tip?: string;
  delivery_time_tip?: string;
  distance?: string;
  min_price_tip?: string;
  month_sales_tip?: string;
  name: string;
  pic_url?: string;
  poi_id_str: string;
  product_list?: RawProduct[];
  shipping_fee_tip?: string;
  status?: number;
  status_desc?: string;
  wm_poi_score?: number;
}

export interface RawSku {
  id: number;
  min_order_count?: number;
  price: number;
  spec?: string;
}

export interface RawAttr {
  name: string;
  values: { id: number; value: string }[];
}

export interface RawSpu {
  attrs?: RawAttr[];
  description?: string;
  id: number;
  min_price: number;
  month_saled_content?: string;
  name: string;
  picture?: string;
  praise_num?: number;
  skus?: RawSku[];
  status?: number;
}

export interface RawTag {
  name: string;
  spus?: RawSpu[];
  tag: string;
}

export interface RawFood {
  food_spu_tags?: RawTag[];
  poi_info?: {
    delivery_time_tip?: string;
    min_price_tip?: string;
    name?: string;
    shipping_fee_tip?: string;
  };
  required_tag_info?: { has_required_tag?: boolean; required_tag_id?: string };
}

export interface RawRemind {
  content?: string;
  text?: string;
}

export interface RawPreview {
  box_total_price?: number | string;
  callback_info?: { preview_order_callback_info?: string };
  default_pay_type?: number;
  expected_arrival_info?: { select_view_time?: string };
  foodlist?: {
    attrs?: { value: string }[];
    count: number;
    name: string;
    picture?: string;
    sub_total_price: number;
  }[];
  no_product_reminds?: RawRemind[];
  order_preview_tip?: { text?: string };
  poi_name?: string;
  real_shipping_fee?: number;
  remind_infos?: RawRemind[];
  sub_total_price_discount?: number | string;
  tip?: string;
  token?: string;
  total?: number;
}

export interface RawOrder {
  mtOrderViewId: string;
  orderStatusStr?: string;
  orderTime?: string;
  productList?: { productCount: number; productName: string }[];
  shopName?: string;
  totalPrice?: string;
}
