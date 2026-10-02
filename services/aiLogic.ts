import { GameState, GameAction, CardType, CardId, AbilityStatus, CardInstance, PendingReaction } from '../types';
import { CARDS } from '../constants';

export const computeReaction = (state: GameState, aiId: string): GameAction | null => {
   const ai = state.players[aiId];

   // Handle Agile Reaction
   if (state.pendingReaction && state.pendingReaction.targetId === aiId) {
       const reaction = state.pendingReaction;
       if (ai.stamina < 1) return { type: 'RESOLVE_AGILE', playerId: aiId, useAgile: false, rng: [] };

       // Heuristic: When to evade?
       let shouldEvade = false;
       
       // 1. Avoid Lethal
       let estimatedDmg = 2;
       if (reaction.attackCardId === CardId.DiveBomb || reaction.attackCardId === CardId.CrushingWeight) estimatedDmg = 4;
       if (reaction.attackCardId === CardId.Bite) estimatedDmg = 3;
       
       if (ai.hp <= estimatedDmg) shouldEvade = true;
       else if (estimatedDmg >= 3) shouldEvade = true;
       else if (ai.hp < ai.maxHp * 0.5 && Math.random() > 0.4) shouldEvade = true;

       return {
           type: 'RESOLVE_AGILE',
           playerId: aiId,
           useAgile: shouldEvade,
           rng: Array.from({length: 5}, () => Math.random())
       };
   }

   // Handle Big Claws Choice
   if (state.pendingChoice && state.pendingChoice.playerId === aiId) {
       const options = state.pendingChoice.options;
       let choice = 'Attack';
       
       if (ai.hp < 5 && options.includes('Dig')) {
           choice = 'Dig'; // Hide if low HP
       } else if (options.includes('Climb') && Math.random() > 0.7) {
           choice = 'Climb'; // Sometimes climb for tactical evasion
       }
       
       return {
           type: 'RESOLVE_CHOICE',
           playerId: aiId,
           choice,
           rng: Array.from({length: 5}, () => Math.random())
       }
   }

   return null;
}

export const computeAiActions = (state: GameState, aiId: string): GameAction[] => {
  const actions: GameAction[] = [];
  const ai = state.players[aiId];
  if (!ai) return [];
  
  const opponentId = Object.keys(state.players).find(id => id !== aiId)!;
  const opponent = state.players[opponentId];
  
  let currentStamina = ai.stamina;
  let cardsPlayed = ai.cardsPlayedThisTurn;
  let hasActed = ai.hasActedThisTurn;

  // To correctly simulate the turn, we need to track which card we decide to play
  // so we can use it in the action phase immediately (since play/action can happen same turn).
  let cardPlayedInstance: CardInstance | null = null;

  // --- 0. FREE ACTION STAMINA BOOSTERS (Adrenaline Rush & Short Burst) ---
  const adrenalineCard = ai.hand.find(c => CARDS[c.defId].id === CardId.AdrenalineRush);
  const hasUsedAdrenaline = ai.usedAbilitiesThisTurn?.includes(CardId.AdrenalineRush) ||
    (adrenalineCard && ai.usedAbilitiesThisTurn?.includes(adrenalineCard.instanceId));
  if (adrenalineCard && !hasUsedAdrenaline && (currentStamina < 2 || ai.hp < 10)) {
      actions.push({
          type: 'PLAY_CARD',
          playerId: aiId,
          cardInstanceId: adrenalineCard.instanceId
      });
      currentStamina += 1;
  }

  const burstCard = ai.hand.find(c => CARDS[c.defId].id === CardId.ShortBurst);
  const hasUsedBurst = ai.usedAbilitiesThisTurn?.includes(CardId.ShortBurst) ||
    (burstCard && ai.usedAbilitiesThisTurn?.includes(burstCard.instanceId));
  if (burstCard && !hasUsedBurst && currentStamina < 2) {
      actions.push({
          type: 'PLAY_CARD',
          playerId: aiId,
          cardInstanceId: burstCard.instanceId
      });
      currentStamina += 1;
  }

  // --- 1. PLAY CARD PHASE ---
  // Check for Evolve Logic
  const evolveCard = ai.hand.find(c => CARDS[c.defId].id === CardId.Evolve);
  if (evolveCard && currentStamina >= 2) {
      actions.push({
          type: 'PLAY_CARD',
          playerId: aiId,
          cardInstanceId: evolveCard.instanceId
      });
      currentStamina -= 2;
  }

  const maxAllowedPlays = 1 + (ai.extraCardPlays || 0) + (evolveCard && currentStamina >= 0 ? 1 : 0);
  if (cardsPlayed < maxAllowedPlays) {
      // Try to find an upgrade first
      const upgrades = ai.hand.filter(c => CARDS[c.defId].isUpgrade);
      let playedUpgrade = false;
      
      for (const upg of upgrades) {
      const def = CARDS[upg.defId];
      if (currentStamina >= def.staminaCost && def.upgradeTarget) {
          const target = ai.formation.find(c => def.upgradeTarget!.includes(c.defId));
          if (target) {
          actions.push({
              type: 'PLAY_CARD',
              playerId: aiId,
              cardInstanceId: upg.instanceId,
              targetInstanceId: target.instanceId
          });
          currentStamina -= def.staminaCost;
          cardsPlayed++; 
          playedUpgrade = true;
          break;
          }
      }
      }

      // If no upgrade, play a normal card
      if (!playedUpgrade) {
      const validCards = ai.hand.filter(c => {
          const def = CARDS[c.defId];
          const typeMatch = ai.hasCustomDeck || def.creatureTypes === 'All' || def.creatureTypes.includes(ai.creatureType);
          // Explicitly filter out Evolve/Apex and instant free-use cards
          return typeMatch && !def.isUpgrade && def.id !== CardId.Evolve && def.id !== CardId.ApexEvolution && def.id !== CardId.AdrenalineRush && def.id !== CardId.ShortBurst;
      });

      if (validCards.length > 0) {
          const physCount = ai.formation.filter(c => CARDS[c.defId].type === CardType.Physical).length;

          // Heuristic: Play Physical if few physicals, else Ability
          let chosen = validCards.find(c => CARDS[c.defId].type === CardType.Physical);
          if (!chosen || physCount >= 2) {
              chosen = validCards.find(c => CARDS[c.defId].type === CardType.Ability) || validCards[0];
          }
          
          if (chosen) {
              actions.push({
                  type: 'PLAY_CARD',
                  playerId: aiId,
                  cardInstanceId: chosen.instanceId
              });
              cardPlayedInstance = chosen;
              cardsPlayed++;
          }
      }
      }
  }

  // --- APEX EVOLUTION LOGIC ---
  // This is a free action ability, so we check if we can use it regardless of main action state
  const apexCard = ai.hand.find(c => CARDS[c.defId].id === CardId.ApexEvolution);
  if (apexCard && currentStamina >= 2) {
      // Look for upgradable card in formation
      const allCards = Object.values(CARDS);
      const upgradableCard = ai.formation.find(c => {
           const def = CARDS[c.defId];
           // Check if any upgrade card targets this defId
           return allCards.some(uc => uc.isUpgrade && uc.upgradeTarget?.includes(def.id));
      });

      if (upgradableCard) {
          actions.push({
              type: 'PLAY_APEX_EVOLUTION',
              playerId: aiId,
              apexCardInstanceId: apexCard.instanceId,
              targetFormationInstanceId: upgradableCard.instanceId
          });
          currentStamina -= 2;
      }
  }

  // --- 2. ACTION PHASE (Up to 1 Ability AND 1 Attack per turn) ---
  const isStuck = ai.statuses.some(s => s.type === 'Stuck');
  if (!isStuck) {
      let aiHasAttacked = !!ai.hasAttackedThisTurn;
      let aiHasUsedAbility = !!ai.hasUsedAbilityThisTurn;
      const usedAbilityCardIds: string[] = [...(ai.usedAbilitiesThisTurn || [])];

      const availableActions: { instanceId: string, defId: string }[] = [];
      ai.formation.forEach(c => availableActions.push({ instanceId: c.instanceId, defId: c.defId }));
      if (cardPlayedInstance) {
        availableActions.push({ instanceId: cardPlayedInstance.instanceId, defId: cardPlayedInstance.defId });
      }

      // Allow up to 2 actions: 1 Ability and 1 Attack if stamina permits
      for (let step = 0; step < 2; step++) {
          const affordableActions = availableActions.filter(c => {
            const def = CARDS[c.defId];
            const isAbility = def.type === CardType.Ability || (def.type === CardType.Special && def.id === CardId.ApexEvolution);
            const isAttack = !isAbility && def.type === CardType.Physical;

            if (isAttack && aiHasAttacked) return false;
            if (isAbility) {
                if (aiHasUsedAbility) return false;
                if (usedAbilityCardIds.includes(c.instanceId) || usedAbilityCardIds.includes(def.id)) return false;
            }

            const isHealingHibernate = def.id === CardId.Hibernate && ai.hp < ai.maxHp;
            const effectiveCost = isHealingHibernate ? 0 : def.staminaCost;
            if (effectiveCost > currentStamina) return false;

            if (def.id === CardId.StrongBuild || def.type === CardType.Size || def.id === CardId.Amphibious || def.id === CardId.CamouflageWater || def.id === CardId.PoisonSkin || def.id === CardId.BarbedQuills || def.id === CardId.ArmoredScales || def.id === CardId.ArmoredExoskeleton) return false;

            return isAttack || isAbility;
          });

          if (affordableActions.length === 0) break;

          // Scoring System
          const scoredActions = affordableActions.map(c => {
            const def = CARDS[c.defId];
            let score = 0;
            let extraPayload: any = {};
            
            // Heals - High priority if low HP
            if (def.id === CardId.Regeneration) {
              if (ai.hp < ai.maxHp * 0.4) score += 20;
              else if (ai.hp < ai.maxHp * 0.7) score += 5;
              else score -= 10;
            }

            if (def.id === CardId.Hibernate) {
              if (ai.hp < ai.maxHp) {
                score += 25; // Free 2 HP heal + 1 stamina!
              } else {
                score -= 10;
              }
            }

            // Attacks
            if (def.type === CardType.Physical) {
               let dmg = 2; 
               if (def.id === CardId.Bite) dmg = 3;
               if (def.id === CardId.DiveBomb) dmg = 4;
               if (def.id === CardId.CrushingWeight) dmg = 4;
               if (def.id === CardId.BigClaws) dmg = 3;
               if (def.id === CardId.GraspingTalons || def.id === CardId.VenomousFangs || def.id === CardId.Leech) dmg = 1;
               
               if (opponent.hp <= dmg) score += 1000; // Lethal
               else score += dmg * 2;
            }

            // High synergy abilities
            if (def.id === CardId.Focus) score += 12;
            if (def.id === CardId.FocusPlus) score += 18;
            if (def.id === CardId.Rage) score += 12;
            if (def.id === CardId.AdrenalineRush) score += 18;

            // Copycat
            if (def.id === CardId.Copycat) {
               if (opponent.hand.length > 0) {
                  score += 15;
                  const bestSteal = [...opponent.hand].sort((a,b) => CARDS[b.defId].staminaCost - CARDS[a.defId].staminaCost)[0];
                  extraPayload.targetHandCardId = bestSteal.instanceId;
               } else {
                  score -= 100;
               }
            }

            // Debuffs / Control
            if (def.id === CardId.Confuse) score += 8;
            if (def.id === CardId.ToxicSpit) score += 8;
            if (def.id === CardId.TerritorialDisplay) score += 6;

            // Randomize slightly to make AI less predictable
            score += Math.random() * 2;

            return { c, score, def, extraPayload };
          });

          // Sort by score descending
          scoredActions.sort((a, b) => b.score - a.score);
          const bestAction = scoredActions[0];

          if (bestAction && bestAction.score > 0) {
             const isAbility = bestAction.def.type === CardType.Ability || bestAction.def.type === CardType.Special;
             const isHealingHibernate = bestAction.def.id === CardId.Hibernate && ai.hp < ai.maxHp;
             const cost = isHealingHibernate ? 0 : bestAction.def.staminaCost;

             actions.push({
               type: 'USE_ACTION',
               playerId: aiId,
               actionType: isAbility ? 'ABILITY' : 'ATTACK',
               cardInstanceId: bestAction.c.instanceId,
               targetPlayerId: opponentId,
               rng: Array.from({length: 10}, () => Math.random()),
               ...bestAction.extraPayload
             });

             currentStamina -= cost;
             if (isAbility) {
                aiHasUsedAbility = true;
                usedAbilityCardIds.push(bestAction.c.instanceId);
                usedAbilityCardIds.push(bestAction.def.id);
             } else {
                aiHasAttacked = true;
             }
          } else {
             break;
          }
      }
  }

  // --- 3. END TURN ---
  actions.push({
    type: 'END_TURN',
    playerId: aiId,
    rng: Array.from({length: 10}, () => Math.random())
  });

  return actions;
};