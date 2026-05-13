export function collide(
  board,
  piece
) {

  for(let y = 0; y < piece.shape.length; y++) {

    for(let x = 0; x < piece.shape[y].length; x++) {

      if(
        piece.shape[y][x] &&
        (
          board[y + piece.y] === undefined ||

          board[y + piece.y][x + piece.x] === undefined ||

          board[y + piece.y][x + piece.x] !== 0
        )
      ) {

        return true;

      }

    }

  }

  return false;
}