/*
 * movies.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game script for movie re-casting game. Select a movie, re-cast the characters, and select the
 * best images for each of the scenes in the movie. The best result wins.
 */

const script = [
    // Begin by clearing state and display area on client side
    { op: "init_state" },
    { op: "client_ui", ui: { command: "init_game" } },
    { op: "client_ui", ui: { command: "title", param: "I'd Watch That" } },

    // Each user proceeds with their own individual movie selections
    { op: "per_client", ops:
        [
            // Multi-select w/ multi-prompt: select movies and cast for each movie. Prompts come
            // back as @@prompt_0, @@prompt_1, etc.
            {
                op: "client_ui",
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
            { op: "wait_for_state_var", stateVar: "@@selected_movie" },

            // Depending on the film, we select different depth2img command objects, which include
            // prompts to be expanded
            {
                // Scene 1
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene1",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_1_FrankDux.jpg", prompt: "{@@prompt_0} wearing a white gi with a japanese garden in the background. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_1_Rules.jpg", prompt: "{@@prompt_1} wearing a red shirt, pointing finger in accusation in a suburban den. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },
            {
                // Scene 2
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene2",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_2_ChongLi.jpg", prompt: "muscular {@@prompt_1} in a headband pointing. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_2_Drums.jpg", prompt: "{@@prompt_0} wearing a turquoise shirt fumbling with zipper and standing behind a drum set in a suburban bedroom. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" }
                }
            },
            {
                // Scene 3
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene3",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_3_Splits.jpg", prompt: "muscular {@@prompt_0} meditating and performing the splits. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_3_Fight.jpg", prompt: "{@@prompt_1} wearing a red shirt, raising fist with an enraged facial expression, in the front yard of a suburban house. daytime. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },
            {
                // Scene 4
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene4",
                selections: {
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_4_KO.jpg", prompt: "muscular {@@prompt_0} delivers a knockout blow to {@@prompt_1}. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_4_Portrait.jpg", prompt: "80s style studio family portrait of {@@prompt_0} and {@@prompt_1} staring wistfully at the camera. Dressed in preppy attire. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" }
                }
            },

            // Issue all the depth2img commands in order
            { op: "depth2img", params: "@@depth2img_command_scene1", writeToStateVar: "@@image_candidates_by_id_scene1" },
            { op: "depth2img", params: "@@depth2img_command_scene2", writeToStateVar: "@@image_candidates_by_id_scene2" },
            { op: "depth2img", params: "@@depth2img_command_scene3", writeToStateVar: "@@image_candidates_by_id_scene3" },
            { op: "depth2img", params: "@@depth2img_command_scene4", writeToStateVar: "@@image_candidates_by_id_scene4" },

            // Wait for image candidates for scene 1 to arrive, send to user for display, then wait
            // for user's selection
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway. Coming soon to a browser near you! This may take a while, please be patient..." } },
            { op: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "wait_for_state_var", stateVar: "@@image_candidates_by_id_scene1" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_candidates_by_id_scene1" } },                                 // send images themselves
            { op: "gather_keys_into_array", stateVar: "@@image_candidates_by_id_scene1", writeToStateVar: "@@image_candidate_ids_scene1" }, // get keys (image IDs) from image ID map
            { op: "client_ui", ui: { command: "instructions", param: "Scene 1/4: Select a generated image to use." } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidate_ids_scene1" } },
            { op: "wait_for_state_var", stateVar: "@@selected_image_id" },          // image carousel returns selection in @@selected_image_id
            { op: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene1" },
            { op: "delete", stateVar: "@@selected_image_id" },

            // ... scene 2 ...
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 2/4. Please be patient..." } },
            { op: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "wait_for_state_var", stateVar: "@@image_candidates_by_id_scene2" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_candidates_by_id_scene2" } },
            { op: "gather_keys_into_array", stateVar: "@@image_candidates_by_id_scene2", writeToStateVar: "@@image_candidate_ids_scene2" },
            { op: "client_ui", ui: { command: "instructions", param: "Scene 2/4: Select a generated image to use." } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidate_ids_scene2" } },
            { op: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { op: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene2" },
            { op: "delete", stateVar: "@@selected_image_id" },

            // ... scene 3 ...
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 3/4. Please be patient..." } },
            { op: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "wait_for_state_var", stateVar: "@@image_candidates_by_id_scene3" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_candidates_by_id_scene3" } },
            { op: "gather_keys_into_array", stateVar: "@@image_candidates_by_id_scene3", writeToStateVar: "@@image_candidate_ids_scene3" },
            { op: "client_ui", ui: { command: "instructions", param: "Scene 3/4: Select a generated image to use." } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidate_ids_scene3" } },
            { op: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { op: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene3" },
            { op: "delete", stateVar: "@@selected_image_id" },

            // ... scene 4 ...
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 4/4. Please be patient..." } },
            { op: "client_ui", ui: { command: "multi_select_multi_prompt_widget", param: null } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "wait_for_state_var", stateVar: "@@image_candidates_by_id_scene4" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_candidates_by_id_scene4" } },
            { op: "gather_keys_into_array", stateVar: "@@image_candidates_by_id_scene4", writeToStateVar: "@@image_candidate_ids_scene4" },
            { op: "client_ui", ui: { command: "instructions", param: "Scene 4/4: Select a generated image to use." } },
            { op: "client_ui", ui: { command: "image_carousel_widget", param: "@@image_candidate_ids_scene4" } },
            { op: "wait_for_state_var", stateVar: "@@selected_image_id" },
            { op: "copy", source: "@@selected_image_id", writeToStateVar: "@@selected_image_id_scene4" },
            { op: "delete", stateVar: "@@selected_image_id" },

            // Return to waiting for everyone else
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "client_ui", ui: { command: "instructions", param: "Hang tight while everyone else makes their selections..." } },

            // Construct a single array holding all image IDs in scene order
            { op: "copy", source: [ "@@selected_image_id_scene1", "@@selected_image_id_scene2", "@@selected_image_id_scene3", "@@selected_image_id_scene4" ], writeToStateVar: "@@selected_image_ids" },

            // And create a map of image ID -> image data
            { op: "gather_images_into_map", fromStateVar: "@@selected_image_ids", writeToStateVar: "@@selected_images" },

            // Send to all clients (clients will need to display each others' images later) as a map of (image ID -> image data)
            { op: "client_ui", ui: { command: "cache_images", param: "@@selected_images" }, sendToAll: true },

            // Sync signal
            { op: "copy", source: true, writeToStateVar: "@@client_finished" }
        ]
    },

    // Wait for everyone to have made a submission
    { op: "wait_for_state_var_all_users", stateVar: "@@client_finished" },

    // Gather up every clients array of image IDs in scene order and create a map of: client ID -> [image IDs]
    { op: "gather_client_state_into_map_by_client_id", clientStateVar: "@@selected_image_ids", writeToStateVar: "@selected_image_ids_by_client_id" },

    // Send image IDs to everyone (everyone has the image data by now)
    { op: "client_ui", ui: { command: "slideshows_widget", param: { selectedImageIdsByClientId: "@selected_image_ids_by_client_id", winningClientIds: null } } },
    { op: "client_ui", ui: { command: "instructions", param: "Which flick is your top pick?" } },

    // Each user must vote
    { op: "per_client", ops:
        [
            // Wait for vote (which is a client ID)
            { op: "wait_for_state_var", stateVar: "@@vote" },

            // Wait for everyone else
            { op: "client_ui", ui: { command: "slideshows_widget", param: { selectedImageIdsByClientId: null, winningClientIds: null } } }, // disables the widget
            { op: "client_ui", ui: { command: "instructions", param: "Tallying the Academy's votes..." } },
        ]
    },

    // Wait for everyone to vote
    { op: "wait_for_state_var_all_users", stateVar: "@@vote" },

    // Count votes and determine winner
    { op: "gather_client_state_into_array", clientStateVar: "@@vote", writeToStateVar: "@votes" },
    { op: "vote", stateVar: "@votes", writeToStateVar: "@winning_client_ids" },
    { op: "client_ui", ui: { command: "slideshows_widget", param: { selectedImageIdsByClientId: null, winningClientIds: "@winning_client_ids" } } },    // re-enables the widget and shows only existing slideshows matching winning client IDs
    { op: "client_ui", ui: { command: "instructions", param: "The award for best picture goes to..." } },
];

export { script }