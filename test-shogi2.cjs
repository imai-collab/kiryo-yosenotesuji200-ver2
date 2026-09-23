const { Shogi } = require('shogi.js');
const shogi = new Shogi();
shogi.initializeFromSFENString("9/9/9/9/9/9/9/9/9 b - 1");
shogi.drop(5, 5, 'FU');
console.log(shogi.toSFENString(1));
let p = shogi.get(5, 5);
console.log("Piece at 5,5:", p);

// Try to remove it using board. board size?
console.log("Board length:", shogi.board.length);
console.log("Board[0] length:", shogi.board[0].length);

// Let's find where 5,5 is
for(let x=0; x<9; x++){
  for(let y=0; y<9; y++){
    if(shogi.board[x][y]) {
      console.log(`Found piece at board[${x}][${y}]`);
      shogi.board[x][y] = null;
    }
  }
}
console.log("After manual remove:", shogi.toSFENString(1));
