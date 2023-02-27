/*
 * www/js/modules/screens/funniest_image_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
 *
 * TODO:
 * -----
 * - Set a timer when submitting image requests and if it triggers before images are returned,
 *   print an error.
 */

import { UIScreen } from "./ui_screen.mjs";
import { ClientSnapshotMessage, AuthoritativeStateMessage, Txt2ImgRequestMessage, ImageResponseMessage } from "../messages.mjs";
import { generateUuid } from "../utils.mjs";

const GameState =
{
    Prompt: "Prompt",           // user must type and submit a prompt
    WaitImages: "WaitImages",   // wait for images to come back
    SubmitImage: "SubmitImage", // select which image to submit for the previous prompt
    VoteImage: "VoteImage",     // vote on other users' images
    ShowWinner: "ShowWinner"    // show the winner
};
Object.freeze(GameState);

class AuthoritativeState
{
    promptNumber = 0;   // which prompt number are we on
}

class FunniestImageGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // UI
    _instructions;
    _promptContainer;
    _promptField;
    _submitPromptButton;
    _imageCarouselContainer;

    // State
    _ourClientId;
    _clientIds;
    _promptNumber = 0;
    _gameState = GameState.Prompt;
    _imageRequestId = null;

    get className()
    {
        return FunniestImageGameScreen.name;
    }

    onMessageReceived(msg)
    {
        if (msg instanceof AuthoritativeStateMessage)
        {
            this._applyAuthoritativeState(msg.state);
        }
        else if (msg instanceof ClientSnapshotMessage)
        {
            // Client snapshot indicates someone joined or left. We must sent a state update in return.
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            this._sendAuthoritativeState();
            //this._sendPeerState();  // peer state after authoritative state
        }
        else if (msg instanceof ImageResponseMessage)
        {
            // Move forward if we were expecting this image
            if (this._gameState == GameState.WaitImages && this._imageRequestId == msg.request_id)
            {
                this._setLocalGameState(GameState.SubmitImage);

                // Place images in selection carousel
                let imgs = $("#FunniestImageGameScreen").find("img");
                for (let i = 0; i < Math.min(msg.images.length, imgs.length); i++)
                {
                    imgs[i].src = "data:image/jpeg;base64," + msg.images[i];
                }
            }
            else
            {
                console.log("Error: Unexpected ImageResponseMessage with request_id=" + msg.request_id + ". Our state=" + this._gameState + ", request ID=" + this._imageRequestId);
            }
        }
    }

    _sendAuthoritativeState()
    {
        let state = new AuthoritativeState();
        state.promptNumber = this._promptNumber;
        let msg = new AuthoritativeStateMessage(this.className, state);
        this._sendMessageFn(msg);
    }

    _sendPeerState()
    {
    }

    _applyAuthoritativeState(state)
    {
        if (Object.keys(state) == 0)
        {
            // Empty objects can occur when other screens transition to this one, and we should just substitute a default object
            state = new AuthoritativeState();
        }

        // Handle state change
        if (state.promptNumber != this._promptNumber)
        {
            this._setLocalGameState(GameState.Prompt, state.promptNumber);
        }
    }

    _onSubmitPromptButtonClicked()
    {
        let prompt = this._promptField.val();
        if (!prompt || prompt.length <= 0)
        {
            return;
        }
        this._imageRequestId = generateUuid();
        let msg = new Txt2ImgRequestMessage(prompt, this._imageRequestId);
        this._sendMessageFn(msg);
        this._setLocalGameState(GameState.WaitImages);
    }

    _setLocalGameState(state, promptNumber = null)
    {
        this._gameState = state;
        if (promptNumber != null)
        {
            this._promptNumber = promptNumber;
        }

        let self = this;

        switch (state)
        {
            default:
                console.log("Error: Unhandled state: " + state);
                break;
            case GameState.Prompt:
                if (this._promptNumber == 0)
                {
                    // First prompt. Give overview of entire game.
                    this._instructions.text("Themes will be presented. Write descriptions to generate the funniest images and vote for the winners.");
                }
                else
                {
                    // Subsequent prompts. More brevity.
                    this._instructions.text("Describe a scene that best fits the theme.");
                }
                this._instructions.show();
                this._promptContainer.show();
                this._promptField.val("");
                this._submitPromptButton.off("click").click(function() { self._onSubmitPromptButtonClicked() });
                this._imageCarouselContainer.hide();
                this._imageRequestId = null;
                break;
            case GameState.WaitImages:
                this._instructions.text("Hang tight. Generating images...");
                this._instructions.show();
                this._promptContainer.hide();
                this._imageCarouselContainer.hide();
                break;
            case GameState.SubmitImage:
                this._instructions.text("Select a generated image to use.")
                this._instructions.show();
                this._promptContainer.hide();
                this._imageCarouselContainer.show();
                this._imageRequestId = null;
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

        this._instructions = $("#FunniestImageGameScreen #Instructions");
        this._promptContainer = $("#FunniestImageGameScreen #Prompt");
        this._promptField = $("#FunniestImageGameScreen #PromptTextField");
        this._submitPromptButton = $("#FunniestImageGameScreen #SubmitButton");
        this._imageCarouselContainer = $("#FunniestImageGameScreen #Carousel");

        this._promptContainer.hide();
        this._imageCarouselContainer.hide();

        this._setLocalGameState(GameState.Prompt, 0);
        $("#FunniestImageGameScreen").show();
    }
}

export { FunniestImageGameScreen };