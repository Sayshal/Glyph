import { resolveAudience, sendToAudience } from '../audience.mjs';
import { batchCreate, batchUpdate } from '../batch.mjs';
import { runTrigger } from '../manual-trigger.mjs';
import { registerNodeType } from '../nodes/registry.mjs';
import { registerRenderIntent } from '../queries.mjs';
import { interpolate } from '../run-context.mjs';
import { resolveReference } from '../targeting.mjs';

/** @type {string} Shared hint for a text field that interpolates `{{path}}` placeholders. */
export const INTERPOLATED_TEXT_HINT = 'GLYPH.ACTIONS.FIELDS.interpolatedText.hint';

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
  else if (target instanceof JournalEntry) {
    if (!anchor) return target.sheet.render({ force: true });
    const [pageId, slug] = anchor.split('#');
    target.sheet.render({ force: true, pageId, anchor: slug });
  }
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

/** @type {object} A chat message's whisper audience. */
const CHAT_AUDIENCE_FIELD = {
  name: 'audience',
  widget: 'select',
  label: 'GLYPH.ACTIONS.FIELDS.audience.label',
  hint: 'GLYPH.ACTIONS.chatMessage.FIELDS.audience.hint',
  choices: { everyone: 'GLYPH.AUDIENCE.everyone', players: 'GLYPH.AUDIENCE.players', gm: 'GLYPH.AUDIENCE.gm', triggeringUser: 'GLYPH.AUDIENCE.triggeringUser' }
};

/** @type {object} Chat bubble display choices. */
const CHAT_BUBBLE_CHOICES = {
  message: 'GLYPH.CHAT_BUBBLE.message',
  messageAndBubble: 'GLYPH.CHAT_BUBBLE.messageAndBubble',
  bubbleOnly: 'GLYPH.CHAT_BUBBLE.bubbleOnly'
};

registerRenderIntent('chatBubble', ({ sceneId, tokenId, content }) => {
  if (canvas.scene?.id !== sceneId) return;
  const token = canvas.tokens.get(tokenId);
  if (token) canvas.hud.bubbles.say(token, content);
});

/**
 * Build a `chatMessage` node's `ChatMessage.create()` data, before `applyMode` is applied.
 * @param {object} node The `chatMessage` node.
 * @param {object} context The active run context.
 * @returns {object} The chat message data.
 */
function chatMessageData(node, context) {
  const token = context.info.event.data?.token?.object ?? null;
  const speakerRef = node.speaker ? resolveReference(node.speaker, context) : null;
  const speaker =
    speakerRef instanceof Actor
      ? ChatMessage.getSpeaker({ actor: speakerRef })
      : speakerRef
        ? ChatMessage.getSpeaker({ token: speakerRef })
        : token
          ? ChatMessage.getSpeaker({ token })
          : ChatMessage.getSpeaker();
  return {
    content: interpolate(node.text, context),
    flavor: node.flavor ? interpolate(node.flavor, context) : undefined,
    style: node.inCharacter ? CONST.CHAT_MESSAGE_STYLES.IC : CONST.CHAT_MESSAGE_STYLES.OOC,
    speaker,
    author: context.info.event.user?.id,
    flags: node.language ? { polyglot: { language: node.language } } : undefined
  };
}

/** Apply a message's roll mode, then narrow it to its audience. */
function applyChatVisibility(chatData, node, context) {
  ChatMessage.applyMode(chatData, node.rollMode);
  if (node.audience && node.audience !== 'everyone') chatData.whisper = resolveAudience(node.audience, context).map((user) => user.id);
}

/** Whether text is a chat command rather than message content. */
function isChatCommand(content) {
  return content.startsWith('/') || content.startsWith('[[/');
}

/** Show a chat bubble over the speaker token, for everyone in the message's audience. */
async function sayChatBubble(node, chatData, context) {
  if (!node.bubble || node.bubble === 'message' || !chatData.speaker?.token) return;
  await sendToAudience(node.audience ?? 'everyone', context, 'chatBubble', {
    sceneId: chatData.speaker.scene,
    tokenId: chatData.speaker.token,
    content: chatData.content
  });
}

registerNodeType('chatMessage', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.chatMessage.label',
  hint: 'GLYPH.ACTIONS.chatMessage.hint',
  fields: [
    { name: 'text', widget: 'textarea', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    { name: 'flavor', widget: 'text', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.flavor.label', hint: INTERPOLATED_TEXT_HINT },
    { name: 'speaker', widget: 'reference', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.speaker.label', hint: 'GLYPH.ACTIONS.chatMessage.FIELDS.speaker.hint' },
    { name: 'inCharacter', widget: 'boolean', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.inCharacter.label' },
    { name: 'bubble', widget: 'select', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.bubble.label', hint: 'GLYPH.ACTIONS.chatMessage.FIELDS.bubble.hint', choices: CHAT_BUBBLE_CHOICES },
    CHAT_AUDIENCE_FIELD,
    { name: 'rollMode', widget: 'rollMode', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.rollMode.label' },
    { name: 'language', widget: 'language', label: 'GLYPH.ACTIONS.chatMessage.FIELDS.language.label', hint: 'GLYPH.ACTIONS.chatMessage.FIELDS.language.hint' }
  ],
  validate(node) {
    if (typeof node.text !== 'string' || !node.text) throw new Error('chatMessage.text must be a non-empty string.');
  },
  async execute(node, context) {
    const chatData = chatMessageData(node, context);
    if (isChatCommand(chatData.content)) return void (await ui.chat.processMessage(chatData.content, { speaker: chatData.speaker }));
    applyChatVisibility(chatData, node, context);
    await sayChatBubble(node, chatData, context);
    if (node.bubble !== 'bubbleOnly') await ChatMessage.create(chatData);
  },
  async batchExecute(pairs) {
    const entries = [];
    for (const { node, context } of pairs) {
      const chatData = chatMessageData(node, context);
      if (isChatCommand(chatData.content)) {
        await ui.chat.processMessage(chatData.content, { speaker: chatData.speaker });
        continue;
      }
      applyChatVisibility(chatData, node, context);
      await sayChatBubble(node, chatData, context);
      if (node.bubble !== 'bubbleOnly') entries.push({ parent: null, documentName: 'ChatMessage', data: chatData });
    }
    await batchCreate(entries);
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
    { name: 'uuid', widget: 'uuid', documentType: 'JournalEntry', label: 'GLYPH.ACTIONS.openJournal.FIELDS.uuid.label', required: true, hint: 'GLYPH.ACTIONS.openJournal.FIELDS.uuid.hint' },
    { name: 'anchor', widget: 'journalAnchor', label: 'GLYPH.ACTIONS.openJournal.FIELDS.anchor.label', hint: 'GLYPH.ACTIONS.openJournal.FIELDS.anchor.hint' },
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

/** @type {string} Action id of the hidden button standing in for a dialog whose content carries its own controls. */
const NO_BUTTON = 'glyphNoButton';

/**
 * Render a dialog's HTML file, giving Handlebars the same paths `{{...}}` interpolation resolves.
 * @param {string} path Path to the HTML file.
 * @param {object} context The active run context.
 * @returns {Promise<string>} The rendered markup.
 */
function renderContentFile(path, context) {
  return foundry.applications.handlebars.renderTemplate(path, { ...context.info, ...context.info.event?.data, ...context });
}

/**
 * Read a dialog's form fields, so a button handler and a content-authored `goto` both see what was filled in.
 * @param {InstanceType<typeof foundry.applications.api.DialogV2>} dialog The open dialog.
 * @returns {object} The form's expanded field values.
 */
function dialogFormData(dialog) {
  const form = dialog.element?.querySelector('form');
  return form ? new foundry.applications.ux.FormDataExtended(form).object : {};
}

registerRenderIntent('showDialog', ({ title, content, buttons, closeHandler, width, height, behaviorUuid }) => {
  openDialogs.get(behaviorUuid)?.close();
  let submitted = false;
  const body = document.createElement('div');
  body.innerHTML = content?.includes('<') ? content : `<p>${content ?? ''}</p>`;
  const dialog = new foundry.applications.api.DialogV2({
    window: { title },
    position: { width: width || 'auto', height: height || 'auto' },
    content: body,
    buttons: Array.isArray(buttons)
      ? buttons.length
        ? buttons.map((button, i) => ({
            action: `button${i}`,
            label: button.label,
            callback: (_event, _target, dlg) => (button.handler ? runTrigger(behaviorUuid, button.handler, dialogFormData(dlg)) : undefined)
          }))
        : [{ action: NO_BUTTON, label: '', style: { display: 'none' } }]
      : [{ action: 'button0', label: _loc('COMMON.Confirm') }],
    submit: (result, dlg) => {
      submitted = true;
      if (result !== undefined && result !== NO_BUTTON) return;
      const data = dialogFormData(dlg);
      if (data.goto) runTrigger(behaviorUuid, String(data.goto), data);
    }
  });
  dialog.addEventListener(
    'close',
    () => {
      if (!submitted && closeHandler) runTrigger(behaviorUuid, closeHandler);
    },
    { once: true }
  );
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
    { name: 'title', widget: 'text', label: 'GLYPH.ACTIONS.showDialog.FIELDS.title.label', hint: INTERPOLATED_TEXT_HINT },
    { name: 'content', widget: 'textarea', label: 'GLYPH.ACTIONS.showDialog.FIELDS.content.label', hint: INTERPOLATED_TEXT_HINT },
    { name: 'contentFile', widget: 'file', filePickerType: 'html', label: 'GLYPH.ACTIONS.showDialog.FIELDS.contentFile.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.contentFile.hint' },
    { name: 'buttons', widget: 'json', label: 'GLYPH.ACTIONS.showDialog.FIELDS.buttons.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.buttons.hint' },
    { name: 'closeHandler', widget: 'handlerRef', label: 'GLYPH.ACTIONS.showDialog.FIELDS.closeHandler.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.closeHandler.hint' },
    { name: 'width', widget: 'number', label: 'GLYPH.ACTIONS.showDialog.FIELDS.width.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.width.hint' },
    { name: 'height', widget: 'number', label: 'GLYPH.ACTIONS.showDialog.FIELDS.height.label', hint: 'GLYPH.ACTIONS.showDialog.FIELDS.height.hint' },
    AUDIENCE_FIELD
  ],
  validate(node) {
    if (node.title !== undefined && typeof node.title !== 'string') throw new Error('showDialog.title must be a string.');
    if (node.buttons !== undefined && node.buttons !== '' && !Array.isArray(node.buttons)) {
      throw new Error('showDialog.buttons must be an array of {label, handler} objects.');
    }
  },
  async execute(node, context) {
    await sendToAudience(node.audience, context, 'showDialog', {
      title: interpolate(node.title ?? '', context),
      content: node.contentFile ? await renderContentFile(node.contentFile, context) : interpolate(node.content ?? '', context),
      buttons: node.buttons || undefined,
      closeHandler: node.closeHandler || undefined,
      width: node.width || undefined,
      height: node.height || undefined,
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

/**
 * Apply a `writeToJournal` node's edit mode against a journal page's existing content.
 * @param {string} mode "append"/"prepend"/"overwrite"/"insert".
 * @param {string} existing The page's current content.
 * @param {string} text The interpolated text to write.
 * @param {number} [index] The insertion index, for "insert".
 * @param {number} [replaceCount] Characters the insertion overwrites, for "insert".
 * @returns {string} The new content.
 */
function journalContent(mode, existing, text, index, replaceCount) {
  if (mode === 'overwrite') return text;
  if (mode === 'prepend') return `${text}${existing}`;
  if (mode === 'insert') return `${existing.slice(0, index ?? 0)}${text}${existing.slice((index ?? 0) + (replaceCount ?? 0))}`;
  return `${existing}${text}`;
}

/**
 * Wrap text in Polyglot's journal markup.
 * @param {string} text The text to wrap.
 * @param {string} [language] The Polyglot language id.
 * @returns {string} The wrapped text.
 */
function polyglotText(text, language) {
  if (!language || !game.modules.get('polyglot')?.active) return text;
  const id = language.includes(':') ? language.split(':')[1] : language;
  if (!id) return text;
  return `<span class="polyglot-journal" title="${game.polyglot?.languages?.[id]?.label ?? id}" data-language="${id}">${text}</span>`;
}

/**
 * Resolve a `writeToJournal` target to its page, creating it when asked.
 * @param {object} node The `writeToJournal` node.
 * @param {RunContext} context The active run context.
 * @returns {Promise<JournalEntryPage|null>} The page, or null.
 */
async function journalPage(node, context) {
  const doc = await fromUuid(node.pageUuid);
  if (doc instanceof JournalEntryPage) return doc;
  const entry = doc instanceof JournalEntry ? doc : await missingPageEntry(node.pageUuid);
  if (!entry) return null;
  if (!node.createPage) return entry.pages.contents[0] ?? null;
  const name = interpolate(node.pageName, context) || entry.name;
  const [created] = await JournalEntryPage.createDocuments([{ type: 'text', name }], { parent: entry });
  return created ?? null;
}

/**
 * The final text a `writeToJournal` node writes: interpolated, Polyglot-wrapped, then broken.
 * @param {object} node The `writeToJournal` node.
 * @param {RunContext} context The active run context.
 * @returns {string} The text to write.
 */
function journalText(node, context) {
  const text = polyglotText(interpolate(node.text, context), node.language);
  return node.line ? `${text}</br>` : text;
}

/**
 * The JournalEntry behind a page uuid that no longer resolves.
 * @param {string} uuid The unresolved page uuid.
 * @returns {Promise<JournalEntry|null>} The parent entry, or null.
 */
async function missingPageEntry(uuid) {
  const entryUuid = String(uuid ?? '').split('.JournalEntryPage.')[0];
  if (entryUuid === uuid) return null;
  const entry = await fromUuid(entryUuid);
  return entry instanceof JournalEntry ? entry : null;
}

registerNodeType('writeToJournal', {
  category: 'messaging',
  label: 'GLYPH.ACTIONS.writeToJournal.label',
  hint: 'GLYPH.ACTIONS.writeToJournal.hint',
  fields: [
    {
      name: 'pageUuid',
      widget: 'uuid',
      label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.pageUuid.label',
      hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.pageUuid.hint',
      required: true
    },
    { name: 'text', widget: 'textarea', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.text.label', hint: INTERPOLATED_TEXT_HINT, required: true },
    {
      name: 'mode',
      widget: 'select',
      label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.mode.label',
      choices: { append: 'GLYPH.JOURNAL_MODE.append', prepend: 'GLYPH.JOURNAL_MODE.prepend', overwrite: 'GLYPH.JOURNAL_MODE.overwrite', insert: 'GLYPH.JOURNAL_MODE.insert' }
    },
    { name: 'index', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.index.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.index.hint' },
    { name: 'replaceCount', widget: 'number', min: 0, label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.replaceCount.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.replaceCount.hint' },
    { name: 'line', widget: 'boolean', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.line.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.line.hint' },
    { name: 'createPage', widget: 'boolean', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.createPage.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.createPage.hint' },
    { name: 'pageName', widget: 'text', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.pageName.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.pageName.hint' },
    { name: 'language', widget: 'language', label: 'GLYPH.ACTIONS.writeToJournal.FIELDS.language.label', hint: 'GLYPH.ACTIONS.writeToJournal.FIELDS.language.hint' }
  ],
  validate(node) {
    if (typeof node.pageUuid !== 'string' || typeof node.text !== 'string') {
      throw new Error('writeToJournal.pageUuid and .text must be strings.');
    }
  },
  async execute(node, context) {
    const page = await journalPage(node, context);
    if (!page) return;
    const content = journalContent(node.mode ?? 'append', page.text.content ?? '', journalText(node, context), node.index, node.replaceCount);
    await page.update({ 'text.content': content });
  },
  async batchExecute(pairs) {
    const resolved = await Promise.all(pairs.map(async ({ node, context }) => ({ node, context, page: await journalPage(node, context) })));
    const groups = new Map();
    for (const { node, context, page } of resolved) {
      if (!page) continue;
      if (!groups.has(page)) groups.set(page, []);
      groups.get(page).push({ node, context });
    }
    await batchUpdate(
      [...groups.entries()].map(([page, items]) => {
        let content = page.text.content ?? '';
        for (const { node, context } of items) {
          content = journalContent(node.mode ?? 'append', content, journalText(node, context), node.index, node.replaceCount);
        }
        return { doc: page, changes: { 'text.content': content } };
      })
    );
  }
});
