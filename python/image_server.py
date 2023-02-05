#
# python/image_server.py
# Bart Trzynadlowski, 2023
#
# Main module for the image server. Image servers accept image generation requests over a TCP
# socket.
#

import argparse
import imageio
from PIL import Image
import os
from pathlib import Path

from .helpers import depth2img
from .helpers import txt2img


def load_image(url):
    data = imageio.imread(url, pilmode = "RGB")
    return Image.fromarray(data, mode = "RGB")


def get_next_output_series_number() -> int:
    """
    Returns
    -------
    int
        Next number to label image filenames with. Filenames should have the format out-n-*.png,
        where n is the series number that this function returns.
    """
    series_labels = [ os.path.basename(path).split("-")[1] for path in Path(options.output_dir).glob("out-*-*.png") ]
    series_numbers = []
    for label in series_labels:
        try:
            number = int(label)
            series_numbers.append(number)
        except:
            pass
    return 0 if len(series_numbers) == 0 else (max(series_numbers) + 1)


def run_server():
    raise NotImplementedError("Server mode not yet implemented")


def run_txt2img():
    assert options.prompt is not None, "--prompt required for depth2img mode"
    series_number = get_next_output_series_number()
    model, sampler = txt2img.initialize_model(sampler = "ddim", config = "python/stablediffusion/configs/stable-diffusion/v2-inference-v.yaml", ckpt = "sd_checkpoints/v2-1_768-ema-pruned.ckpt")
    results = txt2img.predict(
        model = model,
        sampler = sampler,
        prompt = options.prompt,
        negative_prompt = options.negative_prompt,
        steps = 50,
        batch_size = 3,
        num_samples = 3,
        scale = 9,
        seed = 42,
        eta = 0
    )
    for i in range(len(results)):
        output_filepath = os.path.join(options.output_dir, "out-%d-txt2img-%d.png" % (series_number, i))
        results[i].save(output_filepath)
        print("Wrote output image: %s" % output_filepath)


def run_depth2img():
    assert options.prompt is not None, "--prompt required for depth2img mode"
    assert options.negative_prompt is None, "--negative-prompt not yet supported in depth2img mode"
    assert options.input_image is not None, "--input-image required for depth2img mode"
    series_number = get_next_output_series_number()
    rgb_image = load_image(url = options.input_image)
    depth_sampler = depth2img.initialize_model(config = "python/stablediffusion/configs/stable-diffusion/v2-midas-inference.yaml", ckpt = "sd_checkpoints/512-depth-ema.ckpt")
    results = depth2img.predict(
        sampler = depth_sampler,
        input_image = rgb_image,
        input_depth = None,
        prompt = options.prompt,
        steps = 50,
        num_samples = 3*3,
        scale = 9,
        seed = 585501288,
        eta = 0,
        strength = 0.9
    )
    num_samples = len(results) - 1
    for i in range(num_samples):
      output_filepath = os.path.join(options.output_dir, "out-%d-depth2img-%d.png" % (series_number, i))
      results[1 + i].save(output_filepath)
      print("Wrote output image: %s" % output_filepath)


if __name__ == "__main__":
    parser = argparse.ArgumentParser("image_server")
    parser.add_argument("--mode", metavar = "mode", type = str, action = "store", default = "server", help = "Mode to run in ('server', 'depth2img', 'txt2img')")
    parser.add_argument("--prompt", metavar = "text", type = str, action = "store", help = "Prompt to use for command line image generation modes")
    parser.add_argument("--negative-prompt", metavar = "text", type = str, action = "store", help = "Negative prompt to use for command line image generation modes")
    parser.add_argument("--input-image", metavar = "filepath", type = str, action = "store", help = "Input image for modes that require it")
    parser.add_argument("--output-dir", metavar = "path", type = str, action = "store", default = "output", help = "Output directory to write generated images to")
    options = parser.parse_args()

    if options.mode == "server":
        run_server()
    elif options.mode == "depth2img":
        run_depth2img()
    elif options.mode == "txt2img":
        run_txt2img()
    else:
        raise RuntimeError("Unknown mode: %s" % options.mode)
