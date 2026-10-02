

export enum CreatureType {
  Mammal = 'Mammal',
  Reptile = 'Reptile',
  Avian = 'Avian',
  Amphibian = 'Amphibian',
}

export enum Habitat {
  Desert = 'Desert',
  Forest = 'Forest',
  Water = 'Water',
  Arena = 'Arena',
}

export enum CardType {
  Physical = 'Physical',
  Ability = 'Ability',
  Size = 'Size',
  Special = 'Special',
}

export enum AbilityStatus {
  PermanentUtility = 'Permanent Utility',
  ConsumableImpact = 'Consumable Impact',
  None = 'None',
}

export enum CardId {
  SmallSize = 'small_size',
  MediumSize = 'medium_size',
  BigSize = 'big_size',
  
  // Physical
  SpikyBody = 'spiky_body',
  ArmoredExoskeleton = 'armored_exoskeleton',
  ClawAttack = 'claw_attack',
  Whiskers = 'whiskers',
  StrongJaw = 'strong_jaw', // Upgrade
  Bite = 'bite',
  Fur = 'fur',
  ThickFur = 'thick_fur',
  StandOnHindLegs = 'stand_hind_legs',
  SwimsWell = 'swims_well',
  StrongBuild = 'strong_build',
  LargeHindLegs = 'large_hind_legs',
  BigClaws = 'big_claws',
  StrongTail = 'strong_tail',
  ArmoredScales = 'armored_scales',
  CamouflageWater = 'camouflage_water',
  DeathRoll = 'death_roll', // Upgrade
  SwimFast = 'swim_fast',
  AmbushAttack = 'ambush_attack',
  KeenEyesight = 'keen_eyesight',
  GraspingTalons = 'grasping_talons',
  PoisonSkin = 'poison_skin',
  DiveBomb = 'dive_bomb',
  PiercingBeak = 'piercing_beak',
  BarbedQuills = 'barbed_quills',
  VenomousFangs = 'venomous_fangs',
  CrushingWeight = 'crushing_weight',
  Amphibious = 'amphibious',
  Camouflage = 'camouflage', // Ability (2 Uses)
  Leech = 'leech',

  // Abilities
  ShortBurst = 'short_burst',
  Confuse = 'confuse',
  Intelligence = 'intelligence',
  Dig = 'dig',
  Freeze = 'freeze',
  Roar = 'roar',
  Hibernate = 'hibernate',
  Flight = 'flight',
  ToxicSpit = 'toxic_spit',
  Regeneration = 'regeneration',
  Focus = 'focus',
  AdrenalineRush = 'adrenaline_rush',
  StickyTongue = 'sticky_tongue',
  ShedSkin = 'shed_skin',
  Rage = 'rage',
  TerritorialDisplay = 'territorial_display',
  Mimicry = 'mimicry',
  ExhaustingRoar = 'exhausting_roar',
  SwiftReflexes = 'swift_reflexes',
  EnhancedSmell = 'enhanced_smell',
  Copycat = 'copycat',
  Agile = 'agile',
  Evolve = 'evolve',
  ApexEvolution = 'apex_evolution'
}

export interface CardDef {
  id: CardId;
  name: string;
  type: CardType;
  abilityStatus: AbilityStatus;
  creatureTypes: CreatureType[] | 'All';
  habitats: Habitat[] | 'All';
  staminaCost: number;
  description: string;
  maxCharges?: number;
  isUpgrade?: boolean;
  upgradeTarget?: CardId[];
}

export interface CardInstance {
  instanceId: string;
  defId: CardId;
  charges?: number;
  usedThisTurn?: boolean;
}

export interface StatusEffect {
  type: 'Poisoned' | 'Stuck' | 'Grappled' | 'Confused' | 'Hidden' | 'Camouflaged' | 'Flying' | 'CannotAttack' | 'CannotEvade' | 'Accurate' | 'DamageBuff' | 'StaminaDebt' | 'Evading' | 'Chasing' | 'Climbing' | 'Leeched' | 'Intimidating';
  duration?: number; // Turns remaining
  value?: number;
  sourceId?: string; // ID of the player who applied the status (for Leech healing)
}

export interface PlayerState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  creatureType: CreatureType;
  size: 'Small' | 'Medium' | 'Big';
  hand: CardInstance[];
  deck: CardInstance[];
  discard: CardInstance[];
  formation: CardInstance[];
  statuses: StatusEffect[];
  cardsPlayedThisTurn: number;
  extraCardPlays?: number;
  hasActedThisTurn: boolean;
  hasAttackedThisTurn?: boolean;
  hasUsedAbilityThisTurn?: boolean;
  guaranteedHeads: boolean;
  hasUsedForestHide?: boolean;
  usedAbilitiesThisTurn?: string[];
  abilitiesUsedThisTurn?: number;
  hasCustomDeck?: boolean;
  customDeckCardIds?: CardId[];
}

export interface GameNotification {
  id: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
}

export interface CoinFlipEvent {
    id: string;
    result: 'Heads' | 'Tails';
    reason: string;
    timestamp: number;
}

export interface PendingReaction {
  type: 'AGILE_EVADE';
  attackerId: string;
  targetId: string;
  attackCardId: string;
}

export interface PendingChoice {
    id: string;
    playerId: string;
    cardId: string; // The card causing the choice (e.g., Big Claws)
    options: string[]; // 'Attack', 'Dig', 'Climb'
    targetPlayerId?: string;
}

export interface GameState {
  gameId: string;
  habitat: Habitat;
  turn: number;
  currentPlayer: string;
  players: Record<string, PlayerState>;
  log: string[];
  winner: string | null;
  phase: 'start' | 'action' | 'end';
  notifications: GameNotification[];
  activeCoinFlip: CoinFlipEvent | null;
  pendingReaction: PendingReaction | null;
  pendingChoice: PendingChoice | null;
  lastAction?: { playerId: string; cardId: CardId };
}

export type GameAction =
  | { type: 'INIT_GAME'; payload: GameState }
  | { type: 'JOIN_GAME'; playerId: string; name: string }
  | { type: 'UPDATE_STATE'; payload: GameState }
  | { type: 'PLAY_CARD'; playerId: string; cardInstanceId: string; targetInstanceId?: string }
  | { type: 'USE_ACTION'; playerId: string; actionType: 'ATTACK' | 'ABILITY'; cardInstanceId: string; targetPlayerId: string; rng: number[]; targetHandCardId?: string }
  | { type: 'END_TURN'; playerId: string; rng: number[] }
  | { type: 'DISMISS_NOTIFICATION'; id: string }
  | { type: 'ACKNOWLEDGE_COIN_FLIP' }
  | { type: 'ATTEMPT_GRAPPLE_ESCAPE'; playerId: string; rng: number[] }
  | { type: 'USE_HABITAT_ACTION'; playerId: string; rng: number[] }
  | { type: 'CLEAR_POISON'; playerId: string }
  | { type: 'CLEAR_LEECH'; playerId: string }
  | { type: 'PLAY_EVOLVE_CARD'; playerId: string; evolveInstanceId: string; targetFormationId: string; replacementHandId: string }
  | { type: 'PLAY_APEX_EVOLUTION'; playerId: string; apexCardInstanceId: string; targetFormationInstanceId: string }
  | { type: 'RESOLVE_AGILE'; playerId: string; useAgile: boolean; rng: number[] }
  | { type: 'RESOLVE_CHOICE'; playerId: string; choice: string; rng: number[] };