/*
 * www/js/modules/screens/ui_screen.mjs
 * Bart Trzynadlowski, 2023
 *
 * UI screen base class. All UI screens must extend this.
 */

class UIScreen
{
    onMessageReceived(msg)
    {
        console.log("UIScreen: Message received but not handled (make sure derived classes implement onMessageReceived method): " + msg.__id);
    }

    constructor()
    {
    }
}

export { UIScreen };