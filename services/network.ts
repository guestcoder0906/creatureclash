
import { GameAction } from '../types';

// Network service disabled for Single Player mode
export class NetworkService {
  constructor(onAction: (action: GameAction) => void) {}

  public async init(id?: string): Promise<string> {
    return "offline";
  }

  public connect(hostId: string): Promise<void> {
    return Promise.resolve();
  }

  public send(action: GameAction) {
    // No-op
  }
  
  public setOnAction(cb: (action: GameAction) => void) {
    // No-op
  }
}
