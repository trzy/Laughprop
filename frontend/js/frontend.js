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
 * frontend.js
 * Bart Trzynadlowski, 2023
 *
 * Main program module for game front end.
 */

import { generateUuid } from "./modules/utils.mjs";
import
{
    tryParseMessage,
    HelloMessage,
    StartNewGameMessage,
    JoinGameMessage,
    LeaveGameMessage,
    GameStartingStateMessage,
    FailedToJoinMessage,
    ReturnToLobbyMessage,
    SelectGameStateMessage,
    ChooseGameMessage,
    ClientUIMessage,
    ClientInputMessage
} from "./modules/messages.mjs";
import { Canvas } from "./modules/canvas.mjs";


/**************************************************************************************************
 Connection Management
**************************************************************************************************/

var _socket = null;
var _clientId = generateUuid();

function connectToBackend()
{
    let location = window.location;
    let isLocal = location.hostname == "localhost" || location.hostname == "127.0.0.1";
    let protocol = isLocal ? "ws" : "wss";  // cannot mix secure wss with unsecure http on local machines
    let wsUrl = protocol + "://" + location.hostname + ":" + location.port;

    console.log(`Connecting to backend socket: ${wsUrl}`)
    _socket = new WebSocket(wsUrl);

    _socket.onopen = function(event)
    {
        console.log("Connection established");
        sendMessage(new HelloMessage("Hello from Laughprop client"));
    };

    _socket.onmessage = function(event)
    {
        console.log(`Message received: ${event.data}`);

        let json;
        try
        {
            json = JSON.parse(event.data);
        }
        catch (error)
        {
            console.log(`Error: Unable to parse JSON message: ${event.data}`);
            return;
        }

        let msg = tryParseMessage(json);
        if (msg != null)
        {
            console.log(`Successfully decoded ${msg.__id}`);

            if (msg instanceof HelloMessage)
            {
                console.log(`Server says hello: ${msg.message}`);
            }

            handleMessageFromServer(msg);
        }
        else
        {
            console.log("Error: Unable to decode message");
        }
    };

    _socket.onclose = function(event)
    {
        if (event.wasClean)
        {
            console.log(`Connection closed (code=${event.code}, reason=${event.reason})`);
        }
        else
        {
            console.log(`Connection died (code=${event.code}, reason=${event.reason})`);
        }
    };

    _socket.onerror = function(error)
    {
        console.log("Error: Socket error");
    };
}

function sendMessage(msg)
{
    if (_socket)
    {
        _socket.send(JSON.stringify(msg));
    }
    else
    {
        console.log("Error: Unable to send message because no connection exists:", msg);
    }
}


/**************************************************************************************************
 Welcome Screen

 Host or connect to a game.
**************************************************************************************************/

function hideAllScreens()
{
    $(".screen").each(function(index, element)
    {
        $(element).hide();
    });
}

function onNewGameButtonClicked()
{
    sendMessage(new StartNewGameMessage(_clientId));
}

function onJoinGameButtonClicked()
{
    const sessionId = $("#GameID").val();
    sendMessage(new JoinGameMessage(sessionId, _clientId));
}

function onGameStartingState(msg)
{
    hideAllScreens();
    initWelcomeScreen();
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#StartingNewGameMessage").show();
    $("#WelcomeScreen #Buttons").hide();
    $("#GameID").val(msg.sessionId);

}

function onFailedToJoinState(reason)
{
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#GameErrorMessage span").text(reason);
    $("#GameErrorMessage").show();
}

function onGameIdTextFieldChanged()
{
    const gameIdField = $("#WelcomeScreen #GameID");
    const joinGameButton = $("#JoinGameButton");

    gameIdField.val(gameIdField.val().toUpperCase());
    if (gameIdField.val().length == 4)
    {
        // Join button becomes selectable when we have 4 characters
        joinGameButton.removeClass("button-disabled");
        joinGameButton.off("click").click(function() { onJoinGameButtonClicked(); });
    }
    else
    {
        joinGameButton.addClass("button-disabled");
        joinGameButton.off("click");
    }
}

function initWelcomeScreen()
{
    $("#NewGameButton").off("click").click(function() { onNewGameButtonClicked(); });
    $("#JoinGameButton").addClass("button-disabled");
    $("#WelcomeScreen #GameID").val("");
    $("#WelcomeScreen #GameID").val("").off("input").on("input", function(e) { onGameIdTextFieldChanged(); });
    $(".message").each(function(index, element)
    {
        $(element).hide();
    });
    $("#WelcomeScreen #Buttons").show();
    $("#WelcomeScreen").show();
}


/**************************************************************************************************
 Return to Lobby Request
**************************************************************************************************/

function onReturnToLobby(gameInterruptedReason)
{
    hideAllScreens();
    initWelcomeScreen();
    if (gameInterruptedReason)
    {
        $("#GameErrorMessage span").text(gameInterruptedReason);
        $("#GameErrorMessage").show();
    }
}


/**************************************************************************************************
 Select Game Screen
**************************************************************************************************/

const _funniestImageGameButton = $("#SelectGameScreen #FunniestImageGameButton")
const _movieGameButton = $("#SelectGameScreen #MovieGameButton");
const _drawingGameButton = $("#SelectGameScreen #DrawingGameButton");
const _gameButtons = [ _funniestImageGameButton, _movieGameButton, _drawingGameButton ];

function onFunniestImageGameButtonClicked()
{
    deselectAllButtons();
    _funniestImageGameButton.addClass("button-selected");
    sendMessage(new ChooseGameMessage("It's A Mood"));
}

function onMovieGameButtonClicked()
{
    deselectAllButtons();
    _movieGameButton.addClass("button-selected");
    sendMessage(new ChooseGameMessage("I'd Watch That"));
}

function onDrawingGameButtonClicked()
{
    deselectAllButtons();
    _drawingGameButton.addClass("button-selected");
    sendMessage(new ChooseGameMessage("What-the-Doodle"));
}

function deselectAllButtons()
{
    for (const button of _gameButtons)
    {
        button.removeClass("button-selected");
    }
}

function onSelectGameState(msg)
{
    hideAllScreens();
    $("#SelectGameScreen").show();
    $("#SelectGameScreen #GameID").val(msg.sessionId);

    _funniestImageGameButton.off("click").click(function() { onFunniestImageGameButtonClicked() });
    _movieGameButton.off("click").click(function() { onMovieGameButtonClicked() });
    _drawingGameButton.off("click").click(function() { onDrawingGameButtonClicked(); });
    deselectAllButtons();
}


/**************************************************************************************************
 Game Flow Handling
**************************************************************************************************/

let _imageByUuid = {};    // image cache, reset each game

const _gameScreen = $("#GameScreen");

const _gameTitleContainer = $("#GameTitleContainer");
const _gameTitle = $("#GameTitleContainer .game-title");

const _instructionsContainer = $("#InstructionsContainer");
const _instructions = $("#Instructions");

const _returnToLobbyButton = $("#ReturnToLobbyButton");

const _canvasContainer = $("#CanvasContainer");
const _submitDrawingButton = $("#CanvasContainer #SubmitDrawingButton");
const _clearDrawingButton = $("#CanvasContainer #ClearDrawingButton");
const _canvas = new Canvas();

const _captionImageContainer = $("#CaptionImageContainer");
const _submitCaptionButton = $("#CaptionImageContainer #SubmitCaptionButton");
const _captionTextField = $("#CaptionImageContainer #CaptionText");

const _drawingGameResultsContainer = $("#DrawingGameResultsContainer");

const _promptContainer = $("#PromptContainer");
const _promptDescription = $("#PromptDescription");
const _promptTextField = $("#PromptTextField");
const _promptSubmitButton = $("#PromptContainer #SubmitButton");

const _carouselContainer = $("#Carousel");
const _imageCarouselThumbnails = $("#Carousel").find("img.thumbnail");
const _imageSelected = $("#Carousel #SelectedImage");
const _selectImageButton = $("#Carousel #SelectImageButton");

const _candidatesContainer = $("#CandidateImages");
const _voteImageButton = $("#CandidateImages #VoteImageButton");

const _winningImagesContainer = $("#WinningImage");

class Slideshow
{
    div;
    img;
    caption;
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
        this.caption.text("Scene " + (this._currentImageIdx + 1) + " / " + this.images.length);
    }

    constructor(div, img, caption, clientId, imageIdsThisClient)
    {
        this.div = div;
        this.img = img;
        this.caption = caption;
        this.clientId = clientId;
        this.images = [];
        for (const id of imageIdsThisClient)
        {
            const image = _imageByUuid[id];
            if (image)
            {
                this.images.push(image);
            }
            else
            {
                console.log("Error: Unknown image UUID: " + id);
            }
        }
    }
}

const _multiSelectMultiPromptContainer = $("#MultiSelectMultiPrompt");
const _selectionColumn = $("#MultiSelectMultiPrompt #SelectionColumn");
const _promptColumn = $("#MultiSelectMultiPrompt #PromptColumn");
const _multiSelectMultiPromptSubmitButton = $("#MultiSelectMultiPrompt #SubmitButton");
const _slideshowsContainer = $("#Slideshows");
const _voteMovieButton = $("#Slideshows #VoteMovieButton");
let _slideshows = [];
let _slideshowTimer = null;

const _containers = [ _gameTitleContainer, _instructionsContainer, _canvasContainer, _captionImageContainer, _drawingGameResultsContainer, _promptContainer, _carouselContainer, _candidatesContainer, _winningImagesContainer, _multiSelectMultiPromptContainer, _slideshowsContainer ];

function onImageThumbnailClicked(idx)
{
    if (idx >= _imageCarouselThumbnails.length)
    {
        return;
    }

    // De-select all thumbnails
    for (let i = 0; i < _imageCarouselThumbnails.length; i++)
    {
        $(_imageCarouselThumbnails[i]).removeClass("image-selected");
    }

    // Select our thumbnail
    $(_imageCarouselThumbnails[idx]).addClass("image-selected");

    // Replace image preview with selection
    _imageSelected.attr("src", _imageCarouselThumbnails[idx].src);
    _imageSelected.prop("uuid", $(_imageCarouselThumbnails[idx]).prop("uuid"));
}

function onCandidateImageClicked(img, uuid)
{
    // De-select all
    $("#CandidateImages img").removeClass("image-selected");

    // Select image
    img.addClass("image-selected");

    // Enable voting button to send selected image back
    _voteImageButton.off("click").click(function()
    {
        const msg = new ClientInputMessage({ "@@vote": uuid });
        sendMessage(msg);
    })
    _voteImageButton.removeClass("button-disabled");
}

function buildMultiSelectMultiPrompt(promptLabelsBySelection)
{
    // Delete all elements
    _selectionColumn.empty();
    _promptColumn.empty();

    // Whenever input is typed into any prompt, check all currently visible prompts and enable
    // Submit button when all are entered
    const checkAllPromptsFilledOut = () =>
    {
        var allFilledOut = true;
        _promptColumn.find("input").each((idx, item) =>
        {
            if ($(item).is(":visible") && $(item).val().trim().length == 0)
            {
                // One of the visible prompts is empty, cannot proceed
                allFilledOut = false;
            }
        });

        if (allFilledOut)
        {
            _multiSelectMultiPromptSubmitButton.show();
        }
        else
        {
            _multiSelectMultiPromptSubmitButton.hide();
        }
    };

    // Populate selections and all prompts
    for (const [selection, promptLabels] of Object.entries(promptLabelsBySelection))
    {
        // Create button for this selection and add it to selection column
        const button = $("<div>").addClass("button").text(selection);
        _selectionColumn.append(button);

        // Create a div to hold all the prompts for this selection. Store the movie selection
        // there, too.
        let currentPrompts = $("<div>");
        currentPrompts.prop("selected_movie", selection);
        _promptColumn.append(currentPrompts);

        // Create prompt widgets for each of the prompt labels
        for (const label of promptLabels)
        {
            const promptDiv = $("<div>").addClass("cast-member");
            currentPrompts.append(promptDiv);

            const span = $("<span>").addClass("cast-member-name").text(label);
            promptDiv.append(span);

            const input = $('<input type="text">').addClass("cast-member-prompt").addClass("prompt").addClass("left");
            promptDiv.append(input);
        }

        // When selection is pressed, hide all prompt containers and enable only the one
        // corresponding to the selection
        button.click(() =>
        {
            _promptColumn.children().each((idx, item) =>
            {
                $(item).hide();
            });
            currentPrompts.show();

            // Recompute visibility of submit button
            checkAllPromptsFilledOut();
        });

        // Initially hidden
        currentPrompts.hide();
    }

    // Now that all input fields have been created, monitor them
    _promptColumn.find("input").each((idx, item) =>
    {
        $(item).on("input", e => checkAllPromptsFilledOut());
    });

    // Submit button handler and initially hidden
    _multiSelectMultiPromptSubmitButton.hide();
    _multiSelectMultiPromptSubmitButton.off("click").click(() =>
    {
        let inputVars = {};

        // Collect the active set of prompts one by one, naming the values @@prompt_n
        _promptColumn.find("input").each((idx, item) =>
        {
            if ($(item).is(":visible"))
            {
                const n = Object.keys(inputVars).length;
                inputVars["@@prompt_" + n] = $(item).val().trim();
            }
        });

        // Get the selected movie, too. It will be in the visible top-level div in the prompts
        // column
        const selection = $(_promptColumn.children(":visible")[0]).prop("selected_movie");
        inputVars["@@selected_movie"] = selection;

        // Send
        sendMessage(new ClientInputMessage(inputVars));
        _multiSelectMultiPromptSubmitButton.hide();
    });
}

function buildSlideshows(imageIdsByClientId)
{
    // Remove existing slideshows
    _slideshowsContainer.find(".slideshow").remove();
    _slideshows = [];

    // Create slideshows for each client. Image IDs are stored as arrays in scene order.
    for (const [clientId, imageIdsThisClient] of Object.entries(imageIdsByClientId))
    {
        // Create the slideshow div for this client's movie
        const slideshowDiv = $("<div>").addClass("slideshow");
        const img = $("<img>");
        const caption = $("<span>");
        slideshowDiv.append(img);
        slideshowDiv.append(caption);
        _slideshowsContainer.prepend(slideshowDiv);

        // Create the slideshow
        const slideshow = new Slideshow(slideshowDiv, img, caption, clientId, imageIdsThisClient);
        _slideshows.push(slideshow);
    }

    // Vote for movie button
    const onVoteMovieButtonClicked = function(clientId)
    {
        // Send vote
        const msg = new ClientInputMessage({ "@@vote": clientId });
        sendMessage(msg);

        _voteMovieButton.hide();
    };
    _voteMovieButton.show();
    _voteMovieButton.addClass("button-disabled");

    // Wire up click handlers that select a slideshow
    for (const slideshow of _slideshows)
    {
        let clientId = slideshow.clientId;
        slideshow.img.off("click").click(() =>
        {
            // De-select all
            for (const slideshow of _slideshows)
            {
                slideshow.img.removeClass("image-selected");
            }

            // Select image
            slideshow.img.addClass("image-selected");

            // Enable voting button
            _voteMovieButton.removeClass("button-disabled");
            _voteMovieButton.off("click").click(() => onVoteMovieButtonClicked(clientId));
        });
    }

    // Kick off slideshow updates
    if (_slideshowTimer != null)
    {
        clearTimeout(_slideshowTimer);
        _slideshowTimer = null;
    }
    updateSlideshow();
}

function updateSlideshow()
{
    for (let slideshow of _slideshows)
    {
        slideshow.nextImage();
    }

    if (_slideshows.length > 0)
    {
        // Keep updating as long as slideshows exist
        _slideshowTimer = window.setTimeout(updateSlideshow, 3000);
    }
}

function buildDrawingGameResultsWidget(caption_by_image_id, prompt_by_image_id)
{
    _drawingGameResultsContainer.empty();

    const imageIds = new Set(Object.keys(caption_by_image_id));
    for (const uuid of imageIds)
    {
        const prompt = prompt_by_image_id[uuid];
        const caption = caption_by_image_id[uuid];
        const image = _imageByUuid[uuid];

        /*
         * <div>
         *     <div class="center-children">
         *         <img/>
         *     </div>
         *     <div class="center-children">
         *         <span>Prompt.</span>
         *     </div>
         *     <div class="center-children">
         *         <span>Caption.</span>
         *     </div>
         * </div>
         */
        const container = $("<div>");
        _drawingGameResultsContainer.append(container);

        const alignmentDiv1 = $("<div>").addClass("center-children");
        const img = $("<img>");
        img.get(0).src = "data:image/jpeg;base64," + image;
        alignmentDiv1.append(img);
        container.append(alignmentDiv1);

        const alignmentDiv2 = $("<div>").addClass("center-children");
        const span1 = $("<span>").html("<b>Original:</b>" + prompt);
        alignmentDiv2.append(span1);
        container.append(alignmentDiv2);

        const alignmentDiv3 = $("<div>").addClass("center-children");
        const span2 = $("<span>").html("<b>Captioned:</b>" + caption);
        alignmentDiv3.append(span2);
        container.append(alignmentDiv3);
    }
}

function onClientUIMessage(msg)
{
    switch (msg.command.command)
    {
    case "init_game":
        _imageByUuid = {};
        hideAllScreens();
        for (const container of _containers)
        {
            container.hide();
        }
        _returnToLobbyButton.off("click").click(function()
        {
            // Leave game and return to lobby
            const msg = new LeaveGameMessage();
            sendMessage(msg);
            onReturnToLobby(null);  // no error
        });
        _returnToLobbyButton.hide();
        _gameScreen.show();
        break;

    case "cache_images":
    {
        const imageByUuid = msg.command.param;
        if (imageByUuid)
        {
            for (const [uuid, image] of Object.entries(imageByUuid))
            {
                _imageByUuid[uuid] = image;
                console.log("Cached image UUID=" + uuid);
            }
        }
        break;
    }

    case "title":
        if (msg.command.param)
        {
            _gameTitle.text(msg.command.param);
            _gameTitleContainer.show();
        }
        else
        {
            _gameTitleContainer.hide();
        }
        break;

    case "instructions":
        if (msg.command.param)
        {
            _instructions.text(msg.command.param);
            _instructionsContainer.show();
        }
        else
        {
            _instructionsContainer.hide();
        }
        break;

    case "prompt_widget":
        if (msg.command.param)
        {
            _promptDescription.text(msg.command.param);
            _promptTextField.val("");   // clear old data out
            _promptContainer.show();
            _promptSubmitButton.off("click").click(function()
            {
                const msg = new ClientInputMessage({ "@@prompt": _promptTextField.val() });
                sendMessage(msg);
            });

            // Submit button only enabled when there is prompt text
            _promptTextField.off("input").on("input", e =>
            {
                if (_promptTextField.val().length > 0)
                {
                    _promptSubmitButton.removeClass("button-disabled");
                }
                else
                {
                    _promptSubmitButton.addClass("button-disabled");
                }
            });
            _promptSubmitButton.addClass("button-disabled");
        }
        else
        {
            _promptContainer.hide();
        }
        break;

    case "image_carousel_widget":
    {
        const imageUuids = msg.command.param;   // list of image IDs that are already cached

        if (!imageUuids)
        {
            _carouselContainer.hide();
            break;
        }

        const numImages = imageUuids.length;

        // Place images in selection carousel
        const maxImages = Math.min(numImages, _imageCarouselThumbnails.length);
        let i = 0;
        for (const uuid of imageUuids)
        {
            const image = _imageByUuid[uuid];
            if (!image)
            {
                console.log("Error: Unknown image UUID=" + uuid);
            }

            if (i < maxImages && image)
            {
                let idx = i;    // need block-scope copy to create function below
                _imageCarouselThumbnails[i].src = "data:image/jpeg;base64," + image;
                $(_imageCarouselThumbnails[i]).prop("uuid", uuid);
                $(_imageCarouselThumbnails[i]).off("click").click(function() { onImageThumbnailClicked(idx) });
            }
            else
            {
                _imageCarouselThumbnails[i].src = "";
            }

            i += 1;
        }

        // Select first one
        onImageThumbnailClicked(0);

        // Send selection back to server
        _selectImageButton.off("click").click(function()
        {
            const selectedImageId = _imageSelected.prop("uuid");
            const msg = new ClientInputMessage({ "@@selected_image_id": selectedImageId });
            sendMessage(msg);
        });

        _carouselContainer.show();
        break;
    }

    case "candidate_images_widget":
    {
        const imageUuids = msg.command.param;   // list of image IDs that are already cached

        if (!imageUuids)
        {
            _candidatesContainer.hide();
            break;
        }

        _candidatesContainer.show();

        // Remove any existing images
        $("#CandidateImages img").remove();

        // Create image elements that when clicked
        for (const uuid of imageUuids)
        {
            const image = _imageByUuid[uuid];
            if (!image)
            {
                console.log("Error: Unknown image UUID=" + uuid);
            }
            else
            {
                let img = $("<img>");
                img.attr("src", "data:image/jpeg;base64," + image);
                img.prop("uuid", uuid);
                _candidatesContainer.prepend(img);
                img.click(function() { onCandidateImageClicked(img, uuid); });
            }
        }

        // Disable the voting button until clicked
        _voteImageButton.addClass("button-disabled");
        _voteImageButton.show();

        break;
    }

    case "winning_images_widget":
    {
        const winningImageIds = msg.command.param;

        if (!winningImageIds)
        {
            _winningImagesContainer.hide();
            break;
        }

        _winningImagesContainer.show();

        // Remove any existing images
        $("#WinningImage img").remove();

        // Create image elements that when clicked
        for (const uuid of winningImageIds)
        {
            const image = _imageByUuid[uuid];
            if (image)
            {
                const img = $("<img>");
                img.attr("src", "data:image/jpeg;base64," + image);
                img.prop("uuid", uuid);
                _winningImagesContainer.prepend(img);
            }
            else
            {
                console.log("Error: Unknown image UUID=" + uuid);
            }
        }

        // Is there a tie?
        //TODO: print that we have a tie

        // Allow return to lobby
        _returnToLobbyButton.show();
        break;
    }

    case "multi_select_multi_prompt_widget":
    {
        const promptLabelsBySelection = msg.command.param;

        if (!promptLabelsBySelection)
        {
            _multiSelectMultiPromptContainer.hide();
            break;
        }

        buildMultiSelectMultiPrompt(promptLabelsBySelection);
        _multiSelectMultiPromptContainer.show();
        break;
    }

    case "slideshows_widget":
    {
        const imageIdsByClientId = msg.command.param.selectedImageIdsByClientId;    // client ID -> [image IDs in scene order]
        const winningClientIds = msg.command.param.winningClientIds;                // [ clientId ] (array because there may be a tie)

        if (winningClientIds)
        {
            // Display winner from among existing slideshows
            for (const slideshow of _slideshows)
            {
                if (winningClientIds.indexOf(slideshow.clientId) >= 0)
                {
                    slideshow.div.show();
                }
                else
                {
                    slideshow.div.hide();
                }
            }

            // Disable vote button and display return to lobby button
            _voteMovieButton.hide();
            _returnToLobbyButton.show();

            // Show
            _slideshowsContainer.show();
        }
        else
        {
            if (!imageIdsByClientId)
            {
                // Hide container
                _slideshowsContainer.hide();
            }
            else
            {
                // Build new slideshows with supplied images
                buildSlideshows(imageIdsByClientId);
                _slideshowsContainer.show();
                _returnToLobbyButton.hide();
            }
        }
        break;
    }

    case "canvas_widget":
    {
        if (msg.command.param)
        {
            _canvas.clear();

            _clearDrawingButton.off("click").click(function()
            {
                _canvas.clear();
            });

            _submitDrawingButton.off("click").click(function()
            {
                let imageData = _canvas.getBase64ImageData();
                const msg = new ClientInputMessage({ "@@user_drawing": imageData });
                sendMessage(msg);
            });

            _canvasContainer.show();
        }
        else
        {
            _canvasContainer.hide();
        }
        break;
    }

    case "caption_image_widget":
    {
        if (msg.command.param)
        {
            const uuid = msg.command.param;
            const image = _imageByUuid[uuid];
            if (image)
            {
                const img = $(_captionImageContainer).find("img");
                img.attr("src", "data:image/jpeg;base64," + image);
            }
            _captionImageContainer.show();

            _submitCaptionButton.off("click").click(() =>
            {
                let caption = _captionTextField.val();
                const msg = new ClientInputMessage({ "@@caption": caption });
                sendMessage(msg);
            });

            // Clear out old caption data
            _captionTextField.val("");

            // Submit button only enabled when there is caption text (required, otherwise backend breaks)
            _captionTextField.off("input").on("input", e =>
            {
                if (_captionTextField.val().length > 0)
                {
                    _submitCaptionButton.removeClass("button-disabled");
                }
                else
                {
                    _submitCaptionButton.addClass("button-disabled");
                }
            });
            _submitCaptionButton.addClass("button-disabled");
        }
        else
        {
            _captionImageContainer.hide();
        }
        break;
    }

    case "drawing_game_results_widget":
    {
        if (msg.command.param)
        {
            const caption_by_image_id = msg.command.param.caption_by_image_id;
            const prompt_by_image_id = msg.command.param.prompt_by_image_id;
            buildDrawingGameResultsWidget(caption_by_image_id, prompt_by_image_id);
            _drawingGameResultsContainer.show();
            _returnToLobbyButton.show();
        }
        else
        {
            _drawingGameResultsContainer.hide();
        }
        break;
    }
    }
}


/**************************************************************************************************
 Message Handling
**************************************************************************************************/

function handleMessageFromServer(msg)
{
    if (msg instanceof GameStartingStateMessage)
    {
        onGameStartingState(msg);
    }
    else if (msg instanceof FailedToJoinMessage)
    {
        onFailedToJoinState(msg.reason);
    }
    else if (msg instanceof ReturnToLobbyMessage)
    {
        onReturnToLobby(msg.gameInterruptedReason);
    }
    else if (msg instanceof SelectGameStateMessage)
    {
        onSelectGameState(msg);
    }
    else if (msg instanceof ClientUIMessage)
    {
        onClientUIMessage(msg);
    }
}


/**************************************************************************************************
 Entry Point
**************************************************************************************************/

function main()
{
    console.log("Laughprop loaded");
    hideAllScreens();
    connectToBackend();
    initWelcomeScreen();
}

export { main };
