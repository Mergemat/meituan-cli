import { state } from "../config";
import { UserError } from "../errors";
import type { Site } from "../site/site";
import type { Address } from "../types";
import type { RawAddress } from "./raw";

/** What every Meituan call needs: a signed-in site and the address food goes to. */
export interface Ctx {
  address: Address;
  site: Site;
}

export async function listAddresses(site: Site): Promise<Address[]> {
  const { list = [] } = await site.call<{ list?: RawAddress[] }>(
    "openh5/address/list"
  );
  return list.map((a) => ({
    gender: a.gender,
    id: a.addressId,
    isDefault: Boolean(a.isDefault),
    lat: a.lat,
    lng: a.lng,
    name: a.name,
    phone: a.phone,
    place: a.poi,
    room: a.address,
  }));
}

/** The address picked with `meituan-cli addr <id>`, else Meituan's default, else the first saved one. */
export function chooseAddress(list: Address[]): Address {
  const want = state.read().addressId;
  const a =
    list.find((x) => x.id === want) ?? list.find((x) => x.isDefault) ?? list[0];
  if (!a) {
    throw new UserError(
      "No saved delivery address. The user must add one in the Meituan app."
    );
  }
  return a;
}

export async function openCtx(site: Site): Promise<Ctx> {
  const address = chooseAddress(await listAddresses(site));
  // Search, menus and prices depend on where the food goes.
  site.location = { lat: address.lat, lng: address.lng };
  return { address, site };
}
