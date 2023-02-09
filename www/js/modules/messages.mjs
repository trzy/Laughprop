/*
 * www/js/modules/messages.mjs
 * Bart Trzynadlowski, 2023
 *
 * JSON message objects for communication between web server and front end page. These must be kept
 * carefully in sync with their Python counterparts in python/networking/messages.py!
 */

class HelloMessage
{
    __id = "HelloMessage";
    message;

    constructor(message)
    {
        this.message = message;
    }
}

export { HelloMessage };