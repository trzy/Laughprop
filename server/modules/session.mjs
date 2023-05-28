/*
 * session.mjs
 * Bart Trzynadlowski, 2023
 *
 * Manages a game session.
 */

import { randomChoice, tallyVotes } from "./utils.mjs";
import { Game } from "./game.mjs";
import * as themed_image_game from "./games/themed_image.mjs";
import * as movie_game from "./games/movies.mjs";
import * as drawing_game from "./games/drawing_game.mjs";

class Session
{
    _sessionId;
    _sendMessageToClientFn;     // sendMessage(clientId, msg);
    _terminateSessionFn;        // terminateSession(session, gameInterruptedReason);
    _imageGenerator;            // image generator object
    _clientIds = new Set();     // set of clients
    _gameVoteByClientId = {};   // game selections, when this is not empty, voting is in progress
    _game;

    id()
    {
        return this._sessionId;
    }

    // Returns true if client was accepted into game session, otherwise false if game is full.
    tryAddClientIfAccepting(clientId)
    {
        if (this.isGameInProgress())
        {
            // Game in progress, reject.
            return false;
        }
        this._clientIds.add(clientId);
        return true;
    }

    removeClient(clientId)
    {
        this._clientIds.delete(clientId);
        delete this._gameVoteByClientId[clientId];

        // If we are in game selection state, try tallying vote and start game
        if (this.isGameSelectionInProgress())
        {
            this._tryStartGame();
        }
    }

    hasClient(clientId)
    {
        return this._clientIds.has(clientId);
    }

    numClients()
    {
        return this._clientIds.size;
    }

    isGameInProgress()
    {
        return this._game != null && !this._game.isFinished();
    }

    isGameSelectionInProgress()
    {
        // Game selection occurs only before any game has ever been chosen and played
        return !this._game;
    }

    voteForGame(clientId, gameName)
    {
        this._gameVoteByClientId[clientId] = gameName;
        this._tryStartGame();
    }

    resetVotes()
    {
        this._gameVoteByClientId = {};
    }

    receiveInputFromClient(clientId, inputs)
    {
        // Pass to game, which makes it tick
        if (this._game)
        {
            this._game.receiveInputFromClient(clientId, inputs);

            // Once finished, remove session
            if (!this.isGameInProgress())
            {
                this._terminateSessionFn(this, null);
            }
        }
    }

    receiveImageResponse(clientId, destStateVar, imageByUuid)
    {
        // Pass to game, which makes it tick
        if (this._game)
        {
            this._game.receiveImageResponse(clientId, destStateVar, imageByUuid);

            // Once finished, remove session
            if (!this.isGameInProgress())
            {
                this._terminateSessionFn(this, null);
            }
        }
    }

    sendMessage(msg)
    {
        for (const clientId of this._clientIds)
        {
            this._sendMessageToClientFn(clientId, msg);
        }
    }

    _tryStartGame()
    {
        const numClientsVoted = Object.keys(this._gameVoteByClientId).length;
        if (numClientsVoted == this._clientIds.size && this._clientIds.size > 1)
        {
            const gameName = this._getVotedGame();
            this._startGame(gameName);
            this._gameVoteByClientId = {};
        }
    }

    _getVotedGame()
    {
        const gameNames = Object.values(this._gameVoteByClientId);  // array of game names
        const winningGames = tallyVotes(gameNames);
        return winningGames.length == 1 ? winningGames[0] : randomChoice(winningGames);
    }

    _startGame(gameName)
    {
        console.log(`Starting game: ${gameName}`);
        switch (gameName)
        {
        default:
        case "It's a Mood":
            this._game = new Game(themed_image_game.script, this._clientIds, this._sendMessageToClientFn, this._imageGenerator);
            this._game.start();
            break;
        case "I'd Watch That":
            this._game = new Game(movie_game.script, this._clientIds, this._sendMessageToClientFn, this._imageGenerator);
            this._game.start();
            break;
        case "Drawing Game":
            this._game = new Game(drawing_game.script, this._clientIds, this._sendMessageToClientFn, this._imageGenerator);
            this._game.start();
            break;
        }
    }

    constructor(sessionId, sendMessageToClientFn, terminateSessionFn, imageGenerator)
    {
        this._game = null;
        this._sessionId = sessionId;
        this._sendMessageToClientFn = sendMessageToClientFn;
        this._terminateSessionFn = terminateSessionFn;
        this._imageGenerator = imageGenerator;
    }
}

export
{
    Session
}