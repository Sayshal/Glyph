# Glyph: Active Region Triggers

_The map does the work._

![GitHub release](https://img.shields.io/github/v/release/Sayshal/glyph?style=for-the-badge)
![GitHub Downloads (specific asset, all releases)](<https://img.shields.io/github/downloads/Sayshal/glyph/module.zip?style=for-the-badge&logo=foundryvirtualtabletop&logoColor=white&logoSize=auto&label=Downloads%20(Total)&color=ff144f>)

![Foundry Version](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dfor-the-badge%26url%3Dhttps%3A%2F%2Fgithub.com%2FSayshal%2Fglyph%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
[![Discord](https://dcbadge.limes.pink/api/server/PzzUwU9gdz)](https://discord.gg/PzzUwU9gdz)

**[Read the Wiki](https://wiki.3deathsaves.com/glyph/)** for guides, API docs, and tips.

---

## Triggers Without Macros

Attach a program to a Region and let the scene run it: a token steps through a doorway, a player clicks a lever, a trap arms itself. Glyph replaces Active Tile Triggers with something built for Foundry's own Region system - no `eval()`, no jQuery, no tile geometry to fight.

---

## What You Get

**Visual Program Editor:** Build trigger logic as a node tree instead of a script: sequences, if/else branches, loops over tokens in the Region, sub-program calls, and delays. Every field accepts `{{path}}` interpolation against the triggering event, so a chat message can reference `{{token.name}}` and a formula can reference `{{token.actor}}` directly.

<img src="https://wiki.3deathsaves.com/glyph/program-editor.png" alt="Visual Program Editor" width="750">

**Events Core Doesn't Fire:** Beyond core Region events (enter, exit, move, turn start/end), Glyph adds hover, click, right-click, double-click, door opened/closed/locked/unlocked/revealed, world time changes, and darkness level changes. Interaction events relay correctly in multiplayer, so a player's click on a Region resolves through the primary GM's client.

<img src="https://wiki.3deathsaves.com/glyph/event-picker.png" alt="Event Picker" width="750">

**Actions Across Tokens, Tiles, Scenes, Audio, and Messaging:** Move, rotate, or create tokens, toggle conditions, teleport, change tile images or occlusion, play or stop sounds through a tracked playlist, post chat cards, show dialogs with custom buttons, open journals or actor sheets. Persistent per-behavior variables let a Region remember state between triggers: the Toggle Switch recipe uses one to track whether a tile is currently visible.

<img src="https://wiki.3deathsaves.com/glyph/action-picker.png" alt="Action Picker" width="750">

**System-Aware Actions:** Hurt/Heal accepts a dice formula (not just a flat number), an optional damage type pulled straight from the active system's own list, and can post the roll to chat as a damage card. Ability Test and Skill Test run a real check through the system's own roll pipeline. Currently wired for D&D 5e and Pathfinder 2e, using the same adapter pattern for whatever system comes next.

<img src="https://wiki.3deathsaves.com/glyph/hurt-heal.png" alt="Hurt/Heal Action" width="750">

**Import From Monk's Active Tile Triggers:** Right-click a scene with MATT tiles and Glyph converts their actions into equivalent program trees automatically, flagging anything it can't translate for manual review instead of silently dropping it.

<img src="https://wiki.3deathsaves.com/glyph/matt-import.png" alt="MATT Import" width="750">

---

## Also Included

- **Recipe Library:** 20+ ready-to-use recipes across movement, lighting, hazards, mechanisms, and social encounters - teleporters, stairways, light switches, traps, ambushes, merchant stalls. Applying one creates every Region behavior it needs in a single click.
- **Sequence, Branch & Loop Nodes:** `if`/`else`, `forEach` over tokens in the Region, `goto`/`landing` for jumping within a program, `call` for invoking another trigger's handler, and `wait` for timed delays.
- **Optional Module Integrations:** Actions for Calendaria (advance time, create calendar notes), Bondsmith (reputation, faction membership), Peddler, Minstrel, Hero Mancer, Spell Book, Mindful Encounters, Tenacity, Don't Forget, Token Light Condition, FXMaster, and Tagger appear once each module is active.
- **A Public API:** `GLYPH.registerAction()` lets any module register its own node type, namespaced under its own module id, so third-party actions show up in the same picker as Glyph's built-ins.

<img src="https://wiki.3deathsaves.com/glyph/recipe-picker.png" alt="Recipe Picker" width="750">

---

## For the Tinkerers

Full API at `GLYPH` for macros and module integration.

```javascript
GLYPH.registerAction('my-module', 'sayHello', {
  execute: async (node, context) => ChatMessage.create({ content: `Hello, ${node.name}!` })
});

const isAtlasActive = GLYPH.isModuleActive('3ds-atlas');
await GLYPH.runTrigger(behaviorUuid, 'manual');
```

---

## Requirements

Requires **[3DS:ATLAS](https://github.com/Sayshal/3ds-atlas)**, the shared settings, theming, and troubleshooting layer for 3 Death Saves modules. Glyph's UI follows whatever theme you've set there.

---

## Installation

Find **Glyph** in Foundry's Module Browser, or paste this manifest URL:

```
https://github.com/Sayshal/glyph/releases/latest/download/module.json
```

Questions? Ideas? Join us on [Discord](https://discord.gg/PzzUwU9gdz) or check the [Wiki](https://wiki.3deathsaves.com/glyph/).

---

## License

MIT - see [LICENSE](LICENSE).
