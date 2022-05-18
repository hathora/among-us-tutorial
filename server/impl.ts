import { Methods, Context } from "./.hathora/methods";
import { Response } from "../api/base";
import { Location, GameState, UserId, IInitializeRequest, IJoinGameRequest, IMoveToRequest, GameStatus, Team } from "../api/types";

type InternalPlayer = { id: UserId; location: Location; target?: Location, team: Team };
type InternalState = { gameStatus: GameStatus, players: InternalPlayer[] };

export class Impl implements Methods<InternalState> {
  initialize(ctx: Context, args: IInitializeRequest): InternalState {
    return { gameStatus: GameStatus.WAITING, players: [] };
  }
  joinGame(state: InternalState, userId: UserId, ctx: Context, request: IJoinGameRequest): Response {
    if (state.players.find((p) => p.id === userId) !== undefined) {
      return Response.error("Already joined");
    }
    if (state.gameStatus !== GameStatus.WAITING) {
      return Response.error("Game is no longer accepting new players")
    }
    state.players.push({ id: userId, location: { x: 4900, y: 1700 }, team: Team.UNDETERMINED });
    if (state.players.length == 2) {
      // Assign players to a team and start the game.
      const teams = this.getRandomTeams()
      for (let i = 0; i < teams.length; i++) {
        state.players[i].team = teams[i]
      }
      state.gameStatus = GameStatus.ONGOING
    }
    return Response.ok();
  }
  
  // TODO: Implement a real randomly generated array.
  getRandomTeams(): Array<Team> {
    if (Math.random() < .5) {return [Team.CREW, Team.IMPOSTER]}
    return [Team.IMPOSTER, Team.CREW]
  }

  moveTo(state: InternalState, userId: UserId, ctx: Context, request: IMoveToRequest): Response {
    if (state.gameStatus === GameStatus.WAITING) {
      return Response.error("Game has not started yet")
    }
    if (state.gameStatus === GameStatus.CREW_WON || state.gameStatus === GameStatus.IMPOSTER_WON) {
      return Response.error("Game already finished")
    }
    const player = state.players.find((p) => p.id === userId);
    if (player === undefined) {
      return Response.error("Not joined");
    }
    player.target = request.location;
    // Example broadcast event.
    ctx.broadcastEvent(`Player ${player.id} moving to target location ${player.target}`)
    return Response.ok();
  }
  getUserState(state: InternalState, userId: UserId): GameState {
    return state;
  }
  onTick(state: InternalState, ctx: Context, timeDelta: number): void {
    const PLAYER_SPEED = 300;
    for (const player of state.players) {
      if (player.target !== undefined) {
        const dx = player.target.x - player.location.x;
        const dy = player.target.y - player.location.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pixelsToMove = PLAYER_SPEED * timeDelta;
        if (dist <= pixelsToMove) {
          player.location = player.target;
        } else {
          player.location.x += (dx / dist) * pixelsToMove;
          player.location.y += (dy / dist) * pixelsToMove;
        }
      }
    }
  }
}
