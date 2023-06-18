/**
 ** Laughprop
 ** A Stable Diffusion Party Game
 ** Copyright 2023 Bart Trzynadlowski, Steph Ng
 ** 
 ** This file is part of Laughprop.
 **
 ** Laughprop is free software: you can redistribute it and/or modify it under
 ** the terms of the GNU General Public License as published by the Free
 ** Software Foundation, either version 3 of the License, or (at your option)
 ** any later version.
 **
 ** Laughprop is distributed in the hope that it will be useful, but WITHOUT
 ** ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 ** FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 ** more details.
 **
 ** You should have received a copy of the GNU General Public License along
 ** with Laughprop.  If not, see <http://www.gnu.org/licenses/>.
 **/

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

// Randomly selects a value from the given array.
function randomChoice(values)
{
    return values[Math.floor(Math.random() * values.length)];
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

export { generateSessionId, randomChoice, tallyVotes }