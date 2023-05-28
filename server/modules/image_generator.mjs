/*
 * image_generator.mjs
 * Bart Trzynadlowski, 2023
 *
 * Handles image generation requests.
 *
 * TODO:
 * -----
 * - Multiple server support.
 */

import crypto from "crypto";
import http from "http";
import fs from "fs";
import { randomChoice } from "./utils.mjs";

class ImageGenerator
{
    _sessionById;   // reference to sessions table (session indexed by session ID)
    _imageServerParams = {
        host: "127.0.0.1",
        port: 7860,
        txt2ImgModel: "v1-5-pruned-emaonly.safetensors",
        depth2ImgModel: "512-depth-ema.ckpt"
    };
    _placeholderImages = [];
    _inputImageByAssetPath = {};

    _tryGetSessionByClientId(clientId)
    {
        for (const [_, session] of Object.entries(this._sessionById))
        {
            if (session.hasClient(clientId))
            {
                return session;
            }
        }
        return null;
    }

    _loadInputImage(assetPath)
    {
        if (assetPath in this._inputImageByAssetPath)
        {
            return this._inputImageByAssetPath[assetPath];
        }

        const filepath = "../assets/" + assetPath;
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString("base64");
        this._inputImageByAssetPath[assetPath] = base64;
        return base64;
    }

    _getImageServerOptions(onOptions)
    {
        const url = "http://" + this._imageServerParams.host + ":" + this._imageServerParams.port + "/sdapi/v1/options";
        http.get(url, response =>
        {
            response.on("data", data =>
            {
                try
                {
                    onOptions(JSON.parse(data));
                }
                catch (error)
                {
                    console.log("Error: Unable to parse image server options");
                    onOptions({});
                }
            });
        }).on("error", error =>
        {
            console.log("Error: Image server options read request failed");
            console.log(error);
            onOptions({});
        });
    }

    _setImageModel(model)
    {
        console.log(`Setting image model: ${model}`);

        const options = {
            "sd_model_checkpoint": model
        };

        // Post
        const urlParams = {
            host: this._imageServerParams.host,
            port: this._imageServerParams.port,
            path: "/sdapi/v1/options",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        const request = http.request(urlParams);
        request.on("error", error =>
        {
            console.log(`Error: Model set request failed`);
            console.log(error);
        });

        request.write(JSON.stringify(options));
        request.end();
    }

    makeTxt2ImgRequest(clientId, prompt, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
            return;
        }

        const self = this;

        this._getImageServerOptions(options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._imageServerParams.txt2ImgModel != model)
            {
                self._setImageModel(self._imageServerParams.txt2ImgModel);
            }
            self._continueTxt2ImgRequest(clientId, prompt, session, destStateVar);
        });
    }

    _continueTxt2ImgRequest(clientId, prompt, session, destStateVar)
    {
        const self = this;

        // Defaults
        const payload = {
            "enable_hr": false,
            "hr_scale" : 2,
            "hr_upscaler" : "Latent",
            "hr_second_pass_steps" : 0,
            "hr_resize_x": 0,
            "hr_resize_y": 0,
            "denoising_strength": 0.0,
            "firstphase_width": 0,
            "firstphase_height": 0,
            "prompt": "",
            "styles": [],
            "seed": -1,
            "subseed": -1,
            "subseed_strength": 0.0,
            "seed_resize_from_h": -1,
            "seed_resize_from_w": -1,
            "batch_size": 1,
            "n_iter": 1,
            "steps": 20,
            "cfg_scale": 7.0,
            "width": 512,
            "height": 512,
            "restore_faces": false,
            "tiling": false,
            "negative_prompt": "",
            "eta": 0,
            "s_churn": 0,
            "s_tmax": 0,
            "s_tmin": 0,
            "s_noise": 1,
            "override_settings": {},
            "override_settings_restore_afterwards": true,
            "sampler_name": "Euler a",
            "sampler_index": "Euler a",
            "script_name": null,
            "script_args": []
        };

        // Our params
        payload["prompt"] = prompt;
        payload["seed"] = 42;
        payload["cfg_scale"] = 9;   // 7?
        payload["steps"] = 40;
        payload["batch_size"] = 4;

        // Post request
        const urlParams = {
            host: this._imageServerParams.host,
            port: this._imageServerParams.port,
            path: "/sdapi/v1/txt2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function dummyResponse()
        {
            // Use placeholder images
            const imageByUuid = {};
            const numImagesExpected = payload["batch_size"] * payload["n_iter"];
            for (let i = 0; i < numImagesExpected; i++)
            {
                imageByUuid[crypto.randomUUID()] = randomChoice(self._placeholderImages);
            }
            session.receiveImageResponse(clientId, destStateVar, imageByUuid);
        }

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log("Error: Did not receive any images");
                        dummyResponse();
                    }
                    else
                    {
                        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                        const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                        const imageByUuid = {};

                        for (let i = 0; i < numImages; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                        }

                        // This should never happen but in case it does, pad with the first image
                        for (let i = numImages; i < numImagesExpected; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                        }

                        // Return
                        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                    }
                }
                catch (error)
                {
                    console.log("Error: Unable to parse response from image server");
                    dummyResponse();
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: txt2img request failed`);
            console.log(error);
            dummyResponse();
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    makeDepth2ImgRequest(clientId, params, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
            return;
        }

        const self = this;

        this._getImageServerOptions(options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._imageServerParams.depth2ImgModel != model)
            {
                self._setImageModel(self._imageServerParams.depth2ImgModel);
            }
            self._continueDepth2ImgRequest(clientId, params, session, destStateVar);
        });
    }

    _continueDepth2ImgRequest(clientId, params, session, destStateVar)
    {
        const self = this;

        // Defaults
        const payload = {
            "init_images": [ this._loadInputImage(params.image) ],
            "resize_mode": 0,
            "denoising_strength": 0.75,
            "mask_blur": 4,
            "inpainting_fill": 0,
            "inpaint_full_res": true,
            "inpaint_full_res_padding": 0,
            "inpainting_mask_invert": 0,
            "initial_noise_multiplier": 1,
            "prompt": "",
            "styles": [],
            "seed": -1,
            "subseed": -1,
            "subseed_strength": 0,
            "seed_resize_from_h": -1,
            "seed_resize_from_w": -1,
            "batch_size": 1,
            "n_iter": 1,
            "steps": 20,
            "cfg_scale": 7.0,
            "image_cfg_scale": 1.5,
            "width": 512,
            "height": 512,
            "restore_faces": false,
            "tiling": false,
            "negative_prompt": "",
            "eta": 0,
            "s_churn": 0,
            "s_tmax": 0,
            "s_tmin": 0,
            "s_noise": 1,
            "override_settings": {},
            "override_settings_restore_afterwards": true,
            "sampler_name": "Euler a",
            "sampler_index": "Euler a",
            "include_init_images": false,
            "script_name": null,
            "script_args": []
        };

        // Our params
        payload["prompt"] = params.prompt;
        payload["negative_prompt"] = params.negative_prompt;
        payload["seed"] = 585501288;
        payload["cfg_scale"] = 9;
        payload["denoising_strength"] = 0.9;
        payload["steps"] = 50;
        payload["batch_size"] = 1;
        payload["n_iter"] = 4;             // generate 4 images sequentially, which seems to yield more diverse results (https://github.com/CompVis/stable-diffusion/issues/218)
        payload["sampler_name"] = "DDIM",
        payload["sampler_index"] = "DDIM";  // this parameter is deprecated, supposedly
        payload["seed_resize_from_h"] = 0;
        payload["seed_resize_from_w"] = 0;
        payload["resize_mode"] = 0;

        // Post request
        const urlParams = {
            host: "127.0.0.1",
            port: 7860,
            path: "/sdapi/v1/img2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function dummyResponse()
        {
            // Use placeholder images
            const imageByUuid = {};
            const numImagesExpected = payload["batch_size"] * payload["n_iter"];
            for (let i = 0; i < numImagesExpected; i++)
            {
                imageByUuid[crypto.randomUUID()] = randomChoice(self._placeholderImages);
            }
            session.receiveImageResponse(clientId, destStateVar, imageByUuid);
        }

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log("Error: Did not receive any images");
                        dummyResponse();
                    }
                    else
                    {
                        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                        const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                        const imageByUuid = {};

                        for (let i = 0; i < numImages; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                        }

                        // This should never happen but in case it does, pad with the first image
                        for (let i = numImages; i < numImagesExpected; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                        }

                        // Return
                        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                    }
                }
                catch (error)
                {
                    console.log("Error: Unable to parse response from image server");
                    dummyResponse();
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: depth2img request failed`);
            console.log(error);
            dummyResponse();
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    makeSketch2ImgRequest(clientId, prompt, inputImageBase64, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping image response because no session for clientId=${clientId}`);
            return;
        }

        const self = this;

        this._getImageServerOptions(options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._imageServerParams.txt2ImgModel != model)
            {
                self._setImageModel(self._imageServerParams.txt2ImgModel);
            }
            self._continueSketch2ImgRequest(clientId, prompt, inputImageBase64, session, destStateVar);
        });
    }

    // Sketch2img is text2img/img2img plus ControlNet scribble mode
    _continueSketch2ImgRequest(clientId, prompt, inputImageBase64, session, destStateVar)
    {
        const self = this;

        // Defaults
        const payload = {
            "enable_hr": false,
            "hr_scale" : 2,
            "hr_upscaler" : "Latent",
            "hr_second_pass_steps" : 0,
            "hr_resize_x": 0,
            "hr_resize_y": 0,
            "denoising_strength": 0.0,
            "firstphase_width": 0,
            "firstphase_height": 0,
            "prompt": "",
            "styles": [],
            "seed": -1,
            "subseed": -1,
            "subseed_strength": 0.0,
            "seed_resize_from_h": -1,
            "seed_resize_from_w": -1,
            "batch_size": 1,
            "n_iter": 1,
            "steps": 20,
            "cfg_scale": 7.0,
            "width": 512,
            "height": 512,
            "restore_faces": false,
            "tiling": false,
            "negative_prompt": "",
            "eta": 0,
            "s_churn": 0,
            "s_tmax": 0,
            "s_tmin": 0,
            "s_noise": 1,
            "override_settings": {},
            "override_settings_restore_afterwards": true,
            "sampler_name": "Euler a",
            "sampler_index": "Euler a",
            "script_name": null,
            "script_args": []
        };

        // Our params
        payload["prompt"] = prompt;
        payload["seed"] = 42;
        payload["cfg_scale"] = 9;   // 7?
        payload["steps"] = 40;
        payload["batch_size"] = 4;
        payload["init_images"] = [ inputImageBase64 ];

        // ControlNet stuff
        payload["alwayson_scripts"] = {
            "controlnet": {
                "args": [
                    {
                        "input_image": inputImageBase64,
                        "mask": "",
                        "module": "invert (from white bg & black line)",    // images submitted as white background and black lines, need to invert them
                        "model": "control_v11p_sd15_scribble [d4ba51ff]",
                        "weight": 1.0,
                        "processor_res": 512,
                        "resize_mode": "Scale to Fit (Inner Fit)",
                        "lowvram": false,
                        "threshold_a": 0.0,
                        "threshold_b": 255.0,
                        "guidance": 1.0,
                        "guidance_start": 0.0,
                        "guidance_end": 1.0,
                        //"guessmode": false
                    },
                ]
            }
        };

        // Post request
        const urlParams = {
            host: this._imageServerParams.host,
            port: this._imageServerParams.port,
            path: "/sdapi/v1/txt2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function dummyResponse()
        {
            // Use placeholder images
            const imageByUuid = {};
            const numImagesExpected = payload["batch_size"] * payload["n_iter"];
            for (let i = 0; i < numImagesExpected; i++)
            {
                imageByUuid[crypto.randomUUID()] = randomChoice(self._placeholderImages);
            }
            session.receiveImageResponse(clientId, destStateVar, imageByUuid);
        }

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log("Error: Did not receive any images");
                        dummyResponse();
                    }
                    else
                    {
                        const numImagesExpected = payload["batch_size"] * payload["n_iter"];
                        const numImages = Math.min(responseObj["images"].length, numImagesExpected);
                        const imageByUuid = {};

                        for (let i = 0; i < numImages; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][i];
                        }

                        // This should never happen but in case it does, pad with the first image
                        for (let i = numImages; i < numImagesExpected; i++)
                        {
                            imageByUuid[crypto.randomUUID()] = responseObj["images"][0];
                        }

                        // Return
                        session.receiveImageResponse(clientId, destStateVar, imageByUuid);
                    }
                }
                catch (error)
                {
                    console.log("Error: Unable to parse response from image server");
                    dummyResponse();
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: sketch2img request failed`);
            console.log(error);
            dummyResponse();
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    _loadRequiredImageAssets()
    {
        const filepaths = [ "../assets/RickAstley.jpg", "../assets/Plissken2.jpg", "../assets/KermitPlissken.jpg", "../assets/SpaceFarley.jpg" ];
        this._placeholderImages = [];
        for (const filepath of filepaths)
        {
            const buffer = fs.readFileSync(filepath);
            const base64 = buffer.toString("base64");
            this._placeholderImages.push(base64);
        }
    }

    constructor(sessionById)
    {
        this._sessionById = sessionById;
        this._loadRequiredImageAssets();
    }
}

export
{
    ImageGenerator
}