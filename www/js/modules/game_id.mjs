/*
 * www/js/modules/game_id.mjs
 * Bart Trzynadlowski, 2023
 *
 * Functions for generating a unique game ID.
 */

function generateGameId()
{
    let result = "";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let counter = 0;
    while (counter < 4)
    {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
      counter += 1;
    }
    return result;
}

export { generateGameId }