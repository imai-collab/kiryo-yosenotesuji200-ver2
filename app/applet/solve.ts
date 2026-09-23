import * as ShogiModule from "shogi.js";
const Shogi = (ShogiModule as any).Shogi || (ShogiModule as any).default || ShogiModule;
const shogi = new Shogi();
shogi.initializeFromSFENString("9/9/9/9/9/9/9/9/9 b - 1");
shogi.drop(5, 5, "FU");
console.log("No args:", shogi.toSFENString && shogi.toSFENString());
console.log("Arg 1:", shogi.toSFENString && shogi.toSFENString(1));
