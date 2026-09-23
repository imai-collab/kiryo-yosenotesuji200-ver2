const Shogi = require("shogi.js").Shogi;
const shogi = new Shogi();
shogi.initializeFromSFENString("9/9/9/9/9/9/9/9/9 b - 1");
shogi.drop(5, 5, "FU");
console.log("No args:", shogi.toSFENString && shogi.toSFENString());
console.log("Arg 1:", shogi.toSFENString && shogi.toSFENString(1));
