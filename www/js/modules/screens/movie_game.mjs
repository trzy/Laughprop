/*
 * www/js/modules/screens/movie_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
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
    SubmitPrompts:  "SubmitPrompts",    // select a movie, fill out cast prompts, submit
    WaitOurImages:  "WaitOurImages",    // wait for all our images to come back
    SubmitImages:   "SubmitImages",     // select and submit picks for each scene
    WaitSubmissions: "WaitSubmissions", // wait for everyone to submit their images
    WaitOtherImages: "WaitOtherImages", // wait for everyone else's images
    SubmitVotes: "SubmitVotes",         // vote on other users' movies
    WaitVotes: "WaitVotes",             // wait for everyone else's votes
    ShowWinner: "ShowWinner"            // show the current round winner
};
Object.freeze(GameState);

// Peer state object
class PeerState
{
    //TODO: transmit movie name?

    // Client's generated selections -- array lengths are 0 until movie has been selected, after which they are the same length as number of scenes
    selectionRequestIds = [];   // array of selection request IDs so far, in order of the different image (scene) requests
    selectionIdxs = [];         // array of image indexes (associated with each request ID)

    // Vote
    bestClientIdVote = null;    // which client we voted for

    constructor(numScenes)
    {
        this.selectionRequestIds = Array(numScenes).fill(null);
        this.selectionIdxs = Array(numScenes).fill(null);
    }
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

class Slideshow
{
    img;
    span;
    clientId;
    images;
    _currentImageIdx = -1;

    nextImage()
    {
        if (this.images.length <= 0)
        {
            return;
        }

        this._currentImageIdx = (this._currentImageIdx + 1) % this.images.length;
        this.img.attr("src", "data:image/jpeg;base64," + this.images[this._currentImageIdx]);
        this.span.text("Scene " + (this._currentImageIdx + 1) + " / " + this.images.length);
    }

    constructor(img, span, clientId, images)
    {
        this.span = span;
        this.img = img;
        this.clientId = clientId;
        this.images = images;
    }
}

class MovieGameScreen extends UIScreen
{
    // Callbacks
    _sendMessageFn;

    // UI
    _instructions;
    _movieButtons;
    _castMemberContainers;  // cast member container divs containing the original cast member name and prompt field
    _castMemberNames;       // cast member name spans
    _castMemberPrompts;     // cast member prompt text fields
    _submitButton;
    _imageCarouselContainer;
    _sceneLabel;
    _imageSelected;                     // this is a JQuery element
    _imageCarouselThumbnails = [];      // these are raw DOM elements
    _candidateSlideshowsContainer;
    _voteMovieButton;

    // State
    _ourClientId;
    _clientIds;
    _gameState;
    _imageRequestIds = [];          // image requests sent, each corresponding to a different movie scene
    _imageResponseMessages = [];    // set of images returned, in same order as sent requests
    _peerStateByClientId = {};      // everyone's state, including our own (needed to make authoritative decisions about how/when to proceed forward)
    _cachedImagesByRequestIdAndIdx = {};    // cached images by "request_idx,id"

    // Slideshow management
    _slideshows = [];
    _slideshowTimer = null;

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
        else if (msg instanceof PeerStateMessage)
        {
            this._peerStateByClientId[msg.from_client_id] = msg.state;
            if (this._gameState == GameState.WaitSubmissions)
            {
                this._waitForAllSubmissionsReceived();
            }
            else if (this._gameState == GameState.WaitVotes)
            {
                this._tryDeclareWinner();
            }
        }
        else if (msg instanceof ImageResponseMessage)
        {
            // Accumulate all images we are expecting
            if (this._gameState == GameState.WaitOurImages && this._imageRequestIds.includes(msg.request_id))
            {
                // Which index does this request exist at and store image response message there
                let numScenes = this._imageRequestIds.length;
                let sceneNumber = this._imageRequestIds.findIndex(id => id == msg.request_id);
                this._imageResponseMessages[sceneNumber] = msg;

                // Proceed when all image responses received
                if (!this._imageResponseMessages.includes(null))
                {
                    this._peerStateByClientId[this._ourClientId] = new PeerState(numScenes);
                    this._displayNextSceneForSelection(0);
                }
            }
            else
            {
                console.log("Error: Unexpected ImageResponseMessage with request_id=" + msg.request_id + ". Our state=" + this._gameState + ", request ID=" + this._imageRequestId);
            }
        }
        else if (msg instanceof CachedImagesMessage)
        {
            console.log("Received CachedImagesMessage");

            if (msg.request_ids.length == msg.images.length && msg.idxs.length == msg.images.length && msg.client_ids.length == msg.request_ids.length)
            {
                for (let i = 0; i < msg.images.length; i++)
                {
                    let key = msg.request_ids[i] + "," + msg.idxs[i];
                    this._cachedImagesByRequestIdAndIdx[key] = new CachedImage(msg.client_ids[i], msg.request_ids[i], msg.idxs[i], msg.images[i]);
                }
            }
            else
            {
                console.log("Error: CachedImagesMessage has inconsistent data:", msg);
            }

            if (this._gameState == GameState.WaitOtherImages)
            {
                this._populateCandidateSlideshows(msg);
                this._setLocalGameState(GameState.SubmitVotes);
            }
        }
    }

    _sendPeerState()
    {
        // Always safe to send peer state (before movie selection, arrays will be 0-length, otherwise elements will be null until all scenes selected)
        this._sendMessageFn(new PeerStateMessage(this._ourClientId, this.className, this._peerStateByClientId[this._ourClientId]));
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
        let self = this;

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
            this._submitButton.off("click").click(() => self._onSubmitButtonPressed());
        }
        else
        {
            this._submitButton.hide();
        }
    }

    _onSubmitButtonPressed()
    {
        //TODO: we need a special set of messages for this but for now simulate it with multiple requests
        for (let i = 0; i < 4; i++)
        {
            let requestId = generateUuid();
            this._imageRequestIds.push(requestId);
            this._imageResponseMessages.push(null);    // make room for response
            let msg = new Txt2ImgRequestMessage("New cast member name goes here", requestId);
            this._sendMessageFn(msg);
        }
        this._setLocalGameState(GameState.WaitOurImages);
    }

    _displayNextSceneForSelection(sceneNumber)
    {
        let self = this;

        // How many scenes are there and which are we displaying?
        let numScenes = this._imageRequestIds.length;
        let ourState = this._peerStateByClientId[this._ourClientId];

        // Print some text about the scene
        //TODO: have scene descriptions?
        this._sceneLabel.text("Scene " + (sceneNumber + 1) + "/" + numScenes);

        //TODO: if all scenes accounted for, move to next game state

        // Place images in selection carousel
        let msg = this._imageResponseMessages[sceneNumber];
        for (let i = 0; i < Math.min(msg.images.length, this._imageCarouselThumbnails.length); i++)
        {
            this._imageCarouselThumbnails[i].src = "data:image/jpeg;base64," + msg.images[i];
            $(this._imageCarouselThumbnails[i]).off("click").click(() => self._onImageThumbnailClicked(ourState, sceneNumber, msg.request_id, i));
        }
        this._onImageThumbnailClicked(ourState, sceneNumber, msg.request_id, 0);
        this._setLocalGameState(GameState.SubmitImages);

        // Advance state or go to next image when accept button is clicked
        this._selectImageButton.off("click").click(() => self._onSelectImageButtonClicked(sceneNumber, numScenes));
    }

    _onImageThumbnailClicked(ourState, sceneNumber, requestId, idx)
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

        // Store the request ID and associated index
        ourState.selectionRequestIds[sceneNumber] = requestId;
        ourState.selectionIdxs[sceneNumber] = idx;
    }

    _onSelectImageButtonClicked(sceneNumber, numScenes)
    {
        // An image selection was made, present next scene or advance to next state altogether
        if (sceneNumber >= (numScenes - 1))
        {
            // Time to advance to next state
            this._sendPeerState();  // broadcast our selections
            this._setLocalGameState(GameState.WaitSubmissions);
            this._waitForAllSubmissionsReceived();
        }
        else
        {
            this._displayNextSceneForSelection(sceneNumber + 1);
        }
    }

    _waitForAllSubmissionsReceived()
    {
        if (this._gameState != GameState.WaitSubmissions)
        {
            console.log("Error: _waitForAllSubmissionsReceived() called in wrong state");
            return;
        }

        // Have we received everyone's submissions? _clientIds contains the definitive list of
        // active players. Each player may have a different number of selections corresponding to
        // the different number of scenes in their movie selection but we can determine that all
        // selections have been made by the absence of nulls in the arrays.
        let receivedAll = true;
        for (let clientId of this._clientIds)
        {
            if (!(clientId in this._peerStateByClientId))
            {
                receivedAll = false;
                break;
            }

            // Make sure each client has recorded selections for all image responses
            let state = this._peerStateByClientId[clientId];
            if (state.selectionRequestIds.length != state.selectionIdxs.length)
            {
                console.log("Error: Client " + clientId + " sent an inconsistent peer state object:", state);
                receivedAll = false;
                break;
            }
            if (state.selectionRequestIds.includes(null) || state.selectionIdxs.includes(null))
            {
                receivedAll = false;
                break;
            }
        }

        // We can proceed if we received from everyone
        if (receivedAll)
        {
            console.log("Requesting images to vote on...");
            this._requestImagesFromPeers();
            this._setLocalGameState(GameState.WaitOtherImages);
        }
        else
        {
            console.log("Unable to proceed to voting because not all responses have been received...", this._peerStateByClientId);
        }
    }

    _requestImagesFromPeers()
    {
        // Ask server for everyone else's images (TODO: we are currently asking for our own as well but should not)
        let msg = new RequestCachedImagesMessage();
        for (let peerId of this._clientIds)
        {
            if (!(peerId in this._peerStateByClientId))
            {
                return;
            }
            let state = this._peerStateByClientId[peerId];
            if (state.selectionRequestIds.length == state.selectionIdxs.length) // ensure the results are consistent
            {
                msg.request_ids = msg.request_ids.concat(state.selectionRequestIds);
                msg.idxs = msg.idxs.concat(state.selectionIdxs);
            }
        }
        this._sendMessageFn(msg);
    }

    _populateCandidateSlideshows(msg)
    {
        let self = this;

        // Unpack images: we want arrays of images in the right order by client IDs (because
        // message will have them in some jumbled order)
        let imagesByClientId = {};  // client ID -> [ image for scene 1, image for scene 2, etc. (slideshow order) ]
        for (const [clientId, state] of Object.entries(this._peerStateByClientId))
        {
            // The peer state object has the images in the correct order. We just need to extract
            // the corresponding image data in that order from the cached image message.
            let images = [];
            let foundAll = true;
            for (let requestId of state.selectionRequestIds)
            {
                let idx = msg.request_ids.indexOf(requestId);
                if (idx >= 0)
                {
                    images.push(msg.images[idx]);
                }
                else
                {
                    // Should never happen
                    foundAll = false;
                }
            }
            if (!foundAll)
            {
                console.log("Error: Internal consistency error: not all images found for clientId=" + clientId);
            }

            imagesByClientId[clientId] = images;
        }

        // Remove any existing slideshows
        $("#MovieGameScreen #CandidateSlideshows .slideshow").remove();
        this._slideshows = [];

        // Create slideshows
        for (const [clientId, images] of Object.entries(imagesByClientId))
        {
            // Construct the slide show DOM elements and add to container

            let container = $("<div>").addClass("slideshow").addClass("center-children").addClass("row").addClass("text-center");
            container.prop("clientId", clientId);

            let row_1 = $("<div>").addClass("row center-children");
            let img = $("<img>");
            img.prop("clientId", clientId);
            img.click(function() { self._onCandidateSlideshowClicked(img, clientId); });
            row_1.append(img);
            container.append(row_1);

            let row_2 = $("<div>").addClass("row center-children text-center");
            let span = $("<span>").addClass("text-center");
            row_2.append(span);
            container.append(row_2);

            this._candidateSlideshowsContainer.prepend(container);

            // Create a slideshow object that will be updated automatically on a timer loop
            let slideshow = new Slideshow(img, span, clientId, images);
            this._slideshows.push(slideshow);
        }
    }

    _onCandidateSlideshowClicked(img, clientId)
    {
        // De-select all
        $("#MovieGameScreen #CandidateSlideshows img").removeClass("image-selected");

        // Select image
        img.addClass("image-selected");

        // Enable voting button
        let self = this;
        this._voteMovieButton.removeClass("button-disabled");
        this._voteMovieButton.off("click").click(() => self._onVoteMovieButtonClicked(clientId));
    }

    _onVoteMovieButtonClicked(votedClientId)
    {
        if (this._voteMovieButton.hasClass("button-disabled"))
        {
            return;
        }

        // Add our vote to our peer state and broadcast it
        let ourState = this._peerStateByClientId[this._ourClientId];
        ourState.bestClientIdVote = votedClientId;
        this._sendPeerState();

        // Advance state to wait until we get everyone else's submissions
        this._setLocalGameState(GameState.WaitVotes);
        this._tryDeclareWinner();
    }

    // Check whether all votes received and tally them, then declare winner
    _tryDeclareWinner()
    {
        if (this._gameState != GameState.WaitVotes)
        {
            console.log("Error: _tryDeclareWinner() called in wrong state");
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

            // Make sure each client has recorded a vote
            let state = this._peerStateByClientId[clientId];
            if (!state.bestClientIdVote)
            {
                receivedAll = false;
                break;
            }
            else
            {
                // Count vote
                let id = this._peerStateByClientId[clientId].bestClientIdVote;
                if (id in votesByClientId)
                {
                    // Count valid client IDs
                    votesByClientId[id] += 1;
                }
            }
        }

        // Once we've received votes from everyone, we can proceed
        if (receivedAll)
        {
            //TODO: this should all be done by the authority
            this._declareWinner(votesByClientId);
            this._setLocalGameState(GameState.ShowWinner);
        }
        else
        {
            console.log("Unable to declare winner because not all responses have been received...", this._peerStateByClientId);
        }
    }

    // Figure out who won and show the winners
    _declareWinner(votesByClientId)
    {
        // What was the highest number of votes
        let highestVoteCount = Object.values(votesByClientId).reduce((a,b) => Math.max(a,b), -Infinity);

        // Who had the highest number of votes (may be multiple clients in a tie)
        let winningClientIds = [];
        for (const [clientId, numVotes] of Object.entries(votesByClientId))
        {
            if (numVotes == highestVoteCount)
            {
                winningClientIds.push(clientId);
            }
        }

        // Reuse slideshows to display winners. Go through each one and disable the losers.
        console.log(winningClientIds);
        for (let slideshow of this._candidateSlideshowsContainer.find(".slideshow"))
        {
            console.log("- " + $(slideshow).prop("clientId"));
            if (!winningClientIds.includes($(slideshow).prop("clientId")))
            {
                $(slideshow).hide();
            }
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
                this._instructions.text("Pick a movie and choose a new cast.");
                this._instructions.show();
                this._movieButtons.show();
                this._castMemberContainers.hide();
                for (let button of this._movieButtons)
                {
                    $(button).off("click").click(() => self._onMovieButtonClicked(button));
                }
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.hide();
                break;
            case GameState.WaitOurImages:
                this._instructions.text("Filming underway. Coming soon to a browser near you!");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.hide();
                break;
            case GameState.SubmitImages:
                this._instructions.text("Select a generated image to use.");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.show();
                this._candidateSlideshowsContainer.hide();
                break;
            case GameState.WaitSubmissions:
                this._instructions.text("Waiting for everyone to make their selections...");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.hide();
                break;
            case GameState.WaitOtherImages:
                this._instructions.text("Waiting for everyone's images to arrive...");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.hide();
                break;
            case GameState.SubmitVotes:
                this._instructions.text("Which flick is your top pick?");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.show();
                this._voteMovieButton.addClass("button-disabled");  // disable button until clicked
                this._voteMovieButton.show();
                this._nextGameButton.hide();
                break;
            case GameState.WaitVotes:
                this._instructions.text("Tallying the Academy's votes...");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.hide();
                this._voteMovieButton.hide();
                this._nextGameButton.hide();
                break;
            case GameState.ShowWinner:
                // Use the candidate slideshow container to show the winner(s)
                this._instructions.text("And the winner is...");    //TODO: check for tie
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                this._candidateSlideshowsContainer.show();
                this._voteMovieButton.hide();
                this._nextGameButton.show();
                break;
        }
    }

    // Runs continuously and, if slideshow objects exists, cycles images
    //TODO: if is in viewport https://stackoverflow.com/questions/20791374/jquery-check-if-element-is-visible-in-viewport
    _updateSlideshow()
    {
        for (let slideshow of this._slideshows)
        {
            slideshow.nextImage();
        }

        // Schedule next update
        let self = this;
        this._slideshowTimer = window.setTimeout(() => self._updateSlideshow(), 3000);
    }

    _stopSlideshow()
    {
        if (this._slideshowTimer)
        {
            clearTimeout(this._slideshowTimer);
            this._slideshowTimer = null;
            this._slideshows = [];
        }
    }

    constructor(ourClientId, gameId, gameClientIds, sendMessageFn)
    {
        super();
        let self = this;

        this._ourClientId = ourClientId;
        this._clientIds = gameClientIds.slice();
        this._peerStateByClientId[this._ourClientId] = new PeerState(0);

        this._sendMessageFn = sendMessageFn;

        this._instructions = $("#MovieGameScreen #Instructions");
        this._movieButtons = $("#MovieGameScreen #MovieSelection .button");
        this._castMemberContainers = $("#MovieGameScreen #MovieSelection .cast-member");
        this._castMemberNames = $(this._castMemberContainers).find(".cast-member-name");
        this._castMemberPrompts = $(this._castMemberContainers).find(".cast-member-prompt");
        this._submitButton = $("#MovieGameScreen #SubmitCastButton");
        this._imageCarouselContainer = $("#MovieGameScreen #Carousel");
        this._sceneLabel = $("#MovieGameScreen #SceneLabel");
        this._imageSelected = $("#MovieGameScreen #Carousel #SelectedImage");
        this._imageCarouselThumbnails = $("#MovieGameScreen").find("img.thumbnail");
        this._selectImageButton = $("#MovieGameScreen #SelectImageButton");
        this._candidateSlideshowsContainer = $("#MovieGameScreen #CandidateSlideshows");
        this._voteMovieButton = $("#MovieGameScreen #VoteMovieButton");
        this._nextGameButton = $("#MovieGameScreen #NextGameButton");

        this._instructions.hide();
        this._movieButtons.hide();
        this._castMemberContainers.hide();
        this._submitButton.hide();
        this._imageCarouselContainer.hide();
        this._candidateSlideshowsContainer.hide();

        this._nextGameButton.off("click").click(() =>
        {
            self._stopSlideshow();
            self._sendMessageFn(new AuthoritativeStateMessage(SelectGameScreen.name, {}));
        });

        $("#MovieGameScreen").show();
        this._setLocalGameState(GameState.SubmitPrompts);
        this._updateSlideshow();
    }
}

export { MovieGameScreen };