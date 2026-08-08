"""Bundled sample physics datasets with known ground-truth laws.

Each dataset is synthetic data generated from a real physical law plus mild
Gaussian noise, so the symbolic-regression pipeline can be validated by
checking whether it *rediscovers* the known law before being pointed at
open questions. Units are chosen so constants come out clean where possible.
"""

import numpy as np
import pandas as pd

from .db import register_dataset

RNG_SEED = 42
NOISE = 0.01  # 1% relative noise


def _noisy(y, rng):
    return y * (1.0 + rng.normal(0.0, NOISE, size=y.shape))


def build_all():
    rng = np.random.default_rng(RNG_SEED)

    # 1. Simple pendulum: T = 2*pi*sqrt(L/g), g = 9.81 m/s^2
    n = 400
    L = rng.uniform(0.1, 5.0, n)          # length, meters
    m = rng.uniform(0.1, 10.0, n)         # bob mass (kg) — deliberate distractor
    T = 2 * np.pi * np.sqrt(L / 9.81)
    register_dataset(
        "pendulum", "Simple Pendulum Period",
        "Period of a simple pendulum vs. length. Mass is included as a "
        "distractor variable — the true law does not depend on it.",
        "T", ["L", "m"],
        "T = 2*pi*sqrt(L/g) ≈ 2.006*sqrt(L)",
        pd.DataFrame({"L": L, "m": m, "T": _noisy(T, rng)}),
    )

    # 2. Kepler's third law: T^2 = a^3 (AU / years for the Sun)
    n = 400
    a = rng.uniform(0.3, 40.0, n)         # semi-major axis, AU
    T_orb = np.power(a, 1.5)              # orbital period, years
    register_dataset(
        "kepler", "Kepler's Third Law",
        "Orbital period vs. semi-major axis for bodies orbiting a solar-mass "
        "star (units: AU, years).",
        "T", ["a"],
        "T = a^(3/2)",
        pd.DataFrame({"a": a, "T": _noisy(T_orb, rng)}),
    )

    # 3. Ideal gas: P = n*R*T/V, R = 8.314
    n_pts = 500
    mol = rng.uniform(0.5, 5.0, n_pts)    # moles
    temp = rng.uniform(200.0, 500.0, n_pts)  # Kelvin
    vol = rng.uniform(0.01, 0.2, n_pts)   # m^3
    P = mol * 8.314 * temp / vol
    register_dataset(
        "ideal_gas", "Ideal Gas Law",
        "Pressure vs. moles, temperature, and volume (SI units).",
        "P", ["n", "T", "V"],
        "P = 8.314*n*T/V",
        pd.DataFrame({"n": mol, "T": temp, "V": vol, "P": _noisy(P, rng)}),
    )

    # 4. Newtonian gravitation (scaled units so G = 1): F = m1*m2 / r^2
    n_pts = 500
    m1 = rng.uniform(1.0, 100.0, n_pts)
    m2 = rng.uniform(1.0, 100.0, n_pts)
    r = rng.uniform(1.0, 50.0, n_pts)
    F = m1 * m2 / r**2
    register_dataset(
        "gravity", "Newtonian Gravitation (G=1 units)",
        "Gravitational force between two masses in scaled units where G = 1.",
        "F", ["m1", "m2", "r"],
        "F = m1*m2/r^2",
        pd.DataFrame({"m1": m1, "m2": m2, "r": r, "F": _noisy(F, rng)}),
    )

    # 5. Projectile range: R = v^2 * sin(2*theta) / g
    n_pts = 500
    v = rng.uniform(5.0, 60.0, n_pts)     # launch speed, m/s
    theta = rng.uniform(0.1, 1.47, n_pts) # launch angle, radians
    R = v**2 * np.sin(2 * theta) / 9.81
    register_dataset(
        "projectile", "Projectile Range",
        "Range of a projectile vs. launch speed and angle (no air resistance).",
        "R", ["v", "theta"],
        "R = v^2*sin(2*theta)/9.81",
        pd.DataFrame({"v": v, "theta": theta, "R": _noisy(R, rng)}),
    )
