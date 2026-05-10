import type { ModifierType, GameSettings } from "../../../server/game-logic";

export const MAX_HP = 250;
export const LARGE_DAMAGE_THRESHOLD = 15;
export const CPU_DIE_FACES = 20;
export const HUMAN_ID = 1;
export const CPU_ID = 2;

export const PLAYER_COLORS = [
  { bg: "bg-rose-950/40",    border: "border-rose-500",    bar: "bg-rose-500",    text: "text-rose-400" },
  { bg: "bg-blue-950/40",    border: "border-blue-500",    bar: "bg-blue-500",    text: "text-blue-400" },
  { bg: "bg-emerald-950/40", border: "border-emerald-500", bar: "bg-emerald-500", text: "text-emerald-400" },
  { bg: "bg-amber-950/40",   border: "border-amber-500",   bar: "bg-amber-500",   text: "text-amber-400" },
];

export const MODIFIER_INFO: Record<ModifierType, { name: string; emoji: string; cls: string }> = {
  frost:      { name: "Frost",      emoji: "❄️", cls: "bg-blue-500/20 text-blue-300 border-blue-400/40" },
  fire:       { name: "Fire",       emoji: "🔥", cls: "bg-orange-500/20 text-orange-300 border-orange-400/40" },
  poison:     { name: "Poison",     emoji: "☠️", cls: "bg-green-500/20 text-green-300 border-green-400/40" },
  shield:     { name: "Shield",     emoji: "🛡️", cls: "bg-gray-500/20 text-gray-300 border-gray-400/40" },
  earthquake: { name: "Earthquake", emoji: "⚡", cls: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40" },
};

export const SETTING_GROUPS: Array<{
  label: string;
  fields: Array<{ key: keyof GameSettings; label: string; min: number; max: number; step: number; suffix?: string }>;
}> = [
  { label: "General", fields: [
    { key: "maxHp",             label: "Max HP",               min: 50,  max: 500, step: 25 },
    { key: "spawnIntervalSecs", label: "Modifier spawn every", min: 5,   max: 120, step: 5, suffix: "s" },
  ]},
  { label: "🔥 Fire", fields: [
    { key: "fireDamage", label: "Damage per tick", min: 1, max: 50, step: 1 },
    { key: "fireRolls",  label: "Ticks",           min: 1, max: 10, step: 1 },
  ]},
  { label: "❄️ Frost", fields: [
    { key: "frostSecs", label: "Freeze duration", min: 1, max: 60, step: 1, suffix: "s" },
  ]},
  { label: "☠️ Poison", fields: [
    { key: "poisonRolls", label: "Ticks (−50% dmg)", min: 1, max: 10, step: 1 },
  ]},
  { label: "🛡️ Shield", fields: [
    { key: "shieldHp", label: "HP amount", min: 5, max: 200, step: 5 },
  ]},
  { label: "⚡ Earthquake", fields: [
    { key: "earthquakeMult", label: "Damage multiplier", min: 1, max: 10, step: 0.5, suffix: "×" },
  ]},
  { label: "⚔️ Fighter", fields: [
    { key: "fighterBlock", label: "Damage blocked", min: 0, max: 20, step: 1 },
  ]},
  { label: "🗡️ Rogue", fields: [
    { key: "rogueBonus", label: "Bonus damage", min: 0, max: 20, step: 1 },
  ]},
  { label: "🔮 Wizard", fields: [
    { key: "wizardRange", label: "Adjacent face range", min: 0, max: 5, step: 1 },
  ]},
];
