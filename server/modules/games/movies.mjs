/*
 * movies.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game script for movie re-casting game. Select a movie, re-cast the characters, and select the
 * best images for each of the scenes in the movie. The best result wins.
 */

const script = [
    // Begin by clearing state and display area on client side
    { action: "init_state" },
    { action: "client_ui", ui: { command: "init_game" } },
    { action: "client_ui", ui: { command: "title", param: "I'd Watch That" } },

    // Each user proceeds with their own individual movie selections
    { action: "per_client", actions:
        [
            // Multi-select w/ multi-prompt: select movies and cast for each movie. Prompts come
            // back as @@prompt_0, @@prompt_1, etc.
            {
                action: "client_ui",
                ui:     {
                    command:    "multi_select_multi_prompt_widget",
                    param:      {
                        "Bloodsport":       [ "Frank Dux (Jean-Claude Van Damme)", "Chong Li (Bolo Yeung)" ],
                        "Step Brothers":    [ "Brennan (Will Ferrell)", "Dale (John C. Reilly)" ]
                    }
                }
            },

            // Wait for user's movie selection to arrive. Check only @@selected_movie and assume
            // that the required casting selections have made it back, too
            { action: "wait_for_state_var", stateVar: "@@selected_movie" },

            // Depending on the film, we select different depth2img command objects, which include
            // prompts to be expanded
            {
                // Scene 1
                action: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene1",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_1_FrankDux.jpg", prompt: "{@@prompt_0} wearing a white gi with a japanese garden in the background. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_1_Rules.jpg", prompt: "{@@prompt_1} wearing a red shirt, pointing finger in accusation in a suburban den. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },
            {
                // Scene 2
                action: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene2",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_2_ChongLi.jpg", prompt: "muscular {@@prompt_1} in a headband pointing. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_2_Drums.jpg", prompt: "{@@prompt_0} wearing a turquoise shirt fumbling with zipper and standing behind a drum set in a suburban bedroom. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" }
                }
            },
            {
                // Scene 3
                action: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene3",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_3_Splits.jpg", prompt: "muscular {@@prompt_0} meditating and performing the splits. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_3_Fight.jpg", prompt: "{@@prompt_1} wearing a red shirt, raising fist with an enraged facial expression, in the front yard of a suburban house. daytime. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },
            {
                // Scene 4
                action: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene4",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_4_KO.jpg", prompt: "muscular {@@prompt_0} delivers a knockout blow to {@@prompt_1}. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_4_Portrait.jpg", prompt: "80s style studio family portrait of {@@prompt_0} and {@@prompt_1} staring wistfully at the camera. Dressed in preppy attire. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },

            // Issue all the depth2img commands in order
            { action: "depth2img", params: "@@depth2img_command_scene1", writeToStateVar: "@@image_candidates_scene1" },
            { action: "depth2img", params: "@@depth2img_command_scene2", writeToStateVar: "@@image_candidates_scene2" },
            { action: "depth2img", params: "@@depth2img_command_scene3", writeToStateVar: "@@image_candidates_scene3" },
            { action: "depth2img", params: "@@depth2img_command_scene4", writeToStateVar: "@@image_candidates_scene4" },

            // Wait for image candidates for scene 1 to arrive, send to user for display, then wait
            // for user's selection
            { action: "client_ui", ui: { command: "instructions", param: "Filming underway. Coming soon to a browser near you! This may take a while, please be patient..." } },
            { action: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "wait_for_state_var", stateVar: "@@image_candidates_scene1" },
            { action: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidates_scene1" } },
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },          // image carousel returns selection in @@selected_image_id
            { action: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene1" },
            { action: "delete", stateVar: "@@selected_image_id" },

            // ... scene 2 ...
            { action: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 2/4. Please be patient..." } },
            { action: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "wait_for_state_var", stateVar: "@@image_candidates_scene2" },
            { action: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidates_scene2" } },
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { action: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene2" },
            { action: "delete", stateVar: "@@selected_image_id" },

            // ... scene 3 ...
            { action: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 3/4. Please be patient..." } },
            { action: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "wait_for_state_var", stateVar: "@@image_candidates_scene3" },
            { action: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidates_scene3" } },
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { action: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene3" },
            { action: "delete", stateVar: "@@selected_image_id" },

            // ... scene 4 ...
            { action: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 4/4. Please be patient..." } },
            { action: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "wait_for_state_var", stateVar: "@@image_candidates_scene4" },
            { action: "client_ui", ui: { command: "instructions", param: "Select a generated image to use." } },
            { action: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidates_scene4" } },
            { action: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { action: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene4" },
            { action: "delete", stateVar: "@@selected_image_id" },

            // Return to waiting for everyone else
            { action: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { action: "client_ui", ui: { command: "instructions", param: "Hang tight while everyone else makes their selections..." } },

            // Construct a single array holding all image IDs in scene order
            { action: "copy", source: [ "@@selected_image_id_scene1", "@@selected_image_id_scene2", "@@selected_image_id_scene3", "@@selected_image_id_scene4" ], writeToStateVar: "@@selected_image_ids" },

            // And create a map of image ID -> image data
            { action: "gather_images_into_map", fromStateVar: "@@selected_image_ids", writeToStateVar: "@@selected_images" }
        ]
    },

    // Wait for everyone to have made a submission
    { action: "wait_for_state_var_all_users", stateVar: "@@selected_images" },

    // Collect every client's map of (image ID -> image data) into a map keyed by client ID. The
    // final map is a map of maps: client ID -> (image ID -> image data).
    { action: "gather_client_state_into_map_by_client_id", clientStateVar: "@@selected_images", writeToStateVar: "@selected_images_by_client_id" },
    //TODO: we also need to transmit the image IDs in scene order @@selected_image_ids -> @selected_image_ids_by_client_id

    // Send images to everyone
    { action: "client_ui", ui: { command: "candidate_slideshows_widget", param: "@selected_images_by_client_id" } },
    { action: "client_ui", ui: { command: "instructions", param: "Which flick is your top pick?" } },

    // Each user must vote
    { action: "per_client", actions:
        [
            // Wait for vote (which is a client ID)
            { action: "wait_for_state_var", stateVar: "@@vote" },

            // Wait for everyone else
            { action: "client_ui", ui: { command: "candidate_slideshows_widget", param: null } },
            { action: "client_ui", ui: { command: "instructions", param: "Tallying the Academy's votes..." } },
        ]
    },

    // Wait for everyone to vote
    { action: "wait_for_state_var_all_users", stateVar: "@@vote" },

    // Count votes and determine winner
    { action: "gather_client_state_into_array", clientStateVar: "@@vote", writeToStateVar: "@votes" },
    { action: "vote", stateVar: "@votes", writeToStateVar: "@winning_client_id" },
    { action: "client_ui", ui: { command: "winning_images_widget", param: "@winning_client_id" } },
    { action: "client_ui", ui: { command: "instructions", param: "The award for best picture goes to..." } },
];

export { script }