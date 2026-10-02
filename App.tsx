import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Game } from './components/Game';
import { DeckBuilder } from './components/DeckBuilder';
import { gameReducer, createPlayer, createCustomPlayer, generateRandomAiDeck } from './services/gameEngine';
import { GameState, GameAction, Habitat, CardId, CreatureType } from './types';
import { getRandomElement } from './constants';
import { computeAiActions, computeReaction } from './services/aiLogic';

const App: React.FC = () => {
  const [status, setStatus] = useState<'menu' | 'deckbuilder' | 'rules' | 'playing'>('menu');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [myName, setMyName] = useState('Player');
  
  // AI Mode State
  const aiTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAction = useCallback((action: GameAction) => {
    setGameState(prevState => {
      if (!prevState && action.type !== 'INIT_GAME') return null;
      
      if (action.type === 'INIT_GAME') return action.payload;
      if (action.type === 'UPDATE_STATE') return action.payload;
      
      // JOIN_GAME is no longer relevant in single player
      if (action.type === 'JOIN_GAME') return prevState;

      const newState = gameReducer(prevState!, action);
      return newState;
    });
  }, []);

  const dispatch = (action: GameAction) => {
    handleAction(action);
  };

  // --- AI Logic Effect ---
  useEffect(() => {
    if (!gameState || !gameState.currentPlayer || gameState.winner) return;
    
    const aiId = 'ai-bot';
    
    // Check for Pending Reaction Target = AI
    if (gameState.pendingReaction && gameState.pendingReaction.targetId === aiId) {
        // AI needs to react
        if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
        aiTurnTimeoutRef.current = setTimeout(() => {
            const reaction = computeReaction(gameState, aiId);
            if (reaction) dispatch(reaction);
        }, 1600); // Cooldown for AI reaction
        return;
    }

    if (gameState.currentPlayer === aiId && gameState.phase !== 'end' && !gameState.pendingReaction && !gameState.activeCoinFlip) {
      // It's AI's turn
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      
      aiTurnTimeoutRef.current = setTimeout(() => {
        const actions = computeAiActions(gameState, aiId);
        
        let i = 0;
        const executeNext = () => {
          if (i < actions.length) {
             dispatch(actions[i]);
             i++;
             if (i < actions.length) {
                aiTurnTimeoutRef.current = setTimeout(executeNext, 2800); // 2.8s cooldown between AI actions
             }
          }
        };
        executeNext();
      }, 1800); // 1.8s initial thinking pause at turn start
    }

    return () => {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
    };
  }, [gameState?.currentPlayer, gameState?.turn, gameState?.pendingReaction, !!gameState?.activeCoinFlip]); 

  const prepareGame = () => {
    const myId = 'local-player';
    const aiId = 'ai-bot';
    setPlayerId(myId);

    const habitats = [Habitat.Forest, Habitat.Desert, Habitat.Water, Habitat.Arena];
    const p1 = createPlayer(myId, myName || "Player");
    const p2 = createPlayer(aiId, "AI Opponent");
    
    const initialState: GameState = {
      gameId: 'local-ai-game',
      habitat: getRandomElement(habitats),
      turn: 1,
      currentPlayer: myId, 
      players: { [p1.id]: p1, [p2.id]: p2 },
      log: ["Game Started vs AI!", `Habitat: ${habitats[0]}`, "Good luck!"],
      winner: null,
      phase: 'start',
      activeCoinFlip: null,
      pendingReaction: null,
      pendingChoice: null,
      notifications: []
    };

    // 50% chance for AI to go first
    if (Math.random() > 0.5) {
      initialState.currentPlayer = aiId;
      initialState.log.push("AI goes first!");
    } else {
      initialState.log.push("You go first!");
    }

    dispatch({ type: 'INIT_GAME', payload: initialState });
    setStatus('rules');
  };

  const startCustomGame = (deckCards: CardId[], creatureType: CreatureType, size: 'Small' | 'Medium' | 'Big') => {
    const myId = 'local-player';
    const aiId = 'ai-bot';
    setPlayerId(myId);

    const habitats = [Habitat.Forest, Habitat.Desert, Habitat.Water, Habitat.Arena];
    const selectedHabitat = getRandomElement(habitats);

    // Player with custom 10-card deck
    const p1 = createCustomPlayer(myId, myName || "Player", deckCards, creatureType, size);

    // AI with randomly generated 10-card deck (no templates, works well)
    const aiTypes = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const aiSizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];
    const aiType = getRandomElement(aiTypes);
    const aiSize = getRandomElement(aiSizes);
    const aiDeckCards = generateRandomAiDeck(aiType, aiSize);
    const p2 = createCustomPlayer(aiId, "AI Opponent", aiDeckCards, aiType, aiSize);

    const initialState: GameState = {
      gameId: 'local-ai-game',
      habitat: selectedHabitat,
      turn: 1,
      currentPlayer: myId,
      players: { [p1.id]: p1, [p2.id]: p2 },
      log: [
        `Custom Deck Match Started!`,
        `${p1.name} entered with ${deckCards.length} custom cards (${creatureType}, ${size})!`,
        `AI Opponent entered with ${aiDeckCards.length} random cards (${aiType}, ${aiSize})!`,
        `Habitat: ${selectedHabitat}`
      ],
      winner: null,
      phase: 'start',
      activeCoinFlip: null,
      pendingReaction: null,
      pendingChoice: null,
      notifications: []
    };

    if (Math.random() > 0.5) {
      initialState.currentPlayer = aiId;
      initialState.log.push("AI goes first!");
    } else {
      initialState.log.push("You go first!");
    }

    dispatch({ type: 'INIT_GAME', payload: initialState });
    setStatus('playing');
  };

  const confirmStart = () => {
    setStatus('playing');
  };

  if (status === 'deckbuilder') {
    return (
      <DeckBuilder
        playerName={myName || "Player"}
        onStartGame={startCustomGame}
        onBack={() => setStatus('menu')}
      />
    );
  }

  if (status === 'playing' && gameState) {
    return (
      <Game state={gameState} playerId={playerId} dispatch={dispatch} onExit={() => setStatus('menu')} />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-900 text-white p-4">
      {status === 'menu' && (
        <div className="max-w-md w-full p-8 bg-stone-800 rounded-2xl shadow-2xl border border-stone-700 animate-fade-in">
          <h1 className="text-4xl font-black text-center mb-2 text-amber-500 uppercase tracking-tight">Creature Clash</h1>
          <p className="text-center text-xs text-stone-400 mb-8">Build creature decks and battle in dynamic habitats</p>
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-stone-400 mb-2 uppercase tracking-wider">Your Creature Name</label>
            <input 
              type="text" 
              placeholder="Your Name"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              className="w-full px-4 py-3 bg-black/60 rounded-xl border border-stone-600 text-white text-lg text-center focus:border-amber-500 outline-none shadow-inner"
            />
          </div>

          <div className="space-y-3">
            <button 
              onClick={() => setStatus('deckbuilder')} 
              className="w-full py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl font-black text-lg shadow-[0_0_20px_rgba(245,158,11,0.3)] transition transform hover:scale-[1.02] active:scale-95 border-b-4 border-orange-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🃏</span> BUILD 12-CARD DECK
            </button>

            <button 
              onClick={prepareGame} 
              className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl font-bold text-base shadow-md transition transform hover:scale-[1.02] active:scale-95 border border-stone-600 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>⚔️</span> Quick Play (Random Deck)
            </button>
          </div>
          
          <div className="mt-8 text-center text-stone-500 text-xs">
            Single Player vs AI • Optimal 12-Card Decks
          </div>
        </div>
      )}

      {status === 'rules' && (
        <div className="max-w-lg w-full p-8 bg-stone-800 rounded-lg shadow-2xl border-2 border-amber-500/50 animate-fade-in">
           <h2 className="text-3xl font-bold text-amber-500 mb-6 text-center">How to Play</h2>
           <div className="space-y-4 text-stone-300 mb-8 text-sm md:text-base leading-relaxed">
              <p className="bg-black/30 p-3 rounded border border-white/5">
                 <span className="text-amber-400 font-bold block mb-1">Turn Actions</span>
                 You can play <span className="text-white font-bold">1 Card</span> into your formation for free each turn, or pay <span className="text-yellow-400 font-bold">2 Stamina</span> for each extra card played that turn! Plus perform up to <span className="text-white font-bold">1 Attack</span> and <span className="text-white font-bold">1 Ability</span> if stamina permits.
              </p>
              <p className="text-xs text-stone-500 italic text-center">
                 Cards are drawn automatically from your deck. Discards are reshuffled if deck empties.
              </p>
           </div>
           <button 
             onClick={confirmStart}
             className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-black text-xl rounded-lg shadow-lg transition-transform hover:scale-105 border-b-4 border-green-800"
           >
             START MATCH
           </button>
        </div>
      )}
    </div>
  );
};

export default App;
