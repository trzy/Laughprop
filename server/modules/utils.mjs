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

// Votes are an array of values. The result is also an array in case there is a tie.
function tallyVotes(votes)
{
    // Count votes for each value
    const numVotesByValue = {};
    let highestVoteCount = 0;
    for (const value of votes)
    {
        if (!(value in numVotesByValue))
        {
            numVotesByValue[value] = 1;
        }
        else
        {
            numVotesByValue[value] += 1;
        }

        if (numVotesByValue[value] > highestVoteCount)
        {
            highestVoteCount = numVotesByValue[value];
        }
    }

    // Return the highest-voted values
    const winningValues = [];
    for (const [value, numVotes] of Object.entries(numVotesByValue))
    {
        if (numVotes == highestVoteCount)
        {
            winningValues.push(value);
        }
    }

    return winningValues;
}

export { generateSessionId, tallyVotes }