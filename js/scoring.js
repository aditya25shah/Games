export function updateScore(score) {

  const scoreElement =
    document.getElementById("score");

  scoreElement.innerText = score;

  scoreElement.classList.remove("score-pop");

  void scoreElement.offsetWidth;

  scoreElement.classList.add("score-pop");

}