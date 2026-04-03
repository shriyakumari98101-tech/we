# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Includes a Discord security bot and a shared API server.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Discord bot**: discord.js v14

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/discord-bot run start` — run Discord security bot

## Discord Bot (`artifacts/discord-bot`)

A full-featured Discord security and moderation bot.

### Required Secrets
- `DISCORD_BOT_TOKEN` — Bot token from Discord Developer Portal

### Features

**Moderation Commands**
- `/ban <player> [reason]` — ban (checks ban perm), sends DM with appeal link
- `/kick <player> [reason]` — kick (checks kick perm), sends DM
- `/timeout <player> <minutes> [reason]` — timeout (checks moderate perm)
- `/warn <player> [reason]` — warn system (Warn 1=24h timeout, Warn 2=48h timeout, Warn 3=ban)
- `/warns <player>` — view all warns for a user
- `/clearwarns <player>` — clear all warns for a user
- `/snipe <player>` — show last 10 deleted messages by a user
- `/purge <amount> [player]` — bulk delete messages
- `/lockdown <lock|unlock> [reason]` — lock/unlock channel

**Utility Commands**
- `/roblox` — live stats for Survive Events for Brainrots (CCU, visits, favorites, likes), link buttons to game page
- `/usercreate <user> <username> <password>` — server owner only, creates a web panel account and DMs credentials

**Info Commands**
- `/serverinfo` — show server info
- `/userinfo [player]` — show user info including warn count

**Configuration (Server Owner Only)**
- `/prefix <prefix>` — set custom prefix for text commands (e.g. `!ban @user reason`)
- `/whitelist <botname>` — whitelist a bot ID so it won't be kicked
- `/whitelistowner <username>` — whitelist a user so bot ignores their actions
- `/unwhitelistowner <username>` — remove a user from the whitelist

**Anti-Nuke / Anti-Raid Protection**
- Auto-kick unauthorized bots + notify the user who added them
- Mass mention detection: 2+ strikes → kick
- Spam detection: 5+ messages in 5 seconds → kick
- Link filtering: all non-GIF links deleted (except roles 1489027942137860116, 1480340173442125844, 1488894822327779348, 1489206286871433257)
- Discord invite links: always blocked regardless of role
- New webhooks: instantly deleted unless created by owner/whitelisted user
- Channel deletion: 4+ channels deleted rapidly → strip all roles from executor
- Dangerous role creation (admin perms): auto-delete unless by owner/whitelisted

**Logging**
- All actions logged to channel `1484747550505308302`
- Message deletion tracked (who deleted, content, channel)
- All mod actions logged with moderator, target, and reason

### Web Control Panel
- Served at `/panel` on the bot's web server (port `$PORT`, default 3000)
- Login page at `/login`, health check at `/health`
- JWT auth with `SESSION_SECRET` env var
- Role-based access: guest (commands only), mod (+ logs), admin (+ appeals), administrator/whitelist/owner (full access)
- Features: overview stats, command reference, moderation logs (last 200), ban appeal tracking, theme settings, account shift
- Optional `PANEL_URL` env var for correct URL in `/usercreate` DM; auto-detects Replit domain if not set

### Data Storage
- Persistent JSON data saved to `artifacts/discord-bot/data/botdata.json`
- Tracks: whitelisted bots, whitelisted owners, warns, prefixes, deleted messages, channel deletions, stripped roles, users, appeals (last 500), recentLogs (last 200)

### AI Detection
- OpenAI API via `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (auto-set by Replit)
- Model: `gpt-5-mini`, threshold: 65% AI confidence → reject
- Falls back to allowing the appeal if API is unavailable

### Appeal System
- Real AI detection on all submitted appeals
- Staff must enter a reason when approving/denying (modal popup) — reason sent to user via DM only
- All appeals stored in `data.appeals` with status (pending/approved/denied), reviewer, timestamps

### Prefix Commands
After setting a prefix with `/prefix`, all slash commands are also available as text commands:
- `!ban @user reason`
- `!kick @user reason`
- `!timeout @user <minutes> reason`
- `!warn @user reason`
- `!warns @user`
- `!clearwarns @user`
- `!snipe @user`
- `!purge <amount> [@user]`
- `!lockdown lock/unlock [reason]`
- `!whitelist <botId>`
- `!whitelistowner @user`
- `!unwhitelistowner @user`
- `!serverinfo`
- `!userinfo [@user]`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
