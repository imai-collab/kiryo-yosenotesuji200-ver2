const ShogiObj = require('shogi.js');
const Shogi = ShogiObj.Shogi || ShogiObj.default;
const Piece = ShogiObj.Piece;
console.log("Piece function:", Piece);
const shogi = new Shogi();
shogi.initializeFromSFENString("9/9/9/9/9/9/9/9/9 b - 1");

if(Piece) {
  shogi.board[4][4] = new Piece('+FU');
  console.log(shogi.toSFENString(1));
} else {
  console.log("Piece not found");
}
