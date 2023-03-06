/*
 * www/js/modules/screens/movie_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Funniest image game UI screen.
 */

import { UIScreen } from "./ui_screen.mjs";
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
    SubmitImages:   "SubmitImages"      // select and submit picks for each scene
};
Object.freeze(GameState);

// Peer state object (empty object is used if N/A)
class PeerState
{
    // Client's generated selections
    selectionRequestIds = [];   // array of selection request IDs so far, in order of the different image (scene) requests
    selectionIdxs = [];         // array of image indexes (associated with each request ID)

    constructor(numScenes)
    {
        this.selectionRequestIds = Array(numScenes).fill(null);
        this.selectionIdxs = Array(numScenes).fill(null);
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

    // State
    _ourClientId;
    _clientIds;
    _gameState;
    _imageRequestIds = [];          // image requests sent, each corresponding to a different movie scene
    _imageResponseMessages = [];    // set of images returned, in same order as sent requests
    _peerStateByClientId = {};      // everyone's state, including our own (needed to make authoritative decisions about how/when to proceed forward)

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
            //TODO
            return;
        }
        this._displayNextSceneForSelection(sceneNumber + 1);
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
                break;
            case GameState.WaitOurImages:
                this._instructions.text("Filming underway. Coming soon to a browser near you!");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.hide();
                break;
            case GameState.SubmitImages:
                this._instructions.text("Select a generated image to use.");
                this._instructions.show();
                this._movieButtons.hide();
                this._castMemberContainers.hide();
                this._submitButton.hide();
                this._imageCarouselContainer.show();
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

        this._instructions.hide();
        this._movieButtons.hide();
        this._castMemberContainers.hide();
        this._submitButton.hide();
        this._imageCarouselContainer.hide();

        $("#MovieGameScreen").show();
        this._setLocalGameState(GameState.SubmitPrompts);
    }
}

export { MovieGameScreen };