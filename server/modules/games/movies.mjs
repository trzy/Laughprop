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
                        "Pulp Fiction":     [ "Vincent (John Travolta)", "Jules (Samuel L. Jackson)", "Mia (Uma Thurman)" ],
                        "Bloodsport":       [ "Frank Dux (Jean-Claude Van Damme)", "Chong Li (Bolo Yeung)" ],
                        "Step Brothers":    [ "Brennan (Will Ferrell)", "Dale (John C. Reilly)" ],
                        "The Hangover":     [ "Phil (Bradley Cooper)", "Stu (Ed Helms)", "Doug (Justin Bartha)", "Alan (Zach Galifianakis)" ],
                        "Star Wars":        [ "Luke Skywalker (Mark Hamill)", "Princess Leia (Carrie Fisher)", "Han Solo (Harrison Ford)", "Obi Wan Kenobi (Alec Guinness)" ],
                        "Lethal Weapon":    [ "Martin Riggs (Mel Gibson)", "Roger Murtaugh (Danny Glover)" ],
                        "Terminator 2":     [ "Terminator (Arnold Schwarzenegger)", "Linda Hamilton (Sarah Connor)", "Edward Furlong (young John Connor)", "Robert Patrick (T-1000)" ]
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
                    "Pulp Fiction":     { image: "PulpFiction/PulpFiction_1_Dance.jpg", prompt: "{@@prompt_0} in a tuxedo dancing and looking seductive.", negativePrompt: "grotesque, distorted face, unrealistic hands, unrealistic fingers" },
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_1_FrankDux.jpg", prompt: "{@@prompt_0} wearing a white gi with a japanese garden in the background. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_1_Rules.jpg", prompt: "{@@prompt_1} wearing a red shirt, pointing finger in accusation in a suburban den. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" },
                    "The Hangover":     { image: "Hangover/Hangover_1_Call.jpg", prompt: "{@@prompt_0} with slightly bruised face listening to a cell phone while wearing aviator sun glasses and a worried expression on his face. Background is the Nevada desert. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face, monster, headphones" },
                    "Star Wars":        { image: "StarWars/StarWars_1_Leia.jpg", prompt: "{@@prompt_1} with a Princess Leia wig and white gown, holding a Star Wars blaster with a red glow emanating from the right side of the background. Cinematic shot. Canon 5d.", negativePrompt: "grotesque, distorted face, suit" },
                    "Lethal Weapon":    { image: "LethalWeapon/LethalWeapon_1_Portrait.jpg", prompt: "{@@prompt_0} and {@@prompt_1} in Lethal Weapon. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face" },
                    "Terminator 2":     { image: "T2/T2_John.jpg", prompt: "Youthful {@@prompt_2} wearing an army camo jacket and blue backpack holding onto bicycle handlebars looking over his shoulder with surprise and dread. Concrete path between concrete walls is in the blurry background.  Cinematic shot. Canon 5d. Dramatic. Depth of field.", negativePrompt: "Grotesque, distorted face, distorted hands, smiling, wearing hat, wearing helmet, water, cars, vegetation" }
                }
            },
            {
                // Scene 2
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene2",
                selections: {
                    "Pulp Fiction":     { image: "PulpFiction/PulpFiction_2_Burger.jpg", prompt: "{@@prompt_1} in a suit with an afro eating a cheeseburger. Cinematic shot. Canon5d. Background blurred.", negativePrompt: "grotesque, distorted face, unrealistic hands, unrealistic fingers" },
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_2_ChongLi.jpg", prompt: "muscular {@@prompt_1} in a headband pointing. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_2_Drums.jpg", prompt: "{@@prompt_0} wearing a turquoise shirt fumbling with zipper and standing behind a drum set in a suburban bedroom. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "The Hangover":     { image: "Hangover/Hangover_2_Baby.jpg", prompt: "{@@prompt_3} with a gray t-shirt, aviator sunglasses, wearing a baby bjorn and a baby in it, leaning over in an elevator.", negativePrompt: "grotesque, distorted face, monster" },
                    "Star Wars":        { image: "StarWars/StarWars_2_Han.jpg", prompt: "{@@prompt_2} in white storm trooper armor standing next to Chewbacca in the death star. cinematic shot. canon 5d", negativePrompt: "grotesque, distorted face" },
                    "Lethal Weapon":    { image: "LethalWeapon/LethalWeapon_2_Range.jpg", prompt: "{@@prompt_0} and {@@prompt_1} at the police shooting range, both wearing hearing protection. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face" },
                    "Terminator 2":     { image: "T2/T2_Arnold.jpg", prompt: "{@@prompt_0} in a leather jacket and sunglasses riding a Harley with a shot gun in his hand. Serious expression. Telephone poles, houses, and Los Angeles mountains in the background. Cinematic shot. Canon 5d", negativePrompt: "Grotesque, distorted face, distorted hands, smiling, wearing hat, wearing helmet" }
                }
            },
            {
                // Scene 3
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene3",
                selections: {
                    "Pulp Fiction":     { image: "PulpFiction/PulpFiction_3_Uma.jpg", prompt: "{@@prompt_2} with shoulder-length black hair and classic bangs wearing a black dress smoking a cigarette seductively on a bed with a gun in her other hand. Red lipstick. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face, unrealistic hands, unrealistic fingers" },
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_3_Splits.jpg", prompt: "muscular {@@prompt_0} meditating and performing the splits. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_3_Fight.jpg", prompt: "{@@prompt_1} wearing a red shirt, raising fist with an enraged facial expression, in the front yard of a suburban house. daytime. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" },
                    "The Hangover":     { image: "Hangover/Hangover_3_Tooth.jpg", prompt: "Hungover {@@prompt_1} wearing glasses grinning with a bloodied mouth and tooth knocked out looking in the mirror with a terrified and hilarious expression on his face.", negativePrompt: "grotesque, distorted face, monster, perfect teeth" },
                    "Star Wars":        { image: "StarWars/StarWars_3_Obi.jpg", prompt: "Close up of {@@prompt_3} with a wild-eyed expression dressed like Obi Wan wielding a blue lightsaber with Darth Vader looming behind him, in a hallway on the Death Star. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face, big head, large hood" },
                    "Lethal Weapon":    { image: "LethalWeapon/LethalWeapon_3_Bomb.jpg", prompt: "Frightened {@@prompt_1} sitting on a toilet. {@@prompt_0} on the left checking in. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face, beard" },
                    "Terminator 2":     { image: "T2/T2_Sarah.jpg", prompt: "Badass fit {@@prompt_1} in the desert wearing sunglasses, black tank top, black jeans, holding an AK-47 and wearing a belt with a knife. White broken down car in the background. Blurry background. Wooden picnic table in the foreground right with crumpled cloth on top. Cinematic shot. Canon 5d. Dramatic. Depth of field.", negativePrompt: "Grotesque, distorted face, distorted hands, smiling, wearing hat, wearing helmet" }
                }
            },
            {
                // Scene 4
                op: "select",
                stateVar: "@@selected_movie",
                writeToStateVar: "@@depth2img_command_scene4",
                selections: {
                    "Pulp Fiction":     { image: "PulpFiction/PulpFiction_4_Duo.jpg", prompt: "{@@prompt_0} with slicked back hair and {@@prompt_1} with an afro wearing suits and pointing guns with stern expressions on their faces. Standing in front of featureless gray walls riddled with bullet holes. Cinematic shot. Canon 5d.", negativePrompt: "grotesque, distorted face, unrealistic hands, unrealistic fingers" },
                    "Bloodsport":       { image: "Bloodsport/Bloodsport_4_KO.jpg", prompt: "muscular {@@prompt_0} delivers a knockout blow to {@@prompt_1}. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster" },
                    "Step Brothers":    { image: "StepBrothers/StepBrothers_4_Portrait.jpg", prompt: "80s style studio family portrait of {@@prompt_0} and {@@prompt_1} staring wistfully at the camera. Dressed in preppy attire. cinematic shot. canon 5d.", negativePrompt: "grotesque, distorted face, monster, bad hands" },
                    "The Hangover":     { image: "Hangover/Hangover_4_Rooftop.jpg", prompt: "Severely sunburned skin disheveled {@@prompt_2} wearing a dirty white unbuttoned shirt screaming while standing on a casino rooftop in the daytime. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face, monster, headphones, normal complexion, clean, clean shirt" },
                    "Star Wars":        { image: "StarWars/StarWars_4_Luke.jpg", prompt: "{@@prompt_0} in the cockpit of an X-Wing fighter with an orange visor and a serious expression on face. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face" },
                    "Lethal Weapon":    { image: "LethalWeapon/LethalWeapon_4_Guns.jpg", prompt: "{@@prompt_0} and {@@prompt_1} in Lethal Weapon. Cinematic shot. Canon 5d", negativePrompt: "grotesque, distorted face" },
                    "Terminator 2":     { image: "T2/T2_T1000.jpg", prompt: "Bare-headed {@@prompt_3} dressed in a police uniform with short hair standing in a steel foundry staring at the camera with a menacing look and holding his finger up. No hat. Everything is in an orange glow. Cinematic shot. Canon 5d.", negativePrompt: "Wearing a hat, wearing a helmet, grotesque, distorted hands, medals on jacket" }
                }
            },

            // Issue all the depth2img commands in order
            { op: "depth2img", params: "@@depth2img_command_scene1", writeToStateVar: "@@image_candidates_by_id_scene1" },
            { op: "depth2img", params: "@@depth2img_command_scene2", writeToStateVar: "@@image_candidates_by_id_scene2" },
            { op: "depth2img", params: "@@depth2img_command_scene3", writeToStateVar: "@@image_candidates_by_id_scene3" },
            { op: "depth2img", params: "@@depth2img_command_scene4", writeToStateVar: "@@image_candidates_by_id_scene4" },

            // Wait for image candidates for scene 1 to arrive, send to user for display, then wait
            // for user's selection
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway. Coming soon to a browser near you! This may take a while, please be patient and do not let your phone screen turn off..." } },
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
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 2/4. Please be patient and do not let your phone screen turn off..." } },
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
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 3/4. Please be patient and do not let your phone screen turn off..." } },
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
            { op: "client_ui", ui: { command: "instructions", param: "Filming underway for scene 4/4. Please be patient and do not let your phone screen turn off..." } },
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
            { op: "client_ui", ui: { command: "instructions", param: "Hang tight while everyone else makes their selections.  Do not let your phone screen turn off..." } },

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