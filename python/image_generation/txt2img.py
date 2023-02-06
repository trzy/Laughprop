#
# python/image_generation/txt2img.py
# Bart Trzynadlowski, 2023
#
# Stable Diffusion v2 txt2img functions.
#

import argparse, os
import cv2
import torch
import numpy as np
from omegaconf import OmegaConf
from PIL import Image
from tqdm import tqdm, trange
from itertools import islice
from einops import rearrange
from torchvision.utils import make_grid
from pytorch_lightning import seed_everything
from torch import autocast
from contextlib import nullcontext
from imwatermark import WatermarkEncoder

from ldm.util import instantiate_from_config
from ldm.models.diffusion.ddim import DDIMSampler
from ldm.models.diffusion.plms import PLMSSampler
from ldm.models.diffusion.dpm_solver import DPMSolverSampler

torch.set_grad_enabled(False)

def chunk(it, size):
    it = iter(it)
    return iter(lambda: tuple(islice(it, size)), ())


def initialize_model(sampler, config, ckpt, verbose=False):
    config = OmegaConf.load(config)
    print(f"Loading model from {ckpt}")
    pl_sd = torch.load(ckpt, map_location="cpu")
    if "global_step" in pl_sd:
        print(f"Global Step: {pl_sd['global_step']}")
    sd = pl_sd["state_dict"]
    model = instantiate_from_config(config.model)
    m, u = model.load_state_dict(sd, strict=False)
    if len(m) > 0 and verbose:
        print("missing keys:")
        print(m)
    if len(u) > 0 and verbose:
        print("unexpected keys:")
        print(u)

    model.cuda()
    model.eval()

    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    model = model.to(device)

    if sampler == "plms":
        sampler = PLMSSampler(model)
    elif sampler == "dpm":
        sampler = DPMSolverSampler(model)
    elif sampler == "ddim":
        sampler = DDIMSampler(model)
    else:
        raise ValueError("Invalid sampler: %s" % sampler)

    return model, sampler


def put_watermark(img, wm_encoder=None):
    if wm_encoder is not None:
        img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        img = wm_encoder.encode(img, 'dwtDct')
        img = Image.fromarray(img[:, :, ::-1])
    return img


def predict(model, sampler, prompt, negative_prompt, steps, batch_size, num_samples, scale, seed, eta):
    negative_prompt = "" if negative_prompt is None else negative_prompt

    C = 4       # latent channels
    f = 8       # downsample factor (most commonly 8 or 16)
    H = 768     # image height
    W = 768     # image width
    
    seed_everything(seed)

    print("Creating invisible watermark encoder (see https://github.com/ShieldMnt/invisible-watermark)...")
    wm = "SDV2"
    wm_encoder = WatermarkEncoder()
    wm_encoder.set_watermark('bytes', wm.encode('utf-8'))

    batch_size = num_samples
    data = [batch_size * [prompt]]

    start_code = None

    # Samples batch_size num_samples times to produce batch_size*num_samples images
    precision_scope = autocast # set to nullcontext for full precision
    with torch.no_grad(), \
        precision_scope("cuda"), \
        model.ema_scope():
            all_samples = list()
            for n in trange(num_samples, desc="Sampling"):
                for prompts in tqdm(data, desc="data"):
                    uc = None
                    if scale != 1.0:
                        uc = model.get_learned_conditioning(batch_size * [negative_prompt])
                    if isinstance(prompts, tuple):
                        prompts = list(prompts)
                    c = model.get_learned_conditioning(prompts)
                    shape = [C, H // f, W // f]
                    samples, _ = sampler.sample(S=steps,
                                                     conditioning=c,
                                                     batch_size=batch_size,
                                                     shape=shape,
                                                     verbose=False,
                                                     unconditional_guidance_scale=scale,
                                                     unconditional_conditioning=uc,
                                                     eta=eta,
                                                     x_T=start_code)

                    x_samples = model.decode_first_stage(samples)
                    x_samples = torch.clamp((x_samples + 1.0) / 2.0, min=0.0, max=1.0)

                    """
                    for x_sample in x_samples:
                        x_sample = 255. * rearrange(x_sample.cpu().numpy(), 'c h w -> h w c')
                        img = Image.fromarray(x_sample.astype(np.uint8))
                        img = put_watermark(img, wm_encoder)
                        img.save(os.path.join(sample_path, f"{base_count:05}.png"))
                        base_count += 1
                        sample_count += 1
                    """

                    all_samples.append(x_samples)

            # n_iter * num_samples samples exist to output
            images = []
            for samples in all_samples:
                for i in range(samples.shape[0]):
                    sample = samples[i]
                    pixels = 255. * rearrange(sample, 'c h w -> h w c').cpu().numpy()
                    image = Image.fromarray(pixels.astype(np.uint8))
                    images.append(image)
            return images