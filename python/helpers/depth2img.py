#
# python/helpers/depth2img.py
# Bart Trzynadlowski, 2023
#
# Stable Diffusion v2 depth2img functions: depth-conditioned image generation. The MiDaS model can
# be used to automatically infer depth but depth can also be supplied manually.
#
# TODO:
# -----
# - How is the midas model resolution chosen? Seems to involve 384 pixels on one side but still
#  unclear how the other side is computed.
#

import sys
import torch
import numpy as np
import gradio as gr
import imageio
import cv2
from PIL import Image
from omegaconf import OmegaConf
from einops import repeat, rearrange
from pytorch_lightning import seed_everything
from imwatermark import WatermarkEncoder

from scripts.txt2img import put_watermark
from ldm.util import instantiate_from_config
from ldm.models.diffusion.ddim import DDIMSampler
from ldm.data.util import AddMiDaS


torch.set_grad_enabled(False)


def initialize_model(config, ckpt):
    config = OmegaConf.load(config)
    model = instantiate_from_config(config.model)
    model.load_state_dict(torch.load(ckpt)["state_dict"], strict=False)

    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    model = model.to(device)
    sampler = DDIMSampler(model)
    return sampler


def get_depth_from_image(image: Image, depth_model, model_type = "dpt_hybrid"):
  device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
  image_data = np.array(image).astype(np.float32)
  image_in = torch.from_numpy(image_data).to(dtype = torch.float32) / 127.5 - 1.0
  midas = AddMiDaS(model_type = model_type)
  fake_batch = { "jpg": image_in }
  fake_batch = midas(fake_batch)  # transforms the data for use with MiDaS and adds it as a "midas_in" key
  midas_in = fake_batch["midas_in"]
  midas_in = np.expand_dims(midas_in, axis = 0) # from (channels, H, W) -> (1, channels, H, W)
  midas_in = torch.from_numpy(midas_in).to(device = device)
  midas_out = depth_model(midas_in)
  depth_min, depth_max = torch.amin(midas_out, dim=[1, 2, 3], keepdim=True), torch.amax(midas_out, dim=[1, 2, 3], keepdim=True)
  #print("DEPTH RANGE = [%f, %f]" % (depth_min, depth_max))
  display_depth = (midas_out - depth_min) / (depth_max - depth_min)
  depth_min, depth_max = torch.amin(display_depth, dim=[1, 2, 3], keepdim=True), torch.amax(display_depth, dim=[1, 2, 3], keepdim=True)
  #print("DEPTH RANGE = [%f, %f]" % (depth_min, depth_max))
  depth_image = Image.fromarray((display_depth[0, 0, ...].cpu().numpy() * 255.).astype(np.uint8))
  return depth_image


#TODO: what size should depth be? we should pad the same as image first and then scale as needed
def make_batch_sd(
        image,
        txt,
        device,
        num_samples=1,
        model_type="dpt_hybrid"
):
    image = np.array(image.convert("RGB"))
    image = torch.from_numpy(image).to(dtype=torch.float32) / 127.5 - 1.0
    # sample['jpg'] is tensor hwc in [-1, 1] at this point
    midas_trafo = AddMiDaS(model_type=model_type)
    batch = {
        "jpg": image,
        "txt": num_samples * [txt],
    }
    batch = midas_trafo(batch)
    batch["jpg"] = rearrange(batch["jpg"], 'h w c -> 1 c h w')
    batch["jpg"] = repeat(batch["jpg"].to(device=device),
                          "1 ... -> n ...", n=num_samples)
    batch["midas_in"] = repeat(torch.from_numpy(batch["midas_in"][None, ...]).to(
        device=device), "1 ... -> n ...", n=num_samples)
    return batch


def make_inverse_depth_batch(depth, resolution, num_samples, device):
  """
  Parameters
  ----------
  depth : np.ndarray
    Depth in range [0,1], with the same dimensions as the input image:
    (height, width).
  resolution : Tuple[int,int]
    New dimensions, (height, width), to resize to. These are the MiDaS
    output dimensions.
  num_samples : int
    Batch size.
  device : torch.device
    PyTorch device to use for resultant tensor.

  Returns
  -------
  torch.tensor
    A tensor of shape (num_samples, 1, height, width) of the inverse depth (1.0/depth, also
    in the range [0,1]).
  """
  assert len(resolution) == 2
  assert len(depth.shape) == 2
  height = resolution[0]
  width = resolution[1]
  depth = cv2.resize(depth, dsize = (width, height))  # resize height and width (cv2 expects sizes to be specified as (width,height) despite matrix still being laid out as (height,width))
  depth = np.expand_dims(depth, axis = 0)       # add channel dimension: (height, width) -> (1, height, width)
  depth = np.expand_dims(depth, axis = 0)       # add batch dimension: (1, 1, height, width)
  depth = torch.from_numpy(depth).to(dtype = torch.float32).to(device)
  depth = depth.repeat((num_samples, 1, 1, 1))  # create num_samples batches: (num_samples, 1, height, width)
  return 1.0 / (depth + 0.5)


def paint(sampler, image, depth, prompt, t_enc, seed, scale, num_samples=1, callback=None,
          do_full_sample=False):
    device = torch.device(
        "cuda") if torch.cuda.is_available() else torch.device("cpu")
    model = sampler.model
    seed_everything(seed)

    print("Creating invisible watermark encoder (see https://github.com/ShieldMnt/invisible-watermark)...")
    wm = "SDV2"
    wm_encoder = WatermarkEncoder()
    wm_encoder.set_watermark('bytes', wm.encode('utf-8'))

    with torch.no_grad(),\
            torch.autocast("cuda"):
        batch = make_batch_sd(
            image, txt=prompt, device=device, num_samples=num_samples)
        inverse_depth = None
        if depth is not None:
            inverse_depth = make_inverse_depth_batch(depth = depth, resolution = batch["midas_in"].shape[2:], num_samples = num_samples, device = device)
        z = model.get_first_stage_encoding(model.encode_first_stage(
            batch[model.first_stage_key]))  # move to latent space
        c = model.cond_stage_model.encode(batch["txt"])
        c_cat = list()
        for ck in model.concat_keys:
            cc = batch[ck]
            #print("depth_model(batch[ck]) -> ck=" + str(ck) + ", batch[ck].shape=" + str(cc.shape))
            if inverse_depth is not None:
              # Inverse depth provided, use it directly
              print("Using supplied depth")
              cc = inverse_depth
            else:
              # Use MiDaS output
              print("Using MiDaS depth")
              cc = model.depth_model(cc)

            depth_min, depth_max = torch.amin(cc, dim=[1, 2, 3], keepdim=True), torch.amax(cc, dim=[1, 2, 3],
                                                                                           keepdim=True)
            #print("DEPTH RANGE = [%f, %f]" % (depth_min, depth_max))
            display_depth = (cc - depth_min) / (depth_max - depth_min)
            depth_image = Image.fromarray(
                (display_depth[0, 0, ...].cpu().numpy() * 255.).astype(np.uint8))
            cc = torch.nn.functional.interpolate(
                cc,
                size=z.shape[2:],
                mode="bicubic",
                align_corners=False,
            )
            depth_min, depth_max = torch.amin(cc, dim=[1, 2, 3], keepdim=True), torch.amax(cc, dim=[1, 2, 3],
                                                                                           keepdim=True)
            cc = 2. * (cc - depth_min) / (depth_max - depth_min) - 1.
            c_cat.append(cc)
        c_cat = torch.cat(c_cat, dim=1)
        # cond
        cond = {"c_concat": [c_cat], "c_crossattn": [c]}

        # uncond cond
        uc_cross = model.get_unconditional_conditioning(num_samples, "")
        uc_full = {"c_concat": [c_cat], "c_crossattn": [uc_cross]}
        if not do_full_sample:
            # encode (scaled latent)
            z_enc = sampler.stochastic_encode(
                z, torch.tensor([t_enc] * num_samples).to(model.device))
        else:
            z_enc = torch.randn_like(z)
        # decode it
        samples = sampler.decode(z_enc, cond, t_enc, unconditional_guidance_scale=scale,
                                 unconditional_conditioning=uc_full, callback=callback)
        x_samples_ddim = model.decode_first_stage(samples)
        result = torch.clamp((x_samples_ddim + 1.0) / 2.0, min=0.0, max=1.0)
        result = result.cpu().numpy().transpose(0, 2, 3, 1) * 255
    return [depth_image] + [put_watermark(Image.fromarray(img.astype(np.uint8)), wm_encoder) for img in result]


def pad_image(input_image):
    pad_w, pad_h = np.max(((2, 2), np.ceil(
        np.array(input_image.size) / 64).astype(int)), axis=0) * 64 - input_image.size
    im_padded = Image.fromarray(
        np.pad(np.array(input_image), ((0, pad_h), (0, pad_w), (0, 0)), mode='edge'))
    #print("Before padding = " + str(input_image.size) + ", after padding = " + str(im_padded.size))
    return im_padded


def predict(sampler, input_image, input_depth, prompt, steps, num_samples, scale, seed, eta, strength):
    init_image = input_image.convert("RGB")
    image = pad_image(init_image)  # resize to integer multiple of 32

    sampler.make_schedule(steps, ddim_eta=eta, verbose=True)
    assert 0. <= strength <= 1., 'can only work with strength in [0.0, 1.0]'
    do_full_sample = strength == 1.
    t_enc = min(int(strength * steps), steps-1)
    result = paint(
        sampler=sampler,
        image=image,
        depth=input_depth,
        prompt=prompt,
        t_enc=t_enc,
        seed=seed,
        scale=scale,
        num_samples=num_samples,
        callback=None,
        do_full_sample=do_full_sample
    )
    return result