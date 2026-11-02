import { state } from "../config";
import { UserError } from "../errors";
import { renderAddresses } from "../format";
import { chooseAddress, listAddresses } from "../meituan/context";
import type { Command } from "./command";

export const addr: Command = {
  name: "addr",
  async run({ pos }, open) {
    const { site } = await open();
    const list = await listAddresses(site);
    const [id] = pos;
    if (id) {
      const picked = list.find((a) => String(a.id) === id);
      if (!picked) {
        throw new UserError(
          `No address ${id}. Run meituan-cli addr to list them.`
        );
      }
      state.write({ ...state.read(), addressId: picked.id });
    }
    return {
      data: list,
      text: renderAddresses(list, chooseAddress(list).id),
    };
  },
  summary:
    "saved delivery addresses; * marks the one in use. Pass an id to switch.",
  usage: "addr [id]",
};
