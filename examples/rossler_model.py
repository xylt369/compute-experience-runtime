"""Rössler attractor model for the Compute Experience authoring protocol."""

MANIFEST = {
    "id": "rossler-attractor",
    "name": "Rössler attractor",
    "description": "A low-dimensional chaotic flow with a characteristic spiral-and-fold trajectory.",
    "version": "0.1.0",
    "renderer": "trajectory-3d",
    "parameters": [
        {"id": "a", "label": "a", "type": "number", "default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01, "unit": ""},
        {"id": "b", "label": "b", "type": "number", "default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01, "unit": ""},
        {"id": "c", "label": "c", "type": "number", "default": 5.7, "min": 1.0, "max": 12.0, "step": 0.1, "unit": ""}
    ],
    "state": ["x", "y", "z"],
    "derived": ["radius"],
}


def initial(parameters):
    return {"x": 0.1, "y": 0.0, "z": 0.0}


def step(state, parameters, dt):
    x, y, z = state["x"], state["y"], state["z"]
    a, b, c = float(parameters["a"]), float(parameters["b"]), float(parameters["c"])
    dx = -y - z
    dy = x + a * y
    dz = b + z * (x - c)
    return {"x": x + dx * dt, "y": y + dy * dt, "z": z + dz * dt}


def derive(state, parameters):
    x, y, z = state["x"], state["y"], state["z"]
    return {"radius": (x * x + y * y + z * z) ** 0.5}
