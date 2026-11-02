---
name: meituan-cli
description: Order Meituan takeout (美团外卖) for the user with the meituan-cli command. Use when the user wants food, drinks or groceries delivered in mainland China, mentions Meituan, 美团, 外卖 or 点外卖, or asks to compare dishes, prices, macros or delivery times.
---

# meituan-cli

Run `meituan-cli help` first; it lists every command and the item format. `meituan-cli help <command>` explains one.

## Workflow

1. `meituan-cli search <keyword>` with Chinese dish or shop names (轻食, 牛肉饭, 奶茶).
2. `meituan-cli menu <shop> [word]` to see dishes, one `<sku>` each, with option groups.
3. `meituan-cli item <shop> <sku>...` for full descriptions and photo paths. Open the photos: shops print calories, protein and portion sizes on them.
4. `meituan-cli quote <shop> <item>...` for the real total. Only quotes have real fees and discounts.
5. `meituan-cli order ... --confirm=<total>` only when the user asked to order.

## Rules

- Never pay. `meituan-cli pay` gives a link for the user's phone; hand it over.
- Ask the user how many sets of cutlery before ordering (0 = none), unless `meituan-cli config` shows a saved choice.
- Dishes marked `[app]` can only be ordered in the Meituan app. Compare them normally; if one is in the final order, give the user the link and list that `meituan-cli order` returns.
- When a command refuses, its message says what to change. Follow it rather than retrying the same command.
- If you are told to log in, ask the user to run `meituan-cli login`; it needs their phone.
