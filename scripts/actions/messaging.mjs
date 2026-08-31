import { sendToAudience } from '../audience.mjs';
import { runTrigger } from '../manual-trigger.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../render-intent.mjs';
import { interpolate } from '../run-context.mjs';
import { resolveReference } from '../targeting.mjs';

/** @type {string} Shared hint for a text field that interpolates `{{path}}` placeholders. */
const INTERPOLATED_TEXT_HINT = 'GLYPH.ACTIONS.FIELDS.interpolatedText.hint';

/** @type {object} The shared "who sees this" field, added to every player-facing render action. */
export const AUDIENCE_FIELD = {
  name: 'audience',
  widget: 'select',
  label: 'GLYPH.ACTIONS.FIELDS.audience.label',
  hint: 'GLYPH.ACTIONS.FIELDS.audience.hint',
  choices: { triggeringUser: 'GLYPH.AUDIENCE.triggeringUser', everyone: 'GLYPH.AUDIENCE.everyone', players: 'GLYPH.AUDIENCE.players', gm: 'GLYPH.AUDIENCE.gm' }
};

registerRenderIntent('showImage', ({ src, caption }) => {
  new foundry.applications.apps.ImagePopout({ src, caption: caption ?? '' }).render({ force: true });
});

registerRenderIntent('openJournal', async ({ uuid, anchor }) => {
  const target = await fromUuid(uuid);
  if (target instanceof JournalEntryPage) target.parent.sheet.render({ force: true, pageId: target.id, anchor });
  else if (target instanceof JournalEntry) target.sheet.render({ force: true });
});

registerRenderIntent('openActorSheet', async ({ uuid }) => {
  const actor = await fromUuid(uuid);
  if (!actor) return;
  if (!actor.testUserPermission(game.user, 'LIMITED')) {
    ui.notifications.warn('GLYPH.NOTIFICATIONS.NoPermission', { format: { name: actor.name } });
    return;
  }
  actor.sheet.render({ force: true });
});

registerNodeType('chatMessage', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.chatMessage.label',
  hint: 'GLYPH.ACTIONS.chatMessage.hint',
  fields: [
    { name: 'text', widget: 'textarea', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    { name: 'rollMode', widget: 'rollMode', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.rollMode.label' }
  ],
  validate(node) {
    if (typeof node.text !== 'string' || !node.text) throw new Error('chatMessage.text must be a non-empty string.');
  },
  async execute(node, context) {
    const token = context.info.event.data?.token?.object ?? null;
    const chatData = { content: interpolate(node.text, context), speaker: token ? ChatMessage.getSpeaker({ token }) : ChatMessage.getSpeaker() };
    ChatMessage.applyMode(chatData, node.rollMode);
    await ChatMessage.create(chatData);
  }
});

registerRenderIntent('notification', ({ text, level }) => ui.notifications[level ?? 'info'](text));

registerNodeType('notification', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.notification.label',
  hint: 'GLYPH.ACTIONS.notification.hint',
  fields: [
    { name: 'text', widget: 'text', label: 'GLYPH.ACTIONS.notification.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    {
      name: 'level',
      widget: 'select',
      label: 'GLYPH.ACTIONS.notification.FIELDS.level.label',
      choices: { info: 'GLYPH.NOTIFICATION_LEVEL.info', warn: 'GLYPH.NOTIFICATION_LEVEL.warn', error: 'GLYPH.NOTIFICATION_LEVEL.error' }
    },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.text !== 'string' || !node.text) throw new Error('notification.text must be a non-empty string.');
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'notification', { text: interpolate(node.text, context), level: node.level });
  }
});

registerNodeType('showImage', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.showImage.label',
  hint: 'GLYPH.ACTIONS.showImage.hint',
  fields: [
    { name: 'src', widget: 'file', filePickerType: 'image', label: 'GLYPH.ACTIONS.showImage.FIELDS.src.label', required: true },
    { name: 'caption', widget: 'text', label: 'GLYPH.ACTIONS.showImage.FIELDS.caption.label', hint: INTERPOLATED_TEXT_HINT },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.src !== 'string' || !node.src) throw new Error('showImage.src must be a non-empty string.');
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'showImage', { src: node.src, caption: interpolate(node.caption ?? '', context) });
  }
});

/** @type {Record<string, number>} Shared anchor/direction choices for scrollingText, matching `CONST.TEXT_ANCHOR_POINTS`. */
const TEXT_ANCHOR_CHOICES = { center: 'GLYPH.TEXT_ANCHOR.center', bottom: 'GLYPH.TEXT_ANCHOR.bottom', top: 'GLYPH.TEXT_ANCHOR.top', left: 'GLYPH.TEXT_ANCHOR.left', right: 'GLYPH.TEXT_ANCHOR.right' };

registerRenderIntent('scrollingText', ({ origin, text, fill, duration, anchor, direction }) => {
  if (!origin) return;
  return canvas.interface.createScrollingText(origin, text, { fill: fill || undefined, duration, anchor, direction });
});

registerNodeType('scrollingText', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.scrollingText.label',
  hint: 'GLYPH.ACTIONS.scrollingText.hint',
  fields: [
    { name: 'target', widget: 'reference', label: 'GLYPH.ACTIONS.scrollingText.FIELDS.target.label', required: true },
    { name: 'text', widget: 'text', label: 'GLYPH.ACTIONS.scrollingText.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    { name: 'color', widget: 'text', label: 'GLYPH.ACTIONS.scrollingText.FIELDS.color.label', hint: 'GLYPH.ACTIONS.scrollingText.FIELDS.color.hint' },
    { name: 'duration', widget: 'number', min: 0, step: 100, label: 'GLYPH.ACTIONS.scrollingText.FIELDS.duration.label', hint: 'GLYPH.ACTIONS.scrollingText.FIELDS.duration.hint' },
    { name: 'anchor', widget: 'select', label: 'GLYPH.ACTIONS.scrollingText.FIELDS.anchor.label', choices: TEXT_ANCHOR_CHOICES },
    { name: 'direction', widget: 'select', label: 'GLYPH.ACTIONS.scrollingText.FIELDS.direction.label', choices: TEXT_ANCHOR_CHOICES },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.target !== 'object') throw new Error('scrollingText.target must be a reference object.');
    if (typeof node.text !== 'string' || !node.text) throw new Error('scrollingText.text must be a non-empty string.');
  },
  async execute(node, context) {
    const target = resolveReference(node.target, context);
    const origin = typeof target?.getCenterPoint === 'function' ? target.getCenterPoint() : (target?.object?.center ?? target);
    if (!origin) return;
    await sendToAudience(node.audience, context, 'scrollingText', {
      origin,
      text: interpolate(node.text, context),
      fill: node.color,
      duration: node.duration || undefined,
      anchor: node.anchor ? CONST.TEXT_ANCHOR_POINTS[node.anchor.toUpperCase()] : undefined,
      direction: node.direction ? CONST.TEXT_ANCHOR_POINTS[node.direction.toUpperCase()] : undefined
    });
  }
});

registerRenderIntent('openURL', ({ url }) => window.open(url, '_blank', 'noopener'));

registerNodeType('openURL', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.openURL.label',
  hint: 'GLYPH.ACTIONS.openURL.hint',
  fields: [{ name: 'url', widget: 'text', label: 'GLYPH.ACTIONS.openURL.FIELDS.url.label', required: true }, AUDIENCE_FIELD],
  validate(node) {
    if (typeof node.url !== 'string' || !node.url) throw new Error('openURL.url must be a non-empty string.');
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'openURL', { url: node.url });
  }
});

registerNodeType('openJournal', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.openJournal.label',
  hint: 'GLYPH.ACTIONS.openJournal.hint',
  fields: [
    { name: 'uuid', widget: 'uuid', documentType: 'JournalEntry', label: 'GLYPH.ACTIONS.openJournal.FIELDS.uuid.label', required: true },
    { name: 'anchor', widget: 'text', label: 'GLYPH.ACTIONS.openJournal.FIELDS.anchor.label' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.uuid !== 'string' || !node.uuid) throw new Error('openJournal.uuid must be a non-empty string.');
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'openJournal', { uuid: node.uuid, anchor: node.anchor });
  }
});

registerNodeType('openActorSheet', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.openActorSheet.label',
  hint: 'GLYPH.ACTIONS.openActorSheet.hint',
  fields: [{ name: 'actor', widget: 'reference', label: 'GLYPH.ACTIONS.openActorSheet.FIELDS.actor.label', required: true }, AUDIENCE_FIELD],
  validate(node) {
    if (typeof node.actor !== 'object') throw new Error('openActorSheet.actor must be a reference object.');
  },
  async execute(node, context) {
    const actor = resolveReference(node.actor, context);
    if (!actor) return;
    await sendToAudience(node.audience, context, 'openActorSheet', { uuid: actor.uuid });
  }
});

/** @type {Map<string, InstanceType<typeof foundry.applications.api.DialogV2>>} Open showDialog instances, keyed by the triggering behavior's UUID, so closeDialog can find one to close. */
const openDialogs = new Map();

registerRenderIntent('showDialog', ({ title, content, buttons, behaviorUuid }) => {
  openDialogs.get(behaviorUuid)?.close();
  const dialog = new foundry.applications.api.DialogV2({
    window: { title },
    content: `<p>${content}</p>`,
    buttons: (buttons?.length ? buttons : [{ label: _loc('COMMON.Confirm') }]).map((button, i) => ({
      action: `button${i}`,
      label: button.label,
      callback: () => (button.handler ? runTrigger(behaviorUuid, button.handler) : undefined)
    }))
  });
  openDialogs.set(behaviorUuid, dialog);
  dialog.render({ force: true });
});

registerRenderIntent('closeDialog', ({ behaviorUuid }) => {
  openDialogs.get(behaviorUuid)?.close();
  openDialogs.delete(behaviorUuid);
});

registerNodeType('showDialog', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.showDialog.label',
  hint: 'GLYPH.ACTIONS.showDialog.hint',
  fields: [
    { name: 'title', widget: 'text', label: 'GLYPH.ACTIONS.showDialog.FIELDS.title.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    { name: 'content', widget: 'textarea', label: 'GLYPH.ACTIONS.showDialog.FIELDS.content.label', hint: INTERPOLATED_TEXT_HINT },
    { name: 'buttons', widget: 'json', label: 'GLYPH.ACTIONS.showDialog.FIELDS.buttons.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.buttons.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (typeof node.title !== 'string' || !node.title) throw new Error('showDialog.title must be a non-empty string.');
    if (node.buttons !== undefined && node.buttons !== '' && !Array.isArray(node.buttons)) {
      throw new Error('showDialog.buttons must be an array of {label, handler} objects.');
    }
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'showDialog', {
      title: interpolate(node.title, context),
      content: interpolate(node.content ?? '', context),
      buttons: node.buttons || [],
      behaviorUuid: context.info.behavior.uuid
    });
  }
});

registerNodeType('closeDialog', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.closeDialog.label',
  hint: 'GLYPH.ACTIONS.closeDialog.hint',
  fields: [AUDIENCE_FIELD],
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'closeDialog', { behaviorUuid: context.info.behavior.uuid });
  }
});

registerNodeType('writeToJournal', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.writeToJournal.label',
  hint: 'GLYPH.ACTIONS.writeToJournal.hint',
  fields: [
    { name: 'pageUuid', widget: 'uuid', documentType: 'JournalEntryPage', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.pageUuid.label', required: true },
    { name: 'text', widget: 'textarea', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.mode.label',
      choices: { append: 'GLYPH.JOURNAL_MODE.append', prepend: 'GLYPH.JOURNAL_MODE.prepend', overwrite: 'GLYPH.JOURNAL_MODE.overwrite', insert: 'GLYPH.JOURNAL_MODE.insert' }
    },
    { name: 'index', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.index.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.index.hint' }
  ],
  validate(node) {
    if (typeof node.pageUuid !== 'string' || typeof node.text !== 'string') {
      throw new Error('writeToJournal.pageUuid and .text must be strings.');
    }
  },
  async execute(node, context) {
    const page = await fromUuid(node.pageUuid);
    if (!(page instanceof JournalEntryPage)) return;
    const text = interpolate(node.text, context);
    const mode = node.mode ?? 'append';
    const existing = page.text.content ?? '';
    const content =
      mode === 'overwrite'
        ? text
        : mode === 'prepend'
          ? `${text}${existing}`
          : mode === 'insert'
            ? `${existing.slice(0, node.index ?? 0)}${text}${existing.slice(node.index ?? 0)}`
            : `${existing}${text}`;
    await page.update({ 'text.content': content });
  }
});
