/*
 * www/js/modules/screens/funniest_image_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
 *
 * Clients send their peer state to everyone else to communicate their individual decisions.
 * Transitions between local states occur when all expected peer state updates are received
 * and the authority makes a decision. The authoritative state message is then used to drive
 * everyone forward together.
 *
 * At the beginning of the game, a random theme is drawn and an authoritative state message is
 * used to synchronize everyone to that same prompt.
 *
 * Unfortunately, the authoritative state message currently does not allow a client to join in the
 * middle of a game and catch up. With some careful effort, this probably could be supported but
 * we would need to be aware of states that were irretrievably missed and ignore them for that
 * client.
 *
 * Note on Round Numbers
 * ---------------------
 * - Originally, the game was meant to have multiple rounds but was reduced to a single round
 *   number. Confusingly, many data structures, such as the ones in the PeerState, are encoded as
 *   arrays with each element representing the round. But because there is now a single round, the
 *   arrays will always be of length 1.
 *
 * TODO:
 * -----
 * - "Return to Lobby" button should either enter a state where we wait for everyone to make
 *   the same decision or send authoritative message but also enter a waiting state in case
 *   we are not the authority (otherwise, it appears button does nothing). Latter is easiest
 *   for now.
 * - Set a timer when submitting image requests and if it triggers before images are returned,
 *   print an error.
 * - Do not allow game to be joined once started (it's just not possible to resume).
 */

import { UIScreen } from "./ui_screen.mjs";
import { SelectGameScreen } from "./select_game.mjs";
import
{
    ClientSnapshotMessage,
    AuthoritativeStateMessage,
    PeerStateMessage,
    Txt2ImgRequestMessage,
    ImageResponseMessage,
    RequestCachedImagesMessage,
    CachedImagesMessage
} from "../messages.mjs";
import { generateUuid } from "../utils.mjs";

const GameState =
{
    WaitToStart: "WaitToStart",         // wait for the authority to determine the theme
    Prompt: "Prompt",                   // user must type and submit a prompt
    WaitOurImages: "WaitOurImages",     // wait for our images to come back
    SubmitImage: "SubmitImage",         // select which image to submit for the previous prompt
    WaitSubmissions: "WaitSubmissions", // wait for everyone to submit their images
    WaitOtherImages: "WaitOtherImages", // wait for everyone else's images
    VoteImage: "VoteImage",             // vote on other users' images
    WaitVotes: "WaitVotes",             // wait for votes to arrive
    ShowRoundWinner: "ShowRoundWinner"  // show the current round winner
};
Object.freeze(GameState);

class AuthoritativeState
{
    promptNumber = 0;   // which prompt number are we on
    winners = [];       // for each round number, a list of winners once we have them
}

// Peer state object (empty object is used if N/A)
class PeerState
{
    // Client's generated selections
    selectionRequestIds = [];   // array of selection request IDs so far, in order of round we are on (currently only one round supported)
    selectionIdxs = [];         // array of image indexes (associated with each request ID), in order of round number

    // Client's vote
    clientIdVotes = [];          // client ID of voted image
}

class CachedImage
{
    client_id;
    request_id;
    idx;
    image;

    constructor(client_id, request_id, idx, image)
    {
        this.client_id = client_id;
        this.request_id = request_id;
        this.idx = idx;
        this.image = image;
    }
}

class FunniestImageGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // UI
    _instructions;
    _promptContainer;
    _themeText;
    _promptField;
    _submitPromptButton;
    _imageCarouselContainer;
    _imageSelected;                     // this is a JQuery element
    _imageCarouselThumbnails = [];      // these are raw DOM elements
    _selectImageButton;
    _candidateImagesContainer;
    _voteImageButton;
    _winningImageContainer;
    _nextGameButton;

    // State
    _ourClientId;
    _clientIds;                         // most up-to-date set of clients -- use this to iterate all client ID-keyed maps (in case those maps contain disconnected clients)
    _promptNumber = -1;                 // current prompt number initalized to invalid value so that first authoritative message resets it
    _gameState = GameState.Prompt;
    _imageRequestId = null;             // images are uniquely identified in a game session by request ID and index (e.g., 0-3)
    _imageSelctionIdx = 0;
    _peerStateByClientId = {};          // everyone state, including our own (needed to make authoritative decisions about how/when to proceed forward)
    _cachedImagesByRequestIdAndIdx = {};    // cached images by "request_idx,id"
    _winningImageClientId;              // client ID of winning image
    _winners = [];                      // for each round number, an array of winning client IDs ([[...], [...], ...])

    // Theme for each prompt (also determines the number of prompts!)
    _promptThemes = [
        "Best place to hide in a zombie apocalypse.",
        "A hairy situation.",
        "Celebrities supplementing their income."
    ];

    get className()
    {
        return FunniestImageGameScreen.name;
    }

    onMessageReceived(msg)
    {
        let self = this;

        if (msg instanceof AuthoritativeStateMessage)
        {
            this._applyAuthoritativeState(msg.state);
        }
        else if (msg instanceof PeerStateMessage)
        {
            this._peerStateByClientId[msg.from_client_id] = msg.state;
            if (this._gameState == GameState.WaitSubmissions)
            {
                this._tryProceedToVoting();
            }
            else if (this._gameState == GameState.WaitVotes)
            {
                this._tryDeclareRoundWinner();
            }
        }
        else if (msg instanceof ClientSnapshotMessage)
        {
            // Client snapshot indicates someone joined or left. We must sent a state update in return.
            this._clientIds = msg.client_ids;
            console.log("Current number of clients: " + this._clientIds.length);
            this._sendAuthoritativeState();
            this._sendPeerState();  // peer state after authoritative state
        }
        else if (msg instanceof ImageResponseMessage)
        {
            // Move forward if we were expecting this image
            if (this._gameState == GameState.WaitOurImages && this._imageRequestId == msg.request_id)
            {
                this._setLocalGameState(GameState.SubmitImage);

                // Place images in selection carousel
                for (let i = 0; i < Math.min(msg.images.length, this._imageCarouselThumbnails.length); i++)
                {
                    this._imageCarouselThumbnails[i].src = "data:image/jpeg;base64," + msg.images[i];
                    $(this._imageCarouselThumbnails[i]).off("click").click(function() { self._onImageThumbnailClicked(i) });
                }
                this._onImageThumbnailClicked(0);
            }
            else
            {
                console.log("Error: Unexpected ImageResponseMessage with request_id=" + msg.request_id + ". Our state=" + this._gameState + ", request ID=" + this._imageRequestId);
            }
        }
        else if (msg instanceof CachedImagesMessage)
        {
            console.log("Received CachedImagesMessage");

            if (msg.request_ids.length == msg.images.length && msg.idxs.length == msg.images.length && msg.client_ids.length == msg.images.length)
            {
                for (let i = 0; i < msg.images.length; i++)
                {
                    let key = msg.request_ids[i] + "," + msg.idxs[i];
                    this._cachedImagesByRequestIdAndIdx[key] = new CachedImage(msg.client_ids[i], msg.request_ids[i], msg.idxs[i], msg.images[i]);
                }
            }

            if (this._gameState == GameState.WaitOtherImages)
            {
                this._populateCandidateImages(msg);
                this._setLocalGameState(GameState.VoteImage);
            }
        }
    }

    _sendAuthoritativeState()
    {
        let state = new AuthoritativeState();
        state.promptNumber = this._promptNumber;
        state.winners = this._winners;
        let msg = new AuthoritativeStateMessage(this.className, state);
        this._sendMessageFn(msg);
    }

    _sendPeerState()
    {
        // Always safe to send peer state (if nothing has yet been selected, its fields will be empty arrays)
        this._sendMessageFn(new PeerStateMessage(this._ourClientId, this.className, this._peerStateByClientId[this._ourClientId]));
    }

    _applyAuthoritativeState(state)
    {
        if (Object.keys(state) == 0)
        {
            // Empty objects can occur when other screens transition to this one, and we should just substitute a default object
            state = new AuthoritativeState();
        }

        // Handle state change
        if (state.promptNumber != this._promptNumber || this._gameState == GameState.WaitToStart)
        {
            this._setLocalGameState(GameState.Prompt, state.promptNumber);
        }

        // Always update winners
        this._winners = state.winners;
        this._tryShowRoundWinner();
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
        this._setLocalGameState(GameState.WaitOurImages);
    }

    _onImageThumbnailClicked(idx)
    {
        if (idx >= this._imageCarouselThumbnails.length)
        {
            return;
        }

        // De-select all thumbnails
        for (let i = 0; i < this._imageCarouselThumbnails.length; i++)
        {
            $(this._imageCarouselThumbnails[i]).removeClass("image-selected");
        }

        // Select our thumbnail
        $(this._imageCarouselThumbnails[idx]).addClass("image-selected");

        // Replace image preview with selection
        this._imageSelected.attr("src", this._imageCarouselThumbnails[idx].src);
        this._imageSelctionIdx = idx;
    }

    _onSelectImageButtonClicked()
    {
        // Add our selection to our peer state and broadcast it
        let ourState = this._peerStateByClientId[this._ourClientId];
        ourState.selectionRequestIds.push(this._imageRequestId);
        ourState.selectionIdxs.push(this._imageSelctionIdx);
        this._sendPeerState();

        // Advance state to wait until we get everyone else's submissions
        this._setLocalGameState(GameState.WaitSubmissions);
        this._tryProceedToVoting();
    }

    _tryProceedToVoting()
    {
        if (this._gameState != GameState.WaitSubmissions)
        {
            console.log("Error: _tryProceedToVoting() called in wrong state");
            return;
        }

        // Have we received everyone's submissions for this prompt number? _clientIds contains the
        // definitive list of active players.
        let numPrompts = 1;
        let receivedAll = true;
        for (let clientId of this._clientIds)
        {
            if (!(clientId in this._peerStateByClientId))
            {
                receivedAll = false;
                break;
            }

            // Make sure each client has recorded submissions for all prompts thus far
            let state = this._peerStateByClientId[clientId];
            if (state.selectionRequestIds.length != numPrompts || state.selectionIdxs.length != numPrompts)
            {
                receivedAll = false;
                break;
            }
        }

        // We can proceed if we received from everyone
        if (receivedAll)
        {
            console.log("Requesting images to vote on...");
            this._requestImagesToVoteOn();
            this._setLocalGameState(GameState.WaitOtherImages);
        }
        else
        {
            console.log("Unable to proceed to voting because not all responses have been received...", this._peerStateByClientId);
        }
    }

    _requestImagesToVoteOn()
    {
        // Ask server for everyone else's images
        let msg = new RequestCachedImagesMessage();
        for (let peerId of this._clientIds)
        {
            if (!(peerId in this._peerStateByClientId))
            {
                return;
            }
            let state = this._peerStateByClientId[peerId];
            let idx = 0;
            if (idx < state.selectionRequestIds.length && idx < state.selectionIdxs.length)
            {
                msg.request_ids.push(state.selectionRequestIds[idx]);
                msg.idxs.push(state.selectionIdxs[idx]);
            }
        }
        this._sendMessageFn(msg);
    }

    _populateCandidateImages(msg)
    {
        let self = this;

        this._winningImageClientId = null;

        // Remove any existing images
        $("#FunniestImageGameScreen #CandidateImages img").remove();

        // Create image elements that when clicked
        for (let i = 0; i < msg.client_ids.length; i++)
        {
            let img = $("<img>");
            img.attr("src", "data:image/jpeg;base64," + msg.images[i]);
            img.prop("clientId", msg.client_ids[i]);
            this._candidateImagesContainer.prepend(img);
            img.click(function() { self._onCandidateImageClicked(img, msg.client_ids[i]); });
        }

        // Disable the voting button until clicked
        this._voteImageButton.addClass("disabled");
        this._voteImageButton.show();
    }

    _onCandidateImageClicked(img, client_id)
    {
        // De-select all
        $("#FunniestImageGameScreen #CandidateImages img").removeClass("image-selected");

        // Select image
        this._winningImageClientId = client_id;
        img.addClass("image-selected");

        // Enable voting button
        this._voteImageButton.removeClass("disabled");
    }

    _onVoteImageButtonClicked()
    {
        if (this._voteImageButton.hasClass("disabled"))
        {
            return;
        }

        // Disable vote button
        this._voteImageButton.hide();

        // Add our vote to our peer state and broadcast it
        let ourState = this._peerStateByClientId[this._ourClientId];
        ourState.clientIdVotes.push(this._winningImageClientId);
        this._sendPeerState();

        // Advance state to wait until we get everyone else's submissions
        this._setLocalGameState(GameState.WaitVotes);
        this._tryDeclareRoundWinner();
    }

    _tryDeclareRoundWinner()
    {
        if (this._gameState != GameState.WaitVotes)
        {
            console.log("Error: _tryDeclareRoundWinner() called in wrong state");
            return;
        }

        let numPrompts = 1;
        if (this._winners.length >= numPrompts)
        {
            console.log("Error: Already declared a winner!");
            return;
        }

        // Have we received everyone's votes for this prompt number? _clientIds contains the
        // definitive list of active players.
        let receivedAll = true;
        let votesByClientId = {};
        for (let clientId of this._clientIds)
        {
            votesByClientId[clientId] = 0;
        }
        for (let clientId of this._clientIds)
        {
            if (!(clientId in this._peerStateByClientId))
            {
                receivedAll = false;
                break;
            }

            // Make sure each client has recorded votes for all prompts thus far
            let state = this._peerStateByClientId[clientId];
            if (state.clientIdVotes.length != numPrompts)
            {
                receivedAll = false;
                break;
            }
            else
            {
                // Count vote
                let id = this._peerStateByClientId[clientId].clientIdVotes[0];
                if (id in votesByClientId)
                {
                    // Count valid client IDs
                    votesByClientId[id] += 1;
                }
            }
        }

        // We can proceed if we received from everyone
        if (receivedAll)
        {
            // What was the highest number of votes
            let winningNumVotes = 0;
            for (const [id, numVotes] of Object.entries(votesByClientId))
            {
                winningNumVotes = Math.max(numVotes, winningNumVotes);
            }

            // Was it a tie? Determine winners.
            let winningClientIds = [];
            for (const [id, numVotes] of Object.entries(votesByClientId))
            {
                if (numVotes == winningNumVotes)
                {
                    winningClientIds.push(id);
                }
            }

            // Authoritative state update
            this._winners.push(winningClientIds);
            this._sendAuthoritativeState();
        }
        else
        {
            console.log("Unable to declare winner because not all responses have been received...", this._peerStateByClientId);
        }
    }

    _tryShowRoundWinner()
    {
        let self = this;

        if (this._gameState != GameState.WaitVotes)
        {
            return;
        }

        this._setLocalGameState(GameState.ShowRoundWinner);

        // Remove any existing images
        $("#FunniestImageGameScreen #WinningImage img").remove();

        // Create image elements for winner(s)
        if (this._winners.length == 1)
        {
            let winners = this._winners[0];

            // Find existing and make clones of the ones that are winners
            $("#FunniestImageGameScreen #CandidateImages img").each(function(idx)
            {
                // this refers to the element
                if (winners.includes($(this).prop("clientId")))
                {
                    // Create new that is a clone
                    let img = $("<img>");
                    img.attr("src", $(this).attr("src"));
                    self._winningImageContainer.prepend(img);
                }
                else
                {
                    console.log("Error: Could not find candidate image for client ID=" + $(this).prop("clientId"));
                }
            });
        }

        // Is there a tie?
        //TODO: print that we have a tie

        // Proceed back to game selection
        //TODO: make this button appear after a timeout since anyone can press it to send everyone back
        $(this._nextGameButton).off("click").click(function() { self._sendMessageFn(new AuthoritativeStateMessage(SelectGameScreen.name, {})); });
    }


    _setLocalGameState(state, promptNumber = null)
    {
        this._gameState = state;
        if (promptNumber != null)
        {
            this._promptNumber = promptNumber;
            console.log($`Set state=${state}, promptNumber=${promptNumber}`);
        }
        else
        {
            console.log($`Set state=${state}`);
        }

        let self = this;

        switch (state)
        {
            default:
                console.log("Error: Unhandled state: " + state);
                break;
            case GameState.WaitToStart:
                this._instructions.text("Sit tight while we get started...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.Prompt:
                this._instructions.text("Describe a scene that best fits the theme.");
                this._instructions.show();
                this._themeText.text(this._promptThemes[this._promptNumber]);
                this._promptContainer.show();
                this._promptField.val("");
                this._submitPromptButton.off("click").click(function() { self._onSubmitPromptButtonClicked() });
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.WaitOurImages:
                this._instructions.text("Just a moment. Generating images...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._winningImageContainer.hide();
                // Image request ID needed in this state
                break;
            case GameState.SubmitImage:
                this._instructions.text("Select a generated image to use.")
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(true);
                this._candidateImagesContainer.hide();
                this._winningImageContainer.hide();
                // Image request ID needed in this state
                break;
            case GameState.WaitSubmissions:
                this._instructions.text("Hang tight while everyone else makes their selections...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.WaitOtherImages:
                this._instructions.text("Receiving everyone's masterpieces...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.VoteImage:
                this._instructions.text("Pick the winner for this round!");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.show();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.WaitVotes:
                this._instructions.text("Waiting for everyone to vote...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.hide();
                break;
            case GameState.ShowRoundWinner:
                this._instructions.text("And the winner is...");
                this._instructions.show();
                this._promptContainer.hide();
                this._resetImageCarouselVisible(false);
                this._candidateImagesContainer.hide();
                this._imageRequestId = null;
                this._winningImageContainer.show();
                break;
        }
    }

    _resetImageCarouselVisible(visible)
    {
        if (visible)
        {
            this._imageCarouselContainer.show();
        }
        else
        {
            this._imageCarouselContainer.hide();
        }

        for (let i = 0; i < this._imageCarouselThumbnails.length; i++)
        {
            $(this._imageCarouselThumbnails[i]).off("click");
        }
    }

    constructor(ourClientId, gameId, gameClientIds, sendMessageFn)
    {
        super();
        let self = this;

        this._ourClientId = ourClientId;
        this._clientIds = gameClientIds.slice();
        this._peerStateByClientId[ourClientId] = new PeerState();

        this._sendMessageFn = sendMessageFn;

        this._instructions = $("#FunniestImageGameScreen #Instructions");
        this._promptContainer = $("#FunniestImageGameScreen #Prompt");
        this._themeText = $("#FunniestImageGameScreen #Theme");
        this._promptField = $("#FunniestImageGameScreen #PromptTextField");
        this._submitPromptButton = $("#FunniestImageGameScreen #SubmitButton");
        this._imageCarouselContainer = $("#FunniestImageGameScreen #Carousel");
        this._imageSelected = $("#FunniestImageGameScreen #Carousel #SelectedImage");
        this._imageCarouselThumbnails = $("#FunniestImageGameScreen").find("img.thumbnail");
        this._selectImageButton = $("#FunniestImageGameScreen #SelectImageButton");
        this._candidateImagesContainer = $("#FunniestImageGameScreen #CandidateImages");
        this._voteImageButton = $("#FunniestImageGameScreen #VoteImageButton");
        this._winningImageContainer = $("#FunniestImageGameScreen #WinningImage");
        this._nextGameButton = $("#FunniestImageGameScreen #NextGameButton");

        this._promptContainer.hide();
        this._resetImageCarouselVisible(false);
        this._candidateImagesContainer.hide();
        this._winningImageContainer.hide();

        this._selectImageButton.off("click").click(function() { self._onSelectImageButtonClicked() });
        this._voteImageButton.off("click").click(function() { self._onVoteImageButtonClicked(); });
        this._voteImageButton.addClass("disabled");

        // Get started
        this._setLocalGameState(GameState.WaitToStart);
        $("#FunniestImageGameScreen").show();

        // Pick a random theme and broadcast with authoritative state to everyone
        this._promptNumber = Math.floor(Math.random() * this._promptThemes.length);
        this._sendAuthoritativeState();
    }
}

export { FunniestImageGameScreen };