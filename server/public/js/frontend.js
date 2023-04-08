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


/**************************************************************************************************
 Connection Management
**************************************************************************************************/

var _socket = null;
var _clientId = generateUuid();

function connectToBackend()
{
    let location = window.location;
    let wsUrl = "ws://" + location.hostname + ":" + location.port;

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
const _gameButtons = [ _funniestImageGameButton, _movieGameButton ];

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
    deselectAllButtons();
}


/**************************************************************************************************
 Game Flow Handling
**************************************************************************************************/

const _gameScreen = $("#GameScreen");

const _gameTitleContainer = $("#GameTitleContainer");
const _gameTitle = $("#GameTitleContainer .game-title");

const _instructionsContainer = $("#InstructionsContainer");
const _instructions = $("#Instructions");

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
const _returnToLobbyButton = $("#WinningImage #ReturnToLobbyButton");

const _containers = [ _gameTitleContainer, _instructionsContainer, _promptContainer, _carouselContainer, _candidatesContainer, _winningImagesContainer ];

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

function onClientUIMessage(msg)
{
    switch (msg.command.command)
    {
    case "clear_game_div":
        hideAllScreens();
        for (const container of _containers)
        {
            container.hide();
        }
        _gameScreen.show();
        break;

    case "show_title":
        _gameTitle.text(msg.command.param);
        _gameTitleContainer.show();
        break;

    case "show_instructions":
        _instructions.text(msg.command.param);
        _instructionsContainer.show();
        break;

    case "show_prompt_field":
        _promptDescription.text(msg.command.param);
        _promptContainer.show();
        _promptSubmitButton.off("click").click(function()
        {
            const msg = new ClientInputMessage({ "@@prompt": _promptTextField.val() });
            sendMessage(msg);
        });
        break;

    case "hide_prompt_field":
        _promptContainer.hide();
        break;

    case "show_image_carousel":
    {
        const imageByUuid = msg.command.param;
        const numImages = Object.keys(imageByUuid).length;

        // Place images in selection carousel
        const maxImages = Math.min(numImages, _imageCarouselThumbnails.length);
        let i = 0;
        for (const [uuid, image] of Object.entries(imageByUuid))
        {
            if (i < maxImages)
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

    case "hide_image_carousel":
        _carouselContainer.hide();
        break;

    case "show_candidate_images":
    {
        _candidatesContainer.show();

        const imageByUuid = msg.command.param;

        // Remove any existing images
        $("#CandidateImages img").remove();

        // Create image elements that when clicked
        for (const [uuid, image] of Object.entries(imageByUuid))
        {
            let img = $("<img>");
            img.attr("src", "data:image/jpeg;base64," + image);
            img.prop("uuid", uuid);
            _candidatesContainer.prepend(img);
            img.click(function() { onCandidateImageClicked(img, uuid); });
        }

        // Disable the voting button until clicked
        _voteImageButton.addClass("button-disabled");
        _voteImageButton.show();

        break;
    }

    case "hide_candidate_images":
        _candidatesContainer.hide();
        break;

    case "show_winning_images":
    {
        _winningImagesContainer.show();

        const imageByUuid = msg.command.param;

        // Remove any existing images
        $("#WinningImage img").remove();

        // Create image elements that when clicked
        for (const [uuid, image] of Object.entries(imageByUuid))
        {
            let img = $("<img>");
            img.attr("src", "data:image/jpeg;base64," + image);
            img.prop("uuid", uuid);
            _winningImagesContainer.prepend(img);
        }

        // Is there a tie?
        //TODO: print that we have a tie

        // Proceed back to game selection
        _returnToLobbyButton.off("click").click(function()
        {
            // Leave game and return to lobby
            const msg = new LeaveGameMessage();
            sendMessage(msg);
            onReturnToLobby(null);  // no error
        });
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