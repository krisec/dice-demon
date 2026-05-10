// ── Constants ────────────────────────────────────────────────────────────────

export const MAX_HP = 250;
export const FIRE_DAMAGE = 8;
export const FIRE_ROLLS = 3;
export const SHIELD_HP = 25;
export const FROST_MS = 8_000;
export const POISON_ROLLS = 3;
export const SPAWN_INTERVAL_MS = 30_000;

export const ALL_MODIFIERS: ModifierType[] = ["frost", "fire", "poison", "shield", "earthquake"];

export const MODIFIER_INFO: Record<ModifierType, { name: string; emoji: string; cls: string }> = {
  frost:      { name: "Frost",      emoji: "❄️", cls: "bg-blue-500/20 text-blue-300 border-blue-400/40" },
  fire:       { name: "Fire",       emoji: "🔥", cls: "bg-orange-500/20 text-orange-300 border-orange-400/40" },
  poison:     { name: "Poison",     emoji: "☠️", cls: "bg-green-500/20 text-green-300 border-green-400/40" },
  shield:     { name: "Shield",     emoji: "🛡️", cls: "bg-gray-500/20 text-gray-300 border-gray-400/40" },
  earthquake: { name: "Earthquake", emoji: "⚡", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModifierType = "frost" | "fire" | "poison" | "shield" | "earthquake";
export type GamePhase = "lobby-entry" | "lobby-waiting" | "playing" | "gameover";
export type PlayerClass = "fighter" | "wizard" | "rogue";

export const CLASS_INFO: Record<PlayerClass, { name: string; emoji: string; desc: string }> = {
  fighter: { name: "Fighter", emoji: "⚔️", desc: "50% chance to reduce incoming damage by 2" },
  wizard:  { name: "Wizard",  emoji: "🔮", desc: "Triggers modifiers on adjacent die faces (±1)" },
  rogue:   { name: "Rogue",   emoji: "🗡️", desc: "50% chance to deal +2 damage" },
};

export interface PlayerStatus {
  frozenUntil: number;
  burningRolls: number;
  poisonedRolls: number;
  shieldHp: number;
  earthquakeReady: boolean;
}

export interface GamePlayer {
  id: number;
  name: string;
  hp: number;
  status: PlayerStatus;
  modifierMap: Partial<Record<number, ModifierType>>;
  dieFaceCount: number;
  lastRoll?: number;
  eliminated: boolean;
  dieConnected: boolean;
  dieName: string;
  playerClass: PlayerClass;
}

export interface RoomState {
  roomKey: string;
  hostId: number;
  playerCount: number;
  phase: GamePhase;
  players: GamePlayer[];
  logs: string[];
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function makePlayer(id: number, name?: string): GamePlayer {
  return {
    id,
    name: name ?? `Player ${id + 1}`,
    hp: MAX_HP,
    status: { frozenUntil: 0, burningRolls: 0, poisonedRolls: 0, shieldHp: 0, earthquakeReady: false },
    modifierMap: {},
    dieFaceCount: 20,
    lastRoll: undefined,
    eliminated: false,
    dieConnected: false,
    dieName: "",
    playerClass: "fighter",
  };
}

// ── Pure game logic ───────────────────────────────────────────────────────────

function applyDamage(player: GamePlayer, dmg: number): GamePlayer {
  if (dmg <= 0) return player;
  let remaining = dmg;
  let { shieldHp } = player.status;
  if (shieldHp > 0) {
    const absorbed = Math.min(shieldHp, remaining);
    shieldHp -= absorbed;
    remaining -= absorbed;
  }
  const hp = Math.max(0, player.hp - remaining);
  return { ...player, hp, eliminated: hp === 0, status: { ...player.status, shieldHp } };
}

export function processRoll(
  players: GamePlayer[],
  rollerId: number,
  face: number,
  dieFaceCount: number,
  now: number,
): { players: GamePlayer[]; logs: string[] } {
  const roller = players.find(p => p.id === rollerId)!;
  const logs: string[] = [];

  if (roller.status.frozenUntil > now) {
    const secs = Math.ceil((roller.status.frozenUntil - now) / 1000);
    logs.push(`❄️ ${roller.name} is frozen! (${secs}s remaining)`);
    return { players, logs };
  }

  let ps = players.map(p => ({ ...p, status: { ...p.status } }));
  const ri = ps.findIndex(p => p.id === rollerId);
  ps[ri] = { ...ps[ri], lastRoll: face, dieFaceCount };

  // Wizard checks ±1 adjacent faces; everyone else checks only the rolled face
  const faceRange = ps[ri].playerClass === "wizard"
    ? [face - 1, face, face + 1].filter(f => f >= 1 && f <= (ps[ri].dieFaceCount || 20))
    : [face];

  for (const checkFace of faceRange) {
    const mod = ps[ri].modifierMap[checkFace];
    if (!mod) continue;

    const info = MODIFIER_INFO[mod];
    const faceNote = checkFace !== face ? ` (face ${checkFace})` : "";
    logs.push(`✨ ${roller.name} rolled ${face} — ${info.emoji} ${info.name}!${faceNote}`);
    const newMap = { ...ps[ri].modifierMap };
    delete newMap[checkFace];
    ps[ri] = { ...ps[ri], modifierMap: newMap };

    const oppIdxs = ps.map((_, i) => i).filter(i => ps[i].id !== rollerId && !ps[i].eliminated);

    switch (mod) {
      case "frost":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, frozenUntil: now + FROST_MS } }; });
        if (oppIdxs.length) logs.push(`  All opponents frozen for 8s!`);
        break;
      case "fire":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, burningRolls: ps[i].status.burningRolls + FIRE_ROLLS } }; });
        if (oppIdxs.length) logs.push(`  All opponents are burning! (+${FIRE_DAMAGE} dmg × ${FIRE_ROLLS} rolls)`);
        break;
      case "poison":
        oppIdxs.forEach(i => { ps[i] = { ...ps[i], status: { ...ps[i].status, poisonedRolls: ps[i].status.poisonedRolls + POISON_ROLLS } }; });
        if (oppIdxs.length) logs.push(`  All opponents poisoned! (−50% dmg × ${POISON_ROLLS} rolls)`);
        break;
      case "shield":
        ps[ri] = { ...ps[ri], status: { ...ps[ri].status, shieldHp: ps[ri].status.shieldHp + SHIELD_HP } };
        logs.push(`  🛡️ ${roller.name} gains a ${SHIELD_HP} HP shield!`);
        break;
      case "earthquake":
        ps[ri] = { ...ps[ri], status: { ...ps[ri].status, earthquakeReady: true } };
        logs.push(`  ⚡ ${roller.name} charges an earthquake!`);
        break;
    }
  }

  if (ps[ri].status.burningRolls > 0) {
    const before = ps[ri];
    ps[ri] = { ...applyDamage(ps[ri], FIRE_DAMAGE), status: { ...ps[ri].status, burningRolls: ps[ri].status.burningRolls - 1 } };
    const absorbed = FIRE_DAMAGE - (before.hp - ps[ri].hp);
    const taken = FIRE_DAMAGE - Math.max(0, absorbed);
    logs.push(`🔥 ${roller.name} takes ${taken} fire damage! (${ps[ri].status.burningRolls} rolls remaining)`);
    if (ps[ri].eliminated) logs.push(`💀 ${roller.name} was eliminated by fire!`);
  }

  if (ps[ri].eliminated) return { players: ps, logs };

  let damage = face;

  // Rogue: 50% chance to deal +2 damage
  if (ps[ri].playerClass === "rogue" && Math.random() < 0.5) {
    damage += 2;
    logs.push(`🗡️ ${roller.name} strikes with precision! (+2 dmg)`);
  }

  if (ps[ri].status.poisonedRolls > 0) {
    damage = Math.floor(damage / 2);
    ps[ri] = { ...ps[ri], status: { ...ps[ri].status, poisonedRolls: ps[ri].status.poisonedRolls - 1 } };
    logs.push(`☠️ ${roller.name} is poisoned — damage halved to ${damage}`);
  }
  if (ps[ri].status.earthquakeReady) {
    damage *= 2;
    ps[ri] = { ...ps[ri], status: { ...ps[ri].status, earthquakeReady: false } };
    logs.push(`⚡ Earthquake! Damage doubled to ${damage}!`);
  }

  ps
    .map((_, i) => i)
    .filter(i => ps[i].id !== rollerId && !ps[i].eliminated)
    .forEach(oi => {
      const before = ps[oi];
      let incoming = damage;

      // Fighter: 50% chance to reduce incoming damage by 2
      if (before.playerClass === "fighter" && Math.random() < 0.5) {
        const blocked = Math.min(2, incoming);
        incoming -= blocked;
        if (blocked > 0) logs.push(`⚔️ ${before.name} braces for impact! (−${blocked} dmg)`);
      }

      ps[oi] = applyDamage(ps[oi], incoming);
      const shieldAbsorbed = before.status.shieldHp - ps[oi].status.shieldHp;
      const actualDmg = incoming - shieldAbsorbed;
      if (shieldAbsorbed > 0) logs.push(`🛡️ ${before.name}'s shield absorbed ${shieldAbsorbed} damage!`);
      logs.push(`⚔️ ${roller.name} rolled ${face} → ${actualDmg} dmg to ${before.name} (${ps[oi].hp}/${MAX_HP} HP)`);
      if (ps[oi].eliminated) logs.push(`💀 ${before.name} has been eliminated!`);
    });

  return { players: ps, logs };
}

export function spawnModifiers(players: GamePlayer[], playerCount: number): GamePlayer[] {
  return players.map((p, i) => {
    if (i >= playerCount || p.eliminated) return p;
    const faceCount = p.dieFaceCount || 20;
    const face = 1 + Math.floor(Math.random() * faceCount);
    const mod = ALL_MODIFIERS[Math.floor(Math.random() * ALL_MODIFIERS.length)];
    return { ...p, modifierMap: { ...p.modifierMap, [face]: mod } };
  });
}
