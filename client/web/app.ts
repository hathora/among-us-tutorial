import { AnimatedSprite, Application, Loader, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { InterpolationBuffer } from "interpolation-buffer";
import { HathoraClient, UpdateArgs } from "../.hathora/client";
import { GameState, GameStatus, Player, UserId } from "../../api/types";

const app = new Application({ resizeTo: window });
document.body.appendChild(app.view);

const { backgroundTexture, idleTextures, walkingTextures } = await loadTextures();
const viewport = setupViewport();
app.stage.addChild(viewport);
viewport.addChild(new Sprite(backgroundTexture));

const client = new HathoraClient();
if (sessionStorage.getItem("token") === null) {
  sessionStorage.setItem("token", await client.loginAnonymous());
}
const token = sessionStorage.getItem("token")!;
const user = HathoraClient.getUserFromToken(token);

let buffer: InterpolationBuffer<GameState> | undefined;
let currState : GameState = {gameStatus: GameStatus.WAITING, players: [], crewBodies: []};
const connection = await getClient(({ state, updatedAt, events }) => {
  // Join the game on server.
  if (state.players.find((player) => player.id === user.id) === undefined) {
    connection.joinGame({});
  }

  // Used only for debugging.
  if (events.length > 0) {
    console.log(events)
  }
  for (const player of state.players) {
    console.log(player);
  }
  for (const body of state.crewBodies) {
    console.log(body);
  }

  // Deal with changes to game status.
  // This seems to run into issues when the client disconnects-- in that case, the curr state
  // seems to reset to waiting and the user gets a duplicated game starting screen. In that case,
  // there's at least a couple of ways to handle this:
  // - Use events instead of keeping track of previous server state on the client side.
  // - On the server, when a client reconnects, send the last couple of timestamps from the server side. Unknown atm if this is a common use case.
  // - In the API, have an additional boolean that indicates whether something is in transitional state. Remove transitional state on server once done. 
  // The above could alternatively be implemented with separate gamestatus enums for transitional states.
  // TODO: confirm that this is the case and fix this behavior.
  gameStatusChange(currState, state);

  // Move the players across the map.
  if (buffer === undefined) {
    buffer = new InterpolationBuffer(state, 100, lerp);
  } else {
    buffer.enqueue(state, updatedAt);
  }
  currState = state
});

function setupViewport() {
  const vp = new Viewport({
    screenWidth: app.view.width,
    screenHeight: app.view.height,
    worldWidth: backgroundTexture.width,
    worldHeight: backgroundTexture.height,
    interaction: app.renderer.plugins.interaction,
  });
  vp.setZoom(0.5);
  window.onresize = () => vp.resize();
  return vp;
}

function gameStatusChange(oldState: GameState, newState: GameState) {
  if (oldState.gameStatus === newState.gameStatus) {
    return
  } else if (newState.gameStatus === GameStatus.ONGOING) {
    window.alert("Game starting")
  } else if (newState.gameStatus === GameStatus.CREW_WON) {
    window.alert("Crew won")
  } else if (newState.gameStatus === GameStatus.IMPOSTER_WON) {
    window.alert("Imposters won")
  }
}

async function getClient(onStateChange: (args: UpdateArgs) => void) {
  if (location.pathname.length > 1) {
    return client.connect(token, location.pathname.split("/").pop()!, onStateChange, console.error);
  } else {
    const stateId = await client.create(token, {});
    history.pushState({}, "", `/${stateId}`);
    return client.connect(token, stateId, onStateChange, console.error);
  }
}

function lerp(from: GameState, to: GameState, pctElapsed: number): GameState {
  return {
    players: to.players.map((toPlayer) => {
      const fromPlayer = from.players.find((p) => p.id === toPlayer.id);
      return fromPlayer !== undefined ? lerpPlayer(fromPlayer, toPlayer, pctElapsed) : toPlayer;
    }),
  };
}

function lerpPlayer(from: Player, to: Player, pctElapsed: number): Player {
  return {
    id: from.id,
    location: {
      x: from.location.x + (to.location.x - from.location.x) * pctElapsed,
      y: from.location.y + (to.location.y - from.location.y) * pctElapsed,
    },
  };
}

viewport.on("clicked", (e) => {
  connection.moveTo({ location: { x: e.world.x, y: e.world.y } })
  .then(response => {
    if (response.hasOwnProperty('error')) {
      window.alert(response.error)
    }
  })
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    connection.attack({}).then(response => {
      if (response.hasOwnProperty('error')) {
        window.alert(response.error)
      }
    });
  }
})

const playerSprites: Map<UserId, AnimatedSprite> = new Map();
app.ticker.add(() => {
  if (buffer === undefined) {
    return;
  }
  const state = buffer.getInterpolatedState(Date.now());
  state.players.forEach((player) => {
    if (!playerSprites.has(player.id)) {
      const playerSprite = new AnimatedSprite(idleTextures);
      playerSprite.anchor.set(0.5, 1);
      playerSprite.setTransform(player.location.x, player.location.y);
      if (player.id === user.id) {
        viewport.follow(playerSprite);
      }
      viewport.addChild(playerSprite);
      playerSprites.set(player.id, playerSprite);
    } else {
      const playerSprite = playerSprites.get(player.id)!;
      const dx = player.location.x - playerSprite.x;
      const dy = player.location.y - playerSprite.y;
      if (dx === 0 && dy === 0) {
        playerSprite.textures = idleTextures;
      } else {
        if (!playerSprite.playing) {
          playerSprite.textures = walkingTextures;
          playerSprite.animationSpeed = 0.3;
          playerSprite.play();
        }
        playerSprite.setTransform(player.location.x, player.location.y);
        if (dx > 0) {
          playerSprite.scale.x = 1;
        } else if (dx < 0) {
          playerSprite.scale.x = -1;
        }
      }
    }
  });
});

function loadTextures(): Promise<{ backgroundTexture: Texture; idleTextures: Texture[]; walkingTextures: Texture[] }> {
  return new Promise((resolve) => {
    new Loader()
      .add("background", "The_Skeld_map.png")
      .add("character", "idle.png")
      .add("walk", "walk.json")
      .load((_, resources) => {
        resolve({
          backgroundTexture: resources.background.texture!,
          idleTextures: [resources.character.texture!],
          walkingTextures: resources.walk.spritesheet!.animations.walkcolor,
        });
      });
  });
}
