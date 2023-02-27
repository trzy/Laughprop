/*
 * www/js/modules/utils.mjs
 * Bart Trzynadlowski, 2023
 *
 * Misc. helper functions.
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

function generateUuid()
{
    if (window.crypto && window.crypto.randomUUID)
    {
        return crypto.randomUUID();
    }
    else
    {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    }
}

export { generateGameId, generateUuid }