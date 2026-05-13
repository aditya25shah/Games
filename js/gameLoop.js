export function startGameLoop(update) {

  let lastTime = 0;

  function loop(time = 0) {

    const delta = time - lastTime;

    lastTime = time;

    update(delta);

    requestAnimationFrame(loop);

  }

  requestAnimationFrame(loop);

}