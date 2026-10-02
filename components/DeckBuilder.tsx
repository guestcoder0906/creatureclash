import React, { useState, useMemo } from 'react';
import { CardId, CardType, CreatureType, CardDef } from '../types';
import { CARDS } from '../constants';

export const OPTIMAL_DECK_SIZE = 12;

interface DeckBuilderProps {
  playerName: string;
  onStartGame: (deck: CardId[], creatureType: CreatureType, size: 'Small' | 'Medium' | 'Big') => void;
  onBack: () => void;
  initialDeck?: CardId[];
  initialCreatureType?: CreatureType;
  initialSize?: 'Small' | 'Medium' | 'Big';
}

const TypeColors: Record<CardType, string> = {
  [CardType.Physical]: 'border-red-500 bg-red-950/40 text-red-200',
  [CardType.Ability]: 'border-blue-500 bg-blue-950/40 text-blue-200',
  [CardType.Size]: 'border-green-500 bg-green-950/40 text-green-200',
  [CardType.Special]: 'border-fuchsia-500 bg-fuchsia-950/40 text-fuchsia-200',
};

const CreatureIcons: Record<string, string> = {
  [CreatureType.Mammal]: '🐻 Mammal',
  [CreatureType.Reptile]: '🦎 Reptile',
  [CreatureType.Avian]: '🦅 Avian',
  [CreatureType.Amphibian]: '🐸 Amphibian',
};

export const isCardCompatibleWithCreature = (card: CardDef, creature: CreatureType): boolean => {
  if (card.creatureTypes === 'All') return true;
  return card.creatureTypes.includes(creature);
};

export const DeckBuilder: React.FC<DeckBuilderProps> = ({ 
  playerName, 
  onStartGame, 
  onBack,
  initialDeck,
  initialCreatureType,
  initialSize
}) => {
  const [selectedCards, setSelectedCards] = useState<CardId[]>(initialDeck || []);
  const [creatureType, setCreatureType] = useState<CreatureType>(initialCreatureType || CreatureType.Mammal);
  const [size, setSize] = useState<'Small' | 'Medium' | 'Big'>(initialSize || 'Medium');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | CardType>('all');
  const [hideIncompatible, setHideIncompatible] = useState(false);

  // All eligible cards for building a deck (exclude size cards as size is chosen directly)
  const allEligibleCards = useMemo(() => {
    return Object.values(CARDS).filter(c => c.type !== CardType.Size);
  }, []);

  const filteredCards = useMemo(() => {
    return allEligibleCards.filter(c => {
      const isCompatible = isCardCompatibleWithCreature(c, creatureType);
      if (hideIncompatible && !isCompatible) return false;
      if (categoryFilter !== 'all' && c.type !== categoryFilter) return false;
      if (search.trim() !== '') {
        const query = search.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesDesc = c.description.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }
      return true;
    });
  }, [allEligibleCards, categoryFilter, search, hideIncompatible, creatureType]);

  const handleCreatureTypeChange = (newType: CreatureType) => {
    setCreatureType(newType);
    // Automatically purge cards from deck that do not match the new creature and are not All
    setSelectedCards(prev => prev.filter(cardId => {
      const cardDef = CARDS[cardId];
      if (!cardDef) return false;
      return isCardCompatibleWithCreature(cardDef, newType);
    }));
  };

  const toggleCard = (cardId: CardId) => {
    const cardDef = CARDS[cardId];
    if (!cardDef) return;
    
    // Disallow adding cards that are not compatible with creature and not 'All'
    if (!isCardCompatibleWithCreature(cardDef, creatureType)) return;

    if (selectedCards.includes(cardId)) {
      setSelectedCards(prev => prev.filter(id => id !== cardId));
    } else {
      if (selectedCards.length >= OPTIMAL_DECK_SIZE) return;
      setSelectedCards(prev => [...prev, cardId]);
    }
  };

  const removeCard = (cardId: CardId) => {
    setSelectedCards(prev => prev.filter(id => id !== cardId));
  };

  const clearDeck = () => {
    setSelectedCards([]);
  };

  const autoPickDeck = () => {
    // Only pick cards compatible with the player's creature or 'All'
    const compatibleCards = allEligibleCards.filter(c => isCardCompatibleWithCreature(c, creatureType));

    const attacks = compatibleCards.filter(c => 
      c.type === CardType.Physical && 
      !c.isUpgrade &&
      (size === 'Big' || c.id !== CardId.CrushingWeight)
    );
    const defenses = compatibleCards.filter(c =>
      !c.isUpgrade &&
      (c.id === CardId.StrongBuild || c.id === CardId.Fur || c.id === CardId.ArmoredScales || c.id === CardId.SpikyBody || c.id === CardId.PoisonSkin || c.id === CardId.BarbedQuills || c.id === CardId.ArmoredExoskeleton || c.id === CardId.CamouflageWater)
    );
    const abilities = compatibleCards.filter(c =>
      !c.isUpgrade &&
      c.id !== CardId.Evolve &&
      c.id !== CardId.ApexEvolution &&
      (c.type === CardType.Ability || c.type === CardType.Special)
    );

    const picked: CardId[] = [];
    const pick = (pool: CardDef[], count: number) => {
      const copy = pool.filter(c => !picked.includes(c.id));
      for (let i = 0; i < count && copy.length > 0; i++) {
        const idx = Math.floor(Math.random() * copy.length);
        picked.push(copy.splice(idx, 1)[0].id);
      }
    };

    pick(attacks, 5);
    pick(defenses, 3);
    pick(abilities, 4);

    while (picked.length < OPTIMAL_DECK_SIZE) {
      const remaining = compatibleCards.filter(c => !picked.includes(c.id) && !c.isUpgrade);
      if (remaining.length === 0) break;
      const idx = Math.floor(Math.random() * remaining.length);
      picked.push(remaining.splice(idx, 1)[0].id);
    }

    setSelectedCards(picked.slice(0, OPTIMAL_DECK_SIZE));
  };

  const handleStart = () => {
    if (selectedCards.length !== OPTIMAL_DECK_SIZE) return;
    onStartGame(selectedCards, creatureType, size);
  };

  const compatibleCount = useMemo(() => {
    return allEligibleCards.filter(c => isCardCompatibleWithCreature(c, creatureType)).length;
  }, [allEligibleCards, creatureType]);

  const physicalCount = filteredCards.filter(c => c.type === CardType.Physical).length;
  const abilityCount = filteredCards.filter(c => c.type === CardType.Ability).length;
  const specialCount = filteredCards.filter(c => c.type === CardType.Special).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] max-h-[100dvh] bg-stone-950 text-white font-sans overflow-hidden">
      {/* HEADER (FIXED AT TOP) */}
      <header className="bg-stone-900 border-b border-stone-800 p-2.5 sm:p-3 md:p-4 shrink-0 shadow-xl z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-start">
            <button 
              onClick={onBack}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-lg text-xs md:text-sm font-bold transition active:scale-95 cursor-pointer shrink-0"
            >
              ← Back
            </button>
            <div className="truncate">
              <h1 className="text-base sm:text-lg md:text-2xl font-black text-amber-500 uppercase tracking-tight flex items-center gap-1.5 sm:gap-2">
                <span>🃏</span> <span>Deck Builder</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                Pick <span className="text-amber-400 font-bold">{OPTIMAL_DECK_SIZE} cards</span> matching creature type or 'All'
              </p>
            </div>
          </div>

          {/* DECK COUNTER & QUICK ACTIONS */}
          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 w-full md:w-auto justify-end flex-wrap sm:flex-nowrap">
            <div className={`px-2.5 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 rounded-xl border-2 font-mono font-black text-xs md:text-sm flex items-center gap-1.5 shadow-lg transition-all ${
              selectedCards.length === OPTIMAL_DECK_SIZE 
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                : 'bg-stone-800 border-amber-500/60 text-amber-400'
            }`}>
              <span>Deck:</span>
              <span className="text-xs sm:text-sm md:text-lg">{selectedCards.length}/{OPTIMAL_DECK_SIZE}</span>
              {selectedCards.length === OPTIMAL_DECK_SIZE && <span className="text-emerald-400 animate-bounce">✓</span>}
            </div>

            <button
              onClick={autoPickDeck}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 md:py-2 bg-purple-900/70 hover:bg-purple-800 text-purple-200 border border-purple-500 rounded-lg text-xs md:text-sm font-bold transition active:scale-95 shadow cursor-pointer whitespace-nowrap"
              title="Automatically pick 12 compatible cards"
            >
              🎲 Auto-Pick
            </button>

            {selectedCards.length > 0 && (
              <button
                onClick={clearDeck}
                className="px-2 py-1 sm:px-2.5 sm:py-1.5 md:py-2 bg-stone-800 hover:bg-red-900/50 text-stone-400 hover:text-red-300 border border-stone-700 hover:border-red-500 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* CREATURE SETUP: TYPE & SIZE */}
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-stone-800/80 grid grid-cols-1 md:grid-cols-2 gap-1.5 sm:gap-2 md:gap-4">
          {/* CREATURE TYPE */}
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-wrap text-xs">
            <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px] sm:text-[11px]">Type:</span>
            {Object.entries(CreatureIcons).map(([typeKey, label]) => (
              <button
                key={typeKey}
                onClick={() => handleCreatureTypeChange(typeKey as CreatureType)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border font-bold transition-all text-[11px] sm:text-xs cursor-pointer ${
                  creatureType === typeKey 
                    ? 'bg-amber-600 border-amber-400 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)] scale-105' 
                    : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-[10px] text-stone-400 font-mono ml-0.5">
              ({compatibleCount})
            </span>
          </div>

          {/* CREATURE SIZE */}
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-wrap text-xs md:justify-end">
            <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px] sm:text-[11px]">Size:</span>
            {(['Small', 'Medium', 'Big'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border font-bold transition-all text-[11px] sm:text-xs cursor-pointer ${
                  size === s 
                    ? 'bg-green-600 border-green-400 text-white shadow-[0_0_10px_rgba(34,197,94,0.5)] scale-105' 
                    : 'bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {s === 'Small' ? 'Small (10HP/4ST)' : s === 'Medium' ? 'Med (15HP/3ST)' : 'Big (20HP/2ST)'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* SCROLLABLE MAIN CONTENT WRAPPER */}
      <div className="flex-1 min-h-0 overflow-y-auto w-full overscroll-contain touch-pan-y">
        <div className="max-w-7xl mx-auto flex flex-col">
          {/* SELECTED CARDS TRAY */}
          <section className="bg-stone-900/80 border-b border-stone-800 p-3 md:p-4 shadow-inner">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-stone-300 flex items-center gap-2 flex-wrap">
                <span>🎴 Your Deck Tray</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-sans font-bold">
                  {CreatureIcons[creatureType]} • {size}
                </span>
                <span className="text-stone-400">({selectedCards.length}/{OPTIMAL_DECK_SIZE} slots filled)</span>
              </span>
              {selectedCards.length < OPTIMAL_DECK_SIZE ? (
                <span className="text-xs text-amber-400 animate-pulse font-medium">
                  Select {OPTIMAL_DECK_SIZE - selectedCards.length} more card{OPTIMAL_DECK_SIZE - selectedCards.length > 1 ? 's' : ''} to complete
                </span>
              ) : (
                <span className="text-xs text-emerald-400 font-bold">
                  ✓ Deck Complete! Ready to battle.
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5 md:gap-2">
              {Array.from({ length: OPTIMAL_DECK_SIZE }).map((_, index) => {
                const cardId = selectedCards[index];
                const cardDef = cardId ? CARDS[cardId] : null;

                if (cardDef) {
                  return (
                    <div 
                      key={cardId}
                      className="relative group p-1.5 md:p-2 rounded-lg border border-amber-500/70 bg-gradient-to-b from-stone-800 to-stone-900 shadow-md flex flex-col justify-between h-20 text-[10px] animate-fade-in hover:border-amber-400"
                    >
                      <div className="flex justify-between items-start gap-1">
                        <div className="truncate">
                          <span className="font-bold text-amber-300 truncate leading-tight text-[11px] block" title={cardDef.name}>
                            {cardDef.name}
                          </span>
                          {cardDef.isUpgrade && cardDef.upgradeTarget && (
                            <span className="text-[7.5px] text-amber-400 font-semibold truncate block">
                              Upg: {cardDef.upgradeTarget.map(t => CARDS[t]?.name).filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeCard(cardId)}
                          className="text-stone-400 hover:text-red-400 font-bold px-1 rounded hover:bg-black/50 cursor-pointer text-xs"
                          title="Remove from deck"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-stone-400 font-mono mt-auto">
                        <span className={cardDef.type === CardType.Physical ? 'text-red-400' : cardDef.type === CardType.Ability ? 'text-blue-400' : 'text-fuchsia-400'}>
                          {cardDef.type === CardType.Physical ? '⚔️' : cardDef.type === CardType.Ability ? '✨' : '🧬'}
                        </span>
                        <span className="text-yellow-400 font-bold">{cardDef.staminaCost > 0 ? `⚡${cardDef.staminaCost}` : '0 St'}</span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={index} 
                    className="rounded-lg border-2 border-dashed border-stone-800 bg-black/20 flex flex-col items-center justify-center h-20 text-stone-600 text-[11px] font-mono"
                  >
                    <span>Slot</span>
                    <span className="font-bold">{index + 1}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* STICKY SEARCH & CATEGORY FILTER BAR */}
          <section className="bg-stone-950/95 backdrop-blur p-3 md:p-4 border-b border-stone-800 sticky top-0 z-10 shadow-md">
            <div className="flex flex-col md:flex-row gap-3 justify-between items-center">
              {/* SEARCH & TOGGLE */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-72">
                  <input
                    type="text"
                    placeholder="Search cards by name or effect..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-3 pr-8 py-2 text-xs md:text-sm text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 shadow-inner"
                  />
                  {search && (
                    <button 
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-1.5 text-xs text-stone-400 whitespace-nowrap cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={hideIncompatible} 
                    onChange={e => setHideIncompatible(e.target.checked)}
                    className="rounded bg-stone-800 border-stone-600 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Hide Incompatible</span>
                </label>
              </div>

              {/* CATEGORY TABS */}
              <div className="flex gap-1.5 md:gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                <button
                  onClick={() => setCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    categoryFilter === 'all' 
                      ? 'bg-amber-600 border-amber-400 text-white shadow' 
                      : 'bg-stone-900 border-stone-700 text-stone-400 hover:bg-stone-800'
                  }`}
                >
                  All ({filteredCards.length})
                </button>
                <button
                  onClick={() => setCategoryFilter(CardType.Physical)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    categoryFilter === CardType.Physical 
                      ? 'bg-red-700 border-red-400 text-white shadow' 
                      : 'bg-stone-900 border-stone-700 text-stone-400 hover:bg-stone-800'
                  }`}
                >
                  ⚔️ Physical ({physicalCount})
                </button>
                <button
                  onClick={() => setCategoryFilter(CardType.Ability)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    categoryFilter === CardType.Ability 
                      ? 'bg-blue-700 border-blue-400 text-white shadow' 
                      : 'bg-stone-900 border-stone-700 text-stone-400 hover:bg-stone-800'
                  }`}
                >
                  ✨ Ability ({abilityCount})
                </button>
                <button
                  onClick={() => setCategoryFilter(CardType.Special)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    categoryFilter === CardType.Special 
                      ? 'bg-fuchsia-700 border-fuchsia-400 text-white shadow' 
                      : 'bg-stone-900 border-stone-700 text-stone-400 hover:bg-stone-800'
                  }`}
                >
                  🧬 Special ({specialCount})
                </button>
              </div>
            </div>
          </section>

          {/* CARD POOL GRID */}
          <main className="p-3 md:p-4 pb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredCards.map(card => {
                const isSelected = selectedCards.includes(card.id);
                const isCompatible = isCardCompatibleWithCreature(card, creatureType);
                const isDeckFull = selectedCards.length >= OPTIMAL_DECK_SIZE && !isSelected;

                return (
                  <div
                    key={card.id}
                    onClick={() => {
                      if (!isCompatible || isDeckFull) return;
                      toggleCard(card.id);
                    }}
                    className={`rounded-xl border-2 p-3 transition-all relative flex flex-col justify-between shadow-lg ${
                      !isCompatible 
                        ? 'opacity-35 grayscale border-stone-800/80 bg-stone-900/30 cursor-not-allowed hover:border-stone-800'
                        : isSelected 
                        ? 'border-emerald-400 bg-gradient-to-b from-emerald-950/80 to-stone-900 shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500 scale-[1.01] cursor-pointer' 
                        : isDeckFull 
                        ? 'border-stone-800 bg-stone-900/30 opacity-40 cursor-not-allowed' 
                        : 'border-stone-700 bg-stone-900/80 hover:border-amber-400 hover:scale-[1.01] cursor-pointer'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-1.5">
                        <span className={`font-bold text-sm ${isCompatible ? 'text-white group-hover:text-amber-400' : 'text-stone-400'}`}>
                          {card.name}
                        </span>
                        <span className="font-mono text-xs font-bold text-yellow-400 px-1.5 py-0.5 rounded bg-black/50 border border-yellow-500/30">
                          {card.staminaCost > 0 ? `⚡${card.staminaCost}` : '0 St'}
                        </span>
                      </div>

                      <div className="flex gap-2 items-center mb-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${isCompatible ? TypeColors[card.type] : 'border-stone-700 bg-stone-800 text-stone-500'}`}>
                          {card.type}
                        </span>
                        {card.isUpgrade && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500 text-black">
                            Upgrade
                          </span>
                        )}
                        {!isCompatible && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/50">
                            🔒 Incompatible
                          </span>
                        )}
                      </div>

                      {card.isUpgrade && card.upgradeTarget && (
                        <div className="text-[10px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/40 rounded px-1.5 py-0.5 mb-1.5 flex items-center gap-1 shadow-sm">
                          <span>⬆️ Upgrades from:</span>
                          <span className="text-white font-black truncate">
                            {card.upgradeTarget.map(t => CARDS[t]?.name).filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}

                      <p className={`text-xs leading-relaxed min-h-[40px] ${isCompatible ? 'text-stone-300' : 'text-stone-500'}`}>
                        {card.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/10 flex justify-between items-center">
                      <span className={`text-[10px] font-mono ${isCompatible ? 'text-stone-400' : 'text-amber-500/80 font-bold'}`}>
                        {card.creatureTypes === 'All' 
                          ? 'All Creatures' 
                          : `Requires: ${Array.isArray(card.creatureTypes) ? card.creatureTypes.join(', ') : card.creatureTypes}`}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isCompatible || isDeckFull) return;
                          toggleCard(card.id);
                        }}
                        disabled={!isCompatible || isDeckFull}
                        className={`px-3 py-1 rounded text-xs font-bold transition shadow ${
                          !isCompatible
                            ? 'bg-stone-800 text-stone-500 border border-stone-700/50 cursor-not-allowed opacity-60'
                            : isSelected
                            ? 'bg-emerald-600 hover:bg-red-700 text-white cursor-pointer'
                            : isDeckFull
                            ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                            : 'bg-stone-800 hover:bg-amber-600 text-white border border-stone-600 hover:border-amber-400 cursor-pointer'
                        }`}
                      >
                        {!isCompatible 
                          ? '🔒 WRONG TYPE' 
                          : isSelected 
                          ? '✓ IN DECK' 
                          : isDeckFull 
                          ? 'DECK FULL' 
                          : '+ ADD'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      </div>

      {/* FOOTER (FIXED AT BOTTOM) */}
      <footer className="bg-stone-900 border-t border-stone-800 p-2.5 sm:p-3 md:p-4 shadow-2xl shrink-0 z-20 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-xs text-stone-400 text-center sm:text-left">
            <span className="font-bold text-white">{playerName}</span> • Deck: <span className="font-bold text-amber-400">{selectedCards.length}/{OPTIMAL_DECK_SIZE} Cards</span> • Creature: <span className="font-bold text-green-400">{creatureType} ({size})</span>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={onBack}
              className="flex-1 sm:flex-none px-6 py-2.5 md:py-3 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-xl font-bold text-xs md:text-sm transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handleStart}
              disabled={selectedCards.length !== OPTIMAL_DECK_SIZE}
              className={`flex-1 sm:flex-none px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black text-xs md:text-base shadow-xl transition-all cursor-pointer ${
                selectedCards.length === OPTIMAL_DECK_SIZE
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:scale-105 active:scale-95 border-b-4 border-green-800 animate-pulse'
                  : 'bg-stone-800 text-stone-500 border border-stone-700 cursor-not-allowed'
              }`}
            >
              {selectedCards.length === OPTIMAL_DECK_SIZE ? `START BATTLE (${OPTIMAL_DECK_SIZE}/${OPTIMAL_DECK_SIZE} READY)` : `SELECT ${OPTIMAL_DECK_SIZE - selectedCards.length} MORE CARDS`}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
