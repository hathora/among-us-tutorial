import { AnimatedSprite, Application, Loader, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { InterpolationBuffer } from "interpolation-buffer";
import { HathoraClient, UpdateArgs } from "../.hathora/client";
import { GameState, Player, UserId } from "../../api/types";

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
const connection = await getClient(({ state, updatedAt }) => {
  if (state.players.find((player) => player.id === user.id) === undefined) {
    connection.joinGame({});
  }
  if (buffer === undefined) {
    buffer = new InterpolationBuffer(state, 100, lerp);
  } else {
    buffer.enqueue(state, updatedAt);
  }
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

viewport.on("clicked", (e) => connection.moveTo({ location: { x: e.world.x, y: e.world.y } }));

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
