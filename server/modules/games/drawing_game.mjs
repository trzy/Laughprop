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

    // Create a mapping between clients which determines to whom each client passes along its output
    { op: "random_client_input_output_mapping", writeToStateVar: "@in_out_map" },

    // Ask everyone to imagine and describe something
    { op: "client_ui", ui: { command: "instructions", param: "Time to be creative..." } },
    { op: "client_ui", ui: { command: "prompt_widget", param: "Imagine a scene (that you could draw!) and describe it..." } },

    // Each player must submit a prompt
    { op: "per_client", ops:
        [
            { op: "wait_for_state_var", stateVar: "@@prompt" },
            { op: "client_ui", ui: { command: "prompt_widget", param: false } },

            { op: "client_ui", ui: { command: "instructions", param: "Waiting for others to finish writing..."} }
        ]
    },
    { op: "wait_for_state_var_all_users", stateVar: "@@prompt" },

    // Gather all prompts into map of: clientId -> prompt
    { op: "gather_client_state_into_map_by_client_id", clientStateVar: "@@prompt", writeToStateVar: "@prompt_1_by_client_id" },

    // Redistribute the prompts to the destination clientIds. Create a map where the keys are re-mapped accordingly.
    { op: "remap_keys", stateVar: "@prompt_1_by_client_id", keyMapStateVar: "@in_out_map", writeToStateVar: "@prompt_1_by_next_client_id" },

    // The prompts are distributed to other players who must then draw a scribble corresponding to each
    { op: "per_client", ops:
        [
            // Take the prompts and distribute them into per-client variables. That is, for each
            // client, pull the prompt out of the map using our clientId.
            { op: "get_our_client_id", writeToStateVar: "@@clientId" },
            { op: "select", stateVar: "@@clientId", selections: "@prompt_1_by_next_client_id", writeToStateVar: "@@scribble_prompt_1" },
            { op: "client_ui", ui: { command: "instructions", param: "Draw: {@@scribble_prompt_1}" } },

            // Show drawing canvas and wait for drawing
            { op: "client_ui", ui: { command: "canvas_widget", param: true } },
            { op: "wait_for_state_var", stateVar: "@@user_drawing" },

            // Generate images
            { op: "client_ui", ui: { command: "instructions", param: "Just a moment. Turning your doodle into a masterpiece..." } },
            { op: "client_ui", ui: { command: "canvas_widget", param: null } },
            { op: "sketch2img", prompt: "@@scribble_prompt_1", image: "@@user_drawing", writeToStateVar: "@@image_candidates_by_id" },

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
            { op: "client_ui", ui: { command: "instructions", param: "Waiting for others to make their selections..."} },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },

            // Send the selected image to everyone. Must create a map containing a single entry:
            // { selected_image_id: selected_image } for "cache_images" UI command
            { op: "select", stateVar: "@@selected_image_id", writeToStateVar: "@@selected_image", selections: "@@image_candidates_by_id" },
            { op: "make_map", keys: [ "@@selected_image_id" ], values: [ "@@selected_image" ], writeToStateVar: "@@image_by_id" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_by_id" }, sendToAll: true },
        ]
    },

    // Wait for everyone to have made a submission
    { op: "wait_for_state_var_all_users", stateVar: "@@selected_image_id" },

    // Gather all submitted image IDs into a map of: clientId -> imageId
    { op: "gather_client_state_into_map_by_client_id", clientStateVar: "@@selected_image_id", writeToStateVar: "@image_id_by_client_id" },

    // Redistribute the image IDs to the destination clientIds...
    { op: "remap_keys", stateVar: "@image_id_by_client_id", keyMapStateVar: "@in_out_map", writeToStateVar: "@image_id_by_next_client_id" },

    // The images are distributed to other players who must then caption them
    { op: "per_client", ops:
        [
            // Take the images and distribute them into per-client variables
            { op: "get_our_client_id", writeToStateVar: "@@clientId" },
            { op: "select", stateVar: "@@clientId", selections: "@image_id_by_next_client_id", writeToStateVar: "@@image_id" },
            { op: "client_ui", ui: { command: "instructions", param: "Caption this image!" } },

            // Show image caption widget
            { op: "client_ui", ui: { command: "caption_image_widget", param: "@@image_id" } },

            // Wait for caption
            { op: "wait_for_state_var", stateVar: "@@caption" },

            { op: "client_ui", ui: { command: "instructions", param: "Waiting for others to finish writing..." } },
            { op: "client_ui", ui: { command: "caption_image_widget", param: null } },
        ]
    },
    { op: "wait_for_state_var_all_users", stateVar: "@@caption" },

    // Gather all submitted captions into a map of: clientId -> caption
    { op: "gather_client_state_into_map_by_client_id", clientStateVar: "@@caption", writeToStateVar: "@caption_by_next_client_id" },

    // For each image ID, need to aggregate [ prompt, caption ] that were associated with it.
    // First, image ID -> caption:
    //      (next_client_id -> image_id) => (image_id -> next_client_id)
    //      (image_id -> next_client_id), (next_client_id -> caption) => (image_id -> caption)
    // Next, image ID -> prompt
    //      (client_id -> next_client_id) => (next_client_id -> client_id)
    //      (image_id -> next_client_id), (next_client_id -> prompt_1) => (image_id -> prompt_1)
    { op: "invert_map", stateVar: "@image_id_by_next_client_id", writeToStateVar: "@next_client_id_by_image_id" },
    { op: "chain_maps", keyMapVar: "@next_client_id_by_image_id", valueMapVar: "@caption_by_next_client_id", writeToStateVar: "@caption_by_image_id" },
    { op: "invert_map", stateVar: "@in_out_map", writeToStateVar: "@client_id_by_next_client_id" },
    { op: "chain_maps", keyMapVar: "@next_client_id_by_image_id", valueMapVar: "@prompt_1_by_next_client_id", writeToStateVar: "@prompt_1_by_image_id" },

    // Send to clients so they can display
    { op: "client_ui", ui: { command: "drawing_game_results_widget", param: { caption_by_image_id: "@caption_by_image_id", prompt_by_image_id: "@prompt_1_by_image_id" } } },
    { op: "client_ui", ui: { command: "instructions", param: "Let's if anyone got the correct caption..." } }
];

export { script }
