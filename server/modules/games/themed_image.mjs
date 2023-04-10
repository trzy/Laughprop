/*
 * themed_image.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game script for themed image game. Given a random theme, whoever comes up with the best image
 * wins.
 */

const script = [
    // Begin by clearing state and display area on client side
    { action: "init_state" },
    { action: "client_ui", ui: { command: "init_game" } },
    { action: "client_ui", ui: { command: "title", param: "It's a Mood" } },

    // Select a random theme
    {
        action:             "random_choice",
        writeToStateVar:    "@theme",
        choices:            [
            "Best place to hide in a zombie apocalypse.",
            "A hairy situation.",
            "Celebrities supplementing their income.",
            "Ancient technology.",
            "Creepy mimes.",
        ]
    },
    { action: "client_ui", ui: { command: "instructions", param: "Describe a scene that best fits the theme." } },
    { action: "client_ui", ui: { command: "prompt_widget", param: "@theme" } },

    // Each user must submit a prompt and select a resulting image to submit
    { action: "per_client", actions:
        [
            // Wait for prompt
            { action: "wait_for_state_var", stateVar: "@@prompt" },

            // Generate images
            { action: "client_ui", ui: { command: "instructions", param: "Just a moment. Generating images..." } },
            { action: "client_ui", ui: { command: "prompt_widget", param: null } },
            { action: "txt2img", prompt: "@@prompt", writeToStateVar: "@@image_candidates" },

            // Wait for image candidates to arrive
            { action: "wait_for_state_var", stateVar: "@@image_candidates" },

            // Send them to client for display
            { action: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidates" } },

            // Wait for user selection
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },

            // Return to waiting for everyone else
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "client_ui", ui: { command: "instructions", param: "Hang tight while everyone else makes their selections..." } },
        ]
    },

    // Wait for everyone to have made a submission
    { action: "wait_for_state_var_all_users", stateVar: "@@selected_image_id" },

    // Display everyone's images for voting
    { action: "gather_client_state_into_set", clientStateVar: "@@selected_image_id", writeToStateVar: "@selected_image_ids" },
    { action: "gather_images_into_map", fromStateVar: "@selected_image_ids", writeToStateVar: "@selected_images" },
    { action: "client_ui", ui: { command: "candidate_images_widget", param: "@selected_images" } },
    { action: "client_ui", ui: { command: "instructions", param: "Vote for the winner!" } },

    // Each user must vote
    { action: "per_client", actions:
        [
            // Wait for vote
            { action: "wait_for_state_var", stateVar: "@@vote" },

            // Wait for everyone else
            { action: "client_ui", ui: { command: "candidate_images_widget", param: null } },
            { action: "client_ui", ui: { command: "instructions", param: "Waiting for everyone to vote..." } },
        ]
    },

    // Wait for everyone to vote
    { action: "wait_for_state_var_all_users", stateVar: "@@vote" },

    // Count votes and determine winner
    { action: "gather_client_state_into_array", clientStateVar: "@@vote", writeToStateVar: "@votes" },
    { action: "vote", stateVar: "@votes", writeToStateVar: "@winning_image_ids" },
    { action: "gather_images_into_map", fromStateVar: "@winning_image_ids", writeToStateVar: "@winning_images" },
    { action: "client_ui", ui: { command: "winning_images_widget", param: "@winning_images" } },
    { action: "client_ui", ui: { command: "instructions", param: "And the winner is..." } },
];

export { script }