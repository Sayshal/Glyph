import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerHurtHealAdapter, toMessageMode } from '../hurt-heal-adapters.mjs';
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
      const DamageRoll = CONFIG.Dice.rolls.find((cls) => cls.name === 'DamageRoll');
      const roll = damageType ? await new DamageRoll(`${formula}[${damageType}]`).evaluate() : await new Roll(formula, actor.getRollData()).evaluate();
      if (postCard) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ token }) }, { messageMode: toMessageMode(rollMode) });
      if (!damageType) return actor.applyDamage({ damage: roll.total, token, skipIWR: true });
      await actor.applyDamage({ damage: roll, token, skipIWR: false });
    },
    CONFIG.PF2E.damageTypes
  );
}
