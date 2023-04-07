/*
 * utils.mjs
 * Bart Trzynadlowski, 2023
 *
 * Misc. helper functions.
 */

function generateSessionId()
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

export { generateSessionId }