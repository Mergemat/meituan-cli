import { state } from "./config";
import { UserError } from "./errors";

export const MAX_CUTLERY = 10;

export function parseCutlery(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_CUTLERY) {
    throw new UserError(
      `Cutlery must be a whole number from 0 (none) to ${MAX_CUTLERY}, not "${value}"`
    );
  }
  return n;
}

/** Cutlery for this order: the flag, else the saved preference. Never guessed: the user decides. */
export function chooseCutlery(flag: string | undefined): number {
  if (flag !== undefined) {
    return parseCutlery(flag);
  }
  const saved = state.read().cutlery;
  if (saved === undefined) {
    throw new UserError(
      "How many sets of cutlery? Ask the user, then pass --cutlery=N (0 = none). To remember it: meituan-cli config cutlery N"
    );
  }
  return saved;
}

/** One line for quotes, so the agent knows to ask before ordering. */
export function cutleryNote(): string {
  const saved = state.read().cutlery;
  if (saved === undefined) {
    return "cutlery: not set. Ask the user how many sets (0 = none) and pass --cutlery=N, or save it with meituan-cli config cutlery N";
  }
  return `cutlery: ${saved === 0 ? "none" : `${saved} sets`} (saved; --cutlery=N overrides)`;
}
