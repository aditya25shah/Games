export function setupControls(playerMove, playerRotate, playerDrop) {

  document.addEventListener("keydown", event => {

    switch(event.key) {

      case "ArrowLeft":
        playerMove(-1);
        break;

      case "ArrowRight":
        playerMove(1);
        break;

      case "ArrowDown":
        playerDrop();
        break;

      case "ArrowUp":
        playerRotate();
        break;

    }

  });

}