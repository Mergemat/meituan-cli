import { addr } from "./addr";
import type { Command } from "./command";
import { config } from "./config";
import { item } from "./item";
import { menu } from "./menu";
import { order } from "./order";
import { cancel, orders, pay } from "./orders";
import { quote } from "./quote";
import { search } from "./search";
import { login, logout } from "./session";

/** In the order an agent uses them; help lists them this way. */
export const commands: Command[] = [
  addr,
  search,
  menu,
  item,
  quote,
  order,
  orders,
  pay,
  cancel,
  config,
  login,
  logout,
];

export const findCommand = (name: string) =>
  commands.find((c) => c.name === name);
