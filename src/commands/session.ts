import { forget } from "../config";
import { UserError } from "../errors";
import { login as signIn } from "../site/login";
import type { Command } from "./command";

export const login: Command = {
  name: "login",
  async run() {
    if (!(await signIn())) {
      throw new UserError("Window closed before login.");
    }
    return { text: "Logged in." };
  },
  summary: "(user only) sign in with phone + SMS code in a browser window",
  usage: "login",
};

export const logout: Command = {
  name: "logout",
  run() {
    forget();
    return Promise.resolve({ text: "Logged out." });
  },
  summary: "forget the session, chosen address and caches",
  usage: "logout",
};
