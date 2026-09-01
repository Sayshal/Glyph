export const MODULE = {
  ID: 'glyph',
  NAME: 'Glyph',
  TEMPLATES: 'modules/glyph/templates',
  ICON: 'fa-solid fa-bolt',
  BEHAVIOR_TYPE: 'glyph.trigger',
  HOOKS: { READY: 'glyph.ready', PRE_TRIGGER: 'glyph.preTriggerAction', TRIGGER: 'glyph.triggerAction' }
};
