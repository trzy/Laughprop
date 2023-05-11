/*
 * drawing_game.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game script for drawing game.
 */

const script = [
    // Begin by clearing state and display area on client side
    { op: "init_state" },
    { op: "client_ui", ui: { command: "init_game" } },
    { op: "client_ui", ui: { command: "title", param: "Drawing Game" } },

    // Show drawing canvas
    { op: "client_ui", ui: { command: "canvas_widget", param: true } },
    { op: "client_ui", ui: { command: "instructions", param: "Draw something and include a description!" } },

    // Wait until an image is received
    { op: "per_client", ops:
        [
            // Wait for image and prompt
            { op: "wait_for_state_var", stateVar: "@@user_drawing" },

            // Generate images
            { op: "client_ui", ui: { command: "instructions", param: "Just a moment. Generating images..." } },
            //{ op: "client_ui", ui: { command: "canvas_widget", param: null } },
            { op: "sketch2img", prompt: "@@prompt", image: "@@user_drawing", writeToStateVar: "@@image_candidates_by_id" },

            // Wait for image candidates to arrive
            { op: "wait_for_state_var", stateVar: "@@image_candidates_by_id" },

            // Send images to client
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_candidates_by_id" } },

            // Send them to client for display
            { op: "gather_keys_into_array", stateVar: "@@image_candidates_by_id", writeToStateVar: "@@image_candidate_ids" },   // get keys (image IDs) from image ID map
            { op: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidate_ids" } },

            // Wait for user selection
            { op: "wait_for_state_var", stateVar: "@@selected_image_id" },
        ]
    },


];

export { script }
