/*
 * www/js/modules/screens/movie_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
 */

import { UIScreen } from "./ui_screen.mjs";
import { ClientSnapshotMessage, AuthoritativeStateMessage } from "../messages.mjs";

const GameState =
{
    SubmitPrompts:  "SubmitPrompts" // select a movie, fill out cast prompts, submit
};
Object.freeze(GameState);

class MovieGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // UI
    _movieButtons;
    _castMemberContainers;  // cast member container divs containing the original cast member name and prompt field
    _castMemberNames;       // cast member name spans
    _castMemberPrompts;     // cast member prompt text fields
    _submitButton;

    // State
    _ourClientId;
    _clientIds;
    _gameState;

    // Movie name -> cast members
    _castMembersByMovie =
    {
        "Bloodsport":       [ "Frank Dux", "Chong Li" ],
        "The Hangover":     [ "Phil", "Stu", "Alan" ],
        "Star Wars":        [ "Luke Skywalker", "Han Solo", "Princess Leia", "Chewbacca" ],
        "Step Brothers":    [ "Brennan", "Dale" ]
    };

    get className()
    {
        return MovieGameScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof ClientSnapshotMessage)
        {
            // Client snapshot indicates someone joined or left. We must sent a state update in return.
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            this._sendMessageFn(new AuthoritativeStateMessage(this.className, {}));
            this._sendPeerState();  // peer state after authoritative state
        }
    }

    _sendPeerState()
    {
    }

    _onMovieButtonClicked(button)
    {
        let self = this;

        let movieName = button.innerHTML;
        console.log("Clicked movie: " + movieName);

        // Get the cast members that need replacing
        if (!(movieName in this._castMembersByMovie))
        {
            console.log("Unknown movie: " + movieName);
            return;
        }

        let castMemberNames = this._castMembersByMovie[movieName];
        if (this._castMemberContainers.length < castMemberNames.length)
        {
            console.log("Insufficient cast member divs for movie " + movieName + " with " + castMemberNames.length + " cast members");
        }

        // Enable the required number of cast member slots
        this._castMemberContainers.hide();
        for (let i = 0; i < this._castMemberContainers.length; i++)
        {
            // Clear field
            $(this._castMemberPrompts[i]).val("");

            // Make sure text field listeners are set up
            $(this._castMemberPrompts[i]).off("input").on("input", e => self._onCastMemberPromptChanged());
        }
        for (let i = 0; i < Math.min(this._castMemberContainers.length, castMemberNames.length); i++)
        {
            $(this._castMemberContainers[i]).show();
            $(this._castMemberNames[i]).text(castMemberNames[i]);
        }

        // Initially disable submit button
        this._submitButton.hide();
    }

    _onCastMemberPromptChanged()
    {
        // Check if all visible prompts have been filled out
        let allFilledOut = true;
        for (let i = 0; i < this._castMemberContainers.length; i++)
        {
            if ($(this._castMemberContainers[i]).is(":visible"))
            {
                if ($(this._castMemberPrompts[i]).val().trim().length == 0)
                {
                    // One of the visible prompts is empty, cannot proceed
                    allFilledOut = false;
                    break;
                }
            }
        }

        // Enable submit button if all prompts filled out
        if (allFilledOut)
        {
            this._submitButton.show();
        }
        else
        {
            this._submitButton.hide();
        }
    }

    _setLocalGameState(state)
    {
        let self = this;
        this._gameState = state;
        switch (state)
        {
            default:
                console.log("Error: Unhandled state: " + state);
                break;
            case GameState.SubmitPrompts:
                this._movieButtons.show();
                this._castMemberContainers.hide();
                for (let button of this._movieButtons)
                {
                    $(button).off("click").click(() => self._onMovieButtonClicked(button));
                }
                this._submitButton.hide();
                break;
        }
    }

    constructor(ourClientId, gameId, gameClientIds, sendMessageFn)
    {
        super();
        let self = this;

        this._ourClientId = ourClientId;
        this._clientIds = gameClientIds.slice();

        this._sendMessageFn = sendMessageFn;

        this._movieButtons = $("#MovieGameScreen .button");
        this._castMemberContainers = $("#MovieGameScreen .cast-member");
        this._castMemberNames = $(this._castMemberContainers).find(".cast-member-name");
        this._castMemberPrompts = $(this._castMemberContainers).find(".cast-member-prompt");
        this._submitButton = $("#MovieGameScreen #SubmitCastButton");

        this._movieButtons.hide();
        this._castMemberContainers.hide();
        this._submitButton.hide();

        $("#MovieGameScreen").show();
        this._setLocalGameState(GameState.SubmitPrompts);
    }
}

export { MovieGameScreen };