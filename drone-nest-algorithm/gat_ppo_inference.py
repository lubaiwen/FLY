#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any

import torch

FLY2_ROOT = Path(os.environ.get("FLY2_ALGORITHM_ROOT", r"C:\Users\18443\Desktop\FLY2.0\FLY"))
ALGORITHM_ROOT = Path(os.environ.get("ALGORITHM_ROOT", Path(__file__).parent))
GAT_PPO_ROOT = ALGORITHM_ROOT / "gat_ppo"
SIMULATOR_ROOT = ALGORITHM_ROOT / "simulator"
DEFAULT_CHECKPOINT = GAT_PPO_ROOT / "checkpoints" / "best_model.pt"

sys.path.insert(0, str(GAT_PPO_ROOT))
sys.path.insert(0, str(SIMULATOR_ROOT.parent))

from a2c_ppo_acktr.model import GATPolicy  # noqa: E402
from simulator.env import DRONE_FEATURES, NEST_FEATURES  # noqa: E402


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    if math.isnan(value) or math.isinf(value):
        return low
    return max(low, min(high, value))


def number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def position(item: dict[str, Any]) -> tuple[float, float]:
    pos = item.get("position") if isinstance(item.get("position"), dict) else {}
    lng = number(pos.get("lng", item.get("longitude", item.get("lng"))))
    lat = number(pos.get("lat", item.get("latitude", item.get("lat"))))
    return lng, lat


def normalize_positions(items: list[dict[str, Any]]) -> dict[str, tuple[float, float]]:
    coords = [position(item) for item in items]
    lngs = [lng for lng, _ in coords]
    lats = [lat for _, lat in coords]
    min_lng, max_lng = (min(lngs), max(lngs)) if lngs else (0.0, 1.0)
    min_lat, max_lat = (min(lats), max(lats)) if lats else (0.0, 1.0)
    lng_span = max(max_lng - min_lng, 1e-9)
    lat_span = max(max_lat - min_lat, 1e-9)

    result = {}
    for item, (lng, lat) in zip(items, coords):
        item_id = str(item.get("drone_id") or item.get("nest_id") or item.get("id") or len(result))
        result[item_id] = (clamp((lng - min_lng) / lng_span), clamp((lat - min_lat) / lat_span))
    return result


def status_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).lower()


def is_available_nest(nest: dict[str, Any]) -> bool:
    status = nest.get("status")
    if status in (0, "0", "fault", "offline", "disabled"):
        return False
    capacity = int(number(nest.get("max_drones", nest.get("capacity", 2)), 2))
    occupied = int(number(nest.get("current_charging", nest.get("occupied", 0)), 0))
    return capacity > occupied


def drone_battery(drone: dict[str, Any]) -> float:
    raw = number(drone.get("battery", drone.get("current_battery", drone.get("battery_level", 100))), 100)
    if raw > 1:
        raw /= 100
    return clamp(raw)


def drone_features(drone: dict[str, Any], normalized: dict[str, tuple[float, float]], low_threshold: float) -> list[float]:
    drone_id = str(drone.get("drone_id") or drone.get("id") or "")
    x, y = normalized.get(drone_id, (0.0, 0.0))
    battery = drone_battery(drone)
    status = status_text(drone.get("status"))
    priority = clamp(number(drone.get("priority"), 1) / 5)
    idle = 1.0 if status in ("", "0", "idle", "available", "standby") or battery <= low_threshold else 0.0
    working = 1.0 if status in ("working", "mission", "flying", "2") else 0.0
    enroute = 1.0 if status in ("enroute", "dispatching") else 0.0
    waiting = 1.0 if status == "waiting" else 0.0
    charging = 1.0 if status in ("charging", "1") else 0.0
    failed = 1.0 if status in ("failed", "fault", "error") else 0.0
    deadline = clamp(number(drone.get("deadline"), 1800) / 3600)
    return [x, y, battery, idle, working, enroute, waiting, charging, failed, 1.0, 0.0, 0.0, priority, deadline, x, y]


def nest_features(nest: dict[str, Any], normalized: dict[str, tuple[float, float]], drone_count: int) -> list[float]:
    nest_id = str(nest.get("nest_id") or nest.get("id") or "")
    x, y = normalized.get(nest_id, (0.0, 0.0))
    available = 1.0 if is_available_nest(nest) else 0.0
    status = status_text(nest.get("status"))
    fault = 1.0 if status in ("0", "fault", "error") else 0.0
    offline = 1.0 if status in ("offline", "disabled") else 0.0
    capacity = max(1, int(number(nest.get("max_drones", nest.get("capacity", 2)), 2)))
    occupied = int(number(nest.get("current_charging", nest.get("occupied", 0)), 0))
    queue_length = int(number(nest.get("queue_length", 0), 0))
    charge_rate = number(nest.get("charge_rate", nest.get("charge_power", 0.004)), 0.004)
    return [
        x,
        y,
        available,
        fault,
        offline,
        clamp(capacity / 4),
        clamp(occupied / capacity),
        clamp(max(0, capacity - occupied) / capacity),
        clamp(queue_length / max(1, drone_count)),
        clamp(charge_rate / 0.006),
        clamp(number(nest.get("utilization_time"), 0) / 86400),
        clamp(number(nest.get("completed_charges"), 0) / max(1, drone_count)),
    ]


def build_observation(payload: dict[str, Any], num_drones: int, num_nests: int) -> tuple[list[float], list[str], list[str], list[list[int]]]:
    drones = payload.get("drones") or []
    nests = payload.get("nests") or []
    low_threshold = number(payload.get("low_battery_threshold"), 0.35)
    normalized = normalize_positions(drones + nests)

    drone_ids = [str(item.get("drone_id") or item.get("id") or f"D{i}") for i, item in enumerate(drones[:num_drones])]
    nest_ids = [str(item.get("nest_id") or item.get("id") or f"N{i}") for i, item in enumerate(nests[:num_nests])]

    d_features = [drone_features(item, normalized, low_threshold) for item in drones[:num_drones]]
    n_features = [nest_features(item, normalized, len(drones)) for item in nests[:num_nests]]

    d_features.extend([[0.0] * len(DRONE_FEATURES) for _ in range(num_drones - len(d_features))])
    n_features.extend([[0.0] * len(NEST_FEATURES) for _ in range(num_nests - len(n_features))])

    adjacency = []
    for drone_idx in range(num_drones):
        row = []
        for nest_idx in range(num_nests):
            valid = drone_idx < len(drone_ids) and nest_idx < len(nest_ids) and is_available_nest(nests[nest_idx])
            row.append(1 if valid else 0)
        adjacency.append(row)

    flat = [value for row in d_features for value in row]
    flat.extend(value for row in n_features for value in row)
    flat.extend(value for row in adjacency for value in row)
    return flat, drone_ids, nest_ids, adjacency


def load_policy(checkpoint_path: Path, device: torch.device) -> tuple[GATPolicy, dict[str, Any]]:
    checkpoint = torch.load(checkpoint_path, map_location=device)
    args = checkpoint.get("args", {})
    policy = GATPolicy(
        checkpoint.get("num_drones", 24),
        checkpoint.get("num_docks", checkpoint.get("num_nests", 8)),
        checkpoint.get("nfeat_drone", len(DRONE_FEATURES)),
        checkpoint.get("nfeat_dock", len(NEST_FEATURES)),
        args.get("hidden_size", 64),
        args.get("nheads", 4),
    )
    policy.load_state_dict(checkpoint["model_state_dict"])
    policy.to(device)
    policy.eval()
    return policy, checkpoint


def main() -> int:
    data = sys.stdin.read()
    if data.startswith('\ufeff'):
        data = data[1:]
    payload = json.loads(data)

    drones = payload.get("drones") or []
    nests = payload.get("nests") or []
    if not drones or not nests:
        print(json.dumps({"algorithm": "gat_ppo", "assignments": [], "warning": "empty_drones_or_nests"}, ensure_ascii=False))
        return 0

    checkpoint_path = Path(payload.get("checkpoint_path") or os.environ.get("GAT_PPO_CHECKPOINT", DEFAULT_CHECKPOINT))
    if not checkpoint_path.exists():
        print(json.dumps({"algorithm": "gat_ppo", "assignments": [], "error": f"checkpoint_not_found: {checkpoint_path}"}, ensure_ascii=False))
        return 1

    device = torch.device("cuda:0" if payload.get("cuda") and torch.cuda.is_available() else "cpu")
    policy, checkpoint = load_policy(checkpoint_path, device)
    num_drones = checkpoint.get("num_drones", policy.num_drones)
    num_nests = checkpoint.get("num_docks", policy.num_docks)
    flat, drone_ids, nest_ids, adjacency = build_observation(payload, num_drones, num_nests)

    obs = torch.tensor([flat], dtype=torch.float32, device=device)
    with torch.no_grad():
        _, actions, _, _ = policy.act(obs, None, None, deterministic=True)

    assignments = []
    used_capacity = {nest_id: 0 for nest_id in nest_ids}
    nest_by_id = {str(n.get("nest_id") or n.get("id") or f"N{i}"): n for i, n in enumerate(nests)}
    for drone_idx, nest_idx in enumerate(actions[0].tolist()[: len(drone_ids)]):
        if nest_idx >= len(nest_ids) or adjacency[drone_idx][nest_idx] == 0:
            continue
        nest_id = nest_ids[nest_idx]
        nest = nest_by_id.get(nest_id, {})
        capacity = int(number(nest.get("max_drones", nest.get("capacity", 2)), 2))
        occupied = int(number(nest.get("current_charging", nest.get("occupied", 0)), 0))
        if occupied + used_capacity[nest_id] >= capacity:
            continue
        used_capacity[nest_id] += 1
        assignments.append({"drone_id": drone_ids[drone_idx], "nest_id": nest_id, "score": 100 - len(assignments)})

    print(json.dumps({"algorithm": "gat_ppo", "assignments": assignments}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
