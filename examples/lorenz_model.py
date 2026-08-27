"""Lorenz attractor model for the Compute Experience authoring protocol."""

MANIFEST = {
    "id": "lorenz-attractor",
    "name": "Lorenz attractor",
    "description": "A deterministic chaotic system with an inspectable 3D trajectory.",
    "version": "0.1.0",
    "renderer": "trajectory-3d",
    "parameters": [
        {"id": "sigma", "label": "σ", "type": "number", "default": 10.0, "min": 0.0, "max": 30.0, "step": 0.1, "unit": ""},
        {"id": "rho", "label": "ρ", "type": "number", "default": 28.0, "min": 0.0, "max": 60.0, "step": 0.1, "unit": ""},
        {"id": "beta", "label": "β", "type": "number", "default": 8.0/3.0, "min": 0.1, "max": 10.0, "step": 0.01, "unit": ""}
    ],
    "state": ["x", "y", "z"],
    "derived": ["radius"],
}


def initial(parameters):
    return {"x": 1.0, "y": 1.0, "z": 1.0}


def step(state, parameters, dt):
    x, y, z = state["x"], state["y"], state["z"]
    sigma = float(parameters["sigma"])
    rho = float(parameters["rho"])
    beta = float(parameters["beta"])
    dx = sigma * (y - x)
    dy = x * (rho - z) - y
    dz = x * y - beta * z
    return {"x": x + dx * dt, "y": y + dy * dt, "z": z + dz * dt}


def derive(state, parameters):
    x, y, z = state["x"], state["y"], state["z"]
    return {"radius": (x*x + y*y + z*z) ** 0.5}
