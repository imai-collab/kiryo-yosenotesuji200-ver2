const ShogiObj = require('shogi.js');
const Shogi = ShogiObj.Shogi || ShogiObj.default;
const shogi = new Shogi();
shogi.initializeFromSFENString("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1");
console.log(shogi.toSFENString(1));
let count = 0;
for(let x=0; x<9; x++){
  for(let y=0; y<9; y++){
    if(shogi.board[x][y]) {
      shogi.board[x][y] = null;
      count++;
    }
  }
}
console.log(`Removed ${count}`);
console.log("After manual remove:", shogi.toSFENString(1));
