import { registerAbilityTestAdapter } from '../ability-test-adapters.mjs';
import { registerSkillTestAdapter } from '../skill-test-adapters.mjs';

/** pf2e-only */
export function registerPf2eActions() {
  if (game.system.id !== 'pf2e') return;

  /** `CreaturePF2e#rollAbilityCheck`/`#rollSavingThrow` */
  registerAbilityTestAdapter(
    'pf2e',
    async (actor, type, ability, dc) => {
      const method = type === 'check' ? 'rollAbilityCheck' : 'rollSavingThrow';
      const roll = await actor[method]?.({ ability, dc, skipDialog: true });
      return roll ? roll.degreeOfSuccess >= 2 : null;
    },
    CONFIG.PF2E.abilities
  );

  /** `CreaturePF2e#skills[slug].check.roll` */
  registerSkillTestAdapter(
    'pf2e',
    async (actor, skill, dc) => {
      const roll = await actor.skills?.[skill]?.check?.roll({ dc, skipDialog: true });
      return roll ? roll.degreeOfSuccess >= 2 : null;
    },
    Object.fromEntries(Object.entries(CONFIG.PF2E.skills).map(([key, { label }]) => [key, label]))
  );
}
