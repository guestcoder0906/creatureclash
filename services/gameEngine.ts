import { CARDS, generateDeck, getRandomElement as randomElem } from '../constants';
import { GameState as GS, PlayerState as PS, CardInstance as CI, CreatureType as CT, Habitat as H, CardType as CType, AbilityStatus as AS, CardDef, GameAction as GA, CardId, CardId as CID, GameNotification, StatusEffect } from '../types';

const getRNG = (rng: number[] | undefined, index: number): number => {
  return (rng && rng.length > index) ? rng[index] : Math.random();
};

const isCardCompatible = (player: PS, cardDef: CardDef): boolean => {
  if (player.hasCustomDeck) return true;
  if (cardDef.creatureTypes === 'All') return true;
  return cardDef.creatureTypes.includes(player.creatureType);
};

export const createCustomPlayer = (
  id: string,
  name: string,
  cardIds: CardId[],
  creatureType: CT,
  size: 'Small' | 'Medium' | 'Big'
): PS => {
  const sizeDefId = size === 'Small' ? CID.SmallSize : size === 'Medium' ? CID.MediumSize : CID.BigSize;
  const sizeCard: CI = {
    instanceId: `${id}_size_${sizeDefId}`,
    defId: sizeDefId,
  };
  const formation = [sizeCard];

  const hp = size === 'Small' ? 10 : size === 'Medium' ? 15 : 20;
  const baseStamina = size === 'Small' ? 4 : size === 'Medium' ? 3 : 2;

  // Build deck from exactly the 10 selected cards (max 1 of each)
  const deck: CI[] = cardIds.map((defId, i) => ({
    instanceId: `${id}_card_${i}_${defId}_${Math.floor(Math.random() * 10000)}`,
    defId,
    charges: CARDS[defId]?.maxCharges
  }));

  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  // Draw starting hand of 4 cards from the 10 cards
  const hand: CI[] = [];
  const startHandCount = Math.min(4, deck.length);
  for (let i = 0; i < startHandCount; i++) {
    hand.push(deck.shift()!);
  }

  return {
    id, name, hp, maxHp: hp, stamina: baseStamina, maxStamina: baseStamina,
    creatureType, size,
    hand, deck, discard: [], formation,
    statuses: [],
    cardsPlayedThisTurn: 0, 
    extraCardPlays: 0,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    hasUsedAbilityThisTurn: false,
    guaranteedHeads: false,
    usedAbilitiesThisTurn: [],
    abilitiesUsedThisTurn: 0,
    hasCustomDeck: true,
    customDeckCardIds: cardIds
  };
};

export const generateRandomAiDeck = (
  creatureType: CT,
  size: 'Small' | 'Medium' | 'Big'
): CardId[] => {
  const isTypeMatch = (c: CardDef) => c.creatureTypes === 'All' || c.creatureTypes.includes(creatureType);
  const allCardDefs = Object.values(CARDS).filter(c => c.type !== CType.Size && isTypeMatch(c));
  
  // Available attacks - avoid CrushingWeight if not Big and avoid standalone upgrades
  const attacks = allCardDefs.filter(c => 
    c.type === CType.Physical && 
    !c.isUpgrade &&
    (size === 'Big' || c.id !== CID.CrushingWeight)
  );
  
  // Defenses and Passives
  const defenses = allCardDefs.filter(c =>
    !c.isUpgrade &&
    (c.id === CID.StrongBuild || c.id === CID.Fur || c.id === CID.ArmoredScales || c.id === CID.SpikyBody || c.id === CID.PoisonSkin || c.id === CID.BarbedQuills || c.id === CID.ArmoredExoskeleton || c.id === CID.Camouflage || c.id === CID.CamouflageWater)
  );

  // Active abilities and specials
  const abilities = allCardDefs.filter(c =>
    !c.isUpgrade &&
    c.id !== CID.Evolve &&
    c.id !== CID.ApexEvolution &&
    (c.type === CType.Ability || c.type === CType.Special)
  );

  const chosen: CardId[] = [];
  const pick = (pool: CardDef[], count: number) => {
    const poolCopy = pool.filter(c => !chosen.includes(c.id));
    for (let i = 0; i < count && poolCopy.length > 0; i++) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      const item = poolCopy.splice(idx, 1)[0];
      chosen.push(item.id);
    }
  };

  // Guarantee optimal functional composition: 5 attacks, 3 defenses, 4 abilities/specials (12 cards)
  pick(attacks, 5);
  pick(defenses, 3);
  pick(abilities, 4);

  // If still less than 12, fill from any remaining valid non-upgrade compatible cards
  const remaining = allCardDefs.filter(c => 
    !chosen.includes(c.id) &&
    !c.isUpgrade &&
    (size === 'Big' || c.id !== CID.CrushingWeight)
  );
  while (chosen.length < 12 && remaining.length > 0) {
    const idx = Math.floor(Math.random() * remaining.length);
    chosen.push(remaining.splice(idx, 1)[0].id);
  }

  return chosen.slice(0, 12);
};

export const createPlayer = (id: string, name: string): PS => {
  const types = [CT.Mammal, CT.Reptile, CT.Avian, CT.Amphibian];
  const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
  
  const cType = randomElem(types);
  const size = randomElem(sizes);
  const deckDefs = generateDeck(cType, size);

  // Convert Defs to Instances
  const deck: CI[] = deckDefs.map((def, i) => ({
    instanceId: `${id}_card_${i}_${def.id}_${Math.floor(Math.random()*10000)}`,
    defId: def.id,
    charges: def.maxCharges 
  }));

  // Extract Size Card and Auto-Play it
  const sizeCardIndex = deck.findIndex(c => CARDS[c.defId].type === CType.Size);
  const sizeCard = deck.splice(sizeCardIndex, 1)[0];
  const formation = [sizeCard];

  // Initial Stats
  const hp = size === 'Small' ? 10 : size === 'Medium' ? 15 : 20;
  const baseStamina = size === 'Small' ? 4 : size === 'Medium' ? 3 : 2;
  
  // Handle Strong Build passive immediately for stats
  let finalHp = hp;
  
  const hand: CI[] = [];
  const remainingDeck: CI[] = [];

  const physicals = deck.filter(c => CARDS[c.defId].type === CType.Physical);
  const abilities = deck.filter(c => CARDS[c.defId].type === CType.Ability || CARDS[c.defId].type === CType.Special);
  
  // Start Game: 3 Physicals, 3 Abilities/Special in Hand
  for(let i=0; i<3; i++) {
    if(physicals.length > 0) hand.push(physicals.shift()!);
  }
  for(let i=0; i<3; i++) {
    if(abilities.length > 0) hand.push(abilities.shift()!);
  }

  remainingDeck.push(...physicals, ...abilities);
  
  // Shuffle Deck
  for (let i = remainingDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remainingDeck[i], remainingDeck[j]] = [remainingDeck[j], remainingDeck[i]];
  }

  return {
    id, name, hp: finalHp, maxHp: finalHp, stamina: baseStamina, maxStamina: baseStamina,
    creatureType: cType, size,
    hand, deck: remainingDeck, discard: [], formation,
    statuses: [],
    cardsPlayedThisTurn: 0, 
    extraCardPlays: 0,
    hasActedThisTurn: false,
    hasAttackedThisTurn: false,
    hasUsedAbilityThisTurn: false,
    guaranteedHeads: false,
    usedAbilitiesThisTurn: [],
    abilitiesUsedThisTurn: 0
  };
};

export const gameReducer = (state: GS, action: GA): GS => {
  const newState = JSON.parse(JSON.stringify(state)) as GS;

  const notify = (msg: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
    newState.notifications.push({
      id: Math.random().toString(36).substr(2, 9),
      message: msg,
      type
    });
  };

  const log = (msg: string) => {
    newState.log.unshift(`[T${newState.turn}] ${msg}`);
  };

  // Helper to check game over state
  const checkWin = () => {
    if (newState.winner) return; // Already ended
    
    const players = Object.values(newState.players);
    // Check if anyone is dead
    const deadPlayers = players.filter(p => p.hp <= 0);
    
    if (deadPlayers.length > 0) {
       const opponentId = Object.keys(newState.players).find(id => id !== newState.currentPlayer);
       const currentPlayer = newState.players[newState.currentPlayer];
       const opponent = opponentId ? newState.players[opponentId] : null;

       if (opponent && opponent.hp <= 0) {
           newState.winner = currentPlayer.id;
           log(`GAME OVER! ${currentPlayer.name} WINS!`);
       } else if (currentPlayer.hp <= 0) {
           if (opponent) {
               newState.winner = opponent.id;
               log(`GAME OVER! ${opponent.name} WINS!`);
           }
       }
       
       if (newState.winner) {
           newState.phase = 'end';
       }
    }
  };

  // Helper to prevent status stacking
  const addStatus = (player: PS, newStatus: StatusEffect) => {
      const existing = player.statuses.find(s => s.type === newStatus.type && s.sourceId === newStatus.sourceId);
      if (existing) {
          if (newStatus.duration !== undefined) {
              existing.duration = newStatus.duration;
          } else if (existing.duration !== undefined) {
              delete existing.duration;
          }
      } else {
          player.statuses.push(newStatus);
      }
  };

  const performCoinFlip = (reason: string, rngVal: number, flipperId?: string): boolean => {
     let isHeads = rngVal > 0.5;
     
     if (flipperId) {
         const flipper = newState.players[flipperId];
         if (flipper && flipper.guaranteedHeads) {
             isHeads = true;
             flipper.guaranteedHeads = false;
             log(`${flipper.name} uses guaranteed HEADS for ${reason}!`);
         }
     }

     newState.activeCoinFlip = {
        id: `flip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        result: isHeads ? 'Heads' : 'Tails',
        reason,
        timestamp: Date.now()
     };
     log(`Coin Flip (${reason}): ${isHeads ? 'HEADS' : 'TAILS'}`);
     return isHeads;
  };

  // Helper to apply damage and side effects
  const resolveAttackDamage = (attacker: PS, target: PS, def: CardDef, rng: number[]) => {
      let rngIndex = 10; 
      let damage = 0;
      
      if (def.id === CID.Bite) damage = 3;
      else if (def.id === CID.ClawAttack) damage = 2;
      else if (def.id === CID.GraspingTalons) damage = 1;
      else if (def.id === CID.VenomousFangs) damage = 1;
      else if (def.id === CID.DiveBomb) {
          damage = 2;
          if (attacker.statuses.some(s => s.type === 'Flying')) damage = 4;
      }
      else if (def.id === CID.StrongTail) damage = 2;
      else if (def.id === CID.BigClaws) damage = 3;
      else if (def.id === CID.PiercingBeak) damage = 2;
      else if (def.id === CID.CrushingWeight) damage = 4;
      else if (def.id === CID.DeathRoll) damage = 4;
      else if (def.id === CID.StrongJaw) damage = 3; 
      else if (def.id === CID.LargeHindLegs && (attacker.size === 'Medium' || attacker.size === 'Big')) damage = 2;
      else if (def.id === CID.Leech) damage = 1;

      if (attacker.formation.some(c => c.defId === CID.StrongBuild)) damage += 1;
      if (newState.habitat === H.Water && attacker.formation.some(c => c.defId === CID.SwimsWell)) damage += 1;
      if (newState.habitat === H.Water && attacker.formation.some(c => c.defId === CID.SwimFast)) damage += 2; 
      if (newState.habitat === H.Water && attacker.creatureType === CT.Amphibian) damage += 1;
      
      if (attacker.statuses.some(s => s.type === 'DamageBuff')) {
         damage += 1;
      }

      let defense = 0;
      if (target.formation.some(c => c.defId === CID.ArmoredScales)) defense += 1;
      if (target.formation.some(c => c.defId === CID.ThickFur)) defense += 1;
      if (target.formation.some(c => c.defId === CID.Fur) && performCoinFlip('Fur Defense', getRNG(rng, rngIndex++), target.id)) defense += 1;
      if (target.formation.some(c => c.defId === CID.ArmoredExoskeleton)) {
         if (!performCoinFlip('Exoskeleton', getRNG(rng, rngIndex++), attacker.id)) defense += 2;
      }

      if (def.id === CID.DiveBomb) defense = 0; 

      if (target.formation.some(c => c.defId === CID.SpikyBody)) {
         const attackerAgile = attacker.formation.some(c => c.defId === CID.SmallSize || c.defId === CID.Agile);
         if (!attackerAgile) {
            attacker.hp -= 1;
            log(`${attacker.name} took 1 dmg (Spiky Body).`);
         } else {
            if (performCoinFlip('Spiky Body (Agile)', getRNG(rng, rngIndex++), attacker.id)) {
                attacker.hp -= 1;
            } else {
                damage += 1;
            }
         }
      }

      if (target.formation.some(c => c.defId === CID.BarbedQuills)) {
         const hasArmor = attacker.formation.some(c => c.defId === CID.ArmoredExoskeleton || c.defId === CID.ArmoredScales);
         const isGrappled = target.statuses.some(s => s.type === 'Grappled');
         
         if (!hasArmor) {
            const recoilDamage = isGrappled ? 2 : 1;
            attacker.hp -= recoilDamage;
            log(`${attacker.name} took ${recoilDamage} recoil damage (Barbed Quills).`);
            notify(`${attacker.name} pricked by Quills!`, 'warning');
         } else {
            log(`${attacker.name}'s armor protected against Barbed Quills.`);
         }
      }
      
      if (target.formation.some(c => c.defId === CID.PoisonSkin)) {
          addStatus(attacker, { type: 'Poisoned' });
          log(`${attacker.name} was Poisoned by Poison Skin.`);
          notify("Poisoned by skin!", 'warning');
      }
      
      let finalDmg = Math.max(0, damage - defense);
      target.hp -= finalDmg;
      log(`${attacker.name} attacked for ${finalDmg} dmg.`);
      notify(`Dealt ${finalDmg} damage!`, 'success');

      if (def.id === CID.VenomousFangs) {
         addStatus(target, { type: 'Poisoned' });
      }

      if (def.id === CID.Leech) {
          const poisonFlip = performCoinFlip('Leech Poison', getRNG(rng, rngIndex++), target.id);
          if (!poisonFlip) {
              addStatus(target, { type: 'Poisoned' });
              log("Leech applied Poison!");
          }

          const hasProtection = target.formation.some(c => 
              c.defId === CID.ArmoredScales || 
              c.defId === CID.ArmoredExoskeleton || 
              c.defId === CID.ThickFur
          );

          if (!hasProtection) {
              const existing = target.statuses.find(s => s.type === 'Leeched' && s.sourceId === attacker.id);
              if (!existing) {
                  addStatus(target, { type: 'Leeched', sourceId: attacker.id });
                  log(`${target.name} is Leeched!`);
                  notify("Leeched!", 'success');
              }
          } else {
              log(`${target.name}'s armor prevented Leeching.`);
              notify("Leech blocked by armor/fur.", 'warning');
          }
      }
      
      if (def.id === CID.GraspingTalons && performCoinFlip('Grapple Chance', getRNG(rng, rngIndex++), attacker.id)) {
          addStatus(target, { type: 'Grappled' });
      }
      if (def.id === CID.StrongJaw) addStatus(target, { type: 'Grappled' });
      
      if (def.id === CID.DeathRoll && performCoinFlip('Death Roll', getRNG(rng, rngIndex++), attacker.id)) {
          addStatus(target, { type: 'Grappled' });
      }

      checkWin();
  };

  // Helper function to apply card effect logic (extracted from USE_ACTION)
  const resolveCardEffect = (p: PS, target: PS, def: CardDef, rng: number[], targetHandCardId?: string) => {
        let rngIndex = 1;
        
        // PHYSICAL ATTACK LOGIC
        if (def.type === CType.Physical) {
            if (def.id === CID.Camouflage) {
                 if (performCoinFlip('Camouflage', getRNG(rng, rngIndex++), p.id)) {
                     addStatus(p, { type: 'Camouflaged', duration: 100 });
                     log(`${p.name} is Camouflaged.`);
                     notify("Camouflaged!", 'success');
                 } else {
                     notify("Camouflage failed.", 'warning');
                 }
                 return;
            }
            if (def.id === CID.AmbushAttack) {
                 if (performCoinFlip('Ambush Setup', getRNG(rng, rngIndex++), p.id)) {
                      addStatus(p, { type: 'Accurate', duration: 1 }); 
                      log(`${p.name} prepares Ambush (Cannot be evaded).`);
                      notify("Ambush Ready!", 'success');
                 }
                 return;
            }
            if (def.id === CID.SwimFast) {
                 if (newState.habitat === H.Water) {
                    const isImmobilized = target.statuses.some(s => s.type === 'Grappled' || s.type === 'Stuck');
                    if (!isImmobilized) {
                        addStatus(p, { type: 'Chasing', duration: 1 });
                        log(`${p.name} is Swimming Fast (Chasing).`);
                        notify("Chasing!", 'success');
                    } else {
                        log(`${p.name} swims fast (Target already immobilized).`);
                        notify("Target already stuck/grappled.", 'info');
                    }
                 } else {
                    notify("Swim Fast requires Water!", 'warning');
                    p.stamina += def.staminaCost; 
                    p.hasActedThisTurn = false;
                 }
                 return;
            }

            if (def.id === CID.BigClaws) {
                newState.pendingChoice = {
                    id: Math.random().toString(),
                    playerId: p.id,
                    cardId: def.id,
                    options: ['Attack', 'Dig', 'Climb'],
                    targetPlayerId: target.id
                };
                return;
            }

            const targetIsClimbing = target.statuses.some(s => s.type === 'Climbing');
            const attackerIsFlying = p.statuses.some(s => s.type === 'Flying') || def.id === CID.DiveBomb;
            
            if (targetIsClimbing && !attackerIsFlying) {
                log(`${p.name}'s attack missed because ${target.name} is Climbing!`);
                notify("Miss! Target is Climbing.", 'warning');
                return;
            }

            const isAccurate = p.statuses.some(s => s.type === 'Accurate') || p.statuses.some(s => s.type === 'Chasing');
            const targetHidden = target.statuses.some(s => s.type === 'Hidden');
            const targetCamouflaged = target.statuses.some(s => s.type === 'Camouflaged');
            const targetFlying = target.statuses.some(s => s.type === 'Flying');
            const targetEvading = target.statuses.some(s => s.type === 'Evading');
            
            if (!isAccurate) {
                if (targetHidden) {
                    log(`${p.name} missed (Target Hidden).`);
                    notify("Miss! Target Hidden.", 'warning');
                    return;
                }
                if (targetEvading) {
                     log(`${p.name} missed (Target Evaded).`);
                     notify("Miss! Target Evaded.", 'warning');
                     target.statuses = target.statuses.filter(s => s.type !== 'Evading');
                     return;
                }
                if (targetCamouflaged && !performCoinFlip('Camouflage Miss Chance', getRNG(rng, rngIndex++), p.id)) {
                    log(`${p.name} missed (Camouflage).`);
                    notify("Miss! Camouflage.", 'warning');
                    return;
                }
                if (targetFlying && !performCoinFlip('Flying Miss Chance', getRNG(rng, rngIndex++), p.id)) {
                    log(`${p.name} missed (Target Flying).`);
                    notify("Miss! Target Flying.", 'warning');
                    return;
                }
                if (newState.habitat === H.Water && target.formation.some(c => c.defId === CID.CamouflageWater)) {
                    if (!performCoinFlip('Water Camo', getRNG(rng, rngIndex++), p.id)) {
                        log(`${p.name} missed (Water Camo).`);
                        return;
                    }
                }
                if (target.statuses.some(s => s.type === 'Intimidating')) {
                     if (!performCoinFlip('Intimidating Stance', getRNG(rng, rngIndex++), p.id)) {
                         log(`${p.name} was intimidated and missed.`);
                         notify("Intimidated! Miss.", 'warning');
                         return;
                     }
                }
            }

            const canTargetEvade = target.formation.some(c => c.defId === CID.Agile) && target.stamina >= 1 && !target.statuses.some(s => s.type === 'Grappled' || s.type === 'CannotEvade' || s.type === 'Stuck');
            
            if (canTargetEvade && !isAccurate) {
                 newState.pendingReaction = {
                     type: 'AGILE_EVADE',
                     attackerId: p.id,
                     targetId: target.id,
                     attackCardId: def.id
                 };
                 log(`${target.name} can Evade! Waiting for reaction...`);
                 return;
            }
            
            resolveAttackDamage(p, target, def, rng);

        } else {
            // ABILITY LOGIC
            if (def.id === CID.Mimicry) {
                 // Check stored lastAction
                 if (newState.lastAction && newState.lastAction.playerId !== p.id) {
                     const copiedCardDef = CARDS[newState.lastAction.cardId];
                     if (copiedCardDef && (copiedCardDef.type === CType.Physical || copiedCardDef.type === CType.Ability)) {
                         log(`${p.name} mimics ${target.name}'s ${copiedCardDef.name}!`);
                         
                         // IMPORTANT: Execute the copied action logic
                         // Recursively call resolveCardEffect. 
                         // We treat 'p' as the attacker/user, and 'target' as target (if applicable)
                         // Note: rng reuse might be tricky, we ideally shift the index or use fresh rng. 
                         // Since we passed rng array, we'll just use a slice or offset.
                         // Actually, for simplicity, we reuse the current RNG stream but offset it
                         resolveCardEffect(p, target, copiedCardDef, rng.slice(5));
                         
                         // Update lastAction to the copied action so that subsequent mimicries chain correctly
                         newState.lastAction = {
                            playerId: p.id,
                            cardId: copiedCardDef.id
                         };
                         return; // Return early so we don't overwrite lastAction with Mimicry itself below
                     } else {
                         notify("Nothing to mimic.", 'warning');
                     }
                 } else {
                     notify("No move to mimic.", 'warning');
                 }
                 return;
            }

            if (def.id === CID.ShortBurst) { 
                p.stamina += 1; 
                log(`${p.name} used Short Burst (+1 Stamina).`);
                notify("+1 Stamina (Short Burst)", 'success'); 
            }
            if (def.id === CID.AdrenalineRush) { 
                p.stamina += 1; 
                addStatus(p, { type: 'StaminaDebt' }); 
                log(`${p.name} used Adrenaline Rush (+1 Stamina now, -1 Stamina next turn).`);
                notify("Adrenaline Rush: +1 Stamina!", 'success'); 
            }
            if (def.id === CID.Confuse) {
                if (target.formation.some(c => c.defId === CID.Intelligence)) {
                    log(`${target.name} is immune to Confusion.`);
                    notify("Immune!", 'info');
                } else if (performCoinFlip('Confuse', getRNG(rng, rngIndex++), p.id)) {
                    addStatus(target, { type: 'Confused', duration: 1 });
                    log(`${target.name} is Confused!`);
                } else {
                    notify("Confuse failed.", 'warning');
                }
            }
            if (def.id === CID.Dig) {
                addStatus(p, { type: 'Hidden', duration: 1 });
                log(`${p.name} used Dig.`);
            }
            if (def.id === CID.Freeze) {
                 if (performCoinFlip('Freeze', getRNG(rng, rngIndex++), p.id)) {
                     addStatus(p, { type: 'Hidden', duration: 1 });
                     log(`${p.name} froze and is Hidden.`);
                 }
            }
            if (def.id === CID.Flight) {
                addStatus(p, { type: 'Flying', duration: 3 }); 
                log(`${p.name} took flight!`);
            }
            if (def.id === CID.Roar) {
                 if (performCoinFlip('Roar', getRNG(rng, rngIndex++), p.id)) {
                     addStatus(target, { type: 'CannotAttack', duration: 1 });
                     log(`${target.name} is terrified by Roar!`);
                 }
            }
            if (def.id === CID.Hibernate) {
                const wasDamaged = p.hp < p.maxHp;
                if (wasDamaged) {
                    const healAmount = Math.min(2, p.maxHp - p.hp);
                    p.hp = Math.min(p.maxHp, p.hp + 2);
                    p.stamina += 1;
                    log(`${p.name} hibernated: healed ${healAmount} HP and gained +1 Stamina.`);
                    notify("Hibernated: +2 HP & +1 Stamina!", 'success');
                } else {
                    p.stamina += 1;
                    log(`${p.name} hibernated at full HP (+1 Stamina).`);
                    notify("Hibernated at full HP (+1 Stamina)", 'info');
                }
            }
            if (def.id === CID.Regeneration) {
                p.hp = Math.min(p.maxHp, p.hp + 4);
                log(`${p.name} regenerated health.`);
            }
            if (def.id === CID.ToxicSpit) {
                const flip = performCoinFlip('Toxic Spit', getRNG(rng, rngIndex++), p.id);
                if (flip) addStatus(target, { type: 'Poisoned' });
                else addStatus(target, { type: 'Stuck', duration: 1 });
            }
            if (def.id === CID.Focus) {
                p.statuses = p.statuses.filter(s => s.type !== 'Grappled' && s.type !== 'Stuck');
                p.guaranteedHeads = true;
                log(`${p.name} Focused! Breakout + Guaranteed Heads.`);
            }
            if (def.id === CID.FocusPlus) {
                p.statuses = p.statuses.filter(s => s.type !== 'Grappled' && s.type !== 'Stuck');
                p.guaranteedHeads = true;
                addStatus(p, { type: 'DamageBuff', duration: 1 });
                log(`${p.name} Focused+! Breakout + Dmg + Guaranteed Heads.`);
            }
            if (def.id === CID.Rage) {
                p.statuses = p.statuses.filter(s => s.type !== 'Grappled' && s.type !== 'Stuck');
                addStatus(p, { type: 'DamageBuff', duration: 1 });
                log(`${p.name} Enraged!`);
            }
            if (def.id === CID.StickyTongue) {
                if (performCoinFlip('Sticky Tongue', getRNG(rng, rngIndex++), p.id)) {
                    addStatus(target, { type: 'Stuck', duration: 1 });
                }
            }
            if (def.id === CID.ShedSkin) {
                p.statuses = p.statuses.filter(s => s.type === 'DamageBuff' || s.type === 'Hidden' || s.type === 'Flying'); 
                log(`${p.name} Shed Skin (Cured Statuses).`);
            }
            if (def.id === CID.TerritorialDisplay) {
                if (performCoinFlip('Display', getRNG(rng, rngIndex++), p.id)) {
                    target.hand = []; 
                    log(`${target.name} fled and dropped their hand!`);
                    notify("Opponent Hand Discarded!", 'success');
                }
            }
            if (def.id === CID.EnhancedSmell) {
                target.statuses = target.statuses.filter(s => s.type !== 'Hidden' && s.type !== 'Camouflaged');
                const isImmobilized = target.statuses.some(s => s.type === 'Grappled' || s.type === 'Stuck');
                if (!isImmobilized) {
                    addStatus(p, { type: 'Chasing', duration: 1 });
                    log(`${p.name} sniffed out the opponent!`);
                } else {
                     log(`${p.name} sniffed out the opponent.`);
                }
            }
            if (def.id === CID.ExhaustingRoar) {
                if (performCoinFlip('Exhaust Roar', getRNG(rng, rngIndex++), p.id)) {
                    addStatus(target, { type: 'StaminaDebt' });
                    target.stamina = Math.max(0, target.stamina - 1);
                    log(`${target.name} lost stamina from Roar.`);
                }
            }
            if (def.id === CID.Agile) {
                addStatus(p, { type: 'Accurate', duration: 1 });
                log(`${p.name} is moving with Agility (Accurate).`);
            }
            if (def.id === CID.Copycat && targetHandCardId) {
                 const targetCardIdx = target.hand.findIndex(c => c.instanceId === targetHandCardId);
                 if (targetCardIdx !== -1) {
                     const stolen = target.hand.splice(targetCardIdx, 1)[0];
                     p.hand.push(stolen);
                     log(`${p.name} copied/stole ${CARDS[stolen.defId].name}!`);
                     notify("Card Stolen!", 'success');
                 }
            }
            if (def.id === CID.StandOnHindLegs) {
                addStatus(p, { type: 'Intimidating', duration: 1 });
                log(`${p.name} stands on hind legs (Intimidating).`);
                notify("Intimidating Stance!", 'success');
            }
        }
  }

  switch (action.type) {
    case 'INIT_GAME':
      Object.values(action.payload.players).forEach(p => {
        if (p.formation.some(c => c.defId === CID.StrongBuild)) {
          p.maxHp += 2; p.hp += 2;
        }
        if (action.payload.habitat === H.Desert && (p.creatureType === CT.Reptile || p.creatureType === CT.Mammal)) {
           p.maxHp += 2; p.hp += 2;
        }
        if (action.payload.habitat === H.Water && p.creatureType === CT.Amphibian) {
           p.maxHp += 1; p.hp += 1;
        }
      });
      return action.payload;
      
    case 'UPDATE_STATE':
      return action.payload;

    case 'DISMISS_NOTIFICATION':
      newState.notifications = newState.notifications.filter(n => n.id !== action.id);
      return newState;

    case 'ACKNOWLEDGE_COIN_FLIP':
      newState.activeCoinFlip = null;
      return newState;

    case 'END_TURN': {
      const player = newState.players[action.playerId];
      const opponentId = Object.keys(newState.players).find(id => id !== action.playerId)!;
      
      player.guaranteedHeads = false; 
      player.statuses = player.statuses.filter(s => s.type !== 'DamageBuff'); 
      player.usedAbilitiesThisTurn = [];
      player.abilitiesUsedThisTurn = 0;
      player.formation.forEach(c => { c.usedThisTurn = false; }); 
      
      if (player.statuses.some(s => s.type === 'Stuck')) {
        log(`${player.name} is no longer Stuck.`);
        player.statuses = player.statuses.filter(s => s.type !== 'Stuck');
      }

      newState.currentPlayer = opponentId;
      newState.turn += 1;
      newState.phase = 'start';
      newState.activeCoinFlip = null; 
      newState.pendingReaction = null;
      newState.pendingChoice = null;

      const nextPlayer = newState.players[opponentId]; 
      const previousPlayer = player; 

      let rngIndex = 0;
      
      if (nextPlayer.statuses.some(s => s.type === 'Confused')) {
           const flip = performCoinFlip('Confusion Check', getRNG(action.rng, rngIndex++), nextPlayer.id);
           if (flip) {
              notify(`${nextPlayer.name} snapped out of confusion!`, 'success');
              nextPlayer.statuses = nextPlayer.statuses.filter(s => s.type !== 'Confused');
           } else {
              notify(`${nextPlayer.name} is confused and cannot act!`, 'error');
           }
      }

      // Refresh stamina at start of turn to full max stamina (Small: 4, Medium: 3, Big: 2)
      nextPlayer.stamina = Math.max(nextPlayer.stamina, nextPlayer.maxStamina);

      if (nextPlayer.statuses.some(s => s.type === 'StaminaDebt')) {
          nextPlayer.stamina = Math.max(0, nextPlayer.stamina - 1);
          log(`${nextPlayer.name} lost 1 Stamina from Stamina debt.`);
          notify(`${nextPlayer.name} has -1 Stamina (Debt)`, 'warning');
          nextPlayer.statuses = nextPlayer.statuses.filter(s => s.type !== 'StaminaDebt');
      }

      if (nextPlayer.statuses.some(s => s.type === 'Poisoned')) {
          nextPlayer.hp -= 1;
          log(`${nextPlayer.name} took 1 poison damage.`);
          notify(`${nextPlayer.name} took Poison damage`, 'warning');
      }

      if (nextPlayer.statuses.some(s => s.type === 'Leeched')) {
          nextPlayer.hp -= 1;
          log(`${nextPlayer.name} took 1 damage from Leech.`);
          notify(`${nextPlayer.name} drained by Leech`, 'warning');
      }

      const leechOnOpponent = previousPlayer.statuses.find(s => s.type === 'Leeched' && s.sourceId === nextPlayer.id);
      if (leechOnOpponent) {
          if (nextPlayer.hp < nextPlayer.maxHp) {
              nextPlayer.hp += 1;
              log(`${nextPlayer.name} healed 1 HP from Leeching.`);
              notify("Healed from Leech!", 'success');
          }
      }

      checkWin();

      nextPlayer.statuses = nextPlayer.statuses.filter(s => {
        if (s.duration !== undefined) {
          s.duration -= 1;
          return s.duration > 0;
        }
        return true;
      });

      nextPlayer.cardsPlayedThisTurn = 0;
      nextPlayer.extraCardPlays = 0;
      previousPlayer.extraCardPlays = 0;
      nextPlayer.hasActedThisTurn = false;
      nextPlayer.hasAttackedThisTurn = false;
      nextPlayer.hasUsedAbilityThisTurn = false;
      nextPlayer.usedAbilitiesThisTurn = [];
      nextPlayer.abilitiesUsedThisTurn = 0;
      nextPlayer.formation.forEach(c => { c.usedThisTurn = false; });

      if (newState.habitat === H.Water && nextPlayer.formation.some(c => c.defId === CID.Amphibious)) {
        nextPlayer.hp = Math.min(nextPlayer.maxHp, nextPlayer.hp + 1);
        log(`${nextPlayer.name} regenerates 1 HP (Amphibious).`);
      }

      if (nextPlayer.deck.length === 0) {
        if (nextPlayer.discard.length > 0) {
          nextPlayer.deck = [...nextPlayer.discard];
          nextPlayer.discard = [];
          for (let i = nextPlayer.deck.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [nextPlayer.deck[i], nextPlayer.deck[j]] = [nextPlayer.deck[j], nextPlayer.deck[i]];
          }
          log(`${nextPlayer.name} reshuffled their discard pile into their deck.`);
        } else {
          // If discard is also empty, re-seed deck so player can always draw cards
          const sourceCardIds = nextPlayer.customDeckCardIds || (Object.keys(CARDS) as CID[]);
          const availablePool = sourceCardIds.filter(id => {
              const def = CARDS[id];
              return def && def.type !== CType.Size && isCardCompatible(nextPlayer, def);
          });
          const pool = availablePool.length > 0 ? availablePool : [CID.Bite, CID.Claw, CID.Strike, CID.Evolve];
          for (let i = 0; i < 6; i++) {
              const defId = pool[Math.floor(Math.random() * pool.length)];
              nextPlayer.deck.push({
                  instanceId: `${nextPlayer.id}_reseed_${Date.now()}_${i}`,
                  defId,
                  charges: CARDS[defId]?.maxCharges
              });
          }
          log(`${nextPlayer.name}'s deck replenished with new cards.`);
        }
      }

      if (nextPlayer.deck.length > 0) {
        // Preferred draw: card not in hand and not in formation
        let cardIndex = nextPlayer.deck.findIndex(c => 
            !nextPlayer.hand.some(h => h.defId === c.defId) && 
            !nextPlayer.formation.some(f => f.defId === c.defId)
        );

        if (cardIndex === -1) {
            // Next preference: card not currently in hand
            cardIndex = nextPlayer.deck.findIndex(c => !nextPlayer.hand.some(h => h.defId === c.defId));
        }

        if (cardIndex === -1 && nextPlayer.deck.length > 0) {
            cardIndex = 0;
        }

        if (cardIndex !== -1) {
            const drawn = nextPlayer.deck.splice(cardIndex, 1)[0];
            const def = CARDS[drawn.defId];
            
            // ALWAYS put drawn card into player hand!
            nextPlayer.hand.push(drawn);
            log(`${nextPlayer.name} drew ${def.name}.`);
            notify(`${nextPlayer.name === 'You' || nextPlayer.id === 'local-player' ? 'You' : nextPlayer.name} drew ${def.name}`, 'info');
        }
      }

      return newState;
    }

    case 'PLAY_EVOLVE_CARD': {
       const p = newState.players[action.playerId];
       if (p.stamina < 2) {
         notify("Need 2 Stamina to Evolve.", 'error');
         return state;
       }
       
       const evolveCardIdx = p.hand.findIndex(c => c.instanceId === action.evolveInstanceId || CARDS[c.defId].id === CID.Evolve);
       if (evolveCardIdx !== -1) {
           const [evolveCard] = p.hand.splice(evolveCardIdx, 1);
           p.discard.push(evolveCard);
       }

       p.stamina -= 2;
       p.extraCardPlays = (p.extraCardPlays || 0) + 1;
       log(`${p.name} played Evolve! Can play an extra card this turn.`);
       notify("Evolve: Can play an extra card this turn!", 'success');
       return newState;
    }

    case 'PLAY_APEX_EVOLUTION': {
        const p = newState.players[action.playerId];
        
        if (p.stamina < 2) { notify("Need 2 Stamina.", 'error'); return state; }
        
        const apexIdx = p.hand.findIndex(c => c.instanceId === action.apexCardInstanceId);
        if (apexIdx === -1) return state;

        const targetIdx = p.formation.findIndex(c => c.instanceId === action.targetFormationInstanceId);
        if (targetIdx === -1) { notify("Invalid formation target.", 'error'); return state; }
        
        const targetCard = p.formation[targetIdx];
        const targetDef = CARDS[targetCard.defId];

        const allCards = Object.values(CARDS);
        const upgradeDef = allCards.find(c => c.isUpgrade && c.upgradeTarget?.includes(targetDef.id));

        if (!upgradeDef) {
            notify("That card cannot be upgraded.", 'error');
            return state;
        }

        p.stamina -= 2;
        p.hand.splice(apexIdx, 1);
        
        p.formation[targetIdx] = {
            ...targetCard,
            defId: upgradeDef.id,
            charges: upgradeDef.maxCharges
        };

        log(`${p.name} used Apex Evolution on ${targetDef.name}! It is now ${upgradeDef.name}.`);
        notify(`Apex Evolution: ${upgradeDef.name}!`, 'success');
        
        return newState;
    }

    case 'PLAY_CARD': {
      const p = newState.players[action.playerId];
      const cardIdx = p.hand.findIndex(c => c.instanceId === action.cardInstanceId);
      if (cardIdx === -1) return state;
      const card = p.hand[cardIdx];
      const def = CARDS[card.defId];

      if (!isCardCompatible(p, def)) {
          notify(`Cannot play ${def.name}: Incompatible Creature Type.`, 'error');
          return state;
      }

      if (def.id === CID.Evolve) {
          if (p.stamina < 2) {
             notify("Need 2 Stamina to play Evolve.", 'error');
             return state;
          }
          p.stamina -= 2;
          p.hand.splice(cardIdx, 1);
          p.discard.push(card);
          p.extraCardPlays = (p.extraCardPlays || 0) + 1;
          log(`${p.name} played Evolve! Can play an extra card this turn.`);
          notify("Evolve: Can play an extra card this turn!", 'success');
          return newState;
      }

      if (def.isUpgrade) {
         const maxAllowed = 1 + (p.extraCardPlays || 0);
         if (p.cardsPlayedThisTurn >= maxAllowed) {
            notify(`Already played ${p.cardsPlayedThisTurn} card${p.cardsPlayedThisTurn > 1 ? 's' : ''} this turn! Play Evolve to play an extra card.`, 'warning');
            return state;
         }

         let targetIndex = -1;
         if (action.targetInstanceId) {
             targetIndex = p.formation.findIndex(c => c.instanceId === action.targetInstanceId);
         } else {
             // AUTO-TARGET: Find required base card in formation if not explicitly targeted
             targetIndex = p.formation.findIndex(c => def.upgradeTarget?.includes(c.defId));
         }

         if (targetIndex === -1) {
            notify("Select a valid target card in formation to upgrade.", 'error');
            return state;
         }
         
         const target = p.formation[targetIndex];
         if (!def.upgradeTarget?.includes(target.defId)) {
             notify(`Cannot upgrade ${CARDS[target.defId].name}.`, 'error');
             return state;
         }

         p.hand.splice(cardIdx, 1);
         p.formation[targetIndex] = {
            ...target,
            defId: card.defId, 
            charges: def.maxCharges 
         };
         
         log(`${p.name} upgraded ${CARDS[target.defId].name} to ${def.name}.`);
         notify(`Upgraded to ${def.name}`, 'success');
         p.cardsPlayedThisTurn++;
         return newState;
      }

      if (def.id === CID.AdrenalineRush) {
          p.hand.splice(cardIdx, 1);
          p.discard.push(card);
          p.stamina += 1;
          addStatus(p, { type: 'StaminaDebt' });
          if (!p.usedAbilitiesThisTurn) p.usedAbilitiesThisTurn = [];
          p.usedAbilitiesThisTurn.push(card.instanceId);
          p.usedAbilitiesThisTurn.push(def.id);
          p.abilitiesUsedThisTurn = (p.abilitiesUsedThisTurn || 0) + 1;
          log(`${p.name} used Adrenaline Rush from hand (+1 Stamina now, -1 Stamina next turn).`);
          notify("Adrenaline Rush: +1 Stamina!", 'success');
          return newState;
      }
      if (def.id === CID.ShortBurst) {
          p.hand.splice(cardIdx, 1);
          p.discard.push(card);
          p.stamina += 1;
          if (!p.usedAbilitiesThisTurn) p.usedAbilitiesThisTurn = [];
          p.usedAbilitiesThisTurn.push(card.instanceId);
          p.usedAbilitiesThisTurn.push(def.id);
          p.abilitiesUsedThisTurn = (p.abilitiesUsedThisTurn || 0) + 1;
          log(`${p.name} used Short Burst from hand (+1 Stamina).`);
          notify("Short Burst: +1 Stamina!", 'success');
          return newState;
      }

      const maxCardsAllowed = 1 + (p.extraCardPlays || 0);
      if (p.cardsPlayedThisTurn >= maxCardsAllowed) {
        notify(`Already played ${p.cardsPlayedThisTurn} card${p.cardsPlayedThisTurn > 1 ? 's' : ''} this turn! Play Evolve to play an extra card.`, 'warning');
        return state;
      }

      if (p.formation.some(c => c.defId === def.id)) {
         notify(`You already have ${def.name} in play!`, 'error');
         return state;
      }

      if (def.id === CID.CrushingWeight && p.size !== 'Big') {
         notify("Only Big creatures can use Crushing Weight!", 'error');
         return state;
      }

      p.hand.splice(cardIdx, 1);
      p.formation.push(card);
      p.cardsPlayedThisTurn++;
      
      if (def.id === CID.StrongBuild) { p.hp += 2; p.maxHp += 2; }
      
      log(`${p.name} played ${def.name}.`);
      notify(`Played ${def.name}`, 'success');
      
      checkWin(); 
      return newState;
    }

    case 'ATTEMPT_GRAPPLE_ESCAPE': {
        const p = newState.players[action.playerId];
        if (!p.statuses.some(s => s.type === 'Grappled')) return state;
        if (p.hasActedThisTurn) return state;

        const flip = performCoinFlip('Grapple Escape', getRNG(action.rng, 0), p.id);
        p.hasActedThisTurn = true;
        if (flip) {
            p.statuses = p.statuses.filter(s => s.type !== 'Grappled');
            log(`${p.name} broke free from Grapple!`);
            notify("Broke free!", 'success');
        } else {
            log(`${p.name} failed to break free.`);
            notify("Failed to break free.", 'warning');
        }
        return newState;
    }

    case 'USE_HABITAT_ACTION': {
       const p = newState.players[action.playerId];
       if (p.hasUsedForestHide) {
         notify("Already used Forest hide.", 'error');
         return state;
       }
       if (newState.habitat !== H.Forest) return state;

       const isHeads = performCoinFlip('Forest Hide', getRNG(action.rng, 0), p.id);
       p.hasUsedForestHide = true;
       
       if (isHeads) {
          addStatus(p, { type: 'Hidden', duration: 100 });
          log(`${p.name} is hiding in the Forest!`);
          notify('You are now Hidden!', 'success');
       } else {
          log(`${p.name} failed to hide.`);
          notify('Failed to hide.', 'warning');
       }
       return newState;
    }

    case 'CLEAR_POISON': {
      const p = newState.players[action.playerId];
      if (!p.statuses.some(s => s.type === 'Poisoned')) return state;
      if (p.hasActedThisTurn) { notify("Already acted", 'error'); return state; }
      if (p.stamina < 1) { notify("Not enough stamina", 'error'); return state; }

      p.stamina -= 1;
      p.hasActedThisTurn = true;
      p.statuses = p.statuses.filter(s => s.type !== 'Poisoned');
      log(`${p.name} cured Poison.`);
      notify("Cured Poison!", 'success');
      return newState;
    }

    case 'CLEAR_LEECH': {
        const p = newState.players[action.playerId];
        if (!p.statuses.some(s => s.type === 'Leeched')) return state;
        if (p.hasActedThisTurn) { notify("Already acted", 'error'); return state; }
        if (p.stamina < 1) { notify("Not enough stamina", 'error'); return state; }
  
        p.stamina -= 1;
        p.hasActedThisTurn = true;
        p.statuses = p.statuses.filter(s => s.type !== 'Leeched');
        log(`${p.name} removed Leech.`);
        notify("Removed Leech!", 'success');
        return newState;
    }

    case 'RESOLVE_CHOICE': {
        const p = newState.players[action.playerId];
        const opponentId = Object.keys(newState.players).find(id => id !== action.playerId)!;
        const opponent = newState.players[opponentId];

        if (!newState.pendingChoice || newState.pendingChoice.playerId !== p.id) return state;
        
        log(`${p.name} chose ${action.choice} for Big Claws!`);
        
        newState.pendingChoice = null;
        p.hasActedThisTurn = true;
        
        if (action.choice === 'Attack') {
             resolveAttackDamage(p, opponent, CARDS[CID.BigClaws], action.rng);
        } else if (action.choice === 'Dig') {
             addStatus(p, { type: 'Hidden', duration: 1 });
             notify("Used Dig (Hidden)", 'success');
        } else if (action.choice === 'Climb') {
             addStatus(p, { type: 'Climbing', duration: 1 });
             notify("Used Climb (Climbing Status)", 'success');
        }

        checkWin();
        return newState;
    }

    case 'RESOLVE_AGILE': {
        if (!newState.pendingReaction) return state;
        const { attackerId, targetId, attackCardId } = newState.pendingReaction;
        const attacker = newState.players[attackerId];
        const target = newState.players[targetId];
        const def = CARDS[attackCardId];

        newState.pendingReaction = null;

        if (action.useAgile && target.stamina >= 1) {
            target.stamina -= 1;
            log(`${target.name} Evaded ${def.name} using Agile!`);
            notify("Evaded!", 'success');
            
            if (target.formation.some(c => c.defId === CID.SwiftReflexes)) {
                target.stamina += 1;
                notify("Swift Reflexes refund (+1 ST)", 'info');
            }
        } else {
            resolveAttackDamage(attacker, target, def, action.rng);
        }
        
        checkWin();
        return newState;
    }

    case 'USE_ACTION': {
        const p = newState.players[action.playerId];
        const target = newState.players[action.targetPlayerId];
        let cardInstance = p.formation.find(c => c.instanceId === action.cardInstanceId);
        let fromHand = false;

        if (!cardInstance) {
            cardInstance = p.hand.find(c => c.instanceId === action.cardInstanceId);
            if (cardInstance) fromHand = true;
        }

        if (!cardInstance) return state;
        
        const def = CARDS[cardInstance.defId];
        const isAbility = def.type === CType.Ability || action.actionType === 'ABILITY' || (def.type === CType.Special && def.id === CID.ApexEvolution);
        const isAttack = !isAbility && (action.actionType === 'ATTACK' || def.type === CType.Physical);

        const isFreeAction = def.id === CID.ShortBurst || def.id === CID.AdrenalineRush || def.id === CID.EnhancedSmell || def.id === CID.Focus || def.id === CID.FocusPlus || def.id === CID.Rage || (def.id === CID.Agile && def.type === CType.Ability);

        // Max 1 Attack per turn rule
        if (isAttack && p.hasAttackedThisTurn) {
            notify("Already attacked this turn! (Max 1 attack per turn)", 'error');
            return state;
        }

        // Max 1 Ability per turn rule (and max 1 use per specific ability)
        if (isAbility) {
            const alreadyUsed = (p.usedAbilitiesThisTurn && (
                p.usedAbilitiesThisTurn.includes(cardInstance.instanceId) ||
                p.usedAbilitiesThisTurn.includes(def.id)
            )) || cardInstance.usedThisTurn;

            if (alreadyUsed) {
                notify(`${def.name} can only be used once per turn!`, 'error');
                return state;
            }

            if (!isFreeAction && p.hasUsedAbilityThisTurn) {
                notify("Already used an ability this turn! (Max 1 ability per turn)", 'error');
                return state;
            }
        }

        // Hibernate rule: gains +1 stamina and not get 2 stamina removed (only if healing)
        const isHibernate = def.id === CID.Hibernate;
        const isHealingHibernate = isHibernate && p.hp < p.maxHp;
        const effectiveStaminaCost = isHealingHibernate ? 0 : def.staminaCost;

        if (p.stamina < effectiveStaminaCost) {
            if (isHibernate && !isHealingHibernate) {
                notify("Need 2 Stamina when already at full HP!", 'error');
            } else {
                notify(`Need ${effectiveStaminaCost} Stamina!`, 'error');
            }
            return state;
        }

        if (p.statuses.some(s => s.type === 'Stuck')) {
            if (def.type === CType.Physical || (def.type === CType.Ability && def.id === CID.Dig)) {
                notify("You are Stuck! Cannot move/attack.", 'error');
                return state;
            }
        }
        if (p.statuses.some(s => s.type === 'CannotAttack') && def.type === CType.Physical) {
            notify("Cannot Attack due to Roar!", 'error');
            return state;
        }
        if (p.statuses.some(s => s.type === 'Grappled')) {
             if (def.id !== CID.Focus && def.id !== CID.FocusPlus && def.id !== CID.Rage && def.type !== CType.Physical) {
                 notify("Grappled! Can only Attack or use Breakout abilities.", 'error');
                 return state;
             }
             if (def.type === CType.Physical) {
                 const flip = performCoinFlip('Grappled Attack', getRNG(action.rng, 0), p.id);
                 if (!flip) {
                     p.stamina -= effectiveStaminaCost;
                     p.hasAttackedThisTurn = true;
                     p.hasActedThisTurn = !!p.hasAttackedThisTurn && !!p.hasUsedAbilityThisTurn;
                     notify("Attack failed due to Grapple.", 'warning');
                     return newState;
                 }
                 p.statuses = p.statuses.filter(s => s.type !== 'Grappled');
                 log(`${p.name} broke free from Grapple!`);
                 notify("Broke free!", 'success');
             }
        }
        
        if (p.statuses.some(s => s.type === 'Confused')) {
            const flip = performCoinFlip('Confusion Action Check', getRNG(action.rng, 0), p.id);
            if (!flip) {
                p.stamina -= effectiveStaminaCost;
                if (isAttack) p.hasAttackedThisTurn = true;
                if (isAbility && !isFreeAction) p.hasUsedAbilityThisTurn = true;
                p.hasActedThisTurn = !!p.hasAttackedThisTurn && !!p.hasUsedAbilityThisTurn;
                log(`${p.name} is confused and hurt themselves!`);
                p.hp -= 1;
                notify("Confusion caused self-harm!", 'error');
                checkWin();
                return newState;
            }
        }

        p.stamina -= effectiveStaminaCost;
        
        if (isAttack) {
            p.hasAttackedThisTurn = true;
        }

        if (isAbility) {
            cardInstance.usedThisTurn = true;
            if (!p.usedAbilitiesThisTurn) p.usedAbilitiesThisTurn = [];
            p.usedAbilitiesThisTurn.push(cardInstance.instanceId);
            p.usedAbilitiesThisTurn.push(def.id);
            p.abilitiesUsedThisTurn = (p.abilitiesUsedThisTurn || 0) + 1;
            if (!isFreeAction) {
                p.hasUsedAbilityThisTurn = true;
            }
        }

        p.hasActedThisTurn = !!p.hasAttackedThisTurn && !!p.hasUsedAbilityThisTurn;

        if (fromHand) {
             const idx = p.hand.findIndex(c => c.instanceId === cardInstance.instanceId);
             if (idx !== -1) {
                 p.hand.splice(idx, 1);
                 p.discard.push(cardInstance);
             }
        } else if (def.abilityStatus === AS.ConsumableImpact) {
             const idx = p.formation.findIndex(c => c.instanceId === cardInstance.instanceId);
             if (idx !== -1) {
                 p.formation.splice(idx, 1);
                 p.discard.push(cardInstance);
             }
        }

        resolveCardEffect(p, target, def, action.rng, action.targetHandCardId);

        // Track Last Action (if not Mimicry itself, unless Mimicry resolved to nothing)
        if (def.id !== CID.Mimicry) {
            newState.lastAction = {
                playerId: p.id,
                cardId: def.id
            };
        }

        return newState;
    }
      
    default:
      return state;
  }
};