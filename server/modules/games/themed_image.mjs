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
 * themed_image.mjs
 * Bart Trzynadlowski, 2023
 *
 * Game script for themed image game. Given a random theme, whoever comes up with the best image
 * wins.
 */

const script = [
    // Begin by clearing state and display area on client side
    { op: "init_state" },
    { op: "client_ui", ui: { command: "init_game" } },
    { op: "client_ui", ui: { command: "title", param: "It's a Mood" } },

    // Select a random theme index.
    {
        op:                 "random_choice",
        writeToStateVar:    "@theme_index",
        choices:            [
            0,
            1,
            2,
            3,
            4,
            5,
            6,
            7
        ]
    },

    // Get the theme to show the user
    {
        op:                 "select",
        stateVar:           "@theme_index",
        writeToStateVar:    "@theme",
        selections:         {
            0: "Best place to hide in a zombie apocalypse.",
            1: "A hairy situation.",
            2: "Celebrities supplementing their income.",
            3: "Ancient technology.",
            4: "Creepy mimes.",
            5: "Hungry cartoon characters.",
            6: "The DJ is *who*?",
            7: "Utopia."
        }
    },
    { op: "client_ui", ui: { command: "instructions", param: "Describe a scene that best fits the theme." } },
    { op: "client_ui", ui: { command: "prompt_widget", param: "@theme" } },

    // Each user must submit a prompt and select a resulting image to submit
    { op: "per_client", ops:
        [
            // Wait for prompt
            { op: "wait_for_state_var", stateVar: "@@prompt" },

            // Construct txt2img parameters using the prompt
            {
                op:                 "select",
                stateVar:           "@theme_index",
                writeToStateVar:    "@@txt2img_params",
                selections:         {
                    0: { prompt: "@@prompt", negativePrompt: "" },  // best place to hide
                    1: { prompt: "@@prompt", negativePrompt: "" },  // hairy situation
                    2: { prompt: "@@prompt", negativePrompt: "distorted faces, distorted hands, grotesque" },   // celebrities
                    3: { prompt: "@@prompt", negativePrompt: "" },  // ancient technology
                    4: { prompt: "{@@prompt}, photorealistic. cinematic shot. dslr. 8k.", negativePrompt: "" },  // creepy mimes
                    5: { prompt: "{@@prompt}, Disney, Animated, Octane render, High quality, Masterpiece.", negativePrompt: "blur" },   // hungry cartoons
                    6: { prompt: "{@@prompt},  DJ in a nightclub, mixing live on stage, giant mixing table, 4k resolution, a masterpiece. close up", negativePrompt: "easynegative, bad-hands-5, grainy, low-res, extra limb, poorly drawn hands, missing limb, blurry, malformed hands, blur" },  // DJ
                    7: { prompt: "{@@prompt}, fantasy painting. pixar and hayao miyazaki", negativePrompt: "ugly, ugly arms, ugly hands, out of frame, distorted faces, grotesque" },   // utopia
                }
            },

            // Generate images
            { op: "client_ui", ui: { command: "instructions", param: "Just a moment. Generating images. Keep the browser window open and active..." } },
            { op: "client_ui", ui: { command: "prompt_widget", param: null } },
            { op: "txt2img", params: "@@txt2img_params", writeToStateVar: "@@image_candidates_by_id" },

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

            // Send to selected image to everyone. Must create a map containing a single entry:
            // { selected_image_id: selected_image } for "cache_images" UI command
            { op: "select", stateVar: "@@selected_image_id", writeToStateVar: "@@selected_image", selections: "@@image_candidates_by_id" },
            { op: "make_map", keys: [ "@@selected_image_id" ], values: [ "@@selected_image" ], writeToStateVar: "@@image_by_id" },
            { op: "client_ui", ui: { command: "cache_images", param: "@@image_by_id" }, sendToAll: true },

            // Return to waiting for everyone else
            { op: "client_ui", ui: { command: "image_carousel_widget", param: null } },
            { op: "client_ui", ui: { command: "instructions", param: "Hang tight while everyone else makes their selections. Keep the browser window open and active..." } },
        ]
    },

    // Wait for everyone to have made a submission
    { op: "wait_for_state_var_all_users", stateVar: "@@selected_image_id" },

    // Display everyone's images for voting
    { op: "gather_client_state_into_array", clientStateVar: "@@selected_image_id", writeToStateVar: "@selected_image_ids" },
    { op: "client_ui", ui: { command: "candidate_images_widget", param: "@selected_image_ids" } },
    { op: "client_ui", ui: { command: "instructions", param: "Vote for the winner!" } },

    // Each user must vote
    { op: "per_client", ops:
        [
            // Wait for vote
            { op: "wait_for_state_var", stateVar: "@@vote" },

            // Wait for everyone else
            { op: "client_ui", ui: { command: "candidate_images_widget", param: null } },
            { op: "client_ui", ui: { command: "instructions", param: "Waiting for everyone to vote..." } },
        ]
    },

    // Wait for everyone to vote
    { op: "wait_for_state_var_all_users", stateVar: "@@vote" },

    // Count votes and determine winner
    { op: "gather_client_state_into_array", clientStateVar: "@@vote", writeToStateVar: "@votes" },
    { op: "vote", stateVar: "@votes", writeToStateVar: "@winning_image_ids" },
    { op: "client_ui", ui: { command: "winning_images_widget", param: "@winning_image_ids" } },
    { op: "client_ui", ui: { command: "instructions", param: "And the winner is..." } },
];

export { script }