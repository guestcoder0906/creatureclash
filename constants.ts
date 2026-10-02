

import { CardDef, CardId, CardType, AbilityStatus, CreatureType, Habitat } from './types';

export const CARDS: Record<string, CardDef> = {
  // --- SIZES ---
  [CardId.SmallSize]: {
    id: CardId.SmallSize, name: "Small Size", type: CardType.Size, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0, description: "HP: 10, Stamina: 4. Agile."
  },
  [CardId.MediumSize]: {
    id: CardId.MediumSize, name: "Medium Size", type: CardType.Size, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0, description: "HP: 15, Stamina: 3. Balanced."
  },
  [CardId.BigSize]: {
    id: CardId.BigSize, name: "Big Size", type: CardType.Size, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0, description: "HP: 20, Stamina: 2. Powerful."
  },

  // --- SPECIAL ---
  [CardId.Evolve]: {
    id: CardId.Evolve, name: "Evolve", type: CardType.Special, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 2,
    description: "Costs 2 Stamina. Play an extra card this turn instead of just 1. Discard Evolve after use."
  },
  [CardId.ApexEvolution]: {
    id: CardId.ApexEvolution, name: "Apex Evolution", type: CardType.Special, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 2,
    description: "Free Action. Immediately upgrade a card in your formation without needing the upgrade card in hand. Discard after use."
  },

  // --- PHYSICAL ---
  [CardId.SpikyBody]: {
    id: CardId.SpikyBody, name: "Spiky Body", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: 'All', staminaCost: 0,
    description: "Attacking creature is damaged 1 unless Agile. If Agile, flip coin: heads = attacker takes 1 damage, tails = attack deals +1 damage."
  },
  [CardId.ArmoredExoskeleton]: {
    id: CardId.ArmoredExoskeleton, name: "Armored Exoskeleton", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: [Habitat.Desert], staminaCost: 0,
    description: "Attacking creature flips coin; tails = attack deals 2 less damage. Prevents Leech."
  },
  [CardId.ClawAttack]: {
    id: CardId.ClawAttack, name: "Claw Attack", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian, CreatureType.Reptile, CreatureType.Mammal], habitats: 'All', staminaCost: 1,
    description: "Deal 2 damage to opponent."
  },
  [CardId.Camouflage]: {
    id: CardId.Camouflage, name: "Camouflage", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0,
    description: "Flip coin. Heads = successfully camouflaged, opponent cannot attack until they flip heads at start of their turn.",
    maxCharges: 2
  },
  [CardId.Whiskers]: {
    id: CardId.Whiskers, name: "Whiskers", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 0,
    description: "Enhances senses; opponent stealth cards fail automatically."
  },
  [CardId.StrongJaw]: {
    id: CardId.StrongJaw, name: "Strong Jaw Grip", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: 'All', staminaCost: 2,
    description: "Upgrade Bite. Deals total 3 damage and grapples opponent, they deal +1 damage while they are grappled.",
    isUpgrade: true, upgradeTarget: [CardId.Bite]
  },
  [CardId.Bite]: {
    id: CardId.Bite, name: "Bite", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Deal 3 damage. Can combine with Strong Jaw Grip."
  },
  [CardId.Fur]: {
    id: CardId.Fur, name: "Fur", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 0,
    description: "Reduces 1 damage from attacks that you flipped heads."
  },
  [CardId.ThickFur]: {
    id: CardId.ThickFur, name: "Thick Fur", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 0,
    description: "Upgrade Fur. Reduces 1 damage from all attacks. Prevents Leech.",
    isUpgrade: true, upgradeTarget: [CardId.Fur]
  },
  [CardId.StandOnHindLegs]: {
    id: CardId.StandOnHindLegs, name: "Stand on Hind Legs", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 1,
    description: "Intimidation (1 Turn). Opponent flips coin before attacking: Tails = Attack Misses."
  },
  [CardId.SwimsWell]: {
    id: CardId.SwimsWell, name: "Swims Well", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Amphibian, CreatureType.Reptile], habitats: [Habitat.Water], staminaCost: 0,
    description: "+1 damage in Water habitat."
  },
  [CardId.StrongBuild]: {
    id: CardId.StrongBuild, name: "Strong Build", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: 'All', staminaCost: 0,
    description: "+2 HP and adds +1 damage to your attacks."
  },
  [CardId.LargeHindLegs]: {
    id: CardId.LargeHindLegs, name: "Large Hind Legs", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Avian, CreatureType.Amphibian], habitats: 'All', staminaCost: 1,
    description: "Kick: 2 damage (Medium/Big). If Small, automatically Evade next attack."
  },
  [CardId.BigClaws]: {
    id: CardId.BigClaws, name: "Big Claws", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: 'All', staminaCost: 1,
    description: "Upgrade Claw Attack. Choose: Deal 3 damage OR Dig (Hide) OR Climb (Evade non-flying).",
    isUpgrade: true, upgradeTarget: [CardId.ClawAttack]
  },
  [CardId.StrongTail]: {
    id: CardId.StrongTail, name: "Strong Tail", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Mammal], habitats: 'All', staminaCost: 1,
    description: "Can strike or swim fast. Deals 2 damage."
  },
  [CardId.ArmoredScales]: {
    id: CardId.ArmoredScales, name: "Armored Scales", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile], habitats: 'All', staminaCost: 0,
    description: "Reduces all damage by 1. Prevents Leech."
  },
  [CardId.DeathRoll]: {
    id: CardId.DeathRoll, name: "Death Roll", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile], habitats: [Habitat.Water], staminaCost: 2,
    description: "Upgrade Bite/Grip/Fangs. Flip coin: Heads = hold prey and deal 4 damage.",
    isUpgrade: true, upgradeTarget: [CardId.Bite, CardId.StrongJaw, CardId.VenomousFangs]
  },
  [CardId.CamouflageWater]: {
    id: CardId.CamouflageWater, name: "Camouflage in Water", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Amphibian], habitats: [Habitat.Water], staminaCost: 0,
    description: "Passive: In Water, attacker flips coin: Tails = Miss (unless Chasing/Accurate)."
  },
  [CardId.SwimFast]: {
    id: CardId.SwimFast, name: "Swim Fast", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Amphibian], habitats: [Habitat.Water], staminaCost: 1,
    description: "Upgrade Swims Well. Passive: +2 Damage in Water. Active (Chase): 1 Stamina. Opponent cannot evade next turn. Counters Water Camouflage.",
    isUpgrade: true, upgradeTarget: [CardId.SwimsWell]
  },
  [CardId.AmbushAttack]: {
    id: CardId.AmbushAttack, name: "Ambush Attack", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Mammal], habitats: [Habitat.Forest], staminaCost: 1,
    description: "Flip coin. Heads = opponent cannot evade."
  },
  [CardId.KeenEyesight]: {
    id: CardId.KeenEyesight, name: "Keen Eyesight", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 0,
    description: "Opponent stealth cards fail automatically"
  },
  [CardId.GraspingTalons]: {
    id: CardId.GraspingTalons, name: "Grasping Talons", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Deal 1 damage. Flip Coin: Heads = Grapple opponent."
  },
  [CardId.PoisonSkin]: {
    id: CardId.PoisonSkin, name: "Poison Skin", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Amphibian, CreatureType.Reptile], habitats: 'All', staminaCost: 0,
    description: "Passive: When attacked, Attacker automatically becomes Poisoned."
  },
  [CardId.DiveBomb]: {
    id: CardId.DiveBomb, name: "Dive Bomb", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 2,
    description: "Deal 2 damage. If Flying, deal 4 damage. Bypasses armor defenses."
  },
  [CardId.PiercingBeak]: {
    id: CardId.PiercingBeak, name: "Piercing Beak", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Deal 2 damage."
  },
  [CardId.BarbedQuills]: {
    id: CardId.BarbedQuills, name: "Barbed Quills", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 0,
    description: "Passive: Deal 1 damage to attacker when hit. If Grappled, deal 2 damage instead."
  },
  [CardId.VenomousFangs]: {
    id: CardId.VenomousFangs, name: "Venomous Fangs", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Mammal], habitats: 'All', staminaCost: 1,
    description: "Deal 1 damage and Poison opponent."
  },
  [CardId.CrushingWeight]: {
    id: CardId.CrushingWeight, name: "Crushing Weight", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 2,
    description: "Big Size Only. Deal 4 damage."
  },
  [CardId.Amphibious]: {
    id: CardId.Amphibious, name: "Amphibious", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Amphibian], habitats: [Habitat.Water], staminaCost: 0,
    description: "Passive: Regenerate 1 HP at end of turn in Water."
  },
  [CardId.Leech]: {
    id: CardId.Leech, name: "Leech", type: CardType.Physical, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Amphibian], habitats: 'All', staminaCost: 1,
    description: "Deal 1 Dmg. Flip Coin (Tails) = Poison. Applies Leeched unless target is Armored/Thick Fur."
  },

  // --- ABILITIES ---
  [CardId.ShortBurst]: {
    id: CardId.ShortBurst, name: "Short Burst", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0,
    description: "Free Action. Gain +1 Stamina this turn. Consumable."
  },
  [CardId.Confuse]: {
    id: CardId.Confuse, name: "Confuse", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 1,
    description: "Flip Coin: Heads = Opponent becomes Confused."
  },
  [CardId.Intelligence]: {
    id: CardId.Intelligence, name: "Intelligence", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Avian], habitats: 'All', staminaCost: 0,
    description: "Passive: Immune to Confusion."
  },
  [CardId.Dig]: {
    id: CardId.Dig, name: "Dig", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Amphibian], habitats: 'All', staminaCost: 1,
    description: "Avoid next attack. 1 Turn."
  },
  [CardId.Freeze]: {
    id: CardId.Freeze, name: "Freeze", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0,
    description: "Flip Coin: Heads = Become Hidden."
  },
  [CardId.Roar]: {
    id: CardId.Roar, name: "Roar", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile], habitats: 'All', staminaCost: 1,
    description: "Flip Coin: Heads = Opponent cannot attack next turn."
  },
  [CardId.Hibernate]: {
    id: CardId.Hibernate, name: "Hibernate", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Amphibian], habitats: 'All', staminaCost: 2,
    description: "If damaged: Heal 2 HP & gain +1 Stamina (costs 0 Stamina). If full HP: Costs 2 Stamina to gain +1 Stamina."
  },
  [CardId.Flight]: {
    id: CardId.Flight, name: "Flight", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Gain Flying status. Harder to hit."
  },
  [CardId.ToxicSpit]: {
    id: CardId.ToxicSpit, name: "Toxic Spit", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Amphibian], habitats: 'All', staminaCost: 1,
    description: "Flip Coin: Heads = Poison, Tails = Stuck."
  },
  [CardId.Regeneration]: {
    id: CardId.Regeneration, name: "Regeneration", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: [CreatureType.Reptile, CreatureType.Amphibian], habitats: 'All', staminaCost: 2,
    description: "Heal 4 HP. Consumable."
  },
  [CardId.Focus]: {
    id: CardId.Focus, name: "Focus", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 1,
    description: "Free Action. Escape Grappled/Stuck. +1 Damage this turn. Next flip guaranteed Heads."
  },
  [CardId.AdrenalineRush]: {
    id: CardId.AdrenalineRush, name: "Adrenaline Rush", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0,
    description: "Free Action. Gain +1 Stamina. Consumable. Lose 1 Stamina next turn."
  },
  [CardId.StickyTongue]: {
    id: CardId.StickyTongue, name: "Sticky Tongue", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Amphibian, CreatureType.Reptile], habitats: 'All', staminaCost: 1,
    description: "Flip Coin: Heads = Opponent Stuck."
  },
  [CardId.ShedSkin]: {
    id: CardId.ShedSkin, name: "Shed Skin", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Reptile, CreatureType.Amphibian], habitats: 'All', staminaCost: 1,
    description: "Remove all negative statuses."
  },
  [CardId.Rage]: {
    id: CardId.Rage, name: "Rage", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 2,
    description: "Free Action. Escape Grappled/Stuck. +1 Damage this turn."
  },
  [CardId.TerritorialDisplay]: {
    id: CardId.TerritorialDisplay, name: "Territorial Display", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: 'All', habitats: 'All', staminaCost: 2,
    description: "Flip Coin: Heads = Opponent discards hand. Consumable."
  },
  [CardId.Mimicry]: {
    id: CardId.Mimicry, name: "Mimicry", type: CardType.Ability, abilityStatus: AbilityStatus.ConsumableImpact,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Consumable. Copy opponent's last action."
  },
  [CardId.ExhaustingRoar]: {
    id: CardId.ExhaustingRoar, name: "Exhausting Roar", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 1,
    description: "Flip Coin: Heads = Opponent loses 1 Stamina."
  },
  [CardId.SwiftReflexes]: {
    id: CardId.SwiftReflexes, name: "Swift Reflexes", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal, CreatureType.Avian], habitats: 'All', staminaCost: 0,
    description: "Passive: Gain +1 Stamina when you Evade."
  },
  [CardId.EnhancedSmell]: {
    id: CardId.EnhancedSmell, name: "Enhanced Smell", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Mammal], habitats: 'All', staminaCost: 0,
    description: "Free Action: Reveal Hidden/Camouflaged opponent."
  },
  [CardId.Copycat]: {
    id: CardId.Copycat, name: "Copycat", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: [CreatureType.Avian], habitats: 'All', staminaCost: 1,
    description: "Steal a card from opponent's hand."
  },
  [CardId.Agile]: {
    id: CardId.Agile, name: "Agile", type: CardType.Ability, abilityStatus: AbilityStatus.None,
    creatureTypes: 'All', habitats: 'All', staminaCost: 0,
    description: "Passive: Can Evade attacks (Costs 1 Stamina). Active (Free): Attacks cannot miss this turn."
  },
};

export const STATUS_DESCRIPTIONS: Record<string, string> = {
  'Poisoned': 'Take 1 Damage at start of turn.',
  'Leeched': 'Take 1 Damage at start of turn. Heals attacker +1 HP at start of their turn.',
  'Stuck': 'Cannot Attack or use mobility actions.',
  'Grappled': 'Must flip Heads to Attack. Cannot Evade.',
  'Confused': 'Flip coin to act. Tails = Action Fails.',
  'Hidden': 'Cannot be targeted by attacks.',
  'Camouflaged': 'Attacks have 50% chance to miss you.',
  'Flying': 'Evades melee attacks on 50% tails. Immune to climbing evasion.',
  'CannotAttack': 'Prevented from using Attack cards.',
  'CannotEvade': 'Cannot evade attacks.',
  'Accurate': 'Attacks cannot miss due to Evasion/Stealth.',
  'DamageBuff': '+1 Damage dealt.',
  'StaminaDebt': 'Lose 1 Stamina at start of turn.',
  'Evading': 'Next incoming attack will miss.',
  'Chasing': 'Ignores target evasion and stealth.',
  'Climbing': 'Evades attacks from non-flying opponents.',
  'Intimidating': 'Opponent has 50% chance to miss attacks against you.',
};

export const getRandomElement = <T>(arr: T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
};

export const generateDeck = (creatureType: CreatureType, size: 'Small' | 'Medium' | 'Big'): CardDef[] => {
  const deck: CardDef[] = [];
  
  // 1. Add Size Card
  if (size === 'Small') deck.push(CARDS[CardId.SmallSize]);
  else if (size === 'Medium') deck.push(CARDS[CardId.MediumSize]);
  else deck.push(CARDS[CardId.BigSize]);

  // 2. Pool of cards
  const allCards = Object.values(CARDS);
  
  // Filter by Creature Type and Habitat (assuming 'All' habitats for generation simplicity or match game habitat)
  const physicalPool = allCards.filter(c => 
    c.type === CardType.Physical && 
    (c.creatureTypes === 'All' || c.creatureTypes.includes(creatureType))
  );
  const abilityPool = allCards.filter(c => 
    (c.type === CardType.Ability || c.type === CardType.Special) && 
    (c.creatureTypes === 'All' || c.creatureTypes.includes(creatureType))
  );

  // 3. Generate Deck (Standard Size ~15-20 cards)
  // Add ~10 Physicals
  for (let i = 0; i < 12; i++) {
    deck.push(getRandomElement(physicalPool));
  }
  // Add ~5 Abilities
  for (let i = 0; i < 6; i++) {
    deck.push(getRandomElement(abilityPool));
  }

  // Ensure Evolve and Apex Evolution are in deck occasionally
  deck.push(CARDS[CardId.Evolve]);
  deck.push(CARDS[CardId.ApexEvolution]); // Add new Apex card to deck

  return deck;
};