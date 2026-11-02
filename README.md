# meituan-cli

[![CI](https://github.com/Mergemat/meituan-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Mergemat/meituan-cli/actions/workflows/ci.yml)

Order Meituan takeout (美团外卖) from the terminal, built for AI agents. Every command prints terse, id-first text, prices come from Meituan's real checkout, and the user always pays on their own phone.

```console
$ meituan-cli search 奶茶
Ov9cVIkLSxReiMkgBgeQyQI 霸王茶姬（上海吴江路店） ★4.8 26分钟 3.2km 起送¥20 配送¥3.3 | 伯牙绝弦（茉莉雪芽）¥17 轻因·伯牙绝弦¥22 青青糯山（糯米香绿茶）¥16
…
$ meituan-cli menu Ov9cVIkLSxReiMkgBgeQyQI 伯牙
霸王茶姬（上海吴江路店） 起送¥20 配送¥3.3 26分钟
## 轻因不扰眠系列
轻因·伯牙绝弦 — 32067247199 ¥17-22 — 份量=中杯/大杯 温度=标准冰/少冰/去冰/热/去冰：去除冰块，有冰感 甜度=标准糖/少糖/半糖/微糖/不另外加糖/不另外加糖：甜感弱
轻因·伯牙柠檬奶 — 50193552162 ¥22 — 温度=标准冰/少冰 甜度=标准糖/少糖/微糖/不另外加糖/不另外加糖：甜感弱
$ meituan-cli quote Ov9cVIkLSxReiMkgBgeQyQI 32067247199:大杯,少冰,半糖
霸王茶姬（上海吴江路店） → 某某大厦 1201室
1× 轻因·伯牙绝弦 大杯 少冰 半糖 ¥22
包装¥1 配送¥3.3 总计¥26.3 (already ¥1.5 off) · 立即送出(大约21:58送达)
cutlery: not set. Ask the user how many sets (0 = none) and pass --cutlery=N, or save it with meituan-cli config cutlery N
To order: meituan-cli order Ov9cVIkLSxReiMkgBgeQyQI 32067247199:大杯,少冰,半糖 --confirm=26.3
```

> **Unofficial.** Not affiliated with or endorsed by Meituan. It drives Meituan's public mobile website with your own account; use it the way you would use the site yourself, at your own risk.

## Install

You need a Chromium browser: Google Chrome, or `bunx playwright install chromium`.

**Binary** (macOS, Linux): download `meituan-cli-<os>-<arch>` from [Releases](https://github.com/Mergemat/meituan-cli/releases), make it executable and put it on your `PATH`:

```sh
chmod +x meituan-cli-darwin-arm64 && mv meituan-cli-darwin-arm64 ~/.local/bin/meituan-cli
```

**From source** (needs [Bun](https://bun.sh)):

```sh
git clone https://github.com/Mergemat/meituan-cli && cd meituan-cli
bun install
bun run build        # → dist/meituan-cli, a single binary
bun run link         # optional: symlink it to ~/.local/bin/meituan-cli
```

## First run

```sh
meituan-cli login              # a browser window opens: sign in with phone number + SMS code
meituan-cli addr               # check which saved address food goes to
meituan-cli config cutlery 0   # optional: never ask about cutlery again (0 = none)
```

Meituan serves mainland China. If you use a VPN, route `meituan.com` directly or menus and checkout may be refused.

## Using it with an AI agent

`meituan-cli help` is written to be all an agent needs. Give the agent the binary and a task in plain words:

> i want a high protein dinner tonight, 45g+ protein, under 750 kcal, under 60 yuan with delivery, no pork. compare a few places, read the descriptions and look at the pictures to figure out the macros. show me your top picks, then order the best one but dont pay.

For Claude Code, Codex and other skill-aware agents, [`skills/meituan-cli/SKILL.md`](skills/meituan-cli/SKILL.md) teaches the workflow and the ground rules. Copy it into your agent's skills folder (for Claude Code: `~/.claude/skills/meituan-cli/`).

Agents can look at food: `meituan-cli item` saves each dish's photo locally and prints the path, and photos are where shops print calories and portion sizes.

## Commands

| Command | |
|---|---|
| `addr [id]` | saved delivery addresses; pass an id to switch |
| `search <keyword>` | shops delivering to you, with matching dishes |
| `menu <shop> [word]` | dishes with one sku each, price, and option groups |
| `item <shop> <sku>...` | full description, options, and a local path to the photo |
| `quote <shop> <item>...` | real checkout total: fees, discounts, arrival time |
| `order <shop> <item>... --confirm=<total>` | place the order (not paid) |
| `orders` | recent orders |
| `pay <orderId>` | payment link for the user's phone |
| `cancel <orderId> --confirm` | cancel an order |
| `config [key] [value]` | saved preferences, e.g. `config cutlery 0` or `config cutlery unset` |
| `login` / `logout` | sign in / forget the session and caches |

An item is `<sku>[:<option>,...][x<count>]`, for example `32067247199:大杯,少冰,半糖x2`. Options go by name, as the menu prints them, and also pick sizes and combo parts. Groups you leave out take their first value. `--json` on any command prints the full data, picture URLs included. `meituan-cli help <command>` explains one command.

## Safety

- `order` needs `--confirm=<total>` equal to the current checkout total, so a price that moved since the quote blocks the order.
- `order` refuses until cutlery is decided, with `--cutlery=N` (0 = none) or a saved `config cutlery`. It never guesses.
- `meituan-cli` never pays. `pay` returns Meituan's cashier link for the user to open on their phone. Unpaid orders expire on their own.

## What it cannot do

- **Pay.** By design.
- **Order dishes with app-only add-ons.** Some dishes need add-ons (小料) that only the Meituan app can choose; Meituan's website and WeChat mini-program cannot order them either. Menus mark them `[app]`, quotes price them at menu price as an estimate, and `order` returns an app link and the exact list to add instead of ordering.
- **Shops outside your delivery range,** group deals (团购), or grocery-only services.

## How it works

Meituan signs every API request with a script that runs in its web page (H5guard, the `mtgsig` header). `meituan-cli` opens the mobile site (`h5.waimai.meituan.com`) in a headless Chromium, lets that script sign each call, and talks to the same JSON endpoints the site uses. Menus come from the WeChat mini-program's endpoint, which returns the whole orderable menu in one call; the site's own menu fills in the app-only dishes.

Bursts of hundreds of requests get endpoints blocked (HTTP 403) for a while, so `meituan-cli` loads categories a few at a time and caches menus for 10 minutes.

### Files

| Path | |
|---|---|
| `~/.config/meituan-cli/session.json` | your Meituan session (cookies). Treat it like a password |
| `~/.config/meituan-cli/state.json` | chosen address and preferences |
| `~/.config/meituan-cli/calls.jsonl` | local history of each call and its output, for measuring agent runs. Off with `MEITUAN_CLI_NOLOG=1` |
| `~/.cache/meituan-cli/` | menus, photos, dishes known to need the app |

Nothing leaves your machine except requests to Meituan. `MEITUAN_CLI_HOME` moves the config folder.

## Development

```sh
bun test             # item specs, option resolution, required items
bun run check        # lint + format (Ultracite / Biome); bun run fix to apply
bun run typecheck
bun run bench        # token cost of a fixed session, per command
bun run score <ms>   # score an agent's run from the call history since <ms>
bun run scan         # orderability across ~30 shops; slow on purpose (needs login)
```

`eval/` holds agent tasks used to tune the output for agents: give one to an agent, then `bun run score <start ms>` reports calls, failures and output tokens.

```
src/
  cli.ts          entry: args, dispatch, errors, history
  commands/       one file per command, plus the registry
  meituan/        Meituan API by domain: address, search, menu, checkout, orders; raw payload types
  site/           browser launch, login, signed transport
  cart.ts         prices carts, learns app-only dishes
  items.ts        item specs → order lines
  required.ts     items a shop requires in every order
  format.ts       terse text renderers
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
