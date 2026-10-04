# Running JARVIS on a Mac and leaving it on

## Start

```bash
cd jarvis
npm install          # first time, and after pulling a new version
cp .env.example .env.local   # first time only; then fill in ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN
npm run dev
```

`npm run dev` is the one command: it starts the web app, the Telegram bot, the price-alert
monitor and the health checks in one process. Do not run a second copy at the same time
(a second JARVIS on this Mac refuses to poll the bot and says why).

After a few seconds the terminal prints the start-up report:

```
====================================
        JARVIS TRADING BOT
====================================

Telegram     ONLINE
Claude       ONLINE
Market Data  ONLINE
Database     ONLINE
ICT Engine   NOT PRESENT (knowledge notes only)
MSNR Engine  NOT PRESENT (knowledge notes only)
Monitor      RUNNING (2 symbols with price alerts, every 60 s)
...
```

If a line says `OFFLINE` or `NOT CONFIGURED`, the line above the report says why
(missing key, bad token, no internet, 409 Conflict…). The bot keeps running and
reconnects by itself when the network comes back (`[RECOVERY] …` in the log).

First time with a new Telegram bot: the terminal prints
`[TELEGRAM] Not paired yet. Send this code to @your_bot …: 123456`. Send that code to
the bot once from your phone. Then `/health` in the bot shows the live status.

Health from the Mac itself: `curl -s localhost:3000/api/health`.

## Keep the Mac awake while JARVIS runs

macOS sleeps when idle, and a sleeping Mac stops the bot. Start JARVIS through
`caffeinate` (built into macOS, no admin rights, changes no settings):

```bash
caffeinate -i npm run dev
```

`-i` keeps the Mac from idle-sleeping while JARVIS runs; the screen may still turn off,
which is fine. When JARVIS stops, normal sleep comes back by itself.
Add `-s` (`caffeinate -is npm run dev`) to also stay awake with the lid closed **while on
the charger**. Without the charger, closing the lid always sleeps the Mac.

## Stop

Press `Ctrl+C` in the terminal where JARVIS runs (once; wait for the prompt).
Data is saved as it changes, in `~/.jarvis`, so nothing is lost.

If the terminal was closed and JARVIS still seems to run:

```bash
lsof -ti tcp:3000          # shows the process id
kill <that id>             # stops it cleanly
```

## What JARVIS does on its own

- Answers you in Telegram (text and voice notes) with Claude and your knowledge base.
- Checks your price alerts every minute and messages you in Telegram when one fires
  (set them by asking, e.g. "XAUUSD 2700 dan oshsa ayt").
- Never trades: there is no order or broker code in JARVIS.

There is no automatic ICT/MSNR market scanner in the code yet: ICT and MSNR exist as
notes in the knowledge graph that Claude reads when you ask.
