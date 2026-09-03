import { ACTOR, TOKEN, buildTriggerSystem, seq } from './trigger-system.mjs';

const TILE_REF = { kind: 'uuid', value: 'Scene.PLACEHOLDER.Tile.PLACEHOLDER' };

/**
 * Build one shipped example's full `system` blob, matching `TriggerRegionBehaviorType`'s schema exactly.
 * @param {object} config
 * @param {string} config.id Stable key, prefixed `example:` when listed/applied.
 * @param {string} config.name Display name shown in the template picker.
 * @param {string} config.category Category slug.
 * @param {string} config.handlerEvent The event/pseudo-event/"manual" key the program runs under.
 * @param {string[]} [config.events] Core region event names this behavior subscribes to.
 * @param {string[]} [config.pseudoEvents] Pseudo-event names this behavior subscribes to.
 * @param {object} config.body A sequence node (or a single action node) to run.
 * @returns {{id: string, name: string, category: string, system: object}}
 */
function example({ id, name, category, handlerEvent, events, pseudoEvents, body }) {
  return { id, name, category, system: buildTriggerSystem({ events, pseudoEvents, handlers: { [handlerEvent]: body } }) };
}

/** @type {{id: string, name: string, category: string, system: object}[]} Every shipped example. */
export const EXAMPLE_TRIGGERS = [
  example({
    id: 'playSound',
    name: 'Play a Sound on Enter',
    category: 'audio',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'playSound', path: 'sounds/example.ogg', loop: false, volume: 0.8, channel: 'environment' }
  }),
  example({
    id: 'stopSound',
    name: 'Stop a Sound on Exit',
    category: 'audio',
    handlerEvent: 'tokenExit',
    events: ['tokenExit'],
    body: { type: 'stopSound', reference: { kind: 'uuid', value: 'Playlist.PLACEHOLDER.PlaylistSound.PLACEHOLDER' } }
  }),
  example({
    id: 'playPlaylist',
    name: 'Start a Playlist on Enter',
    category: 'audio',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'playPlaylist', name: 'PLACEHOLDER Playlist Name' }
  }),

  example({
    id: 'chatMessage',
    name: 'Announce a Door Opening',
    category: 'messaging',
    handlerEvent: 'doorOpened',
    pseudoEvents: ['doorOpened'],
    body: { type: 'chatMessage', text: 'A door in {{region.name}} creaks open.' }
  }),
  example({
    id: 'notification',
    name: 'Notify on Hover',
    category: 'messaging',
    handlerEvent: 'hoverIn',
    pseudoEvents: ['hoverIn'],
    body: { type: 'notification', text: 'You notice something here.', level: 'info', audience: 'triggeringUser' }
  }),
  example({
    id: 'showImage',
    name: 'Show Image on Darkness Change',
    category: 'messaging',
    handlerEvent: 'darknessChanged',
    pseudoEvents: ['darknessChanged'],
    body: { type: 'showImage', src: 'PLACEHOLDER.webp', caption: 'The shadows shift.', audience: 'everyone' }
  }),
  example({
    id: 'openJournal',
    name: 'Open a Journal on Enter',
    category: 'messaging',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'openJournal', uuid: 'JournalEntry.PLACEHOLDER', audience: 'triggeringUser' }
  }),
  example({
    id: 'openActorSheet',
    name: "Open the Entering Token's Sheet",
    category: 'messaging',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'openActorSheet', actor: ACTOR, audience: 'triggeringUser' }
  }),
  example({
    id: 'showDialog',
    name: 'Ask a Yes/No Question on Enter',
    category: 'messaging',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: {
      type: 'showDialog',
      title: 'Continue?',
      content: 'Do you want to proceed?',
      buttons: [{ label: 'Yes', handler: 'manual' }, { label: 'No' }],
      audience: 'triggeringUser'
    }
  }),
  example({
    id: 'closeDialog',
    name: 'Close the Dialog on Exit',
    category: 'messaging',
    handlerEvent: 'tokenExit',
    events: ['tokenExit'],
    body: { type: 'closeDialog', audience: 'triggeringUser' }
  }),
  example({
    id: 'writeToJournal',
    name: 'Log Entry to a Journal Page',
    category: 'messaging',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: {
      type: 'writeToJournal',
      pageUuid: 'JournalEntry.PLACEHOLDER.JournalEntryPage.PLACEHOLDER',
      text: '<p>{{event.user.name}} entered {{region.name}}.</p>',
      mode: 'append'
    }
  }),

  example({
    id: 'moveToken',
    name: 'Nudge the Entering Token',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'moveToken', token: TOKEN, destination: { x: 0, y: 0 }, snap: true }
  }),
  example({
    id: 'rotateToken',
    name: 'Face the Entering Token North',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'rotateToken', token: TOKEN, rotation: 0, force: false }
  }),
  example({
    id: 'createToken',
    name: 'Spawn a Token on Enter',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'createToken', actorUuid: 'Actor.PLACEHOLDER', placement: 'random', snap: true }
  }),
  example({
    id: 'alter',
    name: "Rename the Entering Token's Actor",
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'alter', target: ACTOR, path: 'name', value: 'Marked' }
  }),
  example({
    id: 'addItem',
    name: 'Grant an Item on Enter',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'addItem', actor: ACTOR, itemUuid: 'Item.PLACEHOLDER' }
  }),
  example({
    id: 'removeItem',
    name: 'Take an Item on Exit',
    category: 'token',
    handlerEvent: 'tokenExit',
    events: ['tokenExit'],
    body: { type: 'removeItem', actor: ACTOR, itemName: 'PLACEHOLDER Item Name' }
  }),
  example({
    id: 'toggleCondition',
    name: 'Apply Prone on Enter',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'toggleCondition', actor: ACTOR, statusId: 'prone', active: true }
  }),
  example({
    id: 'rollTable',
    name: 'Draw a Roll Table on Enter',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'rollTable', tableUuid: 'RollTable.PLACEHOLDER', displayChat: true, resultVariable: 'drawResult' }
  }),
  example({
    id: 'targetTokens',
    name: 'Target the Entering Token',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'targetTokens', token: TOKEN, targeted: true, releaseOthers: false }
  }),
  example({
    id: 'dnd5eAttack',
    name: 'Trigger a dnd5e Attack on Enter',
    category: 'token',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'dnd5eAttack', actor: { kind: 'uuid', value: 'Actor.PLACEHOLDER' }, itemId: 'PLACEHOLDER' }
  }),

  example({
    id: 'setVariable',
    name: 'Save a Custom Value',
    category: 'variables',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'setVariable', name: 'doorState', value: 'unlocked' }
  }),

  example({
    id: 'alterTag',
    name: 'Tag the Entering Token (Tagger)',
    category: 'tagger',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'alterTag', entity: TOKEN, tag: 'marked', state: 'add' }
  }),
  example({
    id: 'weatherEffect',
    name: 'Start Rain on Enter (FXMaster)',
    category: 'fxmaster',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'weatherEffect', effect: 'rain', options: {} }
  }),
  example({
    id: 'clearWeatherEffects',
    name: 'Clear Weather on Exit (FXMaster)',
    category: 'fxmaster',
    handlerEvent: 'tokenExit',
    events: ['tokenExit'],
    body: { type: 'clearWeatherEffects' }
  }),

  example({
    id: 'changeScene',
    name: 'View Another Scene on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'changeScene', sceneUuid: 'Scene.PLACEHOLDER', activate: false }
  }),
  example({
    id: 'changeSceneBackground',
    name: 'Swap the Background on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'changeSceneBackground', sceneUuid: 'Scene.PLACEHOLDER', src: 'PLACEHOLDER.webp' }
  }),
  example({
    id: 'pingLocation',
    name: 'Ping World Time Advancing',
    category: 'scene',
    handlerEvent: 'worldTimeChanged',
    pseudoEvents: ['worldTimeChanged'],
    body: { type: 'pingLocation', location: { x: 0, y: 0 }, style: 'pulse' }
  }),
  example({
    id: 'resetFog',
    name: 'Reset Fog on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'resetFog' }
  }),
  example({
    id: 'addToCombat',
    name: 'Add the Entering Token to Combat',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'addToCombat', token: TOKEN, start: false }
  }),
  example({
    id: 'changePermissions',
    name: 'Grant Observer Permission on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'changePermissions', target: ACTOR, level: 'observer' }
  }),
  example({
    id: 'setGameTime',
    name: 'Advance Time on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'setGameTime', seconds: 3600 }
  }),
  example({
    id: 'changeGlobalVolume',
    name: 'Duck Ambient Volume on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'changeGlobalVolume', bus: 'globalAmbientVolume', volume: 0.3 }
  }),
  example({
    id: 'preloadScene',
    name: 'Preload the Next Scene on Enter',
    category: 'scene',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'preloadScene', sceneUuid: 'Scene.PLACEHOLDER' }
  }),

  example({
    id: 'changeTileImage',
    name: 'Swap a Tile Image with a Fade',
    category: 'tile',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'changeTileImage', tile: TILE_REF, select: 'direct', src: 'PLACEHOLDER.webp', transition: 'fade', duration: 500 }
  }),
  example({
    id: 'tileVideo',
    name: 'Play a Tile Video on Enter',
    category: 'tile',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'tileVideo', tile: TILE_REF, state: 'play' }
  }),
  example({
    id: 'toggleTileVisibility',
    name: 'Reveal a Tile on Enter',
    category: 'tile',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'toggleTileVisibility', tile: TILE_REF, hidden: false }
  }),
  example({
    id: 'setTileOcclusion',
    name: 'Set a Tile to Fade + Vision Occlusion',
    category: 'tile',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: { type: 'setTileOcclusion', tile: TILE_REF, modes: [1, 8] }
  }),

  example({
    id: 'ifElse',
    name: 'Coin Flip: If / Else',
    category: 'logic',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: {
      type: 'if',
      condition: 'chance(50)',
      then: [{ type: 'chatMessage', text: 'Heads!' }],
      else: [{ type: 'chatMessage', text: 'Tails!' }]
    }
  }),
  example({
    id: 'forEachWait',
    name: 'Announce Every Token, Then Wait',
    category: 'logic',
    handlerEvent: 'tokenEnter',
    events: ['tokenEnter'],
    body: seq(
      { type: 'forEach', collection: 'within', body: [{ type: 'notification', text: '{{item.name}} is in the region.', level: 'info', audience: 'everyone' }] },
      { type: 'wait', seconds: 1 },
      { type: 'chatMessage', text: 'Done announcing.' }
    )
  })
];
