import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Game } from './components/Game';
import { DeckBuilder } from './components/DeckBuilder';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { gameReducer, createPlayer, createCustomPlayer, generateRandomAiDeck } from './services/gameEngine';
import { GameState, GameAction, Habitat, CardId, CreatureType } from './types';
import { getRandomElement } from './constants';
import { computeNextAiAction, computeReaction } from './services/aiLogic';
import { multiplayerService } from './services/multiplayer';

type AppStatus = 'menu' | 'deckbuilder' | 'rules' | 'playing' | 'multiplayer';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>('menu');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [myName, setMyName] = useState(() => localStorage.getItem('creature_clash_player_name') || 'Player');
  
  // Custom Deck Configuration
  const [customDeck, setCustomDeck] = useState<CardId[]>(() => {
    const saved = localStorage.getItem('creature_clash_custom_deck');
    return saved ? JSON.parse(saved) : [];
  });
  const [creatureType, setCreatureType] = useState<CreatureType>(() => {
    return (localStorage.getItem('creature_clash_creature_type') as CreatureType) || CreatureType.Mammal;
  });
  const [size, setSize] = useState<'Small' | 'Medium' | 'Big'>(() => {
    return (localStorage.getItem('creature_clash_size') as 'Small' | 'Medium' | 'Big') || 'Medium';
  });

  // Multiplayer State
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const isMultiplayerRef = useRef(false);
  const gameStateRef = useRef<GameState | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [activeEmote, setActiveEmote] = useState<{ emote: string; senderName: string } | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  useEffect(() => {
    isMultiplayerRef.current = isMultiplayer;
  }, [isMultiplayer]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // AI Mode State
  const aiTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check URL parameters for ?room=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) {
      setStatus('multiplayer');
    }
  }, []);

  // Save Player profile to localStorage
  const handleNameChange = (name: string) => {
    setMyName(name);
    localStorage.setItem('creature_clash_player_name', name);
  };

  const handleAction = useCallback((action: GameAction) => {
    setGameState(prevState => {
      if (!prevState && action.type !== 'INIT_GAME') return null;
      
      if (action.type === 'INIT_GAME') return action.payload;
      if (action.type === 'UPDATE_STATE') return action.payload;
      if (action.type === 'JOIN_GAME') return prevState;

      const newState = gameReducer(prevState!, action);
      return newState;
    });
  }, []);

  // Dispatch that handles local reducer + authoritative remote state broadcast
  const dispatchAction = (action: GameAction) => {
    setGameState(prevState => {
      if (!prevState && action.type !== 'INIT_GAME') return null;
      if (action.type === 'INIT_GAME') return action.payload;
      if (action.type === 'UPDATE_STATE') return action.payload;
      if (action.type === 'JOIN_GAME') return prevState;

      const newState = gameReducer(prevState!, action);

      if (isMultiplayerRef.current) {
        // Send action along with computed authoritative state to prevent any desync
        multiplayerService.sendAction(action, newState);
      }
      return newState;
    });
  };

  // --- AI Logic Effect (Single Player Only) ---
  useEffect(() => {
    if (isMultiplayer) return;
    if (!gameState || !gameState.currentPlayer || gameState.winner) return;
    
    const aiId = 'ai-bot';
    
    // 1. Handle Pending Choice for AI (e.g. Big Claws choice: Attack / Dig / Climb)
    if (gameState.pendingChoice && gameState.pendingChoice.playerId === aiId) {
        if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
        aiTurnTimeoutRef.current = setTimeout(() => {
            const reaction = computeReaction(gameState, aiId);
            if (reaction) handleAction(reaction);
        }, 1100);
        return;
    }

    // 2. Handle Pending Reaction Target = AI (e.g. Agile reaction to player attack)
    if (gameState.pendingReaction && gameState.pendingReaction.targetId === aiId) {
        if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
        aiTurnTimeoutRef.current = setTimeout(() => {
            const reaction = computeReaction(gameState, aiId);
            if (reaction) handleAction(reaction);
        }, 1100);
        return;
    }

    // 3. AI Turn Execution: Compute and dispatch one fresh action based on live state
    if (
      gameState.currentPlayer === aiId && 
      gameState.phase !== 'end' && 
      !gameState.pendingReaction && 
      !gameState.pendingChoice && 
      !gameState.activeCoinFlip
    ) {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
      
      aiTurnTimeoutRef.current = setTimeout(() => {
        const nextAction = computeNextAiAction(gameState, aiId);
        if (nextAction) {
          handleAction(nextAction);
        }
      }, 1000);
    }

    return () => {
      if (aiTurnTimeoutRef.current) clearTimeout(aiTurnTimeoutRef.current);
    };
  }, [
    isMultiplayer,
    gameState?.currentPlayer, 
    gameState?.turn, 
    gameState?.pendingReaction, 
    gameState?.pendingChoice, 
    !!gameState?.activeCoinFlip,
    gameState?.players?.['ai-bot']?.stamina,
    gameState?.players?.['ai-bot']?.hasAttackedThisTurn,
    gameState?.players?.['ai-bot']?.hasUsedAbilityThisTurn,
    gameState?.players?.['ai-bot']?.cardsPlayedThisTurn,
    gameState?.players?.['ai-bot']?.formation?.length,
    gameState?.players?.['ai-bot']?.hand?.length,
    handleAction
  ]); 

  // --- Single Player (Quick vs AI with Random Creature & Size) ---
  const prepareGame = () => {
    setIsMultiplayer(false);
    const myId = 'local-player';
    const aiId = 'ai-bot';
    setPlayerId(myId);

    const habitats = [Habitat.Forest, Habitat.Desert, Habitat.Water, Habitat.Arena];
    const selectedHabitat = getRandomElement(habitats);

    const types = [CreatureType.Mammal, CreatureType.Reptile, CreatureType.Avian, CreatureType.Amphibian];
    const sizes: ('Small' | 'Medium' | 'Big')[] = ['Small', 'Medium', 'Big'];

    // Random Creature Type and Size for Player 1
    const p1Type = getRandomElement(types);
    const p1Size = getRandomElement(sizes);
    const p1Deck = generateRandomAiDeck(p1Type, p1Size);
    const p1 = createCustomPlayer(myId, myName || "Player", p1Deck, p1Type, p1Size);

    // Random Creature Type and Size for AI Opponent
    const p2Type = getRandomElement(types);
    const p2Size = getRandomElement(sizes);
    const p2Deck = generateRandomAiDeck(p2Type, p2Size);
    const p2 = createCustomPlayer(aiId, "AI Opponent", p2Deck, p2Type, p2Size);
    
    const initialState: GameState = {
      gameId: 'local-ai-game',
      habitat: selectedHabitat,
      turn: 1,
      currentPlayer: myId, 
      players: { [p1.id]: p1, [p2.id]: p2 },
      log: [
        "Quick Match Started vs AI!", 
        `${p1.name} entered as: ${p1Type} (${p1Size})!`,
        `AI Opponent entered as: ${p2Type} (${p2Size})!`,
        `Battlefield Habitat: ${selectedHabitat}`
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

    handleAction({ type: 'INIT_GAME', payload: initialState });
    setStatus('rules');
  };

  // --- Single Player (Custom Deck vs AI) ---
  const startCustomGame = (deckCards: CardId[], newCreatureType: CreatureType, newSize: 'Small' | 'Medium' | 'Big') => {
    // Save to state & storage
    setCustomDeck(deckCards);
    setCreatureType(newCreatureType);
    setSize(newSize);
    localStorage.setItem('creature_clash_custom_deck', JSON.stringify(deckCards));
    localStorage.setItem('creature_clash_creature_type', newCreatureType);
    localStorage.setItem('creature_clash_size', newSize);

    setIsMultiplayer(false);
    const myId = 'local-player';
    const aiId = 'ai-bot';
    setPlayerId(myId);

    const habitats = [Habitat.Forest, Habitat.Desert, Habitat.Water, Habitat.Arena];
    const selectedHabitat = getRandomElement(habitats);

    const p1 = createCustomPlayer(myId, myName || "Player", deckCards, newCreatureType, newSize);

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
        `${p1.name} entered with ${deckCards.length} custom cards (${newCreatureType}, ${newSize})!`,
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

    handleAction({ type: 'INIT_GAME', payload: initialState });
    setStatus('playing');
  };

  // --- Multiplayer Game Start Callback ---
  const startMultiplayerGame = (initialState: GameState, myId: string, isHost: boolean) => {
    setIsMultiplayer(true);
    isMultiplayerRef.current = true;
    setOpponentDisconnected(false);
    setPlayerId(myId);
    setRoomCode(multiplayerService.getRoomCode());
    handleAction({ type: 'INIT_GAME', payload: initialState });
    setStatus('playing');

    // Attach in-game multiplayer callbacks
    multiplayerService.updateGameCallbacks({
      onRemoteAction: (remoteAction, syncedState) => {
        if (syncedState) {
          handleAction({ type: 'UPDATE_STATE', payload: syncedState });
        } else {
          handleAction(remoteAction);
        }
      },
      onStateSync: (syncedState) => {
        handleAction({ type: 'UPDATE_STATE', payload: syncedState });
      },
      onRequestSync: () => {
        if (gameStateRef.current) {
          multiplayerService.sendStateSync(gameStateRef.current);
        }
      },
      onOpponentDisconnected: () => {
        setOpponentDisconnected(true);
        setGameState(prev => {
          if (!prev) return null;
          return {
            ...prev,
            winner: myId,
            phase: 'end',
            log: ['The other player has closed or reloaded the game. The match has ended.', ...prev.log],
            notifications: [
              {
                id: 'disc_' + Date.now(),
                type: 'error',
                message: 'The other player has closed or reloaded the game. You win by forfeit!'
              },
              ...prev.notifications
            ]
          };
        });
      },
      onEmoteReceived: (emote, senderName) => {
        setActiveEmote({ emote, senderName });
        setTimeout(() => setActiveEmote(null), 3000);
      },
      onRematchRequested: () => {
        if (!isHost) {
          handleAction({
            type: 'DISMISS_NOTIFICATION',
            id: 'rematch_req',
          });
        }
      }
    });
  };

  const handleExitGame = () => {
    if (isMultiplayer) {
      multiplayerService.leaveRoom();
      setIsMultiplayer(false);
      isMultiplayerRef.current = false;
    }
    setOpponentDisconnected(false);
    setStatus('menu');
  };

  const confirmStart = () => {
    setStatus('playing');
  };

  if (status === 'multiplayer') {
    return (
      <MultiplayerLobby
        playerName={myName || "Player"}
        onStartGame={startMultiplayerGame}
        onBack={() => setStatus('menu')}
        onOpenDeckBuilder={() => setStatus('deckbuilder')}
        customDeck={customDeck}
        creatureType={creatureType}
        size={size}
      />
    );
  }

  if (status === 'deckbuilder') {
    return (
      <DeckBuilder
        playerName={myName || "Player"}
        onStartGame={startCustomGame}
        onBack={() => setStatus('menu')}
        initialDeck={customDeck}
        initialCreatureType={creatureType}
        initialSize={size}
      />
    );
  }

  if (status === 'playing' && gameState) {
    return (
      <Game 
        state={gameState} 
        playerId={playerId} 
        dispatch={dispatchAction} 
        onExit={handleExitGame}
        isMultiplayer={isMultiplayer}
        roomCode={roomCode}
        onSendEmote={(emote) => multiplayerService.sendEmote(emote)}
        activeEmote={activeEmote}
        onRematch={() => multiplayerService.requestRematch()}
        opponentDisconnected={opponentDisconnected}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto overscroll-contain flex flex-col items-center justify-start sm:justify-center bg-stone-900 text-white p-3 sm:p-4 py-6 sm:py-10">
      {status === 'menu' && (
        <div className="max-w-md w-full p-5 sm:p-8 bg-stone-800 rounded-3xl shadow-2xl border border-stone-700 animate-fade-in my-auto">
          <div className="text-center mb-6">
            <span className="text-4xl block mb-1">🐾</span>
            <h1 className="text-4xl font-black text-amber-500 uppercase tracking-tight">Creature Clash</h1>
            <p className="text-xs text-stone-400 mt-1">Multiplayer tactical creature card battler</p>
          </div>
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-stone-400 mb-2 uppercase tracking-wider">Your Creature Name</label>
            <input 
              type="text" 
              placeholder="Your Name"
              value={myName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full px-4 py-3 bg-black/60 rounded-xl border border-stone-600 text-white text-lg text-center focus:border-amber-500 outline-none shadow-inner font-bold"
            />
          </div>

          {/* Chosen Deck Creature Preview */}
          <div className="mb-4 p-3 bg-black/40 rounded-xl border border-stone-700/60 flex items-center justify-between text-xs">
            <span className="text-stone-400">Current Deck:</span>
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>{creatureType === CreatureType.Mammal ? '🐻 Mammal' : creatureType === CreatureType.Reptile ? '🦎 Reptile' : creatureType === CreatureType.Avian ? '🦅 Avian' : '🐸 Amphibian'}</span>
              <span className="text-stone-400 font-normal">({size})</span>
              <span className="text-emerald-400 font-mono font-bold">[{customDeck.length || 12} Cards]</span>
            </span>
          </div>

          <div className="space-y-3.5">
            {/* Real Multiplayer Button */}
            <button 
              onClick={() => setStatus('multiplayer')} 
              className="w-full py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded-2xl font-black text-lg shadow-[0_0_25px_rgba(16,185,129,0.35)] transition transform hover:scale-[1.02] active:scale-95 border-b-4 border-emerald-800 flex items-center justify-center gap-2.5 cursor-pointer text-white"
            >
              <span className="text-xl">🌐</span>
              <div className="text-left">
                <div className="leading-tight">ONLINE MULTIPLAYER (PVP)</div>
                <div className="text-[10px] font-normal text-emerald-100 opacity-90">Live PvP creature battle</div>
              </div>
            </button>

            {/* Deck Builder */}
            <button 
              onClick={() => setStatus('deckbuilder')} 
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-2xl font-black text-base shadow-[0_0_20px_rgba(245,158,11,0.25)] transition transform hover:scale-[1.02] active:scale-95 border-b-4 border-orange-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>🃏</span> BUILD 12-CARD DECK
            </button>

            {/* Single Player */}
            <button 
              onClick={prepareGame} 
              className="w-full py-3 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-2xl font-bold text-sm shadow-md transition transform hover:scale-[1.02] active:scale-95 border border-stone-600 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>⚔️</span> Quick Play (Random Creature & Deck)
            </button>
          </div>
          
          <div className="mt-8 text-center text-stone-500 text-xs flex justify-between items-center px-1">
            <span>Real-time WebSocket PvP</span>
            <span>Vercel Deployable</span>
          </div>
        </div>
      )}

      {status === 'rules' && (
        <div className="max-w-lg w-full p-8 bg-stone-800 rounded-2xl shadow-2xl border-2 border-amber-500/50 animate-fade-in">
           <h2 className="text-3xl font-bold text-amber-500 mb-6 text-center">How to Play</h2>
           <div className="space-y-4 text-stone-300 mb-8 text-sm md:text-base leading-relaxed">
              <p className="bg-black/30 p-3 rounded-xl border border-white/5">
                 <span className="text-amber-400 font-bold block mb-1">Turn Actions</span>
                 You can play <span className="text-white font-bold">1 Card</span> into your formation for free each turn, or pay <span className="text-yellow-400 font-bold">2 Stamina</span> for each extra card played that turn! Plus perform up to <span className="text-white font-bold">1 Attack</span> and <span className="text-white font-bold">1 Ability</span> if stamina permits.
              </p>
              <p className="text-xs text-stone-500 italic text-center">
                 Cards are drawn automatically from your deck. Discards are reshuffled if deck empties.
              </p>
           </div>
           <button 
             onClick={confirmStart}
             className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-black text-xl rounded-xl shadow-lg transition-transform hover:scale-105 border-b-4 border-green-800 cursor-pointer"
           >
             START MATCH
           </button>
        </div>
      )}
    </div>
  );
};

export default App;
