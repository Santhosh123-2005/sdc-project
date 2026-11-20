import io
import random
import cv2
import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional as F


IMAGE_SIZE = 128


class SqueezeExcitation(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        hidden_channels = max(channels // 8, 4)
        self.layers = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(channels, hidden_channels, kernel_size=1),
            nn.ReLU(inplace=False),
            nn.Conv2d(hidden_channels, channels, kernel_size=1),
            nn.Sigmoid(),
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return features * self.layers(features)


class AttentionCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()

        def block(input_channels: int, output_channels: int) -> nn.Sequential:
            return nn.Sequential(
                nn.Conv2d(input_channels, output_channels, kernel_size=3, padding=1, bias=False),
                nn.BatchNorm2d(output_channels),
                nn.ReLU(inplace=False),
                nn.MaxPool2d(kernel_size=2),
            )

        self.features = nn.Sequential(
            block(1, 32),
            block(32, 64),
            block(64, 128),
        )
        self.attention = SqueezeExcitation(128)
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(p=0.25),
            nn.Linear(128, 2),
        )

    @property
    def target_layer(self) -> nn.Module:
        return self.features[-1][0]

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        features = self.features(image)
        features = self.attention(features)
        return self.classifier(self.pool(features))


def decode_image(image_bytes: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(image_bytes)) as source:
        if source.width > 4096 or source.height > 4096:
            raise ValueError("Image dimensions exceed the accepted limit.")
        grayscale = np.asarray(source.convert("L"))
    if grayscale.size == 0:
        raise ValueError("Image is empty.")
    equalizer = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    return equalizer.apply(grayscale)


def preprocess_image(image_bytes: bytes) -> tuple[torch.Tensor, np.ndarray]:
    grayscale = decode_image(image_bytes)
    resized = cv2.resize(grayscale, (IMAGE_SIZE, IMAGE_SIZE), interpolation=cv2.INTER_AREA)
    normalized = (resized.astype(np.float32) / 255.0 - 0.5) / 0.5
    return torch.from_numpy(normalized).unsqueeze(0), resized


def training_tensor(image_bytes: bytes, augment: bool) -> torch.Tensor:
    tensor, _ = preprocess_image(image_bytes)
    if augment and random.random() < 0.5:
        tensor = torch.flip(tensor, dims=(2,))
    return tensor


def gradcam_plus_plus_png(
    model: AttentionCNN,
    image_tensor: torch.Tensor,
    original_image: np.ndarray,
    positive_class: bool,
) -> bytes:
    activations: list[torch.Tensor] = []
    gradients: list[torch.Tensor] = []
    forward_hook = model.target_layer.register_forward_hook(
        lambda *hook_args: activations.append(hook_args[2].detach())
    )
    gradient_hook = model.target_layer.register_full_backward_hook(
        lambda *hook_args: gradients.append(hook_args[2][0].detach())
    )

    try:
        model.zero_grad(set_to_none=True)
        logits = model(image_tensor)
        target_index = 1 if positive_class else 0
        logits[0, target_index].backward()
        feature_maps = activations[0]
        grads = gradients[0]
        squared = grads.pow(2)
        cubed = grads.pow(3)
        spatial_activation_sum = (feature_maps * cubed).sum(dim=(2, 3), keepdim=True)
        denominator = 2 * squared + spatial_activation_sum
        alpha = squared / (denominator + 1e-8)
        channel_weights = (alpha * F.relu(grads)).sum(dim=(2, 3), keepdim=True)
        heatmap = F.relu((channel_weights * feature_maps).sum(dim=1, keepdim=True))
        heatmap = F.interpolate(
            heatmap,
            size=(IMAGE_SIZE, IMAGE_SIZE),
            mode="bilinear",
            align_corners=False,
        )[0, 0]
        heatmap = heatmap.detach().cpu().numpy()
        maximum = float(heatmap.max())
        if maximum > 0:
            heatmap = heatmap / maximum
        colored = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
        source = cv2.cvtColor(
            cv2.resize(original_image, (IMAGE_SIZE, IMAGE_SIZE)),
            cv2.COLOR_GRAY2BGR,
        )
        overlay = cv2.addWeighted(source, 0.55, colored, 0.45, 0)
        success, encoded = cv2.imencode(".png", overlay)
        if not success:
            raise RuntimeError("Could not encode the Grad-CAM++ heatmap.")
        return encoded.tobytes()
    finally:
        forward_hook.remove()
        gradient_hook.remove()
