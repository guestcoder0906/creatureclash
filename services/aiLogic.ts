import { GameState, GameAction, CardType, CardId, CardInstance, Habitat } from '../types';
import { CARDS } from '../constants';

// Helper to calculate estimated damage of an attack
const getEstimatedAttackDamage = (attackerCardId: CardId | string, attackerStatuses: { type: string }[]): number => {
    let dmg = 2;
    if (attackerCardId === CardId.DiveBomb || attackerCardId === CardId.CrushingWeight) dmg = 4;
    else if (attackerCardId === CardId.Bite || attackerCardId === CardId.BigClaws) dmg = 3;
    else if (attackerCardId === CardId.GraspingTalons || attackerCardId === CardId.VenomousFangs || attackerCardId === CardId.Leech) dmg = 1;

    if (attackerStatuses.some(s => s.type === 'DamageBuff')) {
        dmg += 1;
    }
    return dmg;
};

// Compute reactive decisions (Agile evasion & Big Claws choice)
export const computeReaction = (state: GameState, aiId: string): GameAction | null => {
    const ai = state.players[aiId];
    if (!ai) return null;

    // 1. Handle Agile Reaction
    if (state.pendingReaction && state.pendingReaction.targetId === aiId) {
        const reaction = state.pendingReaction;
        if (ai.stamina < 1) {
            return { type: 'RESOLVE_AGILE', playerId: aiId, useAgile: false, rng: [] };
        }

        const attacker = state.players[reaction.attackerId];
        const estimatedDmg = getEstimatedAttackDamage(reaction.attackCardId, attacker?.statuses || []);

        let shouldEvade = false;
        // Avoid lethal damage
        if (ai.hp <= estimatedDmg) {
            shouldEvade = true;
        } else if (estimatedDmg >= 3) {
            shouldEvade = true;
        } else if (ai.hp <= ai.maxHp * 0.5 && estimatedDmg >= 2) {
            shouldEvade = Math.random() > 0.15; // 85% chance
        } else if (ai.stamina >= 3 && estimatedDmg >= 2) {
            shouldEvade = Math.random() > 0.35; // 65% chance
        }

        return {
            type: 'RESOLVE_AGILE',
            playerId: aiId,
            useAgile: shouldEvade,
            rng: Array.from({ length: 5 }, () => Math.random())
        };
    }

    // 2. Handle Big Claws Tactical Choice (Attack vs Dig vs Climb)
    if (state.pendingChoice && state.pendingChoice.playerId === aiId) {
        const options = state.pendingChoice.options;
        const opponentId = Object.keys(state.players).find(id => id !== aiId);
        const opponent = opponentId ? state.players[opponentId] : null;

        let choice = 'Attack';
        // Low HP -> Dig for Hidden defense
        if (ai.hp <= 5 && options.includes('Dig')) {
            choice = 'Dig';
        } else if (options.includes('Climb') && opponent && !opponent.statuses.some(s => s.type === 'Flying')) {
            // If opponent cannot fly, Climb grants complete ground immunity
            choice = Math.random() > 0.3 ? 'Climb' : 'Attack';
        } else if (options.includes('Attack')) {
            choice = 'Attack';
        }

        return {
            type: 'RESOLVE_CHOICE',
            playerId: aiId,
            choice,
            rng: Array.from({ length: 5 }, () => Math.random())
        };
    }

    return null;
};

// Compute the SINGLE best next action for the AI given the current live state
export const computeNextAiAction = (state: GameState, aiId: string): GameAction => {
    const ai = state.players[aiId];
    if (!ai) {
        return { type: 'END_TURN', playerId: aiId, rng: Array.from({ length: 5 }, () => Math.random()) };
    }

    const opponentId = Object.keys(state.players).find(id => id !== aiId) || '';
    const opponent = state.players[opponentId];
    if (!opponent) {
        return { type: 'END_TURN', playerId: aiId, rng: Array.from({ length: 5 }, () => Math.random()) };
    }

    const currentStamina = ai.stamina;
    const cardsPlayed = ai.cardsPlayedThisTurn;
    const freeCardPlays = 1 + (ai.extraCardPlays || 0);
    const isPayingForExtraCard = cardsPlayed >= freeCardPlays;

    // --- STEP 1: FREE STAMINA BOOSTERS FROM HAND ---
    // Short Burst: +1 Stamina
    const burstCard = ai.hand.find(c => CARDS[c.defId].id === CardId.ShortBurst);
    const usedBurst = ai.usedAbilitiesThisTurn?.includes(CardId.ShortBurst) ||
        (burstCard && ai.usedAbilitiesThisTurn?.includes(burstCard.instanceId));
    if (burstCard && !usedBurst && currentStamina <= 2) {
        return {
            type: 'PLAY_CARD',
            playerId: aiId,
            cardInstanceId: burstCard.instanceId
        };
    }

    // Adrenaline Rush: +1 Stamina
    const adrenalineCard = ai.hand.find(c => CARDS[c.defId].id === CardId.AdrenalineRush);
    const usedAdrenaline = ai.usedAbilitiesThisTurn?.includes(CardId.AdrenalineRush) ||
        (adrenalineCard && ai.usedAbilitiesThisTurn?.includes(adrenalineCard.instanceId));
    if (adrenalineCard && !usedAdrenaline && (currentStamina <= 1 || (ai.hp <= 8 && currentStamina <= 2))) {
        return {
            type: 'PLAY_CARD',
            playerId: aiId,
            cardInstanceId: adrenalineCard.instanceId
        };
    }

    // --- STEP 2: APEX EVOLUTION FROM HAND ---
    const apexCard = ai.hand.find(c => CARDS[c.defId].id === CardId.ApexEvolution);
    if (apexCard && currentStamina >= 2) {
        const allCards = Object.values(CARDS);
        const upgradableInFormation = ai.formation.find(c => {
            const def = CARDS[c.defId];
            return allCards.some(uc => uc.isUpgrade && uc.upgradeTarget?.includes(def.id));
        });
        if (upgradableInFormation) {
            return {
                type: 'PLAY_APEX_EVOLUTION',
                playerId: aiId,
                apexCardInstanceId: apexCard.instanceId,
                targetFormationInstanceId: upgradableInFormation.instanceId
            };
        }
    }

    // --- STEP 3: PLAY CARD INTO FORMATION ---
    // Can play if free play, OR if extra play and has >= 2 stamina
    const canPlayCardNow = !isPayingForExtraCard || currentStamina >= 2;

    if (canPlayCardNow) {
        // Evolve: grants extra card play
        const evolveCard = ai.hand.find(c => CARDS[c.defId].id === CardId.Evolve);
        if (evolveCard && currentStamina >= 2 && !isPayingForExtraCard) {
            return {
                type: 'PLAY_CARD',
                playerId: aiId,
                cardInstanceId: evolveCard.instanceId
            };
        }

        // Upgrades in hand
        const upgrades = ai.hand.filter(c => CARDS[c.defId].isUpgrade);
        for (const upg of upgrades) {
            const def = CARDS[upg.defId];
            if (def.upgradeTarget) {
                const target = ai.formation.find(c => def.upgradeTarget!.includes(c.defId));
                if (target) {
                    return {
                        type: 'PLAY_CARD',
                        playerId: aiId,
                        cardInstanceId: upg.instanceId,
                        targetInstanceId: target.instanceId
                    };
                }
            }
        }

        // Normal card to play
        const validCards = ai.hand.filter(c => {
            const def = CARDS[c.defId];
            const typeMatch = ai.hasCustomDeck || def.creatureTypes === 'All' || def.creatureTypes.includes(ai.creatureType);
            const notAlreadyInFormation = !ai.formation.some(f => f.defId === def.id);
            const notSpecialInstant = def.id !== CardId.Evolve && def.id !== CardId.ApexEvolution &&
                def.id !== CardId.AdrenalineRush && def.id !== CardId.ShortBurst && !def.isUpgrade;
            const sizeOk = def.id !== CardId.CrushingWeight || ai.size === 'Big';
            return typeMatch && notAlreadyInFormation && notSpecialInstant && sizeOk;
        });

        if (validCards.length > 0) {
            const scoredCards = validCards.map(c => {
                const def = CARDS[c.defId];
                let score = 10;

                // Habitat bonus
                if (def.habitats !== 'All' && Array.isArray(def.habitats) && def.habitats.includes(state.habitat)) {
                    score += 8;
                }

                // Balance formation: need at least 1-2 attacks and 1-2 abilities
                const currentPhysicals = ai.formation.filter(f => CARDS[f.defId].type === CardType.Physical).length;
                const currentAbilities = ai.formation.filter(f => CARDS[f.defId].type === CardType.Ability).length;

                if (def.type === CardType.Physical) {
                    if (currentPhysicals === 0) score += 12;
                    else if (currentPhysicals === 1) score += 6;
                    // High impact attacks
                    if (def.id === CardId.Bite || def.id === CardId.DiveBomb || def.id === CardId.CrushingWeight) score += 6;
                } else if (def.type === CardType.Ability) {
                    if (currentAbilities === 0) score += 10;
                    // High tier abilities
                    if (def.id === CardId.Focus || def.id === CardId.Hibernate || def.id === CardId.Regeneration || def.id === CardId.Flight) {
                        score += 8;
                    }
                }

                return { c, def, score };
            });

            scoredCards.sort((a, b) => b.score - a.score);
            const bestCard = scoredCards[0];

            // If it's a free play: play it!
            // If it's an extra play (costs 2 stamina): only play if stamina is healthy (>= 3) and score is solid
            if (!isPayingForExtraCard || (currentStamina >= 3 && bestCard.score >= 12)) {
                return {
                    type: 'PLAY_CARD',
                    playerId: aiId,
                    cardInstanceId: bestCard.c.instanceId
                };
            }
        }
    }

    // --- STEP 4: STATUS BREAKOUT / ESCAPE CHECK ---
    const isStuckOrGrappled = ai.statuses.some(s => s.type === 'Stuck' || s.type === 'Grappled');
    if (isStuckOrGrappled) {
        // Focus breaks out + gives +1 Damage Buff + guaranteed Heads!
        const focusCard = ai.formation.find(c => CARDS[c.defId].id === CardId.Focus);
        const hasUsedFocus = ai.usedAbilitiesThisTurn?.includes(CardId.Focus) ||
            (focusCard && ai.usedAbilitiesThisTurn?.includes(focusCard.instanceId));
        if (focusCard && !hasUsedFocus && currentStamina >= 1) {
            return {
                type: 'USE_ACTION',
                playerId: aiId,
                actionType: 'ABILITY',
                cardInstanceId: focusCard.instanceId,
                targetPlayerId: opponentId,
                rng: Array.from({ length: 5 }, () => Math.random())
            };
        }

        // Rage breaks out + gives +1 Damage Buff!
        const rageCard = ai.formation.find(c => CARDS[c.defId].id === CardId.Rage);
        const hasUsedRage = ai.usedAbilitiesThisTurn?.includes(CardId.Rage) ||
            (rageCard && ai.usedAbilitiesThisTurn?.includes(rageCard.instanceId));
        if (rageCard && !hasUsedRage && currentStamina >= 1) {
            return {
                type: 'USE_ACTION',
                playerId: aiId,
                actionType: 'ABILITY',
                cardInstanceId: rageCard.instanceId,
                targetPlayerId: opponentId,
                rng: Array.from({ length: 5 }, () => Math.random())
            };
        }

        // Shed Skin cures statuses
        const shedCard = ai.formation.find(c => CARDS[c.defId].id === CardId.ShedSkin);
        const hasUsedShed = ai.usedAbilitiesThisTurn?.includes(CardId.ShedSkin) ||
            (shedCard && ai.usedAbilitiesThisTurn?.includes(shedCard.instanceId));
        if (shedCard && !hasUsedShed && currentStamina >= 2) {
            return {
                type: 'USE_ACTION',
                playerId: aiId,
                actionType: 'ABILITY',
                cardInstanceId: shedCard.instanceId,
                targetPlayerId: opponentId,
                rng: Array.from({ length: 5 }, () => Math.random())
            };
        }
    }

    // --- STEP 5: SYNERGY FREE ACTIONS ---
    // If AI has Focus and hasn't used it: Focus gives breakout + +1 dmg buff + guaranteed heads!
    const focusCard = ai.formation.find(c => CARDS[c.defId].id === CardId.Focus);
    const hasUsedFocus = ai.usedAbilitiesThisTurn?.includes(CardId.Focus) ||
        (focusCard && ai.usedAbilitiesThisTurn?.includes(focusCard.instanceId));
    const canAttackThisTurn = !ai.hasAttackedThisTurn && !ai.statuses.some(s => s.type === 'CannotAttack' || s.type === 'Stuck');
    if (focusCard && !hasUsedFocus && currentStamina >= 1 && canAttackThisTurn) {
        return {
            type: 'USE_ACTION',
            playerId: aiId,
            actionType: 'ABILITY',
            cardInstanceId: focusCard.instanceId,
            targetPlayerId: opponentId,
            rng: Array.from({ length: 5 }, () => Math.random())
        };
    }

    // If opponent is Hidden / Camouflaged, use Enhanced Smell to reveal and chase!
    const opponentIsHidden = opponent.statuses.some(s => s.type === 'Hidden' || s.type === 'Camouflaged');
    const smellCard = ai.formation.find(c => CARDS[c.defId].id === CardId.EnhancedSmell);
    const hasUsedSmell = ai.usedAbilitiesThisTurn?.includes(CardId.EnhancedSmell) ||
        (smellCard && ai.usedAbilitiesThisTurn?.includes(smellCard.instanceId));
    if (smellCard && opponentIsHidden && !hasUsedSmell && currentStamina >= 1) {
        return {
            type: 'USE_ACTION',
            playerId: aiId,
            actionType: 'ABILITY',
            cardInstanceId: smellCard.instanceId,
            targetPlayerId: opponentId,
            rng: Array.from({ length: 5 }, () => Math.random())
        };
    }

    // --- STEP 6: EVALUATE ALL ACTIONS (ATTACK & MAIN ABILITY) ---
    const opponentIsClimbing = opponent.statuses.some(s => s.type === 'Climbing');
    const opponentIsFlying = opponent.statuses.some(s => s.type === 'Flying');
    const aiIsFlying = ai.statuses.some(s => s.type === 'Flying');
    const aiIsAccurate = ai.statuses.some(s => s.type === 'Accurate');
    const hasDamageBuff = ai.statuses.some(s => s.type === 'DamageBuff');

    const availableActions = ai.formation.filter(c => {
        const def = CARDS[c.defId];
        const isAbility = def.type === CardType.Ability || (def.type === CardType.Special && def.id === CardId.ApexEvolution);
        const isAttack = !isAbility && def.type === CardType.Physical;

        // Passive cards cannot be activated
        if (def.id === CardId.StrongBuild || def.type === CardType.Size || def.id === CardId.Amphibious ||
            def.id === CardId.CamouflageWater || def.id === CardId.PoisonSkin || def.id === CardId.BarbedQuills ||
            def.id === CardId.ArmoredScales || def.id === CardId.ArmoredExoskeleton || def.id === CardId.KeenEyesight ||
            def.id === CardId.SwimsWell) {
            return false;
        }

        const isFreeAction = def.id === CardId.ShortBurst || def.id === CardId.AdrenalineRush ||
            def.id === CardId.EnhancedSmell || def.id === CardId.Focus || def.id === CardId.Rage ||
            (def.id === CardId.Agile && def.type === CardType.Ability);

        if (isAttack) {
            if (ai.hasAttackedThisTurn) return false;
            if (ai.statuses.some(s => s.type === 'CannotAttack' || s.type === 'Stuck')) return false;
        }

        if (isAbility) {
            const alreadyUsed = (ai.usedAbilitiesThisTurn && (
                ai.usedAbilitiesThisTurn.includes(c.instanceId) ||
                ai.usedAbilitiesThisTurn.includes(def.id)
            )) || c.usedThisTurn;
            if (alreadyUsed) return false;
            if (!isFreeAction && ai.hasUsedAbilityThisTurn) return false;
        }

        const isHibernate = def.id === CardId.Hibernate;
        const isHealingHibernate = isHibernate && ai.hp < ai.maxHp;
        const effectiveCost = isHibernate ? (isHealingHibernate ? 2 : 1) : def.staminaCost;
        if (effectiveCost > currentStamina) return false;

        return true;
    });

    if (availableActions.length > 0) {
        const scoredActions = availableActions.map(c => {
            const def = CARDS[c.defId];
            const isAbility = def.type === CardType.Ability || (def.type === CardType.Special && def.id === CardId.ApexEvolution);
            let score = 0;
            let extraPayload: any = {};

            // --- PHYSICAL ATTACK SCORING ---
            if (!isAbility) {
                let dmg = 2;
                if (def.id === CardId.DiveBomb || def.id === CardId.CrushingWeight) dmg = 4;
                else if (def.id === CardId.Bite || def.id === CardId.BigClaws) dmg = 3;
                else if (def.id === CardId.GraspingTalons || def.id === CardId.VenomousFangs || def.id === CardId.Leech) dmg = 1;

                if (hasDamageBuff) dmg += 1;
                if (def.id === CardId.SwimFast && state.habitat === Habitat.Water) dmg += 2;

                // Evasion penalties
                if (opponentIsClimbing && !aiIsFlying && def.id !== CardId.DiveBomb) {
                    // Cannot hit climbing opponent with ground attack!
                    return { c, def, score: -100, isAbility: false, extraPayload };
                }
                if (opponentIsHidden) {
                    // 100% miss into hidden target!
                    return { c, def, score: -100, isAbility: false, extraPayload };
                }

                // Lethal priority
                if (opponent.hp <= dmg) {
                    score += 5000;
                } else {
                    score += dmg * 12;
                }

                // Penalty if target has 50% flying miss and attacker isn't accurate
                if (opponentIsFlying && !aiIsAccurate) {
                    score -= 5;
                }
            }

            // --- ABILITY SCORING ---
            if (isAbility) {
                // Hibernate:
                // If damaged: Costs 2 Stamina to heal 2 HP.
                // If full HP: Costs 1 Stamina to gain +2 Stamina.
                if (def.id === CardId.Hibernate) {
                    if (ai.hp < ai.maxHp) {
                        const missingHp = ai.maxHp - ai.hp;
                        if (currentStamina >= 2) {
                            score += 30 + missingHp * 5;
                        }
                    } else {
                        // At full health: using 1 stamina to gain +2 stamina is great if stamina <= 4
                        if (currentStamina >= 1 && currentStamina <= 4) {
                            score += 26;
                        }
                    }
                }

                // Regeneration: Heal 4 HP
                if (def.id === CardId.Regeneration) {
                    if (ai.hp <= ai.maxHp * 0.5) score += 40;
                    else if (ai.hp <= ai.maxHp * 0.75) score += 20;
                    else score -= 15;
                }

                // Flight: evades ground attacks + buffs Dive Bomb
                if (def.id === CardId.Flight) {
                    if (!aiIsFlying) {
                        score += 28;
                        if (ai.formation.some(f => f.defId === CardId.DiveBomb)) score += 12;
                    } else {
                        score -= 50;
                    }
                }

                // Dig / Freeze: Hides underground
                if (def.id === CardId.Dig || def.id === CardId.Freeze) {
                    if (ai.hp <= 6) score += 32;
                    else score += 10;
                }

                // Camouflage: 50% miss chance, max 2 uses
                if (def.id === CardId.Camouflage) {
                    if (!ai.statuses.some(s => s.type === 'Camouflaged')) {
                        score += 28;
                    } else {
                        score -= 20;
                    }
                }

                // Roar: stops opponent attack
                if (def.id === CardId.Roar) {
                    if (!opponent.hasAttackedThisTurn && opponent.hp > 3) score += 26;
                    else score += 5;
                }

                // Ambush Attack: Gives Accurate (cannot be evaded)
                if (def.id === CardId.AmbushAttack) {
                    if (opponentIsFlying || opponent.statuses.some(s => s.type === 'Camouflaged') || opponent.hasCustomDeck) {
                        score += 30;
                    } else {
                        score += 15;
                    }
                }

                // Toxic Spit: Poison or stuck
                if (def.id === CardId.ToxicSpit) {
                    if (!opponent.statuses.some(s => s.type === 'Poisoned')) score += 24;
                    else score += 10;
                }

                // Territorial Display: Discard opponent's hand
                if (def.id === CardId.TerritorialDisplay) {
                    if (opponent.hand.length >= 2) score += 28;
                    else if (opponent.hand.length === 1) score += 14;
                    else score -= 20;
                }

                // Copycat: Steal best card from opponent
                if (def.id === CardId.Copycat) {
                    if (opponent.hand.length > 0) {
                        score += 25;
                        const sortedHand = [...opponent.hand].sort((a, b) => CARDS[b.defId].staminaCost - CARDS[a.defId].staminaCost);
                        extraPayload.targetHandCardId = sortedHand[0].instanceId;
                    } else {
                        score -= 50;
                    }
                }

                // Confuse: Makes opponent attack self on tails
                if (def.id === CardId.Confuse) {
                    score += 22;
                }

                // Shed Skin: cleanses poison / debt
                if (def.id === CardId.ShedSkin) {
                    if (ai.statuses.some(s => s.type === 'Poisoned' || s.type === 'StaminaDebt' || s.type === 'Stuck')) {
                        score += 35;
                    } else {
                        score -= 30;
                    }
                }
            }

            return { c, def, score, isAbility, extraPayload };
        });

        scoredActions.sort((a, b) => b.score - a.score);
        const best = scoredActions[0];

        if (best && best.score > 0) {
            return {
                type: 'USE_ACTION',
                playerId: aiId,
                actionType: best.isAbility ? 'ABILITY' : 'ATTACK',
                cardInstanceId: best.c.instanceId,
                targetPlayerId: opponentId,
                rng: Array.from({ length: 10 }, () => Math.random()),
                ...best.extraPayload
            };
        }
    }

    // --- STEP 7: NO MORE ACTIONS -> END TURN ---
    return {
        type: 'END_TURN',
        playerId: aiId,
        rng: Array.from({ length: 10 }, () => Math.random())
    };
};

// Full turn simulator (legacy fallback)
export const computeAiActions = (state: GameState, aiId: string): GameAction[] => {
    return [computeNextAiAction(state, aiId)];
};
