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
 * image_generator.mjs
 * Bart Trzynadlowski, 2023
 *
 * Handles image generation requests.
 */

import crypto from "crypto";
import http from "http";
import fs from "fs";
import { randomChoice } from "./utils.mjs";

class Txt2ImgRequest
{
    // Common to all request objects
    clientId;
    session;
    destStateVar;
    batchSize = 4;
    numIterations = 1;

    // Server dispatch tracking
    imageServer;                        // image server currently being used for this request
    imageServersAttempted = new Set();  // attempted image servers (by ImageServer class) not to re-try again

    // Txt2img
    params;

    constructor(clientId, session, params, destStateVar)
    {
        this.clientId = clientId;
        this.session = session;

        this.params = params;
        this.destStateVar = destStateVar;
    }
}

class Depth2ImgRequest
{
    // Common to all request objects
    clientId;
    session;
    destStateVar;
    batchSize = 1;
    numIterations = 4;  // generate 4 images sequentially, which seems to yield more diverse results (https://github.com/CompVis/stable-diffusion/issues/218)

    // Server dispatch tracking
    imageServer;                        // image server currently being used for this request
    imageServersAttempted = new Set();  // attempted image servers (by ImageServer class) not to re-try again

    // Depth2Img
    params;

    constructor(clientId, session, params, destStateVar)
    {
        this.clientId = clientId;
        this.session = session;

        this.params = params;
        this.destStateVar = destStateVar;
    }
}

class Sketch2ImgRequest
{
    // Common to all request objects
    clientId;
    session;
    destStateVar;
    batchSize = 4;
    numIterations = 1;

    // Server dispatch tracking
    imageServer;                        // image server currently being used for this request
    imageServersAttempted = new Set();  // attempted image servers (by ImageServer class) not to re-try again

    // Sketch2Img
    prompt;
    inputImageBase64;

    constructor(clientId, session, prompt, inputImageBase64, destStateVar)
    {
        this.clientId = clientId;
        this.session = session;

        this.prompt = prompt;
        this.inputImageBase64 = inputImageBase64;
        this.destStateVar = destStateVar;
    }
}

class ImageServer
{
    host;
    port;
    imageRequestsPending = [];
    imageRequestInProgress = null;

    enqueue(imageRequest)
    {
        imageRequest.imageServer = this;
        imageRequest.imageServersAttempted.add(this);
        this.imageRequestsPending.push(imageRequest);
    }

    isBusy()
    {
        return this.imageRequestInProgress != null;
    }

    finishRequest(imageRequest)
    {
        if (this.imageRequestInProgress != imageRequest)
        {
            console.log(`Internal error: Finishing a request that is not in progress on ${this.host}:${this.port}`);
        }
        else
        {
            this.imageRequestInProgress = null;
        }
    }

    constructor(host, port)
    {
        this.host = host;
        this.port = port;
    }
}

class ImageGenerator
{
    _sessionById;   // reference to sessions table (session indexed by session ID)

    _placeholderImages = [];
    _inputImageByAssetPath = {};

    // Image servers (by default only a single local server)
    _imageServers = [ new ImageServer("127.0.0.1", 7860) ];
    _txt2ImgModel = "v1-5-pruned-emaonly.safetensors";
    _depth2ImgModel = "512-depth-ema.ckpt";


    makeTxt2ImgRequest(clientId, params, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping txt2img request because no session exists for clientId=${clientId}`);
            return;
        }

        // Initial request attempt
        const imageRequest = new Txt2ImgRequest(clientId, session, params, destStateVar);
        this._dispatchImageRequestToServer(imageRequest);
        this._tryProcessNextRequest();
    }

    makeDepth2ImgRequest(clientId, params, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping depth2img request because no session exists for clientId=${clientId}`);
            return;
        }

        const imageRequest = new Depth2ImgRequest(clientId, session, params, destStateVar);
        this._dispatchImageRequestToServer(imageRequest);
        this._tryProcessNextRequest();
    }

    makeSketch2ImgRequest(clientId, prompt, inputImageBase64, destStateVar)
    {
        const session = this._tryGetSessionByClientId(clientId);
        if (!session)
        {
            console.log(`Error: Dropping sketch2img request because no session exists for clientId=${clientId}`);
            return;
        }

        const imageRequest = new Sketch2ImgRequest(clientId, session, prompt, inputImageBase64, destStateVar);
        this._dispatchImageRequestToServer(imageRequest);
        this._tryProcessNextRequest();
    }

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

    _getImageServerOptions(imageRequest, onOptions)
    {
        const url = "http://" + imageRequest.imageServer.host + ":" + imageRequest.imageServer.port + "/sdapi/v1/options";
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
                    console.log(error);
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

    _setImageModel(imageRequest, model, onComplete)
    {
        console.log(`Setting image model: ${model}`);

        const options = {
            "sd_model_checkpoint": model
        };

        // Post
        const urlParams = {
            host: imageRequest.imageServer.host,
            port: imageRequest.imageServer.port,
            path: "/sdapi/v1/options",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        const request = http.request(urlParams, _ => onComplete());
        request.on("error", error =>
        {
            console.log(`Error: Model set request failed`);
            console.log(error);
            onComplete();
        });

        request.write(JSON.stringify(options));
        request.end();
    }

    _processTxt2ImgRequest(imageRequest)
    {
        imageRequest.imageServer.imageRequestInProgress = imageRequest;

        const self = this;

        this._getImageServerOptions(imageRequest, options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._txt2ImgModel != model)
            {
                self._setImageModel(imageRequest, self._txt2ImgModel, () => self._continueTxt2ImgRequest(imageRequest));
            }
            else
            {
                self._continueTxt2ImgRequest(imageRequest);
            }
        });
    }

    _continueTxt2ImgRequest(imageRequest)
    {
        const self = this;

        const clientId = imageRequest.clientId;
        const session = imageRequest.session;
        const params = imageRequest.params;
        const destStateVar = imageRequest.destStateVar;

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
        payload["prompt"] = params.prompt;
        payload["negative_prompt"] = params.negativePrompt;
        payload["seed"] = 42;
        payload["cfg_scale"] = 9;   // 7?
        // payload["steps"] = 40;
        payload["batch_size"] = imageRequest.batchSize;
        payload["n_iter"] = imageRequest.numIterations;

        // Post request
        const urlParams = {
            host: imageRequest.imageServer.host,
            port: imageRequest.imageServer.port,
            path: "/sdapi/v1/txt2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                let retry = false;
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log(`Error: Did not receive any images from ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                        retry = true;
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
                    console.log(`Error: Unable to parse response from image server ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                    console.log(error);
                    retry = true;
                }
                finally
                {
                    // Finish request!
                    imageRequest.imageServer.finishRequest(imageRequest);
                    setTimeout(() => self._tryProcessNextRequest(), 0);
                }

                if (retry)
                {
                    self._dispatchImageRequestToServer(imageRequest);
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: txt2img request failed on ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
            console.log(error);

            // Finish request and dispatch again
            imageRequest.imageServer.finishRequest(imageRequest);
            self._dispatchImageRequestToServer(imageRequest);   // try next
            setTimeout(() => self._tryProcessNextRequest(), 0);
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    _processDepth2ImgRequest(imageRequest)
    {
        imageRequest.imageServer.imageRequestInProgress = imageRequest;

        const self = this;

        this._getImageServerOptions(imageRequest, options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._depth2ImgModel != model)
            {
                self._setImageModel(imageRequest, self._depth2ImgModel, () => self._continueDepth2ImgRequest(imageRequest));
            }
            else
            {
                self._continueDepth2ImgRequest(imageRequest);
            }
        });
    }

    _continueDepth2ImgRequest(imageRequest)
    {
        const self = this;

        const clientId = imageRequest.clientId;
        const session = imageRequest.session;
        const params = imageRequest.params;
        const destStateVar = imageRequest.destStateVar;

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
        payload["negative_prompt"] = params.negativePrompt;
        payload["seed"] = 585501288;
        payload["cfg_scale"] = 9;
        payload["denoising_strength"] = 0.9;
        // payload["steps"] = 50;
        payload["batch_size"] = imageRequest.batchSize;
        payload["n_iter"] = imageRequest.numIterations;
        payload["sampler_name"] = "DDIM",
        payload["sampler_index"] = "DDIM";  // this parameter is deprecated, supposedly
        payload["seed_resize_from_h"] = 0;
        payload["seed_resize_from_w"] = 0;
        payload["resize_mode"] = 0;

        // Post request
        const urlParams = {
            host: imageRequest.imageServer.host,
            port: imageRequest.imageServer.port,
            path: "/sdapi/v1/img2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                let retry = false;
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log(`Error: Did not receive any images from ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                        retry = true;
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
                    console.log(`Error: Unable to parse response from image server ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                    console.log(error);
                    retry = true;
                }
                finally
                {
                    // Finish request!
                    imageRequest.imageServer.finishRequest(imageRequest);
                    setTimeout(() => self._tryProcessNextRequest(), 0);
                }

                if (retry)
                {
                    self._dispatchImageRequestToServer(imageRequest);
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: depth2img request failed on ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
            console.log(error);

            // Finish request and dispatch again
            imageRequest.imageServer.finishRequest(imageRequest);
            self._dispatchImageRequestToServer(imageRequest);   // try next
            setTimeout(() => self._tryProcessNextRequest(), 0);
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    _processSketch2ImgRequest(imageRequest)
    {
        imageRequest.imageServer.imageRequestInProgress = imageRequest;

        const self = this;

        this._getImageServerOptions(imageRequest, options =>
        {
            const model = options["sd_model_checkpoint"];
            if (self._txt2ImgModel != model)
            {
                self._setImageModel(imageRequest, self._txt2ImgModel, () => self._continueSketch2ImgRequest(imageRequest));
            }
            else
            {
                self._continueSketch2ImgRequest(imageRequest);
            }
        });
    }

    // Sketch2img is text2img/img2img plus ControlNet scribble mode
    _continueSketch2ImgRequest(imageRequest)
    {
        const self = this;

        const clientId = imageRequest.clientId;
        const session = imageRequest.session;
        const prompt = imageRequest.prompt;
        const inputImageBase64 = imageRequest.inputImageBase64;
        const destStateVar = imageRequest.destStateVar;

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
        // payload["steps"] = 40;
        payload["batch_size"] = imageRequest.batchSize;
        payload["n_iter"] = imageRequest.numIterations;
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
            host: imageRequest.imageServer.host,
            port: imageRequest.imageServer.port,
            path: "/sdapi/v1/txt2img",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        };

        function onResponse(response)
        {
            let data = "";
            response.on("data", (chunk) =>
            {
                data += chunk;
            });
            response.on("end", () =>
            {
                let retry = false;
                try
                {
                    const responseObj = JSON.parse(data);
                    if (!responseObj["images"])
                    {
                        console.log(`Error: Did not receive any images from ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                        retry = true;
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
                    console.log(`Error: Unable to parse response from image server ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
                    console.log(error);
                    retry = true;
                }
                finally
                {
                    // Finish request!
                    imageRequest.imageServer.finishRequest(imageRequest);
                    setTimeout(() => self._tryProcessNextRequest(), 0);
                }

                if (retry)
                {
                    self._dispatchImageRequestToServer(imageRequest);
                }
            });
        }

        const request = http.request(urlParams, onResponse);
        request.on("error", error =>
        {
            console.log(`Error: sketch2img request failed on ${imageRequest.imageServer.host}:${imageRequest.imageServer.port}`);
            console.log(error);

            // Finish request and dispatch again
            imageRequest.imageServer.finishRequest(imageRequest);
            self._dispatchImageRequestToServer(imageRequest);   // try next
            setTimeout(() => self._tryProcessNextRequest(), 0);
        });
        request.write(JSON.stringify(payload));
        request.end();
    }

    _dispatchImageRequestToServer(imageRequest)
    {
        // Sort image servers in ascending order of queue size
        const imageServers = this._imageServers.slice();
        imageServers.sort((a, b) => a.imageRequestsPending.length - b.imageRequestsPending.length);

        // Sanity check: ensure no server already has this image request
        for (const imageServer of imageServers)
        {
            if (imageServer.imageRequestInProgress == imageRequest || imageServer.imageRequestsPending.includes(imageRequest))
            {
                console.log(`Internal error: Request already pending for ${imageServer.host}:${imageServer.port}`);
                return;
            }
        }

        // Find the first server that has not yet been attempted for this image request
        for (const imageServer of imageServers)
        {
            if (!imageRequest.imageServersAttempted.has(imageServer))
            {
                // Found a server we have not yet tried. Dispatch to it.
                imageServer.enqueue(imageRequest);
                console.log(`Dispatched request to: ${imageServer.host}:${imageServer.port}`);
                return;
            }
        }

        console.log(`Error: Image request failed across all servers`)

        // Dummy response using placeholder images
        const imageByUuid = {};
        const numImagesExpected = imageRequest.batchSize * imageRequest.numIterations;
        for (let i = 0; i < numImagesExpected; i++)
        {
            imageByUuid[crypto.randomUUID()] = randomChoice(this._placeholderImages);
        }
        imageRequest.session.receiveImageResponse(imageRequest.clientId, imageRequest.destStateVar, imageByUuid);
    }

    _tryProcessNextRequest()
    {
        console.log("Checking for pending image requests...");
        for (const imageServer of this._imageServers)
        {
            console.log(`  ${imageServer.host}:${imageServer.port}: ${imageServer.imageRequestsPending.length} pending, in_progress=${imageServer.isBusy()}`);

            if (imageServer.isBusy() || imageServer.imageRequestsPending.length <= 0)
            {
                continue;
            }

            const imageRequest = imageServer.imageRequestsPending.shift();

            if (imageRequest instanceof Txt2ImgRequest)
            {
                this._processTxt2ImgRequest(imageRequest);
            }
            else if (imageRequest instanceof Depth2ImgRequest)
            {
                this._processDepth2ImgRequest(imageRequest);
            }
            else if (imageRequest instanceof Sketch2ImgRequest)
            {
                this._processSketch2ImgRequest(imageRequest);
            }
            else
            {
                console.log(`Error: Ignoring unknown image request object`);
            }
        }

        console.log("Finished checking");
        for (const imageServer of this._imageServers)
        {
            console.log(`  ${imageServer.host}:${imageServer.port}: ${imageServer.imageRequestsPending.length} pending, in_progress=${imageServer.isBusy()}`);
        }
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

    constructor(sessionById, useLocalImageServer)
    {
        if (!useLocalImageServer)
        {
            // Use up to 4 different servers
            this._imageServers = [
                new ImageServer("sdgame1.steph.ng", 80),
                new ImageServer("sdgame2.steph.ng", 80),
                new ImageServer("sdgame3.steph.ng", 80),
                new ImageServer("ai.steph.ng", 80),
            ];
        }

        console.log("Image servers:");
        for (const imageServer of this._imageServers)
        {
            console.log(`  ${imageServer.host}:${imageServer.port}`);
        }

        this._sessionById = sessionById;
        this._loadRequiredImageAssets();
    }
}

export
{
    ImageGenerator
}
