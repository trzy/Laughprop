# SDGame: Stable Diffusion Party Game for CVPR2023
*Copyright 2023 Bart Trzynadlowski and Steph Ng*

## Setup and Deployment

First, we want to install AUTOMATIC1111's [stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) and the [sd-webui-controlnet](https://github.com/Mikubill/sd-webui-controlnet) extensions. To do this:

- Create a Python environment (e.g., with conda) using the recommended Python version (currently 3.10.6 as of the time of this writing).
- Install [stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) by following its instructions.
- Install [sd-webui-controlnet](https://github.com/Mikubill/sd-webui-controlnet) from the Stable Diffusion web GUI, as detailed in its instructions. **This step can be skipped until ControlNet becomes required.**
- Install the depth-conditioned model weights.
  - Download `512-depth-ema.ckpt` [here](https://huggingface.co/stabilityai/stable-diffusion-2-depth/blob/main/512-depth-ema.ckpt) and place it in `stable-diffusion-webui/models/Stable-diffusion/`.
  - Copy `v2-midas-inference.yaml` from the Stable Diffusion Version 2 repository ([here](https://github.com/Stability-AI/stablediffusion/blob/main/configs/stable-diffusion/v2-midas-inference.yaml)), rename it to `512-depth-ema.yaml`, and place it in `stable-diffusion-webui/models/Stable-diffusion/` (alongside the checkpoint).
- Install the Python packages required to run our web server: `pip install -r requirements-min.txt`

Next, launch the Stable Diffusion web GUI with the API active (on Windows, edit `webui-user.bat` and add `--api` to `COMMANDLINE_ARGS`). It should serve from 127.0.0.1:7860.

Finally, run our web server directly from our repo:

```
python -m python.web_server
```

If you are having trouble getting the Stable Diffusion web GUI up or just want to test quickly with simulated images, start it like this:

```
python -m python.web_server --simulated-images
```
