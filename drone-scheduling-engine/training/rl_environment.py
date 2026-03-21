import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from collections import deque
import random

from models import Drone, Nest, Position, DroneStatus
from models.gat_model import SpatialTemporalGraphBuilder
from config import settings


@dataclass
class State:
    drones: List[Drone]
    nests: List[Nest]
    graph_data: Data
    features: np.ndarray


@dataclass
class Action:
    drone_id: str
    nest_id: str


@dataclass
class Transition:
    state: State
    action: Action
    reward: float
    next_state: State
    done: bool


class ReplayBuffer:
    
    def __init__(self, capacity: int = 100000):
        self.buffer = deque(maxlen=capacity)
    
    def push(self, transition: Transition):
        self.buffer.append(transition)
    
    def sample(self, batch_size: int) -> List[Transition]:
        return random.sample(self.buffer, min(batch_size, len(self.buffer)))
    
    def __len__(self):
        return len(self.buffer)


class DroneSchedulingEnv:
    
    def __init__(
        self,
        num_drones: int = 50,
        num_nests: int = 20,
        max_steps: int = 1000,
        reward_weights: Dict[str, float] = None,
    ):
        self.num_drones = num_drones
        self.num_nests = num_nests
        self.max_steps = max_steps
        self.current_step = 0
        
        self.reward_weights = reward_weights or {
            "energy_efficiency": 1.0,
            "matching_quality": 0.5,
            "emergency_priority": 2.0,
            "load_balance": 0.3,
            "timeout_penalty": -0.5,
        }
        
        self.graph_builder = SpatialTemporalGraphBuilder()
        
        self.drones: List[Drone] = []
        self.nests: List[Nest] = []
        self.matchings: Dict[str, str] = {}
        self.behaviors: Dict = {}
        
        self._init_environment()
        
        self.action_space = num_drones * num_nests
        self.observation_dim = settings.gat.input_dim
    
    def _init_environment(self):
        from simulation import CityEnvironment, DroneFactory
        
        city_env = CityEnvironment(
            center_lat=settings.city.center_lat,
            center_lon=settings.city.center_lon,
            num_nests=self.num_nests,
        )
        city_env.generate_grid()
        self.nests = city_env.generate_nests(self.num_nests)
        
        num_fixed = self.num_drones // 3
        num_periodic = self.num_drones // 3
        num_emergency = self.num_drones - num_fixed - num_periodic
        
        self.drones, self.behaviors = DroneFactory.create_fleet(
            num_fixed_route=num_fixed,
            num_periodic=num_periodic,
            num_emergency=num_emergency,
            center_lat=settings.city.center_lat,
            center_lon=settings.city.center_lon,
        )
    
    def reset(self) -> State:
        self.current_step = 0
        self.matchings = {}
        
        for drone in self.drones:
            drone.energy = random.uniform(0.1, 0.4) * drone.max_energy
            drone.status = DroneStatus.IDLE
            drone.assigned_nest_id = None
        
        for nest in self.nests:
            for slot in nest.slots:
                slot.is_occupied = False
                slot.drone_id = None
        
        return self._get_state()
    
    def _get_state(self) -> State:
        graph_data = self.graph_builder.build_graph(self.drones, self.nests)
        features = self._extract_features()
        
        return State(
            drones=list(self.drones),
            nests=list(self.nests),
            graph_data=graph_data,
            features=features,
        )
    
    def _extract_features(self) -> np.ndarray:
        features = []
        
        for drone in self.drones:
            drone_features = [
                drone.position.lat,
                drone.position.lon,
                drone.energy / drone.max_energy,
                drone.speed / 30.0,
                drone.task_priority / 2.0,
                1.0 if drone.status == DroneStatus.IDLE else 0.0,
                1.0 if drone.assigned_nest_id else 0.0,
            ]
            features.extend(drone_features)
        
        for nest in self.nests:
            nest_features = [
                nest.position.lat,
                nest.position.lon,
                nest.available_slots() / nest.capacity,
                nest.demand_density,
                nest.historical_usage_rate,
            ]
            features.extend(nest_features)
        
        return np.array(features, dtype=np.float32)
    
    def step(self, action: Action) -> Tuple[State, float, bool, Dict]:
        self.current_step += 1
        
        reward = self._execute_action(action)
        self._update_simulation()
        next_state = self._get_state()
        done = self.current_step >= self.max_steps
        
        info = {
            "step": self.current_step,
            "matchings": len(self.matchings),
            "avg_energy": np.mean([d.energy / d.max_energy for d in self.drones]),
        }
        
        return next_state, reward, done, info
    
    def _execute_action(self, action: Action) -> float:
        drone = next((d for d in self.drones if d.id == action.drone_id), None)
        nest = next((n for n in self.nests if n.id == action.nest_id), None)
        
        if not drone or not nest:
            return self.reward_weights["timeout_penalty"]
        
        if not nest.is_available():
            return self.reward_weights["timeout_penalty"]
        
        if drone.assigned_nest_id:
            return self.reward_weights["timeout_penalty"]
        
        distance = drone.position.distance_to(nest.position)
        energy_cost = distance * drone.energy_consumption_rate
        
        if drone.energy < energy_cost:
            return self.reward_weights["timeout_penalty"]
        
        slot_idx = nest.occupy_slot(drone.id)
        if slot_idx is None:
            return self.reward_weights["timeout_penalty"]
        
        drone.assigned_nest_id = nest.id
        drone.energy -= energy_cost
        self.matchings[drone.id] = nest.id
        
        reward = self._calculate_reward(drone, nest, distance, energy_cost)
        
        return reward
    
    def _calculate_reward(
        self,
        drone: Drone,
        nest: Nest,
        distance: float,
        energy_cost: float,
    ) -> float:
        reward = 0.0
        
        energy_efficiency = 1.0 - (energy_cost / drone.max_energy)
        reward += self.reward_weights["energy_efficiency"] * energy_efficiency
        
        matching_quality = nest.demand_density * (1.0 + nest.available_slots() / nest.capacity)
        reward += self.reward_weights["matching_quality"] * matching_quality
        
        if drone.task_priority >= 1.5:
            reward += self.reward_weights["emergency_priority"]
        
        load_balance = 1.0 - abs(nest.available_slots() / nest.capacity - 0.5)
        reward += self.reward_weights["load_balance"] * load_balance
        
        return reward
    
    def _update_simulation(self):
        for drone in self.drones:
            if drone.assigned_nest_id:
                nest = next((n for n in self.nests if n.id == drone.assigned_nest_id), None)
                if nest:
                    distance = drone.position.distance_to(nest.position)
                    if distance < 50:
                        drone.energy = min(drone.max_energy, drone.energy + 500)
                        if drone.energy >= drone.max_energy * 0.9:
                            slot_id = next((s.slot_id for s in nest.slots if s.drone_id == drone.id), None)
                            if slot_id is not None:
                                nest.release_slot(slot_id)
                            drone.assigned_nest_id = None
            
            if not drone.assigned_nest_id:
                energy_drain = random.uniform(0.1, 0.5)
                drone.energy = max(0, drone.energy - energy_drain)
        
        for nest in self.nests:
            usage_rate = (nest.capacity - nest.available_slots()) / nest.capacity
            nest.historical_usage_rate = 0.9 * nest.historical_usage_rate + 0.1 * usage_rate
    
    def get_valid_actions(self) -> List[Action]:
        valid_actions = []
        
        for drone in self.drones:
            if drone.assigned_nest_id:
                continue
            
            if drone.remaining_energy_ratio() < 0.6:
                for nest in self.nests:
                    if nest.is_available():
                        distance = drone.position.distance_to(nest.position)
                        energy_needed = distance * drone.energy_consumption_rate
                        if drone.energy >= energy_needed:
                            valid_actions.append(Action(drone.id, nest.id))
        
        return valid_actions
    
    def render(self):
        print(f"\n=== Step {self.current_step} ===")
        print(f"Active matchings: {len(self.matchings)}")
        
        avg_energy = np.mean([d.energy / d.max_energy for d in self.drones])
        print(f"Average drone energy: {avg_energy:.2%}")
        
        available_slots = sum(n.available_slots() for n in self.nests)
        total_slots = sum(n.capacity for n in self.nests)
        print(f"Nest availability: {available_slots}/{total_slots}")
