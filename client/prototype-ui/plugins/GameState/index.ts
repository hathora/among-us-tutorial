import { GameState } from "../../../../api/types";
import { HathoraConnection } from "../../../.hathora/client";

export default class GameStatePlugin extends HTMLElement {
  val!: GameState;
  state!: GameState;
  client!: HathoraConnection;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    canvas.style.border = "1px solid black";
    canvas.onclick = (e: MouseEvent) => {
      this.client?.moveTo({ location: { x: e.offsetX, y: e.offsetY } });
    };
    this.shadowRoot!.append(canvas);
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "black";
      this.state.players.forEach((player) => {
        ctx.beginPath();
        ctx.arc(player.location.x, player.location.y, 15, 0, 2 * Math.PI);
        ctx.stroke();
      });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }
}
