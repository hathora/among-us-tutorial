import { Methods, Context } from "./.hathora/methods";
import { Response } from "../api/base";
import { Location, GameState, UserId, IInitializeRequest, IJoinGameRequest, IMoveToRequest, IAttackRequest, GameStatus, Team, PlayerStatus, CrewBody } from "../api/types";

type InternalPlayer = { id: UserId; location: Location; target?: Location, team: Team, status: PlayerStatus };
type InternalState = { gameStatus: GameStatus, players: InternalPlayer[], crewBodies: CrewBody[] };

export class Impl implements Methods<InternalState> {
  initialize(ctx: Context, args: IInitializeRequest): InternalState {
    return { gameStatus: GameStatus.WAITING, players: [], crewBodies: [] };
  }
  joinGame(state: InternalState, userId: UserId, ctx: Context, request: IJoinGameRequest): Response {
    if (state.players.find((p) => p.id === userId) !== undefined) {
      return Response.error("Already joined");
    }
    if (state.gameStatus !== GameStatus.WAITING) {
      return Response.error("Game is no longer accepting new players")
    }
    state.players.push({ id: userId, location: { x: 4900, y: 1700 }, team: Team.UNDETERMINED, status: PlayerStatus.ALIVE });
    const playersPerGame = 4;
    if (state.players.length == playersPerGame) {
      // Assign players to a team and start the game.
      const teams = this.getRandomTeams(playersPerGame)
      for (let i = 0; i < teams.length; i++) {
        state.players[i].team = teams[i]
      }
      state.gameStatus = GameStatus.ONGOING
    }
    return Response.ok();
  }
  
  // TODO: Implement a real randomly generated array with potentially multiple imposters.
  getRandomTeams(numPlayers: number): Team[] {
    let teams = new Array(numPlayers).fill(Team.CREW);
    const imposterIndex = Math.floor(Math.random() * teams.length);
    teams[imposterIndex] = Team.IMPOSTER;
    return teams;
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

  attack(state: InternalState, userId: UserId, ctx: Context, request: IAttackRequest): Response {
    const player = state.players.find((p) => p.id === userId);
    if (player === undefined) {
      return Response.error("Not joined");
    }
    if (player.team !== Team.IMPOSTER) {
      return Response.error("Only imposters may attack.");
    }
    const attackResults = this.tryAttack(player, state.players);
    if (attackResults.attackSuccessful) {
        attackResults.attackedPlayer!.status = PlayerStatus.GHOST;
        // TODO: check if Javascript makes a copy of location or a reference
        state.crewBodies.push({id: attackResults.attackedPlayer!.id, location: attackResults.attackedPlayer!.location})
        // Imposters win if there are no other live crew members left.
        if (!state.players.some((p) => p.team === Team.CREW && p.status === PlayerStatus.ALIVE)) {
          state.gameStatus = GameStatus.IMPOSTER_WON
        }
    }
    return Response.ok();
  }

  tryAttack(attacker: InternalPlayer, players: InternalPlayer[]): {attackSuccessful: boolean, attackedPlayer: InternalPlayer|null} {
    for (const player of players) {
      if (player.team !== Team.CREW || player.status !== PlayerStatus.ALIVE) {
        continue
      }
      const withinRadius = Math.sqrt((attacker.location.x - player.location.x)**2 + (attacker.location.y - player.location.y)**2) < 200;
      // TODO: Take the attacker's current and target location, attackee's current and target location,
      // and figure out if the attack would land.
      const inRightDirection = true;
      // For now, attacks can only kill one crew member. We can imagine game play where it can 
      // kill the crew member closest within range and in the closest direction, or kills all crew members if they fit the criteria.
      if (withinRadius && inRightDirection) {
        return {attackSuccessful: true, attackedPlayer: player}
      }
    }
    return {attackSuccessful: false, attackedPlayer: null}
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
