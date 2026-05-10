# Dice Demons

A web app for playing with [Pixel Bluetooth dice](https://gamewithpixels.com/). Connect your physical dice over Bluetooth and use them to interact with the apps below.

## Routes

### `/` — Home

Landing page with links to the two tools.

### `/list` — Dice List Picker

Connect one or more Pixel dice and enter a list of items. Roll to pick a random entry — the rolled face maps proportionally to the list. Supports multiple dice; their faces are summed to produce a single combined roll.

### `/hammer-of-wilderwood` — Multiplayer Battle Game

A real-time 2–4 player battle game over WebSockets. Each player opens the page on their own device, connects their own Bluetooth die, and joins a shared room via a 4-character room code.

**How it works:**
1. One player creates a room and shares the code.
2. Everyone joins and connects their Pixel die.
3. The host configures optional settings (HP, modifier strengths) and starts the battle.
4. Players take turns rolling — the rolled number becomes the damage dealt to all opponents.
5. Modifier tiles spawn periodically on die faces; landing on one triggers its effect.
6. Last player standing wins.

**Modifiers:**
| Modifier | Effect |
|---|---|
| Frost ❄️ | Freezes all opponents for N seconds |
| Fire 🔥 | Burns all opponents for N rolls |
| Poison ☠️ | Halves the poisoned player's damage for N rolls |
| Shield 🛡️ | Grants the roller a temporary HP shield |
| Earthquake ⚡ | Multiplies the roller's next damage |

**Player classes** (chosen in the lobby):
| Class | Passive |
|---|---|
| Fighter ⚔️ | 50% chance to reduce incoming damage by 2 |
| Wizard 🔮 | Modifiers trigger on adjacent die faces (±1) |
| Rogue 🗡️ | 50% chance to deal +2 damage |

## Getting Started

Install dependencies (requires [pnpm](https://pnpm.io/)):

```bash
pnpm install
```

### Development

Starts the React Router dev server (port 5173) and a standalone WebSocket server (port 3001):

```bash
pnpm dev
```

### Production Build

```bash
pnpm build
pnpm start   # single process — HTTP + WebSocket on port 3000
```

### Docker

```bash
docker build -t dice-demons .
docker run -p 3000:3000 dice-demons
```
