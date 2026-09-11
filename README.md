# Glyph: Active Region Triggers

The map does the work.

![Glyph Banner](https://raw.githubusercontent.com/Sayshal/glyph/main/banner.png)

![GitHub release](https://img.shields.io/github/v/release/Sayshal/glyph?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/glyph/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fglyph%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

**[Read the Wiki](https://wiki.3deathsaves.com/glyph/)** for guides, API docs, and tips.

---

## Triggers Without Macros

Attach a program to a Region and the scene runs it when a token steps through a doorway or a player clicks a lever.

---

## What You Get

**Visual Program Editor:** Trigger logic is a node tree: sequences, if/else branches, loops over tokens in the Region, calls to other triggers, and delays. Any field can read from the triggering event with `{{path}}`, like `{{token.name}}` in a chat message.

<img src="https://wiki.3deathsaves.com/glyph/program-editor.png" alt="Visual Program Editor" width="750">

**Events Core Doesn't Fire:** Core Regions fire on enter, exit, move, and turn start/end. Glyph adds hover, clicks, door state changes, world time changes, and darkness changes.

<img src="https://wiki.3deathsaves.com/glyph/event-picker.png" alt="Event Picker" width="750">

**Actions for Tokens, Tiles, Audio, and Chat:** Move, rotate, create, or teleport tokens and toggle their conditions. Swap tile images, play or stop sounds, post chat cards, and open dialogs, journals, or actor sheets. Per-behavior variables persist between runs; the Toggle Switch recipe uses one to remember whether its tile is visible.

<img src="https://wiki.3deathsaves.com/glyph/action-picker.png" alt="Action Picker" width="750">

**System-Aware Actions:** Hurt/Heal takes a dice formula and an optional damage type from the active system's list, and can post the roll as a damage card. Ability Test and Skill Test roll through the system's own pipeline. Enhanced support for D&D5e and PF2e.

<img src="https://wiki.3deathsaves.com/glyph/hurt-heal.png" alt="Hurt/Heal Action" width="750">

**Import From Monk's Active Tile Triggers:** Right-click a scene with Monk's Active Tile Triggers tiles and Glyph converts their actions into program trees. Anything it can't translate gets flagged for manual review.

<img src="https://wiki.3deathsaves.com/glyph/matt-import.png" alt="MATT Import" width="750">

---

## Also Included

- `if`/`else`, `forEach`, `goto`/`landing`, `call`, and `wait` nodes for flow control.
- Actions for Calendaria, Bondsmith, Peddler, Minstrel, Hero Mancer, Spell Book, Mindful Encounters, Tenacity, Don't Forget, Token Light Condition, FXMaster, and Tagger. Each set shows up once its module is active.
- `GLYPH.registerAction()` lets other modules add their own nodes to the action picker.

---

## 20+ Ready-to-Use Recipes

Teleporters, stairways, light switches, traps, ambushes, merchant stalls. Applying a recipe creates every Region behavior it needs in one click.

<img src="https://wiki.3deathsaves.com/glyph/recipe-picker.png" alt="Recipe Picker" width="750">

---

## For the Tinkerers

The `GLYPH` global exposes the API for macros and other modules. `GLYPH.registerAction()` adds custom actions, and `GLYPH.runTrigger()` runs a trigger from a macro.

```javascript
GLYPH.registerAction('my-module', 'sayHello', {
  execute: async (node, context) => ChatMessage.create({ content: `Hello, ${node.name}!` })
});

await GLYPH.runTrigger(behaviorUuid, 'manual');
```

---

## Requirements

Glyph requires **[3DS:ATLAS](https://github.com/Sayshal/3ds-atlas)**, the shared settings and theming layer for 3 Death Saves modules. Glyph's UI uses the theme set there.

---

## Installation

Find **Glyph** in Foundry's Module Browser, or paste this manifest URL:

```
https://github.com/Sayshal/glyph/releases/latest/download/module.json
```

Questions and ideas go to [Discord](https://discord.gg/PzzUwU9gdz). Guides are on the [Wiki](https://wiki.3deathsaves.com/glyph/).
