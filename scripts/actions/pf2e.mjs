import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerHurtHealAdapter, splitHealSign, toMessageMode } from '../hurt-heal-adapters.mjs';
import { registerSkillTestAdapter } from '../skill-test-adapters.mjs';

/** pf2e-only */
export function registerPf2eActions() {
  if (game.system.id !== 'pf2e') return;

  /** `CreaturePF2e#rollAbilityCheck`/`#rollSavingThrow` */
  registerAbilityTestAdapter(
    'pf2e',
    async (actor, type, ability, dc, prompt) => {
      const method = type === 'check' ? 'rollAbilityCheck' : 'rollSavingThrow';
      const roll = await actor[method]?.({ ability, dc, skipDialog: !prompt });
      return roll ? roll.degreeOfSuccess >= 2 : null;
    },
    CONFIG.PF2E.abilities
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
