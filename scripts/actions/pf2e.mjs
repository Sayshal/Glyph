import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerHurtHealAdapter, splitHealSign, toMessageMode } from '../hurt-heal-adapters.mjs';
import { registerSkillTestAdapter } from '../skill-test-adapters.mjs';

/** pf2e-only */
export function registerPf2eActions() {
  if (game.system.id !== 'pf2e') return;

  /** `CreaturePF2e#saves[slug]` -> `Statistic#roll`; pf2e has no attribute check, so only saves are offered */
  registerAbilityTestAdapter(
    'pf2e',
    async (actor, _type, ability, dc, prompt) => {
      const statistic = actor.saves?.[ability];
      if (actor.saves && !statistic) throw new Error(`Glyph: "${ability}" is not a pf2e save; pick Fortitude, Reflex or Will.`);
      const roll = await statistic?.roll({ dc, skipDialog: !prompt });
      return roll ? roll.degreeOfSuccess >= 2 : null;
    },
    { save: CONFIG.PF2E.saves }
  );

  /** `CreaturePF2e#skills[slug].check.roll` */
  registerSkillTestAdapter(
    'pf2e',
    async (actor, skill, dc, prompt) => {
      const roll = await actor.skills?.[skill]?.check?.roll({ dc, skipDialog: !prompt });
      return roll ? roll.degreeOfSuccess >= 2 : null;
    },
    Object.fromEntries(Object.entries(CONFIG.PF2E.skills).map(([key, { label }]) => [key, label]))
  );

  /** `CreaturePF2e#applyDamage` */
  registerHurtHealAdapter(
    'pf2e',
    async (actor, formula, { damageType, postCard, rollMode }) => {
      const token = actor.getActiveTokens()[0]?.document ?? null;
      const { heal, formula: rolled } = splitHealSign(formula);
      const type = heal ? null : damageType;
      const DamageRoll = CONFIG.Dice.rolls.find((cls) => cls.name === 'DamageRoll');
      const roll = type ? await new DamageRoll(`${rolled}[${type}]`).evaluate() : await new Roll(rolled, actor.getRollData()).evaluate();
      if (postCard) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ token }) }, { messageMode: toMessageMode(rollMode) });
      if (!type) return actor.applyDamage({ damage: heal ? -roll.total : roll.total, token, skipIWR: true });
      await actor.applyDamage({ damage: roll, token, skipIWR: false });
    },
    CONFIG.PF2E.damageTypes
  );
}
