import { MODULE } from '../constants.mjs';
import { ACTOR, TOKEN, buildTriggerSystem, seq } from './trigger-system.mjs';

const TILE_REF = { kind: 'uuid', value: 'Scene.PLACEHOLDER.Tile.PLACEHOLDER' };
const ITEM_ACTOR = { kind: 'context', value: 'item.actor' };

/**
 * Shipped recipes: named patterns that create every RegionBehavior they need on a Region in one step.
 * @type {{id: string, name: string, hint: string, category: string, behaviors: {type: string, system: object}[]}[]}
 */
export const RECIPES = [
  {
    id: 'teleporter',
    name: 'GLYPH.RECIPES.teleporter.name',
    hint: 'GLYPH.RECIPES.teleporter.hint',
    category: 'movement',
    behaviors: [
      { type: 'teleportToken', system: { destinations: ['Scene.PLACEHOLDER.Region.PLACEHOLDER'] } },
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq({ type: 'pingLocation', location: { x: 0, y: 0 }, style: 'chevron' }, { type: 'playSound', path: 'sounds/teleport.ogg', loop: false, volume: 0.8, channel: 'environment' })
          }
        })
      }
    ]
  },
  {
    id: 'stairway',
    name: 'GLYPH.RECIPES.stairway.name',
    hint: 'GLYPH.RECIPES.stairway.hint',
    category: 'movement',
    behaviors: [
      { type: 'changeLevel', system: {} },
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({ events: ['tokenEnter'], handlers: { tokenEnter: { type: 'playSound', path: 'sounds/footsteps-stairs.ogg', loop: false, volume: 0.6, channel: 'environment' } } })
      }
    ]
  },

  {
    id: 'lightSwitch',
    name: 'GLYPH.RECIPES.lightSwitch.name',
    hint: 'GLYPH.RECIPES.lightSwitch.hint',
    category: 'lighting',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter', 'tokenExit'],
          handlers: {
            tokenEnter: seq({ type: 'toggleTileVisibility', tile: TILE_REF, hidden: false }, { type: 'playSound', path: 'sounds/lever.ogg', loop: false, volume: 0.8, channel: 'environment' }),
            tokenExit: { type: 'toggleTileVisibility', tile: TILE_REF, hidden: true }
          }
        })
      }
    ]
  },
  {
    id: 'motionLight',
    name: 'GLYPH.RECIPES.motionLight.name',
    hint: 'GLYPH.RECIPES.motionLight.hint',
    category: 'lighting',
    behaviors: [
      { type: 'adjustDarknessLevel', system: { mode: 1, modifier: 0.5 } },
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({ events: ['tokenEnter'], handlers: { tokenEnter: { type: 'playSound', path: 'sounds/light-click.ogg', loop: false, volume: 0.5, channel: 'environment' } } })
      }
    ]
  },

  {
    id: 'trap',
    name: 'GLYPH.RECIPES.trap.name',
    hint: 'GLYPH.RECIPES.trap.hint',
    category: 'hazard',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq(
              { type: 'toggleCondition', actor: ACTOR, statusId: 'prone', active: true },
              { type: 'chatMessage', text: 'A trap springs on {{event.data.token.name}}!' },
              { type: 'playSound', path: 'sounds/trap.ogg', loop: false, volume: 0.8, channel: 'environment' }
            )
          }
        })
      }
    ]
  },
  {
    id: 'poisonTrap',
    name: 'GLYPH.RECIPES.poisonTrap.name',
    hint: 'GLYPH.RECIPES.poisonTrap.hint',
    category: 'hazard',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq(
              { type: 'toggleCondition', actor: ACTOR, statusId: 'poisoned', active: true },
              { type: 'chatMessage', text: 'A cloud of poison gas engulfs {{event.data.token.name}}!' },
              { type: 'playSound', path: 'sounds/gas-hiss.ogg', loop: false, volume: 0.7, channel: 'environment' }
            )
          }
        })
      }
    ]
  },
  {
    id: 'pressurePlate',
    name: 'GLYPH.RECIPES.pressurePlate.name',
    hint: 'GLYPH.RECIPES.pressurePlate.hint',
    category: 'hazard',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq(
              { type: 'forEach', collection: 'within', body: [{ type: 'toggleCondition', actor: ITEM_ACTOR, statusId: 'prone', active: true }] },
              { type: 'chatMessage', text: 'A pressure plate trips - everyone standing here stumbles!' },
              { type: 'playSound', path: 'sounds/click-trap.ogg', loop: false, volume: 0.7, channel: 'environment' }
            )
          }
        })
      }
    ]
  },
  {
    id: 'alarmTrap',
    name: 'GLYPH.RECIPES.alarmTrap.name',
    hint: 'GLYPH.RECIPES.alarmTrap.hint',
    category: 'hazard',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq(
              { type: 'pingLocation', location: { x: 0, y: 0 }, style: 'alert' },
              { type: 'notification', text: 'An alarm sounds!', level: 'warn', audience: 'everyone' },
              { type: 'playSound', path: 'sounds/alarm-bell.ogg', loop: false, volume: 0.9, channel: 'environment' }
            )
          }
        })
      }
    ]
  },
  {
    id: 'ambush',
    name: 'GLYPH.RECIPES.ambush.name',
    hint: 'GLYPH.RECIPES.ambush.hint',
    category: 'hazard',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: seq({ type: 'addToCombat', token: TOKEN, start: true }, { type: 'notification', text: 'An ambush begins!', level: 'warn', audience: 'everyone' })
          }
        })
      }
    ]
  },

  {
    id: 'restArea',
    name: 'GLYPH.RECIPES.restArea.name',
    hint: 'GLYPH.RECIPES.restArea.hint',
    category: 'utility',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: { tokenEnter: seq({ type: 'chatMessage', text: '{{event.data.token.name}} settles in to rest.' }, { type: 'setGameTime', seconds: 28800 }) }
        })
      }
    ]
  },
  {
    id: 'turnWarning',
    name: 'GLYPH.RECIPES.turnWarning.name',
    hint: 'GLYPH.RECIPES.turnWarning.hint',
    category: 'utility',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenTurnStart'],
          handlers: {
            tokenTurnStart: seq(
              { type: 'notification', text: 'Danger stirs nearby...', level: 'warn', audience: 'triggeringUser' },
              { type: 'playSound', path: 'sounds/tension-sting.ogg', loop: false, volume: 0.6, channel: 'environment' }
            )
          }
        })
      }
    ]
  },

  {
    id: 'merchantStall',
    name: 'GLYPH.RECIPES.merchantStall.name',
    hint: 'GLYPH.RECIPES.merchantStall.hint',
    category: 'social',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: {
              type: 'showDialog',
              title: 'A Merchant Approaches',
              content: 'Would you like to browse their wares?',
              buttons: [{ label: 'Browse', handler: 'manual' }, { label: 'Not Now' }],
              audience: 'triggeringUser'
            }
          }
        })
      }
    ]
  },

  {
    id: 'hiddenPassage',
    name: 'GLYPH.RECIPES.hiddenPassage.name',
    hint: 'GLYPH.RECIPES.hiddenPassage.hint',
    category: 'environment',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: { tokenEnter: seq({ type: 'toggleTileVisibility', tile: TILE_REF, hidden: false }, { type: 'resetFog' }, { type: 'pingLocation', location: { x: 0, y: 0 }, style: 'alert' }) }
        })
      }
    ]
  },
  {
    id: 'shelterFromStorm',
    name: 'GLYPH.RECIPES.shelterFromStorm.name',
    hint: 'GLYPH.RECIPES.shelterFromStorm.hint',
    category: 'fxmaster',
    behaviors: [
      { type: 'suppressWeather', system: {} },
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: { tokenEnter: seq({ type: 'clearWeatherEffects' }, { type: 'notification', text: 'The storm cannot reach you here.', level: 'info', audience: 'triggeringUser' }) }
        })
      }
    ]
  },
  {
    id: 'markedTarget',
    name: 'GLYPH.RECIPES.markedTarget.name',
    hint: 'GLYPH.RECIPES.markedTarget.hint',
    category: 'tagger',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: { tokenEnter: seq({ type: 'alterTag', entity: TOKEN, tag: 'marked', state: 'add' }, { type: 'chatMessage', text: '{{event.data.token.name}} has been marked.' }) }
        })
      }
    ]
  },

  {
    id: 'multiChoicePortal',
    name: 'GLYPH.RECIPES.multiChoicePortal.name',
    hint: 'GLYPH.RECIPES.multiChoicePortal.hint',
    category: 'movement',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: {
              type: 'showDialog',
              title: 'Choose a Path',
              content: 'Which way do you go?',
              buttons: [
                { label: 'Left Path', handler: 'goLeft' },
                { label: 'Right Path', handler: 'goRight' }
              ],
              audience: 'triggeringUser'
            },
            goLeft: seq({ type: 'pingLocation', location: { x: 0, y: 0 }, style: 'chevron' }, { type: 'chatMessage', text: '{{event.data.token.name}} heads left.' }),
            goRight: seq({ type: 'pingLocation', location: { x: 0, y: 0 }, style: 'chevron' }, { type: 'chatMessage', text: '{{event.data.token.name}} heads right.' })
          }
        })
      }
    ]
  },

  {
    id: 'bossFightMusic',
    name: 'GLYPH.RECIPES.bossFightMusic.name',
    hint: 'GLYPH.RECIPES.bossFightMusic.hint',
    category: 'social',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter', 'tokenTurnStart'],
          handlers: {
            tokenEnter: { type: 'setVariable', name: 'musicStarted', value: false },
            tokenTurnStart: {
              type: 'if',
              condition: '{{variables.musicStarted}} == true',
              then: [],
              else: [
                { type: 'setVariable', name: 'musicStarted', value: true },
                { type: 'playPlaylist', name: 'PLACEHOLDER Boss Playlist' }
              ]
            }
          }
        })
      }
    ]
  },

  {
    id: 'elevationToggle',
    name: 'GLYPH.RECIPES.elevationToggle.name',
    hint: 'GLYPH.RECIPES.elevationToggle.hint',
    category: 'mechanism',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: {
              type: 'if',
              condition: 'attribute({{event.data.token}}, "elevation") > 0',
              then: [{ type: 'alter', target: TOKEN, path: 'elevation', value: 0 }],
              else: [{ type: 'alter', target: TOKEN, path: 'elevation', value: 10 }]
            }
          }
        })
      }
    ]
  },
  {
    id: 'toggleSwitch',
    name: 'GLYPH.RECIPES.toggleSwitch.name',
    hint: 'GLYPH.RECIPES.toggleSwitch.hint',
    category: 'mechanism',
    behaviors: [
      {
        type: MODULE.BEHAVIOR_TYPE,
        system: buildTriggerSystem({
          events: ['tokenEnter'],
          handlers: {
            tokenEnter: {
              type: 'if',
              condition: '{{variables.state}} == true',
              then: [
                { type: 'setVariable', name: 'state', value: false },
                { type: 'toggleTileVisibility', tile: TILE_REF, hidden: true },
                { type: 'chatMessage', text: 'The switch clicks off.' }
              ],
              else: [
                { type: 'setVariable', name: 'state', value: true },
                { type: 'toggleTileVisibility', tile: TILE_REF, hidden: false },
                { type: 'chatMessage', text: 'The switch clicks on.' }
              ]
            }
          }
        })
      }
    ]
  }
];
